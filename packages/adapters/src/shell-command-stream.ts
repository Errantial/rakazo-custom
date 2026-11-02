import type { ProcessEvent } from "@rakazo/adapter-kit";
import { redactSecrets } from "@rakazo/core";
import { redactShellStreams } from "./agent-environment.js";
import { automated } from "./automated-messages.js";
import { shortenPlainText } from "./context-selection.js";
import { TOOL_RESULT_TEXT_LIMIT } from "./pi-runtime-limits.js";
import { NO_RESPONSE } from "./silent-reply.js";

/**
 * Device-code logins print a code and then wait. Once that output goes quiet,
 * return it while the process is still running so the bot can show the code.
 * Fast commands that exit inside this window are unchanged.
 */
export const SHELL_STREAM_IDLE_MS = 1_000;

// Wording that sign-in and device-code flows print, plus the codes themselves (ABCD-1234).
const SIGN_IN_WORDS =
  /one-time code|device code|verification code|user code|authori[sz]ation code|enter (?:the |this |your )?code|sign[- ]?in|log[- ]?in|authenticat|in (?:a |your )?(?:web )?browser|open (?:this|the following) (?:url|link|page)/i;
const SIGN_IN_CODE = /\b[A-Z0-9]{4,}-[A-Z0-9]{4,}\b/;
// An interactive prompt waiting on input at the end of the output.
const WAITING_PROMPT = /(?:\[y\/n\]|\(y\/n\)|password:|passphrase[^\n]*:|continue\?)\s*$/i;

/**
 * Only output that waits on the user is returned before the command exits. Ordinary
 * commands that print and then pause (SSH probes, builds) used to come back as
 * "still running" after one quiet second, so their final output landed after the
 * bot had already answered, and the bot narrated it.
 */
export function looksLikeSignInPrompt(output: string): boolean {
  return SIGN_IN_WORDS.test(output) || SIGN_IN_CODE.test(output) || WAITING_PROMPT.test(output);
}

export const SHELL_STILL_RUNNING_NOTICE =
  "Still running. Tell the user any one-time code or sign-in URL in the output.";

export interface ShellCommandSnapshot {
  stdout: string;
  stderr: string;
}

export interface FinishedShellCommand extends ShellCommandSnapshot {
  code: number;
}

export interface RunningShellCommand extends ShellCommandSnapshot {
  code: null;
  running: true;
}

export type ShellCommandResult = FinishedShellCommand | RunningShellCommand;

export function isRunningShellCommand(result: unknown): result is RunningShellCommand {
  return (
    !!result &&
    typeof result === "object" &&
    (result as { running?: unknown }).running === true &&
    (result as { code?: unknown }).code === null
  );
}

export function formatFinishedShellCommand(result: FinishedShellCommand): string {
  // Delivered in the user's role after the turn, so marked as automated: models took
  // finished console output for the user replying.
  const parts = [automated("Shell command finished."), `exit code: ${result.code}`];
  if (result.stdout) parts.push(`stdout:\n${keepHeadAndTail(result.stdout)}`);
  if (result.stderr) parts.push(`stderr:\n${keepHeadAndTail(result.stderr)}`);
  return parts.join("\n");
}

// Build and install failures print last, so keep the tail as well as the head.
function keepHeadAndTail(text: string): string {
  return text.length > TOOL_RESULT_TEXT_LIMIT
    ? shortenPlainText(text, TOOL_RESULT_TEXT_LIMIT)
    : text;
}

/**
 * Added when output lands after the bot already answered. Without it, models narrated
 * every late result ("that was just the delayed output…") and buried or skipped the
 * user's newest question.
 */
export const LATE_SHELL_OUTPUT_GUIDANCE = automated(
  `This output arrived after your last reply. The user has not said anything since. If it does not change what you told the user and needs no action, your entire reply must be exactly ${NO_RESPONSE}. Otherwise say only what changed, in one or two sentences. Do not describe the output as late, delayed, an echo or leftover.`,
);

type FinishedTurn = {
  message?: { content?: unknown };
  toolResults: Array<{ toolName?: string; details?: unknown }>;
};

/**
 * After the turn that first saw a still-running shell, wait for those commands
 * to exit and hand the bot the final output. The turn that received the live
 * output is skipped so the bot can relay a device code before the process ends.
 * `afterReply` is true when the finished turn was already a reply to the user.
 */
export async function deliverFinishedShells(
  followUp: (text: string, afterReply: boolean) => void,
  pending: Array<Promise<FinishedShellCommand>>,
  turn: FinishedTurn,
  signal?: AbortSignal,
): Promise<void> {
  if (pending.length === 0 || turnReturnedRunningShell(turn)) return;
  const batch = pending.splice(0, pending.length);
  const results = await Promise.all(batch.map((completion) => finishOrAbort(completion, signal)));
  const texts = results.filter((result): result is FinishedShellCommand => result !== undefined);
  if (texts.length === 0) return;
  const output = texts.map((result) => formatFinishedShellCommand(result)).join("\n\n");
  const afterReply = turnAnsweredUser(turn);
  followUp(afterReply ? `${output}\n\n${LATE_SHELL_OUTPUT_GUIDANCE}` : output, afterReply);
}

