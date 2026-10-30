import { BadGatewayException, Injectable } from '@nestjs/common';
import { AiGateway, parseJsonReply } from '@all-in-one/api/ai';
import {
  FOOD_GROUPS,
  type MealEstimate,
  type MealPortions,
} from '@all-in-one/applets/health/contracts';

const ESTIMATE_INSTRUCTIONS = `You are a nutrition assistant for Persian users. Estimate the nutrition of ONE meal described by the user (often Persian dishes: e.g. چلوکباب، قورمه‌سبزی، عدسی).
Assume a normal adult portion unless amounts are given. Reply with JSON only:
{"calories": int kcal, "proteinG": int, "carbsG": int, "fatG": int,
 "portions": {<food group>: servings 0-10}, "note": "one short Persian sentence on the assumed portion"}
Food groups: ${FOOD_GROUPS.join(', ')}. Use only groups present in the meal.`;

const clampInt = (value: unknown, max: number) =>
  Math.max(0, Math.min(max, Math.round(Number(value) || 0)));

/** Gordool-style AI help for nutrition, on the user's own chat service. */
@Injectable()
export class HealthAiService {
  constructor(private readonly gateway: AiGateway) {}

  async estimateMeal(
    userId: string,
    description: string,
  ): Promise<MealEstimate> {
    const reply = await this.gateway.text(
      userId,
      [
        { role: 'system', content: ESTIMATE_INSTRUCTIONS },
        { role: 'user', content: description },
      ],
      0.2,
      45_000,
    );
    const raw = parseJsonReply<
      Partial<MealEstimate> & { portions?: Record<string, unknown> }
    >(reply);
    if (!raw || raw.calories === undefined)
      throw new BadGatewayException('تخمین کالری انجام نشد. دوباره امتحان کن.');
    const portions: MealPortions = {};
    for (const group of FOOD_GROUPS) {
      const servings = clampInt(raw.portions?.[group], 10);
      if (servings) portions[group] = servings;
    }
    return {
      calories: clampInt(raw.calories, 5000),
      proteinG: clampInt(raw.proteinG, 500),
      carbsG: clampInt(raw.carbsG, 1000),
      fatG: clampInt(raw.fatG, 500),
      portions,
      note: String(raw.note ?? '').slice(0, 200),
    };
  }
}
