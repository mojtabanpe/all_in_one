import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ApiStatus } from './api-status';

describe('ApiStatus', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [ApiStatus],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(ApiStatus);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    return { fixture, http };
  }

  it('shows the api as up when the health check passes', async () => {
    const { fixture, http } = setup();
    http.expectOne('/api/health').flush({ status: 'ok', database: 'up' });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('API up');
    expect(fixture.nativeElement.textContent).toContain('database up');
  });

  it('shows the api as down when the request fails', async () => {
    const { fixture, http } = setup();
    http
      .expectOne('/api/health')
      .flush(null, { status: 503, statusText: 'Service Unavailable' });
    await fixture.whenStable();
    expect(fixture.nativeElement.textContent).toContain('API down');
  });
});
