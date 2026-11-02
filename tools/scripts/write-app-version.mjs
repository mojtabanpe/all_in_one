import { readFile, writeFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const { version } = JSON.parse(
  await readFile(new URL('package.json', root), 'utf8'),
);
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
const sequence = process.env.RELEASE_PATCH;
if (!match || !/^[1-9]\d*$/.test(sequence ?? '')) {
  throw new Error(
    'A base SemVer and positive RELEASE_PATCH deployment number are required.',
  );
}
const patch = Number(match[3]) + Number(sequence);
if (!Number.isSafeInteger(patch))
  throw new Error('Release patch exceeds the safe integer range.');
const releaseVersion = `${match[1]}.${match[2]}.${patch}`;
await writeFile(
  new URL('libs/web/shared/src/lib/release-version.ts', root),
  `/** Stamped by the Deploy workflow before building production assets. */\nexport const APP_VERSION = '${releaseVersion}';\n`,
);
console.log(`Application version: ${releaseVersion}`);
