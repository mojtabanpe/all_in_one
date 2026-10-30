import { httpResource } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import type { StarterDeck } from '@all-in-one/applets/english-learning/contracts';
import {
  type Diet,
  MEAL_TYPE_LABELS,
  type Recipe,
  type WorkoutProgram,
} from '@all-in-one/applets/health/contracts';
import { AioBadge, AioCardDirectives, AioItemDirectives } from '@all-in-one/ui';
import { API_BASE_URL, faNumber } from '@all-in-one/web/shared';

/** Read-only view of the applet catalogs seeded in the database. */
@Component({
  selector: 'admin-content',
  imports: [AioBadge, AioCardDirectives, AioItemDirectives],
  template: `
    <div class="flex flex-col gap-4">
      <h1 class="text-2xl font-bold">محتوای اپلت‌ها</h1>
      <div class="grid gap-3 md:grid-cols-2">
        <section aioCard>
          <div aioCardHeader>
            <h2 aioCardTitle>دسته‌های آماده انگلیسی</h2>
            <p aioCardDescription>
              {{ fa((decks.value() ?? []).length) }} دسته
            </p>
          </div>
          <div aioCardContent aioItemGroup class="flex flex-col gap-1">
            @for (d of decks.value() ?? []; track d.slug) {
              <div aioItem size="sm">
                <div aioItemContent>
                  <div aioItemTitle>{{ d.title }}</div>
                </div>
                <div aioItemActions>
                  <span aioBadge variant="outline" dir="ltr"
                    >{{ d.level }}، {{ fa(d.cardCount) }}</span
                  >
                </div>
              </div>
            }
          </div>
        </section>
        <section aioCard>
          <div aioCardHeader>
            <h2 aioCardTitle>رژیم‌ها</h2>
            <p aioCardDescription>
              {{ fa((diets.value() ?? []).length) }} رژیم
            </p>
          </div>
          <div aioCardContent aioItemGroup class="flex flex-col gap-1">
            @for (d of diets.value() ?? []; track d.slug) {
              <div aioItem size="sm">
                <div aioItemContent>
                  <div aioItemTitle>{{ d.name }}</div>
                  <div aioItemDescription>{{ d.summary }}</div>
                </div>
              </div>
            }
          </div>
        </section>
        <section aioCard>
          <div aioCardHeader>
            <h2 aioCardTitle>دستور پخت‌ها</h2>
            <p aioCardDescription>
              {{ fa((recipes.value() ?? []).length) }} دستور
            </p>
          </div>
          <div aioCardContent aioItemGroup class="flex flex-col gap-1">
            @for (r of recipes.value() ?? []; track r.slug) {
              <div aioItem size="sm">
                <div aioItemContent>
                  <div aioItemTitle>{{ r.title }}</div>
                </div>
                <div aioItemActions>
                  <span aioBadge variant="secondary"
                    >{{ mealTypeLabels[r.mealType] }}،
                    {{ fa(r.calories) }}</span
                  >
                </div>
              </div>
            }
          </div>
        </section>
        <section aioCard>
          <div aioCardHeader>
            <h2 aioCardTitle>برنامه‌های تمرینی</h2>
            <p aioCardDescription>
              {{ fa((programs.value() ?? []).length) }} برنامه
            </p>
          </div>
          <div aioCardContent aioItemGroup class="flex flex-col gap-1">
            @for (p of programs.value() ?? []; track p.slug) {
              <div aioItem size="sm">
                <div aioItemContent>
                  <div aioItemTitle>{{ p.title }}</div>
                </div>
              </div>
            }
          </div>
        </section>
      </div>
    </div>
  `,
})
export class Content {
  private readonly api = inject(API_BASE_URL);
  protected readonly decks = httpResource<StarterDeck[]>(
    () => `${this.api}/english/starter-decks`,
  );
  protected readonly diets = httpResource<Diet[]>(
    () => `${this.api}/health/diets`,
  );
  protected readonly recipes = httpResource<Recipe[]>(
    () => `${this.api}/health/recipes`,
  );
  protected readonly programs = httpResource<WorkoutProgram[]>(
    () => `${this.api}/health/programs`,
  );
  protected readonly mealTypeLabels = MEAL_TYPE_LABELS;
  protected readonly fa = (n: number) => faNumber(n);
}
