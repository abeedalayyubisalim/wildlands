// ============ DESA, KOTA, & JALAN (di permukaan planet) ============
// Titik-titik lokasi (desa/kota/gua/air terjun) nggak lagi koordinat X,Z tetap kayak versi
// datar - sekarang dicari otomatis lewat sampling arah di permukaan bola (fibonacci sphere)
// yang difilter berdasarkan ketinggian & jarak sudut (great-circle) dari satu sama lain. Ini
// bikin lokasinya tetap konsisten tiap game dibuka (noise-nya seeded/deterministic) tanpa perlu
// nebak-nebak koordinat secara manual kayak sebelumnya.
import * as THREE from 'three';
import { getPlanetTerrainHeight, getContinentValue, placeOnPlanet, PLANET_RADIUS, WATER_LEVEL } from './planet-terrain.js';

function fibonacciSphere(count) {
    const pts = [];
    const inc = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
        const y = 1 - (2 * i) / (count - 1);
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = inc * i;
        pts.push(new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r));
    }
    return pts;
}

const SAMPLE_POINTS = fibonacciSphere(20000);

function angDist(a, b) { return Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1)); }

function findAnchor({ from, targetDeg, tolDeg, minH = 0.5, maxH = 4.5, maxPoleY = 0.7, filter }) {
    const targetRad = THREE.MathUtils.degToRad(targetDeg ?? 0);
    const tolRad = THREE.MathUtils.degToRad(tolDeg ?? 180);
    let best = null, bestDiff = Infinity;
    for (const dir of SAMPLE_POINTS) {
        if (Math.abs(dir.y) > maxPoleY) continue;
        const h = getPlanetTerrainHeight(dir);
        if (h < minH || h > maxH) continue;
        if (filter && !filter(dir, h)) continue;
        const d = from ? angDist(from, dir) : 0;
        const diff = Math.abs(d - targetRad);
        if (diff < tolRad && diff < bestDiff) { bestDiff = diff; best = { dir: dir.clone(), h }; }
    }
    return best;
}

// --- Cari anchor lokasi utama, urut (masing-masing bergantung ke yang sebelumnya) ---
export const SPAWN = findAnchor({ targetDeg: 0, tolDeg: 180, minH: 0.5, maxH: 4.5 });
export const VILLAGE = SPAWN;
export const CITY = findAnchor({ from: VILLAGE.dir, targetDeg: 55, tolDeg: 20, minH: 0.3, maxH: 5 });
export const CAVE_WEST = findAnchor({ from: VILLAGE.dir, targetDeg: 15, tolDeg: 10, minH: -1, maxH: 6, filter: (d) => angDist(d, CITY.dir) > 0.2 });
export const CAVE_EAST = findAnchor({ from: VILLAGE.dir, targetDeg: 15, tolDeg: 10, minH: -1, maxH: 6, filter: (d) => angDist(d, CITY.dir) > 0.2 && angDist(d, CAVE_WEST.dir) > 0.12 });

let wfBest = null, wfBestDiff = Infinity;
for (const dir of SAMPLE_POINTS) {
    if (Math.abs(dir.y) > 0.7) continue;
    const cont = getContinentValue(dir);
    if (cont < 0.3) continue;
    const d = angDist(VILLAGE.dir, dir);
    if (d < 0.35) {
        const diff = Math.abs(d - 0.15);
        if (diff < wfBestDiff) { wfBestDiff = diff; wfBest = { dir: dir.clone(), h: getPlanetTerrainHeight(dir), cont }; }
    }
}
export const WATERFALL_TOP = wfBest || findAnchor({ from: VILLAGE.dir, targetDeg: 10, tolDeg: 10, minH: 8, maxH: 20 });

// --- Great-circle slerp (buat jalan & interpolasi ketinggian air terjun) ---
export function slerpDir(a, b, t) {
    const omega = angDist(a, b);
    if (omega < 1e-6) return a.clone();
    const s0 = Math.sin((1 - t) * omega) / Math.sin(omega);
    const s1 = Math.sin(t * omega) / Math.sin(omega);
    return new THREE.Vector3().addScaledVector(a, s0).addScaledVector(b, s1).normalize();
}

