import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  computed,
  contentChild,
  Directive,
  inject,
  Injectable,
  input,
  model,
  signal,
  TemplateRef,
} from '@angular/core';
import { HlmButton } from '@spartan-ng/helm/button';
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
  imports: [HlmDialogImports, HlmDrawerImports, HlmButton, NgTemplateOutlet],
  template: `
    @if (isMobile()) {
      <hlm-drawer
        direction="bottom"
        [state]="state()"
        (closed)="open.set(false)"
      >
        <hlm-drawer-content
          *hlmDrawerPortal="let ctx"
          [attr.dir]="language() === 'en' ? 'ltr' : 'rtl'"
          [attr.lang]="language()"
          [class]="
            'mx-auto w-full min-w-0 max-w-full overflow-hidden pb-[calc(1rem+env(safe-area-inset-bottom,0px))] data-[vaul-drawer-direction=bottom]:max-h-[calc(100dvh-1rem)] ' +
            contentClass()
          "
        >
          <hlm-drawer-header class="relative min-w-0 shrink-0 pe-24 text-start">
            <h2 hlmDrawerTitle class="min-w-0 break-words">{{ title() }}</h2>
            @if (description()) {
              <p hlmDrawerDescription class="min-w-0 break-words">
                {{ description() }}
              </p>
            }
            <button
              hlmBtn
              hlmDrawerClose
              variant="ghost"
              class="absolute end-4 top-2 min-h-11 min-w-11"
              [attr.aria-label]="closeText()"
            >
              {{ closeText() }}
            </button>
          </hlm-drawer-header>
          @if (body(); as b) {
            <div
              class="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pb-4"
              data-slot="dialog-body"
              tabindex="0"
              role="region"
              [attr.aria-label]="title()"
            >
              <ng-container [ngTemplateOutlet]="b.template" />
            </div>
          }
          @if (footer(); as f) {
            <hlm-drawer-footer class="shrink-0">
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
          [attr.dir]="language() === 'en' ? 'ltr' : 'rtl'"
          [attr.lang]="language()"
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
              [attr.aria-label]="title()"
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
  readonly title = input.required<string>();
  readonly description = input<string>();
  /**
   * Classes for the dialog/sheet surface. The surface is portalled to <body>, so
   * pass the applet accent here (`contentClass="applet-planner"`) to keep its colours.
   */
  readonly contentClass = input('');
  readonly language = input<'fa' | 'en'>('fa');
  protected readonly closeText = computed(() =>
    this.language() === 'en' ? 'Close' : 'بستن',
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
  imports: [AioDialog, AioDialogActions, HlmButton],
  template: `
    @let request = confirm.pending();
    <aio-dialog
      [open]="!!request"
      (openChange)="!$event && confirm.settle(false)"
      [title]="request?.title ?? ''"
      [description]="request?.description"
      [language]="request?.language ?? 'fa'"
    >
      <ng-template aioDialogActions>
        <button hlmBtn variant="outline" (click)="confirm.settle(false)">
          {{
            request?.cancelText ??
              (request?.language === 'en' ? 'Cancel' : 'انصراف')
          }}
        </button>
        <button
          hlmBtn
          [variant]="request?.destructive ? 'destructive' : 'default'"
          (click)="confirm.settle(true)"
        >
          {{
            request?.confirmText ??
              (request?.language === 'en' ? 'Confirm' : 'تأیید')
          }}
        </button>
      </ng-template>
    </aio-dialog>
  `,
})
export class AioConfirmHost {
  protected readonly confirm = inject(AioConfirm);
}
