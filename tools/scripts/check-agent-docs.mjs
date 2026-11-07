/**
 * Keeps Claude Code and ChatGPT/Codex on one set of instructions (directive 107):
 * CLAUDE.md only imports AGENTS.md, and every owner directive in AGENTS.md has its own number.
 */
import { readFileSync } from 'node:fs';

const errors = [];

const claude = readFileSync('CLAUDE.md', 'utf8')
  .replace(/<!--[\s\S]*?-->/g, '')
  .trim();
if (claude !== '@AGENTS.md')
  errors.push(
    'CLAUDE.md must contain only "@AGENTS.md" (plus a comment): write instructions in AGENTS.md.',
  );

const agents = readFileSync('AGENTS.md', 'utf8');
const start = agents.indexOf('# User directives');
if (start < 0) errors.push('AGENTS.md has no "# User directives" section.');
// Directive 9 was numbered twice before this check existed; it stays as is.
const legacyDuplicates = new Set([9]);
const seen = new Map();
agents
  .slice(start)
  .split('\n')
  .forEach((line, i) => {
    const m = /^(\d+)\. /.exec(line);
    if (!m) return;
    const n = Number(m[1]);
    if (seen.has(n) && !legacyDuplicates.has(n))
      errors.push(
        `Directive ${n} is numbered twice (lines ${seen.get(n)} and ${i + 1} of the directives).`,
      );
    seen.set(n, i + 1);
  });

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(
  `Agent instructions OK: ${seen.size} directives, highest ${Math.max(...seen.keys())}.`,
);
