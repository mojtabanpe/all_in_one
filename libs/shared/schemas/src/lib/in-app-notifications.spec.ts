import { inAppContentSchema } from './in-app-notifications';
const copy = { fa: 'پیام', en: 'Message' };
describe('notification actions', () => {
  it('accepts app routes and HTTPS destinations and rejects executable or ambiguous URLs', () => {
    for (const url of ['/billing#offers-heading', 'https://t.me/poshtetgarm']) {
      expect(
        inAppContentSchema.safeParse({
          title: copy,
          message: copy,
          actions: [{ label: copy, url }],
        }).success,
      ).toBe(true);
    }
    for (const url of [
      'javascript:alert(1)',
      '//outside.test',
      '/\\outside.test',
      'data:text/html,x',
    ]) {
      expect(
        inAppContentSchema.safeParse({
          title: copy,
          message: copy,
          actions: [{ label: copy, url }],
        }).success,
      ).toBe(false);
    }
  });
});
