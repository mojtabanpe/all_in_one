import {
  EXERCISE_CATALOG,
  MUSCLES,
  type Exercise,
  type Muscle,
} from '@all-in-one/applets/health/contracts';

/** One public page per seeded exercise (directive 182): steps, mistakes, alternatives and its video. */
export const EXERCISE_PAGES: readonly Exercise[] = EXERCISE_CATALOG;

export const EXERCISES_PATH = 'exercises';
export const exercisePath = (slug: string) => `${EXERCISES_PATH}/${slug}`;

export const LEVEL_LABELS: Record<Exercise['level'], string> = {
  beginner: 'مبتدی',
  intermediate: 'متوسط',
  advanced: 'پیشرفته',
};

/** Titles carry the words people search for: the move's name, «آموزش» and «ویدیو». */
export const exerciseTitle = (exercise: Exercise) =>
  `آموزش ${exercise.name} با ویدیو | Poshtetgarm`;

export const exerciseDescription = (exercise: Exercise) =>
  `روش درست ${exercise.name}، اشتباه‌های رایج و حرکت‌های جایگزین. ${exercise.instructions[0]}`.slice(
    0,
    160,
  );

/** Grouped by the main muscle, in the catalog's muscle order; empty groups are left out. */
export const EXERCISES_BY_MUSCLE: readonly {
  muscle: Muscle;
  exercises: readonly Exercise[];
}[] = MUSCLES.map((muscle) => ({
  muscle,
  exercises: EXERCISE_PAGES.filter((e) => e.muscle === muscle),
})).filter((group) => group.exercises.length > 0);

export function exerciseStructuredData(exercise: Exercise): object {
  const url = `https://poshtetgarm.ir/${exercisePath(exercise.slug)}`;
  return {
    '@graph': [
      {
        '@type': 'HowTo',
        name: `آموزش ${exercise.name}`,
        inLanguage: 'fa',
        url,
        step: exercise.instructions.map((text, index) => ({
          '@type': 'HowToStep',
          position: index + 1,
          text,
        })),
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'حرکات ورزشی',
            item: `https://poshtetgarm.ir/${EXERCISES_PATH}`,
          },
          { '@type': 'ListItem', position: 2, name: exercise.name, item: url },
        ],
      },
    ],
  };
}
