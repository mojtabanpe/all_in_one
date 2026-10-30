import { httpResource } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  READING_LEVELS,
  READING_TOPICS,
  type ReadingLevel,
  type ReadingText,
  type ReadingTopic,
} from '@all-in-one/applets/english-learning/contracts';
import {
  AioButton,
  AioConfirm,
  AioDialog,
  AioDialogActions,
  AioDialogBody,
  AioEmptyDirectives,
  AioFieldDirectives,
  AioIcon,
  AioInput,
  AioNativeSelect,
  AioNativeSelectOption,
  AioSkeleton,
  AioSpinner,
  AioTextarea,
  aioToast,
  provideIcons,
} from '@all-in-one/ui';
import { apiErrorMessage, faDate, faNumber } from '@all-in-one/web/shared';
import {
  lucideFileText,
  lucidePlus,
  lucideSparkles,
  lucideStar,
  lucideTrash2,
} from '@ng-icons/lucide';
import { EnglishApi } from './english-api';

/** Reading texts (Recall texts page): paste your own or let AI write ~1,000 words. */
@Component({
  selector: 'english-learning-texts',
  imports: [
    AioButton,
    AioDialog,
    AioDialogActions,
    AioDialogBody,
    AioEmptyDirectives,
    AioFieldDirectives,
    AioIcon,
    AioInput,
    AioNativeSelect,
    AioNativeSelectOption,
    AioSkeleton,
    AioSpinner,
    AioTextarea,
    RouterLink,
  ],
  providers: [
    provideIcons({
      lucideFileText,
      lucidePlus,
      lucideSparkles,
      lucideStar,
      lucideTrash2,
    }),
  ],
  template: `
    <div class="flex flex-col gap-6">
      <header class="flex items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold">خواندن</h1>
          <p class="text-muted-foreground text-sm">
            متن بخوان، بشنو و واژه‌های تازه را کارت کن.
          </p>
        </div>
        <button aioBtn (click)="openNew()">
          <aio-icon name="lucidePlus" size="sm" />
          متن جدید
        </button>
      </header>

      @if (texts.isLoading() && !texts.hasValue()) {
        <div aioSkeleton class="h-20 rounded-2xl"></div>
        <div aioSkeleton class="h-20 rounded-2xl"></div>
      } @else if (!(texts.value() ?? []).length) {
        <div aioEmpty class="glass rounded-2xl">
          <div aioEmptyHeader>
            <div aioEmptyMedia variant="icon" class="text-primary">
              <aio-icon name="lucideFileText" />
            </div>
            <h2 aioEmptyTitle>هنوز متنی نداری</h2>
            <p aioEmptyDescription>
              یک متن انگلیسی بچسبان یا بگذار هوش مصنوعی درباره موضوع دلخواهت
              بنویسد.
            </p>
          </div>
          <div aioEmptyContent>
            <button aioBtn class="btn-3d" (click)="openNew()">اولین متن</button>
          </div>
        </div>
      } @else {
        <ul class="glass divide-border/60 flex flex-col divide-y rounded-2xl">
          @for (text of texts.value() ?? []; track text.id) {
            <li class="flex min-h-16 items-center gap-3 px-4">
              <a
                [routerLink]="['../read', text.id]"
                class="flex min-w-0 flex-1 flex-col py-3"
              >
                <span
                  dir="ltr"
                  lang="en"
                  class="truncate text-start font-semibold"
                  >{{ text.title }}</span
                >
                <span
                  class="text-muted-foreground flex items-center gap-2 text-sm"
                >
                  {{ fa(words(text)) }} واژه، {{ faDate(text.createdAt) }}
                  @if (text.ai) {
                    <span
                      class="bg-accent text-accent-foreground rounded-full px-2 text-xs"
                      >هوش مصنوعی</span
                    >
                  }
                  @if (text.rating) {
                    <span
                      class="flex items-center gap-0.5 text-[var(--streak)]"
                      [attr.aria-label]="fa(text.rating) + ' ستاره'"
                    >
                      <aio-icon name="lucideStar" size="xs" />{{
                        fa(text.rating)
                      }}
                    </span>
                  }
                </span>
              </a>
              <button
                aioBtn
                variant="ghost"
                size="icon"
                class="text-destructive"
                (click)="remove(text)"
                [attr.aria-label]="'حذف ' + text.title"
              >
                <aio-icon name="lucideTrash2" size="sm" />
              </button>
            </li>
          }
        </ul>
      }
    </div>

    <aio-dialog
      [open]="modalOpen()"
      (openChange)="$event || closeModal()"
      title="متن جدید"
      description="متن خودت را بچسبان یا با هوش مصنوعی بنویس."
      contentClass="applet-english"
    >
      <ng-template aioDialogBody>
        <form
          id="english-text-form"
          class="flex flex-col gap-4"
          (submit)="$event.preventDefault(); save()"
        >
          <div class="glass flex flex-col gap-3 rounded-2xl p-3">
            <div class="grid grid-cols-2 gap-3">
              <div aioField>
                <label aioFieldLabel for="text-topic">موضوع</label>
                <aio-native-select
                  selectId="text-topic"
                  [value]="topic()"
                  (valueChange)="topic.set($any($event))"
                >
                  @for (t of topics; track t.id) {
                    <option aioNativeSelectOption [value]="t.id">
                      {{ t.fa }}
                    </option>
                  }
                </aio-native-select>
              </div>
              <div aioField>
                <label aioFieldLabel for="text-level">سطح</label>
                <aio-native-select
                  selectId="text-level"
                  [value]="level()"
                  (valueChange)="level.set($any($event))"
                >
                  @for (l of levels; track l.id) {
                    <option aioNativeSelectOption [value]="l.id">
                      {{ l.fa }}
                    </option>
                  }
                </aio-native-select>
              </div>
            </div>
            <button
              aioBtn
              type="button"
              variant="outline"
              [disabled]="generating()"
              (click)="generate()"
            >
              @if (generating()) {
                <aio-spinner />
                در حال نوشتن (حدود یک دقیقه)…
              } @else {
                <aio-icon name="lucideSparkles" size="sm" />
                نوشتن با هوش مصنوعی
              }
            </button>
            @if (feedbackFrom()) {
              <p class="text-muted-foreground text-xs">
                با توجه به امتیازی که به «<span dir="ltr">{{
                  feedbackFrom()
                }}</span
                >» دادی نوشته شد.
              </p>
            }
          </div>
          <div aioField>
            <label aioFieldLabel for="text-title">عنوان</label>
            <input
              aioInput
              id="text-title"
              dir="ltr"
              lang="en"
              [value]="title()"
              (input)="title.set($any($event.target).value)"
            />
          </div>
          <div aioField>
            <label aioFieldLabel for="text-body">متن</label>
            <textarea
              aioTextarea
              id="text-body"
              dir="ltr"
              lang="en"
              rows="8"
              placeholder="Paste an English text here…"
              [value]="body()"
              (input)="
                body.set($any($event.target).value); aiWritten.set(false)
              "
            ></textarea>
          </div>
          @if (formError()) {
            <p class="text-destructive text-sm" role="alert">
              {{ formError() }}
            </p>
          }
        </form>
      </ng-template>
      <ng-template aioDialogActions>
        <button aioBtn variant="outline" (click)="closeModal()">انصراف</button>
        <button
          aioBtn
          type="submit"
          form="english-text-form"
          [disabled]="saving() || generating()"
        >
          ذخیره و خواندن
        </button>
      </ng-template>
    </aio-dialog>
  `,
})
export class TextsPage {
  private readonly api = inject(EnglishApi);
  private readonly confirm = inject(AioConfirm);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly texts = httpResource<ReadingText[]>(
    () => `${this.api.base}/texts`,
  );
  protected readonly topics = READING_TOPICS;
  protected readonly levels = READING_LEVELS;
  protected readonly modalOpen = signal(false);
  protected readonly title = signal('');
  protected readonly body = signal('');
  protected readonly topic = signal<ReadingTopic>('technology');
  protected readonly level = signal<ReadingLevel>('B2');
  protected readonly generating = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  /** The text in the sheet came from AI, so it can be rated after reading. */
  protected readonly aiWritten = signal(false);
  protected readonly feedbackFrom = signal('');
  /** Ignores a generation that finishes after the sheet was closed. */
  private generation = 0;

