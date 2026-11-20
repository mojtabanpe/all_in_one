import { isNewerVersion, parseSemver } from './app-version';

describe('SemVer comparison', () => {
  it('parses strict major.minor.patch strings and rejects malformed values', () => {
    expect(parseSemver('0.1.42')).toEqual([0, 1, 42]);
    expect(parseSemver(' 1.2.3 ')).toEqual([1, 2, 3]);
    expect(parseSemver(null)).toBeNull();
    expect(parseSemver(undefined)).toBeNull();
    expect(parseSemver('')).toBeNull();
    expect(parseSemver('v1.2.3')).toBeNull();
    expect(parseSemver('1.2')).toBeNull();
    expect(parseSemver('1.2.3-beta')).toBeNull();
  });

  it('compares numerically rather than lexicographically', () => {
    expect(isNewerVersion('0.1.10', '0.1.2')).toBe(true);
    expect(isNewerVersion('0.1.2', '0.1.10')).toBe(false);
    expect(isNewerVersion('0.2.0', '0.1.99')).toBe(true);
    expect(isNewerVersion('1.0.0', '0.99.99')).toBe(true);
    expect(isNewerVersion('1.0.7', '1.0.7')).toBe(false);
    expect(isNewerVersion('1.0.6', '1.0.7')).toBe(false);
    expect(isNewerVersion(null, '0.1.0')).toBe(false);
    expect(isNewerVersion('0.1.1', 'invalid')).toBe(false);
  });
});
