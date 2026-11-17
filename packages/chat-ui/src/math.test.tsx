// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatMarkdown } from "./markdown.web";
import { normalizeMathDelimiters } from "./math";

describe("normalizeMathDelimiters", () => {
  it("escapes currency but keeps inline math", () => {
    expect(normalizeMathDelimiters("It costs $5 and $10.")).toBe("It costs \\$5 and \\$10.");
    expect(normalizeMathDelimiters("From $5-$10.\n\nLet $x$ be")).toBe(
      "From \\$5-\\$10.\n\nLet $x$ be",
    );
  });

  it("converts LaTeX delimiters", () => {
    expect(normalizeMathDelimiters("a \\( x^2 \\) b \\[y\\]")).toBe("a $x^2$ b $$y$$");
  });

  it("leaves code alone", () => {
    const code = "```sh\necho $HOME \\(x\\)\n```\nUse `$PATH` or `\\(a\\)`";
    expect(normalizeMathDelimiters(code)).toBe(code);
  });
});

describe("web markdown math", () => {
  it("renders inline and display math with KaTeX", () => {
    const html = renderToStaticMarkup(
      <ChatMarkdown>{"Energy $E=mc^2$.\n\n$$\\int_0^1 x^2\\,dx$$"}</ChatMarkdown>,
    );
    expect(html).toContain('class="katex"');
    expect(html).toContain("katex-display");
    expect(html).not.toContain("$E=mc^2$");
  });

  it("keeps currency and code as text", () => {
    const html = renderToStaticMarkup(
      <ChatMarkdown>{"Pay $5 and $10. Run `echo $x$`."}</ChatMarkdown>,
    );
    expect(html).not.toContain("katex");
    expect(html).toContain("Pay $5 and $10.");
    expect(html).toContain("<code>echo $x$</code>");
  });

  it("does not throw on unclosed math while streaming", () => {
    const html = renderToStaticMarkup(
      <ChatMarkdown streaming>{"Partial $$\\frac{1}{"}</ChatMarkdown>,
    );
    expect(html).toContain("rk-chat-markdown");
  });
});
