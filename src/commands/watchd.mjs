import { ok, info } from '../log.mjs';

/*
  The bookkeeper: notices what died, writes it down, and nothing else.

  Deliberately dull. It never opens a browser and never edits a file — a
  background process that can put a window on your screen or change your code
  is a far larger promise than this one.
*/
export default async function watchdCommand(ctx) {
  const { values, positionals, PROJECT, cliFile } = ctx;

  const { watchLoop, running, takePidFile, releasePidFile, pruneSessionFiles } = await import('../watchd.mjs');
  const action = positionals[1] ?? 'status';

  if (action === 'status') {
    const pid = await running(PROJECT);
    const out = { running: !!pid, pid: pid ?? null };
    if (values.json) console.log(JSON.stringify(out));
    else if (pid) ok(`watching, pid ${pid}`);
    else info('not running — start it with `ayna watchd start`');
    return;
  }

  if (action === 'stop') {
    const pid = await running(PROJECT);
    if (!pid) {
      info('nothing to stop');
      return;
    }
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Already gone between the check and the signal; the pidfile goes too.
    }
    await releasePidFile(PROJECT);
    ok(`stopped ${pid}`);
    return;
  }

  if (action !== 'start' && action !== 'run') {
    throw new Error(`ayna watchd start | stop | status  (not "${action}")`);
  }

  // `run` stays in the foreground so a supervisor can own it; `start`
  // detaches, because a bookkeeper you have to keep a terminal open for is a
  // bookkeeper nobody runs.
  if (action === 'start') {
    const held = await running(PROJECT);
    if (held) {
      info(`already watching, pid ${held}`);
      return;
    }
    const { spawn } = await import('node:child_process');
    const child = spawn(process.execPath, [cliFile, 'watchd', 'run'], {
      cwd: PROJECT,
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    ok(`watching in the background, pid ${child.pid}`);
    return;
  }

  const taken = await takePidFile(PROJECT);
  if (!taken.ok) {
    info(`already watching, pid ${taken.pid}`);
    return;
  }
  const controller = new AbortController();
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, async () => {
      controller.abort();
      await releasePidFile(PROJECT);
      process.exit(0);
    });
  }
  await pruneSessionFiles(PROJECT).catch(() => {});
  await watchLoop({
    projectDir: PROJECT,
    signal: controller.signal,
    onEvent: (e) => values.events && console.log(JSON.stringify(e)),
  });
  await releasePidFile(PROJECT);
}
