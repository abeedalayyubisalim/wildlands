// ============ MINIMAP (versi planet) ============
// Minimap "atas-bawah" klasik nggak masuk akal lagi di planet bulat (nggak ada satu arah
// "atas dunia" yang konsisten). Jadi di sini minimap-nya LOKAL & ngikutin pemain: dibangun dari
// bidang singgung (tangent plane) di posisi pemain sekarang, pake basis right/forward pemain
// sendiri - forward pemain selalu digambar "ke atas" peta (gaya radar FPS yang muter ngikutin
// arah hadap), bukan basis dunia yang tetap.
export function createMinimap(canvas, radiusWorld = 90) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const cx = w / 2, cy = h / 2;
    const mapR = Math.min(w, h) / 2 - 3;
    const scale = mapR / radiusWorld;

    function project(objPos, playerPos, right, forward) {
        const rel = objPos.clone().sub(playerPos);
        const x = rel.dot(right);
        const y = rel.dot(forward);
        const d = Math.hypot(x, y);
        if (d > radiusWorld) return null;
        return { sx: cx + x * scale, sy: cy - y * scale };
    }

    function dot(sx, sy, color, r) {
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
    }

    return {
        // pois: [{pos: Vector3, color, r}], enemies: HoverDrone[], animals: Animal[]
        update(playerPos, right, forward, pois, enemies, animals) {
            ctx.clearRect(0, 0, w, h);
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, mapR, 0, Math.PI * 2);
            ctx.clip();
            ctx.fillStyle = 'rgba(6, 20, 12, 0.7)';
            ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = 'rgba(0,255,0,0.15)';
            for (const f of [0.34, 0.67, 1]) {
                ctx.beginPath();
                ctx.arc(cx, cy, mapR * f, 0, Math.PI * 2);
                ctx.stroke();
            }

            for (const poi of pois) {
                const p = project(poi.pos, playerPos, right, forward);
                if (p) dot(p.sx, p.sy, poi.color, poi.r || 4);
            }
            for (const a of animals) {
                if (!a.alive) continue;
                const p = project(a.group.position, playerPos, right, forward);
                if (p) dot(p.sx, p.sy, '#7fbf3f', 2);
            }
            for (const en of enemies) {
                if (en.destroyed) continue;
                const p = project(en.group.position, playerPos, right, forward);
                if (p) dot(p.sx, p.sy, en.isBoss ? '#ff2222' : '#ff8844', en.isBoss ? 5 : 2.5);
            }
            ctx.restore();

            ctx.strokeStyle = 'rgba(0,255,0,0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(cx, cy, mapR, 0, Math.PI * 2);
            ctx.stroke();

            // Penanda pemain - selalu segitiga ngadep "atas" (= arah hadap pemain saat ini)
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.moveTo(cx, cy - 7);
            ctx.lineTo(cx - 5, cy + 5);
            ctx.lineTo(cx + 5, cy + 5);
            ctx.closePath();
            ctx.fill();
        },
    };
}
