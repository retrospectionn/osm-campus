// SYNTHETIC test data in Overpass JSON format, used only by the smoke test so
// the renderer can be exercised without network access. It is not real OSM
// data and does not depict any real campus.
const LAT0 = 53.147, LON0 = 8.1808;
const M_LAT = 1 / 110570, M_LON = 1 / (111320 * Math.cos(LAT0 * Math.PI / 180));

export function syntheticCampus() {
  const elements = [];
  let nid = 1, wid = 1;
  const node = (x, y, tags) => {
    const id = nid++;
    elements.push({ type: 'node', id, lat: LAT0 + y * M_LAT, lon: LON0 + x * M_LON, ...(tags ? { tags } : {}) });
    return id;
  };
  const way = (pts, tags, close = false) => {
    const ids = pts.map(([x, y]) => node(x, y));
    if (close) ids.push(ids[0]);
    const id = wid++;
    elements.push({ type: 'way', id, nodes: ids, ...(tags ? { tags } : {}) });
    return id;
  };
  const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

  way(rect(-300, -250, 600, 500), { amenity: 'university', name: 'Synthetic Test Campus' }, true);
  way(rect(-280, 120, 200, 110), { leisure: 'park' }, true);
  way(rect(150, 140, 80, 50), { natural: 'water' }, true);
  way(rect(120, -230, 150, 80), { amenity: 'parking', surface: 'asphalt' }, true);
  way(rect(-60, -40, 120, 60), { highway: 'pedestrian', area: 'yes', surface: 'paving_stones' }, true);

  // Buildings: plain, coloured, with levels, and one made of parts.
  way(rect(-250, -200, 90, 40), { building: 'university', 'building:levels': '4', name: 'Lecture Hall A', ref: 'A1' }, true);
  way(rect(-120, -200, 60, 60), { building: 'university', height: '22', 'building:colour': 'brown', 'roof:colour': 'grey', name: 'Library' }, true);
  way(rect(80, -60, 100, 50), { building: 'yes', name: 'Parts Building' }, true);
  way(rect(80, -60, 50, 50), { 'building:part': 'yes', 'building:levels': '2' }, true);
  way(rect(130, -60, 50, 50), { 'building:part': 'yes', 'building:levels': '7', 'building:colour': '#b0503c' }, true);
  way(rect(-250, 40, 30, 20), { building: 'roof', 'building:levels': '1' }, true);
  // Courtyard building as a multipolygon with a hole.
  const outer = way(rect(-200, -120, 80, 60), null, true);
  const inner = way(rect(-180, -105, 40, 30), null, true);
  elements.push({ type: 'relation', id: 1, members: [{ type: 'way', ref: outer, role: 'outer' }, { type: 'way', ref: inner, role: 'inner' }],
    tags: { type: 'multipolygon', building: 'university', 'building:levels': '3', name: 'Courtyard Building' } });

  // Paths and roads with surfaces.
  way([[-300, 0], [300, 0]], { highway: 'footway', surface: 'paving_stones', width: '4' });
  way([[0, -250], [0, 250]], { highway: 'cycleway', surface: 'asphalt' });
  way([[-300, -240], [300, -240]], { highway: 'residential', surface: 'asphalt', lanes: '2' });
  way([[-100, 100], [-50, 150], [20, 160], [100, 120]], { highway: 'path', surface: 'fine_gravel' });
  way([[40, 40], [60, 40]], { highway: 'steps' });

  way([[-280, 235], [280, 235]], { barrier: 'fence', height: '1.8' });
  way([[-280, 110], [-80, 110]], { barrier: 'hedge' });
  way([[-80, -130], [60, -130]], { barrier: 'wall' });

  way([[-280, 10], [280, 10]], { natural: 'tree_row', leaf_type: 'broadleaved' });
  for (let i = 0; i < 40; i++) {
    node(-260 + (i % 10) * 20, 140 + Math.floor(i / 10) * 20, { natural: 'tree', leaf_type: i % 3 ? 'broadleaved' : 'needleleaved', ...(i % 4 ? {} : { height: '18', diameter_crown: '12', circumference: '2.1' }) });
  }

  // Street furniture along the main footway.
  for (let x = -280; x <= 280; x += 30) {
    node(x, -4, { highway: 'street_lamp', lamp_mount: x % 60 ? 'straight_mast' : 'bent_mast', height: x % 90 ? undefined : '6' });
    node(x + 10, 4, { amenity: 'bench', backrest: x % 60 ? 'yes' : 'no', ...(x % 90 ? {} : { direction: 'S', material: 'metal' }) });
    node(x + 14, 4, { amenity: 'waste_basket' });
  }
  node(-40, 3, { highway: 'street_lamp', lamp_mount: 'bollard' });
  node(20, -30, { amenity: 'bicycle_parking', bicycle_parking: 'stands', capacity: '16' });
  node(-20, -30, { amenity: 'bicycle_parking', capacity: '8' });
  node(0, -120, { barrier: 'bollard' }); node(2, -120, { barrier: 'bollard', colour: 'red' });
  node(0, -238, { barrier: 'lift_gate' });
  node(30, 5, { emergency: 'fire_hydrant', 'fire_hydrant:type': 'pillar' });
  node(60, 5, { emergency: 'fire_hydrant', 'fire_hydrant:type': 'underground' });
  node(-60, -45, { amenity: 'post_box' });
  node(-50, -45, { amenity: 'vending_machine', vending: 'drinks' });
  node(140, -235, { amenity: 'vending_machine', vending: 'parking_tickets' });
  node(-30, 60, { tourism: 'artwork', artwork_type: 'sculpture', name: 'Test Sculpture' });
  node(10, 60, { advertising: 'column' });
  node(-10, 20, { tourism: 'information', information: 'board' });
  node(5, 20, { tourism: 'information', information: 'guidepost' });
  node(50, 25, { man_made: 'flagpole' });
  node(70, 25, { man_made: 'surveillance', 'surveillance:type': 'camera' });
  node(250, -244, { highway: 'bus_stop', shelter: 'yes', bench: 'yes', name: 'Test Stop' });
  node(-200, -246, { highway: 'traffic_signals' });
  node(-180, -246, { traffic_sign: 'DE:274' });
  node(0, 0, { amenity: 'drinking_water' });
  node(40, -20, { amenity: 'bicycle_repair_station' });
  node(140, -150, { amenity: 'charging_station' });
  node(-100, 60, { amenity: 'fountain' });
  node(100, 60, { leisure: 'picnic_table' });
  node(-150, 60, { amenity: 'shelter' });
  node(200, 60, { man_made: 'street_cabinet' });
  node(220, 60, { amenity: 'recycling', recycling_type: 'container' });
  node(-200, 200, { playground: 'swing' }); node(-180, 200, { playground: 'slide' }); node(-160, 200, { playground: 'sandpit' });
  node(-220, -201, { entrance: 'main' }); node(-150, -201, { entrance: 'yes', wheelchair: 'yes' });
  node(10, 10, { man_made: 'manhole', manhole: 'sewer' });
  node(-80, 20, { amenity: 'clock', support: 'pole' });
  node(-90, -45, { amenity: 'cafe', name: 'Unmodelled Café' });
  return { version: 0.6, generator: 'osm-campus synthetic fixture', elements };
}
