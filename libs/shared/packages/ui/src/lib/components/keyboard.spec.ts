import { TestBed } from '@angular/core/testing';
import { AioKeyboard, isTextEntry } from './keyboard';

describe('isTextEntry', () => {
  it('counts only fields that bring up the keyboard', () => {
    const input = (type: string) =>
      Object.assign(document.createElement('input'), { type });
    expect(isTextEntry(input('text'))).toBe(true);
    expect(isTextEntry(input('number'))).toBe(true);
    expect(isTextEntry(document.createElement('textarea'))).toBe(true);
    expect(isTextEntry(input('checkbox'))).toBe(false);
    expect(isTextEntry(input('submit'))).toBe(false);
    expect(
      isTextEntry(Object.assign(input('text'), { readOnly: true })),
    ).toBe(false);
    expect(isTextEntry(document.createElement('button'))).toBe(false);
    expect(isTextEntry(null)).toBe(false);
  });
});

describe('AioKeyboard', () => {
  afterEach(() => vi.useRealTimers());

  it('marks the page while a focused field loses viewport height, and clears it on blur', () => {
    vi.useFakeTimers();
    let height = 800;
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      get: () => height,
    });
    const field = document.body.appendChild(document.createElement('input'));
    // The field sits behind the keyboard (jsdom has no layout): it is revealed.
    field.getBoundingClientRect = () => ({ top: 600, bottom: 640 }) as DOMRect;
    const reveal = vi.fn();
    field.scrollIntoView = reveal;
    const keyboard = TestBed.inject(AioKeyboard);
    keyboard.start();

    field.focus();
    height = 450;
    (window.visualViewport ?? window).dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(200);
    expect(keyboard.open()).toBe(true);
    expect(document.documentElement.dataset['keyboard']).toBe('open');
    expect(reveal).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });

    field.blur();
    height = 800;
    (window.visualViewport ?? window).dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(200);
    expect(keyboard.open()).toBe(false);
    expect(document.documentElement.dataset['keyboard']).toBeUndefined();
    field.remove();
  });
});
