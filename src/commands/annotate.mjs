import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { startTarget } from '../target.mjs';
import { openBrowser, openPersistentContext } from '../browser.mjs';
import { runAnnotate } from '../annotate.mjs';
import { openStore } from '../tasks.mjs';
import { banner, ok, info, dim, bold } from '../log.mjs';

export default async function annotateCommand(ctx) {
  const { values, cfg, PROJECT, SESSION_DIR, browserMode } = ctx;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.join(PROJECT, '.ayna', 'comments', stamp);

  const server = await startTarget(cfg);
  // Always headed — the whole point is that a human clicks things.
  // A persistent profile keeps you logged in between reviews; --fresh-profile
  // starts clean (useful for checking a signed-out view).
  const profileDir = values['fresh-profile'] ? null : path.join(PROJECT, '.ayna', 'profile');
  let context = profileDir
    ? await openPersistentContext({
        profileDir,
        headless: false,
        viewport: cfg.viewports[0],
        browser: browserMode(cfg),
      })
    : null;
  const browser = context ? null : await openBrowser({ headless: false, browser: browserMode(cfg) });
  if (!context) {
    // viewport null so the page follows the window the user resizes, rather
    // than staying the size it launched at with dead space around it.
    context = await browser.newContext({ viewport: null });
  }

  // With --json, stdout must be nothing but JSON — the status lines go to stderr
  // so a caller can still see progress while piping the result.
  const say = values.json
    ? (msg) => process.stderr.write(`  ${msg}\n`)
    : (msg) => info(msg);
  if (!values.json) banner('ayna annotate');
  if (values.json) say(`opened ${server.url}`);
  else ok(`opened ${server.url}`);
  say('click anything to comment · paste an image to attach a reference');
  say('press "Send to Claude" in the page when you are done');

  // Written before we block, so `ayna applied` and `ayna status` can find this
  // session while the window is still open.
  /*
    One pointer per process, not per project.

    A single last-comments.json meant a second review in the same repo
    overwrote the first, and commands then talked to whichever window wrote
    last — silently routing comments to the wrong one. Each session writes its
    own file; readers pick the newest live one.
  */
  await mkdir(SESSION_DIR, { recursive: true });
  const pointer = { file: path.join(outDir, 'comments.json'), pid: process.pid, startedAt: Date.now() };
  await writeFile(path.join(SESSION_DIR, `session-${process.pid}.json`), JSON.stringify(pointer));
  await writeFile(path.join(SESSION_DIR, 'last-comments.json'), JSON.stringify(pointer));

  /*
    The window writes into the store as comments are made.

    This argument was missing, and its absence was the whole bug: every
    `if (store)` branch in runAnnotate was dead, so a comment existed only
    inside the running process until the session ended and a later command
    scraped the finished manifest. Work was invisible for exactly as long as
    it was live, which is when somebody wants to see it.
  */
  const store = await openStore(PROJECT);

  const manifest = await runAnnotate({
    browser,
    context,
    store,
    // One line of JSON per thing worth waking up for. Run this under a
    // monitor and every round the user sends notifies you — no second
    // process, nothing to re-arm.
    onEvent: values.events ? (e) => console.log(JSON.stringify(e)) : undefined,
    url: server.url,
    outDir,
    projectDir: PROJECT,
    viewport: cfg.viewports[0],
    theme: cfg.theme,
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

  if (values.events) return; // the stream was the output
  if (values.json) {
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }
  ok(`${manifest.comments.length} comment(s) → ${path.relative(PROJECT, outDir)}`);
  for (const c of manifest.comments) {
    console.log(`  ${bold(`#${c.n}`)} ${c.selector}`);
    console.log(`     "${c.comment}"`);
    if (c.sourceCandidates?.length) {
      console.log(`     ${dim(`source: ${c.sourceCandidates[0].file}:${c.sourceCandidates[0].line}`)}`);
    }
  }
  return;
}
