import { AioTranslate } from '../locale';
import { Component, input } from '@angular/core';
import {
  AioCard,
  AioCardContent,
  AioItemDirectives,
  AioBadge,
} from '../spartan';
import { AioCardHeading } from './card-heading';

export interface AioCatalogItem {
  id: string;
  title: string;
  description?: string;
  badge?: string;
  badgeVariant?: 'outline' | 'secondary';
  badgeDirection?: 'rtl' | 'ltr';
}
@Component({
  selector: '[aioCatalogCard]',
  hostDirectives: [AioCard],
  imports: [
    AioCardHeading,
    AioCardContent,
    AioItemDirectives,
    AioBadge,
    AioTranslate,
  ],
  template: `
    <div
      aioCardHeading
      [title]="title() | aioTranslate"
      [description]="description() | aioTranslate"
    ></div>
    <div aioCardContent aioItemGroup class="flex flex-col gap-1">
      @for (item of items(); track item.id) {
        <div aioItem size="sm">
          <div aioItemContent>
            <div aioItemTitle>{{ item.title | aioTranslate }}</div>
            @if (item.description) {
              <div aioItemDescription>
                {{ item.description | aioTranslate }}
              </div>
            }
          </div>
          @if (item.badge) {
            <div aioItemActions>
              <span
                aioBadge
                [variant]="item.badgeVariant ?? 'outline'"
                [attr.dir]="item.badgeDirection"
                >{{ item.badge | aioTranslate }}</span
              >
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class AioCatalogCard {
  readonly title = input.required<string>();
  readonly description = input.required<string>();
  readonly items = input.required<readonly AioCatalogItem[]>();
}
