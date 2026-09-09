// ============ HEWAN-HEWAN (4 spesies, wandering di permukaan planet) ============
// Dulu cuma rusa & kelinci. Sekarang ditambah kambing gunung (suka area tinggi/berbatu) &
// rubah (suka area rendah/hutan) - variasi tempat tinggal bikin planet-nya kerasa lebih hidup.
import * as THREE from 'three';
import { getPlanetTerrainHeight, placeOnPlanet, PLANET_RADIUS, WATER_LEVEL } from './planet-terrain.js';
import { isInKeepout } from './trees.js';

function buildDeer() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, flatShading: true });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 1.2, 4, 8), bodyMat);
    body.rotation.z = Math.PI / 2; body.position.y = 1.1; body.castShadow = true;
    g.add(body);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.8, 8), bodyMat);
    neck.position.set(0.9, 1.5, 0); neck.rotation.z = -Math.PI / 5;
    g.add(neck);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), bodyMat);
    head.position.set(1.25, 1.9, 0);
    g.add(head);
    for (const s of [1, -1]) {
        const antler = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 0.5, 6), bodyMat);
        antler.position.set(1.25, 2.3, s * 0.15); antler.rotation.z = -Math.PI / 8;
        g.add(antler);
    }
    for (const [dx, dz] of [[0.5, 0.3], [0.5, -0.3], [-0.5, 0.3], [-0.5, -0.3]]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.1, 1.2, 8), bodyMat);
        leg.position.set(dx, 0.5, dz);
        g.add(leg);
    }
    g.userData.legHeight = 0.5;
    return g;
}

function buildRabbit() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xd9d0c0, flatShading: true });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), mat);
    body.position.y = 0.35; body.scale.set(1, 0.85, 1.3); body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), mat);
    head.position.set(0.35, 0.5, 0);
    g.add(head);
    for (const s of [1, -1]) {
        const ear = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.4, 6), mat);
        ear.position.set(0.35, 0.85, s * 0.1); ear.rotation.z = -0.15 * s;
        g.add(ear);
    }
    g.userData.legHeight = 0.15;
    return g;
}

function buildGoat() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xe8e4d8, flatShading: true });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, flatShading: true });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.9, 4, 8), mat);
    body.rotation.z = Math.PI / 2; body.position.y = 0.75; body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), mat);
    head.position.set(0.75, 1.05, 0);
    g.add(head);
    for (const s of [1, -1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.35, 5), darkMat);
        horn.position.set(0.75, 1.3, s * 0.1); horn.rotation.z = Math.PI + 0.3;
        g.add(horn);
    }
    for (const [dx, dz] of [[0.35, 0.2], [0.35, -0.2], [-0.35, 0.2], [-0.35, -0.2]]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.75, 6), darkMat);
        leg.position.set(dx, 0.37, dz);
        g.add(leg);
    }
    g.userData.legHeight = 0.37;
    return g;
}

function buildFox() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xc9622e, flatShading: true });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf2ece0, flatShading: true });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.7, 4, 8), mat);
    body.rotation.z = Math.PI / 2; body.position.y = 0.45; body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.4, 8), mat);
    head.position.set(0.55, 0.55, 0); head.rotation.z = Math.PI / 2;
    g.add(head);
    for (const s of [1, -1]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 6), mat);
        ear.position.set(0.5, 0.78, s * 0.12);
        g.add(ear);
    }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 8), whiteMat);
    tail.position.set(-0.55, 0.5, 0); tail.rotation.z = -Math.PI / 2.3;
    g.add(tail);
    for (const [dx, dz] of [[0.25, 0.15], [0.25, -0.15], [-0.25, 0.15], [-0.25, -0.15]]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.4, 6), mat);
        leg.position.set(dx, 0.2, dz);
        g.add(leg);
    }
    g.userData.legHeight = 0.2;
    return g;
}

