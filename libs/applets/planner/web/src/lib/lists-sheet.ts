import { NgTemplateOutlet } from '@angular/common';
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
  type PlannerList,
  type PlannerTag,
} from '@all-in-one/applets/planner/contracts';
import {
  AioButton,
  AioConfirm,
  AioIcon,
  AioInputGroupDirectives,
  aioToast,
  provideIcons,
} from '@all-in-one/ui';
import { apiErrorMessage } from '@all-in-one/web/shared';
import {
  lucideCalendarDays,
  lucideCircleCheckBig,
  lucideEllipsis,
  lucideFolder,
  lucideHash,
  lucideInbox,
  lucideLayers,
  lucidePlus,
  lucideSun,
  lucideSunrise,
  lucideTrash2,
  lucideUserCheck,
  lucideUsers,
} from '@ng-icons/lucide';
import { ColorPicker } from './color-picker';
import { TONE } from './colors';
import { PlannerApi } from './planner-api';

export interface SmartView {
  key: string;
  label: string;
  icon: string;
}

export const SMART_VIEWS: SmartView[] = [
  { key: 'today', label: 'امروز', icon: 'lucideSun' },
  { key: 'tomorrow', label: 'فردا', icon: 'lucideSunrise' },
  { key: 'week', label: '۷ روز آینده', icon: 'lucideCalendarDays' },
  { key: 'all', label: 'همه', icon: 'lucideLayers' },
  { key: 'assigned', label: 'سپرده به من', icon: 'lucideUserCheck' },
];

type Adding = 'list' | 'folder' | 'tag' | null;

/**
 * TickTick's sidebar as a sheet: smart lists, lists in folders, tags,
 * completed and trash, with quick creation of lists, folders and tags.
 */
