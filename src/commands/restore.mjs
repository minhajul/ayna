import { existsSync } from 'node:fs';
import path from 'node:path';

import { restore } from '../snapshot.mjs';
import { ok } from '../log.mjs';

export default async function restoreCommand(ctx) {
  const { cfg, PROJECT, SESSION_DIR } = ctx;

  const session = process.env.AYNA_SESSION;
  let src = session
    ? path.join(SESSION_DIR, 'snapshots', String(session).replace(/[^a-zA-Z0-9_-]/g, '_'))
    : path.join(SESSION_DIR, 'snapshot');
  if (!existsSync(src) && existsSync(path.join(SESSION_DIR, 'snapshot'))) {
    src = path.join(SESSION_DIR, 'snapshot');
  }
  if (!existsSync(src)) throw new Error('no snapshot to restore — run `ayna snapshot` first');
  await restore(src, cfg.targetDir);
  ok(`restored ${path.relative(PROJECT, cfg.targetDir)}`);
  return;
}
