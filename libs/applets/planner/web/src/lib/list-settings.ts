import { httpResource } from '@angular/common/http';
import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  type PlannerColor,
  type PlannerFolder,
  type PlannerListDetail,
  type PlannerTag,
} from '@all-in-one/applets/planner/contracts';
import {
  AioTranslate,
  AioButton,
  AioConfirm,
  AioIcon,
  AioInput,
  AioInputGroupDirectives,
  AioSkeleton,
  provideIcons,
  AioFormField,
  AioSelectField,
  AioInputGroupSubmit,
  AioNotifications,
} from '@all-in-one/ui';
import { apiErrorMessage, AuthStore } from '@all-in-one/web/shared';
import {
  lucidePlus,
  lucideTrash2,
  lucideUserPlus,
  lucideX,
} from '@ng-icons/lucide';
import { ColorPicker } from './color-picker';
import { PlannerApi } from './planner-api';

/** A list's name, colour, folder, sections and members (TickTick list settings). */
@Component({
  selector: 'planner-list-settings',
  imports: [
    AioButton,
    AioIcon,
    AioInput,
    AioInputGroupDirectives,
    ColorPicker,
    AioSkeleton,
    AioFormField,
    AioSelectField,
    AioInputGroupSubmit,
    AioTranslate,
  ],
  providers: [
    provideIcons({ lucidePlus, lucideTrash2, lucideUserPlus, lucideX }),
  ],
  template: `
    @if (detail.hasValue()) {
      @let l = detail.value();
      <div class="flex flex-col gap-5 pb-2">
        @if (l.role === 'OWNER') {
          <aio-form-field [label]="'نام' | aioTranslate" controlId="list-name">
            <input
              aioInput
              id="list-name"
              [disabled]="l.isInbox"
              [value]="l.name"
              (change)="rename($any($event.target).value)"
            />
          </aio-form-field>
          <planner-color-picker
            [value]="color()"
            (valueChange)="setColor($event)"
          />
          @if (!l.isInbox) {
            <aio-select-field
              [label]="'پوشه' | aioTranslate"
              controlId="list-folder"
              [value]="l.folderId ?? ''"
              [options]="folders()"
              valueKey="id"
              labelKey="name"
              [emptyLabel]="'بدون پوشه' | aioTranslate"
              (valueChange)="update({ folderId: $event || null })"
            />
          }
        }

        <div class="flex flex-col gap-2">
          <span class="text-sm font-medium">{{ 'بخش‌ها' | aioTranslate }}</span>
          @for (s of l.sections; track s.id) {
            <div class="flex items-center gap-2">
              <input
                aioInput
                class="flex-1"
                [attr.aria-label]="'نام بخش ' + s.name | aioTranslate"
                [value]="s.name"
                (change)="renameSection(s.id, $any($event.target).value)"
              />
              <button
                aioBtn
                variant="ghost"
                size="icon"
                type="button"
                [attr.aria-label]="'حذف بخش ' + s.name | aioTranslate"
                (click)="removeSection(s.id, s.name)"
              >
                <aio-icon name="lucideTrash2" size="sm" />
              </button>
            </div>
          }
          <form aioInputGroup (submit)="$event.preventDefault(); addSection()">
            <input
              aioInputGroupInput
              [placeholder]="'بخش تازه، مثلاً «این هفته»' | aioTranslate"
              [attr.aria-label]="'بخش تازه' | aioTranslate"
              [value]="newSection()"
              (input)="newSection.set($any($event.target).value)"
            />
            <aio-input-group-submit
              [label]="'افزودن بخش' | aioTranslate"
              icon="lucidePlus"
            />
          </form>
        </div>

        @if (!l.isInbox) {
          <div class="flex flex-col gap-2">
            <span class="text-sm font-medium">{{ 'اعضا' | aioTranslate }}</span>
            <ul class="flex flex-col">
              @for (m of l.members; track m.userId) {
                <li class="flex min-h-11 items-center gap-2 text-sm">
                  <span class="flex-1">
                    {{ m.name || m.email }}
                    <span
                      class="text-muted-foreground block text-xs"
                      dir="ltr"
                      >{{ m.email }}</span
                    >
                  </span>
                  @if (m.role === 'OWNER') {
                    <span class="text-muted-foreground text-xs">{{
                      'صاحب فهرست' | aioTranslate
                    }}</span>
                  } @else if (l.role === 'OWNER' || m.userId === me()) {
                    <button
                      aioBtn
                      variant="ghost"
                      size="sm"
                      type="button"
                      (click)="removeMember(m.userId, m.name || m.email)"
                    >
                      {{
                        (m.userId === me() ? 'خروج' : 'برداشتن') | aioTranslate
                      }}
                    </button>
                  }
                </li>
              }
            </ul>
            @if (l.role === 'OWNER') {
              <form aioInputGroup (submit)="$event.preventDefault(); invite()">
                <input
                  aioInputGroupInput
                  type="email"
                  dir="ltr"
                  [placeholder]="'email@example.com' | aioTranslate"
                  [attr.aria-label]="'ایمیل عضو تازه' | aioTranslate"
                  [value]="email()"
                  (input)="email.set($any($event.target).value)"
                />
                <aio-input-group-addon align="inline-end">
                  <button aioInputGroupButton type="submit" size="sm">
                    <aio-icon name="lucideUserPlus" size="sm" />
                    {{ 'دعوت' | aioTranslate }}
                  </button>
                </aio-input-group-addon>
              </form>
              <p class="text-muted-foreground text-xs">
                {{
                  'اعضا همه کارهای این فهرست را می‌بینند و ویرایش می‌کنند و می‌شود کار را به آن‌ها سپرد.'
                    | aioTranslate
                }}
              </p>
            }
          </div>
          @if (l.role === 'OWNER') {
            <button
              aioBtn
              variant="ghost"
              type="button"
              class="text-destructive self-start"
              (click)="remove(l)"
            >
              <aio-icon name="lucideTrash2" size="sm" />
              {{ 'حذف فهرست' | aioTranslate }}
            </button>
          }
        }
      </div>
    } @else {
      <div aioSkeleton class="h-40 rounded-2xl"></div>
    }
  `,
})
export class ListSettings {
  private readonly notifications = inject(AioNotifications);

