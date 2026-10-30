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
  type AddMemberInput,
  addMemberSchema,
  assignSchema,
  type BatchCreateTasksInput,
  batchCreateTasksSchema,
  type BatchUpdateTasksInput,
  batchUpdateTasksSchema,
  type CheckinInput,
  checkinSchema,
  checklistItemSchema,
  commentSchema,
  type CompleteInListInput,
  completeInListSchema,
  type CreateCalendarInput,
  createCalendarSchema,
  type CreateCountdownInput,
  createCountdownSchema,
  type CreateFocusInput,
  createFocusSchema,
  type CreateHabitInput,
  createHabitSchema,
  type CreateListInput,
  createListSchema,
  type CreateTaskInput,
  createTaskSchema,
  type DateRange,
  dateRangeSchema,
  type EventsQuery,
  eventsQuerySchema,
  type FocusQuery,
  focusQuerySchema,
  type FolderInput,
  folderSchema,
  type HabitQuery,
  habitQuerySchema,
  type MoveTaskInput,
  moveTaskSchema,
  type SectionInput,
  sectionSchema,
  type TagInput,
  tagSchema,
  type TaskFilter,
  taskFilterSchema,
  type UpdateCalendarInput,
  updateCalendarSchema,
  type UpdateChecklistItemInput,
  updateChecklistItemSchema,
  type UpdateCountdownInput,
  updateCountdownSchema,
  type UpdateFocusInput,
  updateFocusSchema,
  type UpdateHabitInput,
  updateHabitSchema,
  type UpdateListInput,
  updateListSchema,
  type UpdateTagInput,
  updateTagSchema,
  type UpdateTaskInput,
  updateTaskSchema,
} from '@all-in-one/applets/planner/contracts';
import * as z from 'zod/mini';
import { CalendarsService } from './calendars.service';
import { CountdownsService, FocusService } from './focus.service';
import { HabitsService } from './habits.service';
import { ListsService } from './lists.service';
import { TagsService } from './tags.service';
import { TasksService } from './tasks.service';

const partialSection = z.partial(sectionSchema);
const partialFolder = z.partial(folderSchema);
const Id = () => Param('id', ParseUUIDPipe);

/** Lists, sections, folders, members and tags. */
@Controller('planner')
export class PlannerListsController {
  constructor(
    private readonly lists: ListsService,
    private readonly tags: TagsService,
  ) {}

  @Get('lists')
  all(@CurrentUser() user: AuthUser) {
    return this.lists.all(user.id);
  }

  @Get('lists/:id')
  get(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.lists.get(user.id, id);
  }

  @Post('lists')
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createListSchema }) input: CreateListInput,
  ) {
    return this.lists.create(user.id, input);
  }

  @Patch('lists/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Id() id: string,
    @Body({ schema: updateListSchema }) input: UpdateListInput,
  ) {
    return this.lists.update(user.id, id, input);
  }

  @Delete('lists/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.lists.remove(user.id, id);
  }

  @Post('lists/:id/sections')
  addSection(
    @CurrentUser() user: AuthUser,
    @Id() id: string,
    @Body({ schema: sectionSchema }) input: SectionInput,
  ) {
    return this.lists.addSection(user.id, id, input);
  }

  @Patch('sections/:id')
  updateSection(
    @CurrentUser() user: AuthUser,
    @Id() id: string,
    @Body({ schema: partialSection }) input: Partial<SectionInput>,
  ) {
    return this.lists.updateSection(user.id, id, input);
  }

  @Delete('sections/:id')
  @HttpCode(204)
  removeSection(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.lists.removeSection(user.id, id);
  }

  @Post('lists/:id/members')
  addMember(
    @CurrentUser() user: AuthUser,
    @Id() id: string,
    @Body({ schema: addMemberSchema }) input: AddMemberInput,
  ) {
    return this.lists.addMember(user.id, id, input.email);
  }

  @Delete('lists/:id/members/:userId')
  @HttpCode(204)
  removeMember(
    @CurrentUser() user: AuthUser,
    @Id() id: string,
    @Param('userId', ParseUUIDPipe) memberId: string,
  ) {
    return this.lists.removeMember(user.id, id, memberId);
  }

  @Get('folders')
  folders(@CurrentUser() user: AuthUser) {
    return this.lists.folders(user.id);
  }

  @Post('folders')
  createFolder(
    @CurrentUser() user: AuthUser,
    @Body({ schema: folderSchema }) input: FolderInput,
  ) {
    return this.lists.createFolder(user.id, input);
  }

  @Patch('folders/:id')
  updateFolder(
    @CurrentUser() user: AuthUser,
    @Id() id: string,
    @Body({ schema: partialFolder }) input: Partial<FolderInput>,
  ) {
    return this.lists.updateFolder(user.id, id, input);
  }

  @Delete('folders/:id')
  @HttpCode(204)
  removeFolder(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.lists.removeFolder(user.id, id);
  }

  @Get('tags')
  allTags(@CurrentUser() user: AuthUser) {
    return this.tags.all(user.id);
  }

  @Post('tags')
  createTag(
    @CurrentUser() user: AuthUser,
    @Body({ schema: tagSchema }) input: TagInput,
  ) {
    return this.tags.create(user.id, input);
  }

  @Patch('tags/:id')
  updateTag(
    @CurrentUser() user: AuthUser,
    @Id() id: string,
    @Body({ schema: updateTagSchema }) input: UpdateTagInput,
  ) {
    return this.tags.update(user.id, id, input);
  }

  @Delete('tags/:id')
  @HttpCode(204)
  removeTag(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.tags.remove(user.id, id);
  }
}

