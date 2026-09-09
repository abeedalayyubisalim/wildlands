// ============ BATU-BATU KECIL (dekorasi, tersebar di permukaan) ============
// Sebelumnya nggak ada sama sekali sistem batu kecil di planet (yang ada cuma "batu gua" raksasa
// yang salah kaprah - lihat caves-waterfall.js). Ini nambahin gerombolan batu kecil biasa,
// mirip yang ada di versi dunia-datar, buat ngisi tekstur visual terrain (apalagi di area
// berbatu/pegunungan) - satu InstancedMesh buat SELURUH planet (sama kayak pohon).
import * as THREE from 'three';
import { getPlanetTerrainHeight, placeOnPlanet, WATER_LEVEL } from './planet-terrain.js';
import { isInKeepout } from './trees.js';

const rockGeo = new THREE.DodecahedronGeometry(0.75, 0);
const rockMatLow = new THREE.MeshStandardMaterial({ color: 0x7a7668, flatShading: true, roughness: 0.95 });
const rockMatHigh = new THREE.MeshStandardMaterial({ color: 0x8f8b7d, flatShading: true, roughness: 0.95 });

export function scatterRocks(scene, count = 900, rand = Math.random) {
    const meshLow = new THREE.InstancedMesh(rockGeo, rockMatLow, Math.ceil(count * 0.65));
    const meshHigh = new THREE.InstancedMesh(rockGeo, rockMatHigh, Math.ceil(count * 0.45));
    meshLow.castShadow = meshHigh.castShadow = true;
    meshLow.receiveShadow = meshHigh.receiveShadow = true;
    meshLow.count = meshHigh.count = 0;
    scene.add(meshLow, meshHigh);

    const dummy = new THREE.Object3D();
    const dir = new THREE.Vector3();
    let placed = 0, attempts = 0, iLow = 0, iHigh = 0;
    const maxAttempts = count * 6;
    while (placed < count && attempts < maxAttempts) {
        attempts++;
        const theta = rand() * Math.PI * 2, phi = Math.acos(rand() * 2 - 1);
        dir.set(Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi));
        const h = getPlanetTerrainHeight(dir);
        if (h < WATER_LEVEL + 0.3) continue; // jangan di dalam air
        if (isInKeepout(dir)) continue; // jangan nyempil di desa/kota/gua
        // Lebih banyak batu di area tinggi/berbatu (pegunungan), tapi tetep ada dikit di dataran
        const highGround = h > 8;
        if (!highGround && rand() > 0.35) continue;

        placeOnPlanet(dummy, dir, 0);
        dummy.rotateY(rand() * Math.PI * 2);
        dummy.rotateX((rand() - 0.5) * 0.4);
        const scale = 0.5 + rand() * 1.4;
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();

        if (highGround) {
            if (iHigh >= meshHigh.instanceMatrix.count) continue;
            meshHigh.setMatrixAt(iHigh++, dummy.matrix);
        } else {
            if (iLow >= meshLow.instanceMatrix.count) continue;
            meshLow.setMatrixAt(iLow++, dummy.matrix);
        }
        placed++;
    }
    meshLow.count = iLow; meshLow.instanceMatrix.needsUpdate = true;
    meshHigh.count = iHigh; meshHigh.instanceMatrix.needsUpdate = true;
    return { meshLow, meshHigh };
}
