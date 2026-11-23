import { loadConfig } from '../config.mjs';
import { startTarget } from '../target.mjs';
import { openStore } from '../tasks.mjs';
import { banner, ok } from '../log.mjs';

/*
  What ayna cannot measure.

  Layout faults are provable and ayna chases them to zero. Whether a page
  looks like every other page a model has produced is not provable, and the
  README has always said so. Impeccable's detectors cover exactly that gap, so
  this hands them the same URL and keeps their findings clearly separate from
  the measurements.
*/
export default async function tasteCommand(ctx) {
  const { values, PROJECT } = ctx;

  const { judgeTaste, proposeTaste, summarizeTaste } = await import('../taste.mjs');
  const cfg = await loadConfig(PROJECT);
  const target = values.url ?? values.root ?? (await startTarget(cfg).then((s) => s.url).catch(() => null));
  if (!target) throw new Error('nothing to look at — pass --url or --root');

  const result = await judgeTaste(target, { cwd: PROJECT });

  let raised = { proposed: 0 };
  if (values.propose && result.available) {
    const store = await openStore(PROJECT);
    raised = await proposeTaste(store, result, { url: target });
  }

  if (values.json) {
    console.log(JSON.stringify({ ...result, ...raised }, null, 2));
  } else {
    banner('ayna taste');
    console.log(summarizeTaste(result));
    if (raised.proposed) ok(`${raised.proposed} raised as proposals — approve them with \`ayna task <id> --status open\``);
  }
  return;
}
