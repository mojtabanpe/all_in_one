import type { Type } from '@angular/core';
import type { InAppWidgetKind } from '@all-in-one/shared/schemas';
import {
  AiConnection,
  PhoneSettings,
  TelegramOffer,
  TelegramSettings,
} from '@all-in-one/web/shared';
import {
  EmailPrompt,
  PushPrompt,
  RepeatTaskPrompt,
  ReviewCardsPrompt,
  RewardsPrompt,
  WeightGoalPrompt,
} from './prompt-widgets';

/** For a device that cannot get notifications: the Telegram reminder takes the push widget's place. */
export const telegramReminderWidget = {
  component: TelegramOffer,
  inputs: { entry: 'notify_failed' },
};

/** The component a prompt sheet embeds for its widget kind. Imported lazily by the layout. */
export function promptWidget(
  kind: InAppWidgetKind,
  data: Readonly<Record<string, string>> = {},
): { component: Type<unknown>; inputs?: Record<string, unknown> } {
  switch (kind) {
    case 'push':
      return {
        component: PushPrompt,
        inputs: { review: data['review'] ?? '' },
      };
    case 'telegram':
      return { component: TelegramSettings, inputs: { chrome: false } };
    case 'phone':
      return { component: PhoneSettings, inputs: { chrome: false } };
    case 'email':
      return { component: EmailPrompt };
    case 'rewards':
      return { component: RewardsPrompt };
    case 'repeat-task':
      return {
        component: RepeatTaskPrompt,
        inputs: { title: data['title'] ?? '' },
      };
    case 'weight-goal':
      return { component: WeightGoalPrompt };
    case 'review-cards':
      return { component: ReviewCardsPrompt };
    case 'ai-connection':
      return { component: AiConnection, inputs: { chrome: false } };
  }
}
