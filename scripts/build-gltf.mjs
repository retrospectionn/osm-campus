// Build a 3D campus model (.glb) from OSM data, without a browser.
//   node scripts/build-gltf.mjs <input.osm|input.json> [output.glb] [--bbox s,w,n,e] [--name "…"]
// Input: OSM XML (osmium, JOSM, openstreetmap.org export) or Overpass JSON.
// The bounding box defaults to the file's <bounds> (osmium --set-bounds), else the node extent.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, dirname } from 'node:path';

// GLTFExporter reads its output through FileReader, which Node lacks.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then((b) => { this.result = b; this.onloadend?.(); }); }
  readAsDataURL(blob) {
    blob.arrayBuffer().then((b) => {
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${Buffer.from(b).toString('base64')}`;
      this.onloadend?.();
    });
  }
};

const { parseOsm, boundsOf } = await import('../src/osm.js');
const { buildCampus } = await import('../src/model.js');
const { campusToGlb } = await import('../src/export.js');

const args = process.argv.slice(2);
const opt = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const bboxArg = opt('--bbox');
const nameArg = opt('--name');
const [input, outArg] = args;
if (!input) {
  console.error('Usage: node scripts/build-gltf.mjs <input.osm|input.json> [output.glb] [--bbox s,w,n,e] [--name "Campus"]');
  process.exit(1);
}

const t0 = Date.now();
const osm = parseOsm(await readFile(input, 'utf8'));
const bbox = bboxArg ? bboxArg.split(',').map(Number) : boundsOf(osm);
if (!bbox || bbox.length !== 4 || !bbox.every(Number.isFinite)) throw new Error('No usable bounding box; pass --bbox s,w,n,e');
const name = nameArg || basename(input).replace(/\.(osm|json|xml)$/i, '');
const out = outArg || `build/${name}.glb`;

const campus = buildCampus(osm, bbox);
const glb = await campusToGlb(campus, { name, source: basename(input) });
await mkdir(dirname(out), { recursive: true });
await writeFile(out, Buffer.from(glb));

console.log(`${input}: ${osm.nodes.size} nodes, ${osm.ways.size} ways, ${osm.relations.length} relations`);
for (const l of campus.layers) console.log(`  ${l.key.padEnd(24)} ${l.count}`);
console.log(`→ ${out} (${(glb.byteLength / 1e6).toFixed(2)} MB, origin ${campus.origin.lat.toFixed(6)}, ${campus.origin.lon.toFixed(6)}) in ${Date.now() - t0} ms`);
