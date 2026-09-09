// ============ PLAYER CONTROLLER (gravitasi ke pusat planet) ============
// PointerLockControls bawaan three.js nganggep dunia selalu "atas"-nya sumbu Y tetap - nggak
// bisa dipakai di sini karena "atas" versi kita berubah terus ngikutin di mana pemain berdiri
// di permukaan bola. Jadi kontrolnya ditulis sendiri: pointer-lock manual + orientasi kamera
// dihitung tiap frame dari basis lokal (forward/right/up) yang di-"parallel transport" (proyeksi
// ulang ke bidang singgung yang baru) tiap kali posisi pemain berubah, biar nggak ada patahan
// atau gimbal-lock aneh bahkan pas jalan deket kutub planet.
import * as THREE from 'three';
import { getPlanetTerrainHeight, PLANET_RADIUS } from './planet-terrain.js';

export class PlanetPlayerController {
    constructor(camera, domElement, opts = {}) {
        this.camera = camera;
        this.domElement = domElement;
        this.eyeHeight = opts.eyeHeight ?? 1.7;
        this.gravity = opts.gravity ?? 22;
        this.jumpSpeed = opts.jumpSpeed ?? 9;
        this.walkSpeed = opts.walkSpeed ?? 9;
        this.sprintMultiplier = opts.sprintMultiplier ?? 1.7;
        this.mouseSensitivity = opts.mouseSensitivity ?? 0.0022;

        this.playerDir = (opts.startDir || new THREE.Vector3(0, 0, 1)).clone().normalize();
        this.altitude = 0;
        this.vertVel = 0;
        this.locked = false;

        // Basis lokal awal - dibangun dari playerDir + sembarang vektor non-paralel.
        this.upVec = this.playerDir.clone();
        const seed = Math.abs(this.upVec.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        this.rightVec = new THREE.Vector3().crossVectors(seed, this.upVec).normalize();
        this.forwardVec = new THREE.Vector3().crossVectors(this.upVec, this.rightVec).normalize();
        this.pitch = 0;

        this.keys = {};
        this._onKeyDown = (e) => {
            this.keys[e.code] = true;
            if (e.code === 'Space' && this.altitude <= 0.05) this.vertVel = this.jumpSpeed;
        };
        this._onKeyUp = (e) => { this.keys[e.code] = false; };
        this._onMouseMove = (e) => {
            if (!this.locked) return;
            const yawDelta = -e.movementX * this.mouseSensitivity;
            const pitchDelta = -e.movementY * this.mouseSensitivity;
            this.forwardVec.applyAxisAngle(this.upVec, yawDelta);
            this.rightVec.applyAxisAngle(this.upVec, yawDelta);
            this.pitch = THREE.MathUtils.clamp(this.pitch + pitchDelta, -Math.PI / 2 + 0.04, Math.PI / 2 - 0.04);
        };
        this._onLockChange = () => { this.locked = document.pointerLockElement === this.domElement; };

        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('keyup', this._onKeyUp);
        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('pointerlockchange', this._onLockChange);
    }

    requestLock() { this.domElement.requestPointerLock(); }
    exitLock() { document.exitPointerLock(); }

    // Pindahin pemain ke arah tertentu secara instan (buat spawn/respawn/teleport), plus reset
    // basis lokalnya biar nggak ada "loncatan" orientasi kamera.
    teleportToDir(dir, altitude = 0) {
        this.playerDir.copy(dir).normalize();
        this.altitude = altitude;
        this.vertVel = 0;
        this.upVec.copy(this.playerDir);
        const seed = Math.abs(this.upVec.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        this.rightVec.crossVectors(seed, this.upVec).normalize();
        this.forwardVec.crossVectors(this.upVec, this.rightVec).normalize();
    }

    isMoving() {
        return !!(this.keys['KeyW'] || this.keys['KeyS'] || this.keys['KeyA'] || this.keys['KeyD']);
    }
    isSprinting() { return !!this.keys['ShiftLeft'] && this.isMoving(); }
    isNearWater(waterY) { return false; } // diisi dari luar lewat cek ketinggian, lihat main.js

    update(delta) {
        let moveDir = new THREE.Vector3();
        if (this.keys['KeyW']) moveDir.add(this.forwardVec);
        if (this.keys['KeyS']) moveDir.sub(this.forwardVec);
        if (this.keys['KeyA']) moveDir.sub(this.rightVec);
        if (this.keys['KeyD']) moveDir.add(this.rightVec);
        if (moveDir.lengthSq() > 0) {
            const speed = this.walkSpeed * (this.isSprinting() ? this.sprintMultiplier : 1);
            moveDir.normalize().multiplyScalar(speed * delta);
            // Gerak di bidang singgung, lalu diproyeksikan balik ke permukaan bola (normalize).
            this.playerDir.add(moveDir.multiplyScalar(1 / PLANET_RADIUS)).normalize();
        }

        this.vertVel -= this.gravity * delta;
        this.altitude += this.vertVel * delta;
        if (this.altitude < 0) { this.altitude = 0; this.vertVel = 0; }

        const h = getPlanetTerrainHeight(this.playerDir);
        const dist = PLANET_RADIUS + h + this.eyeHeight + this.altitude;
        const playerPos = this.playerDir.clone().multiplyScalar(dist);

        const newUp = this.playerDir;
        this.forwardVec.addScaledVector(newUp, -this.forwardVec.dot(newUp));
        if (this.forwardVec.lengthSq() < 1e-8) {
            const seed = Math.abs(newUp.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
            this.forwardVec.crossVectors(newUp, seed).normalize();
        } else {
            this.forwardVec.normalize();
        }
        this.rightVec.crossVectors(this.forwardVec, newUp).normalize();
        this.upVec.copy(newUp);

        const lookDir = this.forwardVec.clone().applyAxisAngle(this.rightVec, this.pitch);
        const camUp = this.upVec.clone().applyAxisAngle(this.rightVec, this.pitch);
        const m = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), lookDir, camUp);
        this.camera.quaternion.setFromRotationMatrix(m);
        this.camera.position.copy(playerPos);

        return { playerPos, terrainHeight: h, isOnGround: this.altitude <= 0.001 };
    }

    dispose() {
        document.removeEventListener('keydown', this._onKeyDown);
        document.removeEventListener('keyup', this._onKeyUp);
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('pointerlockchange', this._onLockChange);
    }
}
