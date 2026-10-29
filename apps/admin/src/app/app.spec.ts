import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { appRoutes } from './app.routes';

describe('admin App', () => {
  it('renders the router outlet and the toaster', async () => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('aio-toaster')).not.toBeNull();
  });

  it('only lets admins in and hides sign-up', () => {
    TestBed.configureTestingModule({ providers: [provideRouter(appRoutes)] });
    const routes = TestBed.inject(Router).config;
    expect(routes.find((r) => r.path === 'login')?.data).toEqual({
      appName: 'پنل مدیریت',
      allowRegister: false,
    });
    expect(routes.find((r) => r.path === '')?.canActivate?.length).toBe(1);
  });
});
