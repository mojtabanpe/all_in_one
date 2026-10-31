import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import type { AiGateway } from '@all-in-one/api/ai';
import type { HealthService } from './health.service';
import { HealthAiService } from './health-ai.service';
import type {
  Recipe,
  MealPlan,
  HealthProfile,
} from '@all-in-one/applets/health/contracts';

const recipe = (slug: string, extra: Partial<Recipe> = {}): Recipe => ({
  slug,
  title: slug,
  mealType: 'LUNCH',
  diets: ['balanced'],
  calories: 500,
  proteinG: 20,
  carbsG: 50,
  fatG: 15,
  prepMinutes: 15,
  ingredients: [{ item: 'برنج', amount: 'یک پیمانه' }],
  steps: ['بپزید.'],
  tags: [],
  ...extra,
});
const current = recipe('current');
const allowed = recipe('allowed', { title: 'عدسی' });
const input = {
  date: '2026-10-31',
  mealType: 'LUNCH' as const,
  preference: 'سریع و بدون گوشت',
};
const plan: MealPlan = {
  id: 'plan',
  startDate: input.date,
  dietSlug: 'balanced',
  calorieTarget: 2000,
  days: [
    { date: input.date, meals: [{ mealType: 'LUNCH', recipeSlug: 'current' }] },
  ],
  recipes: { current },
};
function setup(
  reply = JSON.stringify({
    suggestions: [
      { recipeSlug: 'allowed', reason: 'آماده‌سازی سریع و بدون گوشت' },
    ],
  }),
) {
  const gateway = { text: vi.fn().mockResolvedValue(reply) };
  const health = {
    currentPlan: vi.fn().mockResolvedValue(plan),
    profile: vi
      .fn()
      .mockResolvedValue({ excludedIngredients: ['گردو'] } as HealthProfile),
    recipes: vi
      .fn()
      .mockResolvedValue([
        current,
        allowed,
        recipe('excluded', {
          ingredients: [{ item: 'گردو', amount: 'یک قاشق' }],
        }),
        recipe('other-diet', { diets: ['keto'] }),
        recipe('other-meal', { mealType: 'DINNER' }),
      ]),
  };
  return {
    gateway,
    health,
    service: new HealthAiService(
      gateway as unknown as AiGateway,
      health as unknown as HealthService,
    ),
  };
}
describe('AI meal alternatives', () => {
  it('uses the caller’s gateway, preference and only compatible alternatives without changing the plan', async () => {
    const { service, gateway, health } = setup();
    await expect(service.suggestPlanMeal('owner', input)).resolves.toEqual([
      { recipe: allowed, reason: 'آماده‌سازی سریع و بدون گوشت' },
    ]);
    expect(health.currentPlan).toHaveBeenCalledWith('owner');
    expect(health.profile).toHaveBeenCalledWith('owner');
    const [userId, messages] = gateway.text.mock.calls[0];
    expect(userId).toBe('owner');
    const context = JSON.parse(messages[1].content);
    expect(context.preference).toBe(input.preference);
    expect(context.candidates.map((r: Recipe) => r.slug)).toEqual(['allowed']);
    expect(plan.days[0].meals[0].recipeSlug).toBe('current');
  });
  it.each([
    'not JSON',
    '{"suggestions":[]}',
    '{"suggestions":[{"recipeSlug":"excluded","reason":"bad"}]}',
    '{"suggestions":[{"recipeSlug":"allowed","reason":"x"},{"recipeSlug":"allowed","reason":"y"}]}',
  ])('rejects invalid or unapproved model output: %s', async (reply) => {
    await expect(
      setup(reply).service.suggestPlanMeal('owner', input),
    ).rejects.toThrow(BadGatewayException);
  });
  it('does not contact AI if the caller has no plan', async () => {
    const { service, health, gateway } = setup();
    health.currentPlan.mockResolvedValue(null);
    await expect(service.suggestPlanMeal('other-user', input)).rejects.toThrow(
      NotFoundException,
    );
    expect(gateway.text).not.toHaveBeenCalled();
  });
  it('does not contact AI when no compatible replacement exists', async () => {
    const { service, health, gateway } = setup();
    health.recipes.mockResolvedValue([current]);
    await expect(service.suggestPlanMeal('owner', input)).rejects.toThrow(
      BadRequestException,
    );
    expect(gateway.text).not.toHaveBeenCalled();
  });
  it('preserves gateway failures instead of presenting a fabricated suggestion', async () => {
    const { service, gateway } = setup();
    gateway.text.mockRejectedValue(new Error('AI unavailable'));
    await expect(service.suggestPlanMeal('owner', input)).rejects.toThrow(
      'AI unavailable',
    );
  });
});
