-- CreateEnum
CREATE TYPE "CefrLevel" AS ENUM ('A1', 'A2', 'B1', 'B2', 'C1');

-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('FEMALE', 'MALE');

-- CreateEnum
CREATE TYPE "ActivityLevel" AS ENUM ('SEDENTARY', 'LIGHT', 'MODERATE', 'ACTIVE', 'VERY_ACTIVE');

-- CreateEnum
CREATE TYPE "HealthGoal" AS ENUM ('LOSE', 'MAINTAIN', 'GAIN');

-- CreateEnum
CREATE TYPE "DietMode" AS ENUM ('NONE', 'OWN', 'APP_DIET', 'APP_PLAN');

-- CreateEnum
CREATE TYPE "MealType" AS ENUM ('BREAKFAST', 'LUNCH', 'DINNER', 'SNACK');

-- CreateEnum
CREATE TYPE "Intensity" AS ENUM ('LOW', 'MODERATE', 'HIGH');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'DONE');

-- CreateTable
CREATE TABLE "english_decks" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(64) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "level" "CefrLevel" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "english_decks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "english_words" (
    "id" UUID NOT NULL,
    "deckId" UUID,
    "ownerId" UUID,
    "term" VARCHAR(80) NOT NULL,
    "phonetic" VARCHAR(80),
    "partOfSpeech" VARCHAR(20),
    "meaningFa" VARCHAR(200) NOT NULL,
    "example" VARCHAR(300),
    "exampleFa" VARCHAR(300),

    CONSTRAINT "english_words_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "english_word_progress" (
    "userId" UUID NOT NULL,
    "wordId" UUID NOT NULL,
    "box" INTEGER NOT NULL DEFAULT 1,
    "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviews" INTEGER NOT NULL DEFAULT 0,
    "lapses" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "english_word_progress_pkey" PRIMARY KEY ("userId","wordId")
);

-- CreateTable
CREATE TABLE "english_review_days" (
    "userId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "reviews" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "english_review_days_pkey" PRIMARY KEY ("userId","date")
);

-- CreateTable
CREATE TABLE "health_profiles" (
    "userId" UUID NOT NULL,
    "sex" "Sex",
    "birthYear" INTEGER,
    "heightCm" INTEGER,
    "weightKg" DOUBLE PRECISION,
    "activityLevel" "ActivityLevel" NOT NULL DEFAULT 'LIGHT',
    "goal" "HealthGoal" NOT NULL DEFAULT 'MAINTAIN',
    "dietMode" "DietMode" NOT NULL DEFAULT 'NONE',
    "dietSlug" VARCHAR(64),
    "ownDietNotes" VARCHAR(2000),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "health_profiles_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "activity_types" (
    "slug" VARCHAR(32) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "category" VARCHAR(16) NOT NULL,
    "met" DOUBLE PRECISION NOT NULL,
    "icon" VARCHAR(40) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "activity_types_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "workout_programs" (
    "slug" VARCHAR(64) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "activitySlug" VARCHAR(32) NOT NULL,
    "level" VARCHAR(16) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "sessionsPerWeek" INTEGER NOT NULL,
    "minutes" INTEGER NOT NULL,
    "exercises" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "workout_programs_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "workout_logs" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "activitySlug" VARCHAR(32) NOT NULL,
    "programSlug" VARCHAR(64),
    "date" DATE NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "intensity" "Intensity" NOT NULL DEFAULT 'MODERATE',
    "distanceKm" DOUBLE PRECISION,
    "steps" INTEGER,
    "calories" INTEGER,
    "notes" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workout_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "diets" (
    "slug" VARCHAR(64) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "summary" VARCHAR(300) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "carbsPct" INTEGER NOT NULL,
    "proteinPct" INTEGER NOT NULL,
    "fatPct" INTEGER NOT NULL,
    "encourage" TEXT[],
    "limit" TEXT[],
    "rules" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "diets_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "recipes" (
    "slug" VARCHAR(64) NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "mealType" "MealType" NOT NULL,
    "diets" TEXT[],
    "calories" INTEGER NOT NULL,
    "proteinG" INTEGER NOT NULL,
    "carbsG" INTEGER NOT NULL,
    "fatG" INTEGER NOT NULL,
    "prepMinutes" INTEGER NOT NULL,
    "ingredients" JSONB NOT NULL,
    "steps" JSONB NOT NULL,
    "tags" TEXT[],

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("slug")
);

-- CreateTable
CREATE TABLE "meal_logs" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "mealType" "MealType" NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "portions" JSONB NOT NULL,
    "calories" INTEGER,
    "score" INTEGER NOT NULL,
    "feedback" JSONB NOT NULL,
    "recipeSlug" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meal_plans" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "dietSlug" VARCHAR(64) NOT NULL,
    "calorieTarget" INTEGER NOT NULL,
    "days" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meal_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planner_tasks" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "notes" VARCHAR(2000),
    "date" DATE NOT NULL,
    "time" VARCHAR(5),
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "area" VARCHAR(32) NOT NULL DEFAULT 'personal',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planner_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "english_decks_slug_key" ON "english_decks"("slug");

-- CreateIndex
CREATE INDEX "english_words_ownerId_idx" ON "english_words"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "english_words_deckId_term_key" ON "english_words"("deckId", "term");

-- CreateIndex
CREATE INDEX "english_word_progress_userId_dueAt_idx" ON "english_word_progress"("userId", "dueAt");

-- CreateIndex
CREATE INDEX "workout_logs_userId_date_idx" ON "workout_logs"("userId", "date");

-- CreateIndex
CREATE INDEX "meal_logs_userId_date_idx" ON "meal_logs"("userId", "date");

-- CreateIndex
CREATE INDEX "meal_plans_userId_startDate_idx" ON "meal_plans"("userId", "startDate");

-- CreateIndex
CREATE INDEX "planner_tasks_userId_date_idx" ON "planner_tasks"("userId", "date");

-- AddForeignKey
ALTER TABLE "english_words" ADD CONSTRAINT "english_words_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "english_decks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "english_words" ADD CONSTRAINT "english_words_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "english_word_progress" ADD CONSTRAINT "english_word_progress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "english_word_progress" ADD CONSTRAINT "english_word_progress_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "english_words"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "english_review_days" ADD CONSTRAINT "english_review_days_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_profiles" ADD CONSTRAINT "health_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_profiles" ADD CONSTRAINT "health_profiles_dietSlug_fkey" FOREIGN KEY ("dietSlug") REFERENCES "diets"("slug") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_programs" ADD CONSTRAINT "workout_programs_activitySlug_fkey" FOREIGN KEY ("activitySlug") REFERENCES "activity_types"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_logs" ADD CONSTRAINT "workout_logs_activitySlug_fkey" FOREIGN KEY ("activitySlug") REFERENCES "activity_types"("slug") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_logs" ADD CONSTRAINT "meal_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planner_tasks" ADD CONSTRAINT "planner_tasks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
