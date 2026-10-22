# osm-campus

Building a 3D version of the campus using micromapped OSM data.

An in-browser three.js viewer that turns OpenStreetMap data for a university
campus into a navigable 3D model. It is set up for the **Carl von Ossietzky
Universität Oldenburg** (campuses Haarentor and Wechloy) but works for any
area up to 4 km².

It goes beyond extruded buildings. Every micro-mapped object becomes a small
3D model, placed where it is mapped and shaped by its tags:

| OSM tags | Rendered as |
|---|---|
| `amenity=bench` (+ `direction`, `backrest`, `material`) | Bench facing its mapped direction, or the nearest path if untagged |
| `highway=street_lamp` (+ `lamp_mount`, `height`) | Mast, bent-mast, bollard or wall lamp; glows with light pools in night mode |
| `natural=tree` (+ `height`, `diameter_crown`, `circumference`, `leaf_type`) / `natural=tree_row` | Trees sized from their tags; conifer or broadleaf crown |
| `amenity=bicycle_parking` (+ `capacity`) | A row of stands, one per two bikes, aligned with the nearest path |
| `emergency=fire_hydrant` (+ `fire_hydrant:type`), `emergency=defibrillator` | Pillar hydrant or hydrant sign; AED box |
| `amenity=waste_basket`, `recycling`, `waste_disposal` | Bins and containers |
| `barrier=bollard`, `lift_gate`; barrier lines `fence`, `wall`, `hedge`, … | Bollards, gates, fences, walls and hedges at their mapped height |
| `tourism=information`, `advertising=*`, `traffic_sign`, `highway=traffic_signals`, `highway=bus_stop` (+ `shelter`) | Boards, guideposts, advertising columns, signs, signals, bus shelters |
| `amenity=post_box`, `vending_machine`, `parcel_locker`, `drinking_water`, `charging_station`, `bicycle_repair_station`, `clock` | Service furniture |
| `tourism=artwork`, `amenity=fountain`, `man_made=flagpole`, `playground=*`, `man_made=planter`, `amenity=shelter` | Leisure and decorative objects |
| `man_made=street_cabinet`, `surveillance`, `manhole`, `power=pole`, `entrance=*` | Utilities, cameras, manholes and building entrances |
| `building`, `building:part` (Simple 3D Buildings) | Extruded with `height` / `building:levels`, `min_height`, `building:colour`, `roof:colour`; outlines with parts are replaced by their parts |
| `highway=*` with `width` / `surface` | Paths and roads at their mapped width, coloured by surface (`paving_stones`, `asphalt`, `fine_gravel`, …) |
| `landuse`, `leisure`, `natural=water`, `amenity=parking`, `area:highway` | Ground surfaces |

