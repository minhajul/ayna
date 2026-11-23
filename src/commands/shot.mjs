import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { captureRoutes } from '../browser.mjs';
import { ok, warn } from '../log.mjs';

export default async function shotCommand(ctx) {
  const { values, cfg, routes, PROJECT, SESSION_DIR, prepare } = ctx;

  const { browser, url, close, outDir } = await prepare(cfg, 'shot');
  const cap = await captureRoutes({
    browser,
    baseUrl: url,
    routes,
    viewports: cfg.viewports,
    outDir,
    label: 'shot',
    // Keep watching after the shot, so a card that throws on a LATER
    // animation frame is still reported. Default 0 = the old behaviour.
    watchMs: Number(values['watch-ms'] || 0),
  });
  await close();

  // Remember this shot so `record` can pair it into the report later.
  await mkdir(SESSION_DIR, { recursive: true });
  const shots = cap.shots.map((s) => ({ viewport: s.viewport, file: s.file }));
  await writeFile(path.join(SESSION_DIR, 'last-shot.json'), JSON.stringify({ shots }, null, 2));

  if (values.json) {
    // The machine-readable form the skill consumes.
    console.log(
      JSON.stringify(
        {
          url,
          routes: cap.routes,
          shots: cap.shots.map((s) => ({
            route: s.route ?? '/',
            url: s.url ?? url,
            viewport: s.viewport,
            width: s.width,
            height: s.height,
            file: s.file,
            loadError: s.loadError,
            transportError: s.transportError,
            horizontalOverflow: s.metrics?.horizontalOverflow ?? null,
            tinyTextNodes: s.metrics?.tinyTextNodes ?? null,
            textLength: s.metrics?.textLength ?? null,
          })),
          consoleErrors: cap.consoleErrors,
          pageErrors: cap.pageErrors,
          blank: cap.blank,
          hint: 'Read each `file` with the Read tool — that is the page as the user sees it.',
        },
        null,
        2,
      ),
    );
    return;
  }

  for (const s of cap.shots) {
    ok(`${s.route ?? '/'} ${s.viewport} → ${path.relative(PROJECT, s.file)}`);
  }
  if (cap.consoleErrors.length) warn(`console errors: ${cap.consoleErrors.length}`);
}
