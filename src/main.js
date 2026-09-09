import * as THREE from 'three';
import { createPlanetMeshes, planetColorAt, getPlanetTerrainHeight, PLANET_RADIUS, WATER_LEVEL } from './planet-terrain.js';
import { PlanetPlayerController } from './player-controller.js';
import { scatterTrees, isInKeepout } from './trees.js';
import { VILLAGE, CITY, CAVE_WEST, CAVE_EAST, WATERFALL_TOP, buildVillage, buildCity, roadColorBlend } from './village-city.js';
import { buildCaves, buildWaterfall } from './caves-waterfall.js';
import { spawnAnimals } from './animals-ai.js';
import { createSky } from './sky.js';
import { HoverDrone } from './enemies.js';
import { Projectile, makeHitSpark, updateHitSparks } from './combat.js';
import { createMinimap } from './minimap.js';
import { savePlanetGame, loadPlanetGame } from './save.js';

// ============ SCENE / RENDERER ============
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 3000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});

const sky = createSky(scene);

// Warna terrain = biome dasar + jalan (dirt/asphalt) di-lerp di atasnya - digabung SEBELUM
// mesh planet dibangun, soalnya warnanya dibakar per-vertex sekali waktu generate.
function combinedColorAt(dir, h) {
    return roadColorBlend(dir, planetColorAt(dir, h));
}
const { planetMesh } = createPlanetMeshes(scene, 100, combinedColorAt);

// ============ PEMAIN ============
const player = new PlanetPlayerController(camera, renderer.domElement, { startDir: VILLAGE.dir.clone() });

// ============ DUNIA ============
scatterTrees(scene, 3000);
buildVillage(scene);
buildCity(scene);
buildCaves(scene);
const waterfall = buildWaterfall(scene);
const animals = spawnAnimals(scene, 40);

// ============ MUSUH: DRONE PATROLI + BOSS ============
// Boss nongkrong deket kota (masuk akal - "penjaga" reruntuhan kota), drone patroli biasa
// disebar di daratan tapi dijauhin dari titik spawn persis biar pemain nggak langsung digebukin.
const enemies = [];
{
    const boss = new HoverDrone(CITY.dir.clone(), {
        isBoss: true, hp: 500, speed: 3, chaseSpeed: 7, detectionRange: 50,
        attackRange: 9, damage: 22, hoverHeight: 18, patrolRadius: 65,
    });
    scene.add(boss.group);
    enemies.push(boss);

    let placed = 0, attempts = 0;
    while (placed < 5 && attempts < 400) {
        attempts++;
        const theta = Math.random() * Math.PI * 2, phi = Math.acos(Math.random() * 2 - 1);
        const dir = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.sin(phi) * Math.sin(theta), Math.cos(phi));
        if (Math.abs(dir.y) > 0.78) continue;
        const h = getPlanetTerrainHeight(dir);
        if (h < WATER_LEVEL + 0.5) continue;
        const patrolRadius = 25 + Math.random() * 20;
        const detectionRange = 24;
        // Jarak aman dari titik spawn HARUS lebih besar dari patrolRadius+detectionRange drone -
        // dulu cuma dicek 0.12rad (~31 unit) dari HOME-nya doang, padahal drone bisa "berayun"
        // sampe patrolRadius (s.d. 45 unit) dari home ke arah manapun (termasuk ke arah desa),
        // jadi kadang2 (random) pemain bisa langsung diserang begitu spawn. Sekarang jarak aman
        // dihitung dari radius patroli + jangkauan deteksi si drone itu sendiri.
        const safeAngle = (patrolRadius + detectionRange + 10) / PLANET_RADIUS;
        if (dir.angleTo(VILLAGE.dir) < safeAngle) continue;
        if (isInKeepout(dir)) continue;
        const drone = new HoverDrone(dir, {
            isBoss: false, hp: 60, speed: 4, chaseSpeed: 6.5, detectionRange,
            attackRange: 4.5, damage: 10, hoverHeight: 7 + Math.random() * 3, patrolRadius,
        });
        scene.add(drone.group);
        enemies.push(drone);
        placed++;
    }
}
const bossEnemy = enemies[0];

