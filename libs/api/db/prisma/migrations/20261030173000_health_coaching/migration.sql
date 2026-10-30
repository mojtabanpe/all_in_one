-- AlterTable
ALTER TABLE "health_profiles" ADD COLUMN     "excludedIngredients" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "workout_logs" ADD COLUMN     "completedSets" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "routineId" UUID;

-- CreateTable
CREATE TABLE "health_exercises" (
    "slug" VARCHAR(64) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "equipment" VARCHAR(16) NOT NULL,
    "muscle" VARCHAR(16) NOT NULL,
    "secondaryMuscles" TEXT[],
    "level" VARCHAR(16) NOT NULL,
    "instructions" TEXT[],
    "mistakes" TEXT[],
    "alternatives" TEXT[],
    "videoUrl" VARCHAR(2000),
    "timed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "health_exercises_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "health_routines" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "goal" VARCHAR(16) NOT NULL,
    "level" VARCHAR(16) NOT NULL,
    "equipment" TEXT[],
    "daysPerWeek" INTEGER NOT NULL,
    "weeks" INTEGER NOT NULL,
    "minutes" INTEGER NOT NULL,
    "days" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "health_routines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "health_routines_userId_createdAt_idx" ON "health_routines"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "health_routines" ADD CONSTRAINT "health_routines_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
