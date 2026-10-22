// Micro-mapped point features → instanced low-poly models.
// Each catalog entry matches OSM tags, picks a model variant and places one or
// more instances. Models face local +Z; `direction` tags rotate them, and
// benches/lamps without one turn toward the nearest mapped path.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { num, bearing, yawForBearing, osmColor, hash01 } from './tags.js';

// ---------- tiny modelling kit ----------
function part(g, color, [x = 0, y = 0, z = 0] = [], { rx = 0, ry = 0, rz = 0 } = {}) {
  g.deleteAttribute('uv');
  let ng = g.index ? g.toNonIndexed() : g;
  if (rx) ng.rotateX(rx);
  if (rz) ng.rotateZ(rz);
  if (ry) ng.rotateY(ry);
  ng.translate(x, y, z);
  const c = new THREE.Color(color);
  const n = ng.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  ng.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return ng;
}
const box = (w, h, d, color, at, rot) => part(new THREE.BoxGeometry(w, h, d), color, at, rot);
const cyl = (rt, rb, h, color, at, rot, seg = 10) => part(new THREE.CylinderGeometry(rt, rb, h, seg), color, at, rot);
const sph = (r, color, at, detail = 1) => part(new THREE.IcosahedronGeometry(r, detail), color, at);
const merge = (...gs) => mergeGeometries(gs, false);

const METAL = '#4a4d50', WOOD = '#9c6b3f', STEEL = '#8c9196', WHITE = '#ececec';

