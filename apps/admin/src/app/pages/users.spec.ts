import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Users } from './users';

describe('Admin Users page', () => {
  it('applies search, role and status filters and resets pagination', async () => {
    TestBed.configureTestingModule({
      imports: [Users],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(Users);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();

    http
      .expectOne(
        (req) =>
          req.url.endsWith('/admin/users') &&
          req.params.get('page') === '1' &&
          !req.params.has('q') &&
          !req.params.has('role') &&
          !req.params.has('filter'),
      )
      .flush({
        total: 60,
        users: [
          {
            id: 'u1',
            email: 'ali@example.com',
            name: 'علی',
            phone: '+989121112233',
            role: 'CUSTOMER',
            emailVerified: true,
            phoneVerified: true,
            hasPassword: true,
            createdAt: '2026-11-20T10:00:00.000Z',
            enabledApplets: ['planner'],
            vpnFriend: false,
            vpnCanInvite: true,
          },
        ],
      });
    await fixture.whenStable();
    fixture.detectChanges();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('ali@example.com');

    // Go to page 2 first so we verify filters reset page to 1.
    const nextBtn = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('بعدی'),
    )!;
    nextBtn.click();
    fixture.detectChanges();
    TestBed.tick();
    http
      .expectOne(
        (req) =>
          req.url.endsWith('/admin/users') && req.params.get('page') === '2',
      )
      .flush({ total: 60, users: [] });

    // Select status filter -> page resets to 1.
    const filterSelect = el.querySelector<HTMLSelectElement>('#users-filter')!;
    filterSelect.value = 'vpn_friend';
    filterSelect.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    TestBed.tick();
    http
      .expectOne(
        (req) =>
          req.url.endsWith('/admin/users') &&
          req.params.get('page') === '1' &&
          req.params.get('filter') === 'vpn_friend',
      )
      .flush({ total: 0, users: [] });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.textContent).toContain('کاربری با این مشخصات پیدا نشد.');

    // Type search query and submit form immediately.
    const searchInput = el.querySelector<HTMLInputElement>('#users-search')!;
    searchInput.value = '0912';
    searchInput.dispatchEvent(new Event('input'));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    TestBed.tick();
    http
      .expectOne(
        (req) =>
          req.url.endsWith('/admin/users') &&
          req.params.get('page') === '1' &&
          req.params.get('q') === '0912' &&
          req.params.get('filter') === 'vpn_friend',
      )
      .flush({ total: 0, users: [] });

    // Clear all filters.
    const clearBtn = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('پاک کردن فیلترها'),
    )!;
    clearBtn.click();
    fixture.detectChanges();
    TestBed.tick();
    http
      .expectOne(
        (req) =>
          req.url.endsWith('/admin/users') &&
          req.params.get('page') === '1' &&
          !req.params.has('q') &&
          !req.params.has('role') &&
          !req.params.has('filter'),
      )
      .flush({ total: 1, users: [] });

    http.verify();
  });
});
