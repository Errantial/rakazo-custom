// @vitest-environment jsdom

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MotionSpinner } from "../components/motion-spinner";
import { NativeActionButton } from "../components/native-action-button";

const display = vi.hoisted(() => ({ mode: "eink" as "eink" | "standard" }));

vi.mock("./display-mode", () => ({
  useDisplayMode: () => display.mode,
  getCachedDisplayMode: () => display.mode,
}));
vi.mock("./native", () => ({
  useMobileTokens: () => new Proxy({}, { get: () => "#000000" }),
  native: {},
}));
vi.mock("react-native", () => ({
  Platform: { OS: "android" },
  ActivityIndicator: () => <i data-spinner />,
  Pressable: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("../components/native-symbol", () => ({ NativeSymbol: () => null }));

describe("e-ink busy states", () => {
  it("shows a still ellipsis instead of a spinner", () => {
    display.mode = "eink";
    const html = renderToStaticMarkup(<MotionSpinner />);
    expect(html).not.toContain("data-spinner");
    expect(html).toContain("…");
  });

  it("keeps the spinner in standard mode", () => {
    display.mode = "standard";
    expect(renderToStaticMarkup(<MotionSpinner />)).toContain("data-spinner");
  });

  it("marks a busy button with an ellipsis in e-ink and keeps the spinner otherwise", () => {
    display.mode = "eink";
    expect(
      renderToStaticMarkup(<NativeActionButton label="Send" busy onPress={() => {}} />),
    ).toContain("Send…");
    display.mode = "standard";
    const html = renderToStaticMarkup(<NativeActionButton label="Send" busy onPress={() => {}} />);
    expect(html).toContain("data-spinner");
    expect(html).not.toContain("Send");
  });
});
