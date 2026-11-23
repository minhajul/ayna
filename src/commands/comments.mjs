import { existsSync } from 'node:fs';

import { loadComments } from '../annotate.mjs';
import { openStore, importLegacy, isPending } from '../tasks.mjs';
import { warn, bold } from '../log.mjs';

export default async function commentsCommand(ctx) {
  const { values, PROJECT, readSession, markPickedUp } = ctx;

  /*
    Read from the store, so comments outlive the window that captured them.
    Reading a session manifest meant that once the process was gone the work
    was unreachable — which is exactly how three rounds went missing.
  */
  if (!values.file) {
    const store = await openStore(PROJECT);
    await importLegacy(PROJECT, store);
    const tasks = await store.list();
    await markPickedUp();
    const payload = {
      total: tasks.length,
      pending: tasks.filter(isPending).length,
      comments: tasks.map((t, i) => ({
        n: i + 1,
        id: t.id,
        status: t.status,
        kind: t.kind,
        comment: t.comment,
        url: t.url,
        selector: t.selector,
        elements: t.elements ?? [],
        region: t.region ?? null,
        move: t.move ?? null,
        styles: t.styles ?? {},
        regionScreenshot: t.regionScreenshot,
        attachments: t.attachments,
        sourceCandidates: t.sourceCandidates ?? [],
      })),
      hint: 'Act on anything not approved. Read regionScreenshot and attachments first.',
    };
    if (values.json) {
      console.log(JSON.stringify(payload, null, 2));
    } else if (!tasks.length) {
      warn('no comments yet — run `ayna annotate`');
    } else {
      for (const c of payload.comments) {
        console.log(`${bold('#' + c.n)} [${c.status}] ${c.selector ?? ''}`);
        console.log(`   "${c.comment}"`);
      }
    }
    return;
  }

  const session = await readSession();
  // --root means "UI directory" everywhere else; don't overload it here.
  let file = values.file;
  if (!file && session) {
    file = session.file;
    if (!session.live && !values.json) {
      warn('this is from a finished review — the window that owned it is closed');
    }
  }
  if (!file || !existsSync(file)) {
    warn('no comments yet — run `ayna annotate` first');
    return;
  }
  const manifest = await loadComments(file);
  if (values.json) {
    console.log(
      JSON.stringify(
        {
          ...manifest,
          hint:
            'For each comment: Read `regionScreenshot` to see exactly what the user ' +
            'pointed at, Read any `attachments` for their reference image, and start ' +
            'from `sourceCandidates` to find the code.',
        },
        null,
        2,
      ),
    );
    return;
  }
  for (const c of manifest.comments) {
    console.log(`${bold(`#${c.n}`)} ${c.selector}\n   "${c.comment}"`);
  }
}
