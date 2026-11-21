import * as z from 'zod/mini';
import type { Dialogue } from './english';

/*
 * Ready conversations for shadowing (owner, 2026-11-21): written once, voiced
 * once with Kokoro on Colab (`tools/colab/jobs/dialogue_tts.py`), served as
 * static audio, so playing them costs no AI. The first speaker of every
 * dialogue uses the `primary` voice (a woman), the second the `secondary` voice
 * (a man). Opening and finishing a dialogue is recorded per slug so the most
 * used levels and topics can get more dialogues.
 */

export const DIALOGUE_LEVELS = ['A1', 'A2', 'B1', 'B2'] as const;
export type DialogueLevel = (typeof DIALOGUE_LEVELS)[number];

export interface LibraryDialogue {
  slug: string;
  level: DialogueLevel;
  title: string;
  lines: { speaker: string; text: string }[];
}

const d = (
  slug: string,
  level: DialogueLevel,
  title: string,
  speakers: [string, string],
  texts: string[],
): LibraryDialogue => ({
  slug,
  level,
  title,
  lines: texts.map((text, i) => ({ speaker: speakers[i % 2], text })),
});

export const DIALOGUE_LIBRARY: readonly LibraryDialogue[] = [
  d(
    'a1-football',
    'A1',
    'Do you like football?',
    ['Sara', 'Ben'],
    [
      'Hi, Ben! How are you?',
      "Hi, Sara! I'm fine, thanks. And you?",
      "I'm good. Do you like football?",
      'Yes, I do. I love football!',
      'Me too. What is your favorite team?',
      'My favorite team is Real Madrid. What about you?',
      'I like Barcelona.',
      'Oh no! They are our rivals!',
      'Ha ha. Do you play football?',
      'Yes, I play every Friday with my friends.',
      'Where do you play?',
      'We play in the park near my house.',
      'Can I play with you on Friday?',
      'Sure! We start at five o’clock.',
      'Great! See you on Friday.',
      'See you, Sara!',
    ],
  ),
  d(
    'a1-new-neighbour',
    'A1',
    'A new neighbour',
    ['Emma', 'Tom'],
    [
      'Hello! Are you my new neighbour?',
      'Yes, I am. My name is Tom.',
      "Nice to meet you, Tom. I'm Emma.",
      'Nice to meet you too, Emma.',
      'Where are you from?',
      "I'm from Canada. And you?",
      "I'm from here. I live in number twelve.",
      'I live in number fourteen.',
      'Do you live alone?',
      'No, I live with my brother and my cat.',
      'I love cats! What is its name?',
      'Its name is Milo. He is very small.',
      'Welcome to the street, Tom.',
      'Thank you, Emma. Have a nice day!',
    ],
  ),
  d(
    'a1-cafe',
    'A1',
    'At the café',
    ['Lily', 'Sam'],
    [
      'Good morning! What would you like?',
      'Good morning. A coffee, please.',
      'Small or large?',
      'Large, please. With milk.',
      'Anything to eat?',
      'Yes. Can I have a cheese sandwich?',
      'Of course. Is that for here or to go?',
      'For here, please.',
      'That is eight dollars.',
      'Here you are.',
      'Thank you. Please sit down. I will bring it to you.',
      'Thanks a lot!',
    ],
  ),
  d(
    'a2-weekend',
    'A2',
    'What did you do at the weekend?',
    ['Anna', 'Jack'],
    [
      'Hi, Jack. Did you have a good weekend?',
      'Yes, it was great, thanks. And you?',
      'It was quiet. What did you do?',
      'On Saturday I went to the mountains with my family.',
      'That sounds nice! Was it cold?',
      'A little. But the weather was sunny, so we walked for three hours.',
      'Wow, that is a long walk.',
      'Yes, I was very tired in the evening. What about you?',
      'I stayed at home on Saturday and cleaned my flat.',
      'And on Sunday?',
      'I met some friends and we watched a film.',
      'Which film did you see?',
      'A comedy. It was really funny.',
      'Maybe I can watch it next weekend.',
    ],
  ),
  d(
    'a2-doctor',
    'A2',
    'At the doctor’s',
    ['Dr Hill', 'Mark'],
    [
      'Good afternoon. How can I help you?',
      "Hello, doctor. I don't feel very well.",
      'What is the problem?',
      'I have a sore throat and a headache.',
      'How long have you had them?',
      'Since Monday. I also feel tired all the time.',
      'Do you have a temperature?',
      'Yes, I think so. I feel hot at night.',
      'Let me check. Open your mouth, please.',
      'Is it serious?',
      'No, it is just a cold. You need to rest and drink a lot of water.',
      'Can I go to work tomorrow?',
      'It is better to stay at home for two days.',
      'Thank you, doctor.',
    ],
  ),
  d(
    'a2-directions',
    'A2',
    'Asking for directions',
    ['Mia', 'Leo'],
    [
      'Excuse me. Can you help me?',
      'Sure. What are you looking for?',
      'How can I get to the train station?',
      'It is not far. Go straight on and turn left at the bank.',
      'Turn left at the bank. And then?',
      'Walk past the supermarket. The station is on your right.',
      'How long does it take to walk there?',
      'About ten minutes.',
      'Is there a bus?',
      'Yes, the number five bus goes there, but walking is faster now.',
      'Great. Thank you very much!',
      'You are welcome. Have a good trip!',
    ],
  ),
  d(
    'b1-job-interview',
    'B1',
    'A job interview',
    ['Ms Clark', 'David'],
    [
      'Thank you for coming in today. Could you tell me a little about yourself?',
      'Of course. I studied business, and for the last three years I have worked in sales.',
      'Why are you interested in this position?',
      'I enjoy working with customers, and I would like to work for a company that is growing.',
      'What would you say is your biggest strength?',
      'I am well organised. I always plan my week and I rarely miss a deadline.',
      'And what about a weakness?',
      'Sometimes I try to do everything myself, but I am learning to ask my team for help.',
      'Can you tell me about a difficult situation at work?',
      'Once a customer was very angry about a late delivery. I listened, apologised and found a solution the same day.',
      'That is a good example. Do you have any questions for us?',
      'Yes. What does a typical day look like in this role?',
      'You would spend most of the day talking to clients and preparing offers.',
      'That sounds interesting. Thank you for your time.',
    ],
  ),
  d(
    'b1-hotel-problem',
    'B1',
    'A problem at the hotel',
    ['Receptionist', 'Paul'],
    [
      'Good evening. How can I help you?',
      "Hi. I'm in room 305, and I'm afraid there's a problem with the air conditioning.",
      "I'm sorry to hear that. What seems to be the problem?",
      "It doesn't work at all, and the room is really hot.",
      'I will send someone from maintenance right away.',
      'Thank you. How long will it take?',
      'Usually about twenty minutes, but it depends on the problem.',
      "I've had a long day, and I'd really like to get some sleep.",
      'I understand. If it can’t be fixed quickly, we can move you to another room.',
      'That would be great. Is there one available?',
      'Yes, we have a room on the fifth floor with a view of the sea.',
      "Perfect. I'll pack my things.",
      'And breakfast tomorrow is on us, to apologise for the trouble.',
      "That's very kind of you. Thanks a lot.",
    ],
  ),
  d(
    'b1-plans',
    'B1',
    'Making plans for Saturday',
    ['Kate', 'Ryan'],
    [
      'Hey, Ryan! Are you doing anything on Saturday?',
      "Nothing special yet. Why, what's up?",
      "There's a food festival in the city centre. Do you fancy going?",
      'Sounds good! What time were you thinking of?',
      'How about meeting at noon? Then we can have lunch there.',
      'Noon works for me. Should we invite anyone else?',
      "Let's ask Mike and Julia. They love trying new food.",
      "Good idea. I'll send them a message.",
      'Should we go by car or take the metro?',
      'The metro is easier. Parking will be a nightmare.',
      "True. Let's meet at the station, then.",
      'Perfect. If it rains, we can go to the cinema instead.',
      "Deal. I'll check the weather on Friday night.",
      'See you on Saturday!',
    ],
  ),
  d(
    'b2-remote-work',
    'B2',
    'Working from home',
    ['Rachel', 'Daniel'],
    [
      "So, how are you finding working from home? It's been a few months now.",
      "Honestly, it's a mixed bag. I save almost two hours a day on commuting, which is fantastic.",
      "I can imagine. But don't you miss being around people?",
      "I do, more than I expected. Video calls just aren't the same as a quick chat by the coffee machine.",
      "That's exactly how I feel. And I find it hard to switch off in the evening.",
      'Same here. My laptop is always there on the kitchen table, tempting me to check my emails.',
      'Have you found anything that helps?',
      "I've started going for a short walk at six. It's like my way of leaving the office.",
      "That's a clever idea. I might try that myself.",
      'What about your team? Are they happy with the arrangement?',
      'Most of them are, but a couple of the younger ones would rather be in the office.',
      "That makes sense. They're probably still learning a lot from colleagues.",
      "Exactly. We're thinking of having everyone come in on Tuesdays and Thursdays.",
      'A hybrid model sounds like the best of both worlds.',
    ],
  ),
  d(
    'b2-complaint',
    'B2',
    'Returning a faulty laptop',
    ['Customer', 'Assistant'],
    [
      'Hi, I bought this laptop here two weeks ago, and it keeps shutting down without any warning.',
      "I'm sorry about that. Have you got the receipt with you?",
      "Yes, here it is. I've also tried updating everything, but it didn't make any difference.",
      "Thanks. Does it happen when you're using a particular program?",
      'Not really. It can happen when I am just writing an email.',
      'That sounds like a hardware fault. We can send it for repair, which usually takes about ten days.',
      "To be honest, I'd rather not wait that long. I need it for work.",
      'I understand. Since it is still within thirty days, you are entitled to a replacement.',
      'That would be much better. Is the same model in stock?',
      "Let me check. Yes, we've got one left.",
      'Great. And will my files be transferred?',
      "I'm afraid we can't do that here, but if you back them up first, you won't lose anything.",
      "Fair enough. I'll do that tonight and come back tomorrow.",
      "No problem. I'll put the replacement aside for you.",
    ],
  ),
  d(
    'b2-travel-story',
    'B2',
    'A trip that went wrong',
    ['Olivia', 'Chris'],
    [
      'You look exhausted. How was your trip to Lisbon?',
      "Don't ask. Pretty much everything that could go wrong, went wrong.",
      'Oh no. What happened?',
      'First, our flight was delayed by five hours, so we missed our connection in Madrid.',
      "That's awful. Did the airline put you up in a hotel?",
      'Eventually, yes, but we had to queue for ages before anyone would help us.',
      'And did you make it to Lisbon in the end?',
      'We did, a day late. And then we found out our luggage had stayed in Madrid.',
      "You're kidding! What did you do without your clothes?",
      'We had to buy a few basics. Luckily the shops near the hotel were open late.',
      'At least the city itself was nice, I hope?',
      'It was wonderful, actually. The food, the views, the people were all amazing.',
      "So it wasn't a complete disaster after all.",
      "No. Looking back, it's a funny story. But I'm taking hand luggage only next time!",
    ],
  ),
];

