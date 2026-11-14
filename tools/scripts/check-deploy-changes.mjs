import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

// Only known documentation paths are exempt; unknown paths still require a release.
export function isDocumentation(path) {
  return (
    /\.(md|mdx|rst)$/i.test(path) ||
    /^(docs|design-system|graphify-out)\//.test(path)
  );
}

if (process.env.GITHUB_EVENT_NAME === 'push') {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  let required = true;
  try {
    const paths = execFileSync(
      'git',
      ['diff', '--name-only', '--no-renames', '-z', event.before, event.after],
      { encoding: 'utf8' },
    )
      .split('\0')
      .filter(Boolean);
    required = paths.some((path) => !isDocumentation(path));
  } catch {
    // New branches or unavailable history must never hide a code deployment.
    console.warn('Cannot compare the full push; requiring deployment.');
  }
  appendFileSync(process.env.GITHUB_OUTPUT, `required=${required}\n`);
  console.log(
    required
      ? 'Deployment required.'
      : 'Documentation-only push; skipping deployment.',
  );
}