/** A turn with reply text and no tool calls is an answer; mid-task output still drives the task. */
function turnAnsweredUser(turn: FinishedTurn): boolean {
  const content = turn.message?.content;
  if (turn.toolResults.length > 0 || !Array.isArray(content)) return false;
  const parts = content as Array<{ type?: unknown; text?: unknown }>;
  return (
    !parts.some((part) => part?.type === "toolCall") &&
    parts.some(
      (part) => part?.type === "text" && typeof part.text === "string" && !!part.text.trim(),
    )
  );
}

function turnReturnedRunningShell(turn: {
  toolResults: Array<{ toolName?: string; details?: unknown }>;
}): boolean {
  return turn.toolResults.some(
    (result) =>
      (result.toolName === "shell" || result.toolName === "user_computer_shell") &&
      isRunningShellCommand(result.details),
  );
}

async function finishOrAbort(
  completion: Promise<FinishedShellCommand>,
  signal?: AbortSignal,
): Promise<FinishedShellCommand | undefined> {
  if (signal?.aborted) return undefined;
  const settled = completion.then(
    (result) => result,
    (error: unknown) => ({
      stdout: "",
      stderr: error instanceof Error ? error.message : "command failed",
      code: 1,
    }),
  );
  if (!signal) return settled;
  return Promise.race([
    settled,
    new Promise<undefined>((resolve) => {
      if (signal.aborted) {
        resolve(undefined);
        return;
      }
      signal.addEventListener("abort", () => resolve(undefined), { once: true });
    }),
  ]);
}

/**
 * Read a command stream. When output arrives and then stays quiet, return it
 * before exit and keep collecting the rest on `completion`.
 */
export async function observeShellCommand(
  events: AsyncIterable<ProcessEvent>,
  options: {
    secrets: string[];
    idleMs?: number;
    /** Whether output so far may come back before exit. Defaults to sign-in prompts only. */
    returnEarlyWhen?: (output: string) => boolean;
    onOutput?: (snapshot: ShellCommandSnapshot) => void;
  },
): Promise<{
  result: ShellCommandResult;
  completion?: Promise<FinishedShellCommand>;
}> {
  const idleMs = options.idleMs ?? SHELL_STREAM_IDLE_MS;
  const returnEarlyWhen = options.returnEarlyWhen ?? looksLikeSignInPrompt;
  let earlyAllowed = false;
  let stdout = "";
  let stderr = "";
  let code: number | undefined;
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resolveIdle: ((reason: "idle" | "done") => void) | undefined;
  const idlePromise = new Promise<"idle" | "done">((resolve) => {
    resolveIdle = resolve;
  });

  const redact = (snapshot: ShellCommandSnapshot, withholdPartial: boolean): ShellCommandSnapshot =>
    redactShellStreams(snapshot, options.secrets, { withholdPartial });

  const clearIdle = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
  };

  const armIdle = () => {
    clearIdle();
    if (idleMs <= 0) {
      resolveIdle?.("idle");
      return;
    }
    timer = setTimeout(() => resolveIdle?.("idle"), idleMs);
  };

  const done = (async (): Promise<FinishedShellCommand> => {
    try {
      for await (const event of events) {
        if (event.type === "stdout" || event.type === "stderr") {
          // Scan only the new chunk plus a short overlap, so long output stays linear.
          const previous = event.type === "stdout" ? stdout : stderr;
          earlyAllowed ||= returnEarlyWhen(`${previous.slice(-200)}${event.data}`);
        }
        if (event.type === "stdout") stdout += event.data;
        else if (event.type === "stderr") stderr += event.data;
        else if (event.type === "exit") {
          code = event.code;
          break;
        } else continue;
        const published = redact({ stdout, stderr }, true);
        try {
          options.onOutput?.(published);
        } catch {
          // Live output is a view. A failed update must not kill the command.
        }
        if (earlyAllowed && (stdout.length > 0 || stderr.length > 0)) armIdle();
      }
    } catch (error) {
      // Providers may include command environment values in errors. Never expose the raw
      // error or its cause to runtime tool handling or a background completion observer.
      throw new Error(
        redactSecrets(error instanceof Error ? error.message : String(error), options.secrets),
      );
    } finally {
      clearIdle();
      finished = true;
      resolveIdle?.("done");
    }
    return { ...redact({ stdout, stderr }, false), code: code ?? 0 };
  })();

  const reason = await Promise.race([
    idlePromise,
    done.then(
      () => "done" as const,
      () => "done" as const,
    ),
  ]);
  if (reason === "done" || finished || code !== undefined) {
    return { result: await done };
  }
  return {
    // The process is still running, so an unfinished secret prefix stays out of the
    // tool result. The completion publishes the rest once the command exits.
    result: { ...redact({ stdout, stderr }, true), code: null, running: true },
    completion: done,
  };
}
