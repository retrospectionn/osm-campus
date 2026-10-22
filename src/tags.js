// Small helpers for reading OSM tag values.
import * as THREE from 'three';

export function num(v) {
  if (v == null) return NaN;
  const m = String(v).replace(',', '.').match(/-?\d+(\.\d+)?/);
  if (!m) return NaN;
  const n = parseFloat(m[0]);
  return /ft|'/.test(String(v)) ? n * 0.3048 : n;
}

const CARDINAL = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };

// OSM `direction` → bearing in degrees clockwise from north, or null.
export function bearing(v) {
  if (v == null) return null;
  const s = String(v).trim().split(/[;-]/)[0].toUpperCase();
  if (s in CARDINAL) return CARDINAL[s];
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

// Rotation about Y that turns a model's local +Z ("front") to face `deg`.
// World axes: +X east, −Z north.
export function yawForBearing(deg) {
  return Math.PI - (deg * Math.PI) / 180;
}

const colorCache = new Map();
export function osmColor(v, fallback) {
  if (!v) return fallback;
  const key = String(v).trim().toLowerCase().replace(/[_ ]/g, '');
  if (colorCache.has(key)) return colorCache.get(key) ?? fallback;
  let c = null;
  const named = { lightgrey: '#d3d3d3', darkgrey: '#5a5a5a', brick: '#a0522d', sandstone: '#d8c39a', cream: '#f3ead2' };
  const css = named[key] || (/^[0-9a-f]{6}$/.test(key) ? `#${key}` : key);
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(css) || /^[a-z]+$/.test(css)) {
    const probe = new THREE.Color(0x123456);
    const orig = console.warn;
    console.warn = () => {};
    probe.setStyle(css);
    console.warn = orig;
    if (probe.getHex() !== 0x123456) c = probe;
  }
  colorCache.set(key, c);
  return c ?? fallback;
}

// Stable pseudo-random value in [0, 1) per OSM id, for subtle variation.
export function hash01(id, salt = 0) {
  let h = (Math.imul(id % 2147483647, 2654435761) + Math.imul(salt, 40503)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
