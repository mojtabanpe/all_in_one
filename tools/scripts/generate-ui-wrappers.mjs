#!/usr/bin/env node
/**
 * Generates the project's wrappers over spartan Helm directives.
 *
 * Every Helm *directive* in libs/shared/spartan gets an `Aio*` directive in
 * libs/shared/packages/ui/src/lib/spartan/<family>.ts that extends it, so it
 * inherits all inputs, outputs, host bindings and host directives. Angular does
 * NOT inherit `providers`, so they are copied from the Helm source, with the
 * Helm class swapped for the wrapper (e.g. HlmToggleGroup provides itself to
 * its items through a token).
 * (Re-exposing through `hostDirectives` cannot reach inputs that Helm itself
 * forwards from Brain host directives, e.g. `disabled` on buttons.)
 * Selectors are renamed hlm -> aio (`[hlmCardTitle]` -> `[aioCardTitle]`).
 * Inputs named after a Helm selector keep their name: `aioTooltip` takes its
 * text through `[hlmTooltip]`.
 *
 * Helm *components* (they have templates) cannot be host directives; they are
 * wrapped by hand in libs/shared/packages/ui/src/lib/components.
 *
 * Run after adding spartan components:
 *   node tools/scripts/generate-ui-wrappers.mjs
 */
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '../..');
const spartanDir = join(root, 'libs/shared/spartan');
const outDir = join(root, 'libs/shared/packages/ui/src/lib/spartan');

// Families that are only building blocks for other Helm code, not UI on their own.
const SKIP_FAMILIES = new Set(['utils']);

const toAio = (s) =>
  s
    .replace(/\bhlm(?=[A-Z])/g, 'aio')
    .replace(/\bhlm-/g, 'aio-')
    .replace(/\[hlm\]/g, '[aio]');

const pascal = (s) => s.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase());

/** Text of the `[...]` that follows `key` in `text`, or undefined. */
function bracketBlock(text, key) {
  const at = text.indexOf(key);
  if (at === -1) return undefined;
  const start = text.indexOf('[', at);
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '[') depth++;
    else if (text[i] === ']' && --depth === 0) return text.slice(start, i + 1);
  }
  return undefined;
}

/** Where each identifier used in `code` comes from, for re-importing it in the wrapper file. */
function resolveImports(code, source, family) {
  const imports = new Map(); // module -> Set(names)
  const add = (module, name) =>
    imports.set(module, (imports.get(module) ?? new Set()).add(name));
  const used = new Set(code.match(/\b[A-Za-z_$][\w$]*\b/g));
  for (const [, names, module] of source.matchAll(
    /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g,
  )) {
    for (const raw of names.split(',')) {
      const name = raw
        .replace(/^\s*type\s+/, '')
        .split(' as ')
        .pop()
        ?.trim();
      if (name && used.has(name))
        add(
          module.startsWith('.') ? `@spartan-ng/helm/${family}` : module,
          name,
        );
    }
  }
  for (const [, name] of source.matchAll(/export (?:const|function) (\w+)/g)) {
    if (used.has(name)) add(`@spartan-ng/helm/${family}`, name);
  }
  return imports;
}

