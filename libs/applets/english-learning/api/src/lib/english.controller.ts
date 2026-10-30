import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { type AuthUser, CurrentUser } from '@all-in-one/api/auth';
import {
  type Card,
  type CardAnswer,
  type CardAnswerRequest,
  cardAnswerRequestSchema,
  type CreateCardInput,
  createCardSchema,
  type CreateDeckInput,
  createDeckSchema,
  type CreateTextInput,
  createTextSchema,
  type Deck,
  type DeckWithStats,
  type Dialogue,
  type EnglishStats,
  type GeneratedText,
  listCardsQuerySchema,
  moveCardSchema,
  type PracticeRequest,
  practiceRequestSchema,
  type ReadingText,
  type ReadingTextRequest,
  readingTextRequestSchema,
  type ReviewInput,
  reviewSchema,
  type ReviewTextInput,
  reviewTextSchema,
  searchCardsQuerySchema,
  type SpeechRequest,
  speechRequestSchema,
  type StarterDeck,
  type Transcript,
  type UpdateCardInput,
  updateCardSchema,
  type UpdateDeckInput,
  updateDeckSchema,
  updateTextSchema,
  type WritingFeedback,
  type WritingFeedbackRequest,
  writingFeedbackRequestSchema,
  type WritingTask,
} from '@all-in-one/applets/english-learning/contracts';
import { AiService } from './ai.service';
import { CardsService } from './cards.service';
import { DecksService } from './decks.service';
import { GatewayService } from './gateway.service';
import { SpeechService } from './speech.service';
import { StarterDecksService } from './starter-decks.service';
import { TextsService } from './texts.service';

const id = new ParseUUIDPipe();

@Controller('english')
export class EnglishLibraryController {
  constructor(
    private readonly decks: DecksService,
    private readonly starters: StarterDecksService,
  ) {}

  @Get('stats')
  stats(@CurrentUser() user: AuthUser): Promise<EnglishStats> {
    return this.starters.stats(user.id);
  }

  @Get('decks')
  list(@CurrentUser() user: AuthUser): Promise<DeckWithStats[]> {
    return this.decks.list(user.id);
  }

  @Get('decks/:id')
  get(@CurrentUser() user: AuthUser, @Param('id', id) deckId: string): Promise<Deck> {
    return this.decks.get(user.id, deckId);
  }

  @Post('decks')
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createDeckSchema }) input: CreateDeckInput,
  ): Promise<Deck> {
    return this.decks.create(user.id, input);
  }

  @Patch('decks/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', id) deckId: string,
    @Body({ schema: updateDeckSchema }) input: UpdateDeckInput,
  ): Promise<Deck> {
    return this.decks.update(user.id, deckId, input);
  }

  @Delete('decks/:id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id', id) deckId: string): Promise<void> {
    await this.decks.remove(user.id, deckId);
  }

  @Get('starter-decks')
  starterDecks(): StarterDeck[] {
    return this.starters.list();
  }

  @Post('starter-decks/:slug')
  copyStarter(@CurrentUser() user: AuthUser, @Param('slug') slug: string): Promise<Deck> {
    return this.starters.copy(user.id, slug);
  }
}

@Controller('english/cards')
export class EnglishCardsController {
  constructor(private readonly cards: CardsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: listCardsQuerySchema }) query: { deckId: string; due?: 'true' | 'false' },
  ): Promise<Card[]> {
    return this.cards.list(user.id, query.deckId, query.due === 'true');
  }

  @Get('search')
  search(
    @CurrentUser() user: AuthUser,
    @Query({ schema: searchCardsQuerySchema }) query: { q: string; deckId?: string },
  ): Promise<Card[]> {
    return this.cards.search(user.id, query.q, query.deckId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createCardSchema }) input: CreateCardInput,
  ): Promise<Card> {
    return this.cards.create(user.id, input);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', id) cardId: string,
    @Body({ schema: updateCardSchema }) input: UpdateCardInput,
  ): Promise<Card> {
    return this.cards.update(user.id, cardId, input);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id', id) cardId: string): Promise<void> {
    await this.cards.remove(user.id, cardId);
  }

  @Post(':id/review')
  review(
    @CurrentUser() user: AuthUser,
    @Param('id', id) cardId: string,
    @Body({ schema: reviewSchema }) input: ReviewInput,
  ): Promise<Card> {
    return this.cards.review(user.id, cardId, input.rating);
  }

  @Post(':id/move')
  move(
    @CurrentUser() user: AuthUser,
    @Param('id', id) cardId: string,
    @Body({ schema: moveCardSchema }) input: { deckId: string },
  ): Promise<Card> {
    return this.cards.move(user.id, cardId, input.deckId);
  }

  @Post(':id/suspend')
  suspend(@CurrentUser() user: AuthUser, @Param('id', id) cardId: string): Promise<Card> {
    return this.cards.suspend(user.id, cardId);
  }

  @Post(':id/unsuspend')
  unsuspend(@CurrentUser() user: AuthUser, @Param('id', id) cardId: string): Promise<Card> {
    return this.cards.unsuspend(user.id, cardId);
  }
}

