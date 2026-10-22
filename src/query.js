// Overpass access: campus presets, query builders and a fetch with mirror fallback.
// Plain module (no three.js) so scripts/fetch-osm.mjs can reuse it under Node.

export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

// Fallback boxes (south, west, north, east) used when campus discovery fails.
// They are hand-picked approximations; discovery replaces them with the real
// extents of the amenity=university polygons in OSM.
export const PRESETS = [
  {
    id: 'oldenburg-haarentor',
    name: 'Uni Oldenburg – Campus Haarentor',
    bbox: [53.1435, 8.1735, 53.1505, 8.1880],
  },
  {
    id: 'oldenburg-wechloy',
    name: 'Uni Oldenburg – Campus Wechloy',
    bbox: [53.1495, 8.1595, 53.1555, 8.1705],
  },
];

// Area around Oldenburg searched for amenity=university polygons.
export const DISCOVERY_BBOX = [53.10, 8.12, 53.20, 8.28];

export function discoveryQuery(bbox = DISCOVERY_BBOX, namePattern = 'Oldenburg|Ossietzky') {
  return `[out:json][timeout:25];
(
  way["amenity"="university"]["name"~"${namePattern}",i](${bbox.join(',')});
  relation["amenity"="university"]["name"~"${namePattern}",i](${bbox.join(',')});
);
out tags bb;`;
}

// Everything a street-level model needs: buildings and parts, surfaces,
// paths, barriers and every node-level object (furniture, trees, lamps…).
export function campusQuery(bbox) {
  return `[out:json][timeout:120][maxsize:268435456][bbox:${bbox.join(',')}];
(
  nwr["building"];
  nwr["building:part"];
  way["highway"];
  nwr["area:highway"];
  nwr["landuse"];
  nwr["leisure"];
  nwr["natural"];
  nwr["amenity"];
  nwr["barrier"];
  nwr["man_made"];
  nwr["water"];
  nwr["waterway"];
  nwr["place"="square"];
  node["highway"];
  node["emergency"];
  node["advertising"];
  node["tourism"];
  node["entrance"];
  node["playground"];
  node["power"~"pole|tower|catenary_mast"];
  node["traffic_sign"];
  node["manhole"];
);
(._;>;);
out body qt;`;
}

export function bboxAreaKm2([s, w, n, e]) {
  const kx = 111.32 * Math.cos(((s + n) / 2) * Math.PI / 180);
  return Math.abs(n - s) * 110.57 * Math.abs(e - w) * kx;
}

export function padBbox([s, w, n, e], metres) {
  const dLat = metres / 110570;
  const dLon = metres / (111320 * Math.cos(((s + n) / 2) * Math.PI / 180));
  return [s - dLat, w - dLon, n + dLat, e + dLon];
}

export async function fetchOverpass(query, { signal, onStatus = () => {}, endpoints = OVERPASS_ENDPOINTS } = {}) {
  const errors = [];
  for (const url of endpoints) {
    const host = new URL(url).host;
    onStatus(`Querying ${host}…`);
    try {
      const res = await fetch(url, {
        method: 'POST',
        body: new URLSearchParams({ data: query }),
        signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.remark && /error|timed out|runtime/i.test(json.remark) && !json.elements?.length) {
        throw new Error(json.remark);
      }
      return { json, source: host };
    } catch (err) {
      if (signal?.aborted) throw err;
      errors.push(`${host}: ${err.message}`);
    }
  }
  throw new Error(`All Overpass servers failed (${errors.join('; ')})`);
}
