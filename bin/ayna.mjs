#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readdir, mkdir, access, readFile, writeFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig, writeConfig } from '../src/config.mjs';
import { serveStatic } from '../src/server.mjs';
import { startTarget } from '../src/target.mjs';
import { openBrowser, capture, captureRoutes, openPersistentContext, gotoSettled } from '../src/browser.mjs';
import { runAgent, ensureAgent } from '../src/brain.mjs';
import { resolveBrain } from '../src/brains.mjs';
import { CRITIQUE_SCHEMA, critiquePrompt } from '../src/prompts.mjs';
import { runLoop } from '../src/loop.mjs';
import { snapshot, restore } from '../src/snapshot.mjs';
import { runAnnotate, loadComments } from '../src/annotate.mjs';
import { runFlow, summarizeFlow } from '../src/flow.mjs';
import { openStore, importLegacy, isPending, isProposal } from '../src/tasks.mjs';
import { auditPage, summarizeAudit } from '../src/audit.mjs';
import { loadFlows, runSuite, compareWithBaseline } from '../src/qa.mjs';
import { watchTasks } from '../src/watch.mjs';
import { waitForLogin } from '../src/login.mjs';
import { writeReport } from '../src/report.mjs';
import { banner, step, ok, info, warn, fail, dim, bold, cyan, green, yellow, red, openInDesktop } from '../src/log.mjs';

import initCommand from '../src/commands/init.mjs';
import serveCommand from '../src/commands/serve.mjs';
import shotCommand from '../src/commands/shot.mjs';
import tasksCommand from '../src/commands/tasks.mjs';
import dashboardCommand from '../src/commands/dashboard.mjs';
import qaCommand from '../src/commands/qa.mjs';
import loginCommand from '../src/commands/login.mjs';
import proposeCommand from '../src/commands/propose.mjs';
import inspectCommand from '../src/commands/inspect.mjs';
import watchdCommand from '../src/commands/watchd.mjs';
import workCommand from '../src/commands/work.mjs';
import verifyCommand from '../src/commands/verify.mjs';
import previewCommand from '../src/commands/preview.mjs';
import brainsCommand from '../src/commands/brains.mjs';
import agentsCommand from '../src/commands/agents.mjs';
import sayCommand from '../src/commands/say.mjs';
import eventsCommand from '../src/commands/events.mjs';
import designCommand from '../src/commands/design.mjs';
import tasteCommand from '../src/commands/taste.mjs';
import watchCommand from '../src/commands/watch.mjs';
import taskCommand from '../src/commands/task.mjs';
import cleanCommand from '../src/commands/clean.mjs';
import auditCommand from '../src/commands/audit.mjs';
import flowCommand from '../src/commands/flow.mjs';
import annotateCommand from '../src/commands/annotate.mjs';
import appliedCommand from '../src/commands/applied.mjs';
import followCommand from '../src/commands/follow.mjs';
import statusCommand from '../src/commands/status.mjs';
import commentsCommand from '../src/commands/comments.mjs';
import snapshotCommand from '../src/commands/snapshot.mjs';
import restoreCommand from '../src/commands/restore.mjs';
import recordCommand from '../src/commands/record.mjs';
import critiqueCommand from '../src/commands/critique.mjs';
import reportCommand from '../src/commands/report.mjs';
import loopCommand from '../src/commands/loop.mjs';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

