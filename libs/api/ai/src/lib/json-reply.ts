/** The first JSON object in a model reply (models often wrap it in prose or ```json fences). */
export function parseJsonReply<T = Record<string, unknown>>(
  content: string,
): T | null {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(content.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
