import { runLoop } from '../loop.mjs';

export default async function loopCommand(ctx) {
  const { values, cfg, headlessMode } = ctx;

  await runLoop(cfg, {
    iterations: values.iterations ? Number(values.iterations) : undefined,
    model: values.model,
    headless: headlessMode(cfg),
    open: values.open,
    brain: values.brain,
  });
  return;
}
