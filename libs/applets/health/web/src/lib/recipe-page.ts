import { httpResource } from '@angular/common/http';
import { Component, inject, input } from '@angular/core';
import {
  type Recipe,
  MEAL_TYPE_LABELS,
} from '@all-in-one/applets/health/contracts';
import {
  AioTranslate,
  AioMetric,
  AioBadge,
  AioButton,
  AioCardDirectives,
  AioIcon,
  AioSkeleton,
  provideIcons,
  AioLocale,
} from '@all-in-one/ui';

import { lucideArrowRight, lucideChefHat, lucideClock } from '@ng-icons/lucide';
import { Location } from '@angular/common';
import { HealthApi } from './health-api';

@Component({
  selector: 'health-recipe-page',
  imports: [
    AioMetric,
    AioBadge,
    AioButton,
    AioCardDirectives,
    AioIcon,
    AioSkeleton,
    AioTranslate,
  ],
  providers: [provideIcons({ lucideArrowRight, lucideChefHat, lucideClock })],
  template: `
    <div class="mx-auto flex max-w-2xl flex-col gap-4">
      <button
        aioBtn
        variant="ghost"
        size="sm"
        class="self-start"
        (click)="back()"
      >
        <aio-icon name="lucideArrowRight" size="sm" class="ltr:-scale-x-100" />
        {{ 'بازگشت' | aioTranslate }}
      </button>
      @if (recipe.value(); as r) {
        <article aioCard>
          <div aioCardHeader>
            <h2 aioCardTitle class="flex items-center gap-2 text-xl">
              <aio-icon name="lucideChefHat" size="sm" />{{
                r.title | aioTranslate
              }}
            </h2>
            <div class="flex flex-wrap gap-1.5">
              <span aioBadge variant="secondary">{{
                mealTypeLabels[r.mealType] | aioTranslate
              }}</span>
              <span aioBadge variant="outline" class="gap-1"
                ><aio-icon name="lucideClock" size="xs" />{{
                  '{0} دقیقه' | aioTranslate: [fa(r.prepMinutes)]
                }}</span
              >
              @for (tag of r.tags; track tag) {
                <span aioBadge variant="outline">{{ tag | aioTranslate }}</span>
              }
            </div>
          </div>
          <div aioCardContent class="flex flex-col gap-4">
            <dl class="grid grid-cols-4 gap-2 text-center">
              <div
                class="glass rounded-2xl p-2"
                aioMetric
                [label]="'کالری' | aioTranslate"
                [value]="fa(r.calories)"
                labelClass="text-muted-foreground text-xs"
                valueClass="font-bold"
                [definition]="true"
              ></div>
              <div
                class="glass rounded-2xl p-2"
                aioMetric
                [label]="'پروتئین' | aioTranslate"
                [value]="fa(r.proteinG) + 'g'"
                labelClass="text-muted-foreground text-xs"
                valueClass="font-bold"
                [definition]="true"
              ></div>
              <div
                class="glass rounded-2xl p-2"
                aioMetric
                [label]="'کربوهیدرات' | aioTranslate"
                [value]="fa(r.carbsG) + 'g'"
                labelClass="text-muted-foreground text-xs"
                valueClass="font-bold"
                [definition]="true"
              ></div>
              <div
                class="glass rounded-2xl p-2"
                aioMetric
                [label]="'چربی' | aioTranslate"
                [value]="fa(r.fatG) + 'g'"
                labelClass="text-muted-foreground text-xs"
                valueClass="font-bold"
                [definition]="true"
              ></div>
            </dl>
            <section>
              <h3 class="mb-2 font-semibold">
                {{ 'مواد لازم' | aioTranslate }}
              </h3>
              <ul class="flex flex-col gap-1 text-sm">
                @for (i of r.ingredients; track i.item) {
                  <li
                    class="flex justify-between gap-2 border-b border-dashed pb-1"
                  >
                    <span>{{ i.item | aioTranslate }}</span
                    ><span class="text-muted-foreground">{{
                      i.amount | aioTranslate
                    }}</span>
                  </li>
                }
              </ul>
            </section>
            <section>
              <h3 class="mb-2 font-semibold">
                {{ 'طرز تهیه' | aioTranslate }}
              </h3>
              <ol
                class="flex [list-style-type:persian] flex-col gap-1.5 ps-5 text-sm"
              >
                @for (step of r.steps; track $index) {
                  <li>{{ step | aioTranslate }}</li>
                }
              </ol>
            </section>
            <p class="text-muted-foreground text-xs">
              {{
                'ارزش غذایی تقریبی است. اگر بیماری یا شرایط خاص دارید، با پزشک یا متخصص تغذیه مشورت کنید.'
                  | aioTranslate
              }}
            </p>
          </div>
        </article>
      } @else {
        <div aioSkeleton class="h-96 rounded-3xl"></div>
      }
    </div>
  `,
})
export class RecipePage {
  protected readonly locale = inject(AioLocale);

  /** Route param. */
  readonly slug = input.required<string>();
  private readonly api = inject(HealthApi);
  private readonly location = inject(Location);
  protected readonly mealTypeLabels = MEAL_TYPE_LABELS;
  protected readonly fa = (n: number) => this.locale.number(n);
  protected readonly recipe = httpResource<Recipe>(
    () => `${this.api.base}/recipes/${this.slug()}`,
  );

  protected back() {
    this.location.back();
  }
}
