import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { type AuthUser, CurrentUser } from '@all-in-one/api/auth';
import {
  type CreateWordInput,
  createWordSchema,
  type EnglishDeckSummary,
  type EnglishStats,
  type ReviewCard,
  type ReviewInput,
  reviewSchema,
} from '@all-in-one/applets/english-learning/contracts';
import { EnglishService } from './english.service';

@Controller('english')
export class EnglishController {
  constructor(private readonly english: EnglishService) {}

  @Get('decks')
  decks(@CurrentUser() user: AuthUser): Promise<EnglishDeckSummary[]> {
    return this.english.decks(user.id);
  }

  @Post('decks/:slug/start')
  start(
    @CurrentUser() user: AuthUser,
    @Param('slug') slug: string,
  ): Promise<{ added: number }> {
    return this.english.startDeck(user.id, slug);
  }

  @Get('review')
  due(
    @CurrentUser() user: AuthUser,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ): Promise<ReviewCard[]> {
    return this.english.due(user.id, Math.min(Math.max(limit, 1), 50));
  }

  @Post('review/:wordId')
  @HttpCode(200)
  review(
    @CurrentUser() user: AuthUser,
    @Param('wordId', ParseUUIDPipe) wordId: string,
    @Body({ schema: reviewSchema }) input: ReviewInput,
  ): Promise<ReviewCard> {
    return this.english.review(user.id, wordId, input.grade);
  }

  @Get('stats')
  stats(@CurrentUser() user: AuthUser): Promise<EnglishStats> {
    return this.english.stats(user.id);
  }

  @Get('words')
  myWords(@CurrentUser() user: AuthUser): Promise<ReviewCard[]> {
    return this.english.myWords(user.id);
  }

  @Post('words')
  addWord(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createWordSchema }) input: CreateWordInput,
  ): Promise<ReviewCard> {
    return this.english.addWord(user.id, input);
  }

  @Delete('words/:wordId')
  @HttpCode(204)
  removeWord(
    @CurrentUser() user: AuthUser,
    @Param('wordId', ParseUUIDPipe) wordId: string,
  ): Promise<void> {
    return this.english.removeWord(user.id, wordId);
  }
}
