# Architecture Documentation

This document describes the architecture and structure of the FINKI Discord Bot codebase. It can serve as a reference for understanding the project or as a template for building similar modular Discord bots.

## Table of Contents

- [Overview](#overview)
- [Core](#core-srccore)
- [Common](#common-srccommon)
- [Modules](#modules-srcmodules)
- [Configuration](#configuration-srcconfiguration)
- [Translations](#translations-srctranslations)
- [Static Configuration](#static-configuration-config)
- [Logging](#logging)
- [Error Handling](#error-handling)
- [Path Aliases](#path-aliases)
- [Build & Runtime](#build--runtime)
- [Extending the Bot](#extending-the-bot)

## Overview

The bot is built with [discord.js](https://github.com/discordjs/discord.js) 14 and TypeScript, following a modular architecture that separates concerns into distinct layers:

```
src/
├── index.ts           # Entry point - calls bootstrap()
├── core/              # Framework & bootstrapping (the "engine")
├── common/            # Shared utilities & services (reusable code)
├── modules/           # Feature modules (business logic)
├── configuration/     # Configuration management (settings)
└── translations/      # Localized strings & labels (i18n)
```

### Design Philosophy

1. **Core is the framework** - It handles all Discord.js integration, command registration, and event routing. Modules don't need to know how commands are registered.

2. **Modules are features** - Each module is a self-contained feature. Adding a new feature = adding a new module folder.

3. **Common prevents duplication** - Utilities used by multiple modules live here.

4. **Configuration is centralized** - All settings flow through the configuration layer.

5. **Translations are separate** - User-facing strings are isolated for easy updates and potential i18n.

---

## Core (`src/core/`)

The **core** layer is the framework responsible for bootstrapping the bot, loading modules, registering commands, and handling Discord events. It provides the foundational infrastructure that all modules depend on.

### Key Components

| File/Folder            | Purpose                                                             |
| ---------------------- | ------------------------------------------------------------------- |
| `bootstrap.ts`         | Main initialization function that orchestrates startup              |
| `client.ts`            | Discord.js client configuration and export                          |
| `lib/Command.ts`       | Command type definitions (Chat, Button, Autocomplete, Context Menu) |
| `lib/Module.ts`        | Module interface schema using Zod                                   |
| `commands/modules.ts`  | Command discovery and registration with Discord API                 |
| `commands/handlers.ts` | Interaction handlers for all command types                          |
| `events/`              | Discord event listeners (ClientReady, InteractionCreate, etc.)      |
| `utils/`               | Utility functions for modules, events, and permissions              |

### Bootstrap Flow

1. Load environment variables from `.env`
2. Attach process listeners (error handling, graceful shutdown)
3. In parallel:
   - Reload bot configuration
   - Initialize modules (call their `init` functions)
   - Register slash commands with Discord
   - Attach event listeners
4. Login to Discord

### Command Types

The framework supports five types of commands:

- **ChatCommand** - Slash commands (`/command`)
- **ButtonCommand** - Button interaction handlers
- **AutocompleteCommand** - Autocomplete suggestion handlers
- **ContextMenuCommand** - Right-click context menu commands
- **ModalCommand** - Modal submit interaction handlers

Commands are automatically discovered from module directories based on their folder structure:

- `commands/chat/` - Chat commands
- `commands/button/` - Button handlers
- `commands/autocomplete/` - Autocomplete handlers
- `commands/context/` - Context menu commands
- `commands/modal/` - Modal submit handlers

### Event System

Events are defined in `core/events/` and are automatically discovered and attached during bootstrap. Each event file exports:

- `name` - The Discord.js event name (from `Events` enum)
- `execute` - The event handler function
- `once` (optional) - If `true`, the listener fires only once

**Example event file (`core/events/ClientReady.ts`):**

```typescript
import { type ClientEvents, Events } from "discord.js";

export const name = Events.ClientReady;
export const once = true;

export const execute = async (...[client]: ClientEvents[typeof name]) => {
  console.log(`Logged in as ${client.user.tag}`);
};
```

The event discovery system (`core/utils/events.ts`) reads all `.js` files from the events directory, validates them against `ClientEventSchema`, and attaches them to the client.

---

## Common (`src/common/`)

The **common** layer contains shared utilities, services, and schemas used across all modules. This prevents code duplication and ensures consistency.

### Structure

```
common/
├── commands/          # Command building utilities
│   ├── autocomplete.ts
│   ├── chat.ts        # createChatCommandChoices, etc.
│   ├── subcommands.ts
│   └── utils.ts
├── components/        # Shared Discord components
│   └── mention.ts
├── logger/            # Logging infrastructure
│   ├── index.ts       # Main logger export
│   └── webhookTransport.ts
├── schemas/           # Zod schemas for validation
│   ├── Channel.ts
│   ├── ClientEvent.ts
│   ├── Role.ts
│   └── utils.ts
├── services/          # Shared services
│   ├── channels.ts
│   └── roles.ts
├── types/             # Shared TypeScript types
│   └── PaginationPosition.ts
└── utils/             # Utility functions
    ├── data.ts        # JSON fetching & parsing
    ├── guild.ts       # Guild member utilities
    ├── messages.ts    # Message formatting
    └── transliteration.ts
```

### Usage

Import common utilities using the `@/common/` path alias:

```typescript
import { logger } from "@/common/logger/index.js";
import { getMemberFromGuild } from "@/common/utils/guild.js";
```

### When to Add to Common

Add code to `common/` when:

- It's used by **2+ modules**
- It's a **generic utility** not tied to a specific feature
- It's **infrastructure** (logging, validation schemas, services)

Keep code in modules when:

- It's only used by **one module**
- It's **feature-specific** logic

---

## Modules (`src/modules/`)

The **modules** layer contains feature-specific functionality. Each module is self-contained and can have its own commands, components, utilities, and schemas.

### Available Modules

| Module    | Description                          |
| --------- | ------------------------------------ |
| `admin`   | Bot administration and configuration |
| `chat`    | AI chat integration                  |
| `course`  | Course information and management    |
| `data`    | Data loading and management          |
| `faq`     | Frequently asked questions           |
| `help`    | Help command and documentation       |
| `misc`    | Miscellaneous commands               |
| `room`    | Room/channel management              |
| `session` | Session management                   |
| `staff`   | Staff-related features               |
| `ticket`  | Ticketing system                     |

### Module Structure

Each module follows a consistent structure:

```
modules/<module-name>/
├── index.ts           # Optional: Module initialization (init function)
├── commands/          # Command definitions
│   ├── chat/          # Slash commands
│   ├── button/        # Button handlers
│   ├── autocomplete/  # Autocomplete handlers
│   └── context/       # Context menu commands
├── components/        # Discord UI components
├── schemas/           # Zod validation schemas
└── utils/             # Module-specific utilities
```

### Module Initialization

Modules can export an `init` function in their `index.ts` that will be called during bootstrap:

```typescript
// modules/course/index.ts
export const init = async () => {
  await reloadCourses();
  startPeriodicReload();
};
```

The `init` function is validated against the `ModuleSchema` and is optional. Modules without an `index.ts` or without an `init` export will still have their commands loaded.

### Creating a New Command

To add a new slash command:

1. Create a file in `modules/<module>/commands/chat/<command-name>.ts`
2. Export `name`, `data` (SlashCommandBuilder), and `execute` function:

```typescript
import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";

export const name = "mycommand";

export const data = new SlashCommandBuilder()
  .setName(name)
  .setDescription("My command description");

export const execute = async (interaction: ChatInputCommandInteraction) => {
  await interaction.reply("Hello!");
};
```

Commands are automatically discovered and registered during bootstrap.

### Creating a Button Handler

Button handlers respond to button click interactions. The `name` is matched against the button's `customId`:

```typescript
// modules/<module>/commands/button/confirm.ts
import { type ButtonInteraction } from "discord.js";

export const name = "confirm";

export const execute = async (
  interaction: ButtonInteraction,
  args: string[],
) => {
  // args contains additional data from customId (e.g., "confirm:userId:action")
  const [userId, action] = args;
  await interaction.reply(`Confirmed ${action} for user ${userId}`);
};
```

When creating a button, set the `customId` to match:

```typescript
new ButtonBuilder()
  .setCustomId(`confirm:${userId}:delete`) // "confirm" matches handler name
  .setLabel("Confirm");
```

### Creating an Autocomplete Handler

Autocomplete handlers provide suggestions as users type:

```typescript
// modules/<module>/commands/autocomplete/course.ts
import { type AutocompleteInteraction } from "discord.js";

export const name = "course";

export const execute = async (interaction: AutocompleteInteraction) => {
  const focused = interaction.options.getFocused();
  const choices = ["Math", "Physics", "Chemistry"].filter((choice) =>
    choice.toLowerCase().includes(focused.toLowerCase()),
  );

  await interaction.respond(
    choices.slice(0, 25).map((choice) => ({ name: choice, value: choice })),
  );
};
```

---

## Configuration (`src/configuration/`)

The **configuration** layer manages bot settings, environment variables, and runtime configuration.

### Structure

```
configuration/
├── environment.ts     # Environment variable access (TOKEN, APPLICATION_ID, etc.)
├── bot/               # Bot configuration management
│   ├── index.ts       # Config getters/setters
│   ├── defaults.ts    # Default configuration values
│   ├── file.ts        # File I/O for config
│   └── refresh.ts     # Config refresh logic
└── data/              # Data configuration
```

### Multi-Guild Support

The bot supports per-guild configuration stored in `config/bot.json`:

```json
{
  "GUILD_ID_1": {
    "channels": { ... },
    "roles": { ... },
    ...
  },
  "GUILD_ID_2": { ... }
}
```

Access configuration via:

```typescript
import { getConfigProperty } from "@/configuration/bot/index.js";

const channels = await getConfigProperty("channels", guildId);
```

## Translations (`src/translations/`)

The **translations** layer contains all user-facing strings, organized by feature area:

| File            | Content                         |
| --------------- | ------------------------------- |
| `about.ts`      | About/info messages             |
| `api.ts`        | API-related messages            |
| `commands.ts`   | Command descriptions and errors |
| `components.ts` | Component labels                |
| `emojis.ts`     | Emoji definitions               |
| `errors.ts`     | Error messages                  |
| `labels.ts`     | General UI labels               |
| `pagination.ts` | Pagination text                 |
| `tickets.ts`    | Ticketing system messages       |

### Usage

```typescript
import { commandDescriptions, commandErrors } from '@/translations/commands.js';

// Use in command definitions
.setDescription(commandDescriptions['help'])

// Use in error responses
await interaction.reply({ content: commandErrors.commandNoPermission });
```

### Best Practices

- Keep strings **short and reusable**
- Group related strings in **objects** (e.g., `commandErrors.notFound`, `commandErrors.noPermission`)
- Use **functions** for dynamic strings: `welcomeMessage: (name: string) => \`Welcome, ${name}!\``
- Consider adding **string keys** that match translation systems if i18n is planned

---

## Static Configuration (`config/`)

The `config/` directory contains JSON configuration files for various features:

- `bot.json` - Per-guild bot configuration
- `courses.json` - Course data
- `professors.json` - Professor information
- `rooms.json` - Room/channel configuration
- `roles.json` - Role definitions
- `rules.json` - Server rules
- And more...

These files are typically loaded at startup or on-demand and can be reloaded without restarting the bot.

---

## Logging

The bot uses [Winston](https://github.com/winstonjs/winston) for logging with multiple transports:

| Transport             | Level   | Purpose                            |
| --------------------- | ------- | ---------------------------------- |
| Console               | `info`  | Development visibility with colors |
| File (`logs/bot.log`) | `debug` | Persistent debug logs              |
| Webhook               | `error` | Send errors to Discord channel     |

### Usage

```typescript
import { logger } from "@/common/logger/index.js";

logger.debug("Detailed info for debugging");
logger.info("General operational info");
logger.warn("Warning - something unexpected");
logger.error("Error - something failed");
```

### Log Format

```
2024-01-15 14:30:45 - info: [Chat] Username#1234: /help [Server Name]
2024-01-15 14:30:46 - error: Failed to execute command\nError: ...
```

---

## Error Handling

### Command Error Handling

All command handlers are wrapped with try-catch in `core/commands/handlers.ts`:

1. **Permission errors** - Caught and logged, user sees generic message
2. **Discord API errors** - Detected via `DiscordAPIError`, handled gracefully
3. **Unknown errors** - Logged with stack trace, user sees generic error message

### Process-Level Handling

`core/utils/process.ts` attaches handlers for:

- `uncaughtException` - Logs and continues
- `unhandledRejection` - Logs promise rejections
- `SIGINT` / `SIGTERM` - Graceful shutdown

---

## Path Aliases

The project uses TypeScript path aliases for cleaner imports:

- `@/` → `src/`

This is configured in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

**Example:**

```typescript
// Instead of relative imports
import { logger } from "../../../common/logger/index.js";

// Use path alias
import { logger } from "@/common/logger/index.js";
```

> **Note:** The `.js` extension is required for ESM compatibility even when importing `.ts` files.

---

## Build & Runtime

The project uses:

- **esbuild** for fast TypeScript compilation (`esbuild.config.js`)
- **ESLint** for code linting (`eslint.config.js`)
- **TypeScript** for type checking (`tsconfig.json`)
- **Docker** for containerization (`Dockerfile`, `compose.yaml`)
- **Zod** for runtime schema validation

### Development Commands

```bash
npm run build      # Build the project (TypeScript → JavaScript)
npm run dev        # Run with hot reloading (watches for changes)
npm run start:env  # Run with .env loaded
npm run lint       # Run ESLint
npm run lint:fix   # Run ESLint with auto-fix
```

### Build Output

The build outputs to `dist/` with the same structure as `src/`:

```
dist/
├── index.js
├── core/
├── common/
├── modules/
├── configuration/
└── translations/
```

---

## Extending the Bot

### Adding a New Module

1. Create a new directory: `src/modules/<module-name>/`
2. (Optional) Add `index.ts` with an `init` function for startup logic
3. Create command folders: `commands/chat/`, `commands/button/`, etc.
4. Add module-specific utilities in `utils/`
5. Add Zod schemas in `schemas/` for data validation
6. Add user-facing strings to `src/translations/`

**Minimal module structure:**

```
modules/myfeature/
├── commands/
│   └── chat/
│       └── mycommand.ts
└── utils/
    └── helpers.ts
```

**Full module structure:**

```
modules/myfeature/
├── index.ts              # init() for startup logic
├── commands/
│   ├── chat/             # Slash commands
│   ├── button/           # Button handlers
│   ├── autocomplete/     # Autocomplete handlers
│   ├── context/          # Context menu commands
│   └── modal/             # Modal submit handlers
├── components/           # UI component builders
├── schemas/              # Zod validation schemas
└── utils/                # Module-specific utilities
```

### Adding Permissions to Commands

Commands can specify required permissions and roles:

```typescript
export const permissions: CommandPermissions = {
  permissions: [PermissionFlagsBits.Administrator],
  roles: ["admin", "moderator"],
  subcommands: {
    "dangerous-subcommand": {
      permissions: [PermissionFlagsBits.ManageGuild],
    },
  },
};
```

## Summary

The architecture follows these principles:

1. **Separation of Concerns** - Core framework, common utilities, and feature modules are clearly separated
2. **Convention over Configuration** - Commands are auto-discovered based on directory structure
3. **Type Safety** - Zod schemas validate runtime data, TypeScript ensures compile-time safety
4. **Modularity** - Features are encapsulated in modules that can be developed independently
5. **Consistency** - Shared translations and utilities ensure a unified experience

### Quick Reference

| I want to...             | Go to...                                    |
| ------------------------ | ------------------------------------------- |
| Add a new slash command  | `src/modules/<module>/commands/chat/`       |
| Add a button handler     | `src/modules/<module>/commands/button/`     |
| Add a new feature        | Create `src/modules/<new-module>/`          |
| Add shared utility       | `src/common/utils/`                         |
| Add user-facing text     | `src/translations/`                         |
| Change bot config        | `config/bot.json`                           |
| Add environment variable | `.env` + `src/configuration/environment.ts` |
| Add a new event listener | `src/core/events/`                          |

### File Naming Conventions

- **Commands**: Named after the command (e.g., `help.ts` for `/help`)
- **Button handlers**: Named after the button action (e.g., `confirm.ts` for `confirm:*` buttons)
- **Schemas**: PascalCase matching the type (e.g., `BotConfig.ts`)
- **Utils**: Descriptive of functionality (e.g., `messages.ts`, `guild.ts`)

---

## Adapting for Another Project

To use this architecture for a new Discord bot:

1. **Copy the structure**: `core/`, `common/`, `modules/`, `configuration/`, `translations/`
2. **Keep core unchanged** (or minimal changes) - it's the framework
3. **Clear out modules** - delete all modules and create your own
4. **Update translations** - replace with your bot's strings
5. **Update config files** - modify `config/` JSON files for your needs
6. **Update environment** - modify `configuration/environment.ts` for your env vars

The `core/` layer is designed to be **generic** and **reusable**. The module discovery, command registration, and event handling work without modification for any Discord bot following the same conventions.
