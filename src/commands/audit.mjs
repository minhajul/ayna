import { readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { startTarget } from '../target.mjs';
import { openBrowser, openPersistentContext } from '../browser.mjs';
import { auditPage, summarizeAudit } from '../audit.mjs';
import { banner, ok, info, fail } from '../log.mjs';

export default async function auditCommand(ctx) {
  const { values, cfg, routes, PROJECT, readSession, headlessMode, browserMode } = ctx;

  /*
    If a review window is open, measure in it. Two Chromes cannot share a
    profile, so the alternative was closing the user's review to run an audit
    — and then measuring a freshly loaded page rather than the one they were
    looking at.
  */
  const live = await readSession();
  if (live?.live && !values['fresh-profile']) {
    const reqFile = path.join(live.dir, 'audit-request');
    const resFile = path.join(live.dir, 'audit-live.json');
    await rm(resFile, { force: true });
    await writeFile(reqFile, String(Date.now()));

    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline && !existsSync(resFile)) {
      await new Promise((r) => setTimeout(r, 300));
    }
    if (!existsSync(resFile)) throw new Error('the open window did not answer — is it still there?');

    const report = JSON.parse(await readFile(resFile, 'utf8'));
    if (report.error) throw new Error(`the window could not measure itself: ${report.error}`);
    if (values.json) {
      console.log(JSON.stringify({ ...report, measuredIn: 'the open review window' }, null, 2));
    } else {
      banner(`ayna audit · ${report.url} (live window)`);
      console.log(summarizeAudit(report));
      console.log('');
      (report.clean ? ok : fail)(
        report.clean
          ? 'no layout faults'
          : `${report.counts.covered} covered · ${report.counts.offscreen} cut off · ${report.counts.overlaps} overlapping`,
      );
    }
    return;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.join(PROJECT, '.ayna', 'audits', stamp);
  const server = await startTarget(cfg);
  const profileDir = values['fresh-profile'] ? null : path.join(PROJECT, '.ayna', 'profile');
  // An audit reports sizes, so it needs a viewport it can set — not one that
  // tracks whatever the window happens to be.
  const context = profileDir
    ? await openPersistentContext({
        profileDir,
        headless: headlessMode(cfg),
        viewport: cfg.viewports[0],
        followWindow: false,
        browser: browserMode(cfg),
      })
    : null;
  const browser = context ? null : await openBrowser({ headless: headlessMode(cfg), browser: browserMode(cfg) });

  const target = new URL(routes[0] ?? '/', server.url).toString();
  // --flow reaches a state first, so what you have to click into gets audited too.
  const steps = values.flow
    ? (JSON.parse(await readFile(path.resolve(PROJECT, values.flow), 'utf8')).steps ?? [])
    : [];
  const report = await auditPage({ browser, context, url: target, viewports: cfg.viewports, outDir, steps });

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
    console.log(
      JSON.stringify(
        { ...report, hint: 'Fix critical first, then re-run audit. Clean means no critical or major faults remain.' },
        null,
        2,
      ),
    );
    return;
  }
  banner(`ayna audit · ${target}`);
  console.log(summarizeAudit(report));
  console.log('');
  if (report.blocked === 'authentication') {
    fail('blocked at a sign-in screen — run `ayna login` first');
    process.exitCode = 2;
    return;
  }
  (report.clean ? ok : fail)(
    report.clean
      ? 'no layout faults'
      : `${report.counts.covered} covered · ${report.counts.offscreen} cut off · ${report.counts.overlaps} overlapping · ${report.counts.clipped} clipped`,
  );
  return;
}
