import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  DestroyRef,
  inject,
  Injectable,
  PLATFORM_ID,
  signal,
} from '@angular/core';

/** The visible viewport must shrink by at least this much to count as a keyboard. */
const KEYBOARD_MIN_PX = 150;
/** Wait for the viewport to stop changing (keyboard animation, WebView resize). */
const SETTLE_MS = 90;
/** Margin kept between the focused field and the keyboard/top edge. */
const EDGE_PX = 16;

const NON_TEXT_INPUTS = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

/** True for elements that bring up the on-screen keyboard. */
export function isTextEntry(element: Element | null): element is HTMLElement {
  if (!element) return false;
  if (element instanceof HTMLTextAreaElement) return !element.readOnly;
  if (element instanceof HTMLInputElement)
    return !element.readOnly && !NON_TEXT_INPUTS.has(element.type);
  return element instanceof HTMLElement && element.isContentEditable === true;
}

/**
 * On-screen keyboard handling for every app (directive 32, 55, 64): while a
 * text field is focused and the visible viewport has shrunk, `<html>` gets
 * `data-keyboard="open"` (the floating bottom nav, its scrim and the assistant
 * button step aside, so they do not cover the field right above the keyboard),
 * and once the viewport settles the focused field is scrolled into view only
 * if the keyboard covers it. Works the same in Chrome (visual viewport shrinks),
 * the PWA and the Android WebView shell (the whole page is resized).
 * Call `start()` once from a browser-rendered component; it is idempotent.
 */
@Injectable({ providedIn: 'root' })
export class AioKeyboard {
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroy = inject(DestroyRef);
  private started = false;
  /** Keyboard open over a focused text field. */
  readonly open = signal(false);

  start(): void {
    const view = this.document.defaultView;
    if (!this.browser || this.started || !view) return;
    this.started = true;
    const root = this.document.documentElement;
    const viewport = view.visualViewport;
    const height = () => viewport?.height ?? view.innerHeight;
    // Tallest viewport seen at each width: the height without a keyboard.
    const tallest = new Map<number, number>();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abort = new AbortController();
    const { signal: listen } = abort;

    const settle = () => {
      timer = undefined;
      const width = view.innerWidth;
      const now = height();
      const base = Math.max(tallest.get(width) ?? 0, now);
      tallest.set(width, base);
      const field = this.document.activeElement;
      const open = isTextEntry(field) && base - now >= KEYBOARD_MIN_PX;
      this.open.set(open);
      if (open) root.dataset['keyboard'] = 'open';
      else delete root.dataset['keyboard'];
      if (open) reveal(field);
    };
    const reveal = (field: HTMLElement) => {
      const top = viewport?.offsetTop ?? 0;
      const bottom = top + height();
      const box = field.getBoundingClientRect();
      if (box.bottom > bottom - EDGE_PX || box.top < top + EDGE_PX) {
        field.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    };
    const schedule = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(settle, SETTLE_MS);
    };

    // The WebView shell resizes the window; browsers shrink the visual viewport.
    view.addEventListener('resize', schedule, { signal: listen });
    viewport?.addEventListener('resize', schedule, { signal: listen });
    // Moving between fields while the keyboard stays up fires no resize.
    this.document.addEventListener('focusin', schedule, { signal: listen });
    this.document.addEventListener('focusout', schedule, { signal: listen });
    settle();
    this.destroy.onDestroy(() => {
      abort.abort();
      if (timer !== undefined) clearTimeout(timer);
      delete root.dataset['keyboard'];
    });
  }
}
