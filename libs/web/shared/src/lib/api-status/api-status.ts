import { httpResource } from '@angular/common/http';
import { Component, computed } from '@angular/core';
import { healthSchema } from '@all-in-one/shared/schemas';
import { HlmBadgeImports } from '@spartan-ng/helm/badge';
import { HlmCardImports } from '@spartan-ng/helm/card';
import { HlmSpinnerImports } from '@spartan-ng/helm/spinner';

/** Shows whether the api and its database are reachable. */
@Component({
  selector: 'web-api-status',
  imports: [HlmBadgeImports, HlmCardImports, HlmSpinnerImports],
  template: `
    <section hlmCard>
      <div hlmCardHeader>
        <h2 hlmCardTitle>API status</h2>
        <p hlmCardDescription>GET /api/health</p>
      </div>
      <div hlmCardContent class="flex items-center gap-2">
        @if (health.isLoading()) {
          <hlm-spinner />
        } @else {
          <span hlmBadge [variant]="up() ? 'default' : 'destructive'">
            {{ up() ? 'API up' : 'API down' }}
          </span>
          @if (health.hasValue()) {
            <span hlmBadge variant="outline">
              database {{ health.value().database }}
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