/** Tasks: queries, writes, checklist, comments and trash. */
@Controller('planner')
export class PlannerTasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get('tasks')
  filter(
    @CurrentUser() user: AuthUser,
    @Query({ schema: taskFilterSchema }) filter: TaskFilter,
  ) {
    return this.tasks.filter(user.id, filter);
  }

  @Get('tasks/undone')
  undone(
    @CurrentUser() user: AuthUser,
    @Query({ schema: dateRangeSchema }) range: DateRange,
  ) {
    return this.tasks.undoneInRange(user.id, range.from, range.to);
  }

  @Get('tasks/completed')
  completed(
    @CurrentUser() user: AuthUser,
    @Query({ schema: dateRangeSchema }) range: DateRange,
  ) {
    return this.tasks.filter(user.id, {
      completedFrom: range.from,
      completedTo: range.to,
    });
  }

  @Get('tasks/:id')
  get(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.tasks.get(user.id, id);
  }

  @Post('tasks')
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createTaskSchema }) input: CreateTaskInput,
  ) {
    return this.tasks.create(user.id, input);
  }

  @Post('tasks/batch')
  createMany(
    @CurrentUser() user: AuthUser,
    @Body({ schema: batchCreateTasksSchema }) input: BatchCreateTasksInput,
  ) {
    return this.tasks.createMany(user.id, input.tasks);
  }

  @Patch('tasks/batch')
  updateMany(
    @CurrentUser() user: AuthUser,
    @Body({ schema: batchUpdateTasksSchema }) input: BatchUpdateTasksInput,
  ) {
    return this.tasks.updateMany(user.id, input.tasks);
  }

  @Post('tasks/complete')
  @HttpCode(200)
  completeInList(
    @CurrentUser() user: AuthUser,
    @Body({ schema: completeInListSchema }) input: CompleteInListInput,
  ) {
    return this.tasks.completeInList(user.id, input.listId, input.taskIds);
  }

  @Patch('tasks/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Id() id: string,
    @Body({ schema: updateTaskSchema }) input: UpdateTaskInput,
  ) {
    return this.tasks.update(user.id, id, input);
  }

  @Post('tasks/:id/complete')
  @HttpCode(200)
  complete(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.tasks.update(user.id, id, { done: true });
  }

  @Post('tasks/:id/move')
  @HttpCode(200)
  move(
    @CurrentUser() user: AuthUser,
    @Id() id: string,
    @Body({ schema: moveTaskSchema }) input: MoveTaskInput,
  ) {
    return this.tasks.update(user.id, id, input);
  }

  @Post('tasks/:id/assign')
  @HttpCode(200)
  assign(
    @CurrentUser() user: AuthUser,
    @Id() id: string,
    @Body({ schema: assignSchema }) input: { assigneeId: string | null },
  ) {
    return this.tasks.update(user.id, id, input);
  }

  /** Moves the task to the trash. */
  @Delete('tasks/:id')
  @HttpCode(204)
  trash(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.tasks.trash(user.id, id);
  }

  @Post('tasks/:id/restore')
  @HttpCode(200)
  restore(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.tasks.restore(user.id, id);
  }

  @Post('tasks/:id/checklist')
  addItem(
    @CurrentUser() user: AuthUser,
    @Id() id: string,
    @Body({ schema: checklistItemSchema }) input: { title: string },
  ) {
    return this.tasks.addItem(user.id, id, input.title);
  }

  @Patch('tasks/:id/checklist/:itemId')
  updateItem(
    @CurrentUser() user: AuthUser,
    @Id() id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body({ schema: updateChecklistItemSchema })
    input: UpdateChecklistItemInput,
  ) {
    return this.tasks.updateItem(user.id, id, itemId, input);
  }

  @Delete('tasks/:id/checklist/:itemId')
  removeItem(
    @CurrentUser() user: AuthUser,
    @Id() id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ) {
    return this.tasks.removeItem(user.id, id, itemId);
  }

  @Get('tasks/:id/comments')
  comments(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.tasks.comments(user.id, id);
  }

  @Post('tasks/:id/comments')
  addComment(
    @CurrentUser() user: AuthUser,
    @Id() id: string,
    @Body({ schema: commentSchema }) input: { body: string },
  ) {
    return this.tasks.addComment(user.id, id, input.body);
  }

  @Delete('comments/:id')
  @HttpCode(204)
  removeComment(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.tasks.removeComment(user.id, id);
  }

  @Get('trash')
  trashed(@CurrentUser() user: AuthUser) {
    return this.tasks.trashed(user.id);
  }

  @Delete('trash')
  @HttpCode(204)
  emptyTrash(@CurrentUser() user: AuthUser) {
    return this.tasks.purge(user.id);
  }

  @Delete('trash/:id')
  @HttpCode(204)
  purge(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.tasks.purge(user.id, id);
  }
}

