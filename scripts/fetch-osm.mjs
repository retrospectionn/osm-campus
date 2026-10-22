// Snapshot a campus from Overpass into public/data/<id>.json so the viewer
// loads it instantly and offline. Usage:
//   npm run fetch-data                      # all presets
//   npm run fetch-data -- oldenburg-wechloy # one preset
//   npm run fetch-data -- my-campus 53.14,8.17,53.15,8.19
import { writeFile, mkdir } from 'node:fs/promises';
import { PRESETS, campusQuery, fetchOverpass, bboxAreaKm2 } from '../src/query.js';

const [id, bboxArg] = process.argv.slice(2);
let targets = PRESETS;
if (id && bboxArg) targets = [{ id, name: id, bbox: bboxArg.split(',').map(Number) }];
else if (id) targets = PRESETS.filter((p) => p.id === id);
if (!targets.length) {
  console.error(`Unknown preset "${id}". Known: ${PRESETS.map((p) => p.id).join(', ')}`);
  process.exit(1);
}

await mkdir(new URL('../public/data/', import.meta.url), { recursive: true });
for (const t of targets) {
  console.log(`${t.id}: ${bboxAreaKm2(t.bbox).toFixed(2)} km², querying Overpass…`);
  const { json, source } = await fetchOverpass(campusQuery(t.bbox), { onStatus: (s) => console.log('  ' + s) });
  const file = new URL(`../public/data/${t.id}.json`, import.meta.url);
  await writeFile(file, JSON.stringify(json));
  console.log(`  ${json.elements.length} elements from ${source} → public/data/${t.id}.json`);
}
