import path from 'node:path';

import { ok, info, openInDesktop } from '../log.mjs';

export default async function dashboardCommand(ctx) {
  const { values, cfg, PROJECT } = ctx;

  // Read-only: it renders what the store holds and changes no task. A static
  // file rather than a server, so it opens from disk and works offline. It
  // wears the project's ayna theme, the same one the review window does.
  // Opened from a review window's Dashboard button instead, it stays live.
  const { writeDashboard } = await import('../dashboard.mjs');
  const outDir = values['out-dir']
    ? path.resolve(PROJECT, values['out-dir'])
    : path.join(PROJECT, '.ayna', 'dashboard');
  const { file, data } = await writeDashboard(PROJECT, { outDir, theme: cfg.theme });

  if (values.json) {
    console.log(JSON.stringify({ file, ...data }, null, 2));
    return;
  }
  ok(`dashboard: ${path.relative(PROJECT, file)}`);
  info(
    `${data.counts.total} task(s) · ${data.counts.pending} outstanding · ` +
      `${data.attention.length} need attention · ${data.pages.length} page(s)`,
  );
  if (values.open) openInDesktop(file);
  else info('--open to view it in your browser');
  return;
}
