import { isPlatformBrowser } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, inject, PLATFORM_ID } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  EQUIPMENT_LABELS,
  exerciseVideoSource,
  MUSCLE_LABELS,
  type Exercise,
} from '@all-in-one/applets/health/contracts';
import { AioButton, AioCardDirectives, AioTranslate } from '@all-in-one/ui';
import { API_BASE_URL } from '@all-in-one/web/shared';
import { CUSTOMER_APP_URL, injectCustomerLinks } from '../customer-url';
import {
  EXERCISE_PAGES,
  EXERCISES_PATH,
  exercisePath,
  LEVEL_LABELS,
} from './exercise-data';

@Component({
  selector: 'public-exercise',
  imports: [RouterLink, AioButton, AioCardDirectives, AioTranslate],
  template: `
    <article class="mx-auto flex max-w-3xl flex-col gap-6 leading-8">
      <nav
        [attr.aria-label]="'مسیر' | aioTranslate"
        class="text-sm text-muted-foreground"
      >
        <a class="underline" [routerLink]="'/' + exercisesPath">{{
          'حرکات ورزشی' | aioTranslate
        }}</a>
      </nav>
      <header class="flex flex-col gap-3">
        <h1 class="text-3xl leading-[1.5] font-bold text-balance">
          {{ 'آموزش {0}' | aioTranslate: [exercise.name | aioTranslate] }}
        </h1>
        <ul class="flex flex-wrap gap-2 text-sm text-muted-foreground">
          @for (label of tags; track label) {
            <li class="rounded-full bg-muted px-3 py-1">
              {{ label | aioTranslate }}
            </li>
          }
        </ul>
      </header>

      @if (clip(); as src) {
        <video
          class="aspect-square w-full max-w-md rounded-2xl bg-muted"
          [src]="src"
          controls
          muted
          loop
          playsinline
          preload="metadata"
          [attr.aria-label]="exercise.name | aioTranslate"
        ></video>
      } @else if (exercise.guide; as guide) {
        <img
          class="w-full max-w-md rounded-2xl bg-muted"
          [src]="customerBase + '/' + guide.imageUrl"
          [alt]="exercise.name | aioTranslate"
          width="480"
          height="480"
          loading="lazy"
        />
      }
      @if (otherVideo(); as url) {
        <a
          class="text-primary underline"
          [href]="url"
          target="_blank"
          rel="noopener"
          >{{ 'دیدن ویدیوی حرکت' | aioTranslate }}</a
        >
      }

      <section aria-labelledby="steps" class="flex flex-col gap-2">
        <h2 id="steps" class="text-xl font-semibold">
          {{ 'روش انجام' | aioTranslate }}
        </h2>
        <ol class="list-decimal ps-6">
          @for (step of exercise.instructions; track $index) {
            <li>{{ step | aioTranslate }}</li>
          }
        </ol>
      </section>

      @if (exercise.mistakes.length) {
        <section aria-labelledby="mistakes" class="flex flex-col gap-2">
          <h2 id="mistakes" class="text-xl font-semibold">
            {{ 'اشتباه‌های رایج' | aioTranslate }}
          </h2>
          <ul class="list-disc ps-6">
            @for (mistake of exercise.mistakes; track $index) {
              <li>{{ mistake | aioTranslate }}</li>
            }
          </ul>
        </section>
      }

      @if (alternatives.length) {
        <section aria-labelledby="alternatives" class="flex flex-col gap-2">
          <h2 id="alternatives" class="text-xl font-semibold">
            {{ 'حرکت‌های جایگزین' | aioTranslate }}
          </h2>
          <ul class="flex flex-wrap gap-2">
            @for (other of alternatives; track other.slug) {
              <li>
                <a
                  aioBtn
                  variant="outline"
                  class="min-h-11"
                  [routerLink]="'/' + path(other.slug)"
                  >{{ other.name | aioTranslate }}</a
                >
              </li>
            }
          </ul>
        </section>
      }

      <section aioCard class="flex flex-col items-start gap-3 p-5">
        <h2 class="text-lg font-semibold">
          {{ 'این حرکت را در برنامه تمرینت بگذار' | aioTranslate }}
        </h2>
        <a
          aioBtn
          size="lg"
          class="min-h-12 w-full whitespace-normal sm:w-auto"
          [href]="customerLinks.signupFor('health')"
          >{{ 'شروع رایگان' | aioTranslate }}</a
        >
      </section>
    </article>
  `,
})
export class ExercisePage {
  protected readonly exercise = inject(ActivatedRoute).snapshot.data[
    'exercise'
  ] as Exercise;
  protected readonly tags = [
    MUSCLE_LABELS[this.exercise.muscle],
    EQUIPMENT_LABELS[this.exercise.equipment],
    LEVEL_LABELS[this.exercise.level],
  ];
  protected readonly exercisesPath = EXERCISES_PATH;
  protected readonly path = exercisePath;
  protected readonly customerLinks = injectCustomerLinks();
  protected readonly customerBase = inject(CUSTOMER_APP_URL).replace(/\/$/, '');
  protected readonly alternatives = this.exercise.alternatives.flatMap((slug) =>
    EXERCISE_PAGES.filter((e) => e.slug === slug),
  );

  private readonly api = inject(API_BASE_URL);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  /** Videos live in the database (uploaded clips), so the page asks for them in the browser only. */
  private readonly videos = httpResource<Record<string, string>>(() =>
    this.browser ? `${this.api}/health/exercise-videos` : undefined,
  );
  private readonly video = computed(
    () =>
      (this.videos.hasValue()
        ? this.videos.value()[this.exercise.slug]
        : null) ?? this.exercise.videoUrl,
  );
  protected readonly clip = computed(() => {
    const url = this.video();
    return url && exerciseVideoSource(url) === 'clip' ? url : null;
  });
  protected readonly otherVideo = computed(() => {
    const url = this.video();
    return url && exerciseVideoSource(url) !== 'clip' ? url : null;
  });
}
