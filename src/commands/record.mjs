import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { ok } from '../log.mjs';

export default async function recordCommand(ctx) {
  const { values, SESSION_DIR, JOURNAL } = ctx;

  await mkdir(SESSION_DIR, { recursive: true });
  const entries = existsSync(JOURNAL) ? JSON.parse(await readFile(JOURNAL, 'utf8')) : [];
  const last = existsSync(path.join(SESSION_DIR, 'last-shot.json'))
    ? JSON.parse(await readFile(path.join(SESSION_DIR, 'last-shot.json'), 'utf8'))
    : { shots: [] };
  entries.push({
    n: entries.length + 1,
    score: values.score ? Number(values.score) : null,
    note: values.note ?? '',
    shots: last.shots,
  });
  await writeFile(JOURNAL, JSON.stringify(entries, null, 2));
  ok(`recorded round ${entries.length}${values.score ? ` (${values.score}/10)` : ''}`);
}