@Component({
  selector: 'planner-lists-sheet',
  imports: [
    AioButton,
    AioIcon,
    AioInputGroupDirectives,
    ColorPicker,
    NgTemplateOutlet,
  ],
  providers: [
    provideIcons({
      lucideCalendarDays,
      lucideCircleCheckBig,
      lucideEllipsis,
      lucideFolder,
      lucideHash,
      lucideInbox,
      lucideLayers,
      lucidePlus,
      lucideSun,
      lucideSunrise,
      lucideTrash2,
      lucideUserCheck,
      lucideUsers,
    }),
  ],
  template: `
    <nav class="flex flex-col gap-4 pb-2" aria-label="فهرست‌ها">
      <ul class="flex flex-col">
        @for (v of smart; track v.key) {
          <ng-container
            *ngTemplateOutlet="
              row;
              context: {
                key: v.key,
                label: v.label,
                icon: v.icon,
                count: counts()[v.key],
              }
            "
          />
        }
        @if (inbox(); as box) {
          <ng-container
            *ngTemplateOutlet="
              row;
              context: {
                key: 'list:' + box.id,
                label: box.name,
                icon: 'lucideInbox',
                count: box.openCount,
              }
            "
          />
        }
      </ul>

      <section class="flex flex-col gap-1">
        <h3
          class="text-muted-foreground flex items-center justify-between px-2 text-xs font-semibold"
        >
          فهرست‌ها
          <span class="flex gap-1">
            <button
              aioBtn
              variant="ghost"
              size="sm"
              type="button"
              (click)="adding.set('folder')"
            >
              <aio-icon name="lucideFolder" size="xs" /> پوشه
            </button>
            <button
              aioBtn
              variant="ghost"
              size="sm"
              type="button"
              (click)="adding.set('list')"
            >
              <aio-icon name="lucidePlus" size="xs" /> فهرست
            </button>
          </span>
        </h3>
        @if (adding() === 'list' || adding() === 'folder') {
          <form
            aioInputGroup
            class="mb-2"
            (submit)="$event.preventDefault(); create()"
          >
            <input
              aioInputGroupInput
              [placeholder]="
                adding() === 'list' ? 'نام فهرست تازه' : 'نام پوشه تازه'
              "
              [attr.aria-label]="
                adding() === 'list' ? 'نام فهرست تازه' : 'نام پوشه تازه'
              "
              enterkeyhint="done"
              [value]="name()"
              (input)="name.set($any($event.target).value)"
            />
            <aio-input-group-addon align="inline-end">
              <button aioInputGroupButton type="submit" size="sm">ساختن</button>
            </aio-input-group-addon>
          </form>
          @if (adding() === 'list') {
            <planner-color-picker class="mb-2 block" [(value)]="color" />
          }
        }
        <ul class="flex flex-col">
          @for (l of loose(); track l.id) {
            <ng-container
              *ngTemplateOutlet="listRow; context: { $implicit: l }"
            />
          }
        </ul>
        @for (f of grouped(); track f.folder.id) {
          <details open class="group">
            <summary
              class="text-muted-foreground flex min-h-11 cursor-pointer items-center gap-2 px-2 text-sm font-semibold"
            >
              <aio-icon name="lucideFolder" size="sm" />
              <span class="flex-1">{{ f.folder.name }}</span>
              <button
                aioBtn
                variant="ghost"
                size="icon-sm"
                type="button"
                [attr.aria-label]="'حذف پوشه ' + f.folder.name"
                (click)="$event.preventDefault(); removeFolder(f.folder)"
              >
                <aio-icon name="lucideTrash2" size="xs" />
              </button>
            </summary>
            <ul class="flex flex-col ps-4">
              @for (l of f.lists; track l.id) {
                <ng-container
                  *ngTemplateOutlet="listRow; context: { $implicit: l }"
                />
              }
            </ul>
          </details>
        }
      </section>

      <section class="flex flex-col gap-1">
        <h3
          class="text-muted-foreground flex items-center justify-between px-2 text-xs font-semibold"
        >
          برچسب‌ها
          <button
            aioBtn
            variant="ghost"
            size="sm"
            type="button"
            (click)="adding.set('tag')"
          >
            <aio-icon name="lucidePlus" size="xs" /> برچسب
          </button>
        </h3>
        @if (adding() === 'tag') {
          <form
            aioInputGroup
            class="mb-2"
            (submit)="$event.preventDefault(); create()"
          >
            <input
              aioInputGroupInput
              placeholder="نام برچسب، بدون فاصله"
              aria-label="نام برچسب تازه"
              enterkeyhint="done"
              [value]="name()"
              (input)="name.set($any($event.target).value)"
            />
            <aio-input-group-addon align="inline-end">
              <button aioInputGroupButton type="submit" size="sm">ساختن</button>
            </aio-input-group-addon>
          </form>
        }
        <ul class="flex flex-col">
          @for (t of tags(); track t.id) {
            <li class="flex items-center">
              <button
                type="button"
                class="hover:bg-muted/60 flex min-h-11 flex-1 items-center gap-3 rounded-xl px-2 text-start"
                [class.bg-accent]="view() === 'tag:' + t.name"
                (click)="picked.emit('tag:' + t.name)"
              >
                <aio-icon
                  name="lucideHash"
                  size="sm"
                  [class]="tone[t.color].text"
                />
                <span class="flex-1">{{ t.name }}</span>
                <span class="text-muted-foreground text-xs">{{
                  fa(t.openCount)
                }}</span>
              </button>
              <button
                aioBtn
                variant="ghost"
                size="icon"
                type="button"
                [attr.aria-label]="'تنظیم برچسب ' + t.name"
                (click)="editTag.emit(t)"
              >
                <aio-icon name="lucideEllipsis" size="sm" />
              </button>
            </li>
          } @empty {
            <li class="text-muted-foreground px-2 text-sm">
              با نوشتن #برچسب در کادر افزودن هم برچسب ساخته می‌شود.
            </li>
          }
        </ul>
      </section>

      <ul class="border-border/60 flex flex-col border-t pt-2">
        <ng-container
          *ngTemplateOutlet="
            row;
            context: {
              key: 'completed',
              label: 'انجام‌شده',
              icon: 'lucideCircleCheckBig',
            }
          "
        />
        <ng-container
          *ngTemplateOutlet="
            row;
            context: { key: 'trash', label: 'سطل زباله', icon: 'lucideTrash2' }
          "
        />
      </ul>
    </nav>

    <ng-template
      #row
      let-key="key"
      let-label="label"
      let-icon="icon"
      let-count="count"
    >
      <li>
        <button
          type="button"
          class="hover:bg-muted/60 flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-start"
          [class.bg-accent]="view() === key"
          [attr.aria-current]="view() === key ? 'page' : null"
          (click)="picked.emit(key)"
        >
          <aio-icon [name]="icon" size="sm" class="text-primary" />
          <span class="flex-1">{{ label }}</span>
          @if (count) {
            <span class="text-muted-foreground text-xs">{{ fa(count) }}</span>
          }
        </button>
      </li>
    </ng-template>

    <ng-template #listRow let-l>
      <li class="flex items-center">
        <button
          type="button"
          class="hover:bg-muted/60 flex min-h-11 flex-1 items-center gap-3 rounded-xl px-2 text-start"
          [class.bg-accent]="view() === 'list:' + l.id"
          [attr.aria-current]="view() === 'list:' + l.id ? 'page' : null"
          (click)="picked.emit('list:' + l.id)"
        >
          <span
            [class]="'size-3 rounded-full ' + tone[asColor(l.color)].dot"
          ></span>
          <span class="flex-1">{{ l.name }}</span>
          @if (l.shared) {
            <aio-icon
              name="lucideUsers"
              size="xs"
              class="text-muted-foreground"
            />
          }
          @if (l.openCount) {
            <span class="text-muted-foreground text-xs">{{
              fa(l.openCount)
            }}</span>
          }
        </button>
        <button
          aioBtn
          variant="ghost"
          size="icon"
          type="button"
          [attr.aria-label]="'تنظیم فهرست ' + l.name"
          (click)="editList.emit(l)"
        >
          <aio-icon name="lucideEllipsis" size="sm" />
        </button>
      </li>
    </ng-template>
  `,
})
export class ListsSheet {
  private readonly api = inject(PlannerApi);
  private readonly confirm = inject(AioConfirm);

