import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { PRESETS, campusQuery, discoveryQuery, fetchOverpass, bboxAreaKm2, padBbox } from './query.js';
import { parseOsm, boundsOf } from './osm.js';
import { buildCampus } from './model.js';
import { campusToGlb } from './export.js';

const $ = (id) => document.getElementById(id);
const MAX_KM2 = 4;

// ---------- renderer & scene ----------
const container = $('viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
container.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
Object.assign(labelRenderer.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
container.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.3, 8000);
camera.position.set(0, 500, 600);

const controls = new MapControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI / 2 - 0.03;
controls.minDistance = 2;
controls.maxDistance = 3000;

const hemi = new THREE.HemisphereLight('#dfe9f3', '#7d7a6c', 1.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff3df', 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.4;
scene.add(sun, sun.target);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#c9c5b6', roughness: 1 }));
ground.receiveShadow = true;
scene.add(ground);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.9, 0.5, 0.8);
bloom.enabled = false;
composer.addPass(bloom);
composer.addPass(new OutputPass());

const marker = new THREE.Mesh(
  new THREE.RingGeometry(0.9, 1.3, 32).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: '#ff5a36', depthTest: false, transparent: true, opacity: 0.95 }),
);
marker.renderOrder = 10;
marker.visible = false;
scene.add(marker);

// ---------- state ----------
let model = null; // { root, layers, glowMat, pools, labels, extent }
const prefs = { night: false, labels: true, shadows: true };
let loadToken = 0;
let abort = null;

// ---------- campus list ----------
const campusSelect = $('campus');
let campusOptions = PRESETS.map((p) => ({ ...p, approx: true }));
function renderCampusOptions(selectedId) {
  campusSelect.innerHTML = '';
  for (const c of campusOptions) {
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = c.approx ? `${c.name} (approx. area)` : c.name;
    campusSelect.append(o);
  }
  if (selectedId && campusOptions.some((c) => c.id === selectedId)) campusSelect.value = selectedId;
}

async function discoverCampuses() {
  try {
    const { json } = await fetchOverpass(discoveryQuery());
    const found = (json.elements || [])
      .filter((e) => e.bounds)
      .map((e) => {
        const b = e.bounds;
        const bbox = padBbox([b.minlat, b.minlon, b.maxlat, b.maxlon], 40);
        return { id: `${e.type}-${e.id}`, name: e.tags?.name || `${e.type} ${e.id}`, bbox, km2: bboxAreaKm2(bbox), osm: `${e.type}/${e.id}` };
      })
      .filter((c) => c.km2 <= MAX_KM2)
      .sort((a, b) => b.km2 - a.km2);
    if (!found.length) return;
    for (const c of found) c.name = `${c.name} · ${(c.km2 * 100).toFixed(0)} ha`;
    const current = campusSelect.value;
    campusOptions = [...found, ...PRESETS.map((p) => ({ ...p, approx: true }))];
    renderCampusOptions(current);
  } catch {
    // Presets stay available; nothing else to do.
  }
}

// ---------- loading ----------
function setStatus(text, isError = false) {
  const el = $('status');
  el.textContent = text;
  el.classList.toggle('error', isError);
}

async function loadFromOverpass({ bbox, name, id }) {
  const km2 = bboxAreaKm2(bbox);
  if (km2 > MAX_KM2) {
    setStatus(`That area is ${km2.toFixed(1)} km². Pick a box under ${MAX_KM2} km² so the browser can handle it.`, true);
    return;
  }
  const token = ++loadToken;
  abort?.abort();
  abort = new AbortController();
  try {
    let json = null, source = null;
    if (id) {
      // A snapshot written by `npm run fetch-data` loads instantly and offline.
      // Overpass JSON from `npm run fetch-data`, or OSM XML from `npm run extract` (osmium).
      for (const ext of ['json', 'osm']) {
        try {
          const res = await fetch(`./data/${id}.${ext}`, { signal: abort.signal });
          const type = res.headers.get('content-type') || '';
          if (!res.ok || type.includes('html')) continue;
          json = await res.text();
          source = `local snapshot data/${id}.${ext}`;
          break;
        } catch { /* fall through to Overpass */ }
      }
    }
    if (!json) {
      ({ json, source } = await fetchOverpass(campusQuery(bbox), { signal: abort.signal, onStatus: setStatus }));
    }
    if (token !== loadToken) return;
    setStatus('Building 3D model…');
    await new Promise((r) => setTimeout(r, 0));
    showModel(parseOsm(json), { name, bbox, source });
  } catch (err) {
    if (err.name === 'AbortError') return;
    setStatus(`${err.message}. Check your connection, or open an exported .osm file below.`, true);
  }
}

