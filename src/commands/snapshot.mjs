import path from 'node:path';

import { snapshot } from '../snapshot.mjs';
import { ok } from '../log.mjs';

export default async function snapshotCommand(ctx) {
  const { cfg, PROJECT, SESSION_DIR } = ctx;

  const session = process.env.AYNA_SESSION;
  const dest = session
    ? path.join(SESSION_DIR, 'snapshots', String(session).replace(/[^a-zA-Z0-9_-]/g, '_'))
    : path.join(SESSION_DIR, 'snapshot');
  await snapshot(cfg.targetDir, dest);
  ok(`snapshotted ${path.relative(PROJECT, cfg.targetDir)} — restore with \`ayna restore\``);
  return;
}