// A model is a list of parts: { geom, glow?, tint? }.
// `tint` parts take the per-instance colour (e.g. bench material).
const M = {
  bench: () => [
    { geom: merge(box(1.8, 0.06, 0.42, WOOD, [0, 0.45, 0.02]), box(1.8, 0.36, 0.05, WOOD, [0, 0.78, -0.2])), tint: true },
    { geom: merge(box(0.06, 0.45, 0.42, METAL, [0.8, 0.225, 0]), box(0.06, 0.45, 0.42, METAL, [-0.8, 0.225, 0]),
      box(0.05, 0.4, 0.05, METAL, [0.8, 0.65, -0.2]), box(0.05, 0.4, 0.05, METAL, [-0.8, 0.65, -0.2])) },
  ],
  benchNoBack: () => [
    { geom: box(1.8, 0.06, 0.42, WOOD, [0, 0.45, 0]), tint: true },
    { geom: merge(box(0.06, 0.45, 0.4, METAL, [0.8, 0.225, 0]), box(0.06, 0.45, 0.4, METAL, [-0.8, 0.225, 0])) },
  ],
  picnic: () => [{ geom: merge(box(1.8, 0.05, 0.8, WOOD, [0, 0.75, 0]), box(1.8, 0.05, 0.3, WOOD, [0, 0.45, 0.6]),
    box(1.8, 0.05, 0.3, WOOD, [0, 0.45, -0.6]), box(0.08, 0.75, 1.5, '#7a5230', [0.7, 0.375, 0]), box(0.08, 0.75, 1.5, '#7a5230', [-0.7, 0.375, 0])), tint: true }],
  lampPole: () => [
    { geom: merge(cyl(0.06, 0.09, 5, METAL, [0, 2.5, 0]), cyl(0.28, 0.28, 0.05, METAL, [0, 5.12, 0])) },
    { geom: cyl(0.26, 0.12, 0.2, '#fff5d6', [0, 5.0, 0]), glow: true },
  ],
  lampBent: () => [
    { geom: merge(cyl(0.06, 0.1, 6, METAL, [0, 3, 0]), box(0.06, 0.06, 1.3, METAL, [0, 6.0, 0.62])) },
    { geom: box(0.32, 0.08, 0.55, '#fff5d6', [0, 5.95, 1.2]), glow: true },
  ],
  lampBollard: () => [
    { geom: merge(cyl(0.1, 0.11, 0.85, METAL, [0, 0.425, 0]), cyl(0.12, 0.12, 0.05, METAL, [0, 1.03, 0])) },
    { geom: cyl(0.1, 0.1, 0.15, '#fff5d6', [0, 0.93, 0]), glow: true },
  ],
  lampWall: () => [
    { geom: box(0.05, 0.05, 0.35, METAL, [0, 3.15, 0]) },
    { geom: box(0.28, 0.14, 0.28, '#fff5d6', [0, 3.0, 0.25]), glow: true },
  ],
  wasteBasket: () => [{ geom: merge(cyl(0.22, 0.2, 0.75, '#3f5a3c', [0, 0.375, 0]), cyl(0.235, 0.235, 0.04, '#2d3f2b', [0, 0.77, 0])), tint: true }],
  recycling: () => [{ geom: merge(box(1.2, 1.5, 1.2, '#3e7d4f', [-1.35, 0.75, 0]), box(1.2, 1.5, 1.2, '#2f5f9e', [0, 0.75, 0]),
    box(1.2, 1.5, 1.2, '#d9a521', [1.35, 0.75, 0])) }],
  wasteDisposal: () => [{ geom: merge(box(1.4, 1.2, 1.0, '#5a6b5a', [0, 0.6, 0]), box(1.45, 0.08, 1.05, '#3e4a3e', [0, 1.24, 0])) }],
  // Sheffield stand: the U spans local Z so a row of them runs along local X.
  bikeStand: () => [{ geom: merge(cyl(0.025, 0.025, 0.8, STEEL, [0, 0.4, 0.35], {}, 6), cyl(0.025, 0.025, 0.8, STEEL, [0, 0.4, -0.35], {}, 6),
    box(0.05, 0.05, 0.75, STEEL, [0, 0.8, 0])) }],
  bollard: () => [{ geom: merge(cyl(0.09, 0.11, 0.9, '#5c5f62', [0, 0.45, 0]), cyl(0.095, 0.095, 0.06, WHITE, [0, 0.78, 0])), tint: true }],
  liftGate: () => [{ geom: merge(box(0.22, 1.0, 0.22, '#d0d0d0', [0, 0.5, 0]), box(4, 0.08, 0.08, '#c0392b', [2.1, 0.92, 0])) }],
  hydrant: () => [{ geom: merge(cyl(0.12, 0.14, 0.75, '#c0392b', [0, 0.375, 0]), sph(0.13, '#c0392b', [0, 0.78, 0], 0),
    box(0.36, 0.08, 0.08, '#a93226', [0, 0.55, 0])) }],
  hydrantSign: () => [{ geom: merge(cyl(0.03, 0.03, 1.4, '#9a9da0', [0, 0.7, 0], {}, 6), box(0.28, 0.2, 0.02, '#c0392b', [0, 1.3, 0.03]),
    box(0.24, 0.16, 0.02, WHITE, [0, 1.3, 0.045])) }],
  defibrillator: () => [{ geom: merge(cyl(0.04, 0.04, 1.1, '#9a9da0', [0, 0.55, 0], {}, 6), box(0.4, 0.45, 0.15, '#1e8449', [0, 1.3, 0])) }],
  postBox: () => [{ geom: merge(cyl(0.05, 0.05, 0.7, '#3a3a3a', [0, 0.35, 0], {}, 6), box(0.45, 0.55, 0.32, '#f2c200', [0, 0.97, 0])) }],
  vending: () => [{ geom: merge(box(0.9, 1.85, 0.75, '#b03a2e', [0, 0.925, 0]), box(0.7, 1.2, 0.02, '#2c3e50', [0, 1.1, 0.385])), tint: true }],
  ticketMachine: () => [{ geom: merge(box(0.35, 1.5, 0.3, '#2c6fbb', [0, 0.75, 0]), box(0.25, 0.3, 0.02, '#1b2631', [0, 1.2, 0.16])) }],
  parcelLocker: () => [{ geom: merge(box(2.4, 2.0, 0.6, '#d4a20f', [0, 1.0, 0]), box(0.5, 0.6, 0.02, '#2c3e50', [0, 1.2, 0.31])), tint: true }],
  drinkingWater: () => [{ geom: merge(cyl(0.15, 0.18, 1.0, '#4a7fa8', [0, 0.5, 0]), cyl(0.25, 0.2, 0.1, '#7f8c8d', [0, 1.02, 0])) }],
  bikeRepair: () => [{ geom: merge(box(0.12, 1.4, 0.12, '#2f6db5', [0, 0.7, 0]), box(0.6, 0.05, 0.05, '#2f6db5', [0, 1.3, 0]), cyl(0.05, 0.05, 0.25, '#222', [0.3, 0.12, 0], {}, 6)) }],
  charging: () => [{ geom: merge(box(0.5, 1.6, 0.35, '#e8e8e8', [0, 0.8, 0]), box(0.52, 0.2, 0.37, '#27ae60', [0, 1.4, 0])) }],
  board: () => [{ geom: merge(cyl(0.04, 0.04, 2.0, '#5d4a36', [0.6, 1.0, 0], {}, 6), cyl(0.04, 0.04, 2.0, '#5d4a36', [-0.6, 1.0, 0], {}, 6),
    box(1.4, 1.0, 0.06, '#6b4f35', [0, 1.4, 0]), box(1.3, 0.9, 0.01, '#e9e2d0', [0, 1.4, 0.035])) }],
  guidepost: () => [{ geom: merge(cyl(0.05, 0.05, 2.4, '#5d4a36', [0, 1.2, 0], {}, 6), box(0.7, 0.15, 0.03, WHITE, [0.3, 2.15, 0]),
    box(0.7, 0.15, 0.03, WHITE, [-0.3, 1.9, 0], { ry: 0.6 })) }],
  artwork: () => [{ geom: box(1.0, 0.6, 1.0, '#b8b2a8', [0, 0.3, 0]) }, { geom: part(new THREE.IcosahedronGeometry(0.7, 0), '#8c6d46', [0, 1.35, 0]), tint: true }],
  adColumn: () => [{ geom: merge(cyl(0.6, 0.6, 2.6, '#e3d9c2', [0, 1.5, 0], {}, 16), cyl(0.72, 0.66, 0.25, '#3d5c4a', [0, 2.92, 0], {}, 16),
    cyl(0.65, 0.68, 0.2, '#3d5c4a', [0, 0.1, 0], {}, 16)) }],
  billboard: () => [{ geom: merge(cyl(0.06, 0.06, 2.6, METAL, [1.2, 1.3, 0], {}, 6), cyl(0.06, 0.06, 2.6, METAL, [-1.2, 1.3, 0], {}, 6),
    box(3.2, 2.2, 0.12, '#e8e8e8', [0, 2.6, 0])) }],
  posterBox: () => [{ geom: merge(box(1.3, 2.0, 0.25, '#5a6066', [0, 1.15, 0]), box(1.15, 1.75, 0.01, '#f4f1e6', [0, 1.15, 0.13])) }],
  flagpole: () => [{ geom: cyl(0.05, 0.08, 8, '#dcdcdc', [0, 4, 0], {}, 8) }, { geom: box(1.5, 1.0, 0.02, '#c0392b', [0.78, 7.4, 0]), tint: true }],
  cameraPole: () => [{ geom: merge(cyl(0.05, 0.06, 3.2, '#7f8285', [0, 1.6, 0], {}, 6), box(0.14, 0.12, 0.35, WHITE, [0, 3.2, 0.12])) }],
  cameraWall: () => [{ geom: merge(box(0.05, 0.05, 0.2, '#7f8285', [0, 3.0, 0]), box(0.14, 0.12, 0.32, WHITE, [0, 2.95, 0.22])) }],
  trafficSignals: () => [{ geom: merge(cyl(0.06, 0.06, 3.2, '#555', [0, 1.6, 0], {}, 8), box(0.3, 0.9, 0.25, '#222', [0, 3.0, 0.15]),
    sph(0.08, '#e74c3c', [0, 3.27, 0.28], 0), sph(0.08, '#f1c40f', [0, 3.0, 0.28], 0), sph(0.08, '#2ecc71', [0, 2.73, 0.28], 0)) }],
  trafficSign: () => [{ geom: merge(cyl(0.035, 0.035, 2.3, '#aaa', [0, 1.15, 0], {}, 6), cyl(0.32, 0.32, 0.03, '#c0392b', [0, 2.2, 0.03], { rx: Math.PI / 2 }, 16),
    cyl(0.25, 0.25, 0.01, WHITE, [0, 2.2, 0.05], { rx: Math.PI / 2 }, 16)) }],
  busStop: () => [{ geom: merge(cyl(0.04, 0.04, 2.6, '#9a9da0', [0, 1.3, 0], {}, 6), box(0.45, 0.45, 0.03, '#f1c40f', [0, 2.45, 0]),
    box(0.2, 0.2, 0.01, '#1e8449', [0, 2.45, 0.02])) }],
  busShelter: () => [{ geom: merge(cyl(0.04, 0.04, 2.6, '#9a9da0', [1.8, 1.3, 0.4], {}, 6), box(0.45, 0.45, 0.03, '#f1c40f', [1.8, 2.45, 0.4]),
    box(3, 0.08, 1.5, '#5a6066', [0, 2.5, -0.3]), box(3, 2.3, 0.03, '#a8c6d6', [0, 1.25, -1.0]),
    box(0.03, 2.3, 1.4, '#a8c6d6', [1.5, 1.25, -0.35]), box(0.03, 2.3, 1.4, '#a8c6d6', [-1.5, 1.25, -0.35]), box(2, 0.05, 0.35, WOOD, [0, 0.45, -0.75])) }],
  shelter: () => [{ geom: merge(box(0.12, 2.5, 0.12, '#6b5a48', [1.4, 1.25, 1.4]), box(0.12, 2.5, 0.12, '#6b5a48', [-1.4, 1.25, 1.4]),
    box(0.12, 2.5, 0.12, '#6b5a48', [1.4, 1.25, -1.4]), box(0.12, 2.5, 0.12, '#6b5a48', [-1.4, 1.25, -1.4]), box(3.3, 0.14, 3.3, '#7b6a58', [0, 2.6, 0])) }],
  fountain: () => [{ geom: merge(cyl(1.5, 1.6, 0.5, '#b0aea7', [0, 0.25, 0], {}, 20), cyl(1.35, 1.35, 0.05, '#6fa8c8', [0, 0.48, 0], {}, 20),
    cyl(0.06, 0.16, 1.3, '#bfe0ef', [0, 1.1, 0], {}, 8)) }],
  cabinet: () => [{ geom: box(0.9, 1.2, 0.4, '#9aa39a', [0, 0.6, 0]), tint: true }],
  utilityPole: () => [{ geom: merge(cyl(0.12, 0.15, 9, '#6b4f35', [0, 4.5, 0], {}, 8), box(1.6, 0.1, 0.1, '#6b4f35', [0, 8.6, 0])) }],
  swing: () => [{ geom: merge(cyl(0.05, 0.05, 2.6, '#c0392b', [1.5, 1.2, 0.4], { rx: -0.3 }, 6), cyl(0.05, 0.05, 2.6, '#c0392b', [1.5, 1.2, -0.4], { rx: 0.3 }, 6),
    cyl(0.05, 0.05, 2.6, '#c0392b', [-1.5, 1.2, 0.4], { rx: -0.3 }, 6), cyl(0.05, 0.05, 2.6, '#c0392b', [-1.5, 1.2, -0.4], { rx: 0.3 }, 6),
    box(3.1, 0.08, 0.08, '#c0392b', [0, 2.45, 0]), box(0.45, 0.04, 0.2, '#222', [0.6, 0.45, 0]), box(0.45, 0.04, 0.2, '#222', [-0.6, 0.45, 0])) }],
  slide: () => [{ geom: merge(box(1, 0.08, 1, '#2f6db5', [0, 1.5, -1]), box(0.08, 1.5, 0.08, '#2f6db5', [0.45, 0.75, -1.45]),
    box(0.08, 1.5, 0.08, '#2f6db5', [-0.45, 0.75, -1.45]), box(0.6, 0.05, 2.4, '#f1c40f', [0, 0.78, 0.45], { rx: 0.62 })) }],
  sandpit: () => [{ geom: merge(box(3, 0.3, 3, '#a17a4f', [0, 0.15, 0]), box(2.7, 0.05, 2.7, '#e2cf9d', [0, 0.3, 0])) }],
  playEquipment: () => [{ geom: merge(box(1.6, 0.08, 1.6, '#e67e22', [0, 1.2, 0]), box(0.08, 1.2, 0.08, '#27ae60', [0.75, 0.6, 0.75]),
    box(0.08, 1.2, 0.08, '#27ae60', [-0.75, 0.6, 0.75]), box(0.08, 1.2, 0.08, '#27ae60', [0.75, 0.6, -0.75]), box(0.08, 1.2, 0.08, '#27ae60', [-0.75, 0.6, -0.75])) }],
  planter: () => [{ geom: box(1.2, 0.5, 1.2, '#8c8c84', [0, 0.25, 0]) }, { geom: sph(0.55, '#5f8f45', [0, 0.8, 0]) }],
  entrance: () => [{ geom: cyl(0.45, 0.45, 0.05, '#f1c40f', [0, 0.17, 0], {}, 12), tint: true }],
  manhole: () => [{ geom: cyl(0.35, 0.35, 0.02, '#3a3a3a', [0, 0.17, 0], {}, 12) }],
  boulder: () => [{ geom: part(new THREE.DodecahedronGeometry(0.6, 0), '#8d8a83', [0, 0.35, 0]) }],
  clock: () => [{ geom: merge(cyl(0.06, 0.06, 3, '#2c3e50', [0, 1.5, 0], {}, 8), cyl(0.32, 0.32, 0.1, '#2c3e50', [0, 3.1, 0], { rx: Math.PI / 2 }, 16),
    cyl(0.28, 0.28, 0.02, '#f5f5f5', [0, 3.1, 0.06], { rx: Math.PI / 2 }, 16)) }],
};

