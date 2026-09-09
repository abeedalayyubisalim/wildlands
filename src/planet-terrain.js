// ============ PLANET TERRAIN ============
// Dunia sekarang bukan chunk datar tak-terhingga lagi, tapi satu planet utuh berbentuk bola
// (teknik "cube-sphere": 6 sisi kubus disubdivisi jadi grid, tiap titiknya diproyeksikan ke
// permukaan bola lewat normalize(), baru digeser keluar/masuk sesuai tinggi terrain). Karena
// terrain-nya fungsi murni dari ARAH 3D (bukan koordinat U/V per-sisi), sambungan antar 6 sisi
// kubus otomatis nyambung mulus tanpa jahitan.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const PLANET_RADIUS = 260;
export const WATER_LEVEL = -1.5;

// --- Noise permukaan bola: beberapa arah acak tetap (seeded, jadi hasilnya selalu sama tiap
// kali game dibuka) dijumlahin sinusnya berdasarkan dot product sama arah titik yang dicek.
// Ini pengganti Perlin/Simplex noise biar nggak perlu library tambahan, gayanya mirip formula
// sinus berlapis yang dipakai di terrain datar versi sebelumnya, cuma sekarang jadi fungsi arah
// 3D penuh (nggak ada seam/sambungan aneh di manapun di permukaan bola).
const NOISE_DIRS = [];
(function initNoiseDirs() {
    let seed = 1337;
    function rand() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    // Frekuensi dikelompokkan sesuai oktaf yang makenya (lihat getPlanetTerrainHeight di bawah).
    // Dulu freq-nya diacak RATA buat semua index (1.1-4.7) tanpa peduli kepake buat oktaf yang
    // mana - jadi "continent" (yang nentuin bentuk benua/pantai/gunung skala besar) kadang
    // kebagian frekuensi tinggi secara kebetulan, bikin garis pantai & pegunungan berubah
    // drastis cuma dalam puluhan meter jarak (terverifikasi lewat sampling: tinggi bisa naik-
    // turun 20+ unit hanya dalam radius 20-60 unit dari satu titik). Itu penyebab utama terrain
    // kerasa "acak-acakan/jelek", rumah nangkring miring, & ada kolam air muncul random deket
    // desa. Sekarang tiap kelompok oktaf punya jatah pita frekuensi sendiri yang lebih rendah -
    // continent WAJIB frekuensi rendah (fitur besar & mulus), detail/rugged boleh lebih tinggi
    // tapi kontribusinya emang cuma buat tekstur kecil di atas bentuk besar itu.
    const FREQ_BANDS = [
        [0.35, 0.85], // index 0-2: continent (skala benua/pantai/gunung - HARUS mulus)
        [0.9, 1.6],   // index 3-5: detail (variasi menengah)
        [1.6, 2.6],   // index 6-9: rugged (tekstur kasar kecil, cuma dipake di puncak gunung)
        [1.6, 2.6],   // index 10-13: cadangan, konsisten sama rugged
    ];
    for (let i = 0; i < 14; i++) {
        const theta = rand() * Math.PI * 2, phi = Math.acos(rand() * 2 - 1);
        const band = i < 3 ? FREQ_BANDS[0] : i < 6 ? FREQ_BANDS[1] : i < 10 ? FREQ_BANDS[2] : FREQ_BANDS[3];
        NOISE_DIRS.push({
            dir: new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi)),
            freq: band[0] + rand() * (band[1] - band[0]),
            phase: rand() * Math.PI * 2,
        });
    }
})();

function sphereNoise(dir, octaveStart, octaveCount) {
    let sum = 0, amp = 1, totalAmp = 0;
    for (let i = octaveStart; i < octaveStart + octaveCount; i++) {
        const n = NOISE_DIRS[i % NOISE_DIRS.length];
        sum += Math.sin(dir.dot(n.dir) * n.freq * Math.PI + n.phase) * amp;
        totalAmp += amp;
        amp *= 0.55;
    }
    return sum / totalAmp;
}

// continent: skala besar (nentuin daratan vs lautan & area pegunungan)
export function getContinentValue(dir) { return sphereNoise(dir, 0, 3); }

