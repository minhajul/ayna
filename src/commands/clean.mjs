import { readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { ok, info } from '../log.mjs';

export default async function cleanCommand(ctx) {
  const { values, PROJECT } = ctx;

  /*
    .ayna grows with every shot, flow and audit. On a project used for a day it
    was already tens of megabytes, none of it needed once the run is read.
    Tasks, the database and the login profile are never touched — those are
    the parts you would miss. Only the named directories below are ever
    removed, so `ayna.db` sitting alongside them is safe by construction
    rather than by luck.
  */
  const keep = Number(values.keep ?? 3);
  const kinds = ['runs', 'flows', 'audits', 'qa', 'comments'];
  let freed = 0;
  let removed = 0;

  const sizeOf = async (dir) => {
    let total = 0;
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) total += await sizeOf(full);
      else total += (await stat(full).catch(() => ({ size: 0 }))).size;
    }
    return total;
  };

  for (const kind of kinds) {
    const base = path.join(PROJECT, '.ayna', kind);
    const entries = (await readdir(base, { withFileTypes: true }).catch(() => []))
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
    // Newest last, so drop everything before the tail we are keeping.
    for (const name of entries.slice(0, Math.max(0, entries.length - keep))) {
      const dir = path.join(base, name);
      freed += await sizeOf(dir);
      await rm(dir, { recursive: true, force: true });
      removed += 1;
    }
  }

  /*
    The database needs housekeeping too, and nothing was doing it. Events are
    append-only and nothing ever removed one, and the write-ahead log keeps
    its high-water mark — a busy afternoon left megabytes of -wal beside a
    much smaller .db for as long as the project existed.

    Pruning stops at the lowest cursor any consumer holds, so catch-up
    nobody has collected yet is never what gets deleted.
  */
  let pruned = 0;
  try {
    const { openDb, pruneEvents, checkpoint } = await import('../db.mjs');
    const { existsSync: has } = await import('node:fs');
    const dbFile = path.join(PROJECT, '.ayna', 'ayna.db');
    if (has(dbFile)) {
      const db = await openDb(PROJECT);
      const before = (await stat(dbFile).catch(() => ({ size: 0 }))).size;
      const walBefore = (await stat(`${dbFile}-wal`).catch(() => ({ size: 0 }))).size;
      pruned = pruneEvents(db).removed;
      checkpoint(db);
      const after = (await stat(dbFile).catch(() => ({ size: 0 }))).size;
      const walAfter = (await stat(`${dbFile}-wal`).catch(() => ({ size: 0 }))).size;
      freed += Math.max(0, before + walBefore - after - walAfter);
    }
  } catch {
    // Housekeeping is not worth failing a clean over.
  }

  ok(`removed ${removed} old run(s), freed ${(freed / 1024 / 1024).toFixed(1)} MB`);
  if (pruned) info(`pruned ${pruned} event(s) older than 30 days that every consumer had already read`);
  info(`kept the newest ${keep} of each · tasks, sessions and the login profile untouched`);
}
