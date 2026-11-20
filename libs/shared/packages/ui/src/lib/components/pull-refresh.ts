import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import {
  booleanAttribute,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  output,
  PLATFORM_ID,
  signal,
} from '@angular/core';
import { provideIcons } from '@ng-icons/core';
import { lucideRefreshCw } from '@ng-icons/lucide';
import { AioTranslate } from '../locale';
import { AioSpinner } from './feedback';
import { AioIcon } from './icon';
import { isTextEntry } from './keyboard';

/** Pull distance (after resistance) that triggers a refresh. */
export const PULL_REFRESH_TRIGGER_PX = 64;
/** The indicator never travels further than this. */
export const PULL_REFRESH_MAX_PX = 96;
/** Finger travel is halved, so the pull feels heavier than a scroll. */
const RESISTANCE = 0.5;
/** Movement before the gesture is read as a pull or a sideways swipe. */
const SLOP_PX = 8;
/** The spinner stays at least this long, so a fast reload still reads as one. */
const MIN_SPIN_MS = 600;

const OPEN_OVERLAY =
  '[data-vaul-drawer][data-state="open"], [role="dialog"], [role="alertdialog"], .cdk-overlay-pane';

/**
 * Pull-to-refresh for a page (approved custom component, 2026-11-20, directive 188).
 * Pulling down at the very top of the page emits `refresh`; the host reloads the
 * page's data. It never starts while the page is scrolled, a sheet or dialog is
 * open, the keyboard is up, the finger is in a text field or inside a scrolled
 * inner list, and a sideways swipe cancels it. Centred, so RTL and LTR match.
 *
 * ```html
 * <aio-pull-refresh (refresh)="reload()" label="تازه‌سازی">…page…</aio-pull-refresh>
 * ```
 */
@Component({
  selector: 'aio-pull-refresh',
  imports: [AioIcon, AioSpinner, AioTranslate],
  providers: [provideIcons({ lucideRefreshCw })],
  host: { class: 'block' },
  template: `
    @if (pull() > 0 || refreshing()) {
      <div
        class="glass text-primary pointer-events-none fixed top-0 left-1/2 z-50 flex size-11 items-center justify-center rounded-full motion-safe:transition-transform motion-safe:duration-200"
        [style.transition]="dragging() ? 'none' : null"
        [style.transform]="indicatorTransform()"
        [style.opacity]="refreshing() ? 1 : progress()"
        aria-hidden="true"
      >
        @if (refreshing()) {
          <aio-spinner />
        } @else {
          <aio-icon
            name="lucideRefreshCw"
            size="sm"
            [style.transform]="'rotate(' + progress() * 270 + 'deg)'"
          />
        }
      </div>
    }
    <p class="sr-only" role="status">
      @if (refreshing()) {
        {{ label() | aioTranslate }}
      }
    </p>
    <ng-content />
  `,
})
export class AioPullRefresh {
  /** No pull while true (e.g. a review session that owns the screen). */
  readonly disabled = input(false, { transform: booleanAttribute });
  /** Announced to screen readers while refreshing. */
  readonly label = input('تازه‌سازی');
  readonly refresh = output<void>();

  protected readonly pull = signal(0);
  protected readonly dragging = signal(false);
  protected readonly refreshing = signal(false);
  protected readonly progress = computed(() =>
    Math.min(1, this.pull() / PULL_REFRESH_TRIGGER_PX),
  );
  protected readonly indicatorTransform = computed(() => {
    const y = this.refreshing() ? PULL_REFRESH_TRIGGER_PX - 8 : this.pull() - 8;
    return `translate(-50%, ${y}px)`;
  });

  constructor() {
    const document = inject(DOCUMENT);
    const view = document.defaultView;
    if (!isPlatformBrowser(inject(PLATFORM_ID)) || !view) return;
    const root = document.documentElement;
    const destroy = inject(DestroyRef);
    // Chrome's own pull reloads the whole app: this component replaces it.
    const overscroll = root.style.overscrollBehaviorY;
    root.style.overscrollBehaviorY = 'contain';

    const abort = new AbortController();
    const { signal: listen } = abort;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let start: { x: number; y: number } | null = null;
    let active = false;

    const reset = () => {
      start = null;
      active = false;
      this.dragging.set(false);
    };
    const canStart = (event: TouchEvent) => {
      if (this.disabled() || this.refreshing()) return false;
      if (event.touches.length !== 1) return false;
      if (view.scrollY > 0 || root.scrollTop > 0) return false;
      if (root.dataset['keyboard'] === 'open') return false;
      if (document.querySelector(OPEN_OVERLAY)) return false;
      const target = event.target instanceof Element ? event.target : null;
      if (
        !target ||
        isTextEntry(target.closest('input, textarea, [contenteditable]'))
      )
        return false;
      for (
        let el: Element | null = target;
        el && el !== root;
        el = el.parentElement
      ) {
        if (el.scrollTop > 0 && el.scrollHeight > el.clientHeight) return false;
      }
      return true;
    };

    document.addEventListener(
      'touchstart',
      (event) => {
        reset();
        if (!canStart(event)) return;
        const touch = event.touches[0];
        start = { x: touch.clientX, y: touch.clientY };
      },
      { passive: true, signal: listen },
    );
    document.addEventListener(
      'touchmove',
      (event) => {
        if (!start) return;
        const touch = event.touches[0];
        const dx = touch.clientX - start.x;
        const dy = touch.clientY - start.y;
        if (!active) {
          if (Math.abs(dx) < SLOP_PX && Math.abs(dy) < SLOP_PX) return;
          // Sideways swipes and upward scrolls are not pulls.
          if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || view.scrollY > 0) {
            reset();
            return;
          }
          active = true;
          this.dragging.set(true);
        }
        if (event.cancelable) event.preventDefault();
        this.pull.set(
          Math.min(PULL_REFRESH_MAX_PX, Math.max(0, dy * RESISTANCE)),
        );
      },
      { passive: false, signal: listen },
    );
    const end = () => {
      const triggered = active && this.pull() >= PULL_REFRESH_TRIGGER_PX;
      reset();
      this.pull.set(0);
      if (!triggered) return;
      this.refreshing.set(true);
      this.refresh.emit();
      timer = setTimeout(() => {
        timer = undefined;
        this.refreshing.set(false);
      }, MIN_SPIN_MS);
    };
    document.addEventListener('touchend', end, { signal: listen });
    document.addEventListener('touchcancel', end, { signal: listen });

    destroy.onDestroy(() => {
      abort.abort();
      if (timer !== undefined) clearTimeout(timer);
      root.style.overscrollBehaviorY = overscroll;
    });
  }
}
