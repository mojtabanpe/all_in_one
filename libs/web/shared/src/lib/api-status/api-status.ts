import { httpResource } from '@angular/common/http';
import { Component, computed } from '@angular/core';
import { healthSchema } from '@all-in-one/shared/schemas';
import {
  AioBadge,
  AioCardDirectives,
  AioSpinner,
  AioCardHeading,
} from '@all-in-one/ui';

/** Shows whether the api and its database are reachable. */
@Component({
  selector: 'web-api-status',
  imports: [AioBadge, AioCardDirectives, AioSpinner, AioCardHeading],
  template: `
    <section aioCard>
      <div
        aioCardHeading
        title="وضعیت سرور"
        [level]="2"
        description="GET /api/health"
      ></div>
      <div aioCardContent class="flex items-center gap-2">
        @if (health.isLoading()) {
          <aio-spinner />
        } @else {
          <span aioBadge [variant]="up() ? 'default' : 'destructive'">
            {{ up() ? 'سرور فعال است' : 'سرور در دسترس نیست' }}
          </span>
          @if (health.hasValue()) {
            <span aioBadge variant="outline">
              پایگاه داده:
              {{ health.value().database === 'up' ? 'فعال' : 'غیرفعال' }}
            </span>
          }
        }
      </div>
    </section>
  `,
})
export class ApiStatus {
  protected readonly health = httpResource(() => '/api/health', {
    parse: (value) => healthSchema.parse(value),
  });

  protected readonly up = computed(
    () => this.health.hasValue() && this.health.value().status === 'ok',
  );
}
