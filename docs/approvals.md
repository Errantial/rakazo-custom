# Approvals

Decide how much a bot can do without asking you first.

## Choose a mode

Open **Settings → Approvals** and pick a **Mode**:

- **Ask**: the bot asks before any action that changes something, such as sending an email or
  editing a document. Reading usually doesn't ask.
- **Auto**: an approval model checks each action against what you asked for. Actions that fit go
  ahead; the bot asks when one is off-task, or can't be undone and you didn't ask for it.
- **Never ask**: every action runs without waiting.

**Auto** needs an **Approval model**, set in **Settings → Models**. See [Models](./models.md).

> [!TIP]
> Start with **Ask** or **Auto**. As you approve the same action again and again, choose
> **Always allow** on the card and the bot stops asking for that one.

## Let one bot run without asking

Open a bot's settings, expand **Advanced**, and turn on **Run without asking** under
**Permissions**. When you start the run yourself, that bot skips cards even for the actions below,
such as creating routines, spaces, groups, or child bot settings. A blocked action still refuses,
and payments, secrets, and computer access keep their own prompts. The setting applies to that bot
only.

It does not turn off the protections against text you didn't write. Like **Never ask**, the bot
refuses those actions, instead of asking, in a run started by a webhook, message, routine, or
another bot, or once the run has read outside content such as a web page or an email.

Routines are the exception: a bot with **Run without asking** on creates and edits routines
(including a child bot's routines) without a card in every run, even one started by a webhook,
message, routine, or another bot, or one that read outside content. A routine that runs a shell
command as its watch still asks.

## Approval cards

When a bot needs a yes, it posts a card in the chat showing exactly what it wants to do:

- **Allow once**: just this time.
- **Always allow this tool**, or **Always allow** a site: stop asking for it.
- **Deny**: the bot doesn't do it and carries on.

Cards never block the chat. Keep talking to the bot, and answer the card whenever you're ready. You
get a notification when a bot is waiting on you, if notifications are on in the bot's settings.

## Allow and Block lists

Every **Always allow** choice is saved in **Settings → Approvals**. Switch any entry between
**Allow** and **Block**, or **Remove** it. A blocked action is refused without a card, in every
mode. **Preview** shows what would happen for a given tool before you change anything.

To stop one bot from ever using a tool, open the bot's settings, expand **Advanced**, and use
**Disable a tool** under **Tools**.

## What always asks

- Changing a bot's instructions, creating a space, and the actions in
  [Bots that manage bots](./fleet-management.md) always show a card. **Auto** and **Always allow**
  don't skip it. A bot with **Run without asking** on does skip it in a run you started that has
  read no outside content.
- Actions that text you didn't write could be steering, such as changes in a run started by a
  webhook, ask in **Auto** and **Ask**, and are refused in **Never ask** and for a bot set to
  **Run without asking**.

## Per space

Approval settings are account defaults that every [space](./spaces.md) follows. To give one space
different rules, open its settings and choose **Customize** next to **Approvals**.
