import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, type UserAiSettings } from '@all-in-one/api/db';
import type {
  AiSettings,
  AiStatus,
  UpdateAiSettingsInput,
} from '@all-in-one/shared/schemas';
import { SecretBox } from './secret-box';

/** One service's resolved config for a request (key decrypted, server side only). */
export interface AiTarget {
  endpoint: string;
  model: string;
  key: string | null;
}

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

/**
 * Each user's own OpenAI-compatible services. Nothing falls back to a
 * server-wide gateway: without a url, that AI feature is off for the user.
 */
@Injectable()
export class AiSettingsService {
  private readonly box: SecretBox;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.box = new SecretBox(
      config.get<string>('JWT_SECRET') ?? '',
      config.get<string>('AI_KEYS_SECRET'),
    );
  }

  private row(userId: string) {
    return this.prisma.userAiSettings.findUnique({ where: { userId } });
  }

  async view(userId: string): Promise<AiSettings> {
    const r = await this.row(userId);
    return {
      chat: {
        url: r?.chatUrl ?? '',
        model: r?.chatModel ?? '',
        hasKey: !!r?.chatKey,
      },
      tts: {
        url: r?.ttsUrl ?? '',
        model: r?.ttsModel ?? '',
        model2: r?.ttsModel2 ?? '',
        hasKey: !!r?.ttsKey,
      },
      stt: {
        url: r?.sttUrl ?? '',
        model: r?.sttModel ?? '',
        hasKey: !!r?.sttKey,
      },
      ready: status(r),
    };
  }

  async status(userId: string): Promise<AiStatus> {
    return status(await this.row(userId));
  }

  async update(
    userId: string,
    input: UpdateAiSettingsInput,
  ): Promise<AiSettings> {
    const data: Partial<Omit<UserAiSettings, 'userId' | 'updatedAt'>> = {};
    const put = (
      kind: 'chat' | 'tts' | 'stt',
      value: { url?: string; model?: string; key?: string } | undefined,
    ) => {
      if (!value) return;
      if (value.url !== undefined) data[`${kind}Url`] = value.url || null;
      if (value.model !== undefined) data[`${kind}Model`] = value.model || null;
      if (value.key !== undefined)
        data[`${kind}Key`] = value.key ? this.box.seal(value.key) : null;
    };
    put('chat', input.chat);
    put('tts', input.tts);
    put('stt', input.stt);
    if (input.tts?.model2 !== undefined)
      data.ttsModel2 = input.tts.model2 || null;
    await this.prisma.userAiSettings.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
    return this.view(userId);
  }

  /** Decrypted targets for the gateway; null where the user set nothing. */
  async targets(userId: string): Promise<AiTargets> {
    const r = await this.row(userId);
    return {
      chat:
        r?.chatUrl && r.chatModel
          ? {
              endpoint: endpointFor('chat', r.chatUrl),
              model: r.chatModel,
              key: this.box.open(r.chatKey),
            }
          : null,
      tts: r?.ttsUrl
        ? {
            endpoint: endpointFor('tts', r.ttsUrl),
            model: r.ttsModel || DEFAULT_MODELS.tts,
            model2: r.ttsModel2 || r.ttsModel || DEFAULT_MODELS.tts,
            key: this.box.open(r.ttsKey),
          }
        : null,
      stt: r?.sttUrl
        ? {
            endpoint: endpointFor('stt', r.sttUrl),
            model: r.sttModel || DEFAULT_MODELS.stt,
            key: this.box.open(r.sttKey),
          }
        : null,
    };
  }
}

function status(r: UserAiSettings | null): AiStatus {
  return {
    chat: !!(r?.chatUrl && r.chatModel),
    tts: !!r?.ttsUrl,
    stt: !!r?.sttUrl,
  };
}
