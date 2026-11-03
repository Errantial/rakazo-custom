// @vitest-environment jsdom

import type { MermaidDiagramProps } from "@rakazo/chat-ui/native";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

const loaded = vi.hoisted(() => ({ count: 0 }));

// Loading this module stands in for pulling in react-native-webview.
vi.mock("../components/mermaid-diagram", () => {
  loaded.count += 1;
  return { MermaidDiagram: () => "diagram" };
});

it("loads the WebView diagram only when a diagram renders", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const { LazyMermaidDiagram } = await import("../components/mermaid-diagram-lazy");
  expect(loaded.count).toBe(0);

  const container = document.createElement("div");
  const root = createRoot(container);
  const props = { source: "graph TD", fallback: "code" } as unknown as MermaidDiagramProps;
  await act(async () => root.render(<LazyMermaidDiagram {...props} />));
  await act(async () => {});

  expect(loaded.count).toBe(1);
  expect(container.textContent).toBe("diagram");
  act(() => root.unmount());
  vi.unstubAllGlobals();
});
