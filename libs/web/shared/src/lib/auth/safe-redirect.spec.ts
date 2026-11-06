import { describe, expect, it } from 'vitest';
import { safeAuthRedirect } from './safe-redirect';

describe('safeAuthRedirect', () => {
  it('preserves internal destinations, queries and fragments', () => {
    for (const route of [
      '/',
      '/planner?view=today#tasks',
      '/english/decks/123',
    ]) {
      expect(safeAuthRedirect(route)).toBe(route);
    }
  });

  it('rejects external, ambiguous, encoded and malformed destinations', () => {
    for (const route of [
      null,
      '',
      'https://example.com',
      '//example.com',
      '/\\example.com',
      '/%2fexample.com',
      '/%5cexample.com',
      '/%0aexample.com',
      '/bad%zz',
      'javascript:alert(1)',
    ]) {
      expect(safeAuthRedirect(route)).toBe('/');
    }
  });
});
