import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { ok } from '../log.mjs';

export default async function appliedCommand(ctx) {
  const { values, SESSION_DIR, readSession, followSession } = ctx;

  // Tell the still-open annotate window that the edits are in. It reloads the
  // page and switches to the approve/comment-more bar. We never close it.
  const session = await readSession();
  if (!session) throw new Error('no annotate session — run `ayna annotate` first');
  if (!session.live) {
    throw new Error(
      'the annotate window is gone — nothing will read this. Start a new review with `ayna annotate`.',
    );
  }
  await writeFile(path.join(session.dir, 'applied'), String(Date.now()));
  ok('told the open window to refresh — waiting for the user to approve');

  /*
    Then stay on the line.

    `wait` fires once and exits, so after the first round somebody has to
    remember to arm it again. Nobody did, and rounds two and three of a real
    review sat unseen while the page said "Sent". Blocking here means the
    command that says "I'm done" is also the one that hears what happens next,
    so the loop cannot be dropped by forgetting a step.
  */
  if (values['no-wait']) return;
  await followSession(path.join(session.dir, 'status.json'), SESSION_DIR, { settle: true });
}