// ============ SENJATA (energy bolt sederhana - lihat combat.js) ============
const projectiles = [];
const hitSparks = [];
let shootCooldown = 0;
renderer.domElement.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (document.pointerLockElement !== renderer.domElement) return;
    if (shootCooldown > 0) return;
    shootCooldown = 0.26;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const startPos = camera.position.clone().addScaledVector(dir, 1.2);
    const p = new Projectile(startPos, dir);
    scene.add(p.mesh);
    projectiles.push(p);
});

// ============ HP PEMAIN (versi minimal - full survival stats nyusul) ============
let playerHp = 100, playerMaxHp = 100, playerAlive = true;
const healthFill = document.getElementById('health-fill');
const notifyEl = document.getElementById('notify');
let notifyTimer = 0;
function showNotify(text) {
    notifyEl.textContent = text;
    notifyEl.style.opacity = '1';
    notifyTimer = 2.2;
}
function updateHealthUI() {
    healthFill.style.width = Math.max(0, (playerHp / playerMaxHp) * 100) + '%';
}
function damagePlayer(amount) {
    if (!playerAlive) return;
    playerHp = Math.max(0, playerHp - amount);
    updateHealthUI();
    if (playerHp <= 0 && playerAlive) {
        playerAlive = false;
        showNotify('💀 KAMU KALAH - respawn di desa...');
        setTimeout(() => {
            player.teleportToDir(VILLAGE.dir.clone(), 0);
            playerHp = playerMaxHp;
            playerAlive = true;
            updateHealthUI();
            doSave();
        }, 1500);
    }
}
updateHealthUI();

// ============ SAVE/LOAD (lihat save.js - pakai Supabase, tabel planet_players) ============
let dronesKilled = 0;
let bossDefeated = false;

function doSave() {
    savePlanetGame({
        dir: player.playerDir, altitude: player.altitude, timeOfDay, playerHp, dronesKilled, bossDefeated,
    });
}

let gameReady = false;
loadPlanetGame().then((data) => {
    if (data) {
        const loadedDir = new THREE.Vector3(data.dir_x, data.dir_y, data.dir_z);
        if (loadedDir.lengthSq() > 0.5) {
            player.teleportToDir(loadedDir.normalize(), data.altitude || 0);
        }
        timeOfDay = data.time_of_day ?? timeOfDay;
        playerHp = data.player_hp ?? playerHp;
        dronesKilled = data.drones_killed ?? 0;
        bossDefeated = !!data.boss_defeated;
        if (bossDefeated) bossEnemy.destroy();
        updateHealthUI();
        showNotify('✅ Progress dimuat');
    }
    gameReady = true;
});

setInterval(() => {
    if (document.pointerLockElement === renderer.domElement) doSave();
}, 25000);
window.addEventListener('beforeunload', () => { doSave(); });
document.addEventListener('keydown', (e) => {
    if (e.code === 'KeyK' && document.pointerLockElement === renderer.domElement) {
        doSave();
        showNotify('💾 Progress disimpan');
    }
});

const bossHud = document.getElementById('boss-hud');
const bossHpFill = document.getElementById('boss-hp-fill');
let bossWasAlerted = false;
function updateBossHud() {
    if (bossEnemy.destroyed) { bossHud.style.display = 'none'; return; }
    const engaged = bossEnemy.state !== 'PATROL';
    if (engaged && !bossWasAlerted) { showNotify('🚨 BOSS DRONE MENDETEKSI ANDA!'); bossWasAlerted = true; }
    if (!engaged) bossWasAlerted = false;
    bossHud.style.display = engaged ? 'block' : 'none';
    bossHpFill.style.width = Math.max(0, (bossEnemy.hp / bossEnemy.maxHp) * 100) + '%';
}

