// Kantor 3D Tim AI. three.js + perabot dari Office Pack (GLB), avatar dibuat prosedural.
// Agent bekerja di meja; agent santai berkumpul di lounge; hasil yang menunggu tinjauan ditandai penanda kuning.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/GLTFLoader.js';
import { OrbitControls } from 'three/addons/OrbitControls.js';

const MODEL = {
  meja: { w: 1.6 }, kursi: { h: 1.05 }, monitor: { h: 0.42, ry: Math.PI }, imac: { h: 0.5, ry: Math.PI / 2 }, keyboard: { w: 0.42, ry: Math.PI },
  sofa: { w: 2.0 }, sofa_lebar: { w: 2.4 }, meja_tamu: { w: 1.0 }, meja_rapat: { w: 2.2 }, tanaman1: { h: 1.0 }, tanaman3: { h: 1.0 }, tanaman4: { h: 1.25 },
  rak_buku: { h: 1.9 }, papan_tulis: { h: 1.6 }, dispenser: { h: 1.3 }, printer: { h: 1.15 }, lemari_arsip: { h: 1.25 }, lampu: { h: 1.75 },
  vending: { h: 1.95 }, tong_sampah: { h: 0.42 }, kertas: { w: 0.3 }, jam: { w: 0.45, ry: Math.PI / 2 }, mug: { w: 0.12 },
};
// Kursi (posisi duduk agent). Agent menghadap +z (ke arah kamera), meja di depannya.
const KURSI = {
  pusat: [0, -3.5], 'adya-1': [-6.6, -3.4], 'adya-2': [-4.0, -3.4], 'adya-3': [-6.6, -0.7],
  'piramid-1': [4.0, -3.4], 'piramid-2': [6.6, -3.4], 'piramid-3': [6.6, -0.7],
  'studio-1': [-6.6, 2.6], 'studio-2': [-4.0, 2.6], 'studio-3': [-1.4, 2.6], 'cadangan-1': [4.0, -0.7], 'cadangan-2': [-4.0, -0.7],
};
// Tempat santai: duduk di sofa dulu, lalu berdiri di sekitar meja tamu. ry = arah hadap.
const LOUNGE = [
  { x: 5.15, z: 2.55, ry: 0, duduk: true }, { x: 6.45, z: 2.55, ry: 0, duduk: true }, { x: 7.6, z: 3.35, ry: -Math.PI / 2, duduk: true }, { x: 7.6, z: 4.65, ry: -Math.PI / 2, duduk: true },
  { x: 4.55, z: 4.35, ry: Math.PI / 2, duduk: false }, { x: 5.8, z: 5.25, ry: Math.PI, duduk: false }, { x: 4.7, z: 5.1, ry: 2.4, duduk: false },
  { x: 6.9, z: 5.35, ry: Math.PI, duduk: false }, { x: 3.9, z: 3.5, ry: 1.2, duduk: false }, { x: 5.8, z: 2.55, ry: 0, duduk: true },
];
const LORONG_Z = 1.35;
const WARNA_STATUS = { bekerja: '#2b5fd9', menunggu_review: '#e0a100', antre: '#7a8aa6', bermasalah: '#c0392b', santai: '#7aa36b', nonaktif: '#9a9a9a' };
const LABEL_STATUS = { bekerja: 'sedang bekerja', menunggu_review: 'menunggu tinjauan Anda', antre: 'ada tugas antre', bermasalah: 'gagal / tertahan', santai: 'santai', nonaktif: 'nonaktif' };

