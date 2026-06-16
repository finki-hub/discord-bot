# FINKI Hub / Discord Bot

Discord bot for the [`FINKI Hub`](https://discord.gg/finki-studenti-810997107376914444) Discord server, powered by [discord.js](https://github.com/discordjs/discord.js) 14. Requires Node.js 26+.

## Quick Setup (Production)

If you would like to just run the bot:

1. Download [`compose.prod.yaml`](./compose.prod.yaml)
2. Run `docker compose -f compose.prod.yaml up -d`

This Docker image is available as [ghcr.io/finki-hub/discord-bot](https://github.com/finki-hub/discord-bot/pkgs/container/discord-bot).

## Quick Setup (Development)

1. Clone the repository: `git clone https://github.com/finki-hub/discord-bot.git`
2. Install dependencies: `npm i`
3. Prepare env. variables by copying `.env.sample` to `.env` - minimum setup requires `TOKEN` and `APPLICATION_ID`
4. Build the project in Docker: `docker compose build`
5. Run it: `docker compose up -d`

There is also a dev container available. To use it, just clone the repository, define the env. variables and open the container. Your development environment will be prepared automatically.

## Setup Without Docker

1. Clone the repository: `git clone https://github.com/finki-hub/discord-bot.git`
2. Install dependencies: `npm i`
3. Prepare env. variables by copying `.env.sample` to `.env` - minimum setup requires `TOKEN` and `APPLICATION_ID`
4. Build the project: `npm run build`
5. Run it: `npm run start:env` or `npm run dev` (runs directly from TypeScript source, no build step)

## Configuration

### Environment

The env. variables are stored in `.env.sample`. The following variables are available:

| Variable           | Required | Description                                                                       |
| ------------------ | -------- | --------------------------------------------------------------------------------- |
| `TOKEN`            | Yes      | Discord bot token                                                                 |
| `APPLICATION_ID`   | Yes      | Discord application ID                                                            |
| `CHATBOT_URL`      | No       | URL of the [`finki-hub/chat-bot`](https://github.com/finki-hub/chat-bot) instance |
| `API_KEY`          | No       | API key for authenticated chat bot endpoints (e.g. embeddings)                    |
| `DATA_STORAGE_URL` | No       | Base URL for data storage (without trailing slash)                                |
| `TZ`               | No       | Timezone (e.g. `Europe/Berlin`)                                                   |

If `DATA_STORAGE_URL` is not set, data loading features will be disabled. If `CHATBOT_URL` is not set, FAQ, links, and chat features will be disabled.

### Bot Configuration

The bot configuration is stored in `config/bot.json`. This file uses a multi-guild structure where each guild ID maps to its own configuration:

```json
{
  "GUILD_ID_1": {
    "channels": { ... },
    "crossposting": { ... },
    "errorWebhook": "https://...",
    "models": { ... },
    "roles": { ... },
    "ticketing": { ... }
  },
  "GUILD_ID_2": { ... }
}
```

When the bot joins a new guild, it automatically initializes a default configuration for that guild. You can use the `/config` commands to view and modify the configuration. The `/config data` subcommand allows you to manually trigger a reload of all data from the data storage.

See [`config/bot.json.example`](./config/bot.json.example) for an example configuration structure.

### Data Files

The data for the informational commands is loaded from data storage (if `DATA_STORAGE_URL` is configured). The bot automatically fetches and periodically reloads the following files from the data storage base URL:

1. `courses.json` - a consolidated array of all courses with their information, participants, prerequisites, and staff
2. `rooms.json` - an array of all the classrooms
3. `sessions.json` - an object mapping session names to filenames
4. `staff.json` - an array of the staff
5. `anto.json` - an array of strings containing Anto quotes

If `DATA_STORAGE_URL` is not configured, these features will be disabled and the bot will run without data loading functionality. You can manually trigger a data reload using the `/config data` command.

### Sessions (Timetables)

All the session schedule files should be placed in the `sessions` folder in your data storage bucket. The names of the files should match the respective names in `sessions.json`. When users request a session via the `/session` command, the bot will provide a direct link to the file in the data storage bucket.

## Integration With `finki-hub/chat-bot`

This project features integration with [`finki-hub/chat-bot`](https://github.com/finki-hub/chat-bot) for enabling FAQ, links, and LLM chat functionality. The Discord bot communicates with the chat bot using REST endpoints. If they are deployed in Docker, they should be on the same network to be able to communicate.

Set the `CHATBOT_URL` env. variable to the URL of the chat bot, and optionally `API_KEY` for authenticated endpoints (such as filling embeddings).

## Frequently Asked Questions

1. How do I create a Discord bot?
   - Refer to <https://discord.com/developers/applications>

## Frequently Encountered Errors

1. "Error: Used disallowed intents"
   - You must enable all intents in the Discord Developer Portal
2. "Error \[TokenInvalid]: An invalid token was provided."
   - Your bot token is invalid.

## License

This project is licensed under the terms of the MIT license.
