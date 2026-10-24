export type StreamEvent =
  | { code: string; message: string; resets_at?: string; type: 'error' }
  | { id: string; label: string; name: string; type: 'tool_call' }
  | {
      id: string;
      name: string;
      ok: boolean;
      summary: string;
      type: 'tool_result';
    }
  | { label: string; state?: string; tool?: string; type: 'status' }
  | { text: string; type: 'thinking' }
  | { text: string; type: 'token' }
  | { type: 'done' }
  | { type: 'reset' };
