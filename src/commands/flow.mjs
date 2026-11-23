import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { startTarget } from '../target.mjs';
import { openBrowser, openPersistentContext, gotoSettled } from '../browser.mjs';
import { runFlow, summarizeFlow } from '../flow.mjs';
import { banner, ok, info, warn, fail, yellow, red } from '../log.mjs';

export default async function flowCommand(ctx) {
  const { values, positionals, cfg, PROJECT, headlessMode, browserMode } = ctx;

  const { validateFlow, FLOW_SCHEMA, PROBE, briefFor } = await import('../flowspec.mjs');

  /*
    The vocabulary, for whoever is writing the flow.

    It was documented only by the switch statement in src/flow.mjs, so an
    agent asked to write a test would confidently produce {"do":"assert"} and
    find out at run time, after a browser launch.
  */
  if (values.schema) {
    console.log(JSON.stringify(FLOW_SCHEMA, null, 2));
    return;
  }

  /*
    Read the page and hand back everything needed to write a flow against it
    without guessing. Almost every bad generated flow is a guessed selector,
    and guessing is only necessary because nobody looked.

    ayna does not call a model here on purpose: the editor's agent has the
    codebase open and is the better author. It needs the page, not a rival.
  */
  if (values.draft != null) {
    const server = values.url ? null : await startTarget(cfg);
    // Draft reads the page so the flow can be written against what is really
    // there. A flow itself reuses the saved profile (see the run branch
    // below), so drafting from a FRESH context reads a different page than
    // the flow will ever see: for anything behind a login that is the
    // sign-in form, every time, and the selectors it returns are useless.
    const profileDir = values['fresh-profile'] ? null : path.join(PROJECT, '.ayna', 'profile');
    const viewport = cfg.viewports[0] ?? { width: 1440, height: 900 };
    const ctx = profileDir
      ? await openPersistentContext({ profileDir, headless: true, viewport, browser: browserMode(cfg) })
      : null;
    const browser = ctx ? null : await openBrowser({ headless: true, browser: browserMode(cfg) });
    try {
      const context = ctx ?? (await browser.newContext({ viewport }));
      const page = await context.newPage();
      const base = values.url ?? server.url;
      await gotoSettled(page, base);
      for (const s of values.selector ?? []) {
        // Optional: click into the state the test is about before looking.
        await page.locator(s).first().click({ timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(600);
      }
      const probe = await page.evaluate(PROBE);
      const brief = briefFor(probe, typeof values.draft === 'string' ? values.draft : null);
      console.log(JSON.stringify(brief, null, 2));
    } finally {
      await ctx?.close().catch(() => {});
      await browser?.close().catch(() => {});
      await server?.close().catch(() => {});
    }
    return;
  }

  const spec = values.flow ?? values.file ?? positionals[1];
  if (!spec) throw new Error('give me a flow: ayna flow --flow steps.json (or --schema, or --draft "test case")');
  const flow = JSON.parse(await readFile(path.resolve(PROJECT, spec), 'utf8'));

  /*
    Check without opening anything. A wrong flow should fail in milliseconds
    with the reason, not after a Chrome launch with "nothing matches
    .login-btn".
  */
  const verdict = validateFlow(flow, { name: spec });
  if (values.check) {
    if (values.json) console.log(JSON.stringify({ file: spec, ...verdict }));
    else {
      banner(`ayna flow --check ${path.basename(spec)}`);
      for (const e of verdict.errors) console.log(`  ${red('✗')} ${e}`);
      for (const w of verdict.warnings) console.log(`  ${yellow('!')} ${w}`);
      if (verdict.ok && !verdict.warnings.length) ok('valid');
      else if (verdict.ok) ok('valid, with notes');
      else fail(`${verdict.errors.length} problem(s) — this flow cannot prove anything yet`);
    }
    process.exitCode = verdict.ok ? 0 : 1;
    return;
  }
  if (!verdict.ok) {
    throw new Error(
      `${spec} is not a runnable flow:\n  ${verdict.errors.join('\n  ')}\n` +
        '  `ayna flow --schema` prints the vocabulary.',
    );
  }
  for (const w of verdict.warnings) warn(w);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.join(PROJECT, '.ayna', 'flows', `${(flow.name ?? 'flow').replace(/[^\w-]+/g, '-').toLowerCase()}-${stamp}`);

  const server = await startTarget(cfg);
  // Reuse the saved profile, so a flow behind a login starts signed in.
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

  const record = await runFlow({
    browser,
    context,
    baseUrl: server.url,
    flow,
    outDir,
    viewport: cfg.viewports[0],
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

  if (values.json) {
    console.log(JSON.stringify({ ...record, hint: 'Read every step image in order — the filmstrip is the review.' }, null, 2));
    return;
  }
  banner(`ayna flow · ${record.name}`);
  console.log(summarizeFlow(record));
  console.log('');
  (record.completed ? ok : fail)(
    record.completed ? `all ${record.steps.length} steps completed` : `stopped at step ${record.failedAt.n}: ${record.failedAt.error}`,
  );
  info(`${path.relative(PROJECT, outDir)}/flow.json`);
  return;
}
