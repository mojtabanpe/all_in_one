import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { SHELL_HEADER, withShellMarkers } from '@all-in-one/shared/schemas';

/** Reads `User-Agent` plus the native shell markers the customer app sends in {@link SHELL_HEADER}. */
export function shellUserAgentOf(headers: {
  [name: string]: string | string[] | undefined;
}): string {
  const one = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  return withShellMarkers(
    one(headers['user-agent']),
    one(headers[SHELL_HEADER.toLowerCase()]),
  );
}

/**
 * The user agent for store/shell checks (`PoshtetgarmStore/<store>`, `PoshtetgarmApp/<ver>`). In the Android
 * WebView, requests forwarded by the service worker lose the shell's user agent, so `@Headers('user-agent')` alone
 * misses Cafe Bazaar and Myket builds; use this instead.
 */
export const ShellUserAgent = createParamDecorator(
  (_: unknown, context: ExecutionContext): string =>
    shellUserAgentOf(context.switchToHttp().getRequest().headers),
);
