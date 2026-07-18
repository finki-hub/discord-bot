# FINKI Hub / Discord Bot

Discord bot for the [`FINKI Hub`](https://discord.gg/finki-studenti-810997107376914444) Discord server, powered by [discord.js](https://github.com/discordjs/discord.js) 14 and TypeScript. Requires Node.js 26+.

## Features

- Slash commands for courses, rooms, office locations, staff, exam sessions, FAQ entries, links, help, and Anto quotes
- LLM/chat-bot integration for `/ask`, `/prompt`, `/chat`, context-menu prompts, private chat threads, embeddings, model discovery, and FAQ/link lookup
- Reply and thread-based chat continuation for LLM conversations
- Per-guild configuration stored in `config/bot.json`, editable with `/config` commands
- Crossposting for configured announcement channels
- Ticket workflows with configurable ticket types, moderator controls, first-user-message routing, and scheduled cleanup of abandoned or inactive ticket threads
- Optional PostHog analytics with hashed Discord user IDs
- Docker and local Node.js development flows

## Quick Setup (Production)

If you would like to just run the bot:

1. Download [`compose.prod.yaml`](./compose.prod.yaml)
2. Create a `.env` file next to it, or export the required environment variables. Minimum setup requires `TOKEN` and `APPLICATION_ID`.
3. Run `docker compose -f compose.prod.yaml up -d`

This Docker image is available as [ghcr.io/finki-hub/discord-bot](https://github.com/finki-hub/discord-bot/pkgs/container/discord-bot).

The production compose file mounts `./config` and `./logs` into the container. `config/bot.json` is created automatically if it does not exist.

## Quick Setup (Development)

1. Clone the repository: `git clone https://github.com/finki-hub/discord-bot.git`
2. Install dependencies for local tooling: `npm ci`
3. Prepare env. variables by copying `.env.sample` to `.env` - minimum setup requires `TOKEN` and `APPLICATION_ID`
4. Build and run the project in Docker: `docker compose up --build -d`

There is also a dev container available. To use it, just clone the repository, define the env. variables and open the container. Your development environment will be prepared automatically.

## Setup Without Docker

1. Clone the repository: `git clone https://github.com/finki-hub/discord-bot.git`
2. Install dependencies: `npm ci`
3. Prepare env. variables by copying `.env.sample` to `.env` - minimum setup requires `TOKEN` and `APPLICATION_ID`
4. Build the project: `npm run build`
5. Run it: `npm run start:env` or `npm run dev` (runs directly from TypeScript source, no build step)

## Development Commands

| Command             | Description                                      |
| ------------------- | ------------------------------------------------ |
| `npm run dev`       | Run the bot directly from `src/index.ts`         |
| `npm run build`     | Build the bot into `dist/`                       |
| `npm run start`     | Run the built bot using platform env. variables  |
| `npm run start:env` | Run the built bot and load `.env`                |
| `npm run check`     | Type-check the TypeScript project                |
| `npm run lint`      | Run ESLint                                       |
| `npm run format`    | Run ESLint with auto-fix                         |
| `npm run clean`     | Remove `dist/`                                   |

## Configuration

### Environment

Use `.env.sample` as a starting point for local development. The runtime also recognizes these optional variables when they are provided by Docker Compose or the host environment:

| Variable           | Required | Description                                                                                  |
| ------------------ | -------- | -------------------------------------------------------------------------------------------- |
| `TOKEN`            | Yes      | Discord bot token                                                                            |
| `APPLICATION_ID`   | Yes      | Discord application ID                                                                       |
| `CHATBOT_URL`      | No       | URL of the [`finki-hub/chat-bot`](https://github.com/finki-hub/chat-bot) instance            |
| `API_KEY`          | No       | Chat-bot API authentication for `/chat` and credential management requests; never a sponsored provider credential |
| `DATA_STORAGE_URL` | No       | Base URL for data storage, without a trailing slash                                           |
| `POSTHOG_KEY`      | No       | PostHog project key. Analytics are disabled when this is empty                               |
| `POSTHOG_HOST`     | No       | PostHog ingest host. Defaults to `https://eu.i.posthog.com`                                  |
| `POSTHOG_SALT`     | No       | Salt used to hash Discord user IDs. Required together with `POSTHOG_KEY` to enable analytics |
| `TZ`               | No       | Timezone, for example `Europe/Berlin`                                                        |

If `DATA_STORAGE_URL` is not set, data-backed features start with empty data and periodic data reloads are disabled. If `CHATBOT_URL` is not set, FAQ, link, and chat-bot features are disabled or return unavailable responses.

### Bot Configuration

The bot configuration is stored in `config/bot.json`. This file uses a multi-guild structure where each guild ID maps to its own configuration:

```json
{
  "GUILD_ID_1": {
    "channels": { ... },
    "crossposting": { ... },
    "errorWebhook": "https://...",
    "feedback": { ... },
    "models": { ... },
    "roles": { ... },
    "ticketing": { ... }
  },
  "GUILD_ID_2": { ... }
}
```

When the bot joins a new guild, it automatically initializes a default configuration for that guild. You can use `/config get`, `/config set`, and `/config reload` to view, modify, and reload the configuration. The `/config data` subcommand manually reloads all data from the data storage. Runtime state is otherwise kept in Discord or memory; the bot does not require a database.

See [`config/bot.json.example`](./config/bot.json.example) for an example configuration structure.

### Data Files

The data for informational commands is loaded from data storage if `DATA_STORAGE_URL` is configured. The bot fetches these files from the data storage base URL on startup and reloads them every hour:

1. `courses.json` - a consolidated array of all courses with their information, participants, prerequisites, and staff
2. `rooms.json` - an array of all the classrooms
3. `sessions.json` - an object mapping session names to filenames
4. `staff.json` - an array of the staff
5. `anto.json` - an array of strings containing Anto quotes

If `DATA_STORAGE_URL` is not configured, these commands run without loaded data. You can manually trigger a data reload using the `/config data` command.

### Sessions (Timetables)

All the session schedule files should be placed in the `sessions` folder in your data storage bucket. The names of the files should match the respective names in `sessions.json`. When users request a session via the `/session` command, the bot will provide a direct link to the file in the data storage bucket.

## Integration With `finki-hub/chat-bot`

This project features integration with [`finki-hub/chat-bot`](https://github.com/finki-hub/chat-bot) for enabling FAQ, links, and LLM chat functionality. The Discord bot communicates with the chat bot using REST endpoints. If they are deployed in Docker, they should be on the same network to be able to communicate.

Set both `CHATBOT_URL` and `API_KEY` to enable chat. Each Discord user can manage their provider credentials with `/credentials list`, `/credentials set`, and `/credentials delete`; provider keys are sent directly to the chat backend and are never stored by this bot. Hosted and Ollama models require the corresponding user credential.

The Discord experience is free-Luna/BYOK-first: when a user has a provider
credential, that BYOK credential is used first and is sent directly to the chat
backend, never stored by this bot. If the chat backend advertises sponsored
Luna for a user without an OpenAI credential, the backend may serve that free
fallback and owns the quota accounting. A disabled, unavailable, or exhausted
sponsored tier must not be worked around by reusing `API_KEY`; the user should
wait for the next UTC reset or configure their own BYOK credential.

Use the private `/chat models` view for availability and remaining quota. Do not
log provider keys, provider URLs, quota internals, or raw provider errors, and do
not retry an in-progress sponsored request blindly: one active sponsored
request per user is intentional. Quota reset timestamps are displayed in UTC.
The Discord bot does not receive or configure `SPONSORED_OPENAI_API_KEY`,
`SPONSORED_OPENAI_BASE_URL`, or any other `SPONSORED_*` setting.

## Architecture

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the module layout, command-loading flow, configuration model, and guidance for adding new modules or commands.

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
