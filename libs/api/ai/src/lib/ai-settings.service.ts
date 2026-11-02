import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, type UserAiSettings } from '@all-in-one/api/db';
import type {
  AiSettings,
  AiStatus,
  UpdateAiSettingsInput,
} from '@all-in-one/shared/schemas';
import {
  AI_PRESETS_LIMIT,
  type AiKind,
  type AiPresetView,
  SAVED_MODELS_LIMIT,
  type SaveAiPresetInput,
} from '@all-in-one/shared/schemas';
import { NotFoundException } from '@nestjs/common';
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
      presets: await this.presets(userId),
      savedModels: {
        chat: remember(r?.chatModels ?? [], [r?.chatModel]),
        tts: remember(r?.ttsModels ?? [], [r?.ttsModel, r?.ttsModel2]),
        stt: remember(r?.sttModels ?? [], [r?.sttModel]),
      },
    };
  }

  private async presets(userId: string): Promise<AiPresetView[]> {
    const rows = await this.prisma.userAiPreset.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((p) => {
      const key = this.box.open(p.key);
      return {
        id: p.id,
        kind: p.kind as AiKind,
        url: p.url,
        model: p.model,
        model2: p.model2 ?? '',
        keyHint: key ? `…${key.slice(-4)}` : '',
        createdAt: p.createdAt.toISOString(),
      };
    });
  }

  /** Store a section's setup as a new row (an identical one is just moved to the top). */
  async savePreset(
    userId: string,
    input: SaveAiPresetInput,
  ): Promise<AiSettings> {
    const current = await this.row(userId);
    const key = input.key
      ? input.key
      : this.box.open(current?.[`${input.kind}Key`]);
    const model2 = input.kind === 'tts' ? input.model2 || null : null;
    const same = (
      await this.prisma.userAiPreset.findMany({
        where: {
          userId,
          kind: input.kind,
          url: input.url,
          model: input.model,
          model2,
        },
      })
    ).find((p) => (this.box.open(p.key) ?? null) === (key ?? null));
    if (same)
      await this.prisma.userAiPreset.update({
        where: { id: same.id },
        data: { createdAt: new Date() },
      });
    else
      await this.prisma.userAiPreset.create({
        data: {
          userId,
          kind: input.kind,
          url: input.url,
          model: input.model,
          model2,
          key: key ? this.box.seal(key) : null,
        },
      });
    // Keep the newest AI_PRESETS_LIMIT per service.
    const old = await this.prisma.userAiPreset.findMany({
      where: { userId, kind: input.kind },
      orderBy: { createdAt: 'desc' },
      skip: AI_PRESETS_LIMIT,
      select: { id: true },
    });
    if (old.length)
      await this.prisma.userAiPreset.deleteMany({
        where: { id: { in: old.map((o) => o.id) } },
      });
    return this.view(userId);
  }

  /** Make a saved setup the current one for its service, key included. */
  async applyPreset(userId: string, id: string): Promise<AiSettings> {
    const p = await this.prisma.userAiPreset.findFirst({
      where: { id, userId },
    });
    if (!p) throw new NotFoundException();
    const kind = p.kind as AiKind;
    await this.update(userId, {
      [kind]: {
        url: p.url,
        model: p.model,
        ...(kind === 'tts' ? { model2: p.model2 ?? '' } : {}),
      },
    });
    // The key is copied sealed, without passing through plain text.
    await this.prisma.userAiSettings.update({
      where: { userId },
      data: { [`${kind}Key`]: p.key },
    });
    return this.view(userId);
  }

  async removePreset(userId: string, id: string): Promise<AiSettings> {
    await this.prisma.userAiPreset.deleteMany({ where: { id, userId } });
    return this.view(userId);
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
    // Remember the old and new model names, so a change is never a loss.
    const old = await this.row(userId);
    for (const kind of ['chat', 'tts', 'stt'] as const) {
      const used = [
        old?.[`${kind}Model`],
        ...(kind === 'tts' ? [old?.ttsModel2] : []),
        input[kind]?.model,
        ...(kind === 'tts' ? [input.tts?.model2] : []),
      ];
      let list = remember(old?.[`${kind}Models`] ?? [], used.reverse());
      if (input.forgetModel?.kind === kind)
        list = list.filter((m) => m !== input.forgetModel?.model);
      data[`${kind}Models`] = list;
    }
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

/** Most recent first, unique, non-empty, at most SAVED_MODELS_LIMIT. */
function remember(
  list: readonly string[],
  recent: readonly (string | null | undefined)[],
): string[] {
  const out: string[] = [];
  for (const m of [...recent, ...list]) {
    const v = m?.trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out.slice(0, SAVED_MODELS_LIMIT);
}
