import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService, type UserAiSettings } from '@all-in-one/api/db';
import { SecretBox } from './secret-box';
import {
  AI_PRESETS_LIMIT,
  SAVED_MODELS_LIMIT,
  DEFAULT_AI_PROXY,
  DEEPGRAM_URL,
  ELEVENLABS_URL,
  type AiKind,
  type AiStatus,
  type AiSettings,
  type AiPresetView,
  type UpdateAiSettingsInput,
  type SaveAiPresetInput,
  type AiScopeSettings,
} from '@all-in-one/shared/schemas';

/** The stored managed configuration: the old per-user columns plus the scope check. */
type ManagedSettings = Partial<UserAiSettings> & {
  scopeOn?: boolean;
  scopeModel?: string | null;
};

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
  private readonly box: SecretBox;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.box = new SecretBox(
      config.get<string>('JWT_SECRET') ?? '',
      config.get<string>('AI_KEYS_SECRET'),
    );
  }

  private async row(): Promise<ManagedSettings | undefined> {
    const stored = await this.prisma.managedAiConfiguration.findUnique({
      where: { id: 1 },
    });
    return stored?.settings as ManagedSettings | undefined;
  }

  /** The scope check: on unless an admin switched it off; '' model = the chat model. */
  async scope(): Promise<AiScopeSettings> {
    const r = await this.row();
    return { on: r?.scopeOn !== false, model: r?.scopeModel ?? '' };
  }

  async view(): Promise<AiSettings> {
    const r = await this.row();
    return {
      chat: {
        url: r?.chatUrl ?? '',
        model: r?.chatModel ?? '',
        hasKey: !!r?.chatKey,
        ...proxyView(r, 'chat'),
      },
      tts: {
        url: r?.ttsUrl ?? '',
        model: r?.ttsModel ?? '',
        model2: r?.ttsModel2 ?? '',
        hasKey: !!r?.ttsKey,
        ...proxyView(r, 'tts'),
      },
      stt: {
        url: r?.sttUrl ?? '',
        model: r?.sttModel ?? '',
        hasKey: !!r?.sttKey,
        ...proxyView(r, 'stt'),
      },
      ready: await this.status(),
      presets: await this.presets(r),
      scope: await this.scope(),
      savedModels: {
        chat: remember(r?.chatModels ?? [], [r?.chatModel]),
        tts: remember(r?.ttsModels ?? [], [r?.ttsModel, r?.ttsModel2]),
        stt: remember(r?.sttModels ?? [], [r?.sttModel]),
      },
    };
  }

  private async presets(
    current?: Partial<UserAiSettings>,
  ): Promise<AiPresetView[]> {
    const rows = await this.prisma.managedAiPreset.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((p) => {
      const kind = p.kind as AiKind;
      const currentKey = current?.[`${kind}Key`];
      const presetKey = this.box.open(p.key);
      const sameKey = p.key
        ? presetKey !== null && presetKey === this.box.open(currentKey)
        : !currentKey;
      const currentProxy = current?.[`${kind}ProxyOn`]
        ? current[`${kind}Proxy`] || DEFAULT_AI_PROXY
        : null;
      const active =
        !!current &&
        sameKey &&
        (current[`${kind}Url`] ?? '') === p.url &&
        (current[`${kind}Model`] ?? '') === p.model &&
        currentProxy === p.proxy &&
        (kind !== 'tts' || (current.ttsModel2 ?? null) === p.model2) &&
        (kind === 'chat' ||
          (!!current[`${kind}Eleven`] === p.elevenlabs &&
            !!current[`${kind}Deepgram`] === p.deepgram));

      return {
        id: p.id,
        kind,
        active,
        url: p.url,
        model: p.model,
        model2: p.model2 ?? '',
        keyHint: p.key ? '••••' : '',
        proxy: p.proxy ?? '',
        elevenlabs: p.elevenlabs,
        deepgram: p.deepgram,
        createdAt: p.createdAt.toISOString(),
      };
    });
  }

  /** Store a section's setup as a new row (an identical one is just moved to the top). */
  async savePreset(input: SaveAiPresetInput): Promise<AiSettings> {
    const current = await this.row();
    const key = input.key
      ? input.key
      : this.box.open(current?.[`${input.kind}Key`]);
    const model2 = input.kind === 'tts' ? input.model2 || null : null;
    const proxy = input.proxy || null;
    const elevenlabs = input.kind !== 'chat' && !!input.elevenlabs;
    const deepgram = input.kind !== 'chat' && !elevenlabs && !!input.deepgram;
    const same = (
      await this.prisma.managedAiPreset.findMany({
        where: {
          kind: input.kind,
          url: input.url,
          model: input.model,
          model2,
          proxy,
          elevenlabs,
          deepgram,
        },
      })
    ).find((p) => (this.box.open(p.key) ?? null) === (key ?? null));
    if (same)
      await this.prisma.managedAiPreset.update({
        where: { id: same.id },
        data: { createdAt: new Date() },
      });
    else
      await this.prisma.managedAiPreset.create({
        data: {
          kind: input.kind,
          url: input.url,
          model: input.model,
          model2,
          proxy,
          elevenlabs,
          deepgram,
          key: key ? this.box.seal(key) : null,
        },
      });
    // Keep the newest AI_PRESETS_LIMIT per service.
    const old = await this.prisma.managedAiPreset.findMany({
      where: { kind: input.kind },
      orderBy: { createdAt: 'desc' },
      skip: AI_PRESETS_LIMIT,
      select: { id: true },
    });
    if (old.length)
      await this.prisma.managedAiPreset.deleteMany({
        where: { id: { in: old.map((o) => o.id) } },
      });
    return this.view();
  }

  /** Make a saved setup the current one for its service, key included. */
  async applyPreset(id: string): Promise<AiSettings> {
    const p = await this.prisma.managedAiPreset.findFirst({
      where: { id },
    });
    if (!p) throw new NotFoundException();
    const kind = p.kind as AiKind;
    return this.update(
      {
        [kind]: {
          url: p.url,
          model: p.model,
          ...(kind === 'tts' ? { model2: p.model2 ?? '' } : {}),
          proxy: !!p.proxy,
          ...(kind !== 'chat'
            ? { elevenlabs: p.elevenlabs, deepgram: p.deepgram }
            : {}),
          ...(p.proxy ? { proxyUrl: p.proxy } : {}),
        },
      },
      { kind, key: p.key },
    );
  }

  async removePreset(id: string): Promise<AiSettings> {
    await this.prisma.managedAiPreset.deleteMany({ where: { id } });
    return this.view();
  }

  async update(
    input: UpdateAiSettingsInput,
    preset?: { kind: AiKind; key: string | null },
  ): Promise<AiSettings> {
    const data: Omit<ManagedSettings, 'userId' | 'updatedAt'> = {};
    if (input.scope?.on !== undefined) data.scopeOn = input.scope.on;
    if (input.scope?.model !== undefined)
      data.scopeModel = input.scope.model || null;
    const put = (
      kind: 'chat' | 'tts' | 'stt',
      value:
        | {
            url?: string;
            model?: string;
            key?: string;
            proxy?: boolean;
            proxyUrl?: string;
            elevenlabs?: boolean;
            deepgram?: boolean;
          }
        | undefined,
    ) => {
      if (!value) return;
      if (value.url !== undefined) data[`${kind}Url`] = value.url || null;
      if (value.model !== undefined) data[`${kind}Model`] = value.model || null;
      if (value.key !== undefined)
        data[`${kind}Key`] = value.key ? this.box.seal(value.key) : null;
      if (value.proxy !== undefined) data[`${kind}ProxyOn`] = value.proxy;
      if (kind !== 'chat') {
        // One provider at a time: ticking one clears the other.
        if (value.deepgram !== undefined) {
          data[`${kind}Deepgram`] = value.deepgram;
          if (value.deepgram) data[`${kind}Eleven`] = false;
        }
        if (value.elevenlabs !== undefined) {
          data[`${kind}Eleven`] = value.elevenlabs;
          if (value.elevenlabs) data[`${kind}Deepgram`] = false;
        }
      }
      if (value.proxyUrl !== undefined)
        data[`${kind}Proxy`] = value.proxyUrl || null;
    };
    put('chat', input.chat);
    put('tts', input.tts);
    put('stt', input.stt);
    if (input.tts?.model2 !== undefined)
      data.ttsModel2 = input.tts.model2 || null;
    // Remember the old and new model names, so a change is never a loss.
    const old = await this.row();
    for (const kind of ['chat', 'tts', 'stt'] as const) {
      if (!input[kind] && input.forgetModel?.kind !== kind) continue;
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
    if (preset) data[`${preset.kind}Key`] = preset.key;
    // Merge only the submitted section and keep other sections intact.
    await this.prisma.$executeRaw`
      INSERT INTO managed_ai_configuration (id, settings)
      VALUES (1, ${JSON.stringify(data)}::jsonb)
      ON CONFLICT (id) DO UPDATE
      SET settings = managed_ai_configuration.settings || EXCLUDED.settings
    `;
    return this.view();
  }

  async status(): Promise<AiStatus> {
    const targets = await this.targets();
    return { chat: !!targets.chat, tts: !!targets.tts, stt: !!targets.stt };
  }

  async targets(): Promise<AiTargets> {
    const settings = await this.row();
    const chat = settings
      ? this.imported(settings, 'chat')
      : this.configured('chat');
    const tts = settings
      ? this.imported(settings, 'tts')
      : this.configured('tts');
    const stt = settings
      ? this.imported(settings, 'stt')
      : this.configured('stt');
    return {
      chat,
      tts: tts && {
        ...tts,
        model2:
          (settings
            ? settings.ttsModel2
            : this.setting('MANAGED_AI_TTS_SECONDARY_MODEL')) || tts.model,
      },
      stt,
    };
  }

  private imported(
    settings: Partial<UserAiSettings> | undefined,
    kind: AiKind,
  ): AiTarget | null {
    if (!settings) return null;
    const url = settings[`${kind}Url`];
    const model = settings[`${kind}Model`];
    const sealed = settings[`${kind}Key`];
    const key = this.box.open(sealed);
    if (sealed && !key) return null;
    const common = {
      key,
      proxy: settings[`${kind}ProxyOn`]
        ? settings[`${kind}Proxy`] || DEFAULT_AI_PROXY
        : null,
    };
    if (kind !== 'chat' && settings[`${kind}Deepgram`]) {
      return key
        ? {
            ...common,
            provider: 'deepgram',
            endpoint: deepgramBase(url),
            model:
              model ||
              (kind === 'tts'
                ? DEEPGRAM_DEFAULTS.voice
                : DEEPGRAM_DEFAULTS.stt),
          }
        : null;
    }
    if (kind !== 'chat' && settings[`${kind}Eleven`]) {
      return key
        ? {
            ...common,
            provider: 'elevenlabs',
            endpoint: elevenBase(url),
            model:
              model ||
              (kind === 'tts' ? ELEVEN_DEFAULTS.voice : ELEVEN_DEFAULTS.stt),
          }
        : null;
    }
    return url && (kind !== 'chat' || model)
      ? {
          ...common,
          provider: 'openai',
          endpoint: endpointFor(kind, url),
          model:
            model || (kind === 'tts' ? DEFAULT_MODELS.tts : DEFAULT_MODELS.stt),
        }
      : null;
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

function proxyView(r: Partial<UserAiSettings> | undefined, kind: AiKind) {
  return {
    elevenlabs: kind !== 'chat' && !!r?.[`${kind}Eleven`],
    deepgram: kind !== 'chat' && !!r?.[`${kind}Deepgram`],
    proxy: !!r?.[`${kind}ProxyOn`],
    proxyUrl: r?.[`${kind}Proxy`] || DEFAULT_AI_PROXY,
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
