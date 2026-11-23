import { serveStatic } from '../server.mjs';
import { banner, ok, info } from '../log.mjs';

export default async function serveCommand(ctx) {
  const { values, cfg } = ctx;

  const wanted = values.port ? Number(values.port) : cfg.target.port;
  if (values.port && !Number.isInteger(wanted)) throw new Error(`--port wants a number, got "${values.port}"`);
  const server = await serveStatic(cfg.targetDir, wanted);
  banner('ayna serve');
  ok(`${cfg.target.root}/ → ${server.url}`);
  info('ctrl-c to stop');
  await new Promise(() => {});
}
