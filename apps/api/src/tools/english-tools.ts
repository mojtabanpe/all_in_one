import type {
  CardsService,
  DecksService,
  EnglishAiService,
  TextsService,
} from '@all-in-one/applets/english-learning/api';
import {
  createCardSchema,
  createDeckSchema,
  createTextSchema,
  DECK_COLORS,
  CONVERSATION_SITUATIONS,
  READING_LEVELS,
  practiceRequestSchema,
  RATINGS,
  updateCardSchema,
  updateDeckSchema,
  updateTextSchema,
} from '@all-in-one/applets/english-learning/contracts';
import * as z from 'zod';
import { parseWith, type ToolSink } from './tool-kit';

const id = z.uuid();

/** Recall's 20 tools: decks, cards (with review) and reading passages. */
export function englishTools(
  kit: ToolSink,
  s: {
    decks: DecksService;
    cards: CardsService;
    texts: TextsService;
    ai: EnglishAiService;
  },
) {
  const user = kit.user;

  kit.tool(
    'generate_shadowing_practice',
    {
      description:
        'Generate an English dialogue for sentence-by-sentence shadowing using this user’s configured AI. Listen, then repeat just behind the speaker, matching rhythm and intonation. The app’s English practice page (?mode=shadowing) provides slow/normal speech and optional device-local recording; this tool returns text only and does not save progress or recordings.',
      scope: 'readings:write',
      kind: 'create',
      input: {
        situation: z.enum(CONVERSATION_SITUATIONS.map((s) => s.id)),
        level: z.enum(READING_LEVELS.map((l) => l.id)).optional(),
      },
    },
    (args) => {
      const input = parseWith(practiceRequestSchema, args);
      return s.ai.dialogue(user, input.situation, input.level);
    },
  );

  kit.tool(
    'list_decks',
    {
      description:
        'List your English flashcard decks and their IDs. Use before saving cards to an existing deck.',
      scope: 'cards:read',
      kind: 'read',
      input: {},
    },
    () => s.decks.list(user),
  );
  kit.tool(
    'get_deck',
    {
      description: 'Read one of your decks by ID.',
      scope: 'cards:read',
      kind: 'read',
      input: { deck_id: id },
    },
    (a) => s.decks.get(user, a.deck_id),
  );
  kit.tool(
    'create_deck',
    {
      description: 'Create a deck for flashcards.',
      scope: 'cards:write',
      kind: 'create',
      input: {
        name: z.string().min(1).max(100),
        description: z.string().max(10000).optional(),
        color: z.enum(DECK_COLORS).optional(),
      },
    },
    (a) => s.decks.create(user, parseWith(createDeckSchema, a)),
  );
  kit.tool(
    'update_deck',
    {
      description:
        'Change deck name, description or color. Omitted fields stay unchanged.',
      scope: 'cards:write',
      kind: 'update',
      input: {
        deck_id: id,
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(10000).optional(),
        color: z.enum(DECK_COLORS).optional(),
      },
    },
    ({ deck_id, ...patch }) =>
      s.decks.update(user, deck_id, parseWith(updateDeckSchema, patch)),
  );
  kit.tool(
    'delete_deck',
    {
      assistant: false,
      description:
        'Permanently delete a deck AND ALL its cards, including their review state. Cannot be undone.',
      scope: 'cards:write',
      kind: 'delete',
      input: { deck_id: id },
    },
    (a) => s.decks.remove(user, a.deck_id),
  );
  kit.tool(
    'list_cards',
    {
      description: 'Read cards in one of your decks.',
      scope: 'cards:read',
      kind: 'read',
      input: { deck_id: id, due_only: z.boolean().optional() },
    },
    (a) => s.cards.list(user, a.deck_id, a.due_only ?? false),
  );
  kit.tool(
    'get_card',
    {
      description: 'Read a card and its current review state by ID.',
      scope: 'cards:read',
      kind: 'read',
      input: { card_id: id },
    },
    (a) => s.cards.get(user, a.card_id),
  );
  kit.tool(
    'search_cards',
    {
      description:
        'Find cards by a case-insensitive literal substring in front, back, examples or unit. Searches all your decks unless deck_id is supplied. Page with limit and offset.',
      scope: 'cards:read',
      kind: 'read',
      input: {
        query: z.string().trim().min(1).max(200),
        deck_id: id.optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      },
    },
    (a) => s.cards.search(user, a.query, a.deck_id, a.limit, a.offset),
  );
  const cardText = z.string().min(1).max(100000);
  kit.tool(
    'create_card',
    {
      description:
        'Save a new flashcard in one of your decks. Supply the generated front, back and optional unit (e.g. U3) and examples.',
      scope: 'cards:write',
      kind: 'create',
      input: {
        deck_id: id,
        front: cardText,
        back: cardText,
        unit: z
          .string()
          .regex(/^(?:[uU]\d+)?$/)
          .optional(),
        examples: z.string().max(100000).optional(),
      },
    },
    ({ deck_id, ...rest }) =>
      s.cards.create(
        user,
        parseWith(createCardSchema, { deckId: deck_id, ...rest }),
      ),
  );
  kit.tool(
    'update_card',
    {
      description:
        'Edit an existing card by card_id. Send only the fields to replace; omitted fields stay unchanged. Preserves the card ID, deck, review history and schedule. Use "" to clear unit or examples.',
      scope: 'cards:write',
      kind: 'update',
      input: z
        .object({
          card_id: id,
          front: cardText.optional(),
          back: cardText.optional(),
          unit: z
            .string()
            .regex(/^(?:[uU]\d+)?$/)
            .optional(),
          examples: z.string().max(100000).optional(),
        })
        .strict()
        .refine(
          (a) =>
            [a.front, a.back, a.unit, a.examples].some((v) => v !== undefined),
          { message: 'Supply at least one content field to update.' },
        ),
    },
    ({ card_id, ...patch }) =>
      s.cards.update(user, card_id, parseWith(updateCardSchema, patch)),
  );
  kit.tool(
    'delete_card',
    {
      description:
        'Permanently delete a card and its review state. Cannot be undone.',
      scope: 'cards:write',
      kind: 'delete',
      input: { card_id: id },
    },
    (a) => s.cards.remove(user, a.card_id),
  );
  kit.tool(
    'move_card',
    {
      description:
        'Move a card to another of your decks. Preserves content and review state.',
      scope: 'cards:write',
      kind: 'update',
      input: { card_id: id, deck_id: id },
    },
    (a) => s.cards.move(user, a.card_id, a.deck_id),
  );
  kit.tool(
    'review_card',
    {
      description:
        'Record a user-supplied review rating and advance the spaced repetition schedule. "again" can suspend a leech. Do not infer ratings or retry a completed call: each call records another review.',
      scope: 'cards:write',
      kind: 'create',
      input: { card_id: id, rating: z.enum(RATINGS) },
    },
    (a) => s.cards.review(user, a.card_id, a.rating),
  );
  kit.tool(
    'suspend_card',
    {
      description: 'Hide a card from the review queue. Preserves its schedule.',
      scope: 'cards:write',
      kind: 'update',
      input: { card_id: id },
    },
    (a) => s.cards.suspend(user, a.card_id),
  );
  kit.tool(
    'unsuspend_card',
    {
      description:
        'Return a card to the review queue and reset its lapse counter.',
      scope: 'cards:write',
      kind: 'update',
      input: { card_id: id },
    },
    (a) => s.cards.unsuspend(user, a.card_id),
  );
  kit.tool(
    'list_readings',
    {
      description: 'List your saved reading passages.',
      scope: 'readings:read',
      kind: 'read',
      input: {},
    },
    () => s.texts.list(user),
  );
  kit.tool(
    'get_reading',
    {
      description: 'Read a saved passage by its ID.',
      scope: 'readings:read',
      kind: 'read',
      input: { id },
    },
    (a) => s.texts.get(user, a.id),
  );
  kit.tool(
    'create_reading',
    {
      description:
        'Save a generated reading passage. Supply a title and the complete passage body.',
      scope: 'readings:write',
      kind: 'create',
      input: {
        title: z.string().min(1).max(200),
        body: z.string().min(1).max(50000),
      },
    },
    (a) =>
      s.texts.create(user, parseWith(createTextSchema, { ...a, ai: true })),
  );
  kit.tool(
    'update_reading',
    {
      description:
        'Edit the title or body of a saved passage. Omitted fields stay unchanged.',
      scope: 'readings:write',
      kind: 'update',
      input: z
        .object({
          id,
          title: z.string().min(1).max(200).optional(),
          body: z.string().min(1).max(50000).optional(),
        })
        .strict()
        .refine((a) => a.title !== undefined || a.body !== undefined, {
          message: 'Supply a title or body to update.',
        }),
    },
    ({ id: textId, ...patch }) =>
      s.texts.update(user, textId, parseWith(updateTextSchema, patch)),
  );
  kit.tool(
    'delete_reading',
    {
      description: 'Permanently delete a saved passage. Cannot be undone.',
      scope: 'readings:write',
      kind: 'delete',
      input: { id },
    },
    (a) => s.texts.remove(user, a.id),
  );
}
