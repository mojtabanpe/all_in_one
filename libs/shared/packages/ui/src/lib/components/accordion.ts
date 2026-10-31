import { Component } from '@angular/core';
import {
  HlmAccordionContent,
  HlmAccordionTrigger,
} from '@spartan-ng/helm/accordion';

/** Wraps spartan `hlm-accordion-trigger`; place inside `aioAccordionItem`. */
@Component({
  selector: 'aio-accordion-trigger',
  // Layout-neutral: spartan's elements must stay direct flex children of the item.
  host: { class: 'contents' },
  imports: [HlmAccordionTrigger],
  template: `<hlm-accordion-trigger><ng-content /></hlm-accordion-trigger>`,
})
export class AioAccordionTrigger {}

/** Wraps spartan `hlm-accordion-content`; place inside `aioAccordionItem`. */
@Component({
  selector: 'aio-accordion-content',
  host: { class: 'contents' },
  imports: [HlmAccordionContent],
  template: `<hlm-accordion-content class="[&_a[data-slot=button]]:no-underline"
    ><ng-content
  /></hlm-accordion-content>`,
})
export class AioAccordionContent {}
