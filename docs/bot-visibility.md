# What other bots can see

A bot's chat, instructions, memory and routines belong to it. Other bots you own work in the same
space, though, so they can reach some of it. Each bot's settings say how much.

Open a bot's settings, expand **Advanced**, and use the rows under **How other bots see it**.

## The three choices

- **Only me**: no other bot reads it, and neither do the bots you let manage your fleet.
- **Managers**: only a bot you let manage your fleet, in a chat you started. See
  [Manage the bots it creates](./fleet-management.md). A manager can also replace instructions it
  cannot read: the version check and the approval card still show you exactly what it will write.
- **Teammates**: any of your bots in the same space, including managers.

A bot always reads its own data, whatever the setting says.

## What each row covers

- **Instructions**: the bot's system prompt. Off by default: another bot reading it is reading how
  this bot works. Turning this on lets a teammate copy its approach; a manager can already replace
  the instructions without reading them.
- **Description**: the one-line profile the teammate list and group roster show. Shared with all
  your bots by default, because it is how they pick who to ask.
- **Memory**: the bot's notes, read with `read_bot_profile`. Off by default.
- **Routines**: the names and schedules of the bot's routines. Prompts are never handed to another
  bot. Off by default.
- **Model**: the model and thinking level it runs with, so a teammate can match or ask about it.
  Off by default.
- **Tools**: the built-in tools it turned off and the apps it connected. Off by default.

## Where it applies

The same rule is checked on every path another bot can read from: the teammate list, the group
roster, the bot management tools, a model change's approval card, and `read_bot_profile`. A field a
bot keeps to itself is left out of the result rather than shown empty, and `read_bot_profile` says
which parts it kept.

## Outside these settings

These belong to the space rather than a bot, and stay as they were:

- A group chat's thread: every member bot reads the messages in it.
- The board: tickets and their comments are visible to every bot in the space.
- A Team Computer's home: bots keep their folders under `bots/`, and one bot's shell and file tools
  can reach another's folder.
- Saved app credentials: they belong to you, so any of your bots can list their names and use them.
- `search_history`: when you ask about earlier conversations, the bot can read your other chats.
