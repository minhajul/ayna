import path from 'node:path';

import { captureRoutes } from '../browser.mjs';
import { runAgent, ensureAgent } from '../brain.mjs';
import { resolveBrain } from '../brains.mjs';
import { CRITIQUE_SCHEMA, critiquePrompt } from '../prompts.mjs';
import { banner, step, ok, fail, dim, bold, green, yellow, red } from '../log.mjs';

export default async function critiqueCommand(ctx) {
  const { values, cfg, routes, prepare } = ctx;

  const brain = resolveBrain(cfg, values.brain);
  const probe = await ensureAgent(brain.name);
  if (!probe.ok) throw new Error(`the \`${brain.cmd}\` CLI was not found on PATH`);

  const { browser, url, close, outDir } = await prepare(cfg, 'critique');
  step('look', `screenshotting ${routes.length} route(s)`);
  const cap = await captureRoutes({
    browser,
    baseUrl: url,
    routes,
    viewports: cfg.viewports,
    outDir,
    label: 'before',
  });
  for (const s of cap.shots) {
    ok(`${s.route ?? '/'} ${s.viewport} → ${path.relative(process.cwd(), s.file)}`);
  }

  step('critique', 'asking the design critic what is wrong');
  const run = await runAgent({
    agent: brain.name,
    prompt: critiquePrompt({ cfg, capture: cap, iteration: 1 }),
    cwd: cfg.rootDir,
    tools: ['Read', 'Glob', 'Grep'],
    model: values.model ?? cfg.loop.model,
    schema: CRITIQUE_SCHEMA,
  });
  await close();

  const c = run.json;
  if (!c) {
    fail('no structured critique came back');
    console.log(run.text);
    return;
  }
  const col = c.score >= 8 ? green : c.score >= 5 ? yellow : red;
  banner(`score ${col(bold(`${c.score}/10`))}`);
  console.log(`  ${c.verdict}\n`);
  for (const i of c.issues) {
    const sev = i.severity === 'critical' ? red : i.severity === 'major' ? yellow : dim;
    console.log(`  ${sev(`[${i.severity}]`)} ${bold(i.area)} — ${i.problem}`);
    console.log(`    ${dim(`→ ${i.fix}`)}\n`);
  }
  return;
}
