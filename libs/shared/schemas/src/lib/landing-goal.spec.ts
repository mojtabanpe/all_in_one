import { landingGoalForPath, resolveLandingGoal } from './landing-goal';
import { registerSchema, smsLoginSchema } from './user';
describe('landing intent', () => {
  it('prioritizes explicit interest, campaign, then previous choice', () => {
    expect(
      resolveLandingGoal(
        new URLSearchParams('goal=planner&utm_campaign=english_7day_pilot'),
        'health',
      ),
    ).toBe('planner');
    expect(
      resolveLandingGoal(
        new URLSearchParams('utm_campaign=english_7day_pilot'),
        'health',
      ),
    ).toBe('english');
    expect(
      resolveLandingGoal(
        new URLSearchParams('utm_campaign=tg_partner_workout'),
      ),
    ).toBe('health');
    expect(
      resolveLandingGoal(
        new URLSearchParams('utm_campaign=daily_plan_template'),
      ),
    ).toBe('planner');
    expect(resolveLandingGoal(new URLSearchParams(), 'health')).toBe('health');
  });
  it('keeps unknown traffic neutral and never guesses from Instagram alone', () => {
    expect(
      resolveLandingGoal(new URLSearchParams('utm_source=instagram')),
    ).toBeNull();
    expect(
      resolveLandingGoal(new URLSearchParams('goal=evil'), 'unknown'),
    ).toBeNull();
    expect(
      resolveLandingGoal(
        new URLSearchParams('view=all&utm_campaign=english_7day_pilot'),
        'health',
      ),
    ).toBeNull();
  });
  it('recognizes focused routes without changing explicit destinations', () => {
    expect(landingGoalForPath('/health-tracking')).toBe('health');
    expect(landingGoalForPath('/home-workout/')).toBe('health');
    expect(landingGoalForPath('/daily-planner')).toBe('planner');
    expect(landingGoalForPath('/leitner-flashcards')).toBe('english');
    expect(landingGoalForPath('/about')).toBeNull();
  });
  it('validates the chosen goal for both signup methods', () => {
    expect(
      registerSchema.parse({
        email: 'test@example.com',
        password: 'password123',
        goal: 'english',
      }).goal,
    ).toBe('english');
    expect(
      smsLoginSchema.parse({
        phone: '09121234567',
        code: '123456',
        goal: 'health',
      }).goal,
    ).toBe('health');
    expect(
      smsLoginSchema.safeParse({
        phone: '09121234567',
        code: '123456',
        goal: 'unknown',
      }).success,
    ).toBe(false);
  });
});