@Controller('english/texts')
export class EnglishTextsController {
  constructor(private readonly texts: TextsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<ReadingText[]> {
    return this.texts.list(user.id);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', id) textId: string): Promise<ReadingText> {
    return this.texts.get(user.id, textId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createTextSchema }) input: CreateTextInput,
  ): Promise<ReadingText> {
    return this.texts.create(user.id, input);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', id) textId: string,
    @Body({ schema: updateTextSchema }) input: { title?: string; body?: string },
  ): Promise<ReadingText> {
    return this.texts.update(user.id, textId, input);
  }

  @Patch(':id/review')
  review(
    @CurrentUser() user: AuthUser,
    @Param('id', id) textId: string,
    @Body({ schema: reviewTextSchema }) input: ReviewTextInput,
  ): Promise<ReadingText> {
    return this.texts.review(user.id, textId, input);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id', id) textId: string): Promise<void> {
    await this.texts.remove(user.id, textId);
  }
}

@Controller('english')
export class EnglishAiController {
  constructor(
    private readonly ai: AiService,
    private readonly speech: SpeechService,
    private readonly gateway: GatewayService,
  ) {}

  /** Lets the apps hide AI buttons when no gateway key is configured. */
  @Get('ai/status')
  status(): { ai: boolean } {
    return { ai: this.gateway.chatConfigured };
  }

  @Post('ai/card-answer')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  cardAnswer(@Body({ schema: cardAnswerRequestSchema }) input: CardAnswerRequest): Promise<CardAnswer> {
    return this.ai.cardAnswer(input.front, input.deck, input.context);
  }

  @Post('ai/reading-text')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  readingText(
    @CurrentUser() user: AuthUser,
    @Body({ schema: readingTextRequestSchema }) input: ReadingTextRequest,
  ): Promise<GeneratedText> {
    return this.ai.readingText(user.id, input.topic, input.level);
  }

  @Post('ai/practice/writing-task')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  writingTask(@Body({ schema: practiceRequestSchema }) input: PracticeRequest): Promise<WritingTask> {
    return this.ai.writingTask(input.situation, input.level);
  }

  @Post('ai/practice/writing-feedback')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  writingFeedback(
    @Body({ schema: writingFeedbackRequestSchema }) input: WritingFeedbackRequest,
  ): Promise<WritingFeedback> {
    return this.ai.writingFeedback(input);
  }

  @Post('ai/practice/dialogue')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  dialogue(@Body({ schema: practiceRequestSchema }) input: PracticeRequest): Promise<Dialogue> {
    return this.ai.dialogue(input.situation, input.level);
  }

  /** Raw audio body (the host app registers a raw parser for RECORDING_TYPES). */
  @Post('ai/practice/transcribe')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async transcribe(@Req() request: Request): Promise<Transcript> {
    return {
      text: await this.gateway.transcribe(request.body, request.headers['content-type'] ?? ''),
    };
  }

  @Post('speech')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async speak(
    @CurrentUser() user: AuthUser,
    @Body({ schema: speechRequestSchema }) input: SpeechRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const result = await this.speech.speak(user.id, input.text, input.voice);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-TTS-Cache', result.cacheStatus);
    return new StreamableFile(result.audio, { type: result.contentType });
  }
}
