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
  Query,
} from '@nestjs/common';
import { type AuthUser, CurrentUser } from '@all-in-one/api/auth';
import {
  type CreateTaskInput,
  createTaskSchema,
  type ListTasksQuery,
  listTasksQuerySchema,
  type PlannerTask,
  type UpdateTaskInput,
  updateTaskSchema,
} from '@all-in-one/applets/planner/contracts';
import { PlannerService } from './planner.service';

@Controller('planner/tasks')
export class PlannerController {
  constructor(private readonly planner: PlannerService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: listTasksQuerySchema }) query: ListTasksQuery,
  ): Promise<PlannerTask[]> {
    return this.planner.list(user.id, query);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createTaskSchema }) input: CreateTaskInput,
  ): Promise<PlannerTask> {
    return this.planner.create(user.id, input);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: updateTaskSchema }) input: UpdateTaskInput,
  ): Promise<PlannerTask> {
    return this.planner.update(user.id, id, input);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.planner.remove(user.id, id);
  }
}
