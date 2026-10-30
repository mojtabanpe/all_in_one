import { BadGatewayException, HttpException, Injectable } from '@nestjs/common';
import { AiGateway } from '@all-in-one/api/ai';
import {
  type CardAnswer,
  CONVERSATION_SITUATIONS,
  type ConversationSituation,
  type Dialogue,
  type GeneratedText,
  READING_TOPICS,
  type ReadingLevel,
  type ReadingTopic,
  type WritingFeedback,
  type WritingFeedbackRequest,
  type WritingTask,
} from '@all-in-one/applets/english-learning/contracts';
import {
  CARD_ANSWER_INSTRUCTIONS,
  DIALOGUE_INSTRUCTIONS,
  feedbackNote,
  LEVEL_NAMES,
  parseCardAnswer,
  parseDialogue,
  parseReadingText,
  parseWritingFeedback,
  parseWritingTask,
  READING_INSTRUCTIONS,
  WRITING_FEEDBACK_INSTRUCTIONS,
  WRITING_TASK_INSTRUCTIONS,
} from './prompts';
import { TextsService } from './texts.service';

/** Card answers, reading texts and practice exercises (Recall `ai`, `practice`). */
@Injectable()
export class AiService {
  constructor(
    private readonly gateway: AiGateway,
    private readonly texts: TextsService,
  ) {}

  /** Asks the user's model; an unusable answer becomes a friendly 502. */
  private async ask<T>(
    userId: string,
    system: string,
    user: string,
    temperature: number,
    timeout: number,
    parse: (content: string) => T,
    failure: string,
  ): Promise<T> {
    try {
      return parse(
        await this.gateway.text(
          userId,
          [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          temperature,
          timeout,
        ),
      );
    } catch (error) {
      // Not configured or the user's service failed: keep that message.
      if (error instanceof HttpException) throw error;
      throw new BadGatewayException(failure);
    }
  }

  cardAnswer(
    userId: string,
    front: string,
    deck?: string,
    context?: string,
  ): Promise<CardAnswer> {
    return this.ask(
      userId,
      CARD_ANSWER_INSTRUCTIONS,
      (deck?.trim() ? 'Deck: ' + deck.trim() + '\n' : '') +
        'Front: ' +
        front.trim() +
        (context?.trim() ? '\nContext: ' + context.trim() : ''),
      0.3,
      60000,
      (content) => parseCardAnswer(content, front),
      'پاسخ ساخته نشد. دوباره امتحان کنید.',
    );
  }

  /** ~1,000 words on a topic, steered by the learner's last rating. */
  async readingText(
    userId: string,
    topic: ReadingTopic,
    level: ReadingLevel = 'B2',
  ): Promise<GeneratedText> {
    const label = READING_TOPICS.find((t) => t.id === topic)?.label ?? topic;
    const last = await this.texts.latestFeedback(userId);
    const feedback =
      last?.rating != null
        ? {
            title: last.title,
            rating: last.rating,
            reviewNote: last.reviewNote,
          }
        : null;
    const text = await this.ask(
      userId,
      READING_INSTRUCTIONS,
      'Topic: ' +
        label +
        '\nLevel: ' +
        LEVEL_NAMES[level] +
        (feedback ? feedbackNote(feedback) : ''),
      feedback ? 0.7 : 0.9,
      150000,
      parseReadingText,
      'متن نوشته نشد. دوباره امتحان کنید.',
    );
    return feedback ? { ...text, feedbackFrom: feedback.title } : text;
  }

  private context(
    situation: ConversationSituation,
    level: ReadingLevel = 'B1',
  ) {
    const label =
      CONVERSATION_SITUATIONS.find((s) => s.id === situation)?.label ??
      situation;
    return 'Situation: ' + label + '\nLevel: ' + LEVEL_NAMES[level];
  }

  writingTask(
    userId: string,
    situation: ConversationSituation,
    level?: ReadingLevel,
  ): Promise<WritingTask> {
    return this.ask(
      userId,
      WRITING_TASK_INSTRUCTIONS,
      this.context(situation, level),
      0.9,
      90000,
      parseWritingTask,
      'تمرین آماده نشد. دوباره امتحان کنید.',
    );
  }

  writingFeedback(
    userId: string,
    input: WritingFeedbackRequest,
  ): Promise<WritingFeedback> {
    return this.ask(
      userId,
      WRITING_FEEDBACK_INSTRUCTIONS,
      this.context(input.situation, input.level) +
        '\nTask: ' +
        input.scenario.trim() +
        (input.message?.trim()
          ? '\nThe other person said: ' + input.message.trim()
          : '') +
        "\nThe learner's answer:\n---\n" +
        input.answer.trim() +
        '\n---',
      0.3,
      90000,
      parseWritingFeedback,
      'بازخورد آماده نشد. دوباره امتحان کنید.',
    );
  }

  dialogue(
    userId: string,
    situation: ConversationSituation,
    level?: ReadingLevel,
  ): Promise<Dialogue> {
    return this.ask(
      userId,
      DIALOGUE_INSTRUCTIONS,
      this.context(situation, level),
      0.9,
      90000,
      parseDialogue,
      'گفت‌وگو آماده نشد. دوباره امتحان کنید.',
    );
  }
}
