import type { BodyService } from '@all-in-one/applets/health/api';
import {
  endFastSchema,
  logWeightSchema,
  MAX_FAST_HOURS,
  startFastSchema,
  updateFastSchema,
  weightGoalSchema,
} from '@all-in-one/applets/health/contracts';
import * as z from 'zod';
import { parseWith, type ToolSink } from './tool-kit';

const id = z.uuid();
const date = z.iso.date().describe('YYYY-MM-DD (Tehran calendar day)');
const instant = z.iso
  .datetime({ offset: true })
  .describe('ISO date-time with offset, e.g. 2026-10-31T20:00:00+03:30');
const kg = z.number().min(30).max(300);
const hours = z
  .number()
  .int()
  .min(1)
  .max(MAX_FAST_HOURS)
  .describe('Fasting length in hours: 16 for 16:8, 18 for 18:6, 24 for OMAD');

/** Weigh-ins, the dated weight goal and intermittent fasting. */
export function healthBodyTools(kit: ToolSink, s: { body: BodyService }) {
  const user = kit.user;
  const read = 'health:read' as const;
  const write = 'health:write' as const;

  // ---------------------------------------------------------------- weight
  kit.tool(
    'get_weight_progress',
    {
      description:
        'Current weight, recent weigh-ins (with ids) and the weight goal: target, date, remaining kilograms, needed weekly pace (safe / fast / too-fast) and the daily calorie change it implies.',
      scope: read,
      kind: 'read',
      input: {},
    },
    () => s.body.weight(user),
  );
  kit.tool(
    'log_weight',
    {
      description:
        "Record a weigh-in for a day (one per day; logging again replaces it). The latest weigh-in becomes the profile's current weight.",
      scope: write,
      kind: 'create',
      input: { date, weight_kg: kg },
    },
    (a) =>
      s.body.logWeight(
        user,
        parseWith(logWeightSchema, { date: a.date, weightKg: a.weight_kg }),
      ),
  );
  kit.tool(
    'delete_weight',
    {
      description: 'Delete a weigh-in (id from get_weight_progress).',
      scope: write,
      kind: 'delete',
      input: { weight_id: id },
    },
    (a) => s.body.removeWeight(user, a.weight_id),
  );
  kit.tool(
    'set_weight_goal',
    {
      description:
        'Set the weight goal: reach target_weight_kg by target_date (1 week to 2 years ahead), starting from the current weight. Needs a current weight (log_weight first). Send both null to clear it. Warn the user when the returned pace is "too-fast".',
      scope: write,
      kind: 'update',
      input: {
        target_weight_kg: kg.nullable(),
        target_date: date.nullable(),
      },
    },
    (a) =>
      s.body.setGoal(
        user,
        parseWith(weightGoalSchema, {
          targetWeightKg: a.target_weight_kg,
          targetDate: a.target_date,
        }),
      ),
  );

  // ---------------------------------------------------------------- fasting
  kit.tool(
    'get_fasting',
    {
      description:
        'The running intermittent fast (start time, target hours) and the latest finished ones, with ids.',
      scope: read,
      kind: 'read',
      input: {},
    },
    () => s.body.fasting(user),
  );
  kit.tool(
    'start_fast',
    {
      description:
        'Start a fast now, or at started_at when the user says it began earlier (at most 72 hours ago). Only one fast runs at a time.',
      scope: write,
      kind: 'create',
      input: { target_hours: hours, started_at: instant.optional() },
    },
    (a) =>
      s.body.startFast(
        user,
        parseWith(startFastSchema, {
          targetHours: a.target_hours,
          startedAt: a.started_at,
        }),
      ),
  );
  kit.tool(
    'end_fast',
    {
      description:
        'End the running fast now, or at ended_at when the user ate earlier.',
      scope: write,
      kind: 'update',
      input: { ended_at: instant.optional() },
    },
    (a) =>
      s.body.endFast(user, parseWith(endFastSchema, { endedAt: a.ended_at })),
  );
  kit.tool(
    'update_fast',
    {
      description:
        'Correct a fast (id from get_fasting): its target, start or end time. ended_at null reopens it.',
      scope: write,
      kind: 'update',
      input: {
        fast_id: id,
        target_hours: hours.optional(),
        started_at: instant.optional(),
        ended_at: instant.nullable().optional(),
      },
    },
    (a) =>
      s.body.updateFast(
        user,
        a.fast_id,
        parseWith(updateFastSchema, {
          targetHours: a.target_hours,
          startedAt: a.started_at,
          endedAt: a.ended_at,
        }),
      ),
  );
  kit.tool(
    'delete_fast',
    {
      description: 'Delete a fast (id from get_fasting).',
      scope: write,
      kind: 'delete',
      input: { fast_id: id },
    },
    (a) => s.body.removeFast(user, a.fast_id),
  );
}