// ---------- catalog ----------
// group: legend section; faces: 'path' → turn toward nearest path when no direction tag.
const isLampMountBollard = (t) => /bollard|ground/.test(t.lamp_mount || '');
export const CATALOG = [
  { key: 'bench', label: 'Benches', group: 'Seating', swatch: '#9c6b3f', faces: 'path',
    match: (t) => t.amenity === 'bench' || (t.leisure === 'bench'),
    variant: (t) => (t.backrest === 'no' ? 'benchNoBack' : 'bench'),
    tint: (t) => ({ metal: '#9aa0a6', stone: '#b9b4aa', concrete: '#b9b4aa', plastic: '#4f7fbf' })[t.material] },
  { key: 'picnic_table', label: 'Picnic tables', group: 'Seating', swatch: '#7a5230',
    match: (t) => t.leisure === 'picnic_table', variant: () => 'picnic' },
  { key: 'street_lamp', label: 'Street lamps', group: 'Lighting', swatch: '#ffd38a', faces: 'path', light: true,
    match: (t) => t.highway === 'street_lamp' || t.man_made === 'street_lamp',
    variant: (t) => isLampMountBollard(t) ? 'lampBollard' : /wall/.test(t.lamp_mount || '') ? 'lampWall' : /bent|cast_steel/.test(t.lamp_mount || '') ? 'lampBent' : 'lampPole',
    scale: (t, v) => {
      const h = num(t.height);
      if (!Number.isFinite(h) || v === 'lampWall' || v === 'lampBollard') return 1;
      return Math.min(3, Math.max(0.5, h / (v === 'lampBent' ? 6 : 5)));
    } },
  { key: 'waste_basket', label: 'Waste baskets', group: 'Waste & recycling', swatch: '#3f5a3c',
    match: (t) => t.amenity === 'waste_basket', variant: () => 'wasteBasket', tint: (t) => osmColor(t.colour, null) },
  { key: 'recycling', label: 'Recycling containers', group: 'Waste & recycling', swatch: '#2f5f9e',
    match: (t) => t.amenity === 'recycling', variant: () => 'recycling' },
  { key: 'waste_disposal', label: 'Waste containers', group: 'Waste & recycling', swatch: '#5a6b5a',
    match: (t) => t.amenity === 'waste_disposal', variant: () => 'wasteDisposal' },
  { key: 'bicycle_parking', label: 'Bicycle stands', group: 'Bicycles', swatch: '#8c9196', faces: 'path',
    match: (t) => t.amenity === 'bicycle_parking', variant: () => 'bikeStand',
    // One stand per two bikes (capacity tag), laid out in a row.
    expand: (t) => {
      const cap = num(t.capacity);
      const stands = Math.max(1, Math.min(40, Math.ceil((Number.isFinite(cap) ? cap : 4) / 2)));
      return Array.from({ length: stands }, (_, i) => [(i - (stands - 1) / 2) * 1.0, 0]);
    },
    rowAlongPath: true },
  { key: 'bicycle_repair_station', label: 'Bicycle repair stations', group: 'Bicycles', swatch: '#2f6db5',
    match: (t) => t.amenity === 'bicycle_repair_station', variant: () => 'bikeRepair' },
  { key: 'bollard', label: 'Bollards', group: 'Barriers', swatch: '#5c5f62',
    match: (t) => t.barrier === 'bollard', variant: () => 'bollard', tint: (t) => osmColor(t.colour, null) },
  { key: 'lift_gate', label: 'Lift gates', group: 'Barriers', swatch: '#c0392b', faces: 'path',
    match: (t) => t.barrier === 'lift_gate', variant: () => 'liftGate' },
  { key: 'fire_hydrant', label: 'Fire hydrants', group: 'Safety', swatch: '#c0392b',
    match: (t) => t.emergency === 'fire_hydrant',
    variant: (t) => (/underground|wall|pipe/.test(t['fire_hydrant:type'] || '') ? 'hydrantSign' : 'hydrant') },
  { key: 'defibrillator', label: 'Defibrillators', group: 'Safety', swatch: '#1e8449',
    match: (t) => t.emergency === 'defibrillator' && !t.indoor && t.location !== 'indoor', variant: () => 'defibrillator' },
  { key: 'surveillance', label: 'Surveillance cameras', group: 'Safety', swatch: '#ececec',
    match: (t) => t.man_made === 'surveillance',
    variant: (t) => (/wall|ceiling|building/.test(t['surveillance:mount'] || t['camera:mount'] || '') ? 'cameraWall' : 'cameraPole') },
  { key: 'post_box', label: 'Post boxes', group: 'Services', swatch: '#f2c200',
    match: (t) => t.amenity === 'post_box', variant: () => 'postBox' },
  { key: 'vending_machine', label: 'Vending machines', group: 'Services', swatch: '#b03a2e',
    match: (t) => t.amenity === 'vending_machine',
    variant: (t) => (/parking_tickets|public_transport_tickets/.test(t.vending || '') ? 'ticketMachine' : 'vending'),
    tint: (t) => osmColor(t.colour, null) },
  { key: 'parcel_locker', label: 'Parcel lockers', group: 'Services', swatch: '#d4a20f',
    match: (t) => t.amenity === 'parcel_locker', variant: () => 'parcelLocker', tint: (t) => osmColor(t.colour, null) },
  { key: 'drinking_water', label: 'Drinking water', group: 'Services', swatch: '#4a7fa8',
    match: (t) => t.amenity === 'drinking_water' || t.amenity === 'water_point', variant: () => 'drinkingWater' },
  { key: 'charging_station', label: 'Charging stations', group: 'Services', swatch: '#27ae60',
    match: (t) => t.amenity === 'charging_station', variant: () => 'charging' },
  { key: 'information', label: 'Information boards & signposts', group: 'Signs', swatch: '#6b4f35', faces: 'path',
    match: (t) => t.tourism === 'information' && /board|map|guidepost|terminal/.test(t.information || ''),
    variant: (t) => (t.information === 'guidepost' ? 'guidepost' : 'board') },
  { key: 'advertising', label: 'Advertising columns & boards', group: 'Signs', swatch: '#e3d9c2', faces: 'path',
    match: (t) => !!t.advertising,
    variant: (t) => (t.advertising === 'column' ? 'adColumn' : t.advertising === 'poster_box' ? 'posterBox' : 'billboard') },
  { key: 'traffic_sign', label: 'Traffic signs', group: 'Signs', swatch: '#c0392b', faces: 'path',
    match: (t) => !!t.traffic_sign || t.highway === 'stop' || t.highway === 'give_way', variant: () => 'trafficSign' },
  { key: 'traffic_signals', label: 'Traffic signals', group: 'Transport', swatch: '#2ecc71', faces: 'path',
    match: (t) => t.highway === 'traffic_signals', variant: () => 'trafficSignals' },
  { key: 'bus_stop', label: 'Bus stops', group: 'Transport', swatch: '#f1c40f', faces: 'path',
    match: (t) => t.highway === 'bus_stop' || (t.public_transport === 'platform' && t.bus === 'yes'),
    variant: (t) => (t.shelter === 'yes' ? 'busShelter' : 'busStop') },
  { key: 'clock', label: 'Clocks', group: 'Signs', swatch: '#2c3e50', faces: 'path',
    match: (t) => t.amenity === 'clock' && (t.support === 'pole' || !t.support), variant: () => 'clock' },
  { key: 'shelter', label: 'Shelters', group: 'Leisure', swatch: '#7b6a58',
    match: (t) => t.amenity === 'shelter', variant: () => 'shelter' },
  { key: 'artwork', label: 'Artworks', group: 'Leisure', swatch: '#8c6d46',
    match: (t) => t.tourism === 'artwork' && !/mural|graffiti|painting/.test(t.artwork_type || ''), variant: () => 'artwork',
    tint: (t) => osmColor(t.colour, null) },
  { key: 'fountain', label: 'Fountains', group: 'Leisure', swatch: '#6fa8c8',
    match: (t) => t.amenity === 'fountain', variant: () => 'fountain' },
  { key: 'flagpole', label: 'Flagpoles', group: 'Leisure', swatch: '#dcdcdc',
    match: (t) => t.man_made === 'flagpole', variant: () => 'flagpole',
    scale: (t) => (Number.isFinite(num(t.height)) ? Math.min(3, num(t.height) / 8) : 1) },
  { key: 'playground', label: 'Playground equipment', group: 'Leisure', swatch: '#e67e22',
    match: (t) => !!t.playground,
    variant: (t) => ({ swing: 'swing', slide: 'slide', sandpit: 'sandpit' })[t.playground] || 'playEquipment' },
  { key: 'planter', label: 'Planters', group: 'Leisure', swatch: '#5f8f45',
    match: (t) => t.man_made === 'planter', variant: () => 'planter' },
  { key: 'street_cabinet', label: 'Street cabinets', group: 'Utilities', swatch: '#9aa39a', faces: 'path',
    match: (t) => t.man_made === 'street_cabinet', variant: () => 'cabinet', tint: (t) => osmColor(t.colour, null) },
  { key: 'utility_pole', label: 'Utility poles', group: 'Utilities', swatch: '#6b4f35',
    match: (t) => t.power === 'pole' || t.man_made === 'utility_pole', variant: () => 'utilityPole' },
  { key: 'manhole', label: 'Manholes', group: 'Utilities', swatch: '#3a3a3a',
    match: (t) => t.man_made === 'manhole' || !!t.manhole && !t.man_made, variant: () => 'manhole' },
  { key: 'entrance', label: 'Building entrances', group: 'Buildings', swatch: '#f1c40f',
    match: (t) => !!t.entrance && t.entrance !== 'no',
    variant: () => 'entrance', tint: (t) => (t.entrance === 'main' ? '#e67e22' : t.wheelchair === 'yes' ? '#3498db' : null) },
  { key: 'boulder', label: 'Boulders & stones', group: 'Leisure', swatch: '#8d8a83',
    match: (t) => t.natural === 'stone' || t.natural === 'boulder', variant: () => 'boulder' },
];