async function loadFromFile(file) {
  setStatus(`Reading ${file.name}…`);
  try {
    const osm = parseOsm(await file.text());
    const bbox = boundsOf(osm);
    if (!bbox) throw new Error('The file contains no nodes');
    showModel(osm, { name: file.name, bbox, source: file.name });
  } catch (err) {
    setStatus(`Could not read ${file.name}: ${err.message}`, true);
  }
}

// ---------- model ----------
function disposeModel() {
  if (!model) return;
  scene.remove(model.root);
  model.root.traverse((o) => {
    if (o.isCSS2DObject) o.element.remove();
    o.geometry?.dispose();
  });
  model = null;
}

function showModel(osm, { name, bbox, source }) {
  const t0 = performance.now();
  disposeModel();
  hideInspector();
  const campus = buildCampus(osm, bbox);
  const { root, layers, extent } = campus;
  if (campus.pools) root.add(campus.pools);

  const labelGroup = new THREE.Group();
  for (const lb of campus.labels) {
    const div = document.createElement('div');
    div.className = 'label';
    if (lb.ref) { const r = document.createElement('span'); r.className = 'ref'; r.textContent = lb.ref; div.append(r); }
    div.append(lb.text);
    const obj = new CSS2DObject(div);
    obj.position.copy(lb.position);
    labelGroup.add(obj);
  }
  labelGroup.visible = prefs.labels;
  root.add(labelGroup);
  scene.add(root);

  model = { root, layers, glowMat: campus.glowMat, pools: campus.pools, labelGroup, extent, name, source, campus };

  ground.scale.set(extent * 4, 1, extent * 4);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -extent * 0.75;
  sc.right = sc.top = extent * 0.75;
  sc.near = 1;
  sc.far = extent * 4;
  sc.updateProjectionMatrix();
  sun.position.set(-extent * 0.6, extent * 1.1, extent * 0.45);
  scene.fog = new THREE.Fog(prefs.night ? '#0b1020' : '#cfdae4', extent * 1.5, extent * 4.5);
  applyLighting();
  resetView();

  renderLayers(layers);
  renderSummary(layers, bbox);
  renderUnmodelled(campus.unmodelled);
  const ms = Math.round(performance.now() - t0);
  setStatus(`${name} · ${source} · built in ${ms} ms`);
  // Read by test/smoke.mjs.
  window.__campus = { layers: layers.map(({ key, count }) => ({ key, count })), name, ms };
}

function resetView() {
  if (!model) return;
  const ext = model.extent;
  controls.target.set(0, 0, 0);
  camera.position.set(ext * 0.15, ext * 0.55, ext * 0.6);
  camera.near = 0.3;
  camera.far = ext * 8;
  camera.updateProjectionMatrix();
  controls.update();
}

// ---------- panels ----------
const GROUP_ORDER = ['Base', 'Vegetation', 'Seating', 'Lighting', 'Waste & recycling', 'Bicycles', 'Barriers', 'Safety', 'Services', 'Signs', 'Transport', 'Leisure', 'Utilities', 'Buildings'];

function renderLayers(layers) {
  const host = $('layers');
  host.innerHTML = '';
  const groups = new Map();
  for (const l of layers) {
    if (!groups.has(l.group)) groups.set(l.group, []);
    groups.get(l.group).push(l);
  }
  const ordered = [...groups.keys()].sort((a, b) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b));
  for (const g of ordered) {
    const wrap = document.createElement('div');
    wrap.className = 'layer-group';
    const h = document.createElement('div');
    h.className = 'eyebrow';
    h.textContent = g === 'Base' ? 'Base map' : g;
    wrap.append(h);
    for (const l of groups.get(g).sort((a, b) => b.count - a.count)) {
      const row = document.createElement('label');
      row.className = 'layer';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = l.object.visible;
      cb.id = `layer-${l.key}`;
      cb.addEventListener('change', () => {
        l.object.visible = cb.checked;
        if (l.key === 'street_lamp' && model.pools) model.pools.visible = cb.checked && prefs.night;
      });
      const sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = l.swatch;
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = l.label;
      if (l.detail) { const d = document.createElement('span'); d.className = 'detail'; d.textContent = l.detail; name.append(d); }
      const count = document.createElement('span');
      count.className = 'count';
      count.textContent = l.count.toLocaleString();
      row.append(cb, sw, name, count);
      wrap.append(row);
    }
    host.append(wrap);
  }
  $('layers-block').hidden = false;
}

