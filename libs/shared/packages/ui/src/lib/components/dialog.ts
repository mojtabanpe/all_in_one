import { AioTranslate } from '../locale';
import { AioLocale } from '../locale';
import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  afterNextRender,
  computed,
  contentChild,
  Directive,
  DestroyRef,
  ElementRef,
  inject,
  Injectable,
  input,
  model,
  signal,
  TemplateRef,
} from '@angular/core';
import { HlmButton } from '@spartan-ng/helm/button';
import { provideIcons } from '@ng-icons/core';
import { lucideX } from '@ng-icons/lucide';
import { AioIcon } from './icon';
import { HlmDialogImports } from '@spartan-ng/helm/dialog';
import { HlmDrawerImports } from '@spartan-ng/helm/drawer';
import { injectIsMobile } from './media';

/** Marks the body of an `aio-dialog`: `<ng-template aioDialogBody>…</ng-template>`. */
@Directive({ selector: 'ng-template[aioDialogBody]' })
export class AioDialogBody {
  readonly template = inject(TemplateRef);
}

/** Marks the actions (footer) of an `aio-dialog`. */
@Directive({ selector: 'ng-template[aioDialogActions]' })
export class AioDialogActions {
  readonly template = inject(TemplateRef);
}

/** Fit the portalled sheet to the visible viewport and establish its opening frame. */
@Directive({
  selector: '[aioBottomSheetSurface]',
  host: { '[attr.data-motion-ready]': 'ready()' },
})
class AioBottomSheetSurface {
  protected readonly ready = signal(false);

  constructor() {
    const element = inject(ElementRef<HTMLElement>).nativeElement;
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const root = element.ownerDocument.documentElement;
      const viewport = element.ownerDocument.defaultView?.visualViewport;
      const fitViewport = () => {
        if (!viewport) return;
        // Mobile browser chrome and the keyboard can shrink or pan the visual
        // viewport while fixed positioning still uses the layout viewport.
        const bottom = Math.max(
          0,
          root.clientHeight - viewport.offsetTop - viewport.height,
        );
        element.style.setProperty(
          '--aio-sheet-viewport-height',
          `${viewport.height}px`,
        );
        element.style.setProperty('--aio-sheet-bottom', `${bottom}px`);
      };
      fitViewport();
      viewport?.addEventListener('resize', fitViewport);
      viewport?.addEventListener('scroll', fitViewport);

      // A layout read establishes the starting transform before the next frame.
      element.getBoundingClientRect();
      const frame = requestAnimationFrame(() => this.ready.set(true));
      destroy.onDestroy(() => {
        cancelAnimationFrame(frame);
        viewport?.removeEventListener('resize', fitViewport);
        viewport?.removeEventListener('scroll', fitViewport);
      });
    });
  }
}

/**
 * Responsive dialog (directive 7): a spartan dialog on tablets/desktop and a
 * spartan bottom drawer (bottom sheet) on phones. Never a modal on phones.
 *
 * ```html
 * <aio-dialog [(open)]="editing" title="ویرایش">
 *   <ng-template aioDialogBody>…</ng-template>
 *   <ng-template aioDialogActions><button aioBtn (click)="save()">ذخیره</button></ng-template>
 * </aio-dialog>
 * ```
 */
