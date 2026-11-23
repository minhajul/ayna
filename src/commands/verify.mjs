import { loadConfig } from '../config.mjs';
import { startTarget } from '../target.mjs';
import { openBrowser } from '../browser.mjs';
import { openStore, importLegacy } from '../tasks.mjs';
import { banner, ok, info } from '../log.mjs';

/*
  Ask each outstanding task whether it still applies.

  Somebody fixing something themselves and then being asked about it anyway
  is how a task list stops being read, and once it stops being read the
  unsolved ones go with it.
*/
export default async function verifyCommand(ctx) {
  const { values, PROJECT, headlessMode, browserMode } = ctx;

  const { verifyTasks, applyVerdicts } = await import('../verify.mjs');
  const cfg = await loadConfig(PROJECT);
  const store = await openStore(PROJECT);
  await importLegacy(PROJECT, store);

  const all = await store.list({ pending: true });
  const tasks = values.task ? all.filter((t) => t.id === values.task) : all;
  if (!tasks.length) {
    if (values.json) console.log(JSON.stringify({ checked: 0, verdicts: [] }));
    else info('nothing outstanding to check');
    return;
  }

  const server = await startTarget(cfg);
  const browser = await openBrowser({ headless: headlessMode(cfg), browser: browserMode(cfg) });
  let verdicts = [];
  try {
    // One page per URL: the tasks belong to whatever they were raised on.
    const byUrl = new Map();
    for (const t of tasks) {
      const key = (t.url ?? server.url).split('#')[0];
      if (!byUrl.has(key)) byUrl.set(key, []);
      byUrl.get(key).push(t);
    }
    for (const [pageUrl, group] of byUrl) {
      verdicts.push(
        ...(await verifyTasks({
          browser,
          url: pageUrl,
          tasks: group,
          viewport: cfg.viewports[0],
        }).catch(() => group.map((t) => ({ id: t.id, verdict: 'unknown', why: 'the page could not be opened' })))),
      );
    }
  } finally {
    await browser.close().catch(() => {});
    await server.close().catch(() => {});
  }

  const applied = values['dry-run'] ? { obsolete: 0, asked: 0, untouched: verdicts.length } : await applyVerdicts(store, verdicts);

  if (values.json) {
    console.log(JSON.stringify({ checked: tasks.length, ...applied, verdicts }, null, 2));
  } else {
    banner('ayna verify');
    for (const v of verdicts) {
      const mark = v.verdict === 'gone' ? '✓' : v.verdict === 'reproduces' ? '·' : '?';
      console.log(`  ${mark} ${v.id.padEnd(11)} ${v.verdict}${v.why ? ' — ' + v.why : ''}`);
    }
    console.log('');
    ok(`${applied.obsolete} closed as already fixed · ${applied.asked} need your word · ${applied.untouched} unchanged`);
  }
  return;
}