function renderSummary(layers, bbox) {
  const get = (k) => layers.find((l) => l.key === k)?.count || 0;
  const micro = layers.filter((l) => l.group !== 'Base' && l.key !== 'trees').reduce((a, l) => a + l.count, 0);
  const ha = bboxAreaKm2(bbox) * 100;
  $('summary').innerHTML = '';
  const stat = (n, k) => {
    const d = document.createElement('div');
    d.className = 'stat';
    d.innerHTML = `<div class="n"></div><div class="k"></div>`;
    d.querySelector('.n').textContent = n.toLocaleString();
    d.querySelector('.k').textContent = k;
    return d;
  };
  const wide = document.createElement('div');
  wide.className = 'wide';
  wide.textContent = `${(micro / ha).toFixed(1)} street-furniture objects and ${(get('trees') / ha).toFixed(1)} trees per hectare across ${ha.toFixed(0)} ha.`;
  $('summary').append(stat(get('buildings'), 'buildings'), stat(get('trees'), 'trees'), stat(micro, 'furniture objects'), wide);
  $('summary-block').hidden = false;
}

function renderUnmodelled(list) {
  const ul = $('unmodelled');
  ul.innerHTML = '';
  for (const [k, v] of list.slice(0, 25)) {
    const li = document.createElement('li');
    const a = document.createElement('span'); a.textContent = k;
    const b = document.createElement('span'); b.textContent = v;
    li.append(a, b);
    ul.append(li);
  }
  $('unmodelled-block').hidden = list.length === 0;
}

// ---------- inspector ----------
let selected = null;
function showInspector(el, point) {
  selected = { el, point: point.clone() };
  const t = el.tags || {};
  const kind = t.name || t.amenity || t.highway || t.building && `building=${t.building}` || t.natural || t.leisure || t.barrier || t.man_made || el.type;
  $('insp-title').textContent = `${kind} · ${el.type} ${el.id}`;
  $('insp-notes').textContent = (el.notes || []).join(' ');
  $('insp-osm').href = `https://www.openstreetmap.org/${el.type}/${el.id}`;
  $('insp-edit').href = `https://www.openstreetmap.org/edit?${el.type}=${el.id}`;
  const table = $('insp-tags');
  table.innerHTML = '';
  for (const k of Object.keys(t).sort()) {
    const tr = document.createElement('tr');
    const a = document.createElement('td'); a.textContent = k;
    const b = document.createElement('td'); b.textContent = t[k];
    tr.append(a, b);
    table.append(tr);
  }
  $('inspector').hidden = false;
  marker.position.set(point.x, 0.3, point.z);
  marker.visible = true;
}
function hideInspector() {
  $('inspector').hidden = true;
  marker.visible = false;
  selected = null;
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || !model || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const targets = [];
  model.root.traverseVisible((o) => { if (o.userData.pick) targets.push(o); });
  const hit = raycaster.intersectObjects(targets, false)[0];
  if (!hit) { hideInspector(); return; }
  const el = hit.object.userData.pick(hit);
  if (!el) return;
  let point = hit.point;
  if (hit.instanceId != null) {
    const m = new THREE.Matrix4();
    hit.object.getMatrixAt(hit.instanceId, m);
    point = new THREE.Vector3().setFromMatrixPosition(m);
  }
  showInspector(el, point);
});

$('insp-close').addEventListener('click', hideInspector);
$('insp-street').addEventListener('click', () => {
  if (!selected) return;
  const p = selected.point;
  const dir = new THREE.Vector3().subVectors(camera.position, controls.target).setY(0);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize().multiplyScalar(9);
  controls.target.set(p.x, 1.2, p.z);
  camera.position.set(p.x + dir.x, 1.7, p.z + dir.z);
  controls.update();
});