const HELP = `
${bold('ayna')} — let your agent see the UI it builds

  Screenshots the running page in real Chrome, and lets you click, comment on and
  rearrange elements so the agent edits exactly what you meant.

${bold('USAGE')}
  ayna <command> [options]

${bold('TASKS')}
  tasks       Every comment ever made here and where it stands
  task        Show one, or move it: ayna task task-0003 --status in_progress
  dashboard   Tasks, pages, agents and activity as one page (--open to view it);
              the review window's Dashboard button opens a live one beside it
  propose     Put a change in front of the user before making it
  watchd      Bookkeeping in the background: start | stop | status
  work        Take tasks off the queue and do them (--brain claude|cursor|…)
  verify      Ask each open task whether it still applies; closes what is fixed
  preview     Try CSS variants in their window before writing any of it to source
  agents      Who is working here, which tab each holds, and what they claimed
  brains      Which agent CLIs can do the work here (claude, codex, cursor…)
  say         Put a line in the review window: ayna say "fixing the nav now"
  events      What happened since a cursor; --follow to stream (survives every process)
  watch       Announce work as it appears; outlives any window (run under a monitor)

${bold('REVIEW')} — you point, Claude fixes
  annotate    Open the page so you can click, comment, attach images, reorder
  comments    What was marked up (--json for the full payload)
  status      Phase of the open review: commenting / awaiting-claude / reviewing
  wait        Block until the user sends a round, then exit (run in background)
  applied     Tell the open window the edits are in, so it reloads for approval

${bold('LOOK')}
  shot        Screenshot the target; --json prints paths + diagnostics to Read
  flow        Drive a described UI flow and measure every step
              --check <file> validates it without a browser
              --schema prints the step vocabulary to write against
              --draft "<test case>" reads the page and returns everything an
              agent needs to write the flow without guessing a selector
  design      Audit + taste in one: what to fix, what to offer, and where each lives
              (--json gives an agent the brief; --propose raises the opinions as tasks)
  taste       Design anti-patterns via impeccable, if installed (--propose to raise them)
  inspect     Look at one part of a page headlessly: --selector or --region
  audit       Find layout faults the page can prove: covered, cut off, overlapping
              (--flow steps.json to audit a state you have to click into)
  qa          Run every flow in ayna-flows/ and gate on the result (exit 1 on fail)
  clean       Drop old runs (--keep N, default 3); tasks and login are kept
  login       Open the app so you can sign in; the session is remembered
  serve       Serve the target UI and stay up (ctrl-c to stop)

${bold('SAFETY')}
  snapshot    Back up the UI directory before you edit it
  restore     Put it back if your edits made things worse

${bold('REPORT')}
  record      Log a round (--score, --note)
  report      Build the before/after HTML report

${bold('UNATTENDED')} — spawns its own Claude sessions, costs real money
  loop        The full look → critique → improve → verify cycle
  critique    Screenshot and critique once, without editing anything

${bold('SETUP')}
  init        Write ayna.config.json into the current project

${bold('OPTIONS')}
  -n, --iterations <n>   How many improvement rounds (default: config, 3)
  -m, --model <name>     model for the brain (opus|sonnet|haiku, or puku-ai-2.7)
  -b, --brain <name>     headless agent (work: any; loop/critique: claude|puku)
      --url <url>        The page to open — path, query and hash are honoured
      --browser <name>   Which browser to drive: chrome, brave, edge, chromium
                         (or a path to the executable)
      --routes <list>    Several pages at once, e.g. /,/pricing,/about
      --root <dir>       The UI directory to snapshot/restore
      --file <path>      A specific comments.json (comments)
      --json             Machine-readable output
      --events           Stream one JSON line per round/rejection/close (annotate)
      --flow <file>      Flow definition to run (flow)
      --dir <dir>        Where the flows live (qa, default ayna-flows/)
      --baseline <file>  Previous qa.json to compare against (qa)
      --score <n>        Score for this round (record)
      --note <text>      What changed this round (record)
      --comment <text>   What you are proposing (propose)
      --fix <text>       How you would fix it (propose)
      --selector <sel>   What it applies to (propose)
      --headed           Show the Chrome window (default: headless)
      --keep-open        Leave the window open at the end so you can look (implies --headed)
      --watch-ms <n>     After the shot, keep collecting errors for n ms (animated pages)
      --fresh-profile    Start annotate logged out (default: reuse the profile)
      --port <n>         Port to serve on (serve; default: config target.port)
      --open             Open the HTML report when done
  -h, --help             This

${bold('EXAMPLES')}
  ayna annotate --url http://localhost:3000/d/abc123   Review a specific page
  ayna shot --json --routes /,/pricing                 Shoot several pages
  ayna snapshot --root src && ayna restore --root src  Undo a bad round
  ayna loop -n 3 --open                                Unattended, several dollars
`;

