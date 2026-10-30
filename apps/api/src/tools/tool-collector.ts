import type { ToolDefinition } from '@all-in-one/api/ai';
import * as z from 'zod';
import {
  type ToolArgs,
  type ToolKind,
  type ToolSink,
  type ToolSpec,
  toolError,
} from './tool-kit';

interface Entry {
  name: string;
  kind: ToolKind;
  schema: z.ZodType;
  description: string;
  run: (args: unknown) => Promise<unknown>;
}

/** Collects tools as OpenAI function definitions for the in-app assistant. */
export class ToolCollector implements ToolSink {
  private readonly entries = new Map<string, Entry>();

  constructor(readonly user: string) {}

  tool<S extends z.ZodRawShape | z.ZodType>(
    name: string,
    spec: ToolSpec<S>,
    run: (args: ToolArgs<S>) => Promise<unknown>,
  ): void {
    if (spec.assistant === false) return;
    const schema =
      spec.input instanceof z.ZodType
        ? spec.input
        : z.object(spec.input as z.ZodRawShape);
    this.entries.set(name, {
      name,
      kind: spec.kind,
      schema,
      description: spec.description,
      run: run as (args: unknown) => Promise<unknown>,
    });
  }

  get names(): string[] {
    return [...this.entries.keys()];
  }

  kind(name: string): ToolKind | undefined {
    return this.entries.get(name)?.kind;
  }

  definitions(): ToolDefinition[] {
    return [...this.entries.values()].map((e) => {
      const { $schema: _, ...parameters } = z.toJSONSchema(e.schema, {
        io: 'input',
        unrepresentable: 'any',
      }) as Record<string, unknown>;
      return {
        type: 'function',
        function: { name: e.name, description: e.description, parameters },
      };
    });
  }

  /** Runs a tool call from the model; the result (or error) is JSON text for the model. */
  async call(
    name: string,
    rawArgs: string,
  ): Promise<{ ok: boolean; text: string }> {
    const entry = this.entries.get(name);
    if (!entry) return { ok: false, text: `Unknown tool: ${name}` };
    try {
      const args = entry.schema.parse(
        rawArgs.trim() ? JSON.parse(rawArgs) : {},
      );
      const result = (await entry.run(args)) ?? { ok: true };
      return { ok: true, text: JSON.stringify(result) };
    } catch (error) {
      return {
        ok: false,
        text:
          error instanceof SyntaxError
            ? 'Arguments are not valid JSON.'
            : toolError(error),
      };
    }
  }
}
