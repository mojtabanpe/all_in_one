import { TestBed } from '@angular/core/testing';
import {
  BALANCED_RULES,
  type MealLogInput,
} from '@all-in-one/applets/health/contracts';
import { scoreClass } from './health-api';
import { MealForm } from './meal-form';

describe('MealForm', () => {
  function setup() {
    const fixture = TestBed.createComponent(MealForm);
    fixture.componentRef.setInput('date', '2026-10-29');
    fixture.componentRef.setInput('rules', BALANCED_RULES);
    fixture.componentRef.setInput('calorieTarget', 2000);
    return fixture;
  }
  const button = (el: HTMLElement, label: string) =>
    el.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;

  it('scores the meal live as servings change', async () => {
    const fixture = setup();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('هنوز چیزی برای این وعده ثبت نشده است.');
    button(el, 'افزودن سبزیجات').click();
    button(el, 'افزودن پروتئین کم‌چرب').click();
    await fixture.whenStable();
    expect(el.textContent).toContain('عالی: سبزیجات، پروتئین کم‌چرب.');
  });

  it('emits only the groups that were eaten', async () => {
    const fixture = setup();
    const emitted: MealLogInput[] = [];
    fixture.componentInstance.saved.subscribe((v) => emitted.push(v));
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const input = el.querySelector('#meal-desc') as HTMLInputElement;
    input.value = 'سالاد مرغ';
    input.dispatchEvent(new Event('input'));
    button(el, 'افزودن سبزیجات').click();
    await fixture.whenStable();
    fixture.componentInstance.send();
    await fixture.whenStable();
    expect(emitted[0]).toMatchObject({
      date: '2026-10-29',
      description: 'سالاد مرغ',
      portions: { vegetables: 1 },
    });
  });
});

describe('scoreClass', () => {
  it('colours scores by band', () => {
    expect(scoreClass(90)).toContain('success');
    expect(scoreClass(60)).toContain('warning');
    expect(scoreClass(20)).toContain('destructive');
  });
});
