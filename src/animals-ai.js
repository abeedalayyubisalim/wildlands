// ==========================================
// 3D ANIMAL SYSTEM (REVISI - LEBIH BESAR & JELAS)
// ==========================================

class AnimalManager3D {
    constructor() {
        this.animals = [];
        this.meshes = [];
    }

    // Spawn di lokasi random (jarak menengah)
    spawn(scene) {
        const randomAnimal = ANIMALS_DB[Math.floor(Math.random() * ANIMALS_DB.length)];
        const x = (Math.random() - 0.5) * 200; // Jarak -100 sampai 100
        const z = (Math.random() - 0.5) * 200;
        
        const animal3D = new Animal3D(randomAnimal, x, z, scene);
        this.animals.push(animal3D);
        this.meshes.push(animal3D.mesh);
    }

    // Spawn di lokasi spesifik (untuk awal game agar dekat)
    spawnAt(scene, x, z) {
        const randomAnimal = ANIMALS_DB[Math.floor(Math.random() * ANIMALS_DB.length)];
        const animal3D = new Animal3D(randomAnimal, x, z, scene);
        this.animals.push(animal3D);
        this.meshes.push(animal3D.mesh);
    }

    update() {
        this.animals = this.animals.filter(animal => animal.alive);
        this.animals.forEach(animal => animal.update());
    }

    getMeshes() {
        return this.meshes.filter(mesh => mesh.visible);
    }

    checkHit(mesh, damage) {
        // Cari animal berdasarkan mesh atau parentnya
        const animal = this.animals.find(a => a.mesh === mesh || a.mesh.children.includes(mesh));
        if (animal && animal.alive) {
            const killed = animal.takeDamage(damage);
            if (killed) {
                animal.mesh.visible = false;
                setTimeout(() => {
                    this.meshes = this.meshes.filter(m => m !== animal.mesh);
                }, 2000);
            }
            return {
                killed: killed,
                animalName: animal.name,
                score: killed ? animal.score : 0
            };
        }
        return null;
    }

    getAnimalCount() {
        return this.animals.filter(a => a.alive).length;
    }
}

class Animal3D {
    constructor(data, x, z, scene) {
        this.name = data.name;
        this.score = data.score;
        this.maxHealth = data.health;
        this.health = data.health;
        this.speed = data.speed * 2; // Sedikit lebih cepat
        this.size = data.size / 4; // PERBESAR SKALA (40/4 = 10 unit)
        this.color = this.getHexColor(data.color);
        this.alive = true;
        this.id = Date.now() + Math.random();
        
        this.direction = new THREE.Vector3(
            Math.random() - 0.5,
            0,
            Math.random() - 0.5
        ).normalize();
        
        this.moveTimer = 0;
        this.scene = scene;
        
        this.createMesh(x, z);
    }

    // Helper untuk konversi warna string ke hex three.js
    getHexColor(colorStr) {
        if (typeof colorStr === 'string' && colorStr.startsWith('#')) {
            return parseInt(colorStr.replace('#', '0x'), 16);
        }
        return 0x8B4513; // Default coklat
    }

    createMesh(x, z) {
        this.mesh = new THREE.Group();
        this.mesh.position.set(x, 0, z); // Tepat di tanah (y=0)

        const bodyMat = new THREE.MeshLambertMaterial({ color: this.color });

        // 1. BADAN (Box besar)
        const bodyGeo = new THREE.BoxGeometry(this.size * 2, this.size * 1.5, this.size * 3);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = this.size * 1.5; // Angkat dari tanah
        body.castShadow = true;
        body.receiveShadow = true;
        this.mesh.add(body);

        // 2. KEPALA (Box lebih kecil)
        const headGeo = new THREE.BoxGeometry(this.size * 1.2, this.size * 1.2, this.size * 1.2);
        const head = new THREE.Mesh(headGeo, bodyMat);
        head.position.set(0, this.size * 2.8, this.size * 1.8); // Di depan atas badan
        head.castShadow = true;
        this.mesh.add(head);

        // 3. KAKI (4 silinder)
        const legGeo = new THREE.CylinderGeometry(this.size * 0.3, this.size * 0.3, this.size * 1.5, 8);
        const legPositions = [
            [-this.size * 0.8, this.size * 0.75, -this.size * 1.2],
            [ this.size * 0.8, this.size * 0.75, -this.size * 1.2],
            [-this.size * 0.8, this.size * 0.75,  this.size * 1.2],
            [ this.size * 0.8, this.size * 0.75,  this.size * 1.2]
        ];

        legPositions.forEach(pos => {
            const leg = new THREE.Mesh(legGeo, bodyMat);
            leg.position.set(...pos);
            leg.castShadow = true;
            this.mesh.add(leg);
        });

        this.scene.add(this.mesh);
    }

    update() {
        if (!this.alive) return;

        this.moveTimer++;
        
        // Ganti arah random
        if (this.moveTimer > 100 + Math.random() * 100) {
            this.direction.set(
                Math.random() - 0.5,
                0,
                Math.random() - 0.5
            ).normalize();
            this.moveTimer = 0;
        }

        // Gerakkan mesh
        this.mesh.position.x += this.direction.x * this.speed;
        this.mesh.position.z += this.direction.z * this.speed;

        // Batas area (agar tidak lari terlalu jauh)
        if (Math.abs(this.mesh.position.x) > 400 || Math.abs(this.mesh.position.z) > 400) {
            this.direction.multiplyScalar(-1);
        }

        // Hadap ke arah gerakan
        const lookTarget = new THREE.Vector3(
            this.mesh.position.x + this.direction.x,
            this.mesh.position.y,
            this.mesh.position.z + this.direction.z
        );
        this.mesh.lookAt(lookTarget);
    }

    takeDamage(damage) {
        this.health -= damage;
        if (this.health <= 0) {
            this.alive = false;
            return true;
        }
        return false;
    }
}
