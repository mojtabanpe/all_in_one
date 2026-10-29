import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ApiStatus } from '@all-in-one/web/shared';

@Component({
  imports: [ApiStatus, RouterOutlet],
  selector: 'admin-root',
  templateUrl: './app.html',
})
export class App {}
