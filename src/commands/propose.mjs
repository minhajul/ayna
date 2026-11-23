import { openStore } from '../tasks.mjs';
import { ok } from '../log.mjs';

export default async function proposeCommand(ctx) {
  const { values, cfg, PROJECT } = ctx;

  /*
    A change Claude wants to make, put in front of the user before anything is
    edited. It lands in the same window as their own comments, with the same
    controls, so approving a suggestion and answering a comment are one habit
    rather than two.
  */
  if (!values.comment) throw new Error('what are you proposing? --comment "…" [--fix "…"] [--selector "…"]');
  const store = await openStore(PROJECT);
  const task = await store.create({
    status: 'proposed',
    kind: 'proposal',
    comment: values.comment,
    fix: values.fix ?? null,
    // `--selector` takes several values for `inspect`, so it always arrives
    // as an array. A proposal is about one element.
    selector: [values.selector].flat()[0] ?? null,
    url: values.url ?? cfg.target.url ?? null,
    source: 'claude',
  });
  if (values.json) console.log(JSON.stringify(task, null, 2));
  else ok(`proposed ${task.id} — waiting for the user`);
  return;
}
