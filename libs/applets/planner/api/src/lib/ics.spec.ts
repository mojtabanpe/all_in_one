import { isPrivateAddress } from './calendars.service';
import { parseIcs } from './ics';

const feed = (...events: string[]) =>
  ['BEGIN:VCALENDAR', ...events, 'END:VCALENDAR'].join('\r\n');

const from = new Date('2026-11-01T00:00:00Z');
const to = new Date('2026-11-30T00:00:00Z');

describe('parseIcs', () => {
  it('reads UTC, zoned and all-day events with folded lines', () => {
    const events = parseIcs(
      feed(
        'BEGIN:VEVENT',
        'UID:a',
        'SUMMARY:Team\\, weekly',
        ' sync',
        'DTSTART:20261102T090000Z',
        'DTEND:20261102T100000Z',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:b',
        'SUMMARY:Tehran',
        'DTSTART;TZID=Asia/Tehran:20261103T120000',
        'DURATION:PT30M',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:c',
        'SUMMARY:Holiday',
        'DTSTART;VALUE=DATE:20261104',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:d',
        'SUMMARY:Out of range',
        'DTSTART:20261202T090000Z',
        'END:VEVENT',
      ),
      from,
      to,
    );
    expect(events.map((e) => e.title)).toEqual([
      'Team, weeklysync',
      'Tehran',
      'Holiday',
    ]);
    expect(events[1].start.toISOString()).toBe('2026-11-03T08:30:00.000Z');
    expect(events[1].end?.toISOString()).toBe('2026-11-03T09:00:00.000Z');
    expect(events[2].allDay).toBe(true);
  });

  it('expands weekly rules with BYDAY, EXDATE and overrides', () => {
    const events = parseIcs(
      feed(
        'BEGIN:VEVENT',
        'UID:r',
        'SUMMARY:Class',
        'DTSTART:20261026T100000Z',
        'DTEND:20261026T110000Z',
        'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261112T000000Z',
        'EXDATE:20261104T100000Z',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:r',
        'RECURRENCE-ID:20261109T100000Z',
        'SUMMARY:Class (moved)',
        'DTSTART:20261109T150000Z',
        'END:VEVENT',
      ),
      from,
      to,
    );
    expect(
      events.map((e) => `${e.start.toISOString().slice(0, 13)} ${e.title}`),
    ).toEqual([
      '2026-11-02T10 Class',
      '2026-11-09T15 Class (moved)',
      '2026-11-11T10 Class',
    ]);
  });

  it('counts monthly occurrences and skips short months', () => {
    const events = parseIcs(
      feed(
        'BEGIN:VEVENT',
        'UID:m',
        'SUMMARY:Rent',
        'DTSTART;VALUE=DATE:20260831',
        'RRULE:FREQ=MONTHLY;COUNT=4',
        'END:VEVENT',
      ),
      new Date('2026-08-01T00:00:00Z'),
      new Date('2027-03-01T00:00:00Z'),
    );
    // Sep and Nov have no 31st.
    expect(events.map((e) => e.start.toISOString().slice(0, 10))).toEqual([
      '2026-08-31',
      '2026-10-31',
      '2026-12-31',
      '2027-01-31',
    ]);
  });
});

describe('isPrivateAddress', () => {
  it.each([
    ['127.0.0.1', true],
    ['10.1.2.3', true],
    ['169.254.169.254', true],
    ['::1', true],
    ['::ffff:192.168.1.1', true],
    ['fd00::1', true],
    ['8.8.8.8', false],
    ['2606:4700::1111', false],
  ])('%s → %s', (address, expected) => {
    expect(isPrivateAddress(address)).toBe(expected);
  });
});