@Component({
  selector: 'aio-dialog',
  imports: [
    HlmDialogImports,
    HlmDrawerImports,
    HlmButton,
    NgTemplateOutlet,
    AioBottomSheetSurface,
    AioTranslate,
    AioIcon,
  ],
  providers: [provideIcons({ lucideX })],
  template: `
    @if (bottomSheet() || isMobile()) {
      <hlm-drawer
        direction="bottom"
        [state]="state()"
        (closed)="open.set(false)"
      >
        <hlm-drawer-content
          *hlmDrawerPortal="let ctx"
          aioBottomSheetSurface
          [attr.dir]="activeLanguage() === 'en' ? 'ltr' : 'rtl'"
          [attr.lang]="activeLanguage()"
          [class]="
            'aio-bottom-sheet mx-auto w-full min-w-0 max-w-full overflow-hidden pb-[calc(1rem+env(safe-area-inset-bottom,0px))] ' +
            contentClass()
          "
        >
          <!-- Title and close share one row: title on the start side, a 44px round close on the end side. -->
          <hlm-drawer-header
            class="min-w-0 shrink-0 flex-row items-start gap-2 px-4 pt-2 pb-1 group-data-[vaul-drawer-direction=bottom]/drawer-content:text-start"
          >
            <div class="flex min-w-0 flex-1 flex-col gap-0.5">
              <h2
                hlmDrawerTitle
                class="min-w-0 break-words py-2 text-lg leading-7 font-semibold"
              >
                {{ title() }}
              </h2>
              @if (description()) {
                <p hlmDrawerDescription class="min-w-0 break-words">
                  {{ description() }}
                </p>
              }
            </div>
            <button
              hlmBtn
              hlmDrawerClose
              variant="ghost"
              size="icon"
              class="text-muted-foreground -me-2 size-11 shrink-0 rounded-full"
              [attr.aria-label]="closeText() | aioTranslate"
            >
              <aio-icon name="lucideX" />
            </button>
          </hlm-drawer-header>
          @if (body(); as b) {
            <div
              class="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pb-2 leading-relaxed"
              data-slot="dialog-body"
              tabindex="0"
              role="region"
              [attr.aria-label]="title() | aioTranslate"
            >
              <ng-container [ngTemplateOutlet]="b.template" />
            </div>
          }
          @if (footer(); as f) {
            <!-- Actions are written cancel-first (desktop order); on a phone the main action sits on top. -->
            <hlm-drawer-footer class="shrink-0 flex-col-reverse pt-2">
              <ng-container [ngTemplateOutlet]="f.template" />
            </hlm-drawer-footer>
          }
        </hlm-drawer-content>
      </hlm-drawer>
    } @else {
      <hlm-dialog [state]="state()" (closed)="open.set(false)">
        <hlm-dialog-content
          *hlmDialogPortal="let ctx"
          [closeLabel]="closeText()"
          [attr.dir]="activeLanguage() === 'en' ? 'ltr' : 'rtl'"
          [attr.lang]="activeLanguage()"
          [class]="
            'flex min-w-0 max-h-[calc(100dvh-2rem)] flex-col overflow-hidden ' +
            contentClass()
          "
        >
          <hlm-dialog-header class="shrink-0">
            <h2 hlmDialogTitle>{{ title() }}</h2>
            @if (description()) {
              <p hlmDialogDescription>{{ description() }}</p>
            }
          </hlm-dialog-header>
          @if (body(); as b) {
            <div
              class="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
              data-slot="dialog-body"
              tabindex="0"
              role="region"
              [attr.aria-label]="title() | aioTranslate"
            >
              <ng-container [ngTemplateOutlet]="b.template" />
            </div>
          }
          @if (footer(); as f) {
            <hlm-dialog-footer class="shrink-0">
              <ng-container [ngTemplateOutlet]="f.template" />
            </hlm-dialog-footer>
          }
        </hlm-dialog-content>
      </hlm-dialog>
    }
  `,
})
export class AioDialog {
  readonly open = model(false);
  /** Keep informational notifications in a bottom sheet at every screen size. */
  readonly bottomSheet = input(false);
  /** Shown as given: callers translate fixed copy, user content stays as written. */
  readonly title = input.required<string>();
  readonly description = input<string>();
  /**
   * Classes for the dialog/sheet surface. The surface is portalled to <body>, so
   * pass the applet accent here (`contentClass="applet-planner"`) to keep its colours.
   */
  readonly contentClass = input('');
  private readonly locale = inject(AioLocale);
  readonly language = input<'fa' | 'en'>();
  readonly activeLanguage = computed(
    () => this.language() ?? this.locale.language(),
  );
  protected readonly closeText = computed(() =>
    this.activeLanguage() === 'en' ? 'Close' : 'بستن',
  );

  protected readonly isMobile = injectIsMobile();
  protected readonly state = computed(() => (this.open() ? 'open' : 'closed'));
  protected readonly body = contentChild(AioDialogBody);
  protected readonly footer = contentChild(AioDialogActions);
}

export interface AioConfirmOptions {
  language?: 'fa' | 'en';
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

interface PendingConfirm extends AioConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

/**
 * Confirmation prompts: `await confirm.ask({ title: 'حذف شود؟' })`.
 * Rendered by `aio-confirm-host` (included in `aio-app-shell`) as a bottom
 * sheet on phones and a dialog elsewhere.
 */
@Injectable({ providedIn: 'root' })
export class AioConfirm {
  readonly pending = signal<PendingConfirm | null>(null);

  ask(options: AioConfirmOptions): Promise<boolean> {
    this.pending()?.resolve(false);
    return new Promise((resolve) => this.pending.set({ ...options, resolve }));
  }

  settle(confirmed: boolean): void {
    const pending = this.pending();
    if (!pending) return;
    this.pending.set(null);
    pending.resolve(confirmed);
  }
}

@Component({
  selector: 'aio-confirm-host',
  imports: [AioDialog, AioDialogActions, HlmButton, AioTranslate],
  template: `
    @let request = confirm.pending();
    <aio-dialog
      [open]="!!request"
      (openChange)="!$event && confirm.settle(false)"
      [title]="request?.title ?? '' | aioTranslate"
      [description]="request?.description | aioTranslate"
      [language]="locale.language()"
    >
      <ng-template aioDialogActions>
        <button hlmBtn variant="outline" (click)="confirm.settle(false)">
          {{
            request?.cancelText ?? (locale.english() ? 'Cancel' : 'انصراف')
              | aioTranslate
          }}
        </button>
        <button
          hlmBtn
          [variant]="request?.destructive ? 'destructive' : 'default'"
          (click)="confirm.settle(true)"
        >
          {{
            request?.confirmText ??
              (request?.language === 'en' ? 'Confirm' : 'تأیید') | aioTranslate
          }}
        </button>
      </ng-template>
    </aio-dialog>
  `,
})
export class AioConfirmHost {
  protected readonly locale = inject(AioLocale);
  protected readonly confirm = inject(AioConfirm);
}
