import { RecurrencesService } from './recurrences.service';
import { OPEN_TASK_WHERE } from './task-mapping';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@all-in-one/api/db';
import type {
  CreateListInput,
  FolderInput,
  PlannerColor,
  PlannerFolder,
  PlannerList,
  PlannerListDetail,
  PlannerSection,
  SectionInput,
  UpdateListInput,
} from '@all-in-one/applets/planner/contracts';
import { PlannerAccess } from './access.service';

const OPEN = OPEN_TASK_WHERE;

/** Lists (TickTick projects) with their sections, folders and members. */
@Injectable()
export class ListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PlannerAccess,
    private readonly recurrence: RecurrencesService,
  ) {}

  async all(userId: string): Promise<PlannerList[]> {
    await this.access.inbox(userId);
    const members = await this.prisma.plannerListMember.findMany({
      where: { userId },
      include: {
        list: {
          include: {
            sections: { orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] },
            _count: { select: { members: true, tasks: { where: OPEN } } },
          },
        },
      },
    });
    const projected = await this.recurrence.projected(
      members.map((m) => m.listId),
      { status: 'open' },
    );
    const counts = new Map<string, number>();
    for (const task of projected)
      counts.set(task.listId, (counts.get(task.listId) ?? 0) + 1);
    return members
      .map(({ list, role }) => ({
        id: list.id,
        name: list.name,
        color: list.color as PlannerColor,
        isInbox: list.isInbox,
        // A shared list sits in its owner's folder, not the member's.
        folderId: role === 'OWNER' ? list.folderId : null,
        sortOrder: list.sortOrder,
        role,
        shared: list._count.members > 1,
        openCount: list._count.tasks + (counts.get(list.id) ?? 0),
        sections: list.sections.map(toSection),
      }))
      .sort(
        (a, b) =>
          Number(b.isInbox) - Number(a.isInbox) ||
          a.sortOrder - b.sortOrder ||
          a.name.localeCompare(b.name, 'fa'),
      );
  }

  async get(userId: string, listId: string): Promise<PlannerListDetail> {
    await this.access.list(userId, listId, 'EDITOR');
    const lists = await this.all(userId);
    const list = lists.find((l) => l.id === listId);
    if (!list) throw new NotFoundException('فهرست پیدا نشد');
    const members = await this.prisma.plannerListMember.findMany({
      where: { listId },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      ...list,
      members: members.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
      })),
    };
  }

  async create(userId: string, input: CreateListInput): Promise<PlannerList> {
    if (input.folderId) await this.folder(userId, input.folderId);
    const count = await this.prisma.plannerList.count({
      where: { ownerId: userId },
    });
    const list = await this.prisma.plannerList.create({
      data: {
        ownerId: userId,
        name: input.name,
        color: input.color ?? 'sky',
        folderId: input.folderId ?? null,
        sortOrder: count,
        members: { create: { userId, role: 'OWNER' } },
      },
    });
    return this.get(userId, list.id);
  }

  async update(
    userId: string,
    listId: string,
    input: UpdateListInput,
  ): Promise<PlannerList> {
    const { list } = await this.access.list(userId, listId, 'OWNER');
    if (input.folderId) await this.folder(userId, input.folderId);
    if (list.isInbox && input.name && input.name !== list.name)
      throw new BadRequestException('نام صندوق ورودی عوض نمی‌شود');
    await this.prisma.plannerList.update({
      where: { id: listId },
      data: input,
    });
    return this.get(userId, listId);
  }

  /** Deletes a list with its tasks; the Inbox stays. */
  async remove(userId: string, listId: string): Promise<void> {
    const { list } = await this.access.list(userId, listId, 'OWNER');
    if (list.isInbox) throw new BadRequestException('صندوق ورودی حذف نمی‌شود');
    await this.prisma.plannerList.delete({ where: { id: listId } });
  }

  // ---- sections

  async addSection(
    userId: string,
    listId: string,
    input: SectionInput,
  ): Promise<PlannerSection> {
    await this.access.list(userId, listId);
    const count = await this.prisma.plannerSection.count({ where: { listId } });
    return toSection(
      await this.prisma.plannerSection.create({
        data: { listId, name: input.name, sortOrder: input.sortOrder ?? count },
      }),
    );
  }

  async updateSection(
    userId: string,
    sectionId: string,
    input: Partial<SectionInput>,
  ): Promise<PlannerSection> {
    await this.sectionOf(userId, sectionId);
    return toSection(
      await this.prisma.plannerSection.update({
        where: { id: sectionId },
        data: input,
      }),
    );
  }

  /** Tasks of a deleted section stay in the list, without a section. */
  async removeSection(userId: string, sectionId: string): Promise<void> {
    await this.sectionOf(userId, sectionId);
    await this.prisma.plannerSection.delete({ where: { id: sectionId } });
  }

  private async sectionOf(userId: string, sectionId: string) {
    const section = await this.prisma.plannerSection.findUnique({
      where: { id: sectionId },
    });
    if (!section) throw new NotFoundException('بخش پیدا نشد');
    await this.access.list(userId, section.listId);
    return section;
  }

  // ---- folders

  async folders(userId: string): Promise<PlannerFolder[]> {
    const rows = await this.prisma.plannerFolder.findMany({
      where: { userId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toFolder);
  }

  async createFolder(
    userId: string,
    input: FolderInput,
  ): Promise<PlannerFolder> {
    const count = await this.prisma.plannerFolder.count({ where: { userId } });
    return toFolder(
      await this.prisma.plannerFolder.create({
        data: { userId, name: input.name, sortOrder: input.sortOrder ?? count },
      }),
    );
  }

  async updateFolder(
    userId: string,
    folderId: string,
    input: Partial<FolderInput>,
  ): Promise<PlannerFolder> {
    await this.folder(userId, folderId);
    return toFolder(
      await this.prisma.plannerFolder.update({
        where: { id: folderId },
        data: input,
      }),
    );
  }

  /** Lists in a deleted folder move out of it. */
  async removeFolder(userId: string, folderId: string): Promise<void> {
    await this.folder(userId, folderId);
    await this.prisma.plannerFolder.delete({ where: { id: folderId } });
  }

  private async folder(userId: string, folderId: string): Promise<void> {
    const found = await this.prisma.plannerFolder.count({
      where: { id: folderId, userId },
    });
    if (!found) throw new NotFoundException('پوشه پیدا نشد');
  }

  // ---- members

  /** Shares a list with an existing account. */
  async addMember(
    userId: string,
    listId: string,
    email: string,
  ): Promise<PlannerListDetail> {
    const { list } = await this.access.list(userId, listId, 'OWNER');
    if (list.isInbox)
      throw new BadRequestException('صندوق ورودی اشتراکی نمی‌شود');
    const user = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (!user) throw new NotFoundException('حسابی با این ایمیل پیدا نشد');
    const exists = await this.prisma.plannerListMember.count({
      where: { listId, userId: user.id },
    });
    if (exists) throw new ConflictException('این کاربر از قبل عضو است');
    await this.prisma.plannerListMember.create({
      data: { listId, userId: user.id, role: 'EDITOR' },
    });
    return this.get(userId, listId);
  }

  /**
   * The owner removes anyone but themself; a member can leave. Their open
   * tasks in the list are unassigned.
   */
  async removeMember(
    userId: string,
    listId: string,
    memberId: string,
  ): Promise<void> {
    const { role } = await this.access.list(userId, listId);
    if (memberId !== userId && role !== 'OWNER')
      throw new BadRequestException('فقط صاحب فهرست اعضا را برمی‌دارد');
    const target = await this.prisma.plannerListMember.findUnique({
      where: { listId_userId: { listId, userId: memberId } },
    });
    if (!target) throw new NotFoundException('این کاربر عضو فهرست نیست');
    if (target.role === 'OWNER')
      throw new BadRequestException('صاحب فهرست نمی‌تواند خارج شود');
    await this.prisma.$transaction([
      this.prisma.plannerTask.updateMany({
        where: { listId, assigneeId: memberId },
        data: { assigneeId: null },
      }),
      this.prisma.plannerListMember.delete({
        where: { listId_userId: { listId, userId: memberId } },
      }),
    ]);
  }
}

function toSection(s: {
  id: string;
  listId: string;
  name: string;
  sortOrder: number;
}): PlannerSection {
  return { id: s.id, listId: s.listId, name: s.name, sortOrder: s.sortOrder };
}

function toFolder(f: {
  id: string;
  name: string;
  sortOrder: number;
}): PlannerFolder {
  return { id: f.id, name: f.name, sortOrder: f.sortOrder };
}
