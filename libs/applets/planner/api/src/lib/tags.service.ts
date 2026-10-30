import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@all-in-one/api/db';
import type {
  PlannerColor,
  PlannerTag,
  TagInput,
  UpdateTagInput,
} from '@all-in-one/applets/planner/contracts';

/** The user's tags: create, rename, recolour and delete (TickTick tags). */
@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  async all(userId: string): Promise<PlannerTag[]> {
    const tags = await this.prisma.plannerTag.findMany({
      where: { userId },
      include: {
        _count: {
          select: {
            tasks: { where: { task: { status: 'TODO', deletedAt: null } } },
          },
        },
      },
    });
    return tags
      .map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color as PlannerColor,
        openCount: t._count.tasks,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fa'));
  }

  async create(userId: string, input: TagInput): Promise<PlannerTag> {
    await this.unique(userId, input.name);
    const tag = await this.prisma.plannerTag.create({
      data: { userId, name: input.name, color: input.color ?? 'slate' },
    });
    return {
      id: tag.id,
      name: tag.name,
      color: input.color ?? 'slate',
      openCount: 0,
    };
  }

  async update(
    userId: string,
    id: string,
    input: UpdateTagInput,
  ): Promise<PlannerTag> {
    const tag = await this.owned(userId, id);
    if (input.name && input.name !== tag.name)
      await this.unique(userId, input.name);
    await this.prisma.plannerTag.update({ where: { id }, data: input });
    const tags = await this.all(userId);
    return tags.find((t) => t.id === id) as PlannerTag;
  }

  /** Removes the tag from every task. */
  async remove(userId: string, id: string): Promise<void> {
    await this.owned(userId, id);
    await this.prisma.plannerTag.delete({ where: { id } });
  }

  private async owned(userId: string, id: string) {
    const tag = await this.prisma.plannerTag.findFirst({
      where: { id, userId },
    });
    if (!tag) throw new NotFoundException('برچسب پیدا نشد');
    return tag;
  }

  private async unique(userId: string, name: string) {
    const taken = await this.prisma.plannerTag.count({
      where: { userId, name },
    });
    if (taken) throw new ConflictException('برچسبی با این نام هست');
  }
}