/*
  Parse where the failure can be caught.

  `parseArgs` throws, and it ran at module scope — above `main()` and outside the
  `main().catch()` that turns every other failure into one clean line. So a single
  mistyped flag printed a Node stack trace with internal frames, which reads like
  ayna crashed rather than like a typo. `--port` did this on the first command
  tried, and the right answer to a typo is the name of the flag and a pointer to
  --help.
*/
const ARG_SPEC = {
  allowPositionals: true,
  options: {
    iterations: { type: 'string', short: 'n' },
    model: { type: 'string', short: 'm' },
    headless: { type: 'boolean' },
    headed: { type: 'boolean' },
    // Leave the Chrome window open when the run ends, so a person can look at
    // what it left behind. A headless run has nothing to leave open, so this
    // implies --headed rather than silently doing nothing.
    'keep-open': { type: 'boolean' },
    'watch-ms': { type: 'string' },
    url: { type: 'string' },
    browser: { type: 'string' },
    open: { type: 'boolean' },
    json: { type: 'boolean' },
    root: { type: 'string' },
    routes: { type: 'string' },
    events: { type: 'boolean' },
    since: { type: 'string' },
    consumer: { type: 'string' },
    follow: { type: 'boolean' },
    propose: { type: 'boolean' },
    task: { type: 'string' },
    'dry-run': { type: 'boolean' },
    region: { type: 'string' },
    css: { type: 'string', multiple: true },
    label: { type: 'string', multiple: true },
    timeout: { type: 'string' },
    brain: { type: 'string', short: 'b' },
    ndjson: { type: 'boolean' },
    flow: { type: 'string' },
    dir: { type: 'string' },
    baseline: { type: 'string' },
    keep: { type: 'string' },
    port: { type: 'string' },
    schema: { type: 'boolean' },
    check: { type: 'boolean' },
    draft: { type: 'string' },
    status: { type: 'string' },
    comment: { type: 'string' },
    fix: { type: 'string' },
    selector: { type: 'string', multiple: true },
    frame: { type: 'string' },
    'image-base64': { type: 'boolean' },
    'out-dir': { type: 'string' },
    file: { type: 'string' },
    'fresh-profile': { type: 'boolean' },
    'no-wait': { type: 'boolean' },
    'no-taste': { type: 'boolean' },
    score: { type: 'string' },
    note: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
};

const { values, positionals } = (() => {
  try {
    return parseArgs(ARG_SPEC);
  } catch (err) {
    const flag = /Unknown option '([^']+)'/.exec(err.message)?.[1];
    fail(flag ? `unknown option ${flag}` : err.message.split('\n')[0]);
    if (flag) {
      // Name the near misses. Most of these are a hyphen or a plural away, and
      // listing sixty options at someone who typed one wrong is not help.
      const bare = flag.replace(/^--?/, '');
      const near = Object.keys(ARG_SPEC.options).filter(
        (o) => o.includes(bare) || bare.includes(o) || o.replace(/-/g, '') === bare.replace(/-/g, ''),
      );
      if (near.length) info(`did you mean ${near.map((o) => `--${o}`).join(' or ')}?`);
    }
    info('`ayna --help` lists every option');
    process.exit(1);
  }
})();

// Where the user is working. When ayna runs as a plugin, this is their project —
// not the plugin install dir — so screenshots and snapshots belong here.
const PROJECT = process.cwd();
const SESSION_DIR = path.join(PROJECT, '.ayna', 'session');
const JOURNAL = path.join(SESSION_DIR, 'journal.json');

const command = positionals[0] ?? 'help';