// --- Zona "flatten" (diisi dari luar lewat setFlattenZones - dipanggil main.js SEKALI, SETELAH
// titik desa/kota/gua ditemukan tapi SEBELUM mesh planet dibangun) - bikin area sekitar
// pemukiman beneran datar/landai, jadi rumah/gedung nggak nangkring miring di lereng curam &
// nggak ada kolam air nyempil random pas persis di alun-alun desa. Di luar radius ini terrain
// tetap liar sepenuhnya (nggak disentuh).
let flattenZones = [];
export function setFlattenZones(zones) { flattenZones = zones; }

function applyFlatten(dir, rawH) {
    if (flattenZones.length === 0) return rawH;
    let h = rawH;
    for (const z of flattenZones) {
        const d = dir.angleTo(z.dir);
        if (d >= z.outerRadius) continue;
        let t;
        if (d <= z.innerRadius) t = 1;
        else {
            const f = 1 - (d - z.innerRadius) / (z.outerRadius - z.innerRadius);
            t = f * f * (3 - 2 * f); // smoothstep - transisi halus, nggak ada "tebing" di tepi zona
        }
        h = THREE.MathUtils.lerp(h, z.height, t);
    }
    return h;
}

export function getPlanetTerrainHeight(dir) {
    const continent = getContinentValue(dir);
    const detail = sphereNoise(dir, 3, 3);
    const rugged = sphereNoise(dir, 6, 4);
    let h = continent * 7 + detail * 2.2;
    if (continent > 0.2) {
        // Ramp pegunungan dilebarin (0.2->0.95, dulu cuma 0.15->0.65) & di-smoothstep biar
        // transisi pantai->gunung nggak berasa kayak "tebing" tiba-tiba muncul dalam jarak
        // pendek - sekarang naiknya lebih bertahap & natural.
        const mountainT = THREE.MathUtils.clamp((continent - 0.2) / 0.75, 0, 1);
        const smoothT = mountainT * mountainT * (3 - 2 * mountainT);
        h += smoothT * 15 + rugged * smoothT * 2.5;
    }
    if (continent < -0.3) {
        h -= (Math.abs(continent) - 0.3) * 7;
    }
    return applyFlatten(dir, h);
}

const BIOME_SAND = new THREE.Color(0xcbb679);
const BIOME_GRASS_A = new THREE.Color(0x4a7c2e);
const BIOME_GRASS_B = new THREE.Color(0x5c9436);
const BIOME_ROCK = new THREE.Color(0x6b6b63);
const BIOME_ROCK_DARK = new THREE.Color(0x514c46);
const BIOME_SNOW = new THREE.Color(0xf4f6fa);
const BIOME_DEEP = new THREE.Color(0x223a1a);
const _c1 = new THREE.Color(), _c2 = new THREE.Color();

export function planetColorAt(dir, h) {
    let c;
    if (h < WATER_LEVEL - 1) c = _c1.copy(BIOME_DEEP);
    else if (h < WATER_LEVEL + 0.5) {
        const t = THREE.MathUtils.clamp((WATER_LEVEL + 0.5 - h) / 1.5, 0, 1);
        c = _c1.copy(BIOME_SAND).lerp(BIOME_DEEP, t);
    } else if (h < 9) {
        const grassMix = (Math.sin(dir.x * 9) * Math.cos(dir.z * 9) + 1) / 2;
        const baseGrass = _c2.copy(BIOME_GRASS_A).lerp(BIOME_GRASS_B, grassMix);
        const shoreT = THREE.MathUtils.clamp((h - WATER_LEVEL) / 1.5, 0, 1);
        c = _c1.copy(BIOME_SAND).lerp(baseGrass, shoreT);
    } else if (h < 16) {
        const t = THREE.MathUtils.clamp((h - 9) / 7, 0, 1);
        c = _c1.copy(BIOME_ROCK).lerp(BIOME_ROCK_DARK, 0.2).lerp(BIOME_SNOW, t);
    } else {
        c = _c1.copy(BIOME_SNOW);
    }
    // Tudung es di kutub planet - efek "ini beneran planet" yang keliatan dari jauh, independen
    // dari ketinggian terrain lokal.
    const poleT = THREE.MathUtils.clamp((Math.abs(dir.y) - 0.78) / 0.18, 0, 1);
    if (poleT > 0) c.lerp(BIOME_SNOW, poleT * 0.85);
    return c.clone();
}

