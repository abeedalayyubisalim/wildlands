// ============ LANGIT & SIKLUS SIANG-MALAM (versi ringkas) ============
import * as THREE from 'three';
import { PLANET_RADIUS } from './planet-terrain.js';

export function createSky(scene) {
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -120; sun.shadow.camera.right = 120;
    sun.shadow.camera.top = 120; sun.shadow.camera.bottom = -120;
    sun.shadow.camera.far = 700;
    scene.add(sun);
    scene.add(sun.target);

    const hemi = new THREE.HemisphereLight(0xbdd8ff, 0x3a3a2a, 0.55);
    scene.add(hemi);

    const skyColors = {
        night: new THREE.Color(0x0a0a2e), dawn: new THREE.Color(0xff8c42),
        day: new THREE.Color(0x87CEEB), dusk: new THREE.Color(0xff6b6b),
    };
    function getSkyColor(t) {
        if (t < 5) return skyColors.night.clone().lerp(skyColors.dawn, t / 5 * 0.3);
        if (t < 7) return skyColors.dawn.clone().lerp(skyColors.day, (t - 5) / 2);
        if (t < 17) return skyColors.day.clone();
        if (t < 19) return skyColors.day.clone().lerp(skyColors.dusk, (t - 17) / 2);
        if (t < 21) return skyColors.dusk.clone().lerp(skyColors.night, (t - 19) / 2);
        return skyColors.night.clone();
    }

    scene.fog = new THREE.Fog(0x87CEEB, 60, PLANET_RADIUS * 0.85);

    return {
        sun, hemi,
        update(camera, timeOfDay) {
            const skyColor = getSkyColor(timeOfDay);
            scene.background = skyColor;
            scene.fog.color = skyColor;
            const camUp = camera.position.clone().normalize();
            const sunAngle = ((timeOfDay - 6) / 24) * Math.PI * 2;
            // Matahari diposisiin relatif ke "atas" lokal pemain saat ini, biar orbitnya masuk
            // akal kemanapun pemain lagi berada di planet.
            const seed = Math.abs(camUp.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
            const east = new THREE.Vector3().crossVectors(camUp, seed).normalize();
            const sunDir = camUp.clone().multiplyScalar(Math.sin(sunAngle)).addScaledVector(east, Math.cos(sunAngle));
            sun.position.copy(camera.position).addScaledVector(sunDir, 400);
            sun.target.position.copy(camera.position);
            const sunHeight = Math.sin(sunAngle);
            sun.intensity = sunHeight > 0 ? (0.5 + sunHeight * 0.9) : 0.08;
            hemi.intensity = sunHeight > 0 ? (0.35 + sunHeight * 0.35) : 0.18;
            hemi.color.copy(skyColor).lerp(new THREE.Color(0xffffff), 0.3);
            return { skyColor, sunHeight };
        },
    };
}
