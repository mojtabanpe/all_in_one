import { httpResource } from '@angular/common/http';
import { Component, computed, inject } from '@angular/core';
import type { StarterDeck } from '@all-in-one/applets/english-learning/contracts';
import {
  type Diet,
  MEAL_TYPE_LABELS,
  type Recipe,
  type WorkoutProgram,
} from '@all-in-one/applets/health/contracts';
import { AioCatalogCard, type AioCatalogItem } from '@all-in-one/ui';
import { API_BASE_URL, faNumber } from '@all-in-one/web/shared';

/** Read-only view of the applet catalogs seeded in the database. */
@Component({
  selector: 'admin-content',
  imports: [AioCatalogCard],
  template: `
    <div class="flex flex-col gap-4">
      <h1 class="text-2xl font-bold">محتوای اپلت‌ها</h1>
      <div class="grid gap-3 md:grid-cols-2">
        @for (catalog of catalogs(); track catalog.title) {
          <section
            aioCatalogCard
            [title]="catalog.title"
            [description]="catalog.description"
            [items]="catalog.items"
          ></section>
        }
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
  protected readonly catalogs = computed<
    readonly { title: string; description: string; items: AioCatalogItem[] }[]
  >(() => [
    {
      title: 'دسته‌های آماده انگلیسی',
      description: `${faNumber((this.decks.value() ?? []).length)} دسته`,
      items: (this.decks.value() ?? []).map((d) => ({
        id: d.slug,
        title: d.title,
        badge: `${d.level}، ${faNumber(d.cardCount)}`,
        badgeDirection: 'ltr',
      })),
    },
    {
      title: 'رژیم‌ها',
      description: `${faNumber((this.diets.value() ?? []).length)} رژیم`,
      items: (this.diets.value() ?? []).map((d) => ({
        id: d.slug,
        title: d.name,
        description: d.summary,
      })),
    },
    {
      title: 'دستور پخت‌ها',
      description: `${faNumber((this.recipes.value() ?? []).length)} دستور`,
      items: (this.recipes.value() ?? []).map((r) => ({
        id: r.slug,
        title: r.title,
        badge: `${MEAL_TYPE_LABELS[r.mealType]}، ${faNumber(r.calories)}`,
        badgeVariant: 'secondary',
      })),
    },
    {
      title: 'برنامه‌های تمرینی',
      description: `${faNumber((this.programs.value() ?? []).length)} برنامه`,
      items: (this.programs.value() ?? []).map((p) => ({
        id: p.slug,
        title: p.title,
      })),
    },
  ]);
}