function parseDirectives(source) {
  const result = [];
  const re =
    /@Directive\(\{([\s\S]*?)\n\}\)\s*export class (\w+)(?:<[^>]*>)?\s*(?:extends [\w.<>, ]+\s*)?(?:implements [\w.<>, ]+\s*)?\{(\}|[\s\S]*?\n\})/g;
  let m;
  while ((m = re.exec(source))) {
    const [, meta, className, body] = m;
    const generic = new RegExp(`export class ${className}<`).test(source);
    const selector = /selector:\s*['"`]([^'"`]+)['"`]/.exec(meta)?.[1];
    if (!selector || !className.startsWith('Hlm')) continue;
    const inputs = [];
    const outputs = [];
    const fieldRe =
      /public readonly (\w+)\s*=\s*(input|model|output)(?:\.required)?\s*(?:<[\s\S]*?>)?\s*\(([\s\S]*?)\);/g;
    let f;
    while ((f = fieldRe.exec(body))) {
      const [, name, kind, args] = f;
      const alias = /alias:\s*['"](\w[\w-]*)['"]/.exec(args)?.[1];
      const publicName = alias ?? name;
      if (kind === 'output') outputs.push(publicName);
      else inputs.push(publicName);
      if (kind === 'model') outputs.push(`${publicName}Change`);
    }
    // Inputs/outputs the Helm directive re-exposes from its own host directives
    // (e.g. `'brnTooltip: hlmTooltip'`); their public name is after the colon.
    const hostDirectivesAt = meta.indexOf('hostDirectives:');
    const nested = hostDirectivesAt === -1 ? '' : meta.slice(hostDirectivesAt);
    for (const [, kind, list] of nested.matchAll(
      /(inputs|outputs):\s*\[([^\]]*)\]/g,
    )) {
      const names = [...list.matchAll(/['"]([^'"]+)['"]/g)].map(([, n]) =>
        n.split(':').pop().trim(),
      );
      (kind === 'inputs' ? inputs : outputs).push(...names);
    }
    const exportAs = /exportAs:\s*['"]([^'"]+)['"]/.exec(meta)?.[1];
    const providers = bracketBlock(meta, 'providers:');
    result.push({
      className,
      selector,
      exportAs,
      generic,
      providers,
      source,
      inputs: [...new Set(inputs)],
      outputs: [...new Set(outputs)],
    });
  }
  return result;
}

if (existsSync(outDir)) rmSync(outDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

const families = readdirSync(spartanDir, { withFileTypes: true })
  .filter(
    (d) => d.isDirectory() && existsSync(join(spartanDir, d.name, 'src/lib')),
  )
  .map((d) => d.name)
  .filter((name) => !SKIP_FAMILIES.has(name))
  .sort();

const barrel = [];
for (const family of families) {
  const libDir = join(spartanDir, family, 'src/lib');
  const directives = readdirSync(libDir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
    .flatMap((f) => parseDirectives(readFileSync(join(libDir, f), 'utf8')));
  if (directives.length === 0) continue;

  const extraImports = new Set();
  const lines = [];
  for (const d of directives) {
    const aioName = d.className.replace(/^Hlm/, 'Aio');
    const meta = [`  selector: '${toAio(d.selector)}',`];
    if (d.exportAs) meta.push(`  exportAs: '${toAio(d.exportAs)}',`);
    if (d.providers) {
      const providers = d.providers.replace(
        new RegExp(`\\b${d.className}\\b`, 'g'),
        aioName,
      );
      meta.push(`  providers: ${providers.replace(/\n\s*/g, ' ')},`);
      for (const [module, names] of resolveImports(
        providers,
        d.source,
        family,
      )) {
        for (const name of names)
          if (name !== aioName) extraImports.add(`${module}|${name}`);
      }
    }
    const api = [
      ...d.inputs.map((i) => `input \`${i}\``),
      ...d.outputs.map((o) => `output \`${o}\``),
    ];
    lines.push(
      `/** Wraps spartan \`${d.className}\` (\`${d.selector}\`).${api.length ? ` API: ${api.join(', ')}.` : ''} */`,
      '@Directive({',
      ...meta,
      '})',
      `export class ${aioName}${d.generic ? '<T = unknown>' : ''} extends ${d.className}${d.generic ? '<T>' : ''} {}`,
      '',
    );
  }
  const modules = new Map([
    ['@angular/core', new Set(['Directive'])],
    [`@spartan-ng/helm/${family}`, new Set(directives.map((d) => d.className))],
  ]);
  for (const entry of extraImports) {
    const [module, name] = entry.split('|');
    modules.set(module, (modules.get(module) ?? new Set()).add(name));
  }
  lines.unshift(
    '// GENERATED by tools/scripts/generate-ui-wrappers.mjs. Do not edit by hand.',
    ...[...modules].map(
      ([module, names]) =>
        `import { ${[...names].sort().join(', ')} } from '${module}';`,
    ),
    '',
  );
  const importsName = `Aio${pascal(family)}Directives`;
  lines.push(
    `export const ${importsName} = [${directives.map((d) => d.className.replace(/^Hlm/, 'Aio')).join(', ')}] as const;`,
    '',
  );
  writeFileSync(join(outDir, `${family}.ts`), lines.join('\n'));
  barrel.push(`export * from './${family}';`);
}
writeFileSync(
  join(outDir, 'index.ts'),
  `// GENERATED by tools/scripts/generate-ui-wrappers.mjs. Do not edit by hand.\n${barrel.join('\n')}\n`,
);
console.log(
  `Generated wrappers for ${barrel.length} spartan families in ${outDir}`,
);