function createCubeFace(radius, segments, normal, uAxis, vAxis, heightFn, colorFn) {
    const grid = segments + 1;
    const positions = new Float32Array(grid * grid * 3);
    const colors = new Float32Array(grid * grid * 3);
    const indices = [];
    const dir = new THREE.Vector3();
    for (let iy = 0; iy < grid; iy++) {
        for (let ix = 0; ix < grid; ix++) {
            const u = (ix / segments) * 2 - 1;
            const v = (iy / segments) * 2 - 1;
            dir.copy(normal).addScaledVector(uAxis, u).addScaledVector(vAxis, v).normalize();
            const h = heightFn(dir);
            const idx = (iy * grid + ix) * 3;
            positions[idx] = dir.x * (radius + h);
            positions[idx + 1] = dir.y * (radius + h);
            positions[idx + 2] = dir.z * (radius + h);
            const c = colorFn(dir, h);
            colors[idx] = c.r; colors[idx + 1] = c.g; colors[idx + 2] = c.b;
        }
    }
    for (let iy = 0; iy < segments; iy++) {
        for (let ix = 0; ix < segments; ix++) {
            const a = iy * grid + ix, b = a + 1, c = a + grid, d = c + 1;
            indices.push(a, c, b, b, c, d);
        }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
}

export function buildPlanetGeometry(radius, segments, heightFn, colorFn) {
    const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
    const faces = [
        { n: X, u: Y, v: Z }, { n: X.clone().negate(), u: Y, v: Z.clone().negate() },
        { n: Y, u: Z, v: X }, { n: Y.clone().negate(), u: Z.clone().negate(), v: X },
        { n: Z, u: X, v: Y }, { n: Z.clone().negate(), u: X.clone().negate(), v: Y },
    ];
    const geometries = faces.map(f => createCubeFace(radius, segments, f.n, f.u, f.v, heightFn, colorFn));
    return mergeGeometries(geometries);
}

// Bikin mesh planet + lautan, dan tempel ke scene. segments=100 -> ~(101*101*6)=~61k vertex,
// cukup detail tapi masih ringan buat WebGL modern.
export function createPlanetMeshes(scene, segments = 100, colorFn = planetColorAt) {
    const planetGeo = buildPlanetGeometry(PLANET_RADIUS, segments, getPlanetTerrainHeight, colorFn);
    const planetMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
    const planetMesh = new THREE.Mesh(planetGeo, planetMat);
    planetMesh.receiveShadow = true;
    planetMesh.castShadow = true;
    planetMesh.name = 'planet';
    scene.add(planetMesh);

    // metalness tinggi + flatShading dulu bikin air keliatan kayak kaca retak-retak berbintik
    // hitam (facet metal tanpa environment map = item kalau nggak pas mantulin cahaya) - sekarang
    // dibikin lebih "air biasa": halus (smooth shading, bola-nya emang mulus jadi nggak masalah)
    // & metalness rendah biar warnanya rata, nggak belang-belang.
    const waterGeo = new THREE.SphereGeometry(PLANET_RADIUS + WATER_LEVEL, 96, 64);
    const waterMat = new THREE.MeshStandardMaterial({ color: 0x1e6da3, transparent: true, opacity: 0.85, roughness: 0.35, metalness: 0.08, flatShading: false });
    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.name = 'ocean';
    scene.add(waterMesh);

    return { planetMesh, waterMesh, planetMat, waterMat };
}

// Helper dipakai di mana-mana: kasih arah 3D & object (pohon/rumah/hewan/dsb), taruh dia berdiri
// tegak di permukaan planet pas di titik itu (posisi = arah * jarak, orientasi = lokal "atas"-nya
// ngikutin arah itu juga, biar dindingnya nggak nembus/ngambang dari permukaan).
export function placeOnPlanet(object3d, dir, heightAboveSurface = 0) {
    const h = getPlanetTerrainHeight(dir);
    object3d.position.copy(dir).multiplyScalar(PLANET_RADIUS + h + heightAboveSurface);
    object3d.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    return h;
}

// Sampling arah acak tapi seeded-reproducible dipakai buat sebar entitas (pohon/hewan/dll) -
// pakai generator sendiri (bukan Math.random polos) di tempat yang butuh hasil konsisten;
// tempat lain masih bebas pakai Math.random untuk variasi visual (skala/rotasi).
export function randomDirection(rand = Math.random) {
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(rand() * 2 - 1);
    return new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi));
}
