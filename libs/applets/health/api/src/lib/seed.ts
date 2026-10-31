import type { PrismaClient } from '@all-in-one/api/db';
import { ACTIVITY_TYPES, WORKOUT_PROGRAMS } from './seed-fitness';
import { EXERCISES } from './exercise-catalog';
import { DIETS, RECIPES } from './seed-nutrition';

/** Idempotent: upserts activities, programs, diets and recipes. */
export async function seedHealth(prisma: PrismaClient): Promise<void> {
  for (const e of EXERCISES) {
    const { videoUrl, ...data } = e;
    // Reference media is versioned with the app, rather than stored in Prisma.
    delete data.guide;
    await prisma.healthExercise.upsert({
      where: { slug: e.slug },
      create: { ...data, videoUrl },
      update: data,
    });
    // A video set by hand wins; the catalog's only fills an empty one.
    if (videoUrl)
      await prisma.healthExercise.updateMany({
        where: { slug: e.slug, videoUrl: null },
        data: { videoUrl },
      });
  }
  for (const [sortOrder, a] of ACTIVITY_TYPES.entries()) {
    await prisma.activityType.upsert({
      where: { slug: a.slug },
      create: { ...a, sortOrder },
      update: { ...a, sortOrder },
    });
  }
  for (const [sortOrder, p] of WORKOUT_PROGRAMS.entries()) {
    const data = { ...p, exercises: p.exercises as object[], sortOrder };
    await prisma.workoutProgram.upsert({
      where: { slug: p.slug },
      create: data,
      update: data,
    });
  }
  for (const [sortOrder, d] of DIETS.entries()) {
    const data = { ...d, rules: d.rules as object, sortOrder };
    await prisma.diet.upsert({
      where: { slug: d.slug },
      create: data,
      update: data,
    });
  }
  for (const r of RECIPES) {
    const data = {
      ...r,
      ingredients: r.ingredients as object[],
      steps: r.steps,
    };
    await prisma.recipe.upsert({
      where: { slug: r.slug },
      create: data,
      update: data,
    });
  }
}
