import type { PrismaService } from '@all-in-one/api/db';
import type { TrainingService } from '@all-in-one/applets/health/api';
import { ExerciseVideoUploadService } from './exercise-video-upload.service';

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn(),
  writeFile: vi.fn(),
  unlink: vi.fn().mockResolvedValue(undefined),
}));
import { mkdir, writeFile, unlink } from 'node:fs/promises';

const mp4 = Buffer.concat([
  Buffer.from([0, 0, 0, 20]),
  Buffer.from('ftypisom0000'),
]).toString('base64');
describe('exercise video upload', () => {
  const exercise = vi.fn().mockResolvedValue({ slug: 'squat' });
  const video = vi.fn().mockResolvedValue({ slug: 'squat' });
  const findUnique = vi.fn();
  const service = new ExerciseVideoUploadService(
    { exercise, video } as unknown as TrainingService,
    { user: { findUnique } } as unknown as PrismaService,
  );
  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockResolvedValue({ role: 'ADMIN' });
    video.mockResolvedValue({ slug: 'squat' });
  });
  it('stores the file and updates the catalog', async () => {
    const result = await service.upload('admin', 'squat', mp4);
    expect(result.videoUrl).toMatch(/^\/api\/exercise-videos\/squat-.*\.mp4$/);
    expect(mkdir).toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalledWith(
      expect.any(String),
      Buffer.from(mp4, 'base64'),
      { flag: 'wx', mode: 0o644 },
    );
    expect(video).toHaveBeenCalledWith('squat', result.videoUrl);
  });
  it('rejects non-admin users before writing', async () => {
    findUnique.mockResolvedValue({ role: 'USER' });
    await expect(service.upload('user', 'squat', mp4)).rejects.toThrow(
      'Admin access',
    );
    expect(writeFile).not.toHaveBeenCalled();
  });
  it.each(['../squat', '', 'SQUAT'])('rejects unsafe slug %s', async (slug) => {
    await expect(service.upload('admin', slug, mp4)).rejects.toThrow(
      'Invalid exercise slug',
    );
  });
  it.each([
    '!',
    '',
    Buffer.from('this is not an mp4').toString('base64'),
    Buffer.alloc(8 * 1024 * 1024 + 1).toString('base64'),
  ])('rejects invalid or oversized input %#', async (encoded) => {
    await expect(service.upload('admin', 'squat', encoded)).rejects.toThrow();
    expect(writeFile).not.toHaveBeenCalled();
  });
  it('removes the file when catalog update fails', async () => {
    video.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(service.upload('admin', 'squat', mp4)).rejects.toThrow(
      'database unavailable',
    );
    expect(unlink).toHaveBeenCalledWith(vi.mocked(writeFile).mock.calls[0][0]);
  });
});
