import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const route = path.resolve('.next/server/app/api/pico-ai/[...path]');
const trace = JSON.parse(await fs.readFile(path.join(route, 'route.js.nft.json'), 'utf8'));
const files = trace.files.map(file => path.resolve(route, file));
for (const required of [
  'private/pico-ai/modnet.onnx',
  'private/pico-ai/hegra.jpg',
  'private/pico-ai/NotoSansArabic.ttf',
  'node_modules/onnxruntime-node/bin/napi-v6/linux/x64/onnxruntime_binding.node',
  'node_modules/onnxruntime-node/bin/napi-v6/linux/x64/libonnxruntime.so.1',
]) {
  assert.ok(files.includes(path.resolve(required)), `Deployment bundle is missing ${required}`);
}
let bytes = 0;
for (const file of files) bytes += (await fs.stat(file)).size;
assert.ok(bytes < 230 * 1024 * 1024, 'Traced function exceeds the 230 MiB release guard');
console.log(`PASS: model, artwork, font and Linux CPU runtime traced; ${(bytes / 1024 / 1024).toFixed(2)} MiB.`);