// ---------- nearest-path lookup for orientation ----------
const PATH_HW = new Set(['footway', 'path', 'pedestrian', 'cycleway', 'service', 'residential', 'living_street', 'steps',
  'unclassified', 'tertiary', 'secondary', 'primary', 'track', 'bridleway']);
const CELL = 12;

class PathIndex {
  constructor(lines) {
    this.grid = new Map();
    for (const l of lines) {
      if (!PATH_HW.has(l.tags.highway)) continue;
      for (let i = 0; i < l.pts.length - 1; i++) {
        const a = l.pts[i], b = l.pts[i + 1];
        const x0 = Math.floor(Math.min(a[0], b[0]) / CELL), x1 = Math.floor(Math.max(a[0], b[0]) / CELL);
        const y0 = Math.floor(Math.min(a[1], b[1]) / CELL), y1 = Math.floor(Math.max(a[1], b[1]) / CELL);
        if ((x1 - x0 + 1) * (y1 - y0 + 1) > 400) continue;
        for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
          const k = `${x},${y}`;
          if (!this.grid.has(k)) this.grid.set(k, []);
          this.grid.get(k).push([a, b]);
        }
      }
    }
  }
  // Nearest point on any path within `maxD` metres, with the segment direction.
  nearest(p, maxD = 15) {
    let best = null, bd = maxD;
    const cx = Math.floor(p[0] / CELL), cy = Math.floor(p[1] / CELL);
    for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) {
      for (const [a, b] of this.grid.get(`${x},${y}`) || []) {
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const L2 = dx * dx + dy * dy;
        if (L2 < 1e-6) continue;
        const u = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
        const q = [a[0] + u * dx, a[1] + u * dy];
        const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
        if (d < bd) { bd = d; best = { q, d, dir: [dx, dy] }; }
      }
    }
    return best;
  }
}

