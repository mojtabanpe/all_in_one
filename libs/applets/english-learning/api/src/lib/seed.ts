import type { PrismaClient } from '@all-in-one/api/db';
import { ENGLISH_DECKS } from './seed-data';

/** Idempotent: upserts the catalog decks and words. */
export async function seedEnglish(prisma: PrismaClient): Promise<void> {
  for (const [index, deck] of ENGLISH_DECKS.entries()) {
    const saved = await prisma.englishDeck.upsert({
      where: { slug: deck.slug },
      create: {
        slug: deck.slug,
        title: deck.title,
        description: deck.description,
        level: deck.level,
        sortOrder: index,
      },
      update: {
        title: deck.title,
        description: deck.description,
        level: deck.level,
        sortOrder: index,
      },
    });
    for (const word of deck.words) {
      await prisma.englishWord.upsert({
        where: { deckId_term: { deckId: saved.id, term: word.term } },
        create: { ...word, deckId: saved.id },
        update: word,
      });
    }
  }
}