export async function mulaiKantor(wadah, { onAgen, onProgress } = {}) {
  const hemat = matchMedia('(max-width: 720px)').matches;
  const gerakMinim = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: !hemat, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, hemat ? 1 : 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !hemat; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  wadah.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e8e4dc');
  const kamera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
  const kontrol = new OrbitControls(kamera, renderer.domElement);
  kontrol.enableDamping = true; kontrol.minDistance = 5; kontrol.maxDistance = 30;
  kontrol.minPolarAngle = 0.25; kontrol.maxPolarAngle = 1.32; kontrol.screenSpacePanning = false;
  const PRESET = { iso: [[13.5, 12.5, 16], [0, 0.2, 0.6]], atas: [[0.01, 24, 3], [0, 0, 0]], pusat: [[3.2, 3.6, 1.2], [0, 1, -3.5]] };
  const keKamera = (k) => { const [p, t] = PRESET[k]; kamera.position.set(...p); kontrol.target.set(...t); kontrol.update(); };
  keKamera('iso');

  // ---------- cahaya ----------
  scene.add(new THREE.HemisphereLight('#fff6e8', '#b9a98f', 1.5));
  const matahari = new THREE.DirectionalLight('#fff1dc', 2.4);
  matahari.position.set(7, 13, 9); matahari.castShadow = !hemat;
  Object.assign(matahari.shadow.camera, { left: -11, right: 11, top: 9, bottom: -9, near: 1, far: 40 });
  matahari.shadow.mapSize.set(1536, 1536); matahari.shadow.bias = -0.0006; matahari.shadow.normalBias = 0.02;
  scene.add(matahari);
  const isi = new THREE.DirectionalLight('#dfe8ff', 0.5); isi.position.set(-8, 6, -4); scene.add(isi);

  // ---------- ruangan ----------
  const kanvasTex = (w, h, gambar) => { const c = document.createElement('canvas'); c.width = w; c.height = h; gambar(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const lantaiTex = kanvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#d8c3a0'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 64) for (let x = (y / 64) % 2 ? -128 : 0; x < w; x += 256) {
      g.fillStyle = `hsl(36, ${28 + ((x * 7 + y * 3) % 9)}%, ${70 + ((x + y * 5) % 7)}%)`; g.fillRect(x + 1, y + 1, 254, 62);
    }
  });
  lantaiTex.wrapS = lantaiTex.wrapT = THREE.RepeatWrapping; lantaiTex.repeat.set(4.5, 3);
  const lantai = new THREE.Mesh(new THREE.PlaneGeometry(18, 12), new THREE.MeshStandardMaterial({ map: lantaiTex, roughness: 0.85 }));
  lantai.rotation.x = -Math.PI / 2; lantai.receiveShadow = true; scene.add(lantai);
  const alas = new THREE.Mesh(new THREE.BoxGeometry(18.4, 0.3, 12.4), new THREE.MeshStandardMaterial({ color: '#b8a483' }));
  alas.position.y = -0.151; scene.add(alas);

  const dindingMat = new THREE.MeshStandardMaterial({ color: '#f3efe7', roughness: 0.95 });
  const dinding = (w, x, z, ry) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 3.2, 0.14), dindingMat); m.position.set(x, 1.6, z); m.rotation.y = ry; m.receiveShadow = true; scene.add(m); return m; };
  dinding(18.2, 0, -6.07, 0); dinding(12.2, -9.07, 0, Math.PI / 2);
  const lis = new THREE.MeshStandardMaterial({ color: '#cdbf9f' });
  [[18.2, 0, -5.99, 0], [12, -8.99, 0, Math.PI / 2]].forEach(([w, x, z, ry]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.03), lis); m.position.set(x, 0.06, z); m.rotation.y = ry; scene.add(m); });

  const langitTex = kanvasTex(256, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#9cc3e6'); gr.addColorStop(1, '#e7f1f8'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(160,175,190,.55)'; [[20, 150, 40, 106], [70, 120, 34, 136], [112, 170, 46, 86], [168, 135, 30, 121], [206, 160, 38, 96]].forEach(([x, y, ww, hh]) => g.fillRect(x, y, ww, hh)); });
  const jendela = (x, y, z, ry, w = 2.2, h = 1.5) => {
    const grp = new THREE.Group();
    const kaca = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: langitTex })); grp.add(kaca);
    const bingkai = new THREE.MeshStandardMaterial({ color: '#ffffff' });
    [[w + 0.12, 0.08, 0, h / 2], [w + 0.12, 0.08, 0, -h / 2], [0.08, h, -w / 2, 0], [0.08, h, w / 2, 0], [0.05, h, 0, 0]].forEach(([bw, bh, bx, by]) => { const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.06), bingkai); b.position.set(bx, by, 0.02); grp.add(b); });
    grp.position.set(x, y, z); grp.rotation.y = ry; scene.add(grp);
  };
  jendela(-2.8, 1.9, -5.99, 0); jendela(2.8, 1.9, -5.99, 0); jendela(-8.99, 1.9, -2.5, Math.PI / 2); jendela(-8.99, 1.9, 2.5, Math.PI / 2);

  // Papan nama zona dan karpet zona (warna brand)
  const papanNama = (teks, warna, x, z) => {
    const t = kanvasTex(1024, 192, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = warna; g.fillRect(0, h - 16, w, 16); g.font = '700 92px system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillStyle = warna; g.fillText(teks, 48, h / 2 - 6); });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.49), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }));
    m.position.set(x, 2.75, z); scene.add(m);
  };
  papanNama('Adya Space', '#1a224a', -6.1, -5.99); papanNama('Piramid Forklift', '#c0141f', 6.1, -5.99);
  const karpet = (x, z, w, d, warna, op = 1) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ color: warna, roughness: 1, transparent: op < 1, opacity: op })); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.005, z); m.receiveShadow = true; scene.add(m); };
  karpet(-5.3, -2.1, 4.6, 4.4, '#1a224a', 0.16); karpet(5.3, -2.1, 4.6, 4.4, '#c0141f', 0.13);
  const lounge = new THREE.Mesh(new THREE.CircleGeometry(2.0, 48), new THREE.MeshStandardMaterial({ color: '#c9b8d8', roughness: 1 }));
  lounge.rotation.x = -Math.PI / 2; lounge.position.set(5.8, 0.006, 3.9); lounge.receiveShadow = true; scene.add(lounge);

  // Papan data langsung di belakang Kepala Staf
  const papanKanvas = document.createElement('canvas'); papanKanvas.width = 1024; papanKanvas.height = 512;
  const papanTex = new THREE.CanvasTexture(papanKanvas); papanTex.colorSpace = THREE.SRGBColorSpace;
  const papanData = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshStandardMaterial({ map: papanTex, roughness: 0.5, emissive: '#ffffff', emissiveIntensity: 0.08, emissiveMap: papanTex }));
  papanData.position.set(0, 1.95, -5.98); scene.add(papanData);
  function gambarPapan(d = {}) {
    const g = papanKanvas.getContext('2d'), w = 1024, h = 512;
    g.fillStyle = '#1a224a'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffffff'; g.font = '700 54px system-ui, sans-serif'; g.fillText('Hari ini', 56, 96);
    const baris = [['Butuh keputusan', d.keputusan ?? '–', d.keputusan ? '#ffd166' : '#ffffff'], ['Hasil agent ditinjau', d.review ?? '–', d.review ? '#ffd166' : '#ffffff'],
      ['SLA 5P terlambat', d.sla ?? '–', d.sla ? '#ff8a80' : '#ffffff'], ['Tugas berjalan', d.berjalan ?? '–', '#ffffff']];
    baris.forEach(([k, v, c], i) => { const y = 180 + i * 82; g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '400 40px system-ui, sans-serif'; g.fillText(k, 56, y); g.fillStyle = c; g.font = '700 52px system-ui, sans-serif'; g.textAlign = 'right'; g.fillText(String(v), w - 56, y); g.textAlign = 'left'; });
    papanTex.needsUpdate = true;
  }
  gambarPapan();

  // ---------- perabot ----------
  const loader = new GLTFLoader(), proto = {};
  const nama = Object.keys(MODEL); let selesai = 0;
  await Promise.all(nama.map((k) => loader.loadAsync(`/app/model/${k}.glb`).then((g) => {
    const o = g.scene; o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    const b = new THREE.Box3().setFromObject(o), sz = b.getSize(new THREE.Vector3()), spec = MODEL[k];
    const s = spec.h ? spec.h / sz.y : spec.w / Math.max(sz.x, sz.z);
    const wrap = new THREE.Group(), inner = new THREE.Group(); inner.add(o); o.scale.setScalar(s);
    const b2 = new THREE.Box3().setFromObject(o), c = b2.getCenter(new THREE.Vector3()); o.position.set(-c.x, -b2.min.y, -c.z);
    inner.rotation.y = spec.ry || 0; wrap.add(inner); proto[k] = wrap;
  }).catch(() => { /* model hilang: lewati */ }).finally(() => onProgress?.(++selesai, nama.length))));
  const taruh = (k, x, z, ry = 0, y = 0) => { if (!proto[k]) return null; const o = proto[k].clone(true); o.position.set(x, y, z); o.rotation.y = ry; scene.add(o); return o; };
  const tinggiAtas = (o) => (o ? new THREE.Box3().setFromObject(o).max.y : 0.75);

  const lampuMeja = {};
  for (const [kunci, [x, z]] of Object.entries(KURSI)) {
    const meja = taruh('meja', x, z + 0.78, Math.PI), atas = tinggiAtas(meja);
    taruh('kursi', x, z); taruh(kunci === 'pusat' ? 'imac' : 'monitor', x, z + 1.0, 0, atas); taruh('keyboard', x, z + 0.62, 0, atas);
    if ((x * 3 + z) % 2 > 0.5) taruh('mug', x + 0.5, z + 0.7, 0, atas); else taruh('kertas', x - 0.55, z + 0.85, 0, atas);
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.035, 0.01), new THREE.MeshBasicMaterial({ color: '#9a9a9a' }));
    led.position.set(x, atas + 0.06, z + 1.18); scene.add(led); lampuMeja[kunci] = led; // lampu status di sisi meja yang menghadap kamera
  }
  taruh('meja_rapat', 1.6, -0.5);
  [[1.6, -1.75, 0], [1.6, 0.75, Math.PI], [0.35, -0.5, Math.PI / 2], [2.85, -0.5, -Math.PI / 2]].forEach(([x, z, r]) => taruh('kursi', x, z, r));
  taruh('papan_tulis', -1.3, -0.6, Math.PI / 2.4);
  taruh('sofa', 5.8, 2.4, 0); taruh('sofa_lebar', 7.75, 4.0, -Math.PI / 2); taruh('meja_tamu', 5.8, 3.9); taruh('lampu', 3.9, 2.3); taruh('tanaman4', 8.3, 2.2);
  taruh('vending', 8.3, -5.45, 0); taruh('dispenser', 7.3, -5.55, 0); taruh('printer', 2.0, -5.45, 0); taruh('lemari_arsip', -1.6, -5.55); taruh('lemari_arsip', -2.4, -5.55);
  taruh('rak_buku', -8.65, 0.9, Math.PI / 2); taruh('rak_buku', -8.65, 4.4, Math.PI / 2);
  taruh('tanaman1', -8.4, -5.5); taruh('tanaman3', -0.9, 4.9); taruh('tanaman3', 3.0, -5.5); taruh('tanaman4', -8.4, -2.0); taruh('tong_sampah', 3.4, -2.6); taruh('tong_sampah', -2.9, -2.6);
  taruh('jam', 0, -5.95, 0, 2.62); // jam dinding di atas papan data

  // ---------- avatar ----------
  const KULIT = ['#f1c9a5', '#e0ac7e', '#c68a5b', '#a8714a'], RAMBUT = ['#1f1b18', '#3b2a1e', '#5a3a22', '#2a2a2a'];
  const celanaMat = new THREE.MeshStandardMaterial({ color: '#2b2f3a', roughness: 0.8 });
  function labelSprite(a) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 136; const g = c.getContext('2d');
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); sp.scale.set(1.75, 0.465, 1); sp.renderOrder = 10;
    sp.userData.gambar = (status) => {
      g.clearRect(0, 0, 512, 136); g.fillStyle = 'rgba(255,255,255,.94)'; g.beginPath(); g.roundRect(6, 6, 500, 124, 22); g.fill();
      g.fillStyle = WARNA_STATUS[status] || '#999'; g.beginPath(); g.arc(46, 68, 15, 0, 7); g.fill();
      g.fillStyle = '#14171f'; g.font = '700 46px system-ui, sans-serif'; g.fillText(a.nama, 76, 62);
      g.fillStyle = '#4a4f5c'; g.font = '400 30px system-ui, sans-serif'; g.fillText(a.peran.length > 26 ? a.peran.slice(0, 25) + '…' : a.peran, 76, 104);
      t.needsUpdate = true;
    };
    return sp;
  }
  function buatAvatar(a, i) {
    const root = new THREE.Group(), badan = new THREE.Group(); root.add(badan);
    const baju = new THREE.MeshStandardMaterial({ color: a.warna || '#4a4f5c', roughness: 0.7 });
    const kulit = new THREE.MeshStandardMaterial({ color: KULIT[i % 4], roughness: 0.6 }), rambut = new THREE.MeshStandardMaterial({ color: RAMBUT[(i * 3) % 4], roughness: 0.9 });
    const kaki = [-0.1, 0.1].map((dx) => {
      const paha = new THREE.Group(); paha.position.set(dx, 0.82, 0); badan.add(paha);
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.42, 0.17), celanaMat); p.position.y = -0.21; paha.add(p);
      const lutut = new THREE.Group(); lutut.position.y = -0.42; paha.add(lutut);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.4, 0.16), celanaMat); b.position.y = -0.2; lutut.add(b);
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.07, 0.24), new THREE.MeshStandardMaterial({ color: '#1a1a1a' })); s.position.set(0, -0.4, 0.04); lutut.add(s);
      return { paha, lutut };
    });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.34, 4, 12), baju); torso.position.y = 1.08; torso.scale.z = 0.72; badan.add(torso);
    const lengan = [-0.29, 0.29].map((dx) => {
      const bahu = new THREE.Group(); bahu.position.set(dx, 1.3, 0); badan.add(bahu);
      const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.34, 3, 8), baju); l.position.y = -0.22; bahu.add(l);
      const tg = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), kulit); tg.position.y = -0.45; bahu.add(tg);
      return bahu;
    });
    const kepala = new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 16), kulit); kepala.position.y = 1.58; badan.add(kepala);
    const r = new THREE.Mesh(new THREE.SphereGeometry(0.19, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), rambut); r.position.set(0, 1.6, -0.015); r.rotation.x = -0.25; badan.add(r);
    const mataMat = new THREE.MeshBasicMaterial({ color: '#1a1a1a' });
    [-0.065, 0.065].forEach((dx) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), mataMat); m.position.set(dx, 1.6, 0.165); badan.add(m); });
    badan.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.userData.agen = a.id; } });
    const label = labelSprite(a); label.position.y = 2.05; root.add(label);
    const penanda = new THREE.Mesh(new THREE.OctahedronGeometry(0.11), new THREE.MeshStandardMaterial({ color: '#e0a100', emissive: '#e0a100', emissiveIntensity: 0.6 }));
    penanda.position.y = 2.45; penanda.visible = false; root.add(penanda);
    const cincin = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.42, 40), new THREE.MeshBasicMaterial({ color: '#2b5fd9', transparent: true, opacity: 0.0, depthWrite: false }));
    cincin.rotation.x = -Math.PI / 2; cincin.position.y = 0.012; root.add(cincin);
    scene.add(root);
    return { a, root, badan, kaki, lengan, label, penanda, cincin, status: null, posisi: null, jalur: [], duduk: false, fase: Math.random() * 6 };
  }

  const avatars = new Map();
  function tujuanUntuk(av, idx, kursiTerpakai) {
    if (['santai', 'nonaktif'].includes(av.status) && av.a.id !== 'kepala-staf') { const l = LOUNGE[idx % LOUNGE.length]; return { ...l }; } // Kepala Staf selalu di mejanya
    let k = av.a.meja && KURSI[av.a.meja] && !kursiTerpakai.has(av.a.meja) ? av.a.meja : Object.keys(KURSI).find((x) => !kursiTerpakai.has(x));
    kursiTerpakai.add(k);
    return { x: KURSI[k][0], z: KURSI[k][1], ry: 0, duduk: true, kursi: k };
  }
  function aturJalur(av, t) {
    const p = av.root.position;
    av.target = t;
    if (!av.posisi) { p.set(t.x, 0, t.z); av.root.rotation.y = t.ry || 0; av.jalur = []; av.duduk = t.duduk; return; }
    if (Math.hypot(p.x - t.x, p.z - t.z) < 0.05) { av.duduk = t.duduk; return; }
    av.duduk = false;
    av.jalur = gerakMinim ? [] : [new THREE.Vector3(p.x, 0, LORONG_Z), new THREE.Vector3(t.x, 0, LORONG_Z), new THREE.Vector3(t.x, 0, t.z)];
    if (gerakMinim) { p.set(t.x, 0, t.z); av.duduk = t.duduk; }
    av.target = t;
  }

  function perbarui(tim, ringkas) {
    const aktifIds = new Set();
    const kursiTerpakai = new Set();
    // agent yang bekerja di meja diproses dulu supaya mendapat kursinya sendiri
    const urut = [...(tim.agen || [])].sort((x, y) => ((x.status === 'santai' && x.id !== 'kepala-staf') - (y.status === 'santai' && y.id !== 'kepala-staf')));
    let iLounge = 0;
    urut.forEach((a, i) => {
      aktifIds.add(a.id);
      let av = avatars.get(a.id);
      if (!av) { av = buatAvatar(a, avatars.size); avatars.set(a.id, av); }
      av.a = a;
      const berubah = av.status !== a.status; av.status = a.status;
      av.label.userData.gambar(a.status);
      av.penanda.visible = a.status === 'menunggu_review' || a.status === 'bermasalah';
      av.penanda.material.color.set(a.status === 'bermasalah' ? '#c0392b' : '#e0a100'); av.penanda.material.emissive.set(av.penanda.material.color);
      const keLounge = ['santai', 'nonaktif'].includes(a.status) && a.id !== 'kepala-staf';
      const t = tujuanUntuk(av, keLounge ? iLounge++ : 0, kursiTerpakai);
      if (t.kursi && lampuMeja[t.kursi]) lampuMeja[t.kursi].material.color.set(WARNA_STATUS[a.status]);
      av.kursi = t.kursi;
      // jalan ulang juga bila tempatnya bergeser karena status agent lain berubah (kursi/sofa dipakai ulang)
      if (berubah || !av.posisi || av.posisi.x !== t.x || av.posisi.z !== t.z) aturJalur(av, t);
      av.posisi = t;
    });
    for (const [id, av] of avatars) if (!aktifIds.has(id)) { scene.remove(av.root); avatars.delete(id); }
    for (const [k, led] of Object.entries(lampuMeja)) if (![...avatars.values()].some((v) => v.kursi === k)) led.material.color.set('#9a9a9a');
    if (ringkas) gambarPapan({ keputusan: ringkas.keputusan?.length || 0, review: ringkas.tugas_review?.length || 0, sla: ringkas.sla?.length || 0, berjalan: (tim.tugas || []).filter((x) => x.status === 'berjalan').length });
  }

  // ---------- interaksi ----------
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  let sorot = null;
  function agenDi(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, kamera);
    const hit = ray.intersectObjects([...avatars.values()].map((v) => v.badan), true)[0];
    return hit ? avatars.get(hit.object.userData.agen) : null;
  }
  let turun = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { turun = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!turun || Math.hypot(e.clientX - turun[0], e.clientY - turun[1]) > 6) return; // geser kamera, bukan klik
    const av = agenDi(e); const r = wadah.getBoundingClientRect();
    onAgen?.(av ? { ...av.a, label_status: LABEL_STATUS[av.status] } : null, { x: e.clientX - r.left, y: e.clientY - r.top });
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    const av = agenDi(e);
    if (sorot && sorot !== av) sorot.cincin.material.opacity = 0;
    sorot = av; if (av) av.cincin.material.opacity = 0.85;
    renderer.domElement.style.cursor = av ? 'pointer' : 'grab';
  });

  // ---------- animasi ----------
  const jam = new THREE.Clock();
  let jalan = true;
  function langkah() {
    if (!jalan) return;
    const dt = Math.min(jam.getDelta(), 0.05), t = jam.elapsedTime;
    for (const av of avatars.values()) {
      const p = av.root.position;
      if (av.jalur.length) {
        const q = av.jalur[0], d = q.clone().sub(p); d.y = 0; const jarak = d.length();
        if (jarak < 0.04) { av.jalur.shift(); if (!av.jalur.length) av.duduk = av.target?.duduk; }
        else { d.normalize(); p.addScaledVector(d, Math.min(jarak, 1.5 * dt)); av.root.rotation.y = Math.atan2(d.x, d.z); }
      } else { // putar ke arah hadap tempat tujuan lewat sudut terpendek
        const want = av.target?.ry || 0; let d = want - av.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
        av.root.rotation.y += d * Math.min(1, dt * 6);
      }
      const berjalan = av.jalur.length > 0, f = t * 7 + av.fase;
      const [kk, ka] = av.kaki, [lk, la] = av.lengan;
      if (berjalan) {
        av.badan.position.y = Math.abs(Math.sin(f)) * 0.04;
        kk.paha.rotation.x = Math.sin(f) * 0.5; ka.paha.rotation.x = -Math.sin(f) * 0.5; kk.lutut.rotation.x = ka.lutut.rotation.x = 0.15;
        lk.rotation.x = -Math.sin(f) * 0.45; la.rotation.x = Math.sin(f) * 0.45;
      } else if (av.duduk) {
        av.badan.position.y = -0.3;
        kk.paha.rotation.x = ka.paha.rotation.x = -Math.PI / 2; kk.lutut.rotation.x = ka.lutut.rotation.x = Math.PI / 2;
        const ketik = av.status === 'bekerja' && !gerakMinim ? Math.sin(t * 14 + av.fase) * 0.08 : 0;
        lk.rotation.x = -1.15 + ketik; la.rotation.x = -1.15 - ketik;
      } else {
        av.badan.position.y = gerakMinim ? 0 : Math.sin(t * 1.6 + av.fase) * 0.01;
        kk.paha.rotation.x = ka.paha.rotation.x = 0; kk.lutut.rotation.x = ka.lutut.rotation.x = 0; lk.rotation.x = la.rotation.x = 0.05;
      }
      av.label.position.y = av.duduk && !berjalan ? 1.75 : 2.05;
      av.penanda.position.y = av.label.position.y + 0.38 + (gerakMinim ? 0 : Math.sin(t * 2.4 + av.fase) * 0.05);
      if (!gerakMinim) av.penanda.rotation.y += dt * 1.6;
    }
    kontrol.update();
    renderer.render(scene, kamera);
    requestAnimationFrame(langkah);
  }
  function ukur() { const w = wadah.clientWidth, h = wadah.clientHeight; renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px'; kamera.aspect = w / h; kamera.updateProjectionMatrix(); }
  const ro = new ResizeObserver(ukur); ro.observe(wadah); ukur();
  requestAnimationFrame(langkah);

  return {
    perbarui, keKamera,
    jeda() { jalan = false; }, lanjut() { if (!jalan) { jalan = true; jam.getDelta(); requestAnimationFrame(langkah); } },
    hemat(on) { renderer.shadowMap.enabled = !on; matahari.castShadow = !on; renderer.setPixelRatio(on ? 1 : Math.min(devicePixelRatio, 1.5)); ukur(); scene.traverse((m) => { if (m.material) m.material.needsUpdate = true; }); },
    hentikan() { jalan = false; ro.disconnect(); renderer.dispose(); wadah.innerHTML = ''; },
  };
}
