// OSM data → projected features (polygons, lines, points) in local metres.
// Accepts Overpass JSON or OSM XML (JOSM / openstreetmap.org export).

const R = 6378137;
const DEG = Math.PI / 180;

export function makeProjection(lat0, lon0) {
  const k = Math.cos(lat0 * DEG);
  return {
    lat0, lon0,
    // [east, north] in metres from the origin
    project: (lat, lon) => [(lon - lon0) * DEG * R * k, (lat - lat0) * DEG * R],
  };
}

export function parseOsm(input) {
  if (typeof input === 'string') {
    const trimmed = input.trimStart();
    if (trimmed.startsWith('<')) return parseXml(trimmed);
    input = JSON.parse(trimmed);
  }
  if (!Array.isArray(input?.elements)) throw new Error('Not an OSM/Overpass document: no "elements" array');
  return index(input.elements);
}

function parseXml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('Could not parse OSM XML');
  const tagsOf = (el) => {
    const t = {};
    for (const tag of el.getElementsByTagName('tag')) t[tag.getAttribute('k')] = tag.getAttribute('v');
    return t;
  };
  const elements = [];
  for (const n of doc.getElementsByTagName('node')) {
    elements.push({ type: 'node', id: +n.getAttribute('id'), lat: +n.getAttribute('lat'), lon: +n.getAttribute('lon'), tags: tagsOf(n) });
  }
  for (const w of doc.getElementsByTagName('way')) {
    elements.push({ type: 'way', id: +w.getAttribute('id'), nodes: [...w.getElementsByTagName('nd')].map((nd) => +nd.getAttribute('ref')), tags: tagsOf(w) });
  }
  for (const r of doc.getElementsByTagName('relation')) {
    elements.push({
      type: 'relation', id: +r.getAttribute('id'), tags: tagsOf(r),
      members: [...r.getElementsByTagName('member')].map((m) => ({ type: m.getAttribute('type'), ref: +m.getAttribute('ref'), role: m.getAttribute('role') })),
    });
  }
  return index(elements);
}

function index(elements) {
  const nodes = new Map(), ways = new Map(), relations = [];
  for (const el of elements) {
    if (el.type === 'node') nodes.set(el.id, el);
    else if (el.type === 'way') ways.set(el.id, el);
    else if (el.type === 'relation') relations.push(el);
  }
  return { nodes, ways, relations };
}

export function boundsOf(osm) {
  let s = Infinity, w = Infinity, n = -Infinity, e = -Infinity;
  for (const nd of osm.nodes.values()) {
    if (nd.lat < s) s = nd.lat; if (nd.lat > n) n = nd.lat;
    if (nd.lon < w) w = nd.lon; if (nd.lon > e) e = nd.lon;
  }
  return Number.isFinite(s) ? [s, w, n, e] : null;
}

const AREA_KEYS = ['building', 'building:part', 'landuse', 'leisure', 'amenity', 'area:highway', 'water', 'place', 'man_made', 'natural'];
const LINEAR_NATURAL = new Set(['tree_row', 'coastline', 'cliff', 'ridge', 'arete']);
const LINEAR_MAN_MADE = new Set(['embankment', 'cutline', 'pipeline', 'dyke', 'breakwater', 'groyne']);

function isAreaWay(tags) {
  if (tags.area === 'no') return false;
  if (tags.area === 'yes') return true;
  if (tags.barrier && !tags.building) return false; // closed fences stay lines
  if (tags.highway && !tags['area:highway']) return false;
  if (tags.natural && LINEAR_NATURAL.has(tags.natural)) return false;
  if (tags.man_made && LINEAR_MAN_MADE.has(tags.man_made)) return false;
  return AREA_KEYS.some((k) => tags[k] && tags[k] !== 'no');
}

