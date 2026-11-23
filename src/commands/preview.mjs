import { ok, info, warn } from '../log.mjs';

/*
  Show it before writing it.

  Every other path edits the source and asks afterwards, which makes "no, not
  that" expensive — the change has happened and saying no does not undo it.
  This puts CSS in the page and nowhere else: the user tries the variants,
  and only the accepted one is worth writing.
*/
export default async function previewCommand(ctx) {
  const { values, PROJECT, liveWindow } = ctx;

  const css = [values.css].flat().filter(Boolean);
  const labels = [values.label].flat().filter(Boolean);
  const selector = [values.selector].flat()[0];
  if (!selector || !css.length) {
    throw new Error('ayna preview --selector ".hero h1" --css "font-size: 42px" [--css "…"]');
  }

  const { openDb, appendEvent } = await import('../db.mjs');
  const db = await openDb(PROJECT);
  const previewId = `pv-${Date.now().toString(36)}`;
  const seq = appendEvent(db, {
    event: 'preview',
    previewId,
    selector,
    variants: css.map((c, i) => ({ css: c, label: labels[i] ?? `variant ${i + 1}` })),
  });

  // Say where it actually went. A queued variant and a painted one are not
  // the same claim, and only one of them has somebody looking at it.
  const onScreen = Boolean(await liveWindow());
  const n = `${css.length} variant${css.length === 1 ? '' : 's'}`;

  if (values.json) {
    console.log(JSON.stringify({ ok: true, previewId, seq, variants: css.length, live: onScreen }));
  } else if (onScreen) {
    ok(`${n} on the page — waiting for their answer`);
  } else {
    warn(`no review window is open — ${n} queued, and will paint when one opens (\`ayna annotate\`)`);
  }

  /*
    Then wait for it, unless told not to. A preview nobody answers is a
    stylesheet left on someone's page, and the answer is the whole point.
  */
  /*
    Waiting for an answer nobody can give is a five-minute stall, so don't:
    the variant is on the log either way and the next window will show it.
    `--no-wait` stays the way to queue deliberately; this is the way to not
    hang when there was never anyone there.
  */
  if (!values['no-wait'] && !onScreen) {
    if (!values.json) info('not waiting — there is nobody to answer yet');
    return;
  }

  if (!values['no-wait']) {
    const { eventsSince } = await import('../db.mjs');
    const deadline = Date.now() + Number(values.timeout ?? 300) * 1000;
    let answer = null;
    while (!answer && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 400));
      answer = eventsSince(db, seq).find(
        (e) => (e.event === 'preview-accepted' || e.event === 'preview-rejected') && e.previewId === previewId,
      );
    }
    if (values.json) console.log(JSON.stringify(answer ?? { event: 'preview-timeout', previewId }));
    else if (!answer) warn('no answer yet — the preview is still on their page');
    else if (answer.event === 'preview-accepted') ok(`they kept "${answer.label}" — write it into the source`);
    else info('none of them — try something else');
  }
  return;
}
