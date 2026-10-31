import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '@all-in-one/api/db';
import type { HealthService } from './health.service';
import { TrainingService } from './training.service';
import { EXERCISES } from './exercise-catalog';
import { TRX_GUIDES } from './trx-catalog';
import {
  buildRoutine,
  type GenerateRoutineInput,
} from '@all-in-one/applets/health/contracts';

describe('training owner isolation and catalog', () => {
  it('covers every supplied TRX illustration and keeps the two lunge variants distinct', () => {
    const trx = EXERCISES.filter((e) => e.equipment === 'trx');
    expect(trx).toHaveLength(32);
    expect(Object.keys(TRX_GUIDES)).toHaveLength(30);
    expect(trx.filter((e) => e.guide?.kind === 'stretch')).toHaveLength(6);
    expect(trx.find((e) => e.slug === 'trx-lunge')?.guide).toBeUndefined();
    expect(
      trx.find((e) => e.slug === 'trx-suspended-lunge')?.guide,
    ).toBeDefined();
    for (const slug of Object.keys(TRX_GUIDES)) {
      const exercise = trx.find((e) => e.slug === slug);
      expect(exercise?.guide?.imageUrl).toBe(`assets/trx/${slug}.webp`);
      expect(exercise?.timed).toBe(Boolean(exercise?.guide?.seconds));
    }
  });
  it('attaches illustration guidance to database catalog and detail responses', async () => {
    const { guide, ...row } = EXERCISES.find((e) => e.slug === 'trx-squat')!;
    const service = new TrainingService(
      {
        healthExercise: {
          findMany: vi.fn().mockResolvedValue([row]),
          findUnique: vi.fn().mockResolvedValue(row),
        },
      } as unknown as PrismaService,
      {} as HealthService,
    );
    expect((await service.exercises())[0].guide).toEqual(guide);
    expect((await service.exercise(row.slug)).guide).toEqual(guide);
  });
  const input: GenerateRoutineInput = {
    title: 'من',
    goal: 'fitness',
    equipment: ['trx', 'bodyweight'],
    level: 'beginner',
    daysPerWeek: 3,
    weeks: 4,
    minutes: 30,
  };
  it('has complete original instructions and valid alternatives for every exercise', () => {
    const slugs = new Set(EXERCISES.map((e) => e.slug));
    expect(slugs.size).toBe(EXERCISES.length);
    for (const exercise of EXERCISES) {
      expect(exercise.instructions.length).toBeGreaterThanOrEqual(3);
      expect(exercise.mistakes.length).toBeGreaterThan(0);
      if (exercise.videoUrl)
        expect(exercise.videoUrl).toMatch(
          /^https:\/\/www\.(aparat\.com\/v|youtube\.com\/watch\?v=)/,
        );
      for (const slug of exercise.alternatives)
        expect(slugs.has(slug)).toBe(true);
    }
    for (const equipment of [
      ['bodyweight'],
      ['trx', 'bodyweight'],
      ['machine', 'dumbbell', 'bodyweight'],
    ] as const)
      expect(
        buildRoutine({ ...input, equipment: [...equipment] }, EXERCISES),
      ).toHaveLength(3);
  });
  it('scopes routine reads and deletes to the caller', async () => {
    const findFirst = vi.fn().mockResolvedValue(null),
      deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const service = new TrainingService(
      { healthRoutine: { findFirst, deleteMany } } as unknown as PrismaService,
      {} as HealthService,
    );
    await expect(
      service.routine('other-user', 'private-routine'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: 'private-routine', userId: 'other-user' },
    });
    await expect(
      service.remove('other-user', 'private-routine'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: 'private-routine', userId: 'other-user' },
    });
  });
  it('rejects logging sets outside the selected routine day before writing', async () => {
    const create = vi.fn();
    const db = {
      healthRoutine: {
        findFirst: vi.fn().mockResolvedValue({
          ...input,
          id: 'r',
          days: buildRoutine(input, EXERCISES),
        }),
      },
      workoutLog: { create },
    };
    const service = new TrainingService(
      db as unknown as PrismaService,
      {} as HealthService,
    );
    await expect(
      service.logSession('u', {
        routineId: 'r',
        dayIndex: 0,
        date: '2026-10-30',
        durationMin: 30,
        sets: [
          { exerciseSlug: 'not-in-day', weightKg: 5, reps: 10, seconds: 0 },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });
});
