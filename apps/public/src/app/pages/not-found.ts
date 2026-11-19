import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AioTranslate } from '@all-in-one/ui';

@Component({
  imports: [RouterLink, AioTranslate],
  template: `
    <h1 class="aio-page-title">{{ 'این صفحه پیدا نشد' | aioTranslate }}</h1>
    <a class="inline-flex min-h-11 items-center underline" routerLink="/">{{
      'بازگشت به صفحه اصلی' | aioTranslate
    }}</a>
  `,
})
export class NotFound {}
