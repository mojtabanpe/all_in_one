import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type HealthFast as DbFast,
  type HealthWeightLog as DbWeight,
  PrismaService,
} from '@all-in-one/api/db';
import {
  daysFromTo,
  type EndFastInput,
  type Fast,
  type FastingState,
  type LogWeightInput,
  MAX_FAST_HOURS,
  type StartFastInput,
  tehranDate,
  type UpdateFastInput,
  type WeightEntry,
  type WeightGoalInput,
  weightPlan,
  type WeightProgress,
} from '@all-in-one/applets/health/contracts';

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const HOUR = 3_600_000;
/** A clock a minute ahead still counts as "now". */
const CLOCK_SKEW = 60_000;

function toWeight(w: DbWeight): WeightEntry {
  return { id: w.id, date: iso(w.date), weightKg: w.weightKg };
}

function toFast(f: DbFast): Fast {
  return {
    id: f.id,
    startedAt: f.startedAt.toISOString(),
    endedAt: f.endedAt?.toISOString() ?? null,
    targetHours: f.targetHours,
  };
}

/** Body tracking: weigh-ins, the dated weight goal and intermittent fasting. */
@Injectable()
export class BodyService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- weight ----------

  async weight(userId: string, now = new Date()): Promise<WeightProgress> {
    const [profile, logs] = await Promise.all([
      this.prisma.healthProfile.findUnique({ where: { userId } }),
      this.prisma.healthWeightLog.findMany({
        where: { userId },
        orderBy: { date: 'desc' },
        take: 60,
      }),
    ]);
    const currentKg = profile?.weightKg ?? logs[0]?.weightKg ?? null;
    const targetKg = profile?.targetWeightKg ?? null;
    const targetDate = profile?.targetDate ? iso(profile.targetDate) : null;
    const startKg = profile?.goalStartWeightKg ?? currentKg;
    return {
      currentKg,
      startKg: targetKg === null ? null : startKg,
      startDate: profile?.goalStartDate ? iso(profile.goalStartDate) : null,
      targetKg,
      targetDate,
      plan:
        currentKg !== null && startKg !== null && targetKg && targetDate
          ? weightPlan({
              currentKg,
              startKg,
              targetKg,
              today: tehranDate(now),
              targetDate,
            })
          : null,
      entries: logs.map(toWeight),
    };
  }

  /** Records a weigh-in; the latest one becomes the profile weight. */
  async logWeight(
    userId: string,
    input: LogWeightInput,
    now = new Date(),
  ): Promise<WeightProgress> {
    if (daysFromTo(tehranDate(now), input.date) > 0)
      throw new BadRequestException('وزن روزهای آینده را نمی‌شود ثبت کرد');
    const date = toDate(input.date);
    await this.prisma.$transaction(async (tx) => {
      await tx.healthWeightLog.upsert({
        where: { userId_date: { userId, date } },
        create: { userId, date, weightKg: input.weightKg },
        update: { weightKg: input.weightKg },
      });
      const latest = await tx.healthWeightLog.findFirst({
        where: { userId },
        orderBy: { date: 'desc' },
      });
      if (latest && latest.date.getTime() === date.getTime())
        await tx.healthProfile.upsert({
          where: { userId },
          create: { userId, weightKg: input.weightKg },
          update: { weightKg: input.weightKg },
        });
    });
    return this.weight(userId, now);
  }

  async removeWeight(
    userId: string,
    id: string,
    now = new Date(),
  ): Promise<WeightProgress> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.healthWeightLog.deleteMany({
        where: { id, userId },
      });
      if (!count) throw new NotFoundException('وزن پیدا نشد');
      const latest = await tx.healthWeightLog.findFirst({
        where: { userId },
        orderBy: { date: 'desc' },
      });
      if (latest)
        await tx.healthProfile.updateMany({
          where: { userId },
          data: { weightKg: latest.weightKg },
        });
    });
    return this.weight(userId, now);
  }

  /**
   * Sets (or clears) the weight goal. The current weight and today become the
   * starting point, and the goal direction follows the target.
   */
  async setGoal(
    userId: string,
    input: WeightGoalInput,
    now = new Date(),
  ): Promise<WeightProgress> {
    const today = tehranDate(now);
    if (input.targetWeightKg === null || input.targetDate === null) {
      await this.prisma.healthProfile.updateMany({
        where: { userId },
        data: {
          targetWeightKg: null,
          targetDate: null,
          goalStartWeightKg: null,
          goalStartDate: null,
        },
      });
      return this.weight(userId, now);
    }
    const days = daysFromTo(today, input.targetDate);
    if (days < 7)
      throw new BadRequestException('تاریخ هدف باید دست‌کم یک هفته بعد باشد');
    if (days > 730)
      throw new BadRequestException(
        'تاریخ هدف حداکثر دو سال بعد می‌تواند باشد',
      );
    const profile = await this.prisma.healthProfile.findUnique({
      where: { userId },
      select: { weightKg: true },
    });
    if (!profile?.weightKg)
      throw new BadRequestException('اول وزن فعلی‌ات را ثبت کن');
    const target = input.targetWeightKg;
    const data = {
      targetWeightKg: target,
      targetDate: toDate(input.targetDate),
      goalStartWeightKg: profile.weightKg,
      goalStartDate: toDate(today),
      goal:
        target < profile.weightKg
          ? ('LOSE' as const)
          : target > profile.weightKg
            ? ('GAIN' as const)
            : ('MAINTAIN' as const),
    };
    await this.prisma.healthProfile.update({ where: { userId }, data });
    return this.weight(userId, now);
  }

  // ---------- fasting ----------

  async fasting(userId: string): Promise<FastingState> {
    const [active, recent] = await Promise.all([
      this.prisma.healthFast.findFirst({
        where: { userId, endedAt: null },
        orderBy: { startedAt: 'desc' },
      }),
      this.prisma.healthFast.findMany({
        where: { userId, endedAt: { not: null } },
        orderBy: { startedAt: 'desc' },
        take: 14,
      }),
    ]);
    return {
      active: active ? toFast(active) : null,
      recent: recent.map(toFast),
    };
  }

  async startFast(
    userId: string,
    input: StartFastInput,
    now = new Date(),
  ): Promise<FastingState> {
    const startedAt = input.startedAt ? new Date(input.startedAt) : now;
    this.checkStart(startedAt, now);
    const running = await this.prisma.healthFast.findFirst({
      where: { userId, endedAt: null },
      select: { id: true },
    });
    if (running) throw new ConflictException('یک فستینگ در جریان است');
    await this.prisma.healthFast.create({
      data: { userId, startedAt, targetHours: input.targetHours },
    });
    return this.fasting(userId);
  }

  /** Ends the running fast. */
  async endFast(
    userId: string,
    input: EndFastInput,
    now = new Date(),
  ): Promise<FastingState> {
    const running = await this.prisma.healthFast.findFirst({
      where: { userId, endedAt: null },
    });
    if (!running) throw new NotFoundException('فستینگی در جریان نیست');
    const endedAt = input.endedAt ? new Date(input.endedAt) : now;
    this.checkEnd(running.startedAt, endedAt, now);
    await this.prisma.healthFast.update({
      where: { id: running.id },
      data: { endedAt },
    });
    return this.fasting(userId);
  }

  async updateFast(
    userId: string,
    id: string,
    input: UpdateFastInput,
    now = new Date(),
  ): Promise<FastingState> {
    const fast = await this.prisma.healthFast.findFirst({
      where: { id, userId },
    });
    if (!fast) throw new NotFoundException('فستینگ پیدا نشد');
    const startedAt = input.startedAt
      ? new Date(input.startedAt)
      : fast.startedAt;
    let endedAt = fast.endedAt;
    if (input.endedAt !== undefined)
      endedAt = input.endedAt ? new Date(input.endedAt) : null;
    const reopened = !endedAt && !!fast.endedAt;
    if (input.startedAt || reopened) this.checkStart(startedAt, now, !!endedAt);
    if (endedAt) this.checkEnd(startedAt, endedAt, now);
    if (reopened) {
      const running = await this.prisma.healthFast.findFirst({
        where: { userId, endedAt: null },
        select: { id: true },
      });
      if (running) throw new ConflictException('یک فستینگ در جریان است');
    }
    await this.prisma.healthFast.update({
      where: { id },
      data: { startedAt, endedAt, targetHours: input.targetHours },
    });
    return this.fasting(userId);
  }

  async removeFast(userId: string, id: string): Promise<FastingState> {
    const { count } = await this.prisma.healthFast.deleteMany({
      where: { id, userId },
    });
    if (!count) throw new NotFoundException('فستینگ پیدا نشد');
    return this.fasting(userId);
  }

  /** A running fast started at most 72 hours ago; a finished one within 90 days. */
  private checkStart(startedAt: Date, now: Date, finished = false) {
    if (startedAt.getTime() > now.getTime() + CLOCK_SKEW)
      throw new BadRequestException('شروع فستینگ نمی‌تواند در آینده باشد');
    const limit = finished ? 90 * 24 * HOUR : MAX_FAST_HOURS * HOUR;
    if (now.getTime() - startedAt.getTime() > limit)
      throw new BadRequestException(
        finished
          ? 'فقط فستینگ‌های ۹۰ روز اخیر ویرایش می‌شوند'
          : 'شروع فستینگ حداکثر ۷۲ ساعت پیش می‌تواند باشد',
      );
  }

  private checkEnd(startedAt: Date, endedAt: Date, now: Date) {
    if (endedAt.getTime() > now.getTime() + CLOCK_SKEW)
      throw new BadRequestException('پایان فستینگ نمی‌تواند در آینده باشد');
    if (endedAt <= startedAt)
      throw new BadRequestException('پایان باید بعد از شروع باشد');
  }
}
