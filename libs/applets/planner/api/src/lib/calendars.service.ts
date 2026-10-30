import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { request } from 'node:https';
import { assertPublicUrl, guardedLookup } from '@all-in-one/api/ai';
import {
  type PlannerCalendar as DbCalendar,
  PrismaService,
} from '@all-in-one/api/db';
import {
  type CalendarEvent,
  type CreateCalendarInput,
  daysBetween,
  type DateRange,
  PLANNER_LIMITS,
  type PlannerCalendar,
  type PlannerColor,
  type UpdateCalendarInput,
} from '@all-in-one/applets/planner/contracts';
import { parseIcs } from './ics';

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const CACHE_MS = 15 * 60_000;

function toCalendar(c: DbCalendar): PlannerCalendar {
  return {
    id: c.id,
    name: c.name,
    url: c.url,
    color: c.color as PlannerColor,
    lastFetchedAt: c.lastFetchedAt?.toISOString() ?? null,
    lastError: c.lastError,
  };
}

/** Subscribed ICS calendars and their events (at most three months per query). */
@Injectable()
export class CalendarsService {
  private readonly logger = new Logger(CalendarsService.name);
  private readonly cache = new Map<string, { at: number; text: string }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async all(userId: string): Promise<PlannerCalendar[]> {
    const rows = await this.prisma.plannerCalendar.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toCalendar);
  }

  /** Subscribes after one successful fetch, so a wrong link fails right away. */
  async create(
    userId: string,
    input: CreateCalendarInput,
  ): Promise<PlannerCalendar> {
    const url = normalise(input.url);
    const count = await this.prisma.plannerCalendar.count({
      where: { userId },
    });
    if (count >= 20) throw new BadRequestException('حداکثر ۲۰ تقویم');
    let text: string;
    try {
      text = await this.fetch(url);
    } catch (error) {
      throw new BadRequestException(
        `تقویم خوانده نشد: ${(error as Error).message}`,
      );
    }
    if (!text.includes('BEGIN:VCALENDAR'))
      throw new BadRequestException('این نشانی تقویم iCal نیست');
    const row = await this.prisma.plannerCalendar.create({
      data: {
        userId,
        name: input.name,
        url,
        color: input.color ?? 'violet',
        lastFetchedAt: new Date(),
      },
    });
    this.cache.set(row.id, { at: Date.now(), text });
    return toCalendar(row);
  }

  async update(
    userId: string,
    id: string,
    input: UpdateCalendarInput,
  ): Promise<PlannerCalendar> {
    await this.owned(userId, id);
    return toCalendar(
      await this.prisma.plannerCalendar.update({ where: { id }, data: input }),
    );
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.owned(userId, id);
    await this.prisma.plannerCalendar.delete({ where: { id } });
    this.cache.delete(id);
  }

  /** Events of every (or one) subscribed calendar in [from, to], days inclusive. */
  async events(
    userId: string,
    { from, to }: DateRange,
    calendarId?: string,
  ): Promise<CalendarEvent[]> {
    const span = daysBetween(from, to);
    if (span < 0) throw new BadRequestException('تاریخ شروع بعد از پایان است');
    if (span >= PLANNER_LIMITS.eventDays)
      throw new BadRequestException('بازه رویدادها حداکثر سه ماه است');
    const calendars = await this.prisma.plannerCalendar.findMany({
      where: { userId, ...(calendarId ? { id: calendarId } : {}) },
    });
    if (calendarId && !calendars.length)
      throw new NotFoundException('تقویم پیدا نشد');
    // Day bounds in Tehran time (+03:30 all year).
    const start = new Date(`${from}T00:00:00+03:30`);
    const end = new Date(Date.parse(`${to}T00:00:00+03:30`) + 86_400_000);
    const lists = await Promise.all(
      calendars.map(async (c) => {
        const text = await this.text(c);
        if (!text) return [];
        return parseIcs(text, start, end).map((e) => ({
          calendarId: c.id,
          uid: e.uid,
          title: e.title,
          location: e.location,
          start: e.allDay
            ? e.start.toISOString().slice(0, 10)
            : e.start.toISOString(),
          end: e.end
            ? e.allDay
              ? e.end.toISOString().slice(0, 10)
              : e.end.toISOString()
            : null,
          allDay: e.allDay,
        }));
      }),
    );
    return lists.flat().sort((a, b) => (a.start < b.start ? -1 : 1));
  }

  /** The feed text, cached for 15 minutes; records fetch errors on the row. */
  private async text(c: DbCalendar): Promise<string | null> {
    const cached = this.cache.get(c.id);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.text;
    try {
      const text = await this.fetch(c.url);
      this.cache.set(c.id, { at: Date.now(), text });
      await this.prisma.plannerCalendar.update({
        where: { id: c.id },
        data: { lastFetchedAt: new Date(), lastError: null },
      });
      return text;
    } catch (error) {
      const message = (error as Error).message.slice(0, 300);
      this.logger.warn(`Calendar ${c.id} failed: ${message}`);
      await this.prisma.plannerCalendar.update({
        where: { id: c.id },
        data: { lastError: message },
      });
      return cached?.text ?? null;
    }
  }

  private async owned(userId: string, id: string) {
    const found = await this.prisma.plannerCalendar.count({
      where: { id, userId },
    });
    if (!found) throw new NotFoundException('تقویم پیدا نشد');
  }

  /**
   * GETs a feed over HTTPS with a size cap, a timeout, at most three
   * redirects, and a DNS lookup that refuses private and loopback addresses
   * (checked on the address actually connected to, so rebinding can't slip by).
   */
  private fetch(url: string, redirects = 3): Promise<string> {
    const allowPrivate =
      this.config.get('PLANNER_ICS_ALLOW_PRIVATE') === 'true';
    const guarded = guardedLookup(allowPrivate);
    return new Promise((resolve, reject) => {
      const target = new URL(url);
      if (target.protocol !== 'https:') return reject(new Error('فقط https'));
      try {
        assertPublicUrl(target, allowPrivate);
      } catch (error) {
        return reject(error);
      }
      const req = request(
        target,
        {
          lookup: guarded,
          timeout: TIMEOUT_MS,
          headers: {
            accept: 'text/calendar, */*',
            'user-agent': 'all-in-one-planner',
          },
        },
        (res) => {
          const status = res.statusCode ?? 0;
          if (status >= 300 && status < 400 && res.headers.location) {
            res.resume();
            if (!redirects) return reject(new Error('تغییر مسیر زیاد'));
            return resolve(
              this.fetch(
                normalise(new URL(res.headers.location, target).href),
                redirects - 1,
              ),
            );
          }
          if (status !== 200) {
            res.resume();
            return reject(new Error(`پاسخ ${status}`));
          }
          let size = 0;
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_BYTES) {
              req.destroy(new Error('تقویم بیش از ۲ مگابایت است'));
              return;
            }
            chunks.push(chunk);
          });
          res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
          res.on('error', reject);
        },
      );
      req.on('timeout', () => req.destroy(new Error('زمان پاسخ تمام شد')));
      req.on('error', reject);
      req.end();
    });
  }
}

/** webcal:// is https:// for feeds. */
function normalise(url: string): string {
  return url.trim().replace(/^webcal:\/\//i, 'https://');
}
