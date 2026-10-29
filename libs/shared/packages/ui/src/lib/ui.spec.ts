import { BreakpointObserver } from '@angular/cdk/layout';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import {
  AioBadge,
  AioBottomNav,
  AioButton,
  AioCardDirectives,
  AioConfirm,
  AioDialog,
  AioDialogBody,
  AioTooltip,
  provideIcons,
} from '../index';
import { lucideHouse } from '@ng-icons/lucide';

function breakpoint(mobile: boolean) {
  return {
    provide: BreakpointObserver,
    useValue: {
      observe: () => of({ matches: mobile, breakpoints: {} }),
      isMatched: () => mobile,
    },
  };
}

@Component({
  imports: [AioButton, AioBadge, AioCardDirectives, AioTooltip],
  template: `
    <button
      aioBtn
      variant="destructive"
      [disabled]="true"
      aioTooltip
      hlmTooltip="tip"
      position="top"
    >
      x
    </button>
    <span aioBadge variant="outline">b</span>
    <section aioCard><h2 aioCardTitle>t</h2></section>
  `,
})
class DirectivesHost {}

describe('generated spartan wrappers', () => {
  it('apply the spartan Helm directive and forward its inputs', async () => {
    const fixture = TestBed.createComponent(DirectivesHost);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const button = el.querySelector('button')!;
    expect(button.getAttribute('data-slot')).toBe('button');
    expect(button.className).toContain('destructive');
    expect(button.disabled).toBe(true);
    expect(el.querySelector('[aioBadge]')!.getAttribute('data-variant')).toBe(
      'outline',
    );
    expect(el.querySelector('[aioCard]')!.getAttribute('data-slot')).toBe(
      'card',
    );
  });
});

@Component({
  imports: [AioDialog, AioDialogBody],
  template: `
    <aio-dialog [(open)]="open" title="عنوان">
      <ng-template aioDialogBody><p class="body">محتوا</p></ng-template>
    </aio-dialog>
  `,
})
class DialogHost {
  readonly open = signal(true);
}

describe('AioDialog', () => {
  it('opens as a bottom drawer on phones', async () => {
    TestBed.configureTestingModule({ providers: [breakpoint(true)] });
    const fixture = TestBed.createComponent(DialogHost);
    await fixture.whenStable();
    const content = document.querySelector('[data-slot="drawer-content"]');
    expect(content).not.toBeNull();
    expect(content!.getAttribute('data-vaul-drawer-direction')).toBe('bottom');
    expect(document.querySelector('[data-slot="dialog-content"]')).toBeNull();
    fixture.destroy();
  });

  it('opens as a dialog on larger screens', async () => {
    TestBed.configureTestingModule({ providers: [breakpoint(false)] });
    const fixture = TestBed.createComponent(DialogHost);
    await fixture.whenStable();
    expect(
      document.querySelector('[data-slot="dialog-content"]'),
    ).not.toBeNull();
    expect(document.querySelector('[data-slot="drawer-content"]')).toBeNull();
    fixture.destroy();
  });
});

describe('AioConfirm', () => {
  it('resolves with the user choice', async () => {
    const confirm = TestBed.inject(AioConfirm);
    const answer = confirm.ask({ title: 'حذف شود؟' });
    expect(confirm.pending()?.title).toBe('حذف شود؟');
    confirm.settle(true);
    await expect(answer).resolves.toBe(true);
    expect(confirm.pending()).toBeNull();
  });

  it('cancels the previous prompt when a new one opens', async () => {
    const confirm = TestBed.inject(AioConfirm);
    const first = confirm.ask({ title: 'اول' });
    confirm.ask({ title: 'دوم' });
    await expect(first).resolves.toBe(false);
  });
});

@Component({ template: '' })
class Page {}

@Component({
  imports: [AioBottomNav],
  providers: [provideIcons({ lucideHouse })],
  template: `<aio-bottom-nav [items]="items" />`,
})
class NavHost {
  readonly items = [
    { label: 'خانه', icon: 'lucideHouse', link: '/', exact: true },
    { label: 'برنامه', icon: 'lucideHouse', link: '/planner' },
  ];
}

describe('AioBottomNav', () => {
  it('marks the current route', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: Page },
          { path: 'planner', component: Page },
        ]),
      ],
    });
    const fixture = TestBed.createComponent(NavHost);
    await TestBed.inject(Router).navigateByUrl('/');
    await fixture.whenStable();
    const links = fixture.nativeElement.querySelectorAll('a');
    expect(links.length).toBe(2);
    expect(links[0].getAttribute('aria-current')).toBe('page');
    expect(links[1].getAttribute('aria-current')).toBeNull();
  });
});
