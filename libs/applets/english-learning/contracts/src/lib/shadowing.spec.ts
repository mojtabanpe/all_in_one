import {
  checkShadowing,
  shadowScore,
  shadowSessionScore,
  shadowTokens,
} from './shadowing';

describe('shadowing check', () => {
  it('normalizes punctuation, contractions and small numbers', () => {
    expect(shadowTokens("I don't have 2 cats, okay?")).toEqual([
      'i',
      'do',
      'not',
      'have',
      'two',
      'cats',
      'ok',
    ]);
  });

  it('gives 100 for a word-perfect repeat', () => {
    const c = checkShadowing(
      "Hi, I'm Sara. Nice to meet you!",
      'hi i am sara nice to meet you',
    );
    expect(c.score).toBe(100);
    expect(c.words.every((w) => w.status === 'ok')).toBe(true);
  });

  it('marks missed, wrong and extra words', () => {
    const c = checkShadowing(
      'I usually take the bus to work.',
      'I take a bus to the work',
    );
    expect(c.words.find((w) => w.word === 'usually')?.status).toBe('missed');
    expect(c.words.find((w) => w.word === 'the')).toMatchObject({
      status: 'wrong',
      heard: 'a',
    });
    expect(c.extra).toEqual(['the']);
    expect(c.score).toBeLessThan(70);
  });

  it('is strict: one slip in ten words costs 15 points', () => {
    expect(shadowScore(10, 1, 0)).toBe(85);
    expect(shadowScore(10, 3, 0)).toBe(55);
    expect(shadowScore(4, 4, 2)).toBe(0);
  });

  it('counts sentences that were never recorded as zero', () => {
    expect(shadowSessionScore(4, [100, 80])).toBe(45);
    expect(shadowSessionScore(2, [90, 70])).toBe(80);
  });
});
