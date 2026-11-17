import { normalizeReminders, reminderMinutesBefore } from './reminders';

describe('task reminders', () => {
  it('reads every ISO spelling a client may send', () => {
    expect(reminderMinutesBefore('TRIGGER:PT0S')).toBe(0);
    expect(reminderMinutesBefore('TRIGGER:PT0M')).toBe(0);
    expect(reminderMinutesBefore('TRIGGER:-PT15M')).toBe(15);
    expect(reminderMinutesBefore('-PT1H')).toBe(60);
    expect(reminderMinutesBefore('TRIGGER:-PT1H30M')).toBe(90);
    expect(reminderMinutesBefore('TRIGGER:-P1D')).toBe(1440);
    expect(reminderMinutesBefore('trigger:-pt5m')).toBe(5);
  });

  it('rejects absolute, after-the-task and far-away triggers', () => {
    expect(
      reminderMinutesBefore('TRIGGER;VALUE=DATE-TIME:20261118T090000Z'),
    ).toBeNull();
    expect(reminderMinutesBefore('TRIGGER:PT15M')).toBeNull();
    expect(reminderMinutesBefore('TRIGGER:-P8D')).toBeNull();
    expect(reminderMinutesBefore('TRIGGER:P')).toBeNull();
  });

  it('normalises to the task screen spellings and keeps unknown metadata', () => {
    expect(
      normalizeReminders([
        'TRIGGER:PT0S',
        'TRIGGER:PT0M',
        '-PT1H',
        'TRIGGER;VALUE=DATE-TIME:20261118T090000Z',
      ]),
    ).toEqual([
      'TRIGGER:PT0M',
      'TRIGGER:-PT60M',
      'TRIGGER;VALUE=DATE-TIME:20261118T090000Z',
    ]);
  });
});