const bearingOf = (dx, dy) => (Math.atan2(dx, dy) * 180) / Math.PI; // dx east, dy north

// ---------- trees ----------
function treeModels() {
  const trunk = cyl(0.9, 1, 1, '#6b4f35', [0, 0.5, 0], {}, 7); // unit height/radius, scaled per tree
  const broad = sph(0.5, '#ffffff', [0, 0.5, 0], 1);
  const needle = part(new THREE.ConeGeometry(0.5, 1, 8), '#ffffff', [0, 0.5, 0]);
  return { trunk, broad, needle };
}

function treeParams(t, id, salt = 0) {
  const r = hash01(id, salt);
  const needle = t.leaf_type === 'needleleaved';
  let h = num(t.height);
  if (!Number.isFinite(h) || h <= 0) h = 7 + r * 6;
  let crown = num(t.diameter_crown);
  if (!Number.isFinite(crown) || crown <= 0) crown = needle ? h * 0.4 : h * 0.65;
  let trunkR = num(t.circumference) / (2 * Math.PI);
  if (!Number.isFinite(trunkR) || trunkR <= 0) trunkR = 0.12 + h * 0.012;
  const trunkH = needle ? h * 0.2 : h * 0.38;
  const hue = needle ? 0.33 : 0.24 + r * 0.08;
  const autumnish = t.leaf_cycle === 'deciduous' ? 0.02 : 0;
  const color = new THREE.Color().setHSL(hue - autumnish, 0.38 + r * 0.15, needle ? 0.25 : 0.32 + r * 0.08);
  return { needle, h, crown, trunkR: Math.min(trunkR, 1.2), trunkH, color };
}