async function main() {
  if (values.help || command === 'help') {
    console.log(HELP);
    return;
  }

  // A config in the user's project wins over the plugin's own defaults.
  const localConfig = path.join(PROJECT, 'ayna.config.json');
  const hasLocalConfig = existsSync(localConfig);
  const cfg = await loadConfig(hasLocalConfig ? PROJECT : ROOT);

  /*
    Without this guard, running ayna from a project that has no ayna.config.json
    falls back to the plugin's own defaults — which point at the bundled demo. You
    would get pristine screenshots of a landing page you have never seen, with no
    hint that it isn't your app. Fail loudly instead.
  */
  /*
    Anything that renders a page needs to know which page.

    `inspect`, `audit`, `qa`, `taste` and `verify` all open something and report
    on what they find. Without this they fall back to the plugin's own bundled
    demo and answer confidently about a landing page the user has never seen —
    the same trap `shot` was guarded against, and every bit as convincing.
  */
  const NEEDS_TARGET = new Set([
    'shot', 'critique', 'annotate', 'loop', 'serve', 'inspect', 'audit', 'qa', 'taste', 'verify', 'design',
  ]);
  /*
    `--root` answers the question as well as `--url` does.

    The guard only accepted `--url`, so `ayna shot --root .` in a fresh project
    was refused for not knowing what to look at while `ayna audit --root .` in the
    same directory worked — the same argument, honoured by one command and
    ignored by the next.
  */
  const told = values.url || values.root;
  if (NEEDS_TARGET.has(command) && !hasLocalConfig && !told && PROJECT !== ROOT) {
    throw new Error(
      `no target for ${path.basename(PROJECT)}/ — ayna does not know what to look at.\n` +
        '  Point it at a running app:  ayna ' + command + ' --url http://localhost:3000\n' +
        '  Or create ayna.config.json here:  ayna init\n' +
        '  (without one, ayna would have shown you its own bundled demo)',
    );
  }

  // Artifacts always land in the project being worked on.
  cfg.runsDir = path.join(PROJECT, '.ayna', 'runs');
  if (values.root) cfg.targetDir = path.resolve(PROJECT, values.root);
  /*
    Which pages to capture.

    --routes wins. Otherwise, if --url points at a specific page, that page IS the
    target: resolving a default route of '/' against it would quietly discard the
    path and screenshot the site root instead — you would get a pristine shot of
    the wrong page with nothing indicating it.
  */
  const routes = (() => {
    if (values.routes) return values.routes.split(',').map((r) => r.trim()).filter(Boolean);
    if (values.url) {
      try {
        const u = new URL(values.url);
        const deep = u.pathname + u.search + u.hash;
        if (deep && deep !== '/') return [deep];
      } catch {
        // Not a parseable URL — fall through to the config.
      }
    }
    return cfg.target.routes?.length ? cfg.target.routes : ['/'];
  })();
  if (values.url) {
    cfg.target.url = values.url;
    cfg.target.startCommand = null;
  }

  const ctx = {
    values,
    positionals,
    cfg,
    routes,
    hasLocalConfig,
    localConfig,
    PROJECT,
    SESSION_DIR,
    JOURNAL,
    cliFile: fileURLToPath(import.meta.url),
    readSession,
    liveWindow,
    followSession,
    markPickedUp,
    headlessMode,
    browserMode,
    prepare,
  };

  switch (command) {
    case 'init':
      return initCommand(ctx);

    case 'serve':
      return serveCommand(ctx);

    case 'shot':
      return shotCommand(ctx);

    case 'tasks':
      return tasksCommand(ctx);

    case 'dashboard':
      return dashboardCommand(ctx);

    case 'qa':
      return qaCommand(ctx);

    case 'login':
      return loginCommand(ctx);

    case 'propose':
      return proposeCommand(ctx);

    case 'inspect':
      return inspectCommand(ctx);

    case 'watchd':
      return watchdCommand(ctx);

    case 'work':
      return workCommand(ctx);

    case 'verify':
      return verifyCommand(ctx);

    case 'preview':
      return previewCommand(ctx);

    case 'brains':
      return brainsCommand(ctx);

    case 'agents':
      return agentsCommand(ctx);

    case 'say':
      return sayCommand(ctx);

    case 'events':
      return eventsCommand(ctx);

    case 'design':
      return designCommand(ctx);

    case 'taste':
      return tasteCommand(ctx);

    case 'watch':
      return watchCommand(ctx);

    case 'task':
      return taskCommand(ctx);

    case 'clean':
      return cleanCommand(ctx);

    case 'audit':
      return auditCommand(ctx);

    case 'flow':
      return flowCommand(ctx);

    case 'annotate':
      return annotateCommand(ctx);

    case 'applied':
      return appliedCommand(ctx);

    case 'wait':
    case 'follow':
      return followCommand(ctx);

    case 'status':
      return statusCommand(ctx);

    case 'comments':
      return commentsCommand(ctx);

    case 'snapshot':
      return snapshotCommand(ctx);

    case 'restore':
      return restoreCommand(ctx);

    case 'record':
      return recordCommand(ctx);

    case 'critique':
      return critiqueCommand(ctx);

    case 'report':
      return reportCommand(ctx);

    case 'loop':
      return loopCommand(ctx);

    default:
      fail(`unknown command: ${command}`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

/**
 * The annotate session this project last opened, and whether it is still running.
 *
 * A resumed conversation inherits the pointer file but not the process: the browser
 * died with the session that opened it. Without this check `status` reports a phase
 * nobody is in, `applied` writes a marker nothing will read, and `wait` polls a
 * frozen file forever.
 */
async function readSession() {
  const alive = (pid) => {
    if (!pid) return false;
    try {
      process.kill(pid, 0); // signal 0 is a liveness probe; it sends nothing
      return true;
    } catch {
      return false;
    }
  };

  /*
    Ask the database first.

    Session identity was kept in pointer files and the database's own `sessions`
    table went unread — so the schema built to answer "who is here?" was answered
    instead by whichever JSON file happened to be newest, which is how a dead pid
    once won over a live window two files away. The table knows the agent behind
    the session and heartbeats, so it can tell a window that ended from one whose
    process merely moved on.

    The files stay as a fallback: a window opened by an older ayna, or one
    running without a store, still has to be findable.
  */
  try {
    const { openSessions } = await import('../src/sessions.mjs');
    const sessions = await openSessions(PROJECT);
    sessions.sweep();
    const [current] = sessions.live();
    if (current) {
      const tab = sessions.tabs().find((t) => t.owner === current.id);
      if (tab?.outDir) {
        return {
          file: path.join(tab.outDir, 'comments.json'),
          dir: tab.outDir,
          pid: current.agentPid ?? current.pid,
          startedAt: current.startedAt,
          agentId: current.agentId,
          tool: current.tool,
          tabId: tab.id,
          live: true,
          source: 'db',
        };
      }
    }
  } catch {
    // No database yet, or a build that predates it — the files below still work.
  }

  const candidates = [];
  for (const name of await readdir(SESSION_DIR).catch(() => [])) {
    if (!/^session-\d+\.json$/.test(name)) continue;
    const info = JSON.parse(await readFile(path.join(SESSION_DIR, name), 'utf8').catch(() => '{}'));
    if (info.file) candidates.push(info);
  }

  // Prefer a live session, newest first; fall back to the last one for context.
  const live = candidates.filter((c) => alive(c.pid)).sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
  if (live.length) return { ...live[0], dir: path.dirname(live[0].file), live: true, others: live.length - 1 };

  // Nothing live in the new format — fall back to the single-pointer file a
  // session written before this change would have left, and still ask whether
  // its process is running rather than assuming it is not.
  const legacy = path.join(SESSION_DIR, 'last-comments.json');
  const fallback =
    candidates.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0] ??
    (existsSync(legacy) ? JSON.parse(await readFile(legacy, 'utf8').catch(() => '{}')) : null);
  if (!fallback?.file) return null;
  return { ...fallback, dir: path.dirname(fallback.file), live: alive(fallback.pid) };
}

/**
 * Is there a window to paint on?
 *
 * `preview` and `say` both put something on the user's screen, and both used to
 * report that they had done so the moment the event was written — with no window
 * open, no page, and nobody able to answer. "1 variant on the page" was false in
 * exactly the way the `!important` bug was false: a preview that lies about what
 * it is showing is worse than no preview.
 *
 * The event log is durable on purpose, so queuing for a window that opens later
 * is legitimate and nothing is dropped. What is not legitimate is calling that
 * the same thing as a variant someone is looking at.
 */
async function liveWindow() {
  const session = await readSession().catch(() => null);
  return session?.live ? session : null;
}

/**
 * Block until the user does something worth waking up for: sends another round,
 * rejects a change, approves, or closes the window. Prints one JSON line saying
 * which, then returns.
 *
 * `settle` skips over the state we are already in — right after `applied` the
 * phase is still `awaiting-claude` from the round just handled, and returning on
 * that would be answering our own question.
 */
async function followSession(statusFile, sessionDir, { settle = false } = {}) {
  const stopListening = await listen();
  try {
    return await follow(statusFile, { settle });
  } finally {
    stopListening();
  }
}

/*
  Say that someone is on the line.

  A window cannot see who reads its rounds, so it promised "waiting for Claude"
  to a terminal nobody was watching, and the user waited minutes on a review no
  session would ever pick up. While anything follows the window it refreshes a
  row in the cursors table, and the window takes a fresh row as proof that
  someone will hear the next Send. See listenerOf in src/annotate.mjs.
*/
async function listen() {
  try {
    const [{ openDb, writeCursor, latestSeq }, { identify }] = await Promise.all([
      import('../src/db.mjs'),
      import('../src/agent.mjs'),
    ]);
    const db = await openDb(PROJECT);
    const consumer = `listen:${identify().agentId}`;
    const beat = () => {
      try {
        writeCursor(db, consumer, latestSeq(db));
      } catch {
        // A missed beat only means the window may doubt us for a moment.
      }
    };
    beat();
    const timer = setInterval(beat, 3000);
    return () => clearInterval(timer);
  } catch {
    // No database: the window cannot read a heartbeat anyway.
    return () => {};
  }
}

/*
  Tell the window its round has been read.

  Reading the notes of a round that is waiting is what picking it up means, so
  the window can stop saying "waiting for Claude" and say Claude has it. A marker
  file, the same way `applied` reaches the window.
*/
async function markPickedUp() {
  const session = await liveWindow();
  if (!session) return;
  const status = JSON.parse(await readFile(path.join(session.dir, 'status.json'), 'utf8').catch(() => '{}'));
  if (status.phase !== 'awaiting-claude') return;
  await writeFile(path.join(session.dir, 'picked-up'), String(Date.now())).catch(() => {});
}

async function follow(statusFile, { settle = false } = {}) {
  const read = async () =>
    existsSync(statusFile) ? JSON.parse(await readFile(statusFile, 'utf8').catch(() => '{}')) : {};

  if (settle) {
    const from = (await read()).round ?? 0;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      const s = await read();
      if (s.phase !== 'awaiting-claude' || (s.round ?? 0) > from) break;
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  for (;;) {
    const s = await read();
    if (s.phase === 'awaiting-claude') {
      console.log(JSON.stringify({ phase: s.phase, round: s.round, comments: s.comments, action: 'read-comments' }));
      return;
    }
    // "Needs work" is also a call to action — otherwise the user would have to
    // press Send again just to tell you they rejected something.
    if (s.rejected > 0) {
      console.log(JSON.stringify({ phase: s.phase, rejected: s.rejected, action: 'retry-rejected' }));
      return;
    }
    if (s.phase === 'approved' || s.phase === 'closed') {
      console.log(JSON.stringify({ phase: s.phase, done: true }));
      return;
    }
    // They may simply close the window, or the session that owns it may end.
    const still = await readSession();
    if (!still || !still.live) {
      console.log(JSON.stringify({ phase: 'stale', done: true }));
      return;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

/** `--headed` beats `--headless` beats the config default. */
function headlessMode(cfg) {
  if (values.headed || values['keep-open']) return false;
  return values.headless ?? cfg.loop.headless;
}

/**
 * Which browser to drive, from the flag, then the config, then the default.
 *
 * A path in the config wins over a name: it is the more specific answer, and
 * somebody who set `executablePath` meant that exact binary.
 */
function browserMode(cfg) {
  if (values.browser) return values.browser;
  const b = cfg.browser ?? {};
  if (b.executablePath) return b.executablePath;
  if (b.channel) return b.channel;
  return undefined; // let the browser module resolve the default
}

/** Shared setup for the one-shot commands: server up, browser open, output dir ready. */
async function prepare(cfg, kind) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.join(cfg.runsDir, `${kind}-${stamp}`);
  await mkdir(outDir, { recursive: true });

  // Shared with `loop`, so a configured startCommand boots the dev server here
  // too. Previously only `loop` honored it and everything else silently served
  // target.root as static files instead.
  const server = await startTarget(cfg);
  const browser = await openBrowser({ headless: headlessMode(cfg), browser: browserMode(cfg) });

  return {
    browser,
    url: server.url,
    outDir,
    close: async () => {
      await browser.close().catch(() => {});
      await server.close().catch(() => {});
    },
  };
}

main().catch((err) => {
  fail(err.message);
  process.exitCode = 1;
});
