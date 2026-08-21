// ツールからTypeScriptの配合エンジンを使うための橋渡し。
// 到達判定をツール側に書き写すと本体とずれるので、必ず本物のエンジンを呼ぶ。
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createJiti as create } from 'jiti';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const jiti = create(join(here, 'engine-bridge.mjs'), {
  alias: { '@': join(root, 'src') },
});

const registry = await jiti.import(join(root, 'src', 'lib', 'engine', 'registry.ts'));

/** ruleset名からエンジンを取り出す（src/lib/engine/registry.ts と同じもの） */
export const getRuleset = registry.getRuleset;
