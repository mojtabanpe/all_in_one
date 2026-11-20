import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AioPullRefresh } from './pull-refresh';

@Component({
  imports: [AioPullRefresh],
  template: `<aio-pull-refresh (refresh)="count = count + 1"
    ><p id="page">page</p></aio-pull-refresh
  >`,
})
class Host {
  count = 0;
}

function touch(type: string, target: Element, y: number, x = 100) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const point = { clientX: x, clientY: y, target };
  Object.defineProperty(event, 'touches', {
    value: type === 'touchend' ? [] : [point],
  });
  target.dispatchEvent(event);
}

function pull(target: Element, distance: number, x = 0) {
  touch('touchstart', target, 100);
  for (let step = 1; step <= 5; step++) {
    touch('touchmove', target, 100 + (distance * step) / 5, 100 + (x * step) / 5);
  }
  touch('touchend', target, 100 + distance);
}

describe('AioPullRefresh', () => {
  afterEach(() => {
    document.querySelectorAll('[data-test-overlay]').forEach((el) => el.remove());
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  });

  function setup() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const page = fixture.nativeElement.querySelector('#page') as HTMLElement;
    return { host: fixture.componentInstance, page };
  }

  it('refreshes after a pull past the threshold, not after a short one', () => {
    const { host, page } = setup();
    expect(document.documentElement.style.overscrollBehaviorY).toBe('contain');
    pull(page, 60);
    expect(host.count).toBe(0);
    pull(page, 200);
    expect(host.count).toBe(1);
  });

  it('ignores sideways swipes', () => {
    const { host, page } = setup();
    pull(page, 200, 400);
    expect(host.count).toBe(0);
  });

  it('does nothing while the page is scrolled', () => {
    const { host, page } = setup();
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 120 });
    pull(page, 200);
    expect(host.count).toBe(0);
  });

  it('does nothing while a sheet is open', () => {
    const { host, page } = setup();
    const sheet = document.body.appendChild(document.createElement('div'));
    sheet.setAttribute('role', 'dialog');
    sheet.dataset['testOverlay'] = '';
    pull(page, 200);
    expect(host.count).toBe(0);
  });
});
