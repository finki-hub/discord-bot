export type StreamEvent =
  | { code: string; message: string; resets_at?: string; type: 'error' }
  | { label: string; state?: string; tool?: string; type: 'status' }
  | { text: string; type: 'thinking' }
  | { text: string; type: 'token' }
  | { type: 'done' }
  | { type: 'reset' };
