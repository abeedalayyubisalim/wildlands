// ============ POHON (4 spesies, sama kayak versi dunia datar) ============
// Sistemnya persis kayak game datar - digabung jadi satu geometry per spesies (batang+daun)
// lewat mergeGeometries supaya tetap bisa dipakein InstancedMesh (satu instance = satu pohon
// utuh). Bedanya cuma di penempatan: karena sekarang di permukaan bola, tiap pohon ditaruh di
// suatu ARAH 3D lalu diorientasikan biar "atas"-nya ngikutin arah itu (lihat placeOnPlanet).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getPlanetTerrainHeight, placeOnPlanet, WATER_LEVEL } from './planet-terrain.js';
import { VILLAGE, CITY, CAVE_WEST, CAVE_EAST } from './village-city.js';

// Zona "steril" di sekitar pemukiman/gua - dijauhin pas nyebar pohon (& hewan, lihat
// animals-ai.js) biar nggak ada pohon numbuh nembus dinding rumah/gedung atau nutupin gua.
const KEEPOUT = [
    { dir: VILLAGE.dir, radius: 0.09 },
    { dir: CITY.dir, radius: 0.11 },
    { dir: CAVE_WEST.dir, radius: 0.03 },
    { dir: CAVE_EAST.dir, radius: 0.03 },
];
export function isInKeepout(dir) {
    for (const k of KEEPOUT) if (dir.angleTo(k.dir) < k.radius) return true;
    return false;
}

function paintGeometry(geo, color) {
    const c = new THREE.Color(color);
    const count = geo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) { colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geo;
}

function buildTreeSpecies() {
    const species = {};
    {
        const trunk = new THREE.CylinderGeometry(0.22, 0.32, 1.4, 6).toNonIndexed();
        trunk.translate(0, 0.7, 0); paintGeometry(trunk, 0x5c4326);
        const tier1 = new THREE.ConeGeometry(1.7, 2.4, 7).toNonIndexed();
        tier1.translate(0, 2.4, 0); paintGeometry(tier1, 0x1f3d17);
        const tier2 = new THREE.ConeGeometry(1.25, 2.0, 7).toNonIndexed();
        tier2.translate(0, 3.5, 0); paintGeometry(tier2, 0x27481d);
        const tier3 = new THREE.ConeGeometry(0.75, 1.6, 7).toNonIndexed();
        tier3.translate(0, 4.45, 0); paintGeometry(tier3, 0x2f5a24);
        species.pine = mergeGeometries([trunk, tier1, tier2, tier3]);
    }
    {
        const trunk = new THREE.CylinderGeometry(0.3, 0.45, 1.7, 6).toNonIndexed();
        trunk.translate(0, 0.85, 0); paintGeometry(trunk, 0x6b4a2c);
        const b1 = new THREE.IcosahedronGeometry(1.3, 0).toNonIndexed();
        b1.translate(0, 2.5, 0); paintGeometry(b1, 0x4d7c2b);
        const b2 = new THREE.IcosahedronGeometry(1.0, 0).toNonIndexed();
        b2.translate(0.9, 2.2, 0.4); paintGeometry(b2, 0x5a8f34);
        const b3 = new THREE.IcosahedronGeometry(1.0, 0).toNonIndexed();
        b3.translate(-0.85, 2.15, -0.5); paintGeometry(b3, 0x466b26);
        const b4 = new THREE.IcosahedronGeometry(0.8, 0).toNonIndexed();
        b4.translate(0.1, 3.0, -0.7); paintGeometry(b4, 0x5a8f34);
        species.oak = mergeGeometries([trunk, b1, b2, b3, b4]);
    }
    {
        const trunk = new THREE.CylinderGeometry(0.14, 0.2, 2.6, 6).toNonIndexed();
        trunk.translate(0, 1.3, 0); paintGeometry(trunk, 0xdcd6c4);
        const foliage = new THREE.IcosahedronGeometry(1.05, 0).toNonIndexed();
        foliage.translate(0, 3.3, 0); paintGeometry(foliage, 0x8ba33a);
        const foliage2 = new THREE.IcosahedronGeometry(0.7, 0).toNonIndexed();
        foliage2.translate(0.6, 2.9, 0.3); paintGeometry(foliage2, 0x9db844);
        species.birch = mergeGeometries([trunk, foliage, foliage2]);
    }
    {
        const trunk = new THREE.CylinderGeometry(0.12, 0.3, 2.8, 6).toNonIndexed();
        trunk.translate(0, 1.4, 0); paintGeometry(trunk, 0x5b4a3a);
        const branch1 = new THREE.CylinderGeometry(0.06, 0.1, 1.1, 5).toNonIndexed();
        branch1.rotateZ(Math.PI / 3.2); branch1.translate(0.5, 2.5, 0); paintGeometry(branch1, 0x5b4a3a);
        const branch2 = new THREE.CylinderGeometry(0.05, 0.09, 0.9, 5).toNonIndexed();
        branch2.rotateZ(-Math.PI / 2.6); branch2.translate(-0.4, 2.7, 0.2); paintGeometry(branch2, 0x4a3c2e);
        species.dead = mergeGeometries([trunk, branch1, branch2]);
    }
    return species;
}