// Closed-form (bukan sampling) - dipanggil ribuan kali per pembuatan terrain (tiap vertex x
// tiap ruas jalan), jadi harus murah: proyeksikan dir ke bidang lingkaran-besar yang ngelewatin
// a & b, cek apa proyeksinya jatuh di DALAM ruas (bukan di perpanjangannya), kalau di luar
// pakai ujung ruas yang terdekat.
const _n = new THREE.Vector3(), _pProj = new THREE.Vector3();
function closestPointOnGreatCircleSegment(dir, a, b) {
    _n.crossVectors(a, b);
    if (_n.lengthSq() < 1e-10) return a;
    _n.normalize();
    _pProj.copy(dir).addScaledVector(_n, -dir.dot(_n));
    if (_pProj.lengthSq() < 1e-10) return a;
    _pProj.normalize();
    const omega = angDist(a, b);
    const angAP = angDist(a, _pProj);
    const angBP = angDist(b, _pProj);
    let t = omega > 1e-8 ? angAP / omega : 0;
    if (angAP + angBP > omega + 1e-4) t = angAP < angBP ? 0 : 1;
    return slerpDir(a, b, THREE.MathUtils.clamp(t, 0, 1));
}
function distToGreatCircleSegment(dir, a, b) {
    return { dist: angDist(dir, closestPointOnGreatCircleSegment(dir, a, b)) };
}

// --- Definisi jalan: dirt (desa) & asphalt (kota) ---
export const ROAD_SEGMENTS_DIRT = [
    [VILLAGE.dir, WATERFALL_TOP.dir],
    [VILLAGE.dir, CAVE_WEST.dir],
    [VILLAGE.dir, CAVE_EAST.dir],
];
export const ROAD_SEGMENTS_ASPHALT = [
    [VILLAGE.dir, CITY.dir],
];
const DIRT_COLOR = new THREE.Color(0xb08a5c);
const ASPHALT_COLOR = new THREE.Color(0x3a3a3f);
const ROAD_WIDTH_RAD = THREE.MathUtils.degToRad(0.55);
const ROAD_BLEND_RAD = THREE.MathUtils.degToRad(0.5);

export function roadColorBlend(dir, baseColor) {
    let minDirt = Infinity, minAsphalt = Infinity;
    for (const [a, b] of ROAD_SEGMENTS_DIRT) minDirt = Math.min(minDirt, distToGreatCircleSegment(dir, a, b).dist);
    for (const [a, b] of ROAD_SEGMENTS_ASPHALT) minAsphalt = Math.min(minAsphalt, distToGreatCircleSegment(dir, a, b).dist);
    const blend = (minDist, color) => {
        if (minDist > ROAD_WIDTH_RAD + ROAD_BLEND_RAD) return;
        const t = minDist <= ROAD_WIDTH_RAD ? 1 : 1 - (minDist - ROAD_WIDTH_RAD) / ROAD_BLEND_RAD;
        baseColor.lerp(color, t * 0.92);
    };
    // Aspal digambar belakangan biar menang kalau jalan tumpang tindih deket desa.
    blend(minDirt, DIRT_COLOR);
    blend(minAsphalt, ASPHALT_COLOR);
    return baseColor;
}

// --- Bangunan ---
function buildHouse(scale = 1, roofColor = 0x654321) {
    const house = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(6 * scale, 4 * scale, 6 * scale), new THREE.MeshStandardMaterial({ color: 0x8B7355 }));
    walls.position.y = 2 * scale; walls.castShadow = true; walls.receiveShadow = true;
    house.add(walls);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.5 * scale, 2 * scale, 4), new THREE.MeshStandardMaterial({ color: roofColor }));
    roof.position.y = 5 * scale; roof.rotation.y = Math.PI / 4; roof.castShadow = true;
    house.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.2 * scale, 2 * scale, 0.2), new THREE.MeshStandardMaterial({ color: 0x4a3018 }));
    door.position.set(0, 1 * scale, 3 * scale);
    house.add(door);
    return house;
}

