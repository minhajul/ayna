import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

export default async function statusCommand(ctx) {
  const { readSession } = ctx;

  const session = await readSession();
  if (!session) {
    console.log(JSON.stringify({ phase: 'none' }));
    return;
  }
  if (!session.live) {
    console.log(
      JSON.stringify({
        phase: 'stale',
        hint: 'the window that owned this review is gone (the session that opened it ended). Start a new one with `ayna annotate`.',
        lastComments: session.file,
      }),
    );
    return;
  }
  const statusFile = path.join(session.dir, 'status.json');
  console.log(
    existsSync(statusFile) ? await readFile(statusFile, 'utf8') : JSON.stringify({ phase: 'none' }),
  );
}
