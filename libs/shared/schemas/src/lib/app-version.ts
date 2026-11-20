/** Response header carrying the API's running SemVer so web clients notice updates without the service worker. */
export const APP_VERSION_HEADER = 'X-Aio-Version';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseSemver(
  version: string | null | undefined,
): readonly [number, number, number] | null {
  if (!version) return null;
  const match = SEMVER.exec(version.trim());
  if (!match) return null;
  const parts = [Number(match[1]), Number(match[2]), Number(match[3])] as const;
  return parts.every(Number.isSafeInteger) ? parts : null;
}

/** True only when both values are valid `major.minor.patch` SemVer strings and `candidate > current`. */
export function isNewerVersion(
  candidate: string | null | undefined,
  current: string | null | undefined,
): boolean {
  const next = parseSemver(candidate);
  const base = parseSemver(current);
  if (!next || !base) return false;
  if (next[0] !== base[0]) return next[0] > base[0];
  if (next[1] !== base[1]) return next[1] > base[1];
  return next[2] > base[2];
}
