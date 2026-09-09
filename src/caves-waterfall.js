// ============ GUA & AIR TERJUN (versi planet) ============
// Air terjun di versi datar "mengukir" channel langsung ke fungsi tinggi terrain. Di planet,
// height function-nya (planet-terrain.js) sengaja dibikin nggak tau apa-apa soal lokasi
// gameplay (desa/kota/dll) biar tetap murni & gampang di-cache/di-generate - jadi air terjunnya
// di sini dibikin sebagai OVERLAY visual (lembar air + kolam) yang ditempel ngikutin lereng
// alami di sekitar titik pegunungan yang udah dipilih (WATERFALL_TOP), bukan ngubah mesh
// terrain-nya. Hasilnya tetap kelihatan menyatu karena titiknya memang dipilih di lereng gunung
// yang nurun ke arah desa.
import * as THREE from 'three';
import { getPlanetTerrainHeight, placeOnPlanet, PLANET_RADIUS, WATER_LEVEL } from './planet-terrain.js';
import { VILLAGE, CAVE_WEST, CAVE_EAST, WATERFALL_TOP, slerpDir } from './village-city.js';

function makeGlowTexture(innerColor, outerColor) {
    const size = 128;
    const cnv = document.createElement('canvas');
    cnv.width = cnv.height = size;
    const ctx = cnv.getContext('2d');
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, innerColor); grad.addColorStop(0.4, innerColor); grad.addColorStop(1, outerColor);
    ctx.fillStyle = grad; ctx.fillRect(0, 0, size, size);
    return new THREE.CanvasTexture(cnv);
}

export function buildCave(scene, dir) {
    // Versi lama: dodecahedron abu-abu RADIUS 8 ngambang gitu aja di tanah - keliatan kayak
    // "batu segede itu jatuh dari langit", bukan mulut gua alami (makanya ditegur pemain). Sekarang
    // jauh lebih kecil, separuh KETANEM di tanah (biar nyambung ke permukaan, bukan ngambang),
    // warnanya disamain ke warna biome batu/tanah sekitar, dan mulut guanya dikasih "bingkai"
    // biar kebaca sebagai lubang gua, bukan cuma tabung item nempel.
    const cave = new THREE.Group();
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b6659, flatShading: true, roughness: 1 });
    const mound = new THREE.Mesh(new THREE.IcosahedronGeometry(4.2, 1), rockMat);
    mound.scale.set(1.35, 0.6, 1.2);
    mound.position.y = 0.6; // separuh ketanem, bukan duduk penuh di atas tanah
    mound.castShadow = true; mound.receiveShadow = true;
    cave.add(mound);

    const hole = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.9, 5, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x0b0b0c, side: THREE.DoubleSide }));
    hole.position.set(0, 1.5, 2.6); hole.rotation.x = Math.PI / 2;
    cave.add(hole);

    const archMat = new THREE.MeshStandardMaterial({ color: 0x57534a, flatShading: true, roughness: 1 });
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.85, 0.55, 6, 12, Math.PI), archMat);
    arch.position.set(0, 1.5, 2.6);
    arch.rotation.z = Math.PI;
    cave.add(arch);

    const light = new THREE.PointLight(0x6688ff, 0.35, 8);
    light.position.set(0, 1.4, 1.6);
    cave.add(light);

    placeOnPlanet(cave, dir, 0);
    scene.add(cave);
    return { group: cave, dir: dir.clone(), radius: 6 };
}

export function buildCaves(scene) {
    return [buildCave(scene, CAVE_WEST.dir), buildCave(scene, CAVE_EAST.dir)];
}

// Cari titik "kolam" di sepanjang jalur WATERFALL_TOP -> VILLAGE, sekitar 70% perjalanan (biar
// dekat dasar lereng), lalu bikin lembar air yang jatuh ngikutin garis lurus 3D antara dua
// titik itu (posisi dunia, bukan cuma arah).
export function buildWaterfall(scene) {
    const topDir = WATERFALL_TOP.dir;
    const topH = getPlanetTerrainHeight(topDir);
    const bottomDir = slerpDir(topDir, VILLAGE.dir, 0.55);
    const bottomH = Math.min(getPlanetTerrainHeight(bottomDir), WATER_LEVEL + 1.5);

    const topPos = topDir.clone().multiplyScalar(PLANET_RADIUS + topH);
    const bottomPos = bottomDir.clone().multiplyScalar(PLANET_RADIUS + WATER_LEVEL + 0.3);

    const group = new THREE.Group();
    const dir3 = new THREE.Vector3().subVectors(bottomPos, topPos);
    const fallLength = dir3.length();
    const yAxis = dir3.clone().normalize();
    let xAxis = new THREE.Vector3().crossVectors(topDir, yAxis);
    if (xAxis.lengthSq() < 1e-6) xAxis.set(1, 0, 0);
    xAxis.normalize();
    const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();
    const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
    const quat = new THREE.Quaternion().setFromRotationMatrix(basis);

    const waterTex = makeGlowTexture('rgba(235,248,255,0.95)', 'rgba(210,240,255,0.25)');
    waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
    waterTex.repeat.set(1, 8);
    const sheet = new THREE.Mesh(
        new THREE.PlaneGeometry(4, fallLength, 1, 16),
        new THREE.MeshBasicMaterial({ map: waterTex, color: 0xcfeeff, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false })
    );
    sheet.quaternion.copy(quat);
    group.add(sheet);
    group.position.copy(topPos).add(bottomPos).multiplyScalar(0.5);
    scene.add(group);

    const pool = new THREE.Mesh(
        new THREE.CircleGeometry(9, 24),
        new THREE.MeshStandardMaterial({ color: 0x1e6091, transparent: true, opacity: 0.78, roughness: 0.15, metalness: 0.6 })
    );
    placeOnPlanet(pool, bottomDir, 0.05);
    pool.rotateX(-Math.PI / 2);
    scene.add(pool);

    const mistTex = makeGlowTexture('rgba(255,255,255,0.7)', 'rgba(255,255,255,0)');
    const mistSprites = [];
    for (let i = 0; i < 10; i++) {
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, opacity: 0, depthWrite: false }));
        spr.scale.setScalar(2.5 + Math.random() * 2);
        const jitterDir = bottomDir.clone().addScaledVector(xAxis, (Math.random() - 0.5) * 0.03).addScaledVector(zAxis, (Math.random() - 0.5) * 0.03).normalize();
        spr.position.copy(jitterDir).multiplyScalar(PLANET_RADIUS + WATER_LEVEL + 1 + Math.random() * 1.5);
        spr.userData.life = 0.3 + Math.random() * 3;
        spr.userData.baseDir = jitterDir;
        scene.add(spr);
        mistSprites.push(spr);
    }

    return { sheet, waterTex, mistSprites, topDir, bottomDir };
}
