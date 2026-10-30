import * as z from 'zod/mini';

/** What the browser sees of a user's AI service: never the key itself. */
export interface AiServiceView {
  url: string;
  model: string;
  hasKey: boolean;
}

export interface AiSettings {
  /** OpenAI-compatible chat completions (cards, texts, coach, assistant). */
  chat: AiServiceView;
  /** Text-to-speech; `model2` is the second voice of dialogues. */
  tts: AiServiceView & { model2: string };
  /** Speech-to-text (transcriptions). */
  stt: AiServiceView;
  ready: AiStatus;
}

export interface AiStatus {
  chat: boolean;
  tts: boolean;
  stt: boolean;
}

export const AI_KINDS = ['chat', 'tts', 'stt'] as const;
export type AiKind = (typeof AI_KINDS)[number];

/** A base url (…/v1) or the full endpoint; '' clears it. */
const url = z
  .string()
  .check(
    z.trim(),
    z.maxLength(500),
    z.regex(
      /^$|^https?:\/\/\S+$/i,
      'نشانی باید با http:// یا https:// شروع شود',
    ),
  );
const model = z.string().check(z.trim(), z.maxLength(100));
/** Omitted = keep the stored key; '' = remove it. */
const key = z.string().check(z.trim(), z.maxLength(500));

const service = z.partial(z.object({ url, model, key }));

export const updateAiSettingsSchema = z.partial(
  z.object({
    chat: service,
    tts: z.extend(service, { model2: z.optional(model) }),
    stt: service,
  }),
);
export type UpdateAiSettingsInput = z.infer<typeof updateAiSettingsSchema>;

export const testAiSchema = z.object({ kind: z.enum(AI_KINDS) });
export interface AiTestResult {
  ok: boolean;
  message: string;
}