  protected readonly fa = (n: number) => faNumber(n);
  protected readonly faDate = (iso: string) => faDate(iso);
  protected readonly words = (t: ReadingText) =>
    t.body.split(/\s+/).filter(Boolean).length;

  protected openNew() {
    this.title.set('');
    this.body.set('');
    this.aiWritten.set(false);
    this.feedbackFrom.set('');
    this.formError.set('');
    this.generating.set(false);
    this.generation++;
    this.modalOpen.set(true);
  }

  protected closeModal() {
    this.generation++;
    this.generating.set(false);
    this.modalOpen.set(false);
  }

  protected async generate() {
    const run = ++this.generation;
    this.formError.set('');
    this.generating.set(true);
    try {
      const text = await this.api.readingText(this.topic(), this.level());
      if (run !== this.generation) return;
      this.title.set(text.title);
      this.body.set(text.body);
      this.aiWritten.set(true);
      this.feedbackFrom.set(text.feedbackFrom ?? '');
    } catch (error) {
      if (run === this.generation)
        this.formError.set(apiErrorMessage(error, 'متن نوشته نشد.'));
    } finally {
      if (run === this.generation) this.generating.set(false);
    }
  }

  protected async save() {
    const body = this.body().trim();
    const title =
      this.title().trim() || body.split(/\s+/).slice(0, 6).join(' ');
    if (!body) {
      this.formError.set('متنی که می‌خواهی بخوانی را بنویس یا بچسبان.');
      return;
    }
    if (body.length > 50000) {
      this.formError.set('متن باید کمتر از ۵۰٬۰۰۰ نویسه باشد.');
      return;
    }
    this.saving.set(true);
    try {
      const text = await this.api.createText(
        title.slice(0, 200),
        body,
        this.aiWritten(),
      );
      this.closeModal();
      await this.router.navigate(['../read', text.id], {
        relativeTo: this.route,
      });
    } catch (error) {
      this.formError.set(apiErrorMessage(error, 'متن ذخیره نشد.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(text: ReadingText) {
    const ok = await this.confirm.ask({
      title: 'این متن حذف شود؟',
      description: 'کارت‌هایی که از آن ساختی در دسته‌هایشان می‌مانند.',
      confirmText: 'حذف',
      destructive: true,
    });
    if (!ok) return;
    try {
      await this.api.removeText(text.id);
      this.texts.update((list) => (list ?? []).filter((t) => t.id !== text.id));
      aioToast.success('متن حذف شد');
    } catch (error) {
      aioToast.error(apiErrorMessage(error));
    }
  }
}
