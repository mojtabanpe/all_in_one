/** Upgrade an isolated scratch database with a pre-existing completed task. Never uses DATABASE_URL. */
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const container =
  process.env.PLANNER_TEST_POSTGRES_CONTAINER ?? 'aio-recurrence-test-db';
if (!/^aio-recurrence-test[-a-z0-9]*$/.test(container))
  throw new Error('Only the dedicated local test container is allowed');
const database = 'aio_recurrence_upgrade_' + randomUUID().replaceAll('-', '');
const migrationRoot = 'libs/api/db/prisma/migrations';
const env = { ...process.env };
for (const key of [
  'DOCKER_HOST',
  'DOCKER_CONTEXT',
  'DOCKER_TLS',
  'DOCKER_TLS_VERIFY',
  'DOCKER_CERT_PATH',
])
  delete env[key];
function sql(db, input) {
  const result = spawnSync(
    'docker',
    [
      '--host=unix:///var/run/docker.sock',
      'exec',
      '-i',
      container,
      'psql',
      '-U',
      'postgres',
      '-d',
      db,
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-tA',
    ],
    { input, encoding: 'utf8', env },
  );
  if (result.status !== 0)
    throw new Error(result.stderr || 'Local migration check failed');
  return result.stdout.trim();
}
let created = false;
try {
  sql('postgres', `CREATE DATABASE "${database}";`);
  created = true;
  const migrations = readdirSync(migrationRoot)
    .filter((name) => /^\d/.test(name))
    .sort();
  for (const name of migrations.filter(
    (name) => name < '20261031120000_task_recurrence',
  ))
    sql(
      database,
      readFileSync(join(migrationRoot, name, 'migration.sql'), 'utf8'),
    );
  const user = randomUUID(),
    list = randomUUID(),
    task = randomUUID();
  sql(
    database,
    `INSERT INTO users(id,email,"passwordHash","updatedAt") VALUES('${user}','migration-test@example.invalid','test',NOW());
    INSERT INTO planner_lists(id,"ownerId",name,"updatedAt") VALUES('${list}','${user}','Existing imported list',NOW());
    INSERT INTO planner_tasks(id,"userId","listId",title,content,date,time,status,"completedAt",priority,"externalSourceId","recurrenceRule","timeZone","endTime",reminders,"updatedAt") VALUES('${task}','${user}','${list}','Existing Reading','Keep these notes','2026-10-30','10:00','DONE','2026-10-30T06:45:00Z','HIGH','existing-source','RRULE:FREQ=DAILY','Asia/Tehran','10:15',ARRAY['TRIGGER:-PT10M'],NOW());`,
  );
  const select = `SELECT row_to_json(t)::text FROM (SELECT id,"userId","listId",title,content,date,time,status,"completedAt",priority,"externalSourceId","recurrenceRule","timeZone","endTime",reminders FROM planner_tasks WHERE id='${task}') t;`;
  const before = sql(database, select);
  for (const name of migrations.filter(
    (name) => name >= '20261031120000_task_recurrence',
  ))
    sql(
      database,
      readFileSync(join(migrationRoot, name, 'migration.sql'), 'utf8'),
    );
  assert.equal(
    sql(database, select),
    before,
    'Upgrade changed existing task data or completion history',
  );
  assert.equal(
    sql(
      database,
      `SELECT "isSeries"=false AND "repeatRule" IS NULL AND "recurrenceTimezone"='Asia/Tehran' FROM planner_tasks WHERE id='${task}';`,
    ),
    't',
  );
  console.log(
    'PASS: upgrade preserves existing task ID, list, notes, schedule, priority and completion history.',
  );
} finally {
  if (created) sql('postgres', `DROP DATABASE "${database}";`);
}
