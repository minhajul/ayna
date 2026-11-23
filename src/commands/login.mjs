import path from 'node:path';

import { startTarget } from '../target.mjs';
import { waitForLogin } from '../login.mjs';
import { banner, ok, info, fail } from '../log.mjs';

export default async function loginCommand(ctx) {
  const { values, cfg, routes, PROJECT, browserMode } = ctx;

  /*
    The user signs in; Claude never does. It opens the window, waits for the
    sign-in screen to go away, and remembers the session so this is asked once
    instead of at the start of every review.
  */
  const server = await startTarget(cfg);
  const target = values.url ?? new URL(routes[0] ?? '/', server.url).toString();
  const profileDir = path.join(PROJECT, '.ayna', 'profile');

  banner('ayna login');
  info(`opening ${target}`);
  const result = await waitForLogin({
    profileDir,
    url: target,
    viewport: cfg.viewports[0],
    browser: browserMode(cfg),
    onState: (e) => {
      if (e.state === 'waiting') info('sign in in the window — I will wait, and I never see what you type');
      if (e.state === 'already-signed-in') ok('already signed in');
    },
  });
  await server.close().catch(() => {});

  if (values.json) {
    console.log(JSON.stringify(result));
    if (!result.signedIn) process.exitCode = 1;
    return;
  }
  if (result.signedIn) {
    ok(result.alreadySignedIn ? 'session already valid — nothing to do' : 'signed in; the session is saved');
    info('audits and reviews will start from here now');
  } else {
    fail(result.closed ? 'window closed before the sign-in finished' : 'timed out waiting for the sign-in');
    process.exitCode = 1;
  }
}
