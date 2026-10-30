import * as z from 'zod/mini';

/** Permissions a ChatGPT (MCP) connection can hold. */
export const MCP_SCOPES = [
  'cards:read',
  'cards:write',
  'readings:read',
  'readings:write',
  'planner:read',
  'planner:write',
  'health:read',
  'health:write',
] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

export const MCP_SCOPE_LABELS: Record<McpScope, string> = {
  'cards:read': 'دیدن دسته‌ها و کارت‌های انگلیسی',
  'cards:write': 'ساختن و ویرایش کارت‌ها و ثبت مرور',
  'readings:read': 'دیدن متن‌های خواندنی',
  'readings:write': 'ذخیره و ویرایش متن‌های خواندنی',
  'planner:read': 'دیدن کارها، فهرست‌ها، عادت‌ها و تمرکز',
  'planner:write': 'ساختن و ویرایش کارها، عادت‌ها، تمرکز و روزشمارها',
  'health:read': 'دیدن پروفایل سلامت، وعده‌ها، کالری و ورزش‌ها',
  'health:write': 'ثبت و ویرایش وعده‌ها، ورزش‌ها، پروفایل و برنامه غذایی',
};

/** A personal token's metadata; the token itself is shown once, at creation. */
export interface McpKeyInfo {
  id: string;
  name: string;
  scopes: McpScope[];
  createdAt: string;
  expiresAt: string;
}

export const createMcpKeySchema = z.object({
  name: z.string().check(z.trim(), z.minLength(1), z.maxLength(80)),
  scopes: z.optional(
    z
      .array(z.enum(MCP_SCOPES))
      .check(z.minLength(1), z.maxLength(MCP_SCOPES.length)),
  ),
});
export type CreateMcpKeyInput = z.infer<typeof createMcpKeySchema>;
