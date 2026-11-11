-- Additive: old API releases can continue serving during blue/green rollout.
CREATE TABLE "focus_push_timers" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "sessionVersion" INTEGER NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "focus_push_timers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "focus_push_timers_dueAt_idx" ON "focus_push_timers"("dueAt");
CREATE INDEX "focus_push_timers_userId_idx" ON "focus_push_timers"("userId");
ALTER TABLE "focus_push_timers" ADD CONSTRAINT "focus_push_timers_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
