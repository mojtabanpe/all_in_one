import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { McpScope } from '@all-in-one/shared/schemas';
import type * as z from 'zod';
import type { ToolArgs, ToolKind, ToolSink, ToolSpec } from '../tools/tool-kit';
import { toolError } from '../tools/tool-kit';

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

/**
 * Registers tools on an MCP server for one authenticated request: checks the
 * token's scope, runs the owner-scoped service call and returns JSON text,
 * or a readable error.
 */
export class ToolKit implements ToolSink {
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
    run: (args: ToolArgs<S>) => Promise<unknown>,
  ): void {
    const register = this.server.registerTool.bind(this.server) as (
      name: string,
      config: Record<string, unknown>,
      cb: (args: ToolArgs<S>) => Promise<unknown>,
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
      return fail(toolError(error));
    }
  }
}
