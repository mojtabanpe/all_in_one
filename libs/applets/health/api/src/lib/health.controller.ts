import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  type AuthUser,
  CurrentUser,
  Public,
  Roles,
} from '@all-in-one/api/auth';
import {
  type ExerciseFilter,
  exerciseFilterSchema,
  exerciseVideoSchema,
  type GenerateRoutineInput,
  generateRoutineSchema,
  type SaveRoutineInput,
  saveRoutineSchema,
  type LogSessionInput,
  logSessionSchema,
  swapPlanMealSchema,
  type SwapPlanMealInput,
  type ActivityType,
  type Diet,
  type FitnessWeek,
  type GeneratePlanInput,
  generatePlanSchema,
  type HealthProfile,
  type HealthProfileInput,
  healthProfileSchema,
  type MealLog,
  type MealLogInput,
  mealLogSchema,
  type MealPlan,
  MEAL_TYPES,
  type MealType,
  type Recipe,
  type WorkoutLog,
  type WorkoutLogInput,
  workoutLogSchema,
  type WorkoutProgram,
  estimateMealSchema,
  type MealEstimate,
  type NutritionDay,
  type UpdateMealInput,
  updateMealSchema,
  type UpdateWorkoutInput,
  updateWorkoutSchema,
} from '@all-in-one/applets/health/contracts';
import { Throttle } from '@nestjs/throttler';
import * as z from 'zod/mini';
import { HealthAiService } from './health-ai.service';
import { TrainingService } from './training.service';
import { HealthService } from './health.service';