function buildCityBuilding(width, depth, height, colorMain) {
    const b = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshStandardMaterial({ color: colorMain, roughness: 0.7 }));
    body.position.y = height / 2; body.castShadow = true; body.receiveShadow = true;
    b.add(body);
    // Jendela-jendela sederhana (grid kotak lebih terang) ditempel di 2 sisi biar keliatan gedung
    const winMat = new THREE.MeshStandardMaterial({ color: 0xbfe3ff, emissive: 0x3a5a6b, emissiveIntensity: 0.4 });
    const rows = Math.max(2, Math.floor(height / 3));
    const cols = Math.max(2, Math.floor(width / 2.2));
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.1), winMat);
            win.position.set(-width / 2 + (c + 0.5) * (width / cols), 1.8 + r * (height / rows), depth / 2 + 0.06);
            b.add(win);
        }
    }
    return b;
}

export function buildVillage(scene) {
    const group = new THREE.Group();
    scene.add(group);
    const roadDir = new THREE.Vector3().subVectors(CITY.dir, VILLAGE.dir).normalize(); // arah kasar "jalan utama" desa
    const perp = new THREE.Vector3().crossVectors(VILLAGE.dir, roadDir).normalize();
    const roofColors = [0x654321, 0x7a3b2e, 0x555a3a];
    let idx = 0;
    // row=0 sengaja dilewatin biar titik spawn (persis di VILLAGE.dir) jadi alun-alun kosong,
    // nggak nempel langsung ke dinding rumah begitu game dimulai.
    for (let row = -2; row <= 2; row++) {
        if (row === 0) continue;
        for (const side of [1, -1]) {
            const angOffset = 0.045 * side; // pergeseran sudut buat "baris kedua" di kiri-kanan
            const alongOffset = row * 0.025;
            const dir = VILLAGE.dir.clone()
                .addScaledVector(roadDir, alongOffset)
                .addScaledVector(perp, angOffset)
                .normalize();
            const h = getPlanetTerrainHeight(dir);
            if (h < WATER_LEVEL + 0.5) continue; // jangan taruh rumah di air
            const scale = 0.85 + (idx % 3) * 0.12;
            const house = buildHouse(scale, roofColors[idx % roofColors.length]);
            placeOnPlanet(house, dir, 0);
            house.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
            group.add(house);
            idx++;
        }
    }
    return group;
}

export function buildCity(scene) {
    const group = new THREE.Group();
    scene.add(group);
    const buildingColors = [0x5c6570, 0x6b7280, 0x4a5058, 0x707880];
    let idx = 0;
    // ring mulai dari 1 (bukan 0) - dulu ring=0 nempatin gedung cuma ~4.7 unit dari CITY.dir,
    // padahal setengah-diagonal gedung bisa ~5.7 unit, jadi gedung nutupin titik pusat kota
    // sendiri (pemain teleport ke situ nyangkut di dalam gedung). Sekarang plaza tengah kosong.
    for (let ring = 1; ring <= 3; ring++) {
        const count = 4 + ring * 3;
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2 + ring * 0.3;
            const radialOffset = 0.04 + ring * 0.02;
            // Arah acak tegak lurus dari CITY.dir buat nyebar bangunan dalam lingkaran kecil
            const seed = Math.abs(CITY.dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
            const u = new THREE.Vector3().crossVectors(seed, CITY.dir).normalize();
            const v = new THREE.Vector3().crossVectors(CITY.dir, u).normalize();
            const dir = CITY.dir.clone()
                .addScaledVector(u, Math.cos(angle) * radialOffset)
                .addScaledVector(v, Math.sin(angle) * radialOffset)
                .normalize();
            const h = getPlanetTerrainHeight(dir);
            if (h < WATER_LEVEL + 0.5) continue;
            const height = 10 + (idx % 5) * 6 + ring * 3;
            const building = buildCityBuilding(6 + (idx % 3) * 2, 6 + (idx % 2) * 2, height, buildingColors[idx % buildingColors.length]);
            placeOnPlanet(building, dir, 0);
            building.rotateY((idx * 0.7) % (Math.PI * 2));
            group.add(building);
            idx++;
        }
    }
    return group;
}
