// ============ SENJATA & PROJECTILE (versi ringkas) ============
// Sistem lengkap (busur/panah-api/batu + inventory) dari game dunia-datar sengaja disederhanakan
// di sini jadi satu "energy bolt" tanpa amunisi terbatas - fokus milestone ini adalah bikin
// drone/boss musuh bisa DILAWAN di planet, bukan porting seluruh sistem crafting/inventory
// (itu nanti nyusul). Proyektil terbang lurus (garis lurus di ruang 3D, bukan ngikutin
// lengkungan planet) - itu sudah cukup akurat untuk jarak tembak yang dipakai di sini.
import * as THREE from 'three';

const projGeo = new THREE.SphereGeometry(0.14, 8, 8);
const projMat = new THREE.MeshBasicMaterial({ color: 0x7dfff0 });
const sparkGeo = new THREE.SphereGeometry(0.4, 6, 6);

export class Projectile {
    constructor(pos, dir, speed = 95, damage = 18, life = 2.2) {
        this.mesh = new THREE.Mesh(projGeo, projMat);
        this.mesh.position.copy(pos);
        const trailGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6);
        const trail = new THREE.Mesh(trailGeo, projMat);
        trail.rotation.x = Math.PI / 2;
        trail.position.z = 0.35;
        this.mesh.add(trail);
        this.vel = dir.clone().normalize().multiplyScalar(speed);
        this.mesh.lookAt(pos.clone().add(this.vel));
        this.damage = damage;
        this.life = life;
        this.dead = false;
    }
    update(delta) {
        this.mesh.position.addScaledVector(this.vel, delta);
        this.life -= delta;
        if (this.life <= 0) this.dead = true;
    }
}

export function makeHitSpark(scene, pos) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe38a, transparent: true, opacity: 0.9 });
    const spark = new THREE.Mesh(sparkGeo, mat);
    spark.position.copy(pos);
    spark.userData.life = 0.28;
    scene.add(spark);
    return spark;
}

export function updateHitSparks(scene, sparks, delta) {
    for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.userData.life -= delta;
        const t = Math.max(0, s.userData.life / 0.28);
        s.material.opacity = t;
        s.scale.setScalar(1 + (1 - t) * 3.5);
        if (s.userData.life <= 0) {
            scene.remove(s);
            s.geometry === sparkGeo ? null : s.geometry.dispose();
            sparks.splice(i, 1);
        }
    }
}
