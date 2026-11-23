import { loadConfig } from '../config.mjs';
import { startTarget } from '../target.mjs';
import { openBrowser } from '../browser.mjs';
import { openStore, importLegacy } from '../tasks.mjs';
import { banner, ok, info, fail } from '../log.mjs';

/*
  Work the queue without a Claude session in front of it.

  Sessions end and terminals get closed; the queue outlives both. This takes
  tasks off the same store every other tool reads, claims each one so nothing
  is done twice, and checks before and after.
*/
export default async function workCommand(ctx) {
  const { values, PROJECT, browserMode } = ctx;

  const { work, brainFor } = await import('../worker.mjs');
  const { verifyTasks } = await import('../verify.mjs');
  const cfg = await loadConfig(PROJECT);
  const store = await openStore(PROJECT);
  await importLegacy(PROJECT, store);

  const brain = brainFor(cfg, values.brain);
  const server = await startTarget(cfg).catch(() => null);
  const browser = server ? await openBrowser({ headless: true, browser: browserMode(cfg) }) : null;

  // One browser for the whole run, handed to the checker.
  const verify = browser
    ? (tasks) =>
        verifyTasks({
          browser,
          url: server.url,
          tasks,
          viewport: cfg.viewports[0],
        }).catch(() => tasks.map((t) => ({ id: t.id, verdict: 'unknown' })))
    : null;

  const say = values.json ? () => {} : (m) => info(m);
  if (!values.json) banner(`ayna work · ${brain.name}`);

  try {
    const result = await work({
      projectDir: PROJECT,
      cfg,
      brain,
      verify,
      limit: values.iterations ? Number(values.iterations) : Infinity,
      onEvent: (e) => {
        if (values.json) return;
        if (e.event === 'working') say(`${e.taskId} — ${e.comment ?? ''}`);
        else if (e.event === 'applied') say(`${e.taskId} ${e.outcome}${e.outcome === 'still-broken' ? ' ✗' : ' ✓'}`);
        else if (e.event === 'failed') fail(`${e.taskId} — ${e.why}`);
        else if (e.event === 'task') say(`${e.taskId} was already fixed`);
      },
    });

    if (values.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log('');
      ok(`${result.worked} task${result.worked === 1 ? '' : 's'} worked`);
    }
  } finally {
    await browser?.close().catch(() => {});
    await server?.close().catch(() => {});
  }
}
