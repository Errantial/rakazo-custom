import type { Bot, ThreadSnapshot } from "@rakazo/contracts";
import { speechFromBlocks } from "@rakazo/core";
import { toast } from "@rakazo/ui-web";
import { useEffect, useRef } from "react";
import { speaker } from "../../lib/tts";

const READ_ALOUD_TOAST = "read-aloud-error";

/** Chat read-aloud has no caption to carry a failure, so it surfaces as a toast. */
function readAloud(text: string, opts: { botId: string; messageId: string }) {
  void speaker.speak(text, opts).then((error) => {
    if (error) toast.error(error, { id: READ_ALOUD_TOAST });
  });
}

/** Reads new replies aloud for bots set to speak their replies. */
export function useReadAloud({
  active,
  snapshot,
  callBotId,
}: {
  active: Bot | undefined;
  snapshot: ThreadSnapshot | null;
  callBotId: string | undefined;
}) {
  const autoSpoken = useRef<string | null>(null);
  const autoSpokenBotId = useRef<string | null>(null);

  useEffect(() => {
    if (!active || !snapshot || snapshot.botId !== active.id) return;
    const lastBot = [...snapshot.messages].reverse().find((message) => message.role === "bot");
    if (autoSpokenBotId.current !== active.id) {
      autoSpokenBotId.current = active.id;
      autoSpoken.current = lastBot?.id ?? null;
      return;
    }
    if (callBotId === active.id || !active.autoSpeak) {
      autoSpoken.current = lastBot?.id ?? null;
      return;
    }
    if (snapshot.run && ["running", "queued", "leased"].includes(snapshot.run.status)) return;
    if (!lastBot || lastBot.id === autoSpoken.current) return;
    const text = speechFromBlocks(lastBot.blocks);
    if (!text) return;
    autoSpoken.current = lastBot.id;
    readAloud(text, { botId: active.id, messageId: lastBot.id });
  }, [
    snapshot?.messages,
    snapshot?.run?.status,
    snapshot?.botId,
    active?.autoSpeak,
    active?.id,
    callBotId,
  ]);
}
