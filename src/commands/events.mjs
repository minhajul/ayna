/*
  What happened while nobody was looking.

  `watch` announces changes from now on, which is useless to a session that
  starts after the fact — and that is the common case, because sessions end
  and reviews do not. This reads the log instead, so being late costs nothing.
*/
export default async function eventsCommand(ctx) {
  const { values, PROJECT } = ctx;

  const { since, drain, follow } = await import('../events.mjs');
  const consumer = values.consumer ?? null;

  if (values.follow) {
    const controller = new AbortController();
    for (const sig of ['SIGINT', 'SIGTERM']) {
      process.on(sig, () => {
        controller.abort();
        process.exit(0);
      });
    }
    await follow(PROJECT, {
      consumer,
      signal: controller.signal,
      onEvent: (e) => console.log(JSON.stringify(e)),
    });
    return;
  }

  const result = consumer
    ? await drain(PROJECT, consumer)
    : await since(PROJECT, { since: values.since ?? 0 });

  if (values.ndjson) {
    // One line per event, so `events` and `events --follow` pipe the same way.
    for (const e of result.events) console.log(JSON.stringify(e));
  } else {
    console.log(JSON.stringify({ ...result, count: result.events.length }, null, 2));
  }
}
