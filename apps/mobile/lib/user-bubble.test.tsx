// @vitest-environment jsdom

import type { ChildBotBlock } from "@rakazo/core";
import type { ColorTokens } from "@rakazo/ui-tokens";
import { tokensForDisplay } from "@rakazo/ui-tokens";
import type { ReactNode } from "react";
import { act, createElement, useContext } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageMentions } from "../components/bot-mention";
import { MessageMentionsContext } from "./message-mentions";
import type { UserBubble } from "./user-bubble";
import { useUserBubbleTokens } from "./user-bubble";

vi.mock("react-native", () => ({ Text: "span", View: "div" }));
vi.mock("./display-mode", () => ({ mobileBotColor: (color: string) => color }));
vi.mock("../components/bot-avatar", () => ({ BotAvatar: () => null }));
vi.mock("../components/native-symbol", () => ({ NativeSymbol: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
});

function mount() {
  const container = document.createElement("div");
  root = createRoot(container);
  const current = root;
  return {
    render: (next: ReactNode) => act(() => current.render(next)),
  };
}

describe("useUserBubbleTokens", () => {
  const seen: ColorTokens[] = [];
  function Probe({ base, bubble }: { base: ColorTokens; bubble: UserBubble | undefined }) {
    seen.push(useUserBubbleTokens(base, bubble));
    return null;
  }
  const bubble: UserBubble = { background: "#123456", foreground: "#ffffff" };
  const light = tokensForDisplay("light", "standard");

  it("keeps one palette across re-renders and repaints when the palette or bubble changes", () => {
    seen.length = 0;
    const view = mount();
    view.render(createElement(Probe, { base: light, bubble }));
    view.render(createElement(Probe, { base: light, bubble }));
    expect(seen[1]).toBe(seen[0]);
    expect(seen[0]).toMatchObject({ chatUser: "#123456", chatUserForeground: "#ffffff" });

    const repaints = [
      { base: tokensForDisplay("dark", "standard"), bubble },
      { base: tokensForDisplay("light", "eink"), bubble },
      { base: light, bubble },
      { base: light, bubble: { ...bubble, background: "#654321" } },
    ];
    for (const next of repaints) {
      const before = seen.at(-1);
      view.render(createElement(Probe, next));
      expect(seen.at(-1)).not.toBe(before);
    }
    expect(seen.at(-1)?.chatUser).toBe("#654321");
    expect(seen.at(-1)?.muted).toBe(light.muted);
  });

  it("hands the base palette back without a bubble", () => {
    seen.length = 0;
    mount().render(createElement(Probe, { base: light, bubble: undefined }));
    expect(seen[0]).toBe(light);
  });
});

describe("MessageMentions", () => {
  const mention: ChildBotBlock = {
    kind: "child_bot",
    botId: "bot-1",
    name: "Ada",
    status: "created",
  };
  const light = tokensForDisplay("light", "standard");
  const renderers: unknown[] = [];
  function Reader() {
    renderers.push(useContext(MessageMentionsContext));
    return null;
  }
  const props = {
    mentions: [mention],
    colorOf: () => "#ff0000",
    tokens: light,
    onOpenBot: () => undefined,
  };

  it("keeps its render function until a real input changes", () => {
    renderers.length = 0;
    const view = mount();
    const tree = (overrides: Partial<typeof props> = {}) => (
      <MessageMentions {...props} {...overrides}>
        <Reader />
      </MessageMentions>
    );
    view.render(tree());
    view.render(tree());
    expect(renderers[1]).toBe(renderers[0]);
    view.render(tree({ tokens: tokensForDisplay("dark", "standard") }));
    expect(renderers[2]).not.toBe(renderers[1]);
    view.render(tree({ colorOf: () => "#00ff00" }));
    expect(renderers[3]).not.toBe(renderers[2]);
  });
});