function buildTrees(points, lines, mat) {
  const items = [];
  for (const f of points) if (f.tags.natural === 'tree') items.push({ p: f.p, t: f.tags, el: f.el, id: f.el.id });
  let rows = 0;
  for (const l of lines) {
    if (l.tags.natural !== 'tree_row') continue;
    rows++;
    const spacing = 8;
    let carry = 0, k = 0;
    for (let i = 0; i < l.pts.length - 1; i++) {
      const [ax, ay] = l.pts[i], [bx, by] = l.pts[i + 1];
      const L = Math.hypot(bx - ax, by - ay);
      for (let s = carry; s <= L; s += spacing) {
        items.push({ p: [ax + ((bx - ax) * s) / L, ay + ((by - ay) * s) / L], t: l.tags, el: l.el, id: l.el.id, salt: ++k });
      }
      carry = (carry - L) % spacing;
      if (carry < 0) carry += spacing;
    }
  }
  if (!items.length) return null;
  const { trunk, broad, needle } = treeModels();
  const nNeedle = items.filter((it) => it.t.leaf_type === 'needleleaved').length;
  const trunks = new THREE.InstancedMesh(trunk, mat, items.length);
  const crownsB = new THREE.InstancedMesh(broad, mat, Math.max(1, items.length - nNeedle));
  const crownsN = new THREE.InstancedMesh(needle, mat, Math.max(1, nNeedle));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
  const brown = new THREE.Color('#ffffff');
  const elsB = [], elsN = [], elsT = [];
  let ib = 0, inn = 0;
  items.forEach((it, i) => {
    const tp = treeParams(it.t, it.id, it.salt || 0);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), hash01(it.id, 7 + (it.salt || 0)) * Math.PI * 2);
    m.compose(v.set(it.p[0], 0, -it.p[1]), q, s.set(tp.trunkR, tp.trunkH + tp.h * 0.1, tp.trunkR));
    trunks.setMatrixAt(i, m); trunks.setColorAt(i, brown); elsT.push(it.el);
    const ch = tp.h - tp.trunkH;
    m.compose(v.set(it.p[0], tp.trunkH, -it.p[1]), q, s.set(tp.crown, ch, tp.crown));
    if (tp.needle) { crownsN.setMatrixAt(inn, m); crownsN.setColorAt(inn, tp.color); elsN[inn++] = it.el; }
    else { crownsB.setMatrixAt(ib, m); crownsB.setColorAt(ib, tp.color); elsB[ib++] = it.el; }
  });
  crownsB.count = ib; crownsN.count = inn;
  const group = new THREE.Group();
  for (const [mesh, els] of [[trunks, elsT], [crownsB, elsB], [crownsN, elsN]]) {
    if (!mesh.count) continue;
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.pick = (hit) => els[hit.instanceId];
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  const single = items.length - items.filter((it) => it.salt).length;
  return { object: group, count: items.length, detail: `${single} single trees, ${rows} tree rows` };
}