// ---------- toggles ----------
function applyLighting() {
  const night = prefs.night;
  document.body.classList.toggle('night', night);
  scene.background = new THREE.Color(night ? '#0b1020' : '#cfdae4');
  if (scene.fog) scene.fog.color.copy(scene.background);
  hemi.intensity = night ? 0.18 : 1.6;
  hemi.color.set(night ? '#6b7fa8' : '#dfe9f3');
  sun.intensity = night ? 0.12 : 2.6;
  sun.color.set(night ? '#9fb3ff' : '#fff3df');
  renderer.toneMappingExposure = night ? 1.25 : 1.0;
  ground.material.color.set(night ? '#5b5a54' : '#c9c5b6');
  bloom.enabled = night;
  if (model) {
    model.glowMat.emissiveIntensity = night ? 6 : 0.15;
    const lampLayer = model.layers.find((l) => l.key === 'street_lamp');
    if (model.pools) model.pools.visible = night && (lampLayer?.object.visible ?? true);
  }
}

function bindChip(id, key, onChange) {
  const btn = $(id);
  btn.addEventListener('click', () => {
    prefs[key] = !prefs[key];
    btn.setAttribute('aria-pressed', String(prefs[key]));
    onChange();
  });
}
bindChip('night', 'night', applyLighting);
bindChip('labels', 'labels', () => { if (model) model.labelGroup.visible = prefs.labels; });
bindChip('shadows', 'shadows', () => { renderer.shadowMap.enabled = prefs.shadows; scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); });
$('reset-view').addEventListener('click', resetView);
$('download-glb').addEventListener('click', async () => {
  if (!model) return;
  const btn = $('download-glb');
  btn.disabled = true;
  setStatus('Exporting glTF…');
  try {
    const glb = await campusToGlb(model.campus, { name: model.name, source: model.source });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' }));
    a.download = `${model.name.replace(/[^\w.-]+/g, '_').replace(/_+/g, '_')}.glb`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    setStatus(`Saved ${a.download} (${(glb.byteLength / 1e6).toFixed(1)} MB)`);
  } catch (err) {
    setStatus(`Export failed: ${err.message}`, true);
  } finally {
    btn.disabled = false;
  }
});

$('panel-toggle').addEventListener('click', () => {
  const p = $('panel');
  const collapsed = p.classList.toggle('collapsed');
  $('panel-toggle').textContent = collapsed ? '+' : '–';
  $('panel-toggle').setAttribute('aria-expanded', String(!collapsed));
});

$('load').addEventListener('click', () => {
  const c = campusOptions.find((o) => o.id === campusSelect.value);
  if (c) loadFromOverpass(c);
});
$('load-bbox').addEventListener('click', () => {
  const v = $('bbox').value.split(/[ ,;]+/).map(Number).filter(Number.isFinite);
  if (v.length !== 4 || v[0] >= v[2] || v[1] >= v[3]) {
    setStatus('Enter four numbers: south, west, north, east (south < north, west < east).', true);
    return;
  }
  loadFromOverpass({ bbox: v, name: 'Custom area' });
});
$('file').addEventListener('change', (e) => { const f = e.target.files?.[0]; if (f) loadFromFile(f); });
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (f) loadFromFile(f);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop(() => {
  controls.update();
  if (marker.visible) marker.scale.setScalar(Math.max(1, camera.position.distanceTo(marker.position) / 40));
  composer.render();
  labelRenderer.render(scene, camera); // also hides labels when their group is off
});

// ---------- start ----------
window.__view = (pos, target) => { camera.position.set(...pos); controls.target.set(...target); controls.update(); };
applyLighting();
renderCampusOptions(PRESETS[0].id);
const params = new URLSearchParams(location.search);
const qb = params.get('bbox')?.split(',').map(Number);
if (qb?.length === 4 && qb.every(Number.isFinite)) {
  $('bbox').value = qb.join(', ');
  loadFromOverpass({ bbox: qb, name: params.get('name') || 'Custom area' });
} else {
  const preset = PRESETS.find((p) => p.id === params.get('campus')) || PRESETS[0];
  campusSelect.value = preset.id;
  loadFromOverpass(preset);
}
discoverCampuses();
