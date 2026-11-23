import { openStore, importLegacy } from '../tasks.mjs';
import { watchTasks } from '../watch.mjs';

export default async function watchCommand(ctx) {
  const { PROJECT } = ctx;

  // Delivery that outlives any window: the store is the queue.
  const store = await openStore(PROJECT);
  await importLegacy(PROJECT, store);
  const controller = new AbortController();
  const { stop } = await watchTasks({
    projectDir: PROJECT,
    signal: controller.signal,
    onEvent: (e) => console.log(JSON.stringify(e)),
  });
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      stop();
      controller.abort();
      process.exit(0);
    });
  }
  await new Promise(() => {}); // watch until killed
  return;
}
