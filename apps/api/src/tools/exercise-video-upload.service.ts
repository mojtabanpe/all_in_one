import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { TrainingService } from '@all-in-one/applets/health/api';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * Stores approved exercise MP4 clips on a persistent server volume.
 * Set EXERCISE_VIDEO_DIR to a mounted persistent directory and
 * EXERCISE_VIDEO_PUBLIC_URL to its externally reachable base URL.
 */
@Injectable()
export class ExerciseVideoUploadService {
  constructor(private readonly training: TrainingService) {}

  async upload(slug: string, encoded: string) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug))
      throw new BadRequestException('Invalid exercise slug');
    await this.training.exercise(slug);

    const dir = process.env.EXERCISE_VIDEO_DIR;
    const base = process.env.EXERCISE_VIDEO_PUBLIC_URL;
    if (!dir || !base)
      throw new InternalServerErrorException('Exercise video storage is not configured');
    const url = new URL(base);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost')
      throw new InternalServerErrorException('Public video URL must use HTTPS');

    // MCP JSON uploads are deliberately capped at 8 MiB; larger clips should
    // use a dedicated streaming/presigned upload endpoint instead.
    if (encoded.length > Math.ceil(8 * 1024 * 1024 / 3) * 4 + 4 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))
      throw new BadRequestException('Invalid or oversized base64 MP4 (max 8 MiB)');
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.length < 12 || bytes.length > 8 * 1024 * 1024 ||
        bytes.toString('ascii', 4, 8) !== 'ftyp')
      throw new BadRequestException('Expected an MP4 file (max 8 MiB)');

    const filename = `${slug}-${randomUUID()}.mp4`;
    const file = resolve(dir, filename);
    await mkdir(dir, { recursive: true });
    await writeFile(file, bytes, { flag: 'wx', mode: 0o644 });
    const videoUrl = `${base.replace(/\/$/, '')}/${filename}`;
    try {
      const exercise = await this.training.video(slug, videoUrl);
      return { slug, videoUrl, bytes: bytes.length, exercise };
    } catch (error) {
      await unlink(file).catch(() => undefined);
      throw error;
    }
  }
}
