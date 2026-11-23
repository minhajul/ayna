import { banner, ok, info, warn, dim, bold, cyan, green, yellow } from '../log.mjs';

/*
  Who is here, and what each of them holds.

  The database has known this since sessions became rows, and nothing
  surfaced it — so "which window is mine?" and "is another agent already on
  this?" had no answer short of reading the tables by hand.
*/
export default async function agentsCommand(ctx) {
  const { values, PROJECT } = ctx;

  const { openSessions } = await import('../sessions.mjs');
  const { identify, describeAgent } = await import('../agent.mjs');
  const { openStore, isPending } = await import('../tasks.mjs');

  const sessions = await openSessions(PROJECT);
  sessions.sweep();

  const me = identify();
  const live = sessions.live();
  const tabs = sessions.tabs();
  const store = await openStore(PROJECT, { db: sessions.db });
  const all = await store.list();

  if (values.json) {
    console.log(
      JSON.stringify({
        me,
        sessions: live.map((sn) => ({
          ...sn,
          mine: sn.agentId === me.agentId,
          tabs: tabs.filter((t) => t.owner === sn.id),
          working: all.filter((t) => t.claimedBy === sn.id).map((t) => t.id),
        })),
        unowned: tabs.filter((t) => !t.owner),
      }),
    );
    return;
  }

  banner('ayna agents');
  info(`you are ${describeAgent(me)}`);
  if (!live.length) {
    warn('nobody is holding a session here');
  }
  for (const sn of live) {
    const mine = sn.agentId === me.agentId;
    const held = tabs.filter((t) => t.owner === sn.id);
    const working = all.filter((t) => t.claimedBy === sn.id);
    console.log(
      `  ${mine ? green('▸') : ' '} ${bold(sn.tool)} ${dim(String(sn.agentId ?? sn.id).slice(0, 44))}` +
        `${mine ? green(' (you)') : ''}`,
    );
    for (const t of held) console.log(`      ${cyan('tab')} ${t.url ?? dim('(no url)')}`);
    for (const t of working) console.log(`      ${yellow('working')} ${t.id} ${dim(t.comment ?? '')}`);
    if (!held.length && !working.length) console.log(`      ${dim('idle')}`);
  }

  const loose = tabs.filter((t) => !t.owner);
  for (const t of loose) console.log(`    ${dim('·')} unowned tab ${t.url ?? ''} ${dim('— free to claim')}`);

  const owed = all.filter(isPending).length;
  console.log('');
  ok(`${live.length} agent(s) · ${tabs.length} tab(s) · ${owed} task(s) outstanding`);
}
