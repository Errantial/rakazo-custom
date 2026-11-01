import { once } from "node:events";
import { createServer } from "node:http";
import type { AgentRuntimeEvent, AgentToolExecutionObserver } from "@rakazo/adapter-kit";
import { expect, it } from "vitest";
import { PiAgentRuntime } from "./pi-runtime.js";
import { LATE_SHELL_OUTPUT_GUIDANCE } from "./shell-command-stream.js";

function chunk(delta: Record<string, unknown>, finishReason: string | null = null) {
  return `data: ${JSON.stringify({
    id: "fixture",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })}\n\n`;
}

/** Content chunks for one assistant message; the last one stops it. */
function textReply(parts: string[]) {
  return parts
    .map((content, index) =>
      chunk(
        index === 0 ? { role: "assistant", content } : { content },
        index === parts.length - 1 ? "stop" : null,
      ),
    )
    .join("");
}

/**
 * The bot starts a background shell, replies, then gets the finished output and
 * answers it with `lateReply`. Returns model calls, request bodies and run events.
 */
async function runWithLateShell(lateReply: string[]) {
  let calls = 0;
  const bodies: string[] = [];
  const server = createServer((request, response) => {
    // Local tools can probe any listening loopback port; only model calls are counted.
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      request.resume();
      response.writeHead(404).end();
      return;
    }
    let body = "";
    request.on("data", (data) => {
      body += data;
    });
    request.on("end", () => {
      calls += 1;
      bodies.push(body);
      response.writeHead(200, { "content-type": "text/event-stream" });
      const reply =
        calls === 1
          ? chunk(
              {
                role: "assistant",
                tool_calls: [
                  {
                    index: 0,
                    id: "shell-1",
                    type: "function",
                    function: { name: "shell", arguments: '{"command":"long-job"}' },
                  },
                ],
              },
              "tool_calls",
            )
          : calls === 2
            ? textReply(["Started", " the job."])
            : textReply(lateReply);
      response.end(`${reply}data: [DONE]\n\n`);
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Fixture endpoint unavailable");
  const executeTool = async (
    _name: string,
    _args: Record<string, unknown>,
    _executionId: string,
    _route: unknown,
    observer?: AgentToolExecutionObserver,
  ) => {
    observer?.onShellStillRunning?.(Promise.resolve({ stdout: "ok", stderr: "", code: 0 }));
    return { stdout: "", stderr: "", code: null, running: true };
  };
  const events: AgentRuntimeEvent[] = [];
  try {
    for await (const event of new PiAgentRuntime().run(
      {
        botId: "fixture-bot",
        threadId: "fixture-thread",
        runId: "fixture-run",
        prompt: "Start the long job.",
        instructions: "Fixture",
        history: [],
        tools: [
          {
            name: "shell",
            description: "Run a command",
            inputSchema: {
              type: "object",
              properties: { command: { type: "string" } },
              required: ["command"],
            },
          },
        ],
        executeTool,
        model: {
          provider: "openai-compatible",
          id: "fixture",
          baseUrl: `http://127.0.0.1:${address.port}/v1`,
          allowPrivateEndpoint: true,
        },
      },
      { signal: AbortSignal.timeout(15_000) },
    )) {
      events.push(event);
    }
  } finally {
    server.close();
    server.closeAllConnections();
    await once(server, "close");
  }
  const visible = events.flatMap((event) =>
    event.type === "text" ? [event.text] : event.type === "turn" ? ["<turn>"] : [],
  );
  const done = events.find((event) => event.type === "done");
  return { calls, bodies, visible, done };
}

it("marks the reply to a finished shell as a new assistant message", async () => {
  const { calls, visible } = await runWithLateShell(["It finished."]);
  expect(calls).toBe(3);
  expect(visible).toEqual(["Started", " the job.", "<turn>", "It finished."]);
});

it("tells the bot it may stay silent about output that lands after its reply", async () => {
  const { bodies } = await runWithLateShell(["NO_RESPONSE"]);
  // JSON escapes the quotes in the guidance, so compare a quote-free part of it.
  expect(bodies[2]).toContain("This output arrived after your last reply.");
  expect(bodies[1]).not.toContain("This output arrived after your last reply.");
  expect(LATE_SHELL_OUTPUT_GUIDANCE).toContain("This output arrived after your last reply.");
});

it("drops a NO_RESPONSE reply to late output without another model call", async () => {
  const { calls, visible, done } = await runWithLateShell(["NO_", "RESPONSE"]);
  expect(calls).toBe(3);
  expect(visible).toEqual(["Started", " the job."]);
  expect(done).toEqual({ type: "done", text: "Started the job." });
});

it("shows a real update about late output whole, after a turn break", async () => {
  const { visible } = await runWithLateShell(["The build", " failed: disk full."]);
  expect(visible).toEqual(["Started", " the job.", "<turn>", "The build failed: disk full."]);
});
