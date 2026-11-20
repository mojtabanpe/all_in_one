import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  EQUIPMENT_LABELS,
  MUSCLE_LABELS,
} from '@all-in-one/applets/health/contracts';
import { AioTranslate } from '@all-in-one/ui';
import { EXERCISES_BY_MUSCLE, exercisePath } from './exercise-data';

@Component({
  selector: 'public-exercises',
  imports: [RouterLink, AioTranslate],
  template: `
    <article class="mx-auto flex max-w-3xl flex-col gap-8 leading-8">
      <h1 class="text-3xl leading-[1.5] font-bold">
        {{ 'آموزش حرکات ورزشی با ویدیو' | aioTranslate }}
      </h1>
      @for (group of groups; track group.muscle) {
        <section
          [attr.aria-labelledby]="'muscle-' + group.muscle"
          class="flex flex-col gap-2"
        >
          <h2 [id]="'muscle-' + group.muscle" class="text-xl font-semibold">
            {{ muscleLabels[group.muscle] | aioTranslate }}
          </h2>
          <ul class="grid gap-1 sm:grid-cols-2">
            @for (exercise of group.exercises; track exercise.slug) {
              <li>
                <a
                  class="flex min-h-11 items-center gap-2 underline-offset-4 hover:underline"
                  [routerLink]="'/' + path(exercise.slug)"
                >
                  {{ exercise.name | aioTranslate }}
                  <span class="text-sm text-muted-foreground">{{
                    equipmentLabels[exercise.equipment] | aioTranslate
                  }}</span>
                </a>
              </li>
            }
          </ul>
        </section>
      }
    </article>
  `,
})
export class ExercisesPage {
  protected readonly groups = EXERCISES_BY_MUSCLE;
  protected readonly path = exercisePath;
  protected readonly muscleLabels = MUSCLE_LABELS;
  protected readonly equipmentLabels = EQUIPMENT_LABELS;
}
