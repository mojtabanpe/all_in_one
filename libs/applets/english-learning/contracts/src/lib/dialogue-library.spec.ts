import {
  DIALOGUE_LEVELS,
  DIALOGUE_LIBRARY,
  libraryAsDialogue,
  libraryVoiceLines,
} from './dialogue-library';

describe('ready dialogue library', () => {
  it('has unique slugs and at least three dialogues per level', () => {
    const slugs = DIALOGUE_LIBRARY.map((d) => d.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const level of DIALOGUE_LEVELS)
      expect(
        DIALOGUE_LIBRARY.filter((d) => d.level === level).length,
      ).toBeGreaterThanOrEqual(3);
  });

  it('alternates two speakers, so the first speaker always has the primary voice', () => {
    for (const d of DIALOGUE_LIBRARY) {
      const first = d.lines[0].speaker;
      const second = d.lines[1].speaker;
      expect(first).not.toBe(second);
      d.lines.forEach((line, i) =>
        expect(line.speaker).toBe(i % 2 === 0 ? first : second),
      );
    }
  });

  it('lists every sentence once per voice for the audio job', () => {
    const lines = libraryVoiceLines();
    const keys = lines.map((l) => `${l.voice}\n${l.text}`);
    expect(new Set(keys).size).toBe(keys.length);
    const total = DIALOGUE_LIBRARY.reduce((n, d) => n + d.lines.length, 0);
    expect(lines.length).toBeLessThanOrEqual(total);
    expect(lines.every((l) => l.text === l.text.trim() && l.text)).toBe(true);
  });

  it('plays as a practice dialogue without listening questions', () => {
    const d = libraryAsDialogue(DIALOGUE_LIBRARY[0]);
    expect(d.lines).toBe(DIALOGUE_LIBRARY[0].lines);
    expect(d.questions).toEqual([]);
  });
});