// Join way node lists sharing end points into closed rings.
function stitch(lists) {
  const pool = lists.filter((l) => l.length > 1).map((l) => l.slice());
  const rings = [];
  while (pool.length) {
    let ring = pool.shift();
    let progress = true;
    while (ring[0] !== ring[ring.length - 1] && progress) {
      progress = false;
      for (let i = 0; i < pool.length; i++) {
        const w = pool[i], head = ring[0], end = ring[ring.length - 1];
        if (w[0] === end) ring = ring.concat(w.slice(1));
        else if (w[w.length - 1] === end) ring = ring.concat(w.slice(0, -1).reverse());
        else if (w[w.length - 1] === head) ring = w.concat(ring.slice(1));
        else if (w[0] === head) ring = w.slice().reverse().concat(ring.slice(1));
        else continue;
        pool.splice(i, 1);
        progress = true;
        break;
      }
    }
    if (ring.length >= 4 && ring[0] === ring[ring.length - 1]) rings.push(ring);
  }
  return rings;
}

export function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function ringCentroid(ring) {
  let x = 0, y = 0;
  const n = ring.length;
  for (const p of ring) { x += p[0]; y += p[1]; }
  return [x / n, y / n];
}

export function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return Math.abs(a / 2);
}

// Returns { polygons, lines, points } with coordinates as [east, north].
// Every feature keeps `el` = { type, id, tags } for inspection and OSM links.
export function extractFeatures(osm, proj) {
  const P = (id) => {
    const n = osm.nodes.get(id);
    return n ? proj.project(n.lat, n.lon) : null;
  };
  const coords = (ids) => {
    const out = [];
    for (const id of ids) { const p = P(id); if (p) out.push(p); }
    return out;
  };
  const openRing = (pts) => {
    const r = pts.slice();
    const a = r[0], b = r[r.length - 1];
    if (r.length > 1 && a[0] === b[0] && a[1] === b[1]) r.pop();
    return r;
  };

  const polygons = [], lines = [], points = [];
  const memberOfAreaRelation = new Set();

  for (const rel of osm.relations) {
    const t = rel.tags || {};
    if (t.type !== 'multipolygon' && t.type !== 'boundary') continue;
    if (t.type === 'boundary' && !t.amenity) continue;
    const outers = [], inners = [];
    for (const m of rel.members || []) {
      if (m.type !== 'way') continue;
      const way = osm.ways.get(m.ref);
      if (!way) continue;
      (m.role === 'inner' ? inners : outers).push(way.nodes);
      // An untagged outer way is just geometry for the relation.
      if (m.role !== 'inner' && !hasMeaningfulTags(way.tags)) memberOfAreaRelation.add(way.id);
    }
    const outerRings = stitch(outers).map((r) => openRing(coords(r))).filter((r) => r.length >= 3);
    const innerRings = stitch(inners).map((r) => openRing(coords(r))).filter((r) => r.length >= 3);
    const el = { type: 'relation', id: rel.id, tags: t };
    const polys = outerRings.map((outer) => ({ el, tags: t, outer, holes: [] }));
    for (const inner of innerRings) {
      const host = polys.find((p) => pointInRing(inner[0], p.outer));
      if (host) host.holes.push(inner);
    }
    polygons.push(...polys);
  }

  for (const way of osm.ways.values()) {
    const t = way.tags || {};
    if (!hasMeaningfulTags(t) || memberOfAreaRelation.has(way.id)) continue;
    const el = { type: 'way', id: way.id, tags: t };
    const pts = coords(way.nodes);
    if (pts.length < 2) continue;
    const closed = way.nodes.length > 3 && way.nodes[0] === way.nodes[way.nodes.length - 1];
    if (closed && isAreaWay(t)) {
      polygons.push({ el, tags: t, outer: openRing(pts), holes: [] });
    } else {
      lines.push({ el, tags: t, pts });
    }
  }

  for (const n of osm.nodes.values()) {
    if (!n.tags || !hasMeaningfulTags(n.tags)) continue;
    points.push({ el: { type: 'node', id: n.id, tags: n.tags }, tags: n.tags, p: proj.project(n.lat, n.lon) });
  }

  return { polygons, lines, points };
}

const META_KEYS = new Set(['source', 'created_by', 'note', 'fixme', 'FIXME', 'description', 'check_date', 'survey:date']);
function hasMeaningfulTags(tags) {
  if (!tags) return false;
  for (const k in tags) if (!META_KEYS.has(k) && !k.startsWith('source:') && !k.startsWith('check_date')) return true;
  return false;
}
