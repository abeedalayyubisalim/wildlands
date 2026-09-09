// ============ DRONE MUSUH & BOSS (di-port dari versi dunia-datar) ============
// Sama kayak hewan (lihat animals-ai.js) - drone hover di atas terrain, tapi posisinya
// dikontrol manual di sini (bukan lewat placeOnPlanet) soalnya orientasinya perlu NGADEP KE
// PEMAIN pas ALERT/CHASE/ATTACK (placeOnPlanet cuma nyamain "atas" ke arah radial, nggak bisa
// sekalian ngadepin target - jadi orientasinya kita bangun sendiri pake teknik yang sama kayak
// Animal.update: proyeksiin arah target ke tangent-plane lokal, terus lookAt).
import * as THREE from 'three';
import { PLANET_RADIUS } from './planet-terrain.js';

function buildDroneModel(isBoss) {
    const scale = isBoss ? 2.7 : 1;
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({
        color: isBoss ? 0x222222 : 0x333333, metalness: 0.85, roughness: 0.25, emissive: 0x000000,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.5 * scale, 0.4 * scale, 1.5 * scale), bodyMat);
    body.castShadow = true;
    g.add(body);

    const armMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1c });
    const arms = [[0.9, 0.9], [-0.9, 0.9], [0.9, -0.9], [-0.9, -0.9]];
    const rotors = [];
    const rotorMat = new THREE.MeshBasicMaterial({ color: isBoss ? 0xff2222 : 0x888888, transparent: true, opacity: isBoss ? 0.7 : 0.5 });
    for (const [ax, az] of arms) {
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * scale, 0.08 * scale, 1.5 * scale, 8), armMat);
        arm.rotation.z = Math.PI / 2;
        arm.position.set(ax * scale / 2, 0, az * scale / 2);
        arm.castShadow = true;
        g.add(arm);
        const rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.4 * scale, 0.4 * scale, 0.06 * scale, 16), rotorMat);
        rotor.position.set(ax * scale, 0.12 * scale, az * scale);
        rotors.push(rotor);
        g.add(rotor);
    }

    const indicatorMat = new THREE.MeshBasicMaterial({ color: isBoss ? 0xff0000 : 0x22ff44 });
    const indicator = new THREE.Mesh(new THREE.SphereGeometry(0.16 * scale, 8, 8), indicatorMat);
    indicator.position.set(0, -0.25 * scale, 0);
    g.add(indicator);

    let spotlight = null, beam = null;
    if (isBoss) {
        spotlight = new THREE.SpotLight(0xff2222, 4, 55, Math.PI / 4, 0.5, 1);
        spotlight.position.set(0, -1, 0);
        spotlight.target.position.set(0, -20, 0);
        g.add(spotlight, spotlight.target);
        const beamMat = new THREE.MeshBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false });
        beam = new THREE.Mesh(new THREE.ConeGeometry(6, 24, 16, 1, true), beamMat);
        beam.position.set(0, -13, 0);
        beam.rotation.x = Math.PI;
        g.add(beam);
    }

    return { group: g, bodyMat, rotors, indicatorMat, spotlight, beam };
}

