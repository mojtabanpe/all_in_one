import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@all-in-one/api/db';
import {
  buildRoutine,
  trainingProgress,
  type Exercise,
  type ExerciseFilter,
  type GenerateRoutineInput,
  type LogSessionInput,
  type RoutineDay,
  type SaveRoutineInput,
  type WorkoutRoutine,
} from '@all-in-one/applets/health/contracts';
import { HealthService } from './health.service';
import { TRX_GUIDES } from './trx-catalog';

const GUIDANCE = {
  warmup: [
    '۳ تا ۵ دقیقه راه رفتن آرام و حرکت کنترل‌شده مفاصل.',
    'یک ست سبک از حرکات جلسه؛ اتصال TRX یا کش را بررسی کنید.',
  ],
  cooldown: [
    '۲ تا ۳ دقیقه راه رفتن آرام و تنفس طبیعی.',
    'کشش ملایم عضلات تمرین‌کرده بدون فشار یا درد.',
  ],
  progression: [
    'هفته اول: با دامنه راحت و سبک شروع کنید؛ ۲ تکرار در توان باقی بگذارید.',
    'هفته‌های بعد: اگر همه ست‌ها با فرم مناسب کامل شد، ابتدا ۱ تکرار اضافه کنید؛ سپس کمترین افزایش وزنه در دسترس.',
    'هر چهارمین هفته: یک ست کمتر در هر حرکت؛ افزایش بار اجباری نیست.',
    'جلسات قدرتی را در روزهای غیرمتوالی یا با حداقل ۴۸ ساعت فاصله برای عضلات مشترک بچینید.',
  ],
};
const day = (date: Date) => date.toISOString().slice(0, 10);
@Injectable()
export class TrainingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly health: HealthService,
  ) {}

  async exercises(filter: ExerciseFilter = {}): Promise<Exercise[]> {
    const rows = await this.prisma.healthExercise.findMany({
      where: {
        equipment: filter.equipment,
        muscle: filter.muscle,
        level: filter.level,
        ...(filter.search
          ? {
              OR: [
                { name: { contains: filter.search, mode: 'insensitive' } },
                { slug: { contains: filter.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      take: 200,
    });
    return rows.map((row) => ({
      ...row,
      guide: TRX_GUIDES[row.slug],
    })) as Exercise[];
  }
  async exercise(slug: string): Promise<Exercise> {
    const row = await this.prisma.healthExercise.findUnique({
      where: { slug },
    });
    if (!row) throw new NotFoundException('حرکت پیدا نشد');
    return { ...row, guide: TRX_GUIDES[row.slug] } as Exercise;
  }
  async video(slug: string, videoUrl: string | null): Promise<Exercise> {
    await this.exercise(slug);
    const row = await this.prisma.healthExercise.update({
      where: { slug },
      data: { videoUrl },
    });
    return { ...row, guide: TRX_GUIDES[row.slug] } as Exercise;
  }
  async alternatives(
    slug: string,
    equipment?: ExerciseFilter['equipment'],
  ): Promise<Exercise[]> {
    const source = await this.exercise(slug);
    return (await this.exercises({ muscle: source.muscle, equipment })).filter(
      (e) => e.slug !== slug,
    );
  }
  async routines(userId: string): Promise<WorkoutRoutine[]> {
    const rows = await this.prisma.healthRoutine.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toRoutine(r));
  }
  async routine(userId: string, id: string): Promise<WorkoutRoutine> {
    const row = await this.prisma.healthRoutine.findFirst({
      where: { id, userId },
    });
    if (!row) throw new NotFoundException('برنامه پیدا نشد');
    return this.toRoutine(row);
  }
  private toRoutine(row: {
    id: string;
    title: string;
    goal: string;
    level: string;
    equipment: string[];
    daysPerWeek: number;
    weeks: number;
    minutes: number;
    days: unknown;
  }): WorkoutRoutine {
    return {
      id: row.id,
      title: row.title,
      goal: row.goal as WorkoutRoutine['goal'],
      level: row.level as WorkoutRoutine['level'],
      equipment: row.equipment as WorkoutRoutine['equipment'],
      daysPerWeek: row.daysPerWeek,
      weeks: row.weeks,
      minutes: row.minutes,
      days: row.days as RoutineDay[],
      ...GUIDANCE,
    };
  }
  async generate(
    userId: string,
    input: GenerateRoutineInput,
  ): Promise<WorkoutRoutine> {
    let days: RoutineDay[];
    try {
      days = buildRoutine(input, await this.exercises());
    } catch (e) {
      throw new BadRequestException(
        e instanceof Error ? e.message : 'ساخت برنامه ممکن نیست',
      );
    }
    return this.save(userId, { ...input, days });
  }
  async save(
    userId: string,
    input: SaveRoutineInput,
    id?: string,
  ): Promise<WorkoutRoutine> {
    if (id) await this.routine(userId, id);
    const catalog = await this.exercises();
    for (const session of input.days)
      for (const item of session.exercises) {
        const exercise = catalog.find((e) => e.slug === item.exerciseSlug);
        if (!exercise || !input.equipment.includes(exercise.equipment))
          throw new BadRequestException(
            'حرکت یا تجهیزات با برنامه سازگار نیست',
          );
        if (exercise.timed && !item.seconds)
          throw new BadRequestException('برای حرکت زمانی، مدت را وارد کنید');
      }
    const data = { ...input, days: input.days as object[] };
    const row = id
      ? await this.prisma.healthRoutine.update({ where: { id }, data })
      : await this.prisma.healthRoutine.create({ data: { userId, ...data } });
    return this.toRoutine(row);
  }
  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.healthRoutine.deleteMany({
      where: { id, userId },
    });
    if (!count) throw new NotFoundException('برنامه پیدا نشد');
  }
  async logSession(userId: string, input: LogSessionInput) {
    const routine = await this.routine(userId, input.routineId);
    const session = routine.days[input.dayIndex];
    if (!session) throw new BadRequestException('جلسه در برنامه وجود ندارد');
    if (
      input.sets.some(
        (s) =>
          !session.exercises.some((e) => e.exerciseSlug === s.exerciseSlug),
      )
    )
      throw new BadRequestException('حرکت ثبت‌شده در این جلسه نیست');
    const activitySlug = routine.equipment.includes('trx')
      ? 'trx'
      : routine.equipment.some((e) =>
            ['machine', 'barbell', 'cable'].includes(e),
          )
        ? 'gym'
        : 'home-workout';
    // A single create persists both the summary and its actual sets atomically.
    const row = await this.prisma.workoutLog.create({
      data: {
        userId,
        activitySlug,
        routineId: routine.id,
        date: new Date(`${input.date}T00:00:00Z`),
        durationMin: input.durationMin,
        completedSets: input.sets as object[],
        notes: input.notes ?? null,
      },
    });
    return (
      await this.health.workouts(userId, day(row.date), day(row.date))
    ).find((w) => w.id === row.id)!;
  }
  async progress(userId: string, from: string, to: string) {
    const span = (Date.parse(to) - Date.parse(from)) / 86400000;
    if (span < 0 || span > 92)
      throw new BadRequestException('بازه باید حداکثر ۹۲ روز باشد');
    const [logs, exercises] = await Promise.all([
      this.health.workouts(userId, from, to),
      this.exercises(),
    ]);
    return trainingProgress(
      logs.map((l) => ({
        ...l,
        routineId: l.routineId ?? null,
        completedSets: l.completedSets ?? [],
      })),
      exercises,
      from,
      to,
    );
  }
}