  private readonly api = inject(PlannerApi);
  private readonly confirm = inject(AioConfirm);
  private readonly auth = inject(AuthStore);

  readonly listId = input.required<string>();
  readonly folders = input.required<PlannerFolder[]>();
  readonly changed = output<void>();
  readonly removed = output<void>();

  protected readonly newSection = signal('');
  protected readonly email = signal('');
  protected readonly me = computed(() => this.auth.user()?.id);

  protected readonly detail = httpResource<PlannerListDetail>(
    () => `${this.api.base}/lists/${this.listId()}`,
  );
  protected readonly color = computed(() =>
    this.detail.hasValue() ? this.detail.value().color : 'sky',
  );

  protected setColor(color: PlannerColor) {
    void this.update({ color });
  }

  protected rename(value: string) {
    const name = value.trim();
    if (name) void this.update({ name });
  }

  protected async update(change: Parameters<PlannerApi['updateList']>[1]) {
    await this.run(() => this.api.updateList(this.listId(), change));
  }

  protected async addSection() {
    const name = this.newSection().trim();
    if (!name) return;
    this.newSection.set('');
    await this.run(() => this.api.addSection(this.listId(), name));
  }

  protected renameSection(id: string, value: string) {
    const name = value.trim();
    if (name) void this.run(() => this.api.renameSection(id, name));
  }

