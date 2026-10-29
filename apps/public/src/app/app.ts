import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmCardImports } from '@spartan-ng/helm/card';

@Component({
  imports: [HlmButtonImports, HlmCardImports, RouterOutlet],
  selector: 'public-root',
  templateUrl: './app.html',
})
export class App {
  protected readonly features = [
    {
      title: 'Fast',
      description: 'Server-side rendered for quick first paint and SEO.',
    },
    { title: 'Open', description: 'No account needed to browse.' },
    {
      title: 'Accessible',
      description: 'Built on spartan/ui accessible primitives.',
    },
  ];
}
