import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SCOPE_IN, SCOPE_OUT } from './scope-anchors';

/** Multilingual (Persian + English) sentence embeddings, int8-quantised: about 120 MB, a few ms per request. */
export const SCOPE_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
/** Nearest examples that vote, and how sharply closer ones count. */
const NEIGHBOURS = 7;
const SHARPNESS = 20;

type Embed = (text: string) => Promise<Float32Array>;
interface Example {
  inScope: boolean;
  vector: Float32Array;
}

/** P(in scope) from the nearest labelled examples (cosine similarity of normalised vectors). */
export function vote(vector: Float32Array, examples: readonly Example[]) {
  const nearest = examples
    .map((example) => {
      let similarity = 0;
      for (let i = 0; i < vector.length; i++)
        similarity += vector[i] * example.vector[i];
      return { inScope: example.inScope, similarity };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, NEIGHBOURS);
  let total = 0;
  let yes = 0;
  for (const { inScope, similarity } of nearest) {
    const weight = Math.exp(similarity * SHARPNESS);
    total += weight;
    if (inScope) yes += weight;
  }
  return total ? yes / total : 1;
}

/**
 * The local decision model: a small embedding model on our own server, so no request leaves it and nothing is
 * paid per call. It compares a request with the labelled examples in `scope-anchors.ts`. The model files are
 * baked into the api image (`AI_SCOPE_MODEL_DIR`, never fetched at runtime there); without that variable
 * (development) they are downloaded once into a cache.
 */
@Injectable()
export class LocalScopeClassifier {
  private readonly logger = new Logger(LocalScopeClassifier.name);
  private loading?: Promise<{ embed: Embed; examples: Example[] } | null>;

  constructor(private readonly config: ConfigService) {}

  /** P(in scope), or null when the model cannot be loaded (logged once). */
  async probability(text: string): Promise<number | null> {
    const model = await this.load();
    if (!model) return null;
    return vote(await model.embed(text), model.examples);
  }

  /** Starts loading in the background (first request then needs no wait). */
  warm(): void {
    void this.load();
  }

  private load() {
    this.loading ??= this.open().catch((error: unknown) => {
      this.logger.error(
        `Scope model could not load (${error instanceof Error ? error.message : 'unknown'}); requests pass unchecked`,
      );
      return null;
    });
    return this.loading;
  }

  private async open() {
    const started = Date.now();
    const { pipeline, env } = await import('@huggingface/transformers');
    const dir = this.config.get<string>('AI_SCOPE_MODEL_DIR');
    if (dir) {
      env.localModelPath = dir;
      env.allowRemoteModels = false;
    }
    const extract = await pipeline('feature-extraction', SCOPE_MODEL, {
      dtype: 'q8',
    });
    const embed: Embed = async (text) =>
      (await extract(text, { pooling: 'mean', normalize: true }))
        .data as Float32Array;
    const examples: Example[] = [];
    for (const [inScope, list] of [
      [true, SCOPE_IN],
      [false, SCOPE_OUT],
    ] as const)
      for (const sentence of list)
        examples.push({ inScope, vector: await embed(sentence) });
    this.logger.log(
      `Scope model ready (${examples.length} examples, ${Date.now() - started} ms)`,
    );
    return { embed, examples };
  }
}
