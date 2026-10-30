/**
 * Prompts and response parsers, from Recall (server/src/ai, server/src/practice).
 * The model writes English; the parsers accept JSON wrapped in prose or code
 * fences and validate the shape before anything reaches the user.
 */
import type {
  CardAnswer,
  Dialogue,
  GeneratedText,
  ReadingLevel,
  UsefulPhrase,
  WritingFeedback,
  WritingTask,
} from '@all-in-one/applets/english-learning/contracts';

export const LEVEL_NAMES: Record<ReadingLevel, string> = {
  B1: 'B1 (intermediate)',
  B2: 'B2 (upper-intermediate)',
  C1: 'C1 (advanced)',
};

export const CARD_ANSWER_INSTRUCTIONS = `You write answers for English vocabulary flashcards.
The front of the card is a word or phrase. Reply with JSON only, no prose, in this shape:
{"front": "...", "back": "...", "examples": "..."}
- "front": the word or phrase in dictionary form (e.g. "took" becomes "take", "children" becomes "child"); keep set phrases as written.
- "back": a concise English learner's definition (one sentence, at most 25 words). Do not repeat the word, add translations, part-of-speech labels or unit names.
- "examples": two or three natural English example sentences using the word, as a Markdown list with one "- " item per line.
If a context sentence is given, define the meaning used in that sentence.
Everything must be in English.`;

export const READING_INSTRUCTIONS = `You write English reading-practice texts for language learners.
Write an original, engaging and factually careful text of about 1,000 words (between 900 and 1,100) on the given topic, at the given CEFR level, so a learner can read it closely in about 15 minutes.
- Pick one specific, interesting angle on the topic instead of a general overview.
- Use vocabulary and grammar that suit the level, with a natural range of useful words, collocations and phrasal verbs.
- Write 6 to 10 paragraphs separated by a blank line.
- Reply in plain text without Markdown: the first line is only the title (at most 10 words), then a blank line, then the text. No headings, lists, glossary, questions or notes.`;

const GOAL =
  'The learner is studying English to take part in everyday conversation, so prefer natural, spoken, everyday English (contractions, common phrasal verbs and expressions) over formal or exam-style English.';

export const WRITING_TASK_INSTRUCTIONS = `You create short everyday-English writing practice. ${GOAL}
Reply with JSON only, no prose, in this shape: {"scenario": "...", "message": "..."}
- "scenario": one or two sentences, in the second person, describing a realistic everyday situation and what the learner should write (a reply to a text, what they would say, a short note).
- "message": what the other person said or wrote, which the learner answers (one to three natural sentences), or "" if nobody spoke first.
Fit the given CEFR level. Everything must be in English.`;

export const WRITING_FEEDBACK_INSTRUCTIONS = `You are a friendly English teacher. ${GOAL}
Check the learner's answer to the task. Reply with JSON only, no prose, in this shape:
{"corrected": "...", "natural": "...", "mistakes": [{"original": "...", "fix": "...", "why": "..."}], "phrases": [{"phrase": "...", "meaning": "..."}], "comment": "..."}
- "corrected": the learner's text with only the mistakes fixed; keep their own words otherwise.
- "natural": how a native speaker would naturally say it in this situation.
- "mistakes": at most 8 grammar, word-choice or unnatural-phrasing problems, each with a short, simple explanation; [] if there are none.
- "phrases": 2 to 4 useful everyday phrases for this situation, each with a short meaning.
- "comment": one or two encouraging sentences with the single most useful tip.
Everything must be in English.`;

export const DIALOGUE_INSTRUCTIONS = `You write short everyday English conversations for listening practice. ${GOAL}
Reply with JSON only, no prose, in this shape:
{"title": "...", "lines": [{"speaker": "...", "text": "..."}], "questions": [{"question": "...", "options": ["...", "...", "..."], "answer": 0}], "phrases": [{"phrase": "...", "meaning": "..."}]}
- Two speakers with first names, 10 to 16 lines, sounding like real people talking (contractions, short turns, words like "well", "oh", "actually").
- "questions": 3 multiple-choice questions about details of the conversation, each with 3 options; "answer" is the index of the correct option.
- "phrases": 3 to 5 useful everyday phrases used in the conversation, each with a short meaning.
- "title": at most 8 words.
Fit the given CEFR level. Everything must be in English.`;

