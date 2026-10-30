import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AioToaster } from '@all-in-one/ui';
import { PwaBars } from './pwa';

@Component({
  imports: [AioToaster, PwaBars, RouterOutlet],
  selector: 'customer-root',
  template: `<router-outlet /><customer-pwa-bars /><aio-toaster />`,
})
export class App {}
