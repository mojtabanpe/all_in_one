import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AudioCacheService } from './audio-cache.service';
import { CardsService } from './cards.service';
import { DecksService } from './decks.service';
import {
  EnglishAiController,
  EnglishCardsController,
  EnglishLibraryController,
  EnglishTextsController,
} from './english.controller';
import { GatewayService } from './gateway.service';
import { SpeechService } from './speech.service';
import { StarterDecksService } from './starter-decks.service';
import { TextsService } from './texts.service';

/**
 * English applet backend (Recall): decks, cards, texts, AI, practice and speech.
 * Needs PrismaModule, a global ConfigModule and the global AuthGuard from the
 * host app, plus a raw body parser for `RECORDING_TYPES` (transcription).
 * Exports the services so the host can reuse them (e.g. the ChatGPT MCP tools).
 */
@Module({
  controllers: [
    EnglishLibraryController,
    EnglishCardsController,
    EnglishTextsController,
    EnglishAiController,
  ],
  providers: [
    AiService,
    AudioCacheService,
    CardsService,
    DecksService,
    GatewayService,
    SpeechService,
    StarterDecksService,
    TextsService,
  ],
  exports: [CardsService, DecksService, TextsService, StarterDecksService],
})
export class EnglishApiModule {}
