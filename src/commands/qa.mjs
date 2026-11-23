import path from 'node:path';

import { startTarget } from '../target.mjs';
import { openBrowser, openPersistentContext } from '../browser.mjs';
import { loadFlows, runSuite, compareWithBaseline } from '../qa.mjs';
import { banner, ok, info, fail, dim, bold, green, yellow, red } from '../log.mjs';

export default async function qaCommand(ctx) {
  const { values, cfg, PROJECT, headlessMode, browserMode } = ctx;

  const flowsDir = path.resolve(PROJECT, values.dir ?? cfg.qa?.dir ?? 'ayna-flows');
  const flows = await loadFlows(flowsDir);
  if (!flows.length) {
    throw new Error(
      `no flows in ${path.relative(PROJECT, flowsDir)}/ — put one .json per journey there, or pass --dir`,
    );
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.join(PROJECT, '.ayna', 'qa', stamp);
  const server = await startTarget(cfg);
  const profileDir = values['fresh-profile'] ? null : path.join(PROJECT, '.ayna', 'profile');
  const context = profileDir
    ? await openPersistentContext({
        profileDir,
        headless: headlessMode(cfg),
        viewport: cfg.viewports[0],
        browser: browserMode(cfg),
      })
    : null;
  const browser = context ? null : await openBrowser({ headless: headlessMode(cfg), browser: browserMode(cfg) });

  const suite = await runSuite({
    browser,
    context,
    baseUrl: server.url,
    flows,
    outDir,
    viewports: cfg.viewports,
  });

  if (values['keep-open']) {
    // THE WINDOW IS THE RESULT. A suite that closes on the last assertion
    // leaves a person with a number and no way to see what it means; this
    // leaves the browser on whatever the run finished looking at. The
    // process stays alive holding it, so ctrl-c is how you finish.
    info('--keep-open: leaving the browser open. ctrl-c when you are done looking.');
    await new Promise(() => {});
  }
  if (context) await context.close().catch(() => {});
  else await browser.close().catch(() => {});
  await server.close().catch(() => {});

  const baselineFile = values.baseline
    ? path.resolve(PROJECT, values.baseline)
    : path.join(PROJECT, '.ayna', 'qa', 'baseline.json');
  const changes = await compareWithBaseline(suite, baselineFile);

  if (values.json) {
    console.log(JSON.stringify({ ...suite, changes }, null, 2));
  } else {
    banner(`ayna qa · ${flows.length} flow(s)`);
    for (const r of suite.results) {
      const mark = r.passed ? green('  pass') : red('  FAIL');
      console.log(`${mark}  ${bold(r.name)}  ${dim(`${r.steps ?? 0} steps · ${Math.round((r.durationMs ?? 0) / 100) / 10}s`)}`);
      for (const f of r.failures) console.log(`        ${yellow(f.rule)} — ${f.detail}`);
    }
    if (changes?.length) {
      console.log('');
      info('since the baseline:');
      for (const c of changes) console.log(`    ${c.name}: ${c.change}${c.detail ? ` (${c.detail})` : ''}`);
    }
    console.log('');
    (suite.failed ? fail : ok)(`${suite.passed}/${suite.total} flows passed`);
    info(`${path.relative(PROJECT, outDir)}/qa-report.html`);
  }

  // A QA run has to be usable as a gate.
  if (suite.failed) process.exitCode = 1;
}
