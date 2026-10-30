-- A new enum value cannot be used in the transaction that adds it, so it gets its own migration.
ALTER TYPE "TaskPriority" ADD VALUE 'NONE' BEFORE 'LOW';
