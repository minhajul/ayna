import path from 'node:path';

export default async function followCommand(ctx) {
  const { SESSION_DIR, readSession, followSession } = ctx;

  // Blocks until the user sends a round (or closes the window), then exits.
  // Run this in the background so you are woken the moment they hit Send —
  // polling `status` by hand means the user sits there waiting on you.
  const session = await readSession();
  if (!session) throw new Error('no annotate session — run `ayna annotate` first');
  if (!session.live) {
    // Never block on a window that no longer exists.
    console.log(JSON.stringify({ phase: 'stale', done: true }));
    return;
  }
  await followSession(path.join(session.dir, 'status.json'), SESSION_DIR);
}
