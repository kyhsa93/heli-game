import { createRequire } from 'node:module';
import { join } from 'node:path';
import { ensurePackage } from './tools.mjs';

export async function stripToStatic(input, output) {
  const cli = ensurePackage('@gltf-transform/cli');
  const req = createRequire(join(cli, 'package.json'));
  const { NodeIO } = await import(req.resolve('@gltf-transform/core'));
  const { ALL_EXTENSIONS } = await import(req.resolve('@gltf-transform/extensions'));
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(input);
  const root = doc.getRoot();
  for (const a of root.listAnimations()) a.dispose();
  for (const n of root.listNodes()) n.setSkin(null);
  for (const s of root.listSkins()) s.dispose();
  for (const m of root.listMeshes()) {
    for (const p of m.listPrimitives()) {
      for (const sem of p.listSemantics()) if (/^(JOINTS|WEIGHTS)_/.test(sem)) p.setAttribute(sem, null);
      for (const t of p.listTargets()) t.dispose();
    }
  }
  await io.write(output, doc);
}
