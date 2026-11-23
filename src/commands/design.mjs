import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { startTarget } from '../target.mjs';
import { openBrowser } from '../browser.mjs';
import { openStore } from '../tasks.mjs';
import { auditPage } from '../audit.mjs';
import { banner, ok, info, fail, dim } from '../log.mjs';

/*
  One review, both kinds of truth.

  `audit` answered "what can the page prove is wrong" and `taste` answered
  "what does a detector think of how it looks", and an agent reviewing a page
  had to run both, know that only one of them is a gate, and work out the fix
  for each finding itself. This runs them together and returns
  recommendations: what is wrong, where it lives, what to do instead, and
  whether it is safe to act on without asking.
*/
export default async function designCommand(ctx) {
  const { values, cfg, routes, PROJECT, headlessMode, browserMode } = ctx;

  const { recommend, designBrief, summarizeDesign } = await import('../design.mjs');
  const { judgeTaste, proposeTaste } = await import('../taste.mjs');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.join(PROJECT, '.ayna', 'design', stamp);
  const server = await startTarget(cfg);
  const target = values.url ?? new URL(routes[0] ?? '/', server.url).toString();

  const browser = await openBrowser({ headless: headlessMode(cfg), browser: browserMode(cfg) });
  let report;
  try {
    report = await auditPage({
      browser,
      url: target,
      viewports: cfg.viewports,
      outDir,
      steps: values.flow
        ? (JSON.parse(await readFile(path.resolve(PROJECT, values.flow), 'utf8')).steps ?? [])
        : [],
    });
  } finally {
    await browser.close().catch(() => {});
  }

  /*
    Taste is optional and must stay optional. No impeccable installed is a
    review with no design opinions in it — not a failed review, and not a
    page that turned out to have no design faults.
  */
  const taste = values['no-taste']
    ? { available: false, findings: [], hint: '--no-taste: design opinions were skipped' }
    : await judgeTaste(target, { cwd: PROJECT });

  await server.close().catch(() => {});

  const result = recommend({ audit: report, taste });

  let raised = { proposed: 0 };
  if (values.propose && taste.available) {
    const store = await openStore(PROJECT);
    raised = await proposeTaste(store, taste, { url: target });
  }

  if (values.json) {
    console.log(
      JSON.stringify(
        designBrief(result, { url: target, screenshots: (report.findings ?? []).map((f) => f.screenshot).filter(Boolean) }),
        null,
        2,
      ),
    );
    process.exitCode = result.clean ? 0 : 1;
    return;
  }

  banner(`ayna design · ${target}`);
  console.log(summarizeDesign(result, { relativeTo: PROJECT }));
  console.log('');
  for (const shot of (report.findings ?? []).map((f) => f.screenshot).filter(Boolean)) {
    console.log(`  ${dim(shot)}`);
  }
  console.log('');
  if (raised.proposed) ok(`${raised.proposed} raised as proposals — \`ayna task <id> --status open\` to accept one`);
  (result.clean ? ok : fail)(
    result.clean
      ? `nothing measurable is wrong · ${result.counts.judged} design note(s) to consider`
      : `${result.counts.measured} to fix · ${result.counts.judged} to consider`,
  );
  info('`--json` returns the brief an agent acts on; read the screenshots before changing anything');
  process.exitCode = result.clean ? 0 : 1;
}