const dateQuery = z.object({ date: z.iso.date() });
const rangeQuery = z.object({ from: z.iso.date(), to: z.iso.date() });
const recipeQuery = z.object({
  mealType: z.optional(z.enum(MEAL_TYPES)),
  diet: z.optional(z.string().check(z.maxLength(64))),
});

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthService,
    private readonly training: TrainingService,
    private readonly ai: HealthAiService,
  ) {}

  @Get('exercises')
  exercises(@Query({ schema: exerciseFilterSchema }) query: ExerciseFilter) {
    return this.training.exercises(query);
  }

  @Get('exercises/:slug')
  exercise(@Param('slug') slug: string) {
    return this.training.exercise(slug);
  }

  @Get('exercises/:slug/alternatives')
  alternatives(
    @Param('slug') slug: string,
    @Query({ schema: exerciseFilterSchema }) query: ExerciseFilter,
  ) {
    return this.training.alternatives(slug, query.equipment);
  }

  @Roles('ADMIN')
  @Patch('exercises/:slug/video')
  video(
    @Param('slug') slug: string,
    @Body({ schema: exerciseVideoSchema }) input: { videoUrl: string | null },
  ) {
    return this.training.video(slug, input.videoUrl);
  }

  @Get('routines')
  routines(@CurrentUser() user: AuthUser) {
    return this.training.routines(user.id);
  }

  @Get('routines/:id')
  routine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.training.routine(user.id, id);
  }

  @Post('routines/generate')
  generateRoutine(
    @CurrentUser() user: AuthUser,
    @Body({ schema: generateRoutineSchema }) input: GenerateRoutineInput,
  ) {
    return this.training.generate(user.id, input);
  }

  @Post('routines')
  saveRoutine(
    @CurrentUser() user: AuthUser,
    @Body({ schema: saveRoutineSchema }) input: SaveRoutineInput,
  ) {
    return this.training.save(user.id, input);
  }

  @Put('routines/:id')
  updateRoutine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: saveRoutineSchema }) input: SaveRoutineInput,
  ) {
    return this.training.save(user.id, input, id);
  }

  @Delete('routines/:id')
  @HttpCode(204)
  removeRoutine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.training.remove(user.id, id);
  }

  @Post('training-sessions')
  logSession(
    @CurrentUser() user: AuthUser,
    @Body({ schema: logSessionSchema }) input: LogSessionInput,
  ) {
    return this.training.logSession(user.id, input);
  }

  @Get('training-progress')
  progress(
    @CurrentUser() user: AuthUser,
    @Query({ schema: rangeQuery }) query: { from: string; to: string },
  ) {
    return this.training.progress(user.id, query.from, query.to);
  }

  @Get('diet-suggestions')
  dietSuggestions(@CurrentUser() user: AuthUser) {
    return this.health.suggestions(user.id);
  }

  @Get('meal-plans/shopping-list')
  shoppingList(@CurrentUser() user: AuthUser) {
    return this.health.planShopping(user.id);
  }

  @Patch('meal-plans/current/meal')
  swapMeal(
    @CurrentUser() user: AuthUser,
    @Body({ schema: swapPlanMealSchema }) input: SwapPlanMealInput,
  ) {
    return this.health.swapPlanMeal(user.id, input);
  }

  // ---------- profile ----------

  @Get('profile')
  profile(@CurrentUser() user: AuthUser): Promise<HealthProfile> {
    return this.health.profile(user.id);
  }

  @Put('profile')
  saveProfile(
    @CurrentUser() user: AuthUser,
    @Body({ schema: healthProfileSchema }) input: HealthProfileInput,
  ): Promise<HealthProfile> {
    return this.health.saveProfile(user.id, input);
  }

  // ---------- fitness (catalog is public) ----------

  @Public()
  @Get('activities')
  activities(): Promise<ActivityType[]> {
    return this.health.activities();
  }

  @Public()
  @Get('programs')
  programs(): Promise<WorkoutProgram[]> {
    return this.health.programs();
  }

  @Get('workouts')
  workouts(
    @CurrentUser() user: AuthUser,
    @Query({ schema: rangeQuery }) q: { from: string; to: string },
  ): Promise<WorkoutLog[]> {
    return this.health.workouts(user.id, q.from, q.to);
  }

  @Post('workouts')
  logWorkout(
    @CurrentUser() user: AuthUser,
    @Body({ schema: workoutLogSchema }) input: WorkoutLogInput,
  ): Promise<WorkoutLog> {
    return this.health.logWorkout(user.id, input);
  }

  @Patch('workouts/:id')
  updateWorkout(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: updateWorkoutSchema }) input: UpdateWorkoutInput,
  ): Promise<WorkoutLog> {
    return this.health.updateWorkout(user.id, id, input);
  }

  @Delete('workouts/:id')
  @HttpCode(204)
  removeWorkout(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.health.removeWorkout(user.id, id);
  }

  @Get('workouts/week')
  week(
    @CurrentUser() user: AuthUser,
    @Query({ schema: dateQuery }) q: { date: string },
  ): Promise<FitnessWeek> {
    return this.health.week(user.id, q.date);
  }

  // ---------- nutrition (catalog is public) ----------

  @Public()
  @Get('diets')
  diets(): Promise<Diet[]> {
    return this.health.diets();
  }

  @Public()
  @Get('recipes')
  recipes(
    @Query({ schema: recipeQuery }) q: { mealType?: MealType; diet?: string },
  ): Promise<Recipe[]> {
    return this.health.recipes(q);
  }

  @Public()
  @Get('recipes/:slug')
  recipe(@Param('slug') slug: string): Promise<Recipe> {
    return this.health.recipe(slug);
  }

  @Get('meals')
  meals(
    @CurrentUser() user: AuthUser,
    @Query({ schema: dateQuery }) q: { date: string },
  ): Promise<MealLog[]> {
    return this.health.meals(user.id, q.date);
  }

  @Post('meals')
  logMeal(
    @CurrentUser() user: AuthUser,
    @Body({ schema: mealLogSchema }) input: MealLogInput,
  ): Promise<MealLog> {
    return this.health.logMeal(user.id, input);
  }

  @Patch('meals/:id')
  updateMeal(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: updateMealSchema }) input: UpdateMealInput,
  ): Promise<MealLog> {
    return this.health.updateMeal(user.id, id, input);
  }

  @Get('nutrition/day')
  nutritionDay(
    @CurrentUser() user: AuthUser,
    @Query({ schema: dateQuery }) q: { date: string },
  ): Promise<NutritionDay> {
    return this.health.nutritionDay(user.id, q.date);
  }

  /** Calories and macros of a described meal, from the user's AI. */
  @Post('ai/estimate-meal')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  estimateMeal(
    @CurrentUser() user: AuthUser,
    @Body({ schema: estimateMealSchema }) input: { description: string },
  ): Promise<MealEstimate> {
    return this.ai.estimateMeal(user.id, input.description);
  }

  @Delete('meals/:id')
  @HttpCode(204)
  removeMeal(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.health.removeMeal(user.id, id);
  }

  @Post('meal-plans')
  generatePlan(
    @CurrentUser() user: AuthUser,
    @Body({ schema: generatePlanSchema }) input: GeneratePlanInput,
  ): Promise<MealPlan> {
    return this.health.generatePlan(user.id, input);
  }

  @Get('meal-plans/current')
  currentPlan(@CurrentUser() user: AuthUser): Promise<MealPlan | null> {
    return this.health.currentPlan(user.id);
  }
}