export class HoverDrone {
    constructor(homeDir, opts = {}) {
        this.isBoss = !!opts.isBoss;
        this.homeDir = homeDir.clone();
        this.dir = homeDir.clone();
        this.maxHp = opts.hp ?? (this.isBoss ? 500 : 60);
        this.hp = this.maxHp;
        this.speed = opts.speed ?? 4;
        this.chaseSpeed = opts.chaseSpeed ?? (this.isBoss ? 7 : 6.5);
        this.detectionRange = opts.detectionRange ?? (this.isBoss ? 45 : 26);
        this.attackRange = opts.attackRange ?? (this.isBoss ? 9 : 4.5);
        this.damage = opts.damage ?? (this.isBoss ? 22 : 10);
        this.hoverHeight = opts.hoverHeight ?? (this.isBoss ? 16 : 8);
        this.patrolRadiusWorld = opts.patrolRadius ?? 40;
        this.hitRadius = this.isBoss ? 3.4 : 1.5;

        this.state = 'PATROL';
        this.patrolAngle = Math.random() * Math.PI * 2;
        this.alertTimer = 0;
        this.lostTimer = 0;
        this.attackCooldown = 0;
        this.hitFlashTimer = 0;
        this.bobSeed = Math.random() * 20;
        this.destroyed = false;
        this.onAlertOnce = false;

        const seed = Math.abs(this.homeDir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        this.u = new THREE.Vector3().crossVectors(seed, this.homeDir).normalize();
        this.v = new THREE.Vector3().crossVectors(this.homeDir, this.u).normalize();

        const model = buildDroneModel(this.isBoss);
        this.group = model.group;
        this.bodyMat = model.bodyMat;
        this.rotors = model.rotors;
        this.indicatorMat = model.indicatorMat;
        this.spotlight = model.spotlight;
        this.beam = model.beam;

        this.group.position.copy(this.dir).multiplyScalar(PLANET_RADIUS + this.hoverHeight);
    }

    takeDamage(amount) {
        if (this.destroyed) return;
        this.hp = Math.max(0, this.hp - amount);
        this.hitFlashTimer = 0.15;
        if (this.hp <= 0) this.destroy();
    }

    destroy() {
        this.destroyed = true;
        this.group.visible = false;
    }

    // playerDir: arah 3D (dari pusat planet) posisi pemain sekarang - dipake buat kejar & nembak.
    // playerWorldPos: posisi dunia kamera - dipake buat itung jarak beneran (termasuk altitude).
    // onAttack(damage): dipanggil pas drone berhasil nyerang pemain.
    update(delta, playerWorldPos, playerDir, onAttack) {
        if (this.destroyed) return;
        this.attackCooldown = Math.max(0, this.attackCooldown - delta);
        this.hitFlashTimer = Math.max(0, this.hitFlashTimer - delta);
        for (const r of this.rotors) r.rotation.y += delta * 20;

        const distToPlayer = this.group.position.distanceTo(playerWorldPos);
        let lookTargetDir = null;

        switch (this.state) {
            case 'PATROL': {
                this.patrolAngle += this.speed * delta * 0.05;
                const angR = this.patrolRadiusWorld / PLANET_RADIUS;
                const targetDir = this.homeDir.clone()
                    .addScaledVector(this.u, Math.cos(this.patrolAngle) * angR)
                    .addScaledVector(this.v, Math.sin(this.patrolAngle) * angR)
                    .normalize();
                this.dir.lerp(targetDir, Math.min(1, delta * 1.2)).normalize();
                lookTargetDir = targetDir;
                if (distToPlayer < this.detectionRange) { this.state = 'ALERT'; this.alertTimer = 1.1; }
                break;
            }
            case 'ALERT': {
                lookTargetDir = playerDir;
                this.alertTimer -= delta;
                if (this.alertTimer <= 0) this.state = 'CHASE';
                break;
            }
            case 'CHASE': {
                const step = this.chaseSpeed * delta / PLANET_RADIUS;
                this.dir.lerp(playerDir, Math.min(1, step * 14)).normalize();
                lookTargetDir = playerDir;
                if (distToPlayer < this.attackRange) this.state = 'ATTACK';
                else if (distToPlayer > this.detectionRange * 2.6) { this.state = 'LOST'; this.lostTimer = 4; }
                break;
            }
            case 'ATTACK': {
                lookTargetDir = playerDir;
                if (distToPlayer > this.attackRange * 1.4) { this.state = 'CHASE'; break; }
                if (this.attackCooldown <= 0) {
                    this.attackCooldown = this.isBoss ? 1.4 : 1.6;
                    onAttack(this.damage);
                }
                break;
            }
            case 'LOST': {
                lookTargetDir = this.homeDir;
                this.lostTimer -= delta;
                const step = this.speed * delta / PLANET_RADIUS;
                this.dir.lerp(this.homeDir, Math.min(1, step * 6)).normalize();
                if (distToPlayer < this.detectionRange * 0.85) { this.state = 'CHASE'; }
                else if (this.lostTimer <= 0) { this.state = 'PATROL'; }
                break;
            }
        }

        const bob = Math.sin(performance.now() * 0.0018 + this.bobSeed) * (this.isBoss ? 1.0 : 0.5);
        this.group.position.copy(this.dir).multiplyScalar(PLANET_RADIUS + this.hoverHeight + bob);

        const up = this.dir;
        const toward = (lookTargetDir || this.homeDir).clone().sub(this.dir);
        toward.addScaledVector(up, -toward.dot(up));
        if (toward.lengthSq() > 1e-8) {
            toward.normalize();
            const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), toward, up);
            this.group.quaternion.setFromRotationMatrix(m);
            this.group.rotateY(Math.PI / 2);
        } else {
            this.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
        }

        this.indicatorMat.color.setHex(this.state === 'PATROL' ? (this.isBoss ? 0xff0000 : 0x22ff44) : 0xffaa00);
        this.bodyMat.emissive.setHex(this.hitFlashTimer > 0 ? 0xff3333 : 0x000000);
    }
}
