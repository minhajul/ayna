import path from 'node:path';

import { openStore, importLegacy } from '../tasks.mjs';
import { banner, ok, info, dim, bold, cyan, green, yellow, red } from '../log.mjs';

export default async function tasksCommand(ctx) {
  const { values, PROJECT } = ctx;

  const store = await openStore(PROJECT);
  // Adopt anything captured before the store existed, so no work is stranded.
  const adopted = await importLegacy(PROJECT, store);
  const all = await store.list();
  const stats = await store.stats();

  if (values.json) {
    console.log(
      JSON.stringify(
        {
          ...stats,
          imported: adopted.imported,
          tasks: all.map((t) => ({
            id: t.id,
            status: t.status,
            kind: t.kind,
            comment: t.comment,
            url: t.url,
            selector: t.selector,
            regionScreenshot: t.regionScreenshot,
            attachments: t.attachments,
            sourceCandidates: (t.sourceCandidates ?? []).slice(0, 3),
            updatedAt: t.updatedAt,
          })),
          hint: 'Act on anything not approved. Read regionScreenshot and attachments first.',
        },
        null,
        2,
      ),
    );
    return;
  }

  banner(`ayna tasks · ${path.basename(PROJECT)}`);
  if (adopted.imported) info(`adopted ${adopted.imported} comment(s) from earlier sessions`);
  if (!all.length) {
    info('no tasks yet');
    return;
  }
  const COLOUR = { open: yellow, in_progress: cyan, applied: cyan, approved: green, rejected: red };
  for (const t of all) {
    const paint = COLOUR[t.status] ?? dim;
    console.log(`  ${paint(t.status.padEnd(12))} ${bold(t.id)}  ${(t.comment ?? '').slice(0, 60)}`);
    console.log(`               ${dim(t.url ?? '')}`);
  }
  console.log('');
  ok(`${stats.pending} pending · ${stats.approved} approved · ${stats.total} total`);
}
