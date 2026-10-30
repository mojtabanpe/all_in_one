import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { type PlannerList as DbList, PrismaService } from '@all-in-one/api/db';
import type { ListRole } from '@all-in-one/applets/planner/contracts';

export const INBOX_NAME = 'صندوق ورودی';

/**
 * Who can see what: a list is open to its members (the owner is one), and
 * a task to the members of its list. Each user gets one Inbox, made lazily.
 */
@Injectable()
export class PlannerAccess {
  constructor(private readonly prisma: PrismaService) {}

  async inbox(userId: string): Promise<DbList> {
    const found = await this.prisma.plannerList.findFirst({
      where: { ownerId: userId, isInbox: true },
    });
    if (found) return found;
    return this.prisma.plannerList.create({
      data: {
        ownerId: userId,
        name: INBOX_NAME,
        isInbox: true,
        sortOrder: -1,
        members: { create: { userId, role: 'OWNER' } },
      },
    });
  }

  /** Ids of every list the user is a member of (making the Inbox first). */
  async listIds(userId: string): Promise<string[]> {
    await this.inbox(userId);
    const rows = await this.prisma.plannerListMember.findMany({
      where: { userId },
      select: { listId: true },
    });
    return rows.map((r) => r.listId);
  }

  /** The user's role on a list; 404 when they are not a member. */
  async list(
    userId: string,
    listId: string,
    need: ListRole = 'EDITOR',
  ): Promise<{ list: DbList; role: ListRole }> {
    const member = await this.prisma.plannerListMember.findUnique({
      where: { listId_userId: { listId, userId } },
      include: { list: true },
    });
    if (!member) throw new NotFoundException('فهرست پیدا نشد');
    if (need === 'OWNER' && member.role !== 'OWNER')
      throw new ForbiddenException('فقط صاحب فهرست می‌تواند این کار را بکند');
    return { list: member.list, role: member.role };
  }

  /** A task the user can reach through its list (trashed ones too). */
  async task(userId: string, taskId: string) {
    const task = await this.prisma.plannerTask.findFirst({
      where: { id: taskId, list: { members: { some: { userId } } } },
    });
    if (!task) throw new NotFoundException('کار پیدا نشد');
    return task;
  }

  /** A section must belong to the given list. */
  async section(listId: string, sectionId: string): Promise<void> {
    const found = await this.prisma.plannerSection.count({
      where: { id: sectionId, listId },
    });
    if (!found) throw new NotFoundException('بخش در این فهرست پیدا نشد');
  }

  /** An assignee must be a member of the task's list. */
  async member(listId: string, userId: string): Promise<void> {
    const found = await this.prisma.plannerListMember.count({
      where: { listId, userId },
    });
    if (!found) throw new NotFoundException('این کاربر عضو فهرست نیست');
  }
}
