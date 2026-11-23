import { readdir, access, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { writeReport } from '../report.mjs';
import { ok, warn, openInDesktop } from '../log.mjs';

export default async function reportCommand(ctx) {
  const { values, cfg, PROJECT, SESSION_DIR, JOURNAL } = ctx;

  // An in-session loop journals its rounds; build the report from those first.
  if (existsSync(JOURNAL)) {
    const entries = JSON.parse(await readFile(JOURNAL, 'utf8'));
    if (entries.length < 2) {
      warn('need at least two recorded rounds to show a before/after — keep going');
      return;
    }
    const iterations = entries.slice(1).map((e, idx) => ({
      n: idx + 1,
      before: { shots: entries[idx].shots },
      after: { shots: e.shots },
      critique: { score: e.score ?? '—', verdict: e.note, issues: [] },
      changes: [],
    }));
    const file = await writeReport({
      cfg,
      runId: 'session',
      runDir: SESSION_DIR,
      iterations,
      stopReason: `${entries.length} round(s) in this session`,
      totalCost: 0,
    });
    ok(`report: ${path.relative(PROJECT, file)}`);
    if (values.open) openInDesktop(file);
    return;
  }

  const runs = await readdir(cfg.runsDir).catch(() => []);
  const latest = runs.filter((r) => !r.startsWith('.')).sort().pop();
  if (!latest) {
    warn('no runs yet — try `ayna loop`');
    return;
  }
  const file = path.join(cfg.runsDir, latest, 'report.html');
  await access(file).catch(() => {
    throw new Error(`no report in ${latest}`);
  });
  openInDesktop(file);
  ok(`opened ${path.relative(process.cwd(), file)}`);
  return;
}