// ---------- main builder ----------
export function buildFurniture(points, lines) {
  const stdMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
  const glowMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 0.15 });
  const paths = new PathIndex(lines);
  const models = {};
  const getModel = (name) => (models[name] ||= M[name]());

  const byEntry = new Map();
  const unmatched = new Map();
  const TALLY_KEYS = ['amenity', 'leisure', 'man_made', 'highway', 'barrier', 'emergency', 'tourism', 'natural', 'power', 'shop', 'playground', 'office'];
  for (const f of points) {
    const t = f.tags;
    if (t.natural === 'tree') continue;
    const entry = CATALOG.find((e) => e.match(t));
    if (!entry) {
      const k = TALLY_KEYS.find((key) => t[key]);
      if (k) unmatched.set(`${k}=${t[k]}`, (unmatched.get(`${k}=${t[k]}`) || 0) + 1);
      continue;
    }
    if (!byEntry.has(entry.key)) byEntry.set(entry.key, { entry, items: [] });
    byEntry.get(entry.key).items.push(f);
  }

  const layers = [];
  const lamps = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);
  const WHITE_C = new THREE.Color('#ffffff');

  for (const { entry, items } of byEntry.values()) {
    // variant → list of instances
    const byVariant = new Map();
    let inferred = 0;
    for (const f of items) {
      const t = f.tags;
      const variant = entry.variant(t);
      let deg = bearing(t.direction ?? t['camera:direction']);
      let note = null;
      let near = null;
      if (entry.faces === 'path' || entry.rowAlongPath) near = paths.nearest(f.p);
      if (deg == null && near && entry.rowAlongPath) {
        deg = bearingOf(near.dir[0], near.dir[1]) + 90; // stands perpendicular to the row
        note = 'Row orientation inferred from the nearest path';
      } else if (deg == null && near && entry.faces === 'path' && near.d > 0.3) {
        deg = bearingOf(near.q[0] - f.p[0], near.q[1] - f.p[1]);
        note = 'No direction tag – turned toward the nearest path';
      } else if (deg == null && near && entry.faces === 'path') {
        deg = bearingOf(near.dir[0], near.dir[1]); // node sits on the path: face along it
        note = 'No direction tag – aligned with the path it sits on';
      }
      if (note) inferred++;
      if (deg == null) deg = hash01(f.el.id, 3) * 360;
      const yaw = yawForBearing(deg);
      const s = entry.scale ? entry.scale(t, variant) : 1;
      const tintHex = entry.tint ? entry.tint(t) : null;
      const tint = tintHex ? (tintHex.isColor ? tintHex : new THREE.Color(tintHex)) : WHITE_C;
      const offsets = entry.expand ? entry.expand(t) : [[0, 0]];
      if (!byVariant.has(variant)) byVariant.set(variant, []);
      const el = note ? { ...f.el, notes: [note] } : f.el;
      for (const [ox, oz] of offsets) {
        // rotate local offset (x right, z front) by yaw into world
        const wx = f.p[0] + ox * Math.cos(yaw) + oz * Math.sin(yaw);
        const wz = -f.p[1] - ox * Math.sin(yaw) + oz * Math.cos(yaw);
        byVariant.get(variant).push({ wx, wz, yaw, s, tint, el });
      }
      if (entry.light) lamps.push({ wx: f.p[0], wz: -f.p[1], h: variant === 'lampBollard' ? 1 : variant === 'lampWall' ? 3 : 5 * s, t });
    }

    const group = new THREE.Group();
    group.name = entry.key;
    for (const [variant, insts] of byVariant) {
      for (const prt of getModel(variant)) {
        const mesh = new THREE.InstancedMesh(prt.geom, prt.glow ? glowMat : stdMat, insts.length);
        const els = [];
        insts.forEach((it, i) => {
          q.setFromAxisAngle(Y, it.yaw);
          m4.compose(pos.set(it.wx, 0, it.wz), q, scl.set(it.s, it.s, it.s));
          mesh.setMatrixAt(i, m4);
          mesh.setColorAt(i, prt.tint ? it.tint : WHITE_C);
          els.push(it.el);
        });
        mesh.castShadow = !prt.glow;
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        mesh.userData.pick = (hit) => els[hit.instanceId];
        group.add(mesh);
      }
    }
    const count = items.length;
    const extra = entry.key === 'bicycle_parking'
      ? `${byVariant.get('bikeStand')?.length ?? 0} stands from capacity tags`
      : inferred ? `${inferred} oriented by nearest path` : '';
    layers.push({ key: entry.key, label: entry.label, group: entry.group, swatch: entry.swatch, count, detail: extra, object: group });
  }

  const trees = buildTrees(points, lines, stdMat);
  if (trees) layers.push({ key: 'trees', label: 'Trees', group: 'Vegetation', swatch: '#5f8f45', count: trees.count, detail: trees.detail, object: trees.object });

  // Night-time light pools under each lamp.
  let pools = null;
  if (lamps.length) {
    const tex = radialTexture();
    const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: '#ffc37a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.85 });
    pools = new THREE.InstancedMesh(g, mat, lamps.length);
    lamps.forEach((l, i) => {
      const r = Math.max(3, l.h * 2.4);
      m4.compose(pos.set(l.wx, 0.2, l.wz), q.identity(), scl.set(r, 1, r));
      pools.setMatrixAt(i, m4);
    });
    pools.renderOrder = 2;
    pools.visible = false;
    pools.computeBoundingSphere();
  }

  const unmodelled = [...unmatched.entries()].sort((a, b) => b[1] - a[1]);
  return { layers, glowMat, pools, unmodelled };
}

function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.35, 'rgba(255,255,255,0.35)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
