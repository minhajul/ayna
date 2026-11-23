import { banner, ok, info, warn, dim, bold, cyan, green } from '../log.mjs';

/* What can actually do the work on this machine, and what is only an editor. */
export default async function brainsCommand(ctx) {
  const { values, cfg } = ctx;

  const { surveyBrains, EDITORS } = await import('../brains.mjs');
  const rows = await surveyBrains(cfg);

  if (values.json) {
    console.log(JSON.stringify({ brains: rows, editors: EDITORS, chosen: cfg.brain ?? 'claude' }));
    return;
  }

  banner('ayna brains');
  info('a brain is a CLI ayna can hand a prompt and wait for — `ayna work --brain <name>`');
  for (const b of rows) {
    const mark = b.installed ? green('✓') : dim('·');
    console.log(
      `  ${mark} ${bold(b.name.padEnd(9))} ${dim((b.cmd + ' ' + b.args.join(' ')).padEnd(24))}` +
        (b.installed ? '' : dim(' not installed')) +
        (b.custom ? cyan(' (yours)') : ''),
    );
    console.log(`      ${dim(b.note)}`);
  }

  console.log('');
  info('these use ayna but cannot be driven by it — run ayna from their terminal:');
  for (const [name, why] of Object.entries(EDITORS)) console.log(`    ${dim('·')} ${bold(name)} ${dim('— ' + why)}`);

  console.log('');
  const ready = rows.filter((b) => b.installed);
  if (ready.length) ok(`${ready.length} available · default is "${cfg.brain ?? 'claude'}"`);
  else warn('none installed — ayna work has nothing to drive, but you can still fix tasks yourself');
}
