import { ok, warn } from '../log.mjs';

/*
  Say something into the window the user is actually looking at.

  Claude's side of a review only ever appeared in a terminal, so following
  one meant watching two places at once. This puts a line on the page — same
  event log, same order as everything else, so it survives the session like
  the rest of it.
*/
export default async function sayCommand(ctx) {
  const { values, positionals, PROJECT, liveWindow } = ctx;

  const text = (values.comment ?? positionals.slice(1).join(' ')).trim();
  if (!text) throw new Error('nothing to say — ayna say "your message"');

  const { openDb, appendEvent } = await import('../db.mjs');
  const db = await openDb(PROJECT);
  const seq = appendEvent(db, { event: 'message', from: 'claude', text });

  // Same honesty as `preview`: "it is on the page now" was printed with no
  // page open, which is the one thing a progress message must never do.
  const heard = Boolean(await liveWindow());
  if (values.json) console.log(JSON.stringify({ ok: true, seq, text, live: heard }));
  else if (heard) ok('said it — it is on the page now');
  else warn('no review window is open — said it to the log, which the next window will show');
  return;
}
