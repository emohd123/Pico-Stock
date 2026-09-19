// Default is a read-only dry run. --publish is required for one optimistic API PUT.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { createAdminSessionToken, getAdminCookieName } from '../lib/adminAuth.js';
import { EVENT_LAYOUT_ID, validateEventLayout, validateRevisionName } from '../lib/eventLayoutSchema.js';
import { mergeEventLayoutCandidate, sameLayoutValue } from '../lib/eventLayoutMerge.js';

dotenv.config({ path: '.env.local', quiet: true });
const args = process.argv.slice(2), options = {};
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--publish') options.publish = true;
  else if (['--baseline', '--candidate', '--base-url', '--name', '--output'].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith('--')) options[args[i].slice(2)] = args[++i];
  else throw new Error(`Unknown or incomplete option: ${args[i]}`);
}
if (!options.baseline || !options.candidate) throw new Error('Usage: node scripts/publish-event-layout-candidate.mjs --baseline <json> --candidate <json> [--base-url https://pico-stock.vercel.app] [--name "Venue photo refinement"] [--output <directory>] [--publish]');
const base = new URL(options['base-url'] || 'https://pico-stock.vercel.app');
if (base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname)) throw new Error('Use HTTPS for a remote release.');
const name = validateRevisionName(options.name || 'Venue photo refinement');
const out = path.resolve(options.output || 'output/event-studio/photo-refresh/publication');
await mkdir(out, { recursive: true });
const baseline = validateEventLayout(JSON.parse(await readFile(options.baseline, 'utf8')));
const candidate = validateEventLayout(JSON.parse(await readFile(options.candidate, 'utf8')));
const endpoint = new URL(`/api/pico-ai/admin/event-layouts/${EVENT_LAYOUT_ID}`, base);
const headers = { cookie: `${getAdminCookieName()}=${await createAdminSessionToken()}` };
const response = await fetch(endpoint, { headers, redirect: 'manual' });
if (!response.ok) throw new Error(`Read failed (${response.status}); no scene was published.`);
const live = await response.json(); validateEventLayout(live.scene);
if (['localhost', '127.0.0.1'].includes(base.hostname) && live.persistence !== 'local') throw new Error('Refusing a localhost publication backed by cloud storage. Use the isolated dev server.');
await writeFile(path.join(out, `before-v${live.revision}.json`), JSON.stringify(live.scene, null, 2), { flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
const { scene, conflicts } = mergeEventLayoutCandidate(baseline, candidate, live.scene);
const changed = !sameLayoutValue(scene, live.scene);
const report = { checkedAt: new Date().toISOString(), host: base.origin, expectedRevision: live.revision, name, changed, conflicts, objects: scene.objects.length, mode: options.publish ? 'publish' : 'dry-run' };
await writeFile(path.join(out, 'candidate-review.json'), JSON.stringify(report, null, 2));
await writeFile(path.join(out, 'merged-candidate.json'), JSON.stringify(scene, null, 2));
console.log(JSON.stringify(report));
if (conflicts.length) throw new Error(`Conflicting edits require review; no scene was published. See ${path.join(out, 'candidate-review.json')}`);
validateEventLayout(scene);
if (!options.publish || !changed) process.exit(0);
const saved = await fetch(endpoint, { method: 'PUT', redirect: 'manual', headers: { ...headers, 'Content-Type': 'application/json', Origin: base.origin }, body: JSON.stringify({ scene, expectedRevision: live.revision, name }) });
if (saved.status === 409) throw new Error('Another session saved after review. No overwrite or automatic retry was attempted; rerun the dry run.');
if (!saved.ok) throw new Error(`Publish returned ${saved.status}. Re-read production before retrying; the save result may be uncertain.`);
const result = await saved.json();
await writeFile(path.join(out, `published-v${result.revision}.json`), JSON.stringify(result.scene, null, 2));
await writeFile(path.join(out, 'publication-result.json'), JSON.stringify({ host: base.origin, revision: result.revision, name, updatedAt: result.updatedAt }, null, 2));
console.log(JSON.stringify({ published: true, revision: result.revision, name }));
