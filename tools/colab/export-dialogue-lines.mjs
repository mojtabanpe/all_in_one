#!/usr/bin/env node
// Prints every ready-dialogue sentence with its voice, the input of tools/colab/jobs/dialogue_tts.py.
// Usage: node tools/colab/export-dialogue-lines.mjs > dialogue-lines.json
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const out = execFileSync(
  join(root, 'node_modules/.bin/tsx'),
  [
    '-e',
    "import { libraryVoiceLines } from './libs/applets/english-learning/contracts/src/lib/dialogue-library.ts'; process.stdout.write(JSON.stringify(libraryVoiceLines()))",
  ],
  { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
);
process.stdout.write(out + '\n');
