/**
 * Downloads the AI scope check's local model (directive 110) into a folder, for the api image:
 *   node tools/scripts/fetch-scope-model.mjs /app/models
 * The api then reads it with AI_SCOPE_MODEL_DIR and never fetches anything at runtime.
 */
import { env, pipeline } from '@huggingface/transformers';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Keep in step with SCOPE_MODEL in libs/api/ai/src/lib/scope-classifier.ts.
const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const dir = process.argv[2];
if (!dir) throw new Error('Usage: fetch-scope-model.mjs <folder>');
env.cacheDir = dir;
const extract = await pipeline('feature-extraction', MODEL, { dtype: 'q8' });
const vector = await extract('سلام', { pooling: 'mean', normalize: true });
if (!vector.data.length) throw new Error('The scope model returned no vector');
for (const file of [
  'config.json',
  'tokenizer.json',
  'onnx/model_quantized.onnx',
])
  if (!existsSync(join(dir, MODEL, file)))
    throw new Error(`Missing ${file} under ${join(dir, MODEL)}`);
console.log(`Scope model saved under ${join(dir, MODEL)}`);
