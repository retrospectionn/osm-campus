#!/usr/bin/env bash
# Cut a campus out of a regional OpenStreetMap extract with osmium-tool, then
# build its 3D model. No Overpass needed, and it works offline once the .pbf is downloaded.
#
#   scripts/extract-osmium.sh <region.osm.pbf> [preset-id]
#   scripts/extract-osmium.sh <region.osm.pbf> <id> <south,west,north,east>
#
# Oldenburg lies in Lower Saxony:
#   curl -LO https://download.geofabrik.de/europe/germany/niedersachsen-latest.osm.pbf
#   scripts/extract-osmium.sh niedersachsen-latest.osm.pbf oldenburg-haarentor
#
# Writes:
#   build/<id>.osm.pbf     the filtered extract
#   public/data/<id>.osm   OSM XML the viewer loads instantly for that preset
#   build/<id>.glb         the 3D model (glTF binary)
set -euo pipefail
cd "$(dirname "$0")/.."

PBF=${1:?usage: scripts/extract-osmium.sh <region.osm.pbf> [preset-id | id south,west,north,east]}
ID=${2:-oldenburg-haarentor}
BBOX=${3:-}
command -v osmium >/dev/null || { echo "osmium not found: install osmium-tool (apt install osmium-tool / brew install osmium-tool)" >&2; exit 1; }

if [[ -z "$BBOX" ]]; then
  BBOX=$(ID="$ID" node --input-type=module -e '
    const { PRESETS } = await import("./src/query.js");
    const p = PRESETS.find((p) => p.id === process.env.ID);
    if (!p) { console.error(`Unknown preset ${process.env.ID}: ${PRESETS.map((p) => p.id).join(", ")}`); process.exit(1); }
    console.log(p.bbox.join(","));')
fi
IFS=, read -r S W N E <<< "$BBOX"
mkdir -p build public/data

# 1. Clip to the box. "smart" keeps ways and multipolygons that cross the edge complete.
osmium extract --bbox "$W,$S,$E,$N" --strategy smart --set-bounds --overwrite \
  -o "build/$ID.clip.osm.pbf" "$PBF"

# 2. Keep what the model renders (mirrors campusQuery() in src/query.js).
#    Nodes referenced by kept ways/relations are included automatically.
osmium tags-filter --overwrite -o "build/$ID.osm.pbf" "build/$ID.clip.osm.pbf" \
  nwr/building nwr/building:part w/highway nwr/area:highway nwr/landuse nwr/leisure \
  nwr/natural nwr/amenity nwr/barrier nwr/man_made nwr/water nwr/waterway nwr/place=square \
  n/highway n/emergency n/advertising n/tourism n/entrance n/playground \
  n/power=pole,tower,catenary_mast n/traffic_sign n/manhole
rm -f "build/$ID.clip.osm.pbf"
osmium fileinfo --extended "build/$ID.osm.pbf" | grep -E "Number of (nodes|ways|relations)" || true

# 3. OSM XML for the viewer, then the 3D model.
osmium cat --overwrite -o "public/data/$ID.osm" "build/$ID.osm.pbf"
node scripts/build-gltf.mjs "public/data/$ID.osm" "build/$ID.glb" --bbox "$S,$W,$N,$E" --name "$ID"
