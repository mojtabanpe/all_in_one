import { HttpException } from '@nestjs/common';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { McpScope } from '@all-in-one/shared/schemas';
import type * as z from 'zod';

export type ToolKind = 'read' | 'create' | 'update' | 'delete';

const HINTS: Record<ToolKind, Record<string, boolean>> = {
  read: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  create: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: false,
  },
  update: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  delete: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
};

interface ToolSpec<S extends z.ZodRawShape | z.ZodType> {
  description: string;
  scope: McpScope;
  kind: ToolKind;
  input: S;
}

type Args<S> = S extends z.ZodRawShape
  ? z.infer<z.ZodObject<S>>
  : S extends z.ZodType
    ? z.infer<S>
    : never;

/** Something with a Zod-style `parse` (the contracts use zod/mini). */
interface Parser<T> {
  parse(value: unknown): T;
}

/** Validates with a contracts schema so MCP input gets the same rules as the REST api. */
export function parseWith<T>(schema: Parser<T>, value: unknown): T {
  return schema.parse(value);
}

/**
 * Registers tools for one authenticated request: checks the scope, runs the
 * owner-scoped service call and returns JSON text, or a readable error.
 */
export class ToolKit {
  readonly user: string;

  constructor(
    readonly server: McpServer,
    private readonly auth: AuthInfo,
  ) {
    this.user = String(auth.extra?.['userId']);
  }

  tool<S extends z.ZodRawShape | z.ZodType>(
    name: string,
    spec: ToolSpec<S>,
    run: (args: Args<S>) => Promise<unknown>,
  ): void {
    const register = this.server.registerTool.bind(this.server) as (
      name: string,
      config: Record<string, unknown>,
      cb: (args: Args<S>) => Promise<unknown>,
    ) => void;
    register(
      name,
      {
        description: spec.description,
        inputSchema: spec.input,
        annotations: HINTS[spec.kind],
        _meta: { securitySchemes: [{ type: 'oauth2', scopes: [spec.scope] }] },
      },
      (args) => this.call(spec.scope, () => run(args)),
    );
  }

  private async call(scope: McpScope, fn: () => Promise<unknown>) {
    const fail = (text: string) => ({
      isError: true,
      content: [{ type: 'text' as const, text }],
    });
    if (!this.auth.scopes.includes(scope))
      return fail(`Missing permission: ${scope}`);
    try {
      const result = (await fn()) ?? { ok: true };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    } catch (error) {
      if (error instanceof HttpException) return fail(error.message);
      const issues = (
        error as { issues?: { path: PropertyKey[]; message: string }[] }
      ).issues;
      if (Array.isArray(issues))
        return fail(
          issues
            .map((i) => `${i.path.join('.') || 'input'}: ${i.message}`)
            .join('; '),
        );
      return fail('Unable to complete the request.');
    }
  }
}
