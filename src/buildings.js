// building=* and building:part=* → one merged, vertex-coloured mesh.
// Follows the Simple 3D Buildings scheme: height, min_height, building:levels,
// building:min_level, roof:height/levels, building:colour, roof:colour.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { num, osmColor, hash01 } from './tags.js';
import { pointInRing, ringCentroid } from './osm.js';
import { PickRanges, triangleCount } from './pick.js';

const LEVEL_H = 3.2;
const LOW = new Set(['garage', 'garages', 'shed', 'kiosk', 'carport', 'hut', 'container', 'toilets', 'bicycle_shed', 'service', 'transformer_tower']);
const TALL_DEFAULT = new Set(['university', 'school', 'office', 'commercial', 'college', 'public', 'hospital', 'dormitory', 'apartments', 'research']);

const WALL_DEFAULT = new THREE.Color('#d8d0c2');
const ROOF_DEFAULT = new THREE.Color('#8f8a83');

function heights(t) {
  const roofH = Number.isFinite(num(t['roof:height'])) ? num(t['roof:height'])
    : Number.isFinite(num(t['roof:levels'])) ? num(t['roof:levels']) * 2.6 : 0;
  let h = num(t.height);
  if (!Number.isFinite(h)) {
    const lv = num(t['building:levels']);
    const kind = t.building || t['building:part'];
    if (Number.isFinite(lv)) h = lv * LEVEL_H + roofH;
    else if (kind === 'roof') h = 4;
    else if (LOW.has(kind)) h = 3;
    else h = (TALL_DEFAULT.has(kind) ? 3 : 2) * LEVEL_H + roofH;
  }
  let min = num(t.min_height);
  if (!Number.isFinite(min)) {
    const ml = num(t['building:min_level']);
    min = Number.isFinite(ml) ? ml * LEVEL_H : (t.building === 'roof' || t['building:part'] === 'roof') ? Math.max(0, h - 0.6) : 0;
  }
  if (h - min < 0.3) h = min + 0.3;
  return { h, min };
}

function toShape(outer, holes) {
  const shape = new THREE.Shape(outer.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
  return shape;
}

function bbox(ring) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const [x, y] of ring) { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }
  return [a, b, c, d];
}

export function buildBuildings(polygons) {
  const parts = [], outlines = [];
  for (const p of polygons) {
    const t = p.tags;
    if (t['building:part'] && t['building:part'] !== 'no') parts.push(p);
    else if (t.building && t.building !== 'no') outlines.push(p);
  }
  // Outlines that contain building:part areas are drawn by their parts.
  const partCentroids = parts.map((p) => ringCentroid(p.outer));
  const visible = parts.slice();
  let hiddenOutlines = 0;
  for (const o of outlines) {
    const [a, b, c, d] = bbox(o.outer);
    const covered = partCentroids.some(([x, y]) => x >= a && x <= c && y >= b && y <= d && pointInRing([x, y], o.outer));
    if (covered) hiddenOutlines++; else visible.push(o);
  }

  const geoms = [];
  const picks = new PickRanges();
  const labels = [];
  let tri = 0;
  for (const p of visible) {
    const t = p.tags;
    if (t.location === 'underground' || t.building === 'underground') continue;
    const { h, min } = heights(t);
    let g;
    try {
      g = new THREE.ExtrudeGeometry(toShape(p.outer, p.holes), { depth: h - min, bevelEnabled: false, curveSegments: 1 });
    } catch { continue; }
    if (!g.attributes.position || g.attributes.position.count === 0) continue;
    g.translate(0, 0, min);
    g.rotateX(-Math.PI / 2);

    const v = 0.94 + hash01(p.el.id) * 0.1;
    const wall = osmColor(t['building:colour'] || t.colour, WALL_DEFAULT).clone().multiplyScalar(v);
    const roof = osmColor(t['roof:colour'], ROOF_DEFAULT).clone().multiplyScalar(v);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (const grp of g.groups) {
      const c = grp.materialIndex === 0 ? roof : wall;
      for (let i = grp.start; i < grp.start + grp.count; i++) col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.clearGroups();
    geoms.push(g);
    tri += triangleCount(g);
    picks.push(tri, p.el);

    if (t.name && !t['building:part']) {
      const [x, y] = ringCentroid(p.outer);
      labels.push({ text: t.name, ref: t.ref, position: new THREE.Vector3(x, h + 2, -y) });
    }
  }

  if (!geoms.length) return { mesh: null, count: 0, hiddenOutlines, labels };
  const merged = mergeGeometries(geoms, false);
  geoms.forEach((g) => g.dispose());
  merged.computeBoundingSphere();
  const mesh = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.pick = (hit) => picks.find(hit.faceIndex);
  return { mesh, count: visible.length, hiddenOutlines, labels };
}
