import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, FormField, min, required } from '@angular/forms/signals';
import { provideRouter, RouterLink } from '@angular/router';
import {
  AioAsyncButton,
  AioCardHeading,
  AioEmptyState,
  AioFormErrors,
  AioFormField,
  AioInput,
  AioNavigationCard,
  AioNumberField,
  AioSelectField,
  AioInputGroupDirectives,
  AioInputGroupSubmit,
  provideIcons,
} from '../../index';
import {
  lucideCalendarCheck,
  lucideChevronLeft,
  lucidePlus,
} from '@ng-icons/lucide';

@Component({
  imports: [AioFormField, AioFormErrors, AioInput, FormField, AioAsyncButton],
  template: `
    <form
      (submit)="$event.preventDefault(); submissions.set(submissions() + 1)"
    >
      <aio-form-field label="Name" controlId="composition-name">
        <input aioInput id="composition-name" [formField]="fields.name" />
        <aio-form-errors [errors]="fields.name().errors()" />
      </aio-form-field>
      <button
        aioAsyncButton
        type="submit"
        label="Save"
        busyLabel="Saving…"
        [busy]="busy()"
        [disabled]="busy()"
        variant="outline"
      ></button>
    </form>
  `,
})
class FormHost {
  readonly model = signal({ name: '' });
  readonly fields = form(this.model, (p) =>
    required(p.name, { message: 'Name is required' }),
  );
  readonly busy = signal(false);
  readonly submissions = signal(0);
}

@Component({
  imports: [AioEmptyState, AioCardHeading, AioNavigationCard, RouterLink],
  providers: [
    provideIcons({ lucideCalendarCheck, lucideChevronLeft, lucidePlus }),
  ],
  template: `
    <section>
      <div
        aioCardHeading
        title="Plan"
        description="Your next step"
        [level]="1"
        headingId="composition-title"
      ></div>
    </section>
    <div aioEmptyState title="Nothing here" description="Add your first item">
      <button type="button" (click)="actions.set(actions() + 1)">Add</button>
    </div>
    <a
      aioNavigationCard
      routerLink="/planner"
      title="Planner"
      icon="lucideCalendarCheck"
      description="Six tasks left"
      action="Continue"
      [loading]="loading()"
    ></a>
  `,
})
class ContentHost {
  readonly loading = signal(true);
  readonly actions = signal(0);
}

@Component({
  imports: [
    AioNumberField,
    AioSelectField,
    AioInputGroupDirectives,
    AioInputGroupSubmit,
  ],
  providers: [provideIcons({ lucidePlus })],
  template: `
    <aio-number-field
      label="Amount"
      controlId="composition-amount"
      [field]="fields.amount"
      [showErrors]="true"
      step="0.1"
    />
    <aio-select-field
      label="Owner"
      controlId="composition-owner"
      [options]="options"
      valueKey="id"
      labelKey="name"
      fallbackLabelKey="email"
      emptyLabel="Unassigned"
      [value]="selected()"
      (valueChange)="selected.set($event)"
    />
    <form
      (submit)="$event.preventDefault(); submissions.set(submissions() + 1)"
    >
      <div aioInputGroup>
        <input aioInputGroupInput /><aio-input-group-submit label="Add item" />
      </div>
    </form>
  `,
})
class ChoicesHost {
  readonly model = signal({ amount: 2 });
  readonly fields = form(this.model, (p) =>
    min(p.amount, 1, { message: 'Must be at least one' }),
  );
  readonly options = [
    { id: 'owner', name: '', email: 'owner@example.com' },
    { id: 'member', name: 'Member', email: 'member@example.com' },
  ];
  readonly selected = signal('owner');
  readonly submissions = signal(0);
}

describe('shared template compositions', () => {
  it('keeps labels connected to projected Signal Forms controls and updates their model', async () => {
    const fixture = TestBed.createComponent(FormHost);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const input = el.querySelector('input');
    expect(el.querySelector('label')?.htmlFor).toBe(input?.id);
    expect(el.querySelector('aio-form-field')?.getAttribute('data-slot')).toBe(
      'field',
    );
    if (!input) throw new Error('Missing projected control');
    input.value = 'A new name';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(fixture.componentInstance.model().name).toBe('A new name');
    input.dispatchEvent(new Event('blur'));
    input.value = '';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(el.textContent).toContain('Name is required');
    input.value = 'Valid';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(el.textContent).not.toContain('Name is required');
  });

  it('preserves native submit and disabled behavior while changing the busy label', async () => {
    const fixture = TestBed.createComponent(FormHost);
    fixture.componentInstance.model.set({ name: 'Valid' });
    await fixture.whenStable();
    const button: HTMLButtonElement =
      fixture.nativeElement.querySelector('button');
    button.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.submissions()).toBe(1);
    fixture.componentInstance.busy.set(true);
    await fixture.whenStable();
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Saving…');
    expect(button.getAttribute('aria-busy')).toBe('true');
    button.click();
    expect(fixture.componentInstance.submissions()).toBe(1);
    fixture.componentInstance.busy.set(false);
    await fixture.whenStable();
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain('Save');
    expect(button.querySelector('aio-spinner')).toBeNull();
  });

  it('keeps numeric Signal Forms values, validation, native selection and add-button submission working', async () => {
    const fixture = TestBed.createComponent(ChoicesHost);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    const input = el.querySelector<HTMLInputElement>('#composition-amount');
    if (!input) throw new Error('Missing number control');
    expect(el.querySelector('label')?.htmlFor).toBe(input.id);
    expect(input.step).toBe('0.1');
    input.value = '3.5';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(fixture.componentInstance.model().amount).toBe(3.5);
    input.dispatchEvent(new Event('blur'));
    input.value = '0';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(el.textContent).toContain('Must be at least one');
    const select = el.querySelector('select');
    if (!select) throw new Error('Missing native picker');
    expect(select.value).toBe('owner');
    expect(select.options[1].textContent).toContain('owner@example.com');
    select.value = 'member';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(fixture.componentInstance.selected()).toBe('member');
    el.querySelector('button')?.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.submissions()).toBe(1);
    expect(
      el.querySelector('aio-input-group-submit')?.getAttribute('data-align'),
    ).toBe('inline-end');
  });

  it('retains heading hierarchy, projected actions, navigation and loading replacement', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(ContentHost);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('h1')?.id).toBe('composition-title');
    expect(el.querySelector('h1')?.textContent?.trim()).toBe('Plan');
    expect(el.querySelector('[aioEmptyState]')?.textContent).toContain(
      'Nothing here',
    );
    el.querySelector('button')?.click();
    expect(fixture.componentInstance.actions()).toBe(1);
    const link = el.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/planner');
    expect(link?.querySelectorAll('[data-slot="skeleton"]').length).toBe(2);
    fixture.componentInstance.loading.set(false);
    await fixture.whenStable();
    expect(link?.querySelector('[data-slot="skeleton"]')).toBeNull();
    expect(link?.textContent).toContain('Six tasks left');
    expect(link?.textContent).toContain('Continue');
  });
});
