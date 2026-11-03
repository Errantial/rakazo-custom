import type { MermaidDiagramProps } from "@rakazo/chat-ui/native";
import { lazy, Suspense } from "react";

// Defer react-native-webview until a thread actually shows a diagram.
const MermaidDiagram = lazy(() =>
  import("./mermaid-diagram").then((m) => ({ default: m.MermaidDiagram })),
);

/** Shows the code block while the WebView diagram loads, same as while it draws. */
export function LazyMermaidDiagram(props: MermaidDiagramProps) {
  return (
    <Suspense fallback={props.fallback}>
      <MermaidDiagram {...props} />
    </Suspense>
  );
}
