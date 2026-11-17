# Bot character cards: merging authored personas into functional bots

Goal: a bot can be created or imported from a roleplay-style **character card**
(authored canon: persona, personality, scenario, greeting, speech examples) and
still work like any Rakazo teammate — same thread, memory, computer, tools — so
bots differ through lived identity instead of reading identically.

## Why

A Rakazo bot today is three free-text fields (`name`, `description`,
`instructions`). The per-run identity block
(`runIdentityInstruction()` in `packages/adapters/src/run-instructions.ts`) puts
those first, but they carry only job language. Everything that would make a bot
feel inhabited — canon, voice, a scripted opening, how it treats a particular
person — has no home, so bots converge toward the same tone.

Character cards solve exactly the missing half: *authored static canon*. They do
not solve continuity; Rakazo already beats them there with persistent threads,
`update_bot`, instruction history, and `<durable_memory>`. So the merge rule is:

- **Card → canon in instructions** (authored, versioned, restorable).
- **Social dynamics → memory** (relationship facts in bot-scope memory), never
  gamified meters in prompt state.

This keeps VISION.md's rule intact: cards are durable state inside one product,
not a separate "preset" kind of bot.

## Field mapping

| Card field | Rakazo home |
| --- | --- |
| `name`, tagline | `name`, `description` (unchanged model fields) |
| persona sheet / `description` | `instructions` → `## Canon` section |
| `personality` | `instructions` → `## Personality` |
| `scenario` | `instructions` → `## Setting`; optionally seeds memory docs |
| `first_mes`, `alternate_greetings` | the bot's own first thread message, posted as it is created (only the first greeting is used for now) |
| `mes_example` | `instructions` → `## Example exchanges`, normalized (strip `<START>`/`<END>`) |
| `system_prompt` | `instructions` → `## Standing direction` (folded in) |
| `post_history_instructions` | `Bot.turnReminder`, sent after the newest message on every turn (see below) |
| world bible shared by several bots | new `premise` on `ChatGroup` (`String @default("")`), rendered ahead of `<group_members>` in `renderGroupMembersContext()` |
| relationship state per person | bot-scope memory docs (`people/<name>.md` style paths); no prompt-state meters |
| `creator_notes`, `tags`, art assets | import metadata only; never enter prompts |

`{{char}}` / `{{user}}` macros are expanded at map time (char → the mapped bot
name; user → the creating user's display name when known, else the literal
"the user"). Only the exact tokens expand, so authored text such as
`{{ char }}` or `{{character}}` is left alone.

Greetings are clamped to 2,000 characters at parse time and deduplicated after
clamping. A greeting is the bot's real first message rather than hidden prompt
text: it is written in the same transaction that creates the bot, so it appears
even when no model is configured yet, and the greeting never enters the trusted
instruction channel (canon, personality, setting, examples and `system_prompt` do,
as the bot's instructions). A card that names nothing, or whose name would be
stored blank (symbols only, an id-like token, a bare `{{char}}`), keeps the name
the person typed; card names are collapsed onto one line.

The card's `system_prompt` is folded into instructions rather than plumbed as a
per-run system override: run-instructions composes one ordered system string for
the pi runtime and must stay the single source of truth.

`post_history_instructions` is the exception, because its whole point is where it
sits: card authors write it to land after the chat history, where it outweighs a
long conversation. It is stored as the bot's `turnReminder` (up to
`BOT_TURN_REMINDER_MAX_LENGTH`, 2,000 characters) and the executor appends it to
the run's prompt after the newest message, next to the current time
(`turnReminderInstruction()` in `run-instructions.ts`). Like the timestamp it is
per-turn text, so the cacheable system prefix is unchanged. It is never written
to the thread, so later turns see it only once, after their own newest message.
Owners can edit it in bot settings on web and mobile, and it travels with
duplication and account export.

## Stages

Stages 1 to 4, 6 and 7 are shipped. Stage 5 was dropped; the reason is recorded
below so it is not mistaken for unfinished work.

