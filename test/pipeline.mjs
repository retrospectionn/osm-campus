// End-to-end check of the osmium → glTF pipeline on the SYNTHETIC fixture:
// fixture → OSM XML → .osm.pbf (osmium cat) → scripts/extract-osmium.sh → .glb,
// then reloads the .glb with three's GLTFLoader and checks its contents.
// Usage: npm run test:pipeline   (needs osmium-tool on PATH)
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { syntheticCampus } from './fixture.mjs';

const dir = 'build/test';
await mkdir(dir, { recursive: true });

const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const tagsXml = (t = {}) => Object.entries(t).filter(([, v]) => v != null).map(([k, v]) => `<tag k="${esc(k)}" v="${esc(v)}"/>`).join('');
const xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<osm version="0.6" generator="osm-campus synthetic fixture">'];
for (const e of syntheticCampus().elements) {
  const common = `id="${e.id}" version="1" timestamp="2026-01-01T00:00:00Z"`;
  if (e.type === 'node') xml.push(`<node ${common} lat="${e.lat.toFixed(7)}" lon="${e.lon.toFixed(7)}">${tagsXml(e.tags)}</node>`);
  if (e.type === 'way') xml.push(`<way ${common}>${e.nodes.map((r) => `<nd ref="${r}"/>`).join('')}${tagsXml(e.tags)}</way>`);
  if (e.type === 'relation') xml.push(`<relation ${common}>${e.members.map((m) => `<member type="${m.type}" ref="${m.ref}" role="${m.role}"/>`).join('')}${tagsXml(e.tags)}</relation>`);
}
xml.push('</osm>');
await writeFile(`${dir}/fixture.osm`, xml.join('\n'));
// osmium extract needs sorted input (Geofabrik files already are).
execFileSync('osmium', ['sort', '--overwrite', '-o', `${dir}/fixture.osm.pbf`, `${dir}/fixture.osm`]);

// Clip a box smaller than the fixture so the "smart" strategy is exercised.
const bbox = '53.1452,8.1778,53.1488,8.1838';
execFileSync('bash', ['scripts/extract-osmium.sh', `${dir}/fixture.osm.pbf`, 'pipeline-test', bbox], { stdio: 'inherit' });

const buf = await readFile('build/pipeline-test.glb');
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const gltf = await new GLTFLoader().parseAsync(ab, '');
const groups = Object.fromEntries(gltf.scene.children.map((c) => [c.name, c]));
let tris = 0;
gltf.scene.traverse((o) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; });
const buildings = groups.buildings?.children ?? [];
console.log(`glb: ${(buf.length / 1e6).toFixed(2)} MB, ${tris.toLocaleString()} triangles, groups: ${Object.keys(groups).join(', ')}`);
console.log(`buildings: ${buildings.map((b) => b.name).join(' | ')}`);

const problems = [];
for (const k of ['buildings', 'paths', 'trees', 'bench', 'street_lamp']) if (!groups[k]) problems.push(`missing group ${k}`);
if (!buildings.some((b) => b.userData?.osm?.startsWith('way/') && b.userData.tags?.name === 'Library')) problems.push('Library building lost its OSM extras');
if (!gltf.scene.userData?.attribution?.includes('OpenStreetMap')) problems.push('missing attribution');
if (!groups.street_lamp?.getObjectByName('street_lamp_light')) problems.push('missing emissive lamp heads');
await rmPublicSnapshot();
console.log(problems.length ? `PIPELINE FAILED:\n  ${problems.join('\n  ')}` : 'PIPELINE OK');
process.exit(problems.length ? 1 : 0);

async function rmPublicSnapshot() {
  // The extract script writes the viewer snapshot; don't leave test data in public/.
  const { rm } = await import('node:fs/promises');
  await rm('public/data/pipeline-test.osm', { force: true });
}
