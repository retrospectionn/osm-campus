// Flat and low features: surfaces (grass, water, parking, plazas), paths and
// roads drawn at their mapped width and surface, waterways and barriers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { num, osmColor } from './tags.js';
import { PickRanges, triangleCount } from './pick.js';
import { ringArea } from './osm.js';

const C = (hex) => new THREE.Color(hex);

export const SURFACE_COLORS = {
  asphalt: C('#6d7073'), paving_stones: C('#b49d8a'), sett: C('#8f857c'), cobblestone: C('#8a8279'),
  unhewn_cobblestone: C('#867d73'), concrete: C('#b0aea7'), 'concrete:plates': C('#b0aea7'), paved: C('#9a9893'),
  bricks: C('#a86650'), gravel: C('#c6b896'), fine_gravel: C('#cdbf9f'), compacted: C('#bfae8c'),
  pebblestone: C('#bdb5a5'), ground: C('#9a8462'), dirt: C('#9a8462'), earth: C('#9a8462'), unpaved: C('#ab9877'),
  grass: C('#8fb46a'), grass_paver: C('#95ad75'), sand: C('#ddc999'), wood: C('#9c7a55'), metal: C('#8a8d90'),
  tartan: C('#b5523b'), artificial_turf: C('#5fa35a'), rubber: C('#6b5a5a'), woodchips: C('#8b6b47'),
};
const surfaceColor = (t, fallback) => SURFACE_COLORS[t.surface] || fallback;

// ---------- areas ----------
function areaStyle(t) {
  const water = C('#6fa8c8');
  if (t.amenity === 'university' || t.amenity === 'college' || t.amenity === 'school') return { c: C('#dcd8ca'), y: 0.01 };
  if (t.landuse === 'education') return { c: C('#dcd8ca'), y: 0.008 };
  if (t.landuse === 'residential' || t.landuse === 'commercial' || t.landuse === 'retail') return { c: C('#d6d2c8'), y: 0.005 };
  if (t.natural === 'water' || t.water || t.landuse === 'basin' || t.landuse === 'reservoir' || t.leisure === 'swimming_pool') return { c: water, y: 0.04 };
  if (t.natural === 'wetland') return { c: C('#8fb3a0'), y: 0.035 };
  if (t.natural === 'wood' || t.landuse === 'forest') return { c: C('#6f9a52'), y: 0.03 };
  if (t.natural === 'scrub' || t.natural === 'heath') return { c: C('#86a35e'), y: 0.032 };
  if (t.landuse === 'flowerbed') return { c: C('#c48ea2'), y: 0.055 };
  if (t.leisure === 'pitch' || t.leisure === 'track') return { c: surfaceColor(t, C('#7fb069')), y: 0.05 };
  if (t.leisure === 'playground') return { c: surfaceColor(t, C('#dcc58c')), y: 0.05 };
  if (['grass', 'meadow', 'village_green', 'recreation_ground', 'cemetery', 'allotments'].includes(t.landuse)
    || ['park', 'garden', 'common', 'dog_park'].includes(t.leisure) || t.natural === 'grassland') return { c: C('#9cbf72'), y: 0.025 };
  if (t.natural === 'sand' || t.natural === 'beach') return { c: C('#ddc999'), y: 0.03 };
  if (t.landuse === 'construction' || t.landuse === 'brownfield') return { c: C('#c2a98a'), y: 0.02 };
  if (t.amenity === 'parking_space') return { c: surfaceColor(t, C('#b5b5ae')), y: 0.07 };
  if (t.amenity === 'parking' || t.landuse === 'garages' || t.amenity === 'bicycle_parking' || t.amenity === 'motorcycle_parking') {
    return { c: surfaceColor(t, C('#a3a39e')), y: 0.065 };
  }
  if (t['area:highway'] || (t.highway && t.area === 'yes') || t.place === 'square' || t.amenity === 'marketplace') {
    return { c: surfaceColor(t, t['area:highway'] === 'footway' || t.highway === 'pedestrian' ? C('#c4b7a6') : C('#8b8d8f')), y: 0.075 };
  }
  if (t.surface && (t.amenity || t.leisure || t.man_made)) return { c: surfaceColor(t, C('#b8b2a6')), y: 0.06 };
  return null;
}

