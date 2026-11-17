import { Trans, useLingui } from "@lingui/react/macro";
import { ORPCError } from "@orpc/client";
import type { Bot } from "@rakazo/contracts";
import { BOT_INSTRUCTIONS_MAX_LENGTH, BOT_TURN_REMINDER_MAX_LENGTH } from "@rakazo/contracts";
import { CHARACTER_CARD_FILE_MAX_BYTES, characterCardBot } from "@rakazo/core/bot-cards";
import { Button, Disclosure, Textarea } from "@rakazo/ui-web";
import { Popover, PopoverContent, PopoverTrigger } from "@rakazo/ui-web/components/ui/popover";
import { History } from "lucide-react";
import { useId, useRef, useState } from "react";
import { rpc } from "../lib/rpc";
import { errorText } from "../lib/user-error";

export function InstructionSettings({ bot }: { bot: Bot }) {
  const { t } = useLingui();
  const id = useId();
  const [previousBot, setPreviousBot] = useState(bot);
  const [current, setCurrent] = useState(bot);
  const [baseline, setBaseline] = useState(bot.instructions);
  const [instructions, setInstructions] = useState(bot.instructions);
  const [turnReminder, setTurnReminder] = useState(bot.turnReminder ?? "");
  const cardInput = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState("");
  if (bot !== previousBot) {
    setPreviousBot(bot);
    if (instructions === baseline) {
      setInstructions(bot.instructions);
      setBaseline(bot.instructions);
    }
    if (turnReminder === (current.turnReminder ?? "")) setTurnReminder(bot.turnReminder ?? "");
    setCurrent(bot);
  }
  async function save(action: () => Promise<Bot>) {
    setPending(true);
    setError("");
    try {
      const updated = await action();
      setConflict(false);
      setCurrent(updated);
      setInstructions(updated.instructions);
      setBaseline(updated.instructions);
      setTurnReminder(updated.turnReminder ?? "");
    } catch (err) {
      setError(errorText(err));
      setConflict((current) => current || (err instanceof ORPCError && err.code === "CONFLICT"));
    } finally {
      setPending(false);
    }
  }
  /** The card replaces the profile it authored; the old instructions stay in history. */
  async function replaceCard(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      const card =
        file.size > CHARACTER_CARD_FILE_MAX_BYTES
          ? undefined
          : characterCardBot(new Uint8Array(await file.arrayBuffer()), { fallbackName: bot.name });
      if (!card) {
        setError(t`No character card found in this file`);
        return;
      }
      await save(() =>
        rpc.bots.applyCharacterCard({
          botId: bot.id,
          characterCard: card.characterCard,
          expectedInstructions: current.instructions,
        }),
      );
    } catch (err) {
      setError(errorText(err));
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between pe-1">
        <label htmlFor={`${id}-instructions`} className="text-xs font-medium text-muted-foreground">
          <Trans>Instructions</Trans>
        </label>
        {current.instructionHistory?.length ? (
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t`Instruction history`}
                  title={t`Instruction history`}
                />
              }
            >
              <History className="size-4 text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent align="end" className="max-h-96 overflow-y-auto">
              {current.instructionHistory.map((version) => (
                <div key={version.id} className="mt-2 text-sm">
                  <Disclosure
                    summary={
                      <span className="inline-flex flex-wrap gap-x-2">
                        <span>{new Date(version.createdAt).toLocaleString()}</span>
                        <span className="text-muted-foreground">{version.reason}</span>
                      </span>
                    }
                  >
                    <pre className="whitespace-pre-wrap">{version.instructions}</pre>
                  </Disclosure>
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      void save(() =>
                        rpc.bots.restoreInstructions({
                          botId: bot.id,
                          versionId: version.id,
                          expectedInstructions: current.instructions,
                        }),
                      )
                    }
                  >
                    <Trans>Restore</Trans>
                  </Button>
                </div>
              ))}
            </PopoverContent>
          </Popover>
        ) : null}
      </div>
      <Textarea
        id={`${id}-instructions`}
        className="font-normal min-h-20 resize-none field-sizing-content text-foreground rounded-xl border-transparent bg-muted/50 p-4 shadow-none"
        value={instructions}
        maxLength={BOT_INSTRUCTIONS_MAX_LENGTH}
        disabled={pending}
        onChange={(event) => setInstructions(event.target.value)}
        onBlur={() => {
          if (!conflict && instructions !== current.instructions)
            void save(() =>
              rpc.bots.update({ botId: bot.id, instructions, expectedInstructions: baseline }),
            );
        }}
      />
      <label
        htmlFor={`${id}-turn-reminder`}
        className="block pt-2 text-xs font-medium text-muted-foreground"
      >
        <Trans>Reminder after the conversation</Trans>
      </label>
      <Textarea
        id={`${id}-turn-reminder`}
        className="font-normal min-h-12 resize-none field-sizing-content text-foreground rounded-xl border-transparent bg-muted/50 p-4 shadow-none"
        value={turnReminder}
        maxLength={BOT_TURN_REMINDER_MAX_LENGTH}
        disabled={pending}
        placeholder={t`Repeated after the newest message on every turn`}
        onChange={(event) => setTurnReminder(event.target.value)}
        onBlur={() => {
          if (turnReminder !== (current.turnReminder ?? ""))
            void save(() => rpc.bots.update({ botId: bot.id, turnReminder }));
        }}
      />
      <input
        ref={cardInput}
        type="file"
        accept=".json,.png,application/json,image/png"
        className="hidden"
        data-testid="instruction-settings-card"
        onChange={(event) => {
          void replaceCard(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      <Button
        variant="outline"
        disabled={pending || conflict}
        onClick={() => cardInput.current?.click()}
      >
        <Trans>Replace from character card</Trans>
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {conflict ? (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => void save(() => rpc.bots.get({ botId: bot.id }))}
        >
          <Trans>Reload</Trans>
        </Button>
      ) : null}
    </div>
  );
}
