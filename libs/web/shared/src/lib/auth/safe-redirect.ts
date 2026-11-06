/** Keep post-auth navigation inside this Angular application. */
export function safeAuthRedirect(value: string | null): string {
  if (!value) return '/';
  try {
    const decoded = decodeURIComponent(value);
    for (const candidate of [value, decoded]) {
      if (
        !candidate.startsWith('/') ||
        candidate.startsWith('//') ||
        candidate.includes('\\') ||
        Array.from(candidate).some(
          (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
        )
      )
        return '/';
    }
    return value;
  } catch {
    return '/';
  }
}
