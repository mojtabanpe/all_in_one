import { httpResource } from '@angular/common/http';
import { Component, inject, input } from '@angular/core';
import {
  type Recipe,
  MEAL_TYPE_LABELS,
} from '@all-in-one/applets/health/contracts';
import {
  AioBadge,
  AioButton,
  AioCardDirectives,
  AioIcon,
  AioSkeleton,
  provideIcons,
} from '@all-in-one/ui';
import { faNumber } from '@all-in-one/web/shared';
import { lucideArrowRight, lucideChefHat, lucideClock } from '@ng-icons/lucide';
import { Location } from '@angular/common';
import { HealthApi } from './health-api';

@Component({
  selector: 'health-recipe-page',
  imports: [AioBadge, AioButton, AioCardDirectives, AioIcon, AioSkeleton],
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
        <aio-icon name="lucideArrowRight" size="sm" />
        بازگشت
      </button>
      @if (recipe.value(); as r) {
        <article aioCard>
          <div aioCardHeader>
            <h2 aioCardTitle class="flex items-center gap-2 text-xl">
              <aio-icon name="lucideChefHat" size="sm" />{{ r.title }}
            </h2>
            <div class="flex flex-wrap gap-1.5">
              <span aioBadge variant="secondary">{{
                mealTypeLabels[r.mealType]
              }}</span>
              <span aioBadge variant="outline" class="gap-1"
                ><aio-icon name="lucideClock" size="xs" />{{
                  fa(r.prepMinutes)
                }}
                دقیقه</span
              >
              @for (tag of r.tags; track tag) {
                <span aioBadge variant="outline">{{ tag }}</span>
              }
            </div>
          </div>
          <div aioCardContent class="flex flex-col gap-4">
            <dl class="grid grid-cols-4 gap-2 text-center">
              <div class="glass rounded-2xl p-2">
                <dt class="text-muted-foreground text-xs">کالری</dt>
                <dd class="font-bold">{{ fa(r.calories) }}</dd>
              </div>
              <div class="glass rounded-2xl p-2">
                <dt class="text-muted-foreground text-xs">پروتئین</dt>
                <dd class="font-bold">{{ fa(r.proteinG) }}g</dd>
              </div>
              <div class="glass rounded-2xl p-2">
                <dt class="text-muted-foreground text-xs">کربوهیدرات</dt>
                <dd class="font-bold">{{ fa(r.carbsG) }}g</dd>
              </div>
              <div class="glass rounded-2xl p-2">
                <dt class="text-muted-foreground text-xs">چربی</dt>
                <dd class="font-bold">{{ fa(r.fatG) }}g</dd>
              </div>
            </dl>
            <section>
              <h3 class="mb-2 font-semibold">مواد لازم</h3>
              <ul class="flex flex-col gap-1 text-sm">
                @for (i of r.ingredients; track i.item) {
                  <li
                    class="flex justify-between gap-2 border-b border-dashed pb-1"
                  >
                    <span>{{ i.item }}</span
                    ><span class="text-muted-foreground">{{ i.amount }}</span>
                  </li>
                }
              </ul>
            </section>
            <section>
              <h3 class="mb-2 font-semibold">طرز تهیه</h3>
              <ol
                class="flex [list-style-type:persian] flex-col gap-1.5 ps-5 text-sm"
              >
                @for (step of r.steps; track $index) {
                  <li>{{ step }}</li>
                }
              </ol>
            </section>
            <p class="text-muted-foreground text-xs">
              ارزش غذایی تقریبی است. اگر بیماری یا شرایط خاص دارید، با پزشک یا
              متخصص تغذیه مشورت کنید.
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
  /** Route param. */
  readonly slug = input.required<string>();
  private readonly api = inject(HealthApi);
  private readonly location = inject(Location);
  protected readonly mealTypeLabels = MEAL_TYPE_LABELS;
  protected readonly fa = (n: number) => faNumber(n);
  protected readonly recipe = httpResource<Recipe>(
    () => `${this.api.base}/recipes/${this.slug()}`,
  );

  protected back() {
    this.location.back();
  }
}
