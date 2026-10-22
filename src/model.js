// OSM data → three.js scene graph. Shared by the browser viewer (src/main.js)
// and the command-line glTF builder (scripts/build-gltf.mjs).
import * as THREE from 'three';
import { makeProjection, extractFeatures } from './osm.js';
import { buildBuildings } from './buildings.js';
import { buildAreas, buildPaths, buildBarriers } from './ground.js';
import { buildFurniture } from './furniture.js';

export function buildCampus(osm, bbox) {
  const [s, w, n, e] = bbox;
  const proj = makeProjection((s + n) / 2, (w + e) / 2);
  const feats = extractFeatures(osm, proj);

  const root = new THREE.Group();
  root.name = 'campus';
  const layers = [];
  const add = (layer) => { layer.object.name = layer.key; root.add(layer.object); layers.push(layer); };

  const areas = buildAreas(feats.polygons);
  if (areas.mesh) add({ key: 'areas', label: 'Surfaces', group: 'Base', swatch: '#9cbf72', count: areas.count, detail: 'grass, water, parking, plazas', object: areas.mesh });
  const paths = buildPaths(feats.lines);
  if (paths.mesh) {
    const c = paths.counts;
    const foot = (c.footway || 0) + (c.path || 0) + (c.pedestrian || 0) + (c.steps || 0) + (c.cycleway || 0);
    add({ key: 'paths', label: 'Paths & roads', group: 'Base', swatch: '#c4b7a6', count: paths.count, detail: `${foot} footways, paths & cycleways, drawn at mapped width/surface`, object: paths.mesh });
  }
  const barriers = buildBarriers(feats.lines);
  if (barriers.mesh) {
    const top = Object.entries(barriers.counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${v} ${k}`).join(', ');
    add({ key: 'barriers', label: 'Fences, walls & hedges', group: 'Base', swatch: '#55803f', count: barriers.count, detail: top, object: barriers.mesh });
  }
  const bld = buildBuildings(feats.polygons);
  if (bld.mesh) {
    add({ key: 'buildings', label: 'Buildings', group: 'Base', swatch: '#d8d0c2', count: bld.count, detail: bld.hiddenOutlines ? `${bld.hiddenOutlines} outlines replaced by building:part` : '', object: bld.mesh });
  }
  const furn = buildFurniture(feats.points, feats.lines);
  for (const l of furn.layers) add(l);

  const p0 = proj.project(s, w), p1 = proj.project(n, e);
  const extent = Math.max(p1[0] - p0[0], p1[1] - p0[1], 200);
  return {
    root, layers, labels: bld.labels, glowMat: furn.glowMat, pools: furn.pools, unmodelled: furn.unmodelled, extent,
    origin: { lat: proj.lat0, lon: proj.lon0 }, bbox,
  };
}
