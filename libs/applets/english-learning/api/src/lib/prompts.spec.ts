import {
  parseCardAnswer,
  parseDialogue,
  parseReadingText,
  parseWritingFeedback,
  parseWritingTask,
} from './prompts';

// Ported from Recall server/test/ai.test.cjs and practice.test.cjs.
describe('AI response parsers', () => {
  it('parses card answers in fences or as lists, and rejects junk', () => {
    expect(
      parseCardAnswer(
        '```json\n{"back":" to fail to value ","examples":"- One.\\n- Two."}\n```',
        ' bond ',
      ),
    ).toEqual({ front: 'bond', back: 'to fail to value', examples: '- One.\n- Two.' });
    expect(
      parseCardAnswer('{"front":"take","back":"x","examples":["A.","B."]}', 'took'),
    ).toEqual({ front: 'take', back: 'x', examples: '- A.\n- B.' });
    expect(() => parseCardAnswer('no json here', 'x')).toThrow();
    expect(() => parseCardAnswer('{"back":"","examples":""}', 'x')).toThrow();
  });

  it('splits a reading text into title and body, tolerating Markdown', () => {
    const words = Array(450).fill('word').join(' ');
    expect(
      parseReadingText(
        '```\n# **Title: "Quiet Robots"**\n\n' +
          words +
          '.\n\n\n\n## Part two\n' +
          words +
          '\n```',
      ),
    ).toEqual({ title: 'Quiet Robots', body: words + '.\n\n' + words });
    expect(() =>
      parseReadingText('Title\n\nToo short to read for fifteen minutes.'),
    ).toThrow();
    expect(() => parseReadingText('')).toThrow();
  });

  it('parses writing tasks and filters malformed feedback items', () => {
    expect(
      parseWritingTask(
        '```json\n{"scenario":" Reply to Sam. ","message":"Fancy a coffee?"}\n```',
      ),
    ).toEqual({ scenario: 'Reply to Sam.', message: 'Fancy a coffee?' });
    expect(parseWritingTask('{"scenario":"Leave a note."}')).toEqual({
      scenario: 'Leave a note.',
      message: '',
    });
    expect(() => parseWritingTask('{"message":"hi"}')).toThrow();
    const feedback = parseWritingFeedback(
      JSON.stringify({
        corrected: 'I went there.',
        natural: 'I was there.',
        comment: 'Nice!',
        mistakes: [
          { original: 'I go', fix: 'I went', why: 'past' },
          { original: '', fix: 'x' },
          'junk',
        ],
        phrases: [
          { phrase: 'pop in', meaning: 'visit briefly' },
          { phrase: 'no meaning' },
        ],
      }),
    );
    expect(feedback.mistakes).toEqual([
      { original: 'I go', fix: 'I went', why: 'past' },
    ]);
    expect(feedback.phrases).toEqual([
      { phrase: 'pop in', meaning: 'visit briefly' },
    ]);
    expect(() => parseWritingFeedback('{"corrected":"x"}')).toThrow();
  });

  it('keeps valid dialogue questions and needs at least four lines', () => {
    const lines = Array.from({ length: 6 }, (_, i) => ({
      speaker: i % 2 ? 'Ben' : 'Amy',
      text: 'Line ' + i,
    }));
    const dialogue = parseDialogue(
      JSON.stringify({
        title: 'At the café',
        lines,
        questions: [
          { question: 'Who?', options: ['Amy', 'Ben'], answer: 1 },
          { question: 'Bad', options: ['a', 'b'], answer: 5 },
        ],
        phrases: [{ phrase: 'grab a bite', meaning: 'eat something quickly' }],
      }),
    );
    expect(dialogue.lines).toHaveLength(6);
    expect(dialogue.questions).toEqual([
      { question: 'Who?', options: ['Amy', 'Ben'], answer: 1 },
    ]);
    expect(() =>
      parseDialogue(JSON.stringify({ title: 'x', lines: lines.slice(0, 2) })),
    ).toThrow();
  });
});
