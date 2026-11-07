import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { GrowthCampaignReport } from '@all-in-one/shared/schemas';
import { CampaignReport } from './campaign-report';

describe('Campaign report CSV', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([false, true])(
    'exports totals with detail rows: %s',
    async (hasRows) => {
      TestBed.configureTestingModule({
        imports: [CampaignReport],
        providers: [provideHttpClient(), provideHttpClientTesting()],
      });
      const fixture = TestBed.createComponent(CampaignReport);
      const http = TestBed.inject(HttpTestingController);
      fixture.detectChanges();
      const totals = {
        landingVisitors: hasRows ? 12 : 0,
        signupVisitors: 0,
        completedSignupVisitors: 0,
        activeVisitors: 0,
        firstReviewVisitors: 0,
        eligibleSignupVisitors: 0,
        threeDaySignupVisitors: 0,
      };
      const report: GrowthCampaignReport = {
        windowDays: 7,
        from: '2026-10-31',
        to: '2026-11-06',
        totals,
        rows: hasRows
          ? [
              {
                ...totals,
                source: null,
                medium: null,
                campaign: null,
                landingVisitors: 8,
              },
            ]
          : [],
      };
      http
        .expectOne((request) => request.url.endsWith('/growth/campaigns'))
        .flush(report);
      await fixture.whenStable();
      fixture.detectChanges();

      const createObjectURL = vi.fn<(blob: Blob) => string>(
        () => 'blob:campaign-report',
      );
      vi.stubGlobal(
        'URL',
        class extends URL {
          static override createObjectURL = createObjectURL;
          static override revokeObjectURL = vi.fn();
        },
      );
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
        () => undefined,
      );
      const download = Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
      ).find((button) => button.textContent?.includes('(CSV)'));
      expect(download).toBeDefined();
      vi.useFakeTimers();
      download?.click();
      expect(createObjectURL).not.toHaveBeenCalled();
      http
        .expectOne(
          (request) =>
            request.method === 'POST' &&
            request.url.endsWith('/growth/campaigns/export-audit'),
        )
        .flush(null, { status: 204, statusText: 'No Content' });
      await Promise.resolve();
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
      expect(createObjectURL).toHaveBeenCalledOnce();
      const [blob] = createObjectURL.mock.calls[0];
      const csv = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
      });
      const lines = csv.split('\r\n');
      expect(lines[0]).toMatch(/,"row_type"$/);
      expect(lines).toHaveLength(hasRows ? 3 : 2);
      if (hasRows)
        expect(lines[1]).toMatch(/,"8","0","0","0","0","0","0","detail"$/);
      expect(lines.at(-1)).toBe(
        `"2026-10-31","2026-11-06","","","","","","","${totals.landingVisitors}","0","0","0","0","0","0","total"`,
      );
      http.verify();
    },
  );
});
