import {
  type BotConfig,
  type BotConfigKeys,
} from '@/modules/admin/schemas/BotConfig.js';
import { Model } from '@/modules/chat/schemas/Model.js';

export const DEFAULT_CONFIGURATION = {
  channels: undefined,
  crossposting: {
    channels: [],
    enabled: false,
  },
  errorWebhook: undefined,
  feedback: {
    enabled: true,
  },
  models: {
    embeddings: Model.BGE_M3_LOCAL,
    inference: Model.CLAUDE_SONNET_4_6,
  },
  roles: undefined,
  ticketing: {
    enabled: false,
    tickets: undefined,
  },
} as const satisfies BotConfig satisfies Record<BotConfigKeys, unknown>;
