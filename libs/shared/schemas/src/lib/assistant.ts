import * as z from 'zod/mini';

export const ASSISTANT_CONTEXTS = [
  'home',
  'planner',
  'health',
  'english',
] as const;
export type AssistantContext = (typeof ASSISTANT_CONTEXTS)[number];

export const assistantRequestSchema = z.object({
  /** The conversation so far, oldest first; the last one is the user's new message. */
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().check(z.trim(), z.minLength(1), z.maxLength(4000)),
        /** For assistant messages: the tool log the server returned with it (its memory of what it did). */
        log: z.optional(z.string().check(z.maxLength(6000))),
      }),
    )
    .check(z.minLength(1), z.maxLength(30)),
  context: z.optional(z.enum(ASSISTANT_CONTEXTS)),
});
export type AssistantRequest = z.infer<typeof assistantRequestSchema>;

/** One thing the assistant did with a tool. */
export interface AssistantAction {
  tool: string;
  ok: boolean;
  /** read | create | update | delete */
  kind: string;
}

export interface AssistantReply {
  reply: string;
  actions: AssistantAction[];
  /** The tools called and what they returned, in short: send it back with this message next turn. */
  log?: string;
  /** True when something was changed: the page should reload its data. */
  changed: boolean;
}
