import { getCommonCommand } from '@/modules/chat/utils/chatCommand.js';

const { data, execute } = getCommonCommand('ask', {
  allowPrivate: true,
  allowReasoning: false,
});

export { data, execute };
export const name = 'ask';