  readonly lists = input.required<PlannerList[]>();
  readonly folders = input.required<PlannerFolder[]>();
  readonly tags = input.required<PlannerTag[]>();
  readonly counts = input.required<Record<string, number>>();
  readonly view = input.required<string>();
  readonly picked = output<string>();
  readonly editList = output<PlannerList>();
  readonly editTag = output<PlannerTag>();
  /** Lists, folders or tags changed: reload them. */
  readonly changed = output<void>();

  protected readonly smart = SMART_VIEWS;
  protected readonly tone = TONE;
  protected readonly adding = signal<Adding>(null);
  protected readonly name = signal('');
  protected readonly color = signal<PlannerColor>('sky');

  protected readonly inbox = computed(() =>
    this.lists().find((l) => l.isInbox),
  );
  protected readonly loose = computed(() =>
    this.lists().filter(
      (l) =>
        !l.isInbox &&
        (!l.folderId || !this.folders().some((f) => f.id === l.folderId)),
    ),
  );
  protected readonly grouped = computed(() =>
    this.folders().map((folder) => ({
      folder,
      lists: this.lists().filter((l) => l.folderId === folder.id),
    })),
  );

  protected readonly fa = (n: number) => n.toLocaleString('fa-IR');
  protected readonly asColor = (c: string) => c as PlannerColor;

  protected async create() {
    const name = this.name().trim();
    const kind = this.adding();
    if (!name || !kind) return;
    try {
      if (kind === 'list') {
        const list = await this.api.createList({ name, color: this.color() });
        this.picked.emit(`list:${list.id}`);
      } else if (kind === 'folder') await this.api.createFolder({ name });
      else
        await this.api.createTag({
          name: name.replace(/^#/, '').replace(/\s+/g, '_'),
        });
      this.name.set('');
      this.adding.set(null);
      this.changed.emit();
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    }
  }

  protected async removeFolder(folder: PlannerFolder) {
    const ok = await this.confirm.ask({
      title: `پوشه «${folder.name}» حذف شود؟`,
      description: 'فهرست‌های داخلش می‌مانند و از پوشه بیرون می‌آیند.',
      confirmText: 'حذف پوشه',
      destructive: true,
    });
    if (!ok) return;
    try {
      await this.api.removeFolder(folder.id);
      this.changed.emit();
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    }
  }
}