/** The learner's verdict on their last rated text, turned into instructions. */
export function feedbackNote(feedback: {
  title: string;
  rating: number;
  reviewNote: string;
}): string {
  const note = feedback.reviewNote.trim();
  return (
    '\n\nThe learner rated their previous text "' +
    feedback.title +
    '" ' +
    feedback.rating +
    ' out of 5' +
    (note ? ' and wrote:\n---\n' + note + '\n---' : ' without notes') +
    '\nUse this as guidance for the new text: keep what they liked and fix what they did not. ' +
    'Take extra care this time: plan how the text meets this feedback, write it, then check it against the feedback before you answer.'
  );
}

type Json = Record<string, unknown>;

function parseObject(content: string): Json {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON in AI response');
  const value: unknown = JSON.parse(content.slice(start, end + 1));
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid AI response');
  return value as Json;
}

function text(value: unknown, max: number, required = true): string {
  const result = typeof value === 'string' ? value.trim() : '';
  if ((required && !result) || result.length > max)
    throw new Error('Invalid AI response');
  return result;
}

function list(value: unknown, max: number): Json[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is Json => !!item && typeof item === 'object')
        .slice(0, max)
    : [];
}

function phrases(value: unknown, max: number): UsefulPhrase[] {
  return list(value, max)
    .map((p) => ({
      phrase: text(p['phrase'], 200, false),
      meaning: text(p['meaning'], 400, false),
    }))
    .filter((p) => p.phrase && p.meaning);
}

export function parseCardAnswer(content: string, front: string): CardAnswer {
  const value = parseObject(content);
  const lemma =
    typeof value['front'] === 'string' && value['front'].trim().length <= 500
      ? value['front'].trim()
      : '';
  const back = typeof value['back'] === 'string' ? value['back'].trim() : '';
  const examples = Array.isArray(value['examples'])
    ? value['examples'].map((line) => '- ' + String(line).trim()).join('\n')
    : typeof value['examples'] === 'string'
      ? value['examples'].trim()
      : '';
  if (!back || back.length > 2000 || examples.length > 5000)
    throw new Error('Invalid AI response');
  return { front: lemma || front.trim(), back, examples };
}

/** Splits "Title\n\nBody" from the model, tolerating Markdown and labels. */
export function parseReadingText(content: string): GeneratedText {
  const lines = content
    .replace(/^\s*```\w*\n?|\n?```\s*$/g, '')
    .replace(/\*\*|__/g, '')
    .replace(/\r\n/g, '\n')
    .trim()
    .split('\n');
  const title = (lines.shift() ?? '')
    .replace(/^(?:#+\s*)?(?:title:\s*)?/i, '')
    .replace(/^["'“]|["'”]$/g, '')
    .trim();
  const body = lines
    .filter((line) => !/^#+\s/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const words = body.split(/\s+/).filter(Boolean).length;
  if (!title || title.length > 200 || words < 300 || body.length > 50000)
    throw new Error('Invalid AI response');
  return { title, body };
}

export function parseWritingTask(content: string): WritingTask {
  const value = parseObject(content);
  return {
    scenario: text(value['scenario'], 600),
    message: text(value['message'], 600, false),
  };
}

export function parseWritingFeedback(content: string): WritingFeedback {
  const value = parseObject(content);
  return {
    corrected: text(value['corrected'], 4000),
    natural: text(value['natural'], 4000),
    mistakes: list(value['mistakes'], 8)
      .map((m) => ({
        original: text(m['original'], 400, false),
        fix: text(m['fix'], 400, false),
        why: text(m['why'], 600, false),
      }))
      .filter((m) => m.original && m.fix),
    phrases: phrases(value['phrases'], 4),
    comment: text(value['comment'], 800, false),
  };
}

export function parseDialogue(content: string): Dialogue {
  const value = parseObject(content);
  const lines = list(value['lines'], 24)
    .map((l) => ({
      speaker: text(l['speaker'], 40, false),
      text: text(l['text'], 600, false),
    }))
    .filter((l) => l.speaker && l.text);
  const questions = list(value['questions'], 5)
    .map((q) => {
      const options = Array.isArray(q['options'])
        ? q['options']
            .map((o) => text(o, 300, false))
            .filter(Boolean)
            .slice(0, 4)
        : [];
      return {
        question: text(q['question'], 400, false),
        options,
        answer: Number(q['answer']),
      };
    })
    .filter(
      (q) =>
        q.question &&
        q.options.length >= 2 &&
        Number.isInteger(q.answer) &&
        q.answer >= 0 &&
        q.answer < q.options.length,
    );
  if (lines.length < 4) throw new Error('Invalid AI response');
  return {
    title: text(value['title'], 200),
    lines,
    questions,
    phrases: phrases(value['phrases'], 5),
  };
}
