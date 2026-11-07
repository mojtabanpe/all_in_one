/**
 * Measures the local scope check (directive 110) on held-out sentences (tools/scripts/scope-eval-set.json),
 * which must never be copied into libs/api/ai/src/lib/scope-anchors.ts:
 *   node tools/scripts/eval-scope-model.mjs [model folder]
 * Prints accuracy and false refusals per threshold and the sentences judged wrongly.
 */
import { env, pipeline } from '@huggingface/transformers';
import { readFileSync } from 'node:fs';

const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
if (process.argv[2]) {
  env.localModelPath = process.argv[2];
  env.allowRemoteModels = false;
}
const source = readFileSync('libs/api/ai/src/lib/scope-anchors.ts', 'utf8');
const list = (name) =>
  JSON.parse(
    source
      .split(`export const ${name}: readonly string[] = `)[1]
      .split('];')[0]
      .replace(/,\s*$/, '') + ']',
  );
const examples = { in: list('SCOPE_IN'), out: list('SCOPE_OUT') };
const held = JSON.parse(
  readFileSync('tools/scripts/scope-eval-set.json', 'utf8'),
);
const extract = await pipeline('feature-extraction', MODEL, { dtype: 'q8' });
const embed = async (text) =>
  (await extract(text, { pooling: 'mean', normalize: true })).data;
const known = [];
for (const label of ['in', 'out'])
  for (const text of examples[label])
    known.push({ inScope: label === 'in', vector: await embed(text) });
// Same vote as libs/api/ai/src/lib/scope-classifier.ts.
const vote = (vector) => {
  const nearest = known
    .map((k) => ({
      inScope: k.inScope,
      s: vector.reduce((sum, x, i) => sum + x * k.vector[i], 0),
    }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 7);
  let yes = 0;
  let total = 0;
  for (const n of nearest) {
    const w = Math.exp(n.s * 20);
    total += w;
    if (n.inScope) yes += w;
  }
  return yes / total;
};
const results = [];
for (const label of ['in', 'out'])
  for (const text of held[label])
    results.push({ label, text, p: vote(await embed(text)) });
for (const threshold of [0.3, 0.4, 0.5, 0.6]) {
  const right = results.filter(
    (r) => (r.p >= threshold ? 'in' : 'out') === r.label,
  ).length;
  const refused = results.filter((r) => r.label === 'in' && r.p < threshold);
  console.log(
    `threshold ${threshold}: ${right}/${results.length} right, ${refused.length} false refusals`,
  );
}
for (const r of results)
  if ((r.p >= 0.4 ? 'in' : 'out') !== r.label)
    console.log(`${r.label} ${r.p.toFixed(2)} ${r.text}`);