  protected async removeSection(id: string, name: string) {
    const ok = await this.confirm.ask({
      title: `بخش «${name}» حذف شود؟`,
      description: 'کارهایش در فهرست می‌مانند، بدون بخش.',
      confirmText: 'حذف بخش',
      destructive: true,
    });
    if (ok) await this.run(() => this.api.removeSection(id));
  }

  protected async invite() {
    const email = this.email().trim();
    if (!email) return;
    await this.run(async () => {
      await this.api.addMember(this.listId(), email);
      this.email.set('');
      this.notifications.success('عضو اضافه شد');
    });
  }

  protected async removeMember(userId: string, name: string) {
    const leaving = userId === this.me();
    const ok = await this.confirm.ask({
      title: leaving ? 'از این فهرست خارج می‌شوی؟' : `${name} برداشته شود؟`,
      description: 'کارهایی که به او سپرده شده بی‌مسئول می‌شوند.',
      confirmText: leaving ? 'خروج' : 'برداشتن',
      destructive: true,
    });
    if (!ok) return;
    try {
      await this.api.removeMember(this.listId(), userId);
      if (leaving) this.removed.emit();
      else this.detail.reload();
      this.changed.emit();
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    }
  }

  protected async remove(list: PlannerListDetail) {
    const ok = await this.confirm.ask({
      title: `فهرست «${list.name}» حذف شود؟`,
      description: 'همه کارهای این فهرست هم برای همیشه حذف می‌شوند.',
      confirmText: 'حذف فهرست',
      destructive: true,
    });
    if (!ok) return;
    try {
      await this.api.removeList(list.id);
      this.removed.emit();
      this.changed.emit();
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    }
  }

  private async run(call: () => Promise<unknown>) {
    try {
      await call();
      this.detail.reload();
      this.changed.emit();
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    }
  }
}

/** Rename, recolour or delete a tag. */
@Component({
  selector: 'planner-tag-settings',
  imports: [
    AioButton,
    AioIcon,
    AioInput,
    ColorPicker,
    AioFormField,
    AioTranslate,
  ],
  providers: [provideIcons({ lucideTrash2 })],
  template: `
    <div class="flex flex-col gap-5 pb-2">
      <aio-form-field [label]="'نام' | aioTranslate" controlId="tag-name">
        <input
          aioInput
          id="tag-name"
          [value]="tag().name"
          (change)="rename($any($event.target).value)"
        />
      </aio-form-field>
      <planner-color-picker
        [value]="color()"
        (valueChange)="setColor($event)"
      />
      <button
        aioBtn
        variant="ghost"
        type="button"
        class="text-destructive self-start"
        (click)="remove()"
      >
        <aio-icon name="lucideTrash2" size="sm" />
        {{ 'حذف برچسب' | aioTranslate }}
      </button>
    </div>
  `,
})
export class TagSettings {
  private readonly notifications = inject(AioNotifications);

  private readonly api = inject(PlannerApi);
  private readonly confirm = inject(AioConfirm);

  readonly tag = input.required<PlannerTag>();
  readonly changed = output<PlannerTag | null>();

  protected readonly color = computed(() => this.tag().color);

  protected setColor(color: PlannerColor) {
    void this.run(() => this.api.updateTag(this.tag().id, { color }));
  }

  protected rename(value: string) {
    const name = value.trim().replace(/^#/, '').replace(/\s+/g, '_');
    if (name && name !== this.tag().name)
      void this.run(() => this.api.updateTag(this.tag().id, { name }));
  }

  protected async remove() {
    const ok = await this.confirm.ask({
      title: `برچسب «${this.tag().name}» حذف شود؟`,
      description: 'از همه کارها برداشته می‌شود؛ خود کارها می‌مانند.',
      confirmText: 'حذف برچسب',
      destructive: true,
    });
    if (!ok) return;
    try {
      await this.api.removeTag(this.tag().id);
      this.changed.emit(null);
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    }
  }

  private async run(call: () => Promise<PlannerTag>) {
    try {
      this.changed.emit(await call());
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    }
  }
}