// ============ MINIMAP ============
const minimap = createMinimap(document.getElementById('minimap'), 90);
const POIS = [
    { pos: VILLAGE.dir.clone().multiplyScalar(PLANET_RADIUS), color: '#8fd9ff', r: 5 },
    { pos: CITY.dir.clone().multiplyScalar(PLANET_RADIUS), color: '#cfcfcf', r: 5 },
    { pos: CAVE_WEST.dir.clone().multiplyScalar(PLANET_RADIUS), color: '#a97cff', r: 4 },
    { pos: CAVE_EAST.dir.clone().multiplyScalar(PLANET_RADIUS), color: '#a97cff', r: 4 },
    { pos: WATERFALL_TOP.dir.clone().multiplyScalar(PLANET_RADIUS), color: '#4fc3f7', r: 4 },
];

// ============ UI ============
const blocker = document.getElementById('blocker');
const hud = document.getElementById('hud');
blocker.addEventListener('click', () => player.requestLock());
document.addEventListener('pointerlockchange', () => {
    blocker.style.display = document.pointerLockElement === renderer.domElement ? 'none' : 'flex';
});

let timeOfDay = 8.0;
const timeSpeed = 0.15;

function formatTime(t) {
    const hh = Math.floor(t) % 24, mm = Math.floor((t % 1) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

let prevTime = performance.now();
function animate() {
    requestAnimationFrame(animate);
    try {
        const time = performance.now();
        const delta = Math.min((time - prevTime) / 1000, 0.1);
        prevTime = time;

        const { terrainHeight } = player.update(delta);

        timeOfDay += timeSpeed * delta;
        if (timeOfDay >= 24) timeOfDay -= 24;
        sky.update(camera, timeOfDay);

        for (const a of animals) a.update(delta);

        waterfall.waterTex.offset.y -= delta * 2.2;
        waterfall.sheet.material.opacity = 0.8 + Math.sin(time * 0.006) * 0.08;
        for (const s of waterfall.mistSprites) {
            s.userData.life -= delta * 0.4;
            if (s.userData.life <= 0) {
                s.userData.life = 1.5 + Math.random() * 1.5;
            }
            const lifeT = THREE.MathUtils.clamp(s.userData.life, 0, 1);
            s.material.opacity = Math.sin(Math.min(lifeT, 1) * Math.PI) * 0.4;
        }

        // ---- Musuh + tembak-menembak ----
        shootCooldown = Math.max(0, shootCooldown - delta);
        for (const en of enemies) en.update(delta, camera.position, player.playerDir, damagePlayer);
        updateBossHud();

        for (let i = projectiles.length - 1; i >= 0; i--) {
            const p = projectiles[i];
            p.update(delta);
            if (!p.dead) {
                for (const en of enemies) {
                    if (en.destroyed) continue;
                    if (p.mesh.position.distanceTo(en.group.position) < en.hitRadius) {
                        en.takeDamage(p.damage);
                        hitSparks.push(makeHitSpark(scene, p.mesh.position.clone()));
                        if (en.destroyed) {
                            showNotify(en.isBoss ? '🎉 BOSS DRONE DIKALAHKAN!' : '✅ Drone dihancurkan');
                            if (en.isBoss) bossDefeated = true; else dronesKilled++;
                            doSave();
                        }
                        p.dead = true;
                        break;
                    }
                }
            }
            if (p.dead) { scene.remove(p.mesh); projectiles.splice(i, 1); }
        }
        updateHitSparks(scene, hitSparks, delta);

        if (notifyTimer > 0) {
            notifyTimer -= delta;
            if (notifyTimer <= 0) notifyEl.style.opacity = '0';
        }

        minimap.update(camera.position, player.rightVec, player.forwardVec, POIS, enemies, animals);

        const distFromCenter = camera.position.length();
        hud.textContent = `${formatTime(timeOfDay)}  |  tinggi terrain: ${terrainHeight.toFixed(1)}  |  altitude planet: ${(distFromCenter - PLANET_RADIUS).toFixed(1)}`;

        renderer.render(scene, camera);
    } catch (e) {
        console.error('animate() error:', e);
    }
}
animate();