/** Habits, habit sections and check-ins. */
@Controller('planner')
export class PlannerHabitsController {
  constructor(private readonly habits: HabitsService) {}

  @Get('habits')
  all(
    @CurrentUser() user: AuthUser,
    @Query({ schema: habitQuerySchema }) query: HabitQuery,
  ) {
    const range =
      query.from || query.to
        ? {
            from: query.from ?? query.to ?? '',
            to: query.to ?? query.from ?? '',
          }
        : undefined;
    return this.habits.all(user.id, range, query.archived);
  }

  @Post('habits')
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createHabitSchema }) input: CreateHabitInput,
  ) {
    return this.habits.create(user.id, input);
  }

  @Patch('habits/:id')
  update(
    @CurrentUser() user: AuthUser,
    @Id() id: string,
    @Body({ schema: updateHabitSchema }) input: UpdateHabitInput,
  ) {
    return this.habits.update(user.id, id, input);
  }

  @Delete('habits/:id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.habits.remove(user.id, id);
  }

  @Post('habits/:id/checkins')
  @HttpCode(200)
  checkin(
    @CurrentUser() user: AuthUser,
    @Id() id: string,
    @Body({ schema: checkinSchema }) input: CheckinInput,
  ) {
    return this.habits.checkin(user.id, id, input);
  }

  @Get('habit-sections')
  sections(@CurrentUser() user: AuthUser) {
    return this.habits.sections(user.id);
  }

  @Post('habit-sections')
  createSection(
    @CurrentUser() user: AuthUser,
    @Body({ schema: sectionSchema }) input: SectionInput,
  ) {
    return this.habits.createSection(user.id, input);
  }

  @Patch('habit-sections/:id')
  updateSection(
    @CurrentUser() user: AuthUser,
    @Id() id: string,
    @Body({ schema: partialSection }) input: Partial<SectionInput>,
  ) {
    return this.habits.updateSection(user.id, id, input);
  }

  @Delete('habit-sections/:id')
  @HttpCode(204)
  removeSection(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.habits.removeSection(user.id, id);
  }
}

/** Focus records, subscribed calendars and countdowns. */
@Controller('planner')
export class PlannerTimeController {
  constructor(
    private readonly focus: FocusService,
    private readonly calendars: CalendarsService,
    private readonly countdowns: CountdownsService,
  ) {}

  @Get('focus')
  focusList(
    @CurrentUser() user: AuthUser,
    @Query({ schema: focusQuerySchema }) query: FocusQuery,
  ) {
    return this.focus.list(user.id, query);
  }

  @Post('focus')
  createFocus(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createFocusSchema }) input: CreateFocusInput,
  ) {
    return this.focus.create(user.id, input);
  }

  @Patch('focus/:id')
  updateFocus(
    @CurrentUser() user: AuthUser,
    @Id() id: string,
    @Body({ schema: updateFocusSchema }) input: UpdateFocusInput,
  ) {
    return this.focus.update(user.id, id, input);
  }

  @Delete('focus/:id')
  @HttpCode(204)
  removeFocus(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.focus.remove(user.id, id);
  }

  @Get('calendars')
  allCalendars(@CurrentUser() user: AuthUser) {
    return this.calendars.all(user.id);
  }

  @Get('calendars/events')
  events(
    @CurrentUser() user: AuthUser,
    @Query({ schema: eventsQuerySchema }) query: EventsQuery,
  ) {
    return this.calendars.events(user.id, query, query.calendarId);
  }

  @Post('calendars')
  createCalendar(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createCalendarSchema }) input: CreateCalendarInput,
  ) {
    return this.calendars.create(user.id, input);
  }

  @Patch('calendars/:id')
  updateCalendar(
    @CurrentUser() user: AuthUser,
    @Id() id: string,
    @Body({ schema: updateCalendarSchema }) input: UpdateCalendarInput,
  ) {
    return this.calendars.update(user.id, id, input);
  }

  @Delete('calendars/:id')
  @HttpCode(204)
  removeCalendar(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.calendars.remove(user.id, id);
  }

  @Get('countdowns')
  allCountdowns(@CurrentUser() user: AuthUser) {
    return this.countdowns.all(user.id);
  }

  @Post('countdowns')
  createCountdown(
    @CurrentUser() user: AuthUser,
    @Body({ schema: createCountdownSchema }) input: CreateCountdownInput,
  ) {
    return this.countdowns.create(user.id, input);
  }

  @Patch('countdowns/:id')
  updateCountdown(
    @CurrentUser() user: AuthUser,
    @Id() id: string,
    @Body({ schema: updateCountdownSchema }) input: UpdateCountdownInput,
  ) {
    return this.countdowns.update(user.id, id, input);
  }

  @Delete('countdowns/:id')
  @HttpCode(204)
  removeCountdown(@CurrentUser() user: AuthUser, @Id() id: string) {
    return this.countdowns.remove(user.id, id);
  }
}
