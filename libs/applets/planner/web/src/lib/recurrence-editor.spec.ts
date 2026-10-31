import { TestBed } from '@angular/core/testing';
import { RecurrenceEditor } from './recurrence-editor';

describe('RecurrenceEditor', () => {
  afterEach(() => TestBed.resetTestingModule());
  it('builds a weekly custom interval and count with selected weekdays', async () => {
    TestBed.configureTestingModule({ imports: [RecurrenceEditor] });
    const fixture = TestBed.createComponent(RecurrenceEditor);
    fixture.detectChanges();
    const emitted = vi.fn();
    fixture.componentInstance.changed.subscribe(emitted);
    const el = fixture.nativeElement as HTMLElement;
    const select = (id: string, value: string) => {
      const node = el.querySelector('#' + id) as HTMLSelectElement;
      node.value = value;
      node.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    };
    const input = (selector: string, value: string) => {
      const node = el.querySelector(selector) as HTMLInputElement;
      node.value = value;
      node.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    select('repeat-preset', 'CUSTOM');
    select('repeat-freq', 'WEEKLY');
    input('#repeat-interval', '2');
    (el.querySelector('aio-checkbox button') as HTMLElement).click();
    fixture.detectChanges();
    select('repeat-end', 'COUNT');
    input('input[aria-label="تعداد نوبت‌ها"]', '4');
    (el.querySelector('button[aioBtn]') as HTMLButtonElement).click();
    expect(emitted).toHaveBeenCalledWith(
      expect.objectContaining({
        repeatRule: 'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=SA;COUNT=4',
        repeatFrom: 'SCHEDULE',
        recurrenceTimezone: 'Asia/Tehran',
      }),
    );
  });
  it('preserves an advanced imported rule and validates a bad timezone', () => {
    TestBed.configureTestingModule({ imports: [RecurrenceEditor] });
    const fixture = TestBed.createComponent(RecurrenceEditor);
    fixture.componentRef.setInput('value', {
      repeatRule: 'RRULE:FREQ=MONTHLY;BYDAY=-1FR',
      recurrenceTimezone: 'Asia/Tehran',
    });
    fixture.detectChanges();
    const emitted = vi.fn();
    fixture.componentInstance.changed.subscribe(emitted);
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('button[aioBtn]') as HTMLButtonElement).click();
    expect(emitted).toHaveBeenCalledWith(
      expect.objectContaining({ repeatRule: 'RRULE:FREQ=MONTHLY;BYDAY=-1FR' }),
    );
    const zone = el.querySelector('#repeat-zone') as HTMLInputElement;
    zone.value = 'not-a-zone';
    zone.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(
      (el.querySelector('button[aioBtn]') as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(el.querySelector('[role=alert]')?.textContent).toContain(
      'منطقه زمانی',
    );
  });
});