const ANIMAL_BUILDERS = {
    deer: { build: buildDeer, hp: 40, speed: 6, wanderRadius: 0.05, habitat: (h, cont) => h > 0.5 && h < 8 },
    rabbit: { build: buildRabbit, hp: 15, speed: 4, wanderRadius: 0.03, habitat: (h, cont) => h > -0.5 && h < 6 },
    goat: { build: buildGoat, hp: 30, speed: 5, wanderRadius: 0.04, habitat: (h, cont) => h > 5 },
    fox: { build: buildFox, hp: 20, speed: 7, wanderRadius: 0.06, habitat: (h, cont) => h > -0.5 && h < 5 },
};

export class Animal {
    constructor(type, homeDir) {
        const def = ANIMAL_BUILDERS[type];
        this.type = type;
        this.def = def;
        this.hp = def.hp;
        this.maxHp = def.hp;
        this.alive = true;
        this.homeDir = homeDir.clone();
        this.dir = homeDir.clone();
        this.group = def.build();
        this.targetDir = this.pickWanderTarget();
        this.state = 'idle';
        this.stateTimer = 1 + Math.random() * 2;
        this.legPhase = Math.random() * Math.PI * 2;
        placeOnPlanet(this.group, this.dir, 0);
    }

    pickWanderTarget() {
        const seed = Math.abs(this.homeDir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        const u = new THREE.Vector3().crossVectors(seed, this.homeDir).normalize();
        const v = new THREE.Vector3().crossVectors(this.homeDir, u).normalize();
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * this.def.wanderRadius;
        return this.homeDir.clone().addScaledVector(u, Math.cos(angle) * r).addScaledVector(v, Math.sin(angle) * r).normalize();
    }

    update(delta) {
        if (!this.alive) return;
        this.stateTimer -= delta;
        if (this.stateTimer <= 0) {
            if (this.state === 'idle') { this.state = 'walk'; this.targetDir = this.pickWanderTarget(); this.stateTimer = 3 + Math.random() * 4; }
            else { this.state = 'idle'; this.stateTimer = 2 + Math.random() * 3; }
        }
        if (this.state === 'walk') {
            const step = this.def.speed * delta / PLANET_RADIUS;
            this.dir.lerp(this.targetDir, Math.min(1, step * 8)).normalize();
            this.legPhase += delta * 8;
        }
        placeOnPlanet(this.group, this.dir, 0);
        // Hadapin arah gerak (kasar - cukup buat visual, nggak perlu presisi FPS-controller)
        const toward = this.targetDir.clone().sub(this.dir);
        if (toward.lengthSq() > 1e-6) {
            const up = this.dir.clone();
            toward.addScaledVector(up, -toward.dot(up)).normalize();
            if (toward.lengthSq() > 1e-6) {
                const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), toward, up);
                this.group.quaternion.setFromRotationMatrix(m);
                this.group.rotateY(Math.PI / 2);
            }
        }
        if (this.state === 'walk') {
            this.group.position.y += Math.sin(this.legPhase) * 0.03; // gaya jalan sederhana
        }
    }

    takeDamage(amount) {
        this.hp -= amount;
        if (this.hp <= 0 && this.alive) {
            this.alive = false;
            this.group.visible = false;
        }
    }
}

export function spawnAnimals(scene, countPerSpecies = 40, rand = Math.random) {
    const animals = [];
    const types = Object.keys(ANIMAL_BUILDERS);
    for (const type of types) {
        const def = ANIMAL_BUILDERS[type];
        let placed = 0, attempts = 0;
        while (placed < countPerSpecies && attempts < countPerSpecies * 20) {
            attempts++;
            const theta = rand() * Math.PI * 2, phi = Math.acos(rand() * 2 - 1);
            const dir = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi));
            if (Math.abs(dir.y) > 0.75) continue;
            const h = getPlanetTerrainHeight(dir);
            if (h < WATER_LEVEL) continue;
            if (!def.habitat(h)) continue;
            if (isInKeepout(dir)) continue;
            const animal = new Animal(type, dir);
            scene.add(animal.group);
            animals.push(animal);
            placed++;
        }
    }
    return animals;
}
