import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { loadConfig } from '../config.mjs';
import { startTarget } from '../target.mjs';
import { openBrowser } from '../browser.mjs';
import { banner } from '../log.mjs';

/*
  Visual QA an agent can do for itself.

  Everything else here assumes somebody is pointing. An agent has no hands —
  it can name a thing and needs back what a person gets from pointing at it:
  the pixels, and what is measurably wrong inside them. Headless, so it costs
  a second and steals no window.
*/
export default async function inspectCommand(ctx) {
  const { values, PROJECT, browserMode } = ctx;

  const { inspect, summarizeInspection } = await import('../inspect.mjs');
  const cfg = await loadConfig(PROJECT);

  let region = null;
  if (values.region) {
    const [x, y, w, h] = String(values.region).split(',').map(Number);
    if ([x, y, w, h].some((n) => !Number.isFinite(n))) {
      throw new Error('--region wants x,y,width,height in pixels');
    }
    region = { x, y, width: w, height: h };
  }
  if (!values.selector && !region) {
    throw new Error('what should it look at? --selector ".toolbar" or --region 40,80,320,120');
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = values['out-dir']
    ? path.resolve(PROJECT, values['out-dir'])
    : path.join(PROJECT, '.ayna', 'inspect', stamp);

  /*
    A given URL is the target; nothing needs starting.

    Starting one unconditionally meant a sandbox with no local project to
    serve failed before it ever reached the page it was told to look at.
  */
  const server = values.url ? null : await startTarget(cfg);
  const browser = await openBrowser({ headless: true, browser: browserMode(cfg) });
  const steps = values.flow
    ? (JSON.parse(await readFile(path.resolve(PROJECT, values.flow), 'utf8')).steps ?? [])
    : [];

  /*
    One browser for every region asked about.

    Each launch costs a second or two, which is the dominant cost inside an
    agent's fix loop — three cards should not mean three cold starts.
  */
  const selectors = region ? [null] : [values.selector].flat();

  try {
    const results = [];
    for (const [i, sel] of selectors.entries()) {
      results.push(
        await inspect({
          browser,
          url: values.url ?? server.url,
          selector: sel,
          frame: values.frame ?? null,
          region,
          steps,
          viewport: cfg.viewports[0],
          outDir,
          image: Boolean(values['image-base64']),
          label: selectors.length > 1 ? `inspect-${i + 1}` : 'inspect',
        }),
      );
    }

    // One selector keeps the shape it always had; several add a list, so a
    // caller written against the single case is not broken by the feature.
    const single = results.length === 1;
    const payload = single
      ? results[0]
      : { url: values.url ?? server.url, results, clean: results.every((r) => r.found && r.clean) };

    if (values.json) console.log(JSON.stringify(payload, null, 2));
    else {
      banner('ayna inspect');
      for (const r of results) {
        console.log('  ' + summarizeInspection(r));
        if (r.screenshot) console.log('    ' + path.relative(PROJECT, r.screenshot));
      }
    }

    /*
      Exit 1 on a fault, and on not having been able to look at all. A QA gate
      that passes because the selector was wrong is worse than one that fails.
    */
    if (results.some((r) => !r.found || !r.clean)) process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
    await server?.close().catch(() => {});
  }
  return;
}
