import * as z from 'zod/mini';

export const healthSchema = z.object({
  status: z.enum(['ok', 'error']),
  database: z.enum(['up', 'down']),
});
export type Health = z.infer<typeof healthSchema>;
