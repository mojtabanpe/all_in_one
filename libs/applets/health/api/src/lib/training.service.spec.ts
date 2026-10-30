import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PrismaService } from '@all-in-one/api/db';
import type { HealthService } from './health.service';
import { TrainingService } from './training.service';
import { EXERCISES } from './exercise-catalog';
import {
  buildRoutine,
  type GenerateRoutineInput,
} from '@all-in-one/applets/health/contracts';

describe('training owner isolation and catalog', () => {
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
      expect(exercise.videoUrl).toBeNull();
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