export const TREE_SPECIES_GEO = buildTreeSpecies();
export const sharedTreeMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
export const TREE_SPECIES_LIST = [
    { tag: 'pine', geo: TREE_SPECIES_GEO.pine, weight: 0.48 },
    { tag: 'oak', geo: TREE_SPECIES_GEO.oak, weight: 0.30 },
    { tag: 'birch', geo: TREE_SPECIES_GEO.birch, weight: 0.14 },
    { tag: 'dead', geo: TREE_SPECIES_GEO.dead, weight: 0.08 },
];

// Sebar N pohon ke seluruh permukaan planet (nyari arah acak, skip kalau di bawah air atau di
// area kutub/pegunungan tinggi). InstancedMesh-nya nggak lagi per-chunk (planet-nya finite,
// nggak ada streaming) - satu InstancedMesh per spesies buat SELURUH planet.
export function scatterTrees(scene, count = 3000, rand = Math.random) {
    const meshes = TREE_SPECIES_LIST.map(sp => {
        const mesh = new THREE.InstancedMesh(sp.geo, sharedTreeMat, Math.ceil(count * sp.weight * 1.15));
        mesh.castShadow = true; mesh.receiveShadow = true;
        mesh.userData.treeTag = sp.tag;
        mesh.count = 0;
        scene.add(mesh);
        return { tag: sp.tag, mesh, index: 0 };
    });

    const dummy = new THREE.Object3D();
    const dir = new THREE.Vector3();
    let placed = 0, attempts = 0;
    const maxAttempts = count * 6;
    while (placed < count && attempts < maxAttempts) {
        attempts++;
        const theta = rand() * Math.PI * 2, phi = Math.acos(rand() * 2 - 1);
        dir.set(Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi));
        const h = getPlanetTerrainHeight(dir);
        if (h < WATER_LEVEL + 0.4 || h > 13 || Math.abs(dir.y) > 0.8) continue; // air, puncak gunung, & kutub - nggak ada pohon
        if (isInKeepout(dir)) continue; // jangan numbuh nembus desa/kota/gua

        let roll = rand(), chosen = meshes[0];
        for (const tm of meshes) {
            const sp = TREE_SPECIES_LIST.find(s => s.tag === tm.tag);
            if (roll < sp.weight) { chosen = tm; break; }
            roll -= sp.weight;
        }
        if (chosen.index >= chosen.mesh.instanceMatrix.count) continue;

        placeOnPlanet(dummy, dir, 0);
        dummy.rotateY(rand() * Math.PI * 2);
        dummy.scale.setScalar(0.8 + rand() * 0.6);
        dummy.updateMatrix();
        chosen.mesh.setMatrixAt(chosen.index++, dummy.matrix);
        placed++;
    }
    meshes.forEach(tm => { tm.mesh.count = tm.index; tm.mesh.instanceMatrix.needsUpdate = true; });
    return meshes;
}
