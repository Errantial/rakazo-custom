// Light home of the contexts the app root provides, so it can import them without
// loading the markdown renderer and its syntax highlighter at startup.
import type { ColorTokens, ResolvedAppearance } from "@rakazo/ui-tokens";
import type { ComponentType, ReactNode } from "react";
import { createContext } from "react";

export type { LinkFavicons } from "./markdown";
export { LinkFaviconsContext, RemoteImagesContext } from "./markdown";
export { MarkdownLinkPromptProvider } from "./markdown-link-prompt";

export type MermaidDiagramProps = {
  source: string;
  palette: ColorTokens;
  colorScheme: ResolvedAppearance;
  /** The code block, for the app to show while the diagram draws or when it cannot. */
  fallback: ReactNode;
};

/**
 * Draws a ```mermaid fence. Mermaid needs a browser engine, so the app supplies the drawing
 * (a WebView); without one, a fence stays a code block.
 */
export const MermaidDiagramContext = createContext<ComponentType<MermaidDiagramProps> | null>(null);

/**
 * The app's control for copying a code block, given the code exactly as written. Without one,
 * code blocks have no copy control.
 */
export const CodeCopyButtonContext = createContext<ComponentType<{ code: string }> | null>(null);
