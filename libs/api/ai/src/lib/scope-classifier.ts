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

export interface RankedCandidate {
  id: string;
  similarity: number;
  probability: number;
}

/** Ranks candidate vectors against a query vector by cosine similarity and softmax probability. */
export function rankVectors(
  vector: Float32Array,
  candidates: readonly { id: string; vector: Float32Array }[],
): RankedCandidate[] {
  if (!candidates.length) return [];
  const scored = candidates
    .map((candidate) => {
      let similarity = 0;
      for (let i = 0; i < vector.length; i++)
        similarity += vector[i] * candidate.vector[i];
      return { id: candidate.id, similarity };
    })
    .sort((a, b) => b.similarity - a.similarity);
  let totalWeight = 0;
  const weights = scored.map((item) => {
    const weight = Math.exp(item.similarity * SHARPNESS);
    totalWeight += weight;
    return weight;
  });
  return scored.map((item, index) => ({
    id: item.id,
    similarity: item.similarity,
    probability: totalWeight > 0 ? weights[index] / totalWeight : 0,
  }));
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
  private readonly candidateCache = new Map<string, Float32Array>();

  constructor(private readonly config: ConfigService) {}

  private warned = false;

  /**
   * Off unless `AI_SCOPE_LOCAL_MODEL=on`: the model needs about 400 MB of RAM, and the first deploy that loaded it
   * at startup took the server's deploy runner down. Turn it on only once the server has the memory.
   */
  get enabled(): boolean {
    return this.config.get<string>('AI_SCOPE_LOCAL_MODEL') === 'on';
  }

  /** P(in scope), or null when the model is off or cannot be loaded (logged once). */
  async probability(text: string): Promise<number | null> {
    if (!this.enabled) {
      if (!this.warned)
        this.logger.warn(
          'Local scope model is off (AI_SCOPE_LOCAL_MODEL is not "on"); requests pass unchecked',
        );
      this.warned = true;
      return null;
    }
    const model = await this.load();
    if (!model) return null;
    return vote(await model.embed(text), model.examples);
  }

  /**
   * Ranks candidate options (e.g. expense categories) against `text` using the local embedding model.
   * Returns null when the local model is off or cannot be loaded.
   */
  async rankCandidates(
    text: string,
    candidates: readonly { id: string; text: string }[],
  ): Promise<RankedCandidate[] | null> {
    if (!this.enabled || !candidates.length) return null;
    const model = await this.load();
    if (!model) return null;
    const queryVector = await model.embed(text);
    const embedded: { id: string; vector: Float32Array }[] = [];
    for (const candidate of candidates) {
      let vec = this.candidateCache.get(candidate.text);
      if (!vec) {
        vec = await model.embed(candidate.text);
        if (this.candidateCache.size >= 500) {
          const oldest = this.candidateCache.keys().next().value;
          if (oldest !== undefined) this.candidateCache.delete(oldest);
        }
        this.candidateCache.set(candidate.text, vec);
      }
      embedded.push({ id: candidate.id, vector: vec });
    }
    return rankVectors(queryVector, embedded);
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
      // One thread: a short request needs no more, and it keeps CPU spikes off the rest of the server.
      session_options: { intraOpNumThreads: 1, interOpNumThreads: 1 },
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