export const DIALOGUE_SLUGS = DIALOGUE_LIBRARY.map((x) => x.slug) as [
  string,
  ...string[],
];

export function libraryDialogue(slug: string): LibraryDialogue | undefined {
  return DIALOGUE_LIBRARY.find((x) => x.slug === slug);
}

/** A ready dialogue in the shape the practice page plays. */
export function libraryAsDialogue(x: LibraryDialogue): Dialogue {
  return { title: x.title, lines: x.lines, questions: [], phrases: [] };
}

/** Every sentence with the voice it is spoken in (first speaker = primary). */
export function libraryVoiceLines(): {
  voice: 'primary' | 'secondary';
  text: string;
}[] {
  const seen = new Set<string>();
  const out: { voice: 'primary' | 'secondary'; text: string }[] = [];
  for (const x of DIALOGUE_LIBRARY)
    x.lines.forEach((line, i) => {
      const voice = i % 2 === 0 ? 'primary' : 'secondary';
      const key = `${voice}\n${line.text.trim()}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ voice, text: line.text.trim() });
    });
  return out;
}

/* ---------------- Usage events ---------------- */

export const DIALOGUE_EVENTS = ['OPEN', 'FINISH'] as const;
export type DialogueEventKind = (typeof DIALOGUE_EVENTS)[number];

export const dialogueEventSchema = z.object({
  kind: z.enum(DIALOGUE_EVENTS),
  /** Session score, for FINISH. */
  score: z.optional(z.number().check(z.int(), z.minimum(0), z.maximum(100))),
});
export type DialogueEventInput = z.infer<typeof dialogueEventSchema>;

/** Admin report row: one ready dialogue. */
export interface DialogueUsage {
  slug: string;
  level: DialogueLevel;
  title: string;
  opens: number;
  users: number;
  finishes: number;
  /** Average FINISH score, null when nobody finished. */
  avgScore: number | null;
  /** Opens in the last 7 days. */
  opens7d: number;
}
