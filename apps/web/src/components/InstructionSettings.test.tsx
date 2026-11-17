// @vitest-environment jsdom
import type { Bot } from "@rakazo/contracts";
import type { ReactNode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  restoreInstructions: vi.fn(),
  applyCharacterCard: vi.fn(),
  update: vi.fn(),
}));
vi.mock("../lib/rpc", () => ({ rpc: { bots: api } }));
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
  useLingui: () => ({ t: (parts: TemplateStringsArray) => parts.join("") }),
}));

import { InstructionSettings } from "./InstructionSettings";

it("keeps history behind its label action and restores with the current baseline", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const bot = {
    id: "fixture",
    instructions: "Current",
    instructionHistory: [
      {
        id: "version",
        instructions: "Earlier",
        createdAt: "2026-10-01T00:00:00Z",
        reason: "Manual edit",
      },
    ],
  } as Bot;
  api.restoreInstructions.mockResolvedValue({ ...bot, instructions: "Earlier" });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<InstructionSettings bot={bot} />));
    expect(document.body.textContent).not.toContain("Manual edit");
    await act(async () =>
      host.querySelector<HTMLButtonElement>('[aria-label="Instruction history"]')!.click(),
    );
    expect(document.body.textContent).toContain("Manual edit");
    await act(async () =>
      [...document.body.querySelectorAll("button")]
        .find((button) => button.textContent === "Restore")!
        .click(),
    );
    expect(api.restoreInstructions).toHaveBeenCalledWith({
      botId: "fixture",
      versionId: "version",
      expectedInstructions: "Current",
    });
    expect(host.querySelector("textarea")?.value).toBe("Earlier");
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});

async function renderSettings(bot: Bot) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(<InstructionSettings bot={bot} />));
  return {
    host,
    async cleanup() {
      await act(async () => root.unmount());
      host.remove();
      vi.unstubAllGlobals();
    },
  };
}

async function chooseFile(host: HTMLElement, content: string) {
  const file = new File([content], "card.json", { type: "application/json" });
  Object.defineProperty(file, "arrayBuffer", {
    configurable: true,
    value: async () => new TextEncoder().encode(content).buffer,
  });
  const input = host.querySelector<HTMLInputElement>('[data-testid="instruction-settings-card"]')!;
  await act(async () => {
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

it("replaces the profile from a character card against the current instructions", async () => {
  const bot = { id: "fixture", name: "Mal0", instructions: "Current", turnReminder: "" } as Bot;
  const card = { name: "Mal0", description: "New canon.", post_history_instructions: "Stay." };
  api.applyCharacterCard.mockResolvedValue({
    ...bot,
    instructions: "## Canon\n\nNew canon.",
    turnReminder: "Stay.",
  });
  const { host, cleanup } = await renderSettings(bot);
  try {
    await chooseFile(host, JSON.stringify(card));

    expect(api.applyCharacterCard).toHaveBeenCalledWith({
      botId: "fixture",
      characterCard: card,
      expectedInstructions: "Current",
    });
    const [instructions, reminder] = host.querySelectorAll("textarea");
    expect(instructions?.value).toBe("## Canon\n\nNew canon.");
    expect(reminder?.value).toBe("Stay.");
  } finally {
    await cleanup();
  }
});

it("says a file holds no card and sends nothing", async () => {
  api.applyCharacterCard.mockClear();
  const { host, cleanup } = await renderSettings({
    id: "fixture",
    name: "Mal0",
    instructions: "Current",
  } as Bot);
  try {
    await chooseFile(host, JSON.stringify({ hello: "world" }));

    expect(host.textContent).toContain("No character card found in this file");
    expect(api.applyCharacterCard).not.toHaveBeenCalled();
  } finally {
    await cleanup();
  }
});
