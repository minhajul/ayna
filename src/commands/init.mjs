import path from 'node:path';

import { writeConfig } from '../config.mjs';
import { ok, warn } from '../log.mjs';

export default async function initCommand(ctx) {
  const { hasLocalConfig, localConfig, PROJECT } = ctx;

  // PROJECT, not ROOT: `ayna init` is how you configure *your* project. Writing
  // to ROOT put the file in the plugin's own directory, clobbering its config
  // while leaving the project exactly as unconfigured as before.
  if (hasLocalConfig) {
    warn(`${path.relative(PROJECT, localConfig)} already exists — leaving it alone`);
    return;
  }
  const file = await writeConfig(PROJECT);
  ok(`wrote ${path.relative(PROJECT, file)} — set target.url or target.root, then run \`ayna shot\``);
  return;
}