1. **Mapper (pure, shipped):** `packages/core/src/bot-cards.ts`
   - `parseCharacterCard(raw)` accepts V1 flat objects and V2/V3 envelopes
     (`spec: chara_card_v2|v3` with `data`), validates loosely, returns
     `undefined` when nothing usable exists.
   - `expandCardMacros(text, { charName?, userName? })`.
   - `cardBotProfile(card, { userName?, fallbackName? })` composes
     `BotCardProfile` (`name`, `description`, `instructions`) under the contract
     limits (`BOT_NAME_MAX_LENGTH` 80, `BOT_DESCRIPTION_MAX_LENGTH` 4000,
     `BOT_INSTRUCTIONS_MAX_LENGTH` 20000) with deterministic section caps and
     boundary-safe truncation (`truncatePlainText`).
   - `readCharacterCardFile(bytes)` reads card JSON, or a PNG carrying the card
     base64-encoded in a `ccv3` (preferred) or `chara` text chunk, and reads
     anything else as nothing rather than throwing. It uses only `TextDecoder`
     and `atob` so web, desktop, and mobile share it.
   - Offline vitest suite next to it.
2. **Import route (shipped):** `bots.create` takes an untrusted
   `characterCard`, maps it, and merges field-wise: the card's name wins and its
   description/instructions replace the typed ones only where the card authored
   them. The agent tool `spawn_bot` takes the same card as JSON text, maps it
   through the same seed and merge in `packages/core/src/bot-cards.ts`, and
   refuses a card it cannot use rather than creating a plain bot.
3. **Greeting (shipped, replacing the intro branch):** the first greeting is
   posted as the bot's first thread message in creation's transaction. A bot
   whose card wrote its instructions or a greeting skips `enqueueBotIntroRun`
   entirely: its profile or opening is already authored, and the hidden
   `ask_user` path caps questions at 240 characters with 2-4 options, which
   cannot carry an authored opening. A card that only names the bot, and every
   ordinary bot, keeps that intro unchanged.
4. **Group premise (shipped):** additive migration
   `ChatGroup.premise String @default("")` (`NOT NULL DEFAULT ''`), accepted on
   group create/update, including the `create_group` and `update_group` agent
   tools (an empty `premise` clears it on update), copied when a group is
   duplicated, rendered at the top of `renderGroupMembersContext()`, and carried
   through account export/import.
   Multi-line premises render as literal `\n` in context lines so a premise
   cannot forge extra prompt lines.
5. **Raw card storage and export (dropped):** everything a card produces
   already round-trips through account export: the name, description, and
   instructions are bot fields, and the greeting is an ordinary message. Keeping
   the raw card as well would be a second source of truth that drifts as soon
   as the bot edits its own instructions, so the raw card is not stored. Revisit
   only if an "export as character card" feature needs it.
6. **Clients (shipped):** web and desktop (which hosts the web UI) import a card
   from the import panel's "Character card" section; mobile adds "Bot from
   card" to the Create menu. Both read the file through `characterCardBot()` in
   core, so the name, fields, and intro decision match the server, and both cap
   card files at `CHARACTER_CARD_FILE_MAX_BYTES` (8 MiB). Mobile skips its
   onboarding focus prompt when the card authored instructions or a greeting,
   so it does not talk over the card's opening. Group settings on web and
   mobile edit the premise.

7. **Replacing a card (shipped):** `bots.applyCharacterCard` maps a new card
   through the same seed and merge onto an existing bot, with the bot's stored
   name, description, instructions and turn reminder as the typed fields. The
   card's reminder replaces the old one whenever the card wrote instructions or
   a reminder, so a reminder from a previous card does not outlive it. The
   instruction write takes `expectedInstructions` and records a "Character card"
   version, so the previous instructions can be restored from history. The bot
   keeps its thread, memory, computer and settings, and the greeting is not
   posted again. Unlike creation, an unusable card is refused instead of
   falling back. Web bot settings ("Replace from character card" under the
   instructions) and mobile bot settings both read the file through
   `characterCardBot()`.

## Open product question

The mapped one-paragraph `description` also serves teammate-directory routing
(`renderBotDirectory`), where a role summary reads better than canon prose.
Whether cards should author a separate routing line is still open.

## What we deliberately do not do

- No per-bot system-prompt override through the runtime (breaks central
  composition and cache-stable ordering).
- No separate "character" bot type or preset switcher (anti-vision).
- No affection/stat meters tracked as prompt state; memory is the honest version.
- No third-party skill/script execution introduced by imports.

## Testing

Deterministic unit tests for parse/macros/composition/limits (mapper) plus
mapper-to-route tests: a usable card seeds the profile, posts the greeting as
the bot's first message, and queues no intro run, while a name-only card keeps
the intro and a malformed card still creates an ordinary bot with the usual intro.
Adapter tests cover the same seed and merge for `spawn_bot` (including a refused
card) and the group premise on `create_group` / `update_group` (including a
cleared one). Anything natural-language-judged follows the LLM-rubric rule; none
is used here.