Click any object to see its OSM tags, open it on openstreetmap.org or in the
editor, or drop to street level next to it. The panel counts each layer, gives
furniture and tree density per hectare, and lists the point features that are
mapped but have no model yet. That list shows what to add to the catalogue next.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173 loads Campus Haarentor live from Overpass
```

The data loads in your browser from the public Overpass API, with mirror
fallback. Other ways to load it:

- **Another campus:** pick it from the list. On start the app looks up the
  `amenity=university` areas around Oldenburg and adds their real extents.
  You can also type a bounding box, or open `/?bbox=s,w,n,e&name=…`.
- **A file:** open or drag in an `.osm` file (JOSM, or "Export" on
  openstreetmap.org) or an Overpass Turbo JSON export.
- **Offline snapshot:** `npm run fetch-data` saves each preset to
  `public/data/<id>.json`. The viewer then loads that file instead of querying
  Overpass. To snapshot a custom area, run
  `npm run fetch-data -- my-campus 53.14,8.17,53.15,8.19`.

`npm run build` writes a static site to `dist/` that can be hosted anywhere.

## 3D model files with osmium (glTF / GLB)

The same model can be saved as a **glTF 2.0 binary (`.glb`)** that opens in
Blender, Unity, Unreal, CesiumJS, QGIS 3D, Windows 3D Viewer or
[gltf-viewer.donmccurdy.com](https://gltf-viewer.donmccurdy.com/).

- **In the browser:** the *Download .glb* button exports whatever is loaded.
- **From an OSM extract with [osmium-tool](https://osmcode.org/osmium-tool/):**
  no Overpass needed, reproducible, and works offline once the extract is
  downloaded.

```bash
# osmium-tool: apt install osmium-tool | brew install osmium-tool | conda install -c conda-forge osmium-tool
curl -LO https://download.geofabrik.de/europe/germany/niedersachsen-latest.osm.pbf
npm run extract -- niedersachsen-latest.osm.pbf oldenburg-haarentor
npm run extract -- niedersachsen-latest.osm.pbf oldenburg-wechloy
npm run extract -- niedersachsen-latest.osm.pbf my-area 53.14,8.17,53.15,8.19   # any box (s,w,n,e)
```

`scripts/extract-osmium.sh` runs three steps:

1. `osmium extract --strategy smart --set-bounds` clips the regional extract
   to the campus box. Buildings, paths and multipolygons that cross the edge
   stay complete.
2. `osmium tags-filter` keeps only what the model renders, using the same tag
   list as the Overpass query.
3. `osmium cat` writes `public/data/<id>.osm`, which the viewer then loads
   instantly for that campus. `scripts/build-gltf.mjs` writes
   `build/<id>.glb`.

`npm run gltf -- some.osm out.glb` converts any OSM XML or Overpass JSON file
directly, for example a JOSM save or an openstreetmap.org export.

What is in the `.glb`:

- One node group per layer (`buildings`, `paths`, `trees`, `bench`,
  `street_lamp`, …), with vertex colours and one material. Lamp heads use a
  separate emissive material.
- Each building is its own node, named after the building (e.g.
  `Library (way 7)`). Its OSM id and all its tags are stored in glTF `extras`,
  so Blender shows them as custom properties.
- Coordinates are metres from the bbox centre, with +X east, +Y up and −Z
  north. The origin lat/lon, bbox and ODbL attribution are in the scene
  `extras`, which lets the model be georeferenced in Cesium or QGIS.
- Instanced furniture is baked into plain meshes, so it opens in any glTF
  tool without extensions.

## Tests

`npm run smoke` renders the viewer in headless Chromium and checks that every
layer builds and that the *Download .glb* button produces a valid GLB. It uses a **synthetic** fixture from `test/fixture.mjs`, not real
OSM data, and needs a Playwright Chromium: either
`npx playwright install chromium`, or set `CHROMIUM_PATH`.

`npm run test:pipeline` converts the same synthetic fixture to `.osm.pbf` and
runs it through the osmium script. It then reloads the `.glb` with three.js
and checks the layer groups, the building tags and the attribution. It needs
`osmium` on your PATH.

## Code map

```
src/query.js      Overpass queries, campus presets, mirror fallback
src/osm.js        OSM JSON/XML parsing, multipolygon assembly, local metric projection
src/buildings.js  Simple 3D Buildings extrusion → one merged mesh
src/ground.js     Surfaces, path/road ribbons, waterways, barrier walls
src/furniture.js  Catalogue of micro-mapping models → InstancedMesh per type; trees
src/model.js      Runs all builders → one scene graph (shared by browser and CLI)
src/export.js     Scene → glTF binary: bakes instances, one node per building
src/main.js       Scene, lighting, day/night, picking, panels, .glb download
scripts/extract-osmium.sh  osmium extract + tags-filter → .osm snapshot + .glb
scripts/build-gltf.mjs     OSM XML / Overpass JSON → .glb in Node
scripts/fetch-osm.mjs      Overpass → public/data/<id>.json snapshot
```

Each feature type is one entry in `CATALOG` (`src/furniture.js`) with a tag
matcher, a model variant and optional tint and scale. Adding a type takes
about ten lines. Instancing keeps thousands of objects to a few draw calls.

## Examples of campuses mapped in detail

- **Oldenburg itself.** In 2015 a mapper used OSM-generated 3D views of
  Campus Wechloy, rendered with F4map, in a university print publication
  ([OSM diary](https://api.openstreetmap.org/user/artus70/diary/35043)). The
  building modelling already existed in OSM then. Load the campus here to see
  how far the street-level micro-mapping goes today. The summary panel
  measures it.
- **Universitat Jaume I (Castellón).** Geospatial Technologies master's
  students surveyed 250 campus lamp posts with the Every Door app. They
  uploaded them to OSM with their attributes, then used the data to find
  dark spots on campus
  ([UN Mappers](https://maps.un.org/news/un-mapper-month-december-2025)).
- **Binghamton University.** A planned import of the campus tree survey, with
  species, trunk diameter, height and condition per tree, went through
  community review first
  ([OSM wiki](https://wiki.openstreetmap.org/wiki/Binghamton_University_Department_of_Geography)).
- **Cambridge.** Coverage varies: some colleges are mapped down to individual
  trees, while others are only a perimeter outline.
- **How-tos:** the [Micromapping wiki page](https://wiki.openstreetmap.org/wiki/Micromapping)
  lists the tags, and Mapzen's [campus mapping guide](https://mapzen.com/blog/targeted-editing-campus-mapping/)
  covers the workflow.

To improve a campus, survey with **Every Door** or **StreetComplete** on a
phone, and use **iD** or **JOSM** for building heights and `building:part`.

## 3D tools for an OSM digital campus

| Tool | Good for | Notes |
|---|---|---|
| **three.js** (used here) | Full control over custom geometry, instancing, lighting, post-processing | Low-level; you write the OSM→mesh code yourself, as in this repo |
| **react-three-fiber** | The same, written as React components | Good when the twin is part of a larger React app |
| **Babylon.js** | Batteries-included engine: physics, GUI, WebXR, inspector | Heavier than three.js, with more built in |
| **CesiumJS** | Globe-scale, terrain, 3D Tiles, georeferenced BIM/photogrammetry | Best when campus models must sit on real terrain next to other city data |
| **deck.gl** + **MapLibre GL JS** | Data layers over a basemap (sensors, occupancy, heatmaps) | MapLibre `fill-extrusion` gives quick 3D buildings; deck.gl adds instanced scenegraph layers |
| **OSM Buildings** | Drop-in 3D buildings from OSM | Buildings only, no street furniture |
| **Streets GL**, **F4map** | Ready-made 3D OSM viewers | Good for comparison; hard to customise |
| **OSM2World** | Offline conversion of OSM, street furniture included, to glTF/OBJ | Pre-bake a campus into glTF and load it into any engine |
| **Blender** + blender-osm / BlenderGIS | Hand-finished, high-fidelity models and renders | Manual pipeline; export glTF for the web |
| **Unity / Unreal** (+ Cesium plugins) | Simulation, VR walkthroughs, game-engine digital twins | Native apps; much heavier deployment |

A practical path: prototype in three.js from live OSM (this repo). Then bake
stable geometry to glTF with `npm run extract` (osmium) or OSM2World. Move to Cesium or
deck.gl only when you need terrain, 3D Tiles or live data overlays.

## Limitations and next steps

- Roofs are flat. `roof:shape` (gabled, hipped, …) is not modelled yet, but
  the extra height from `roof:height` is included.
- Terrain is flat. Oldenburg is nearly level, but hilly campuses need a DEM.
- There is no indoor (`indoor=*`) or level-aware rendering yet.
- Instances and models are simple primitives. Swap in glTF models per catalog
  entry for realism.

Map data © OpenStreetMap contributors, available under the
[ODbL](https://www.openstreetmap.org/copyright).
