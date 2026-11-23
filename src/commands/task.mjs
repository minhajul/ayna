import { openStore } from '../tasks.mjs';
import { ok } from '../log.mjs';

export default async function taskCommand(ctx) {
  const { values, positionals, PROJECT } = ctx;

  const id = positionals[1];
  if (!id) throw new Error('which task? ayna task task-0003 --status in_progress');
  const store = await openStore(PROJECT);
  const wanted = values.status;
  if (!wanted) {
    const t = await store.get(id);
    if (!t) throw new Error(`no such task: ${id}`);
    console.log(JSON.stringify(t, null, 2));
    return;
  }
  const updated = await store.update(id, { status: wanted }, values.note);
  if (!updated) throw new Error(`no such task: ${id}`);
  ok(`${id} → ${wanted}`);
  return;
}
