#!/bin/sh
# Copies Recall accounts with their decks, cards (SM-2 state) and reading texts into all-in-one (directive 30).
# Run on the server; safe to re-run (same ids, existing rows are kept). Accounts keep their bcrypt
# passwords, which are re-hashed to scrypt on the next login. An email that already has an account
# here gets the Recall data attached to that account.
#   deploy/import-recall.sh memnpe@gmail.com admin@recall.com
set -eu

[ $# -gt 0 ] || { echo "usage: deploy/import-recall.sh <email>..." >&2; exit 2; }
RECALL="docker exec -i recall-postgres-1 psql -U recall -d recall -v ON_ERROR_STOP=1 -qAt"
AIO="docker exec -i all-in-one-postgres-1 psql -U aio -d all_in_one -v ON_ERROR_STOP=1 -q"

EMAILS=""
for e in "$@"; do
  case "$e" in *"'"*) echo "bad email: $e" >&2; exit 2 ;; esac
  EMAILS="$EMAILS${EMAILS:+,}'$(echo "$e" | tr '[:upper:]' '[:lower:]')'"
done
USERS="SELECT id FROM users WHERE lower(email) IN ($EMAILS) AND deleted_at IS NULL"

$AIO <<'SQL'
DROP SCHEMA IF EXISTS recall_import CASCADE;
CREATE SCHEMA recall_import;
CREATE TABLE recall_import.users (id text, email text, password_hash text, created_at timestamptz, email_verified_at timestamptz);
CREATE TABLE recall_import.decks (id text, user_id text, name text, description text, color text, created_at timestamptz, updated_at timestamptz);
CREATE TABLE recall_import.cards (id text, deck_id text, user_id text, front text, back text, unit text, examples text,
  ease_factor float8, interval_days int, repetitions int, lapses int, suspended boolean, suspensions int,
  due_at timestamptz, last_reviewed_at timestamptz, created_at timestamptz, updated_at timestamptz);
CREATE TABLE recall_import.texts (id text, user_id text, title text, body text, ai boolean, rating smallint,
  review_note text, rated_at timestamptz, created_at timestamptz, updated_at timestamptz);
SQL

copy() { # <table> <select>
  $RECALL -c "\\copy ($2) TO STDOUT" | $AIO -c "\\copy recall_import.$1 FROM STDIN"
}
copy users "SELECT id, email, password_hash, created_at, email_verified_at FROM users WHERE id IN ($USERS)"
copy decks "SELECT id, user_id, name, description, color, created_at, updated_at FROM decks WHERE user_id IN ($USERS)"
copy cards "SELECT id, deck_id, user_id, front, back, unit, examples, ease_factor, interval_days, repetitions, lapses, suspended, suspensions, due_at, last_reviewed_at, created_at, updated_at FROM cards WHERE user_id IN ($USERS)"
copy texts "SELECT id, user_id, title, body, ai, rating, review_note, rated_at, created_at, updated_at FROM texts WHERE user_id IN ($USERS)"

# Prisma's DateTime columns are timestamp(3) in UTC.
$AIO --single-transaction <<'SQL'
INSERT INTO users (id, email, "passwordHash", role, "emailVerifiedAt", "sessionVersion", "createdAt", "updatedAt")
SELECT id::uuid, lower(email), password_hash, 'CUSTOMER',
       coalesce(email_verified_at, now()) AT TIME ZONE 'UTC', 0, created_at AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC'
FROM recall_import.users
ON CONFLICT DO NOTHING;

CREATE TEMP TABLE owner_map AS
SELECT r.id AS old_id, u.id AS new_id FROM recall_import.users r JOIN users u ON u.email = lower(r.email);

INSERT INTO english_decks (id, "userId", name, description, color, "createdAt", "updatedAt")
SELECT d.id::uuid, m.new_id, left(d.name, 200), d.description,
       CASE WHEN d.color IN ('amber', 'rose', 'sage', 'sky', 'violet', 'clay') THEN d.color ELSE 'sky' END,
       d.created_at AT TIME ZONE 'UTC', d.updated_at AT TIME ZONE 'UTC'
FROM recall_import.decks d JOIN owner_map m ON m.old_id = d.user_id
ON CONFLICT DO NOTHING;

INSERT INTO english_cards (id, "deckId", "userId", front, back, unit, examples, "easeFactor", "intervalDays",
  repetitions, lapses, suspended, suspensions, "dueAt", "lastReviewedAt", "createdAt", "updatedAt")
SELECT c.id::uuid, c.deck_id::uuid, m.new_id, c.front, c.back, left(c.unit, 16), c.examples, c.ease_factor,
       c.interval_days, c.repetitions, c.lapses, c.suspended, c.suspensions, c.due_at AT TIME ZONE 'UTC',
       c.last_reviewed_at AT TIME ZONE 'UTC', c.created_at AT TIME ZONE 'UTC', c.updated_at AT TIME ZONE 'UTC'
FROM recall_import.cards c JOIN owner_map m ON m.old_id = c.user_id
WHERE EXISTS (SELECT 1 FROM english_decks d WHERE d.id = c.deck_id::uuid AND d."userId" = m.new_id)
ON CONFLICT DO NOTHING;

INSERT INTO english_texts (id, "userId", title, body, ai, rating, "reviewNote", "ratedAt", "createdAt", "updatedAt")
SELECT t.id::uuid, m.new_id, left(t.title, 200), t.body, t.ai, t.rating, t.review_note, t.rated_at AT TIME ZONE 'UTC',
       t.created_at AT TIME ZONE 'UTC', t.updated_at AT TIME ZONE 'UTC'
FROM recall_import.texts t JOIN owner_map m ON m.old_id = t.user_id
ON CONFLICT DO NOTHING;

DROP SCHEMA recall_import CASCADE;
SQL

$AIO -c "SELECT u.email,
  (SELECT count(*) FROM english_decks d WHERE d.\"userId\" = u.id) AS decks,
  (SELECT count(*) FROM english_cards c WHERE c.\"userId\" = u.id) AS cards,
  (SELECT count(*) FROM english_texts t WHERE t.\"userId\" = u.id) AS texts
FROM users u WHERE u.email IN ($EMAILS) ORDER BY 1"