export function buildAreas(polygons) {
  const items = [];
  for (const p of polygons) {
    if (p.tags.building || p.tags['building:part']) continue;
    const s = areaStyle(p.tags);
    if (s) items.push({ p, s, a: ringArea(p.outer) });
  }
  // Smaller areas sit a hair above larger ones of the same kind.
  items.sort((a, b) => a.s.y - b.s.y || b.a - a.a);
  const geoms = [], picks = new PickRanges();
  let tri = 0, rank = 0;
  for (const { p, s } of items) {
    const shape = new THREE.Shape(p.outer.map(([x, y]) => new THREE.Vector2(x, y)));
    for (const h of p.holes) shape.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
    let g;
    try { g = new THREE.ShapeGeometry(shape, 1); } catch { continue; }
    if (!g.index || g.index.count === 0) continue;
    g.deleteAttribute('uv');
    g.rotateX(-Math.PI / 2);
    g.translate(0, s.y + (rank++ % 50) * 0.0004, 0);
    paint(g, s.c);
    geoms.push(g);
    tri += triangleCount(g);
    picks.push(tri, p.el);
  }
  return finish(geoms, picks, { roughness: 1 }, items.length, { receive: true });
}

// ---------- paths & roads ----------
const ROAD = {
  motorway: [12, '#6d7073', 0.10], trunk: [11, '#6d7073', 0.10], primary: [10, '#6d7073', 0.10],
  secondary: [9, '#6d7073', 0.10], tertiary: [7.5, '#6d7073', 0.10], unclassified: [6, '#6d7073', 0.10],
  residential: [6, '#6d7073', 0.10], living_street: [5, '#8f857c', 0.10], service: [4, '#74777a', 0.11],
  pedestrian: [5, '#c4b7a6', 0.115], track: [3, '#bfae8c', 0.12], busway: [6, '#6d7073', 0.10],
  cycleway: [2.5, '#a96c5c', 0.13], footway: [2.2, '#c4b7a6', 0.14], path: [1.6, '#bfae8c', 0.14],
  bridleway: [2, '#bfae8c', 0.14], steps: [2, '#a8a39b', 0.16], platform: [3, '#b0aea7', 0.15],
};
const SKIP_HW = new Set(['construction', 'proposed', 'abandoned', 'razed', 'corridor', 'elevator', 'raceway']);

function roadStyle(t) {
  if (!t.highway || SKIP_HW.has(t.highway)) return null;
  if (t.tunnel && t.tunnel !== 'no') return null;
  if (t.indoor === 'yes' || t.level && num(t.level) !== 0 && !t.bridge) return null;
  const def = ROAD[t.highway] || ROAD[t.highway.replace('_link', '')] || [3, '#9a9893', 0.12];
  let w = num(t.width);
  if (!Number.isFinite(w)) w = num(t.est_width);
  if (!Number.isFinite(w) && Number.isFinite(num(t.lanes)) && def[0] >= 5) w = num(t.lanes) * 3.2;
  if (!Number.isFinite(w) || w <= 0) w = def[0];
  if (t.highway === 'service' && t.service === 'parking_aisle') w = Math.min(w, 5);
  let y = def[2];
  if (t.bridge && t.bridge !== 'no') y += 0.5 + Math.max(0, num(t.layer) || 1) * 0.3;
  return { w: Math.min(w, 30), c: surfaceColor(t, C(def[1])), y };
}

// Two-sided strip around a polyline, with clamped miter joins.
function ribbonInto(pts, w, y, color, pos, col) {
  const n = pts.length;
  const L = [], Rr = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const d1 = i > 0 ? unit(p, pts[i - 1]) : null;
    const d2 = i < n - 1 ? unit(pts[i + 1], p) : null;
    const a = d1 || d2, b = d2 || d1;
    if (!a) return;
    let tx = a[0] + b[0], ty = a[1] + b[1];
    const tl = Math.hypot(tx, ty);
    if (tl < 1e-6) { tx = a[0]; ty = a[1]; } else { tx /= tl; ty /= tl; }
    const nx = -ty, ny = tx;
    const miter = Math.min(3, 1 / Math.max(0.33, nx * -a[1] + ny * a[0]));
    const o = (w / 2) * miter;
    L.push([p[0] + nx * o, p[1] + ny * o]);
    Rr.push([p[0] - nx * o, p[1] - ny * o]);
  }
  for (let i = 0; i < n - 1; i++) {
    quad(pos, col, color, y, L[i], Rr[i], Rr[i + 1], L[i + 1]);
  }
}

function unit(a, b) {
  const dx = a[0] - b[0], dy = a[1] - b[1];
  const l = Math.hypot(dx, dy);
  return l < 1e-6 ? null : [dx / l, dy / l];
}

