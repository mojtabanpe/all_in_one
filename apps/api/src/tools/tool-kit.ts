import { HttpException } from '@nestjs/common';
import type { McpScope } from '@all-in-one/shared/schemas';
import type * as z from 'zod';

export type ToolKind = 'read' | 'create' | 'update' | 'delete';

export interface ToolSpec<S extends z.ZodRawShape | z.ZodType> {
  description: string;
  scope: McpScope;
  kind: ToolKind;
  input: S;
  /**
   * false keeps a tool out of the in-app assistant: actions that can't be
   * undone in bulk or that reach other people (data the model reads may
   * include text written by other members of a shared list).
   */
  assistant?: boolean;
}

export type ToolArgs<S> = S extends z.ZodRawShape
  ? z.infer<z.ZodObject<S>>
  : S extends z.ZodType
    ? z.infer<S>
    : never;

/** Where tool definitions go: the MCP server or the in-app assistant. */
export interface ToolSink {
  /** The user every tool acts for. */
  readonly user: string;
  tool<S extends z.ZodRawShape | z.ZodType>(
    name: string,
    spec: ToolSpec<S>,
    run: (args: ToolArgs<S>) => Promise<unknown>,
  ): void;
}

/** Something with a Zod-style `parse` (the contracts use zod/mini). */
interface Parser<T> {
  parse(value: unknown): T;
}

/** Validates with a contracts schema so tool input gets the same rules as the REST api. */
export function parseWith<T>(schema: Parser<T>, value: unknown): T {
  return schema.parse(value);
}

/** A readable message for a failed tool call (never internals). */
export function toolError(error: unknown): string {
  if (error instanceof HttpException) return error.message;
  const issues = (
    error as { issues?: { path: PropertyKey[]; message: string }[] }
  ).issues;
  if (Array.isArray(issues))
    return issues
      .map((i) => `${i.path.join('.') || 'input'}: ${i.message}`)
      .join('; ');
  return 'Unable to complete the request.';
}
