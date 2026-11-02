import { AioLocale } from '../locale';
import { AioTranslate } from '../locale';
import {
  booleanAttribute,
  Component,
  inject,
  Injectable,
  input,
} from '@angular/core';
import { toast } from '@spartan-ng/brain/sonner';
import { HlmFieldError } from '@spartan-ng/helm/field';
import { HlmToaster } from '@spartan-ng/helm/sonner';
import { HlmSpinner } from '@spartan-ng/helm/spinner';

/** Wraps spartan `hlm-spinner`. */
@Component({
  selector: 'aio-spinner',
  imports: [HlmSpinner, AioTranslate],
  template: `<hlm-spinner [aria-label]="ariaLabel() | aioTranslate" />`,
})
export class AioSpinner {
  readonly ariaLabel = input('در حال بارگذاری', { alias: 'aria-label' });
}

/** Wraps spartan `hlm-field-error`; place inside an `aioField`. */
@Component({
  selector: 'aio-field-error',
  imports: [HlmFieldError],
  template: `
    <hlm-field-error [validator]="validator()" [forceShow]="forceShow()">
      <ng-content />
    </hlm-field-error>
  `,
})
export class AioFieldError {
  readonly validator = input<string>();
  readonly forceShow = input(false, { transform: booleanAttribute });
}

/**
 * Wraps spartan `hlm-toaster`. Short toasts only (directive 13): sits at the
 * bottom, above the floating bottom nav on phones. Place once per app.
 */
@Component({
  selector: 'aio-toaster',
  imports: [HlmToaster],
  template: `
    <hlm-toaster
      position="bottom-center"
      [richColors]="true"
      [offset]="offset"
      [style]="{ '--width': 'min(356px, calc(100vw - 2rem))' }"
    />
  `,
})
export class AioToaster {
  protected readonly offset = 'calc(var(--bottom-nav-space) + 0.5rem)';
}

/** Short, transient messages. Dialogs and confirmations use `AioConfirm` / `aio-dialog`. */
export const aioToast = {
  show: (message: string, description?: string) =>
    toast(message, { description }),
  success: (message: string, description?: string) =>
    toast.success(message, { description }),
  error: (message: string, description?: string) =>
    toast.error(message, { description }),
  info: (message: string, description?: string) =>
    toast.info(message, { description }),
  /** A toast with one action button, e.g. «بازگرداندن» (undo). */
  action: (message: string, label: string, onClick: () => void) =>
    toast(message, { action: { label, onClick } }),
};

/** Locale-aware notifications; translated at delivery time, including action labels. */
@Injectable({ providedIn: 'root' })
export class AioNotifications {
  private readonly locale = inject(AioLocale);
  show(message: string, description?: string) {
    return toast(this.locale.text(message), {
      description: description ? this.locale.text(description) : undefined,
    });
  }
  success(message: string, description?: string) {
    return toast.success(this.locale.text(message), {
      description: description ? this.locale.text(description) : undefined,
    });
  }
  error(message: string, description?: string) {
    return toast.error(this.locale.text(message), {
      description: description ? this.locale.text(description) : undefined,
    });
  }
  info(message: string, description?: string) {
    return toast.info(this.locale.text(message), {
      description: description ? this.locale.text(description) : undefined,
    });
  }
  action(message: string, label: string, onClick: () => void) {
    return toast(this.locale.text(message), {
      action: { label: this.locale.text(label), onClick },
    });
  }
}
