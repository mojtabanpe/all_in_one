import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AioToaster } from '@all-in-one/ui';

@Component({
  imports: [AioToaster, RouterOutlet],
  selector: 'admin-root',
  template: `<router-outlet /><aio-toaster />`,
})
export class App {}
