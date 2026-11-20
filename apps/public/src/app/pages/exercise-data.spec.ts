import {
  EXERCISE_PAGES,
  EXERCISES_BY_MUSCLE,
  exerciseDescription,
  exerciseStructuredData,
  exerciseTitle,
} from './exercise-data';

describe('public exercise pages', () => {
  it('puts every exercise in exactly one muscle group', () => {
    expect(EXERCISES_BY_MUSCLE.flatMap((g) => g.exercises)).toHaveLength(
      EXERCISE_PAGES.length,
    );
  });

  it('gives each page a searchable title, a short description and its steps', () => {
    const squat = EXERCISE_PAGES.find((e) => e.slug === 'body-squat');
    if (!squat) throw new Error('body-squat missing');
    expect(exerciseTitle(squat)).toBe(
      'آموزش اسکات با وزن بدن با ویدیو | Poshtetgarm',
    );
    expect(exerciseDescription(squat).length).toBeLessThanOrEqual(160);
    const graph = (
      exerciseStructuredData(squat) as {
        '@graph': { '@type': string; step?: unknown[] }[];
      }
    )['@graph'];
    expect(graph[0]).toMatchObject({ '@type': 'HowTo' });
    expect(graph[0].step).toHaveLength(squat.instructions.length);
  });
});
