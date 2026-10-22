// Campus scene → glTF 2.0 binary (.glb) that opens in Blender, Unity, Unreal,
// Cesium, QGIS 3D and any glTF viewer.
//
// Instanced furniture is baked into plain meshes (instance colours become
// vertex colours) because EXT_mesh_gpu_instancing and per-instance colours are
// not supported everywhere. Buildings become one node each, named after the
// building and carrying its OSM id and tags as glTF `extras`.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

const KEEP = ['position', 'normal', 'color'];

export function campusToGlb(campus, meta = {}) {
  return new GLTFExporter().parseAsync(bakeForExport(campus, meta), { binary: true });
}

export function bakeForExport(campus, { name = 'campus', source = '' } = {}) {
  const scene = new THREE.Scene();
  scene.name = name;
  const mat = new THREE.MeshStandardMaterial({ name: 'osm-colours', vertexColors: true, roughness: 0.85 });
  const glow = new THREE.MeshStandardMaterial({ name: 'lamp-light', vertexColors: true, emissive: new THREE.Color('#ffd9a0'), emissiveIntensity: 1 });

  for (const layer of campus.layers) {
    const group = new THREE.Group();
    group.name = layer.key;
    group.userData = { label: layer.label, osmFeatures: layer.count };
    const ranges = layer.object.userData.ranges;
    if (layer.key === 'buildings' && ranges) {
      splitBuildings(layer.object, ranges, mat, group);
    } else {
      const plain = [], lit = [];
      layer.object.updateMatrixWorld(true);
      layer.object.traverse((o) => {
        if (!o.isMesh || o.count === 0) return;
        const g = o.isInstancedMesh ? bakeInstanced(o) : cleanCopy(o.geometry, o.matrixWorld);
        (o.material === campus.glowMat ? lit : plain).push(g);
      });
      if (plain.length) group.add(meshOf(plain, mat, layer.key));
      if (lit.length) group.add(meshOf(lit, glow, `${layer.key}_light`));
    }
    scene.add(group);
  }

  scene.userData = {
    generator: 'osm-campus',
    source,
    attribution: '© OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)',
    origin: campus.origin,
    bbox: campus.bbox,
    axes: 'metres from origin; +X east, +Y up, −Z north',
  };
  return scene;
}

function meshOf(geoms, material, name) {
  const g = mergeVertices(mergeGeometries(geoms, false), 1e-4);
  geoms.forEach((x) => x.dispose());
  const mesh = new THREE.Mesh(g, material);
  mesh.name = name;
  return mesh;
}

// Non-indexed copy holding only position/normal/colour, transformed to world space.
function cleanCopy(src, matrix) {
  let g = src.index ? src.toNonIndexed() : src.clone();
  for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.color) {
    const c = new Float32Array(g.attributes.position.count * 3).fill(1);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  g.applyMatrix4(matrix);
  return g;
}

function bakeInstanced(mesh) {
  const src = cleanCopy(mesh.geometry, new THREE.Matrix4());
  const P = src.attributes.position.array, N = src.attributes.normal.array, C = src.attributes.color.array;
  const vc = src.attributes.position.count, count = mesh.count;
  const pos = new Float32Array(vc * 3 * count), nor = new Float32Array(vc * 3 * count), col = new Float32Array(vc * 3 * count);
  const m = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new THREE.Vector3(), c = new THREE.Color(1, 1, 1);
  for (let i = 0; i < count; i++) {
    mesh.getMatrixAt(i, m);
    m.premultiply(mesh.matrixWorld);
    nm.getNormalMatrix(m);
    if (mesh.instanceColor) mesh.getColorAt(i, c);
    for (let j = 0; j < vc; j++) {
      const o = (i * vc + j) * 3;
      v.fromArray(P, j * 3).applyMatrix4(m).toArray(pos, o);
      v.fromArray(N, j * 3).applyMatrix3(nm).normalize().toArray(nor, o);
      col[o] = C[j * 3] * c.r; col[o + 1] = C[j * 3 + 1] * c.g; col[o + 2] = C[j * 3 + 2] * c.b;
    }
  }
  src.dispose();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function splitBuildings(mesh, ranges, material, group) {
  const src = mesh.geometry;
  let start = 0;
  ranges.ends.forEach((end, i) => {
    const el = ranges.els[i];
    const g = new THREE.BufferGeometry();
    for (const k of KEEP) {
      const a = src.attributes[k];
      if (a) g.setAttribute(k, new THREE.BufferAttribute(a.array.slice(start * 9, end * 9), 3));
    }
    start = end;
    const t = el.tags || {};
    const b = new THREE.Mesh(mergeVertices(g, 1e-4), material);
    b.name = `${t.name || t.ref || `building ${el.id}`} (${el.type} ${el.id})`;
    b.userData = { osm: `${el.type}/${el.id}`, tags: t };
    group.add(b);
  });
}