// Up-facing quad in world space; (east, north) → (x, −z).
function quad(pos, col, c, y, a, b, cc, d) {
  for (const p of [a, b, cc, a, cc, d]) {
    pos.push(p[0], y, -p[1]);
    col.push(c.r, c.g, c.b);
  }
}

export function buildPaths(lines) {
  const items = [];
  for (const l of lines) {
    const s = roadStyle(l.tags);
    if (s) items.push({ l, s });
  }
  items.sort((a, b) => a.s.y - b.s.y);
  const pos = [], col = [], picks = new PickRanges();
  const counts = {};
  for (const { l, s } of items) {
    ribbonInto(dedupe(l.pts), s.w, s.y, s.c, pos, col);
    picks.push(pos.length / 9, l.el);
    counts[l.tags.highway] = (counts[l.tags.highway] || 0) + 1;
  }
  // Waterways reuse the ribbon builder.
  const WATER = { river: 15, canal: 8, stream: 1.5, ditch: 1.5, drain: 1.2 };
  let waterways = 0;
  for (const l of lines) {
    const t = l.tags;
    if (!t.waterway || !(t.waterway in WATER) || (t.tunnel && t.tunnel !== 'no')) continue;
    const w = Number.isFinite(num(t.width)) ? num(t.width) : WATER[t.waterway];
    ribbonInto(dedupe(l.pts), w, 0.045, C('#6fa8c8'), pos, col);
    picks.push(pos.length / 9, l.el);
    waterways++;
  }
  if (!pos.length) return { mesh: null, count: 0, counts };
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }));
  mesh.receiveShadow = true;
  mesh.userData.pick = (hit) => picks.find(hit.faceIndex);
  return { mesh, count: items.length + waterways, counts };
}

function dedupe(pts) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const a = out[out.length - 1], b = pts[i];
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 0.05) out.push(b);
  }
  return out;
}

// ---------- barriers ----------
const BARRIER = {
  fence: [1.5, 0.06, '#6e6a62'], wall: [2.0, 0.3, '#a59a8b'], retaining_wall: [1.0, 0.4, '#9f9a90'],
  city_wall: [4, 1, '#a59a8b'], hedge: [1.3, 0.9, '#55803f'], guard_rail: [0.75, 0.12, '#b5b8bb'],
  handrail: [1.0, 0.05, '#9a9da0'], cable_barrier: [0.8, 0.05, '#9a9da0'], jersey_barrier: [0.8, 0.6, '#c8c6c0'],
  railing: [1.0, 0.05, '#7f8285'],
};
const SKIP_BARRIER = new Set(['kerb', 'ditch', 'border_control', 'toll_booth']);

export function buildBarriers(lines) {
  const geoms = [], picks = new PickRanges();
  let tri = 0, count = 0;
  const counts = {};
  for (const l of lines) {
    const t = l.tags;
    if (!t.barrier || SKIP_BARRIER.has(t.barrier)) continue;
    const def = BARRIER[t.barrier] || [1.2, 0.1, '#8a867e'];
    const h = Number.isFinite(num(t.height)) ? num(t.height) : def[0];
    const c = osmColor(t.colour, C(def[2]));
    const segs = [];
    for (let i = 0; i < l.pts.length - 1; i++) {
      const [x1, y1] = l.pts[i], [x2, y2] = l.pts[i + 1];
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len < 0.05) continue;
      const b = new THREE.BoxGeometry(len + def[1], h, def[1]);
      b.deleteAttribute('uv');
      b.rotateY(Math.atan2(y2 - y1, x2 - x1));
      b.translate((x1 + x2) / 2, h / 2, -(y1 + y2) / 2);
      segs.push(b);
    }
    if (!segs.length) continue;
    const g = segs.length === 1 ? segs[0] : mergeGeometries(segs, false);
    paint(g, c);
    geoms.push(g);
    tri += triangleCount(g);
    picks.push(tri, l.el);
    count++;
    counts[t.barrier] = (counts[t.barrier] || 0) + 1;
  }
  const res = finish(geoms, picks, { roughness: 0.9 }, count, { cast: true, receive: true });
  res.counts = counts;
  return res;
}

// ---------- shared ----------
function paint(g, c) {
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
}

function finish(geoms, picks, mat, count, { cast = false, receive = false } = {}) {
  if (!geoms.length) return { mesh: null, count: 0 };
  const merged = mergeGeometries(geoms, false);
  geoms.forEach((g) => g.dispose());
  merged.computeBoundingSphere();
  const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, ...mat }));
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  mesh.userData.pick = (hit) => picks.find(hit.faceIndex);
  return { mesh, count };
}
