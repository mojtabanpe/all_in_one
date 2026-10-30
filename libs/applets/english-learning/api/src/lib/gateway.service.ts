import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SpeechVoice } from '@all-in-one/applets/english-learning/contracts';

export type ChatMessage = { role: 'system' | 'user'; content: string };

const DEFAULT_CHAT_URL = 'http://127.0.0.1:20128/v1/chat/completions';
const DEFAULT_SPEECH_URL = 'http://127.0.0.1:20128/v1/audio/speech';
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
export const MAX_RECORDING_BYTES = 1500 * 1024;
export const RECORDING_TYPES: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'mp4',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
};

/**
 * The 9Router gateway (as in Recall): chat completions, text-to-speech and
 * speech-to-text. Keys and models stay on the server; each feature reports
 * 503 when its key is not configured.
 */
@Injectable()
export class GatewayService {
  constructor(private readonly config: ConfigService) {}

  private env(name: string): string | undefined {
    return this.config.get<string>(name) || undefined;
  }

  get chatConfigured(): boolean {
    return !!(this.env('AI_API_KEY') ?? this.env('TTS_API_KEY'));
  }

  async chat(
    messages: ChatMessage[],
    temperature: number,
    timeout: number,
  ): Promise<string> {
    const endpoint = this.env('AI_URL') ?? DEFAULT_CHAT_URL;
    const model = this.env('AI_MODEL') ?? 'zaban';
    // Same gateway as speech, so its key is reused unless AI_API_KEY is set.
    const key = this.env('AI_API_KEY') ?? this.env('TTS_API_KEY');
    if (!key)
      throw new ServiceUnavailableException('هوش مصنوعی هنوز تنظیم نشده است.');
    const result = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + key,
      },
      body: JSON.stringify({ model, stream: false, temperature, messages }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!result.ok) throw new Error('Upstream AI request failed');
    const body = (await result.json()) as {
      choices?: { message?: { content?: unknown } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('Invalid AI response');
    return content;
  }

  /** Where speech for this voice comes from; also the audio cache key input. */
  speechTarget(voice: SpeechVoice): { endpoint: string; model: string } {
    return {
      endpoint: this.env('TTS_URL') ?? DEFAULT_SPEECH_URL,
      model:
        voice === 'secondary'
          ? (this.env('TTS_SECONDARY_MODEL') ?? 'edge-tts/en-US-EricNeural')
          : (this.env('TTS_MODEL') ?? 'edge-tts/en-US-MichelleNeural'),
    };
  }

  async speech(
    text: string,
    voice: SpeechVoice,
  ): Promise<{ audio: Buffer; contentType: string }> {
    const key = this.env('TTS_API_KEY');
    if (!key) throw new ServiceUnavailableException('تلفظ هنوز تنظیم نشده است.');
    const { endpoint, model } = this.speechTarget(voice);
    try {
      const result = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + key,
        },
        body: JSON.stringify({ model, input: text }),
        signal: AbortSignal.timeout(30000),
      });
      if (!result.ok) throw new Error('Upstream speech request failed');
      const contentType = result.headers.get('content-type') ?? '';
      if (!/^(audio\/|application\/octet-stream)/i.test(contentType))
        throw new Error('Invalid speech response');
      if (Number(result.headers.get('content-length')) > MAX_AUDIO_BYTES)
        throw new Error('Speech too large');
      const audio = Buffer.from(await result.arrayBuffer());
      if (!audio.length || audio.length > MAX_AUDIO_BYTES)
        throw new Error('Invalid speech size');
      return { audio, contentType };
    } catch {
      throw new BadGatewayException('پخش تلفظ ممکن نشد. دوباره امتحان کنید.');
    }
  }

  async transcribe(audio: unknown, contentType: string): Promise<string> {
    if (!Buffer.isBuffer(audio) || !audio.length)
      throw new BadRequestException('اول پاسخ را ضبط کنید.');
    if (audio.length > MAX_RECORDING_BYTES)
      throw new BadRequestException('ضبط خیلی طولانی است.');
    const mime = contentType.split(';')[0].trim();
    const extension = RECORDING_TYPES[mime];
    if (!extension) throw new BadRequestException('این قالب صدا پشتیبانی نمی‌شود.');
    const key =
      this.env('STT_API_KEY') ?? this.env('AI_API_KEY') ?? this.env('TTS_API_KEY');
    if (!key)
      throw new ServiceUnavailableException('تشخیص گفتار هنوز تنظیم نشده است.');
    const endpoint =
      this.env('STT_URL') ??
      new URL(
        'audio/transcriptions',
        (this.env('AI_URL') ?? this.env('TTS_URL') ?? DEFAULT_CHAT_URL).replace(
          /(?:chat\/completions|audio\/speech)$/,
          '',
        ),
      ).href;
    const form = new FormData();
    form.set('model', this.env('STT_MODEL') ?? 'dg/whisper-large');
    form.set(
      'file',
      new Blob([new Uint8Array(audio)], { type: mime }),
      'answer.' + extension,
    );
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key },
        body: form,
        signal: AbortSignal.timeout(90000),
      });
      if (!response.ok) throw new Error('Transcription failed');
      const result = (await response.json()) as { text?: unknown };
      if (typeof result.text !== 'string' || !result.text.trim())
        throw new Error('No speech recognized');
      return result.text.trim().slice(0, 3000);
    } catch {
      throw new BadGatewayException(
        'صدا تشخیص داده نشد. دوباره بگویید یا پاسخ را بنویسید.',
      );
    }
  }
}
