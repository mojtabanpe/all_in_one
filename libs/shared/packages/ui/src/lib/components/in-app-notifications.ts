import {
  Component,
  Injectable,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { AioButton } from '../spartan/button';
import { AioLocale, AioTranslate } from '../locale';
import { AioDialog, AioDialogActions, AioDialogBody } from './dialog';

type NotificationCopy = string | { fa: string; en: string };

export interface AioInAppNotification {
  /** Stable identifier: repeated producers cannot stack the same notification. */
  id: string;
  title: NotificationCopy;
  message: NotificationCopy;
  values?: readonly string[];
  detail?: NotificationCopy;
  actions: readonly {
    label: NotificationCopy;
    run: () => void;
    primary?: boolean;
  }[];
  onDismiss?: () => void;
}

/** Provide alongside the signed-in shell so pending messages cannot cross accounts. */
@Injectable()
export class AioInAppNotifications {
  private readonly queue = signal<readonly AioInAppNotification[]>([]);
  readonly current = computed<AioInAppNotification | null>(
    () => this.queue()[0] ?? null,
  );

  enqueue(notification: AioInAppNotification): void {
    if (this.queue().some((item) => item.id === notification.id)) return;
    this.queue.update((items) => [...items, notification]);
  }

  remove(id: string): void {
    this.queue.update((items) => items.filter((item) => item.id !== id));
  }

  dismiss(): void {
    const current = this.current();
    this.queue.update((items) => items.slice(1));
    current?.onDismiss?.();
  }
}

/** Shared Spartan composition for actionable in-app messages, separate from transient toasts. */
@Component({
  selector: 'aio-in-app-notifications',
  imports: [
    AioDialog,
    AioDialogBody,
    AioDialogActions,
    AioButton,
    AioTranslate,
  ],
  template: `
    @let notice = notifications.current();
    <aio-dialog
      [bottomSheet]="true"
      [open]="!!notice && !suspended()"
      (openChange)="!$event && !suspended() && notifications.dismiss()"
      [title]="copy(notice?.title) | aioTranslate"
      contentClass="sm:max-w-lg"
    >
      <ng-template aioDialogBody>
        <p class="break-words">
          {{ copy(notice?.message) | aioTranslate: notice?.values }}
        </p>
        @if (notice?.detail; as detail) {
          <p class="text-muted-foreground mt-3 break-words text-sm">
            {{ copy(detail) | aioTranslate }}
          </p>
        }
        <div class="mt-5 flex flex-col gap-3">
          @for (action of notice?.actions ?? []; track action) {
            <button
              aioBtn
              type="button"
              class="min-h-11 h-auto whitespace-normal py-3"
              [variant]="action.primary ? 'default' : 'outline'"
              (click)="activate(action)"
            >
              {{ copy(action.label) | aioTranslate }}
            </button>
          }
        </div>
      </ng-template>
      <ng-template aioDialogActions>
        <button
          aioBtn
          type="button"
          variant="ghost"
          class="min-h-11"
          (click)="notifications.dismiss()"
        >
          {{ 'فعلاً نه' | aioTranslate }}
        </button>
      </ng-template>
    </aio-dialog>
  `,
})
export class AioInAppNotificationHost {
  readonly suspended = input(false);
  private readonly locale = inject(AioLocale);
  protected copy(value?: NotificationCopy): string {
    return typeof value === 'string'
      ? value
      : (value?.[this.locale.language()] ?? '');
  }
  protected readonly notifications = inject(AioInAppNotifications);

  protected activate(action: AioInAppNotification['actions'][number]): void {
    this.notifications.dismiss();
    action.run();
  }
}
