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
| `first_mes`, `alternate_greetings` | creation-intro branch in `botIntroPrompt()`: an imported/greeting-capable bot opens in character instead of the generic "you were just created" ask |
| `mes_example` | `instructions` → `## Example exchanges`, normalized (strip `<START>`/`<END>`) |
| `system_prompt`, `post_history_instructions` | `instructions` → `## Standing direction` (folded in) |
| world bible shared by several bots | new nullable `premise` on `ChatGroup`, rendered ahead of `<group_members>` in `renderGroupMembersContext()` |
| relationship state per person | bot-scope memory docs (`people/<name>.md` style paths); no prompt-state meters |
| `creator_notes`, `tags`, art assets | import metadata only; never enter prompts |

`{{char}}` / `{{user}}` macros are expanded at map time (char → the mapped bot
name; user → the creating user's display name when known).

The card's `system_prompt` is folded into instructions rather than plumbed as a
per-run system override: run-instructions composes one ordered system string for
the pi runtime and must stay the single source of truth.

## Stages

1. **Mapper (pure, this PR):** `packages/core/src/bot-cards.ts`
   - `parseCharacterCard(raw)` accepts V1 flat objects and V2/V3 envelopes
     (`spec: chara_card_v2|v3` with `data`), validates loosely, returns
     `undefined` when nothing usable exists.
   - `expandCardMacros(text, { charName?, userName? })`.
   - `cardBotProfile(card, { userName? })` composes `{ name, description,
     instructions, greetings }` under the contract limits
     (`BOT_NAME_MAX_LENGTH` 80, `BOT_DESCRIPTION_MAX_LENGTH` 4000,
     `BOT_INSTRUCTIONS_MAX_LENGTH` 20000) with deterministic section caps and
     boundary-safe truncation (`truncatePlainText`).
   - Offline vitest suite next to it.
2. **Import route:** follow `apps/api/src/agent-import.ts` patterns; card JSON in
   → composed profile seeded onto the bot; raw card stored as artifact for
   export fidelity; origin recorded.
3. **Greeting intro branch:** extend `botIntroPrompt()` with an optional
   greeting; skip "what do you want me for" when the imported profile is
   already complete.
4. **Group premise:** additive migration `ChatGroup.premise String @default("")`
   (nullable-with-default per deploy rules), rendered at the top of
   `renderGroupMembersContext()` so ensemble casts share one scenario.
5. **Export:** include the composed sections plus the raw card so cards round-trip.

## What we deliberately do not do

- No per-bot system-prompt override through the runtime (breaks central
  composition and cache-stable ordering).
- No separate "character" bot type or preset switcher (anti-vision).
- No affection/stat meters tracked as prompt state; memory is the honest version.
- No third-party skill/script execution introduced by imports.

## Testing

Deterministic unit tests for parse/macros/composition/limits (mapper). Route and
intro changes get the same treatment as agent-import does today. Anything
natural-language-judged follows the LLM-rubric rule; none planned here.
