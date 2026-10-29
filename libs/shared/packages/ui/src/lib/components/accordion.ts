import { Component } from '@angular/core';
import {
  HlmAccordionContent,
  HlmAccordionTrigger,
} from '@spartan-ng/helm/accordion';

/** Wraps spartan `hlm-accordion-trigger`; place inside `aioAccordionItem`. */
@Component({
  selector: 'aio-accordion-trigger',
  imports: [HlmAccordionTrigger],
  template: `<hlm-accordion-trigger><ng-content /></hlm-accordion-trigger>`,
})
export class AioAccordionTrigger {}

/** Wraps spartan `hlm-accordion-content`; place inside `aioAccordionItem`. */
@Component({
  selector: 'aio-accordion-content',
  imports: [HlmAccordionContent],
  template: `<hlm-accordion-content><ng-content /></hlm-accordion-content>`,
})
export class AioAccordionContent {}
