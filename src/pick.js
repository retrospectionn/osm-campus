// Maps triangle indices of a merged geometry back to the OSM element they came from.
export class PickRanges {
  constructor() { this.ends = []; this.els = []; }
  push(endTriangle, el) { this.ends.push(endTriangle); this.els.push(el); }
  find(faceIndex) {
    let lo = 0, hi = this.ends.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (faceIndex < this.ends[mid]) hi = mid; else lo = mid + 1;
    }
    return this.els[lo];
  }
}

export function triangleCount(geom) {
  return (geom.index ? geom.index.count : geom.attributes.position.count) / 3;
}
