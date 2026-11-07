import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEEPGRAM_URL,
  ELEVENLABS_URL,
  type AiKind,
  type AiStatus,
} from '@all-in-one/shared/schemas';

/** One service's resolved config for a request (key decrypted, server side only). */
export interface AiTarget {
  endpoint: string;
  model: string;
  key: string | null;
  /** HTTP proxy url, or null for a direct connection. */
  proxy: string | null;
  /** Not OpenAI-compatible: `endpoint` is then the provider's base url (no /v1). */
  provider: AiProvider;
}

export type AiProvider = 'openai' | 'elevenlabs' | 'deepgram';

export interface AiTargets {
  chat: AiTarget | null;
  tts: (AiTarget & { model2: string }) | null;
  stt: AiTarget | null;
}

const PATHS = {
  chat: '/chat/completions',
  tts: '/audio/speech',
  stt: '/audio/transcriptions',
} as const;

/** `https://host/v1` or the full endpoint → the full endpoint. */
export function endpointFor(kind: keyof typeof PATHS, url: string): string {
  const path = PATHS[kind];
  const clean = url.trim().replace(/\/+$/, '');
  return clean.endsWith(path) ? clean : clean + path;
}

const DEFAULT_MODELS = { tts: 'tts-1', stt: 'whisper-1' };
/** ElevenLabs: the model field is the voice id for tts and the model id for stt. */
export const ELEVEN_DEFAULTS = {
  voice: '21m00Tcm4TlvDq8ikWAM',
  ttsModel: 'eleven_multilingual_v2',
  stt: 'scribe_v1',
};

/** Deepgram: the model field is the voice (tts) or the model (stt). */
export const DEEPGRAM_DEFAULTS = { voice: 'aura-2-thalia-en', stt: 'nova-3' };

/** The Deepgram base url, without a trailing /v1. */
export function deepgramBase(url: string | null | undefined): string {
  return (url?.trim() || DEEPGRAM_URL).replace(/\/+$/, '').replace(/\/v1$/, '');
}

/** The ElevenLabs base url, without a trailing /v1. */
export function elevenBase(url: string | null | undefined): string {
  return (url?.trim() || ELEVENLABS_URL)
    .replace(/\/+$/, '')
    .replace(/\/v1$/, '');
}

/** Reads only operator-managed configuration. Customer keys are never loaded. */
@Injectable()
export class AiSettingsService {
  constructor(private readonly config: ConfigService) {}

  status(): AiStatus {
    const targets = this.targets();
    return { chat: !!targets.chat, tts: !!targets.tts, stt: !!targets.stt };
  }

  targets(): AiTargets {
    const chat = this.configured('chat');
    const tts = this.configured('tts');
    const stt = this.configured('stt');
    return {
      chat,
      tts: tts && {
        ...tts,
        model2: this.setting('MANAGED_AI_TTS_SECONDARY_MODEL') || tts.model,
      },
      stt,
    };
  }

  private configured(kind: AiKind): AiTarget | null {
    const prefix = `MANAGED_AI_${kind.toUpperCase()}`;
    const url = this.setting(`${prefix}_URL`);
    const model = this.setting(`${prefix}_MODEL`);
    const key = this.setting(`${prefix}_KEY`) || null;
    const provider =
      kind === 'chat'
        ? 'openai'
        : this.setting(`${prefix}_PROVIDER`) || 'openai';
    const common = { key, proxy: null };
    switch (provider) {
      case 'elevenlabs':
        return key
          ? {
              ...common,
              endpoint: elevenBase(url),
              model:
                model ||
                (kind === 'tts' ? ELEVEN_DEFAULTS.voice : ELEVEN_DEFAULTS.stt),
              provider,
            }
          : null;
      case 'deepgram':
        return key
          ? {
              ...common,
              endpoint: deepgramBase(url),
              model:
                model ||
                (kind === 'tts'
                  ? DEEPGRAM_DEFAULTS.voice
                  : DEEPGRAM_DEFAULTS.stt),
              provider,
            }
          : null;
      case 'openai':
        if (!url || (kind === 'chat' && !model)) return null;
        return {
          ...common,
          endpoint: endpointFor(kind, url),
          model:
            model || (kind === 'tts' ? DEFAULT_MODELS.tts : DEFAULT_MODELS.stt),
          provider,
        };
      default:
        return null;
    }
  }

  private setting(name: string): string {
    return this.config.get<string>(name)?.trim() ?? '';
  }
}
