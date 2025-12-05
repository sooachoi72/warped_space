import * as THREE from 'three';

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { gsap } from "https://cdn.jsdelivr.net/npm/gsap@3.12.5/index.js";


// 전역 설정
const CONFIG = {
    planeSize: 1000, 
    maxMassCount: 5, 
    maxMassValue: 200, 
    minMassValue: 20,
    gridScale: 100.0, 
    gravityK: 100.0, 
    epsilon: 80.0, 
    userMass: 20, 
    userHeightOffset: 15, 
    physicsSpeedScale: 100.0
};
const STAR_COLORS = [0x9bb0ff, 0xaabfff, 0xcad7ff, 0xf8f7ff, 0xfff4ea, 0xffd2a1, 0xffcc6f];
const state = {
    viewMode: 'GOD', isSpawning: false, isCharging: false, chargeStartTime: 0, masses: [],
    fps: { yaw: 0, pitch: 0, isDragging: false },
    user: { velocity: new THREE.Vector3(), position: new THREE.Vector3(0, 0, 300) }
};

const canvas = document.getElementById("webgl");
const vertShader = document.getElementById("vertexShader").textContent;
const fragShader = document.getElementById("fragmentShader").textContent;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.0015);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 1, 5000);

const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true; 
orbitControls.dampingFactor = 0.05; 
orbitControls.maxDistance = 1500; 
orbitControls.minDistance = 50; 
orbitControls.maxPolarAngle = Math.PI / 2 - 0.05; 

function setGodView() {
    state.viewMode = 'GOD'; 
    orbitControls.enabled = true;
    
    gsap.to(camera.position, { x: 0, y: 400, z: 600, 
        duration: 1.5, ease: "power2.inOut", onUpdate: () => { camera.lookAt(0, 0, 0); }});
    
    document.getElementById("view-mode-text").innerText = "GOD MODE"; 
    document.getElementById("view-mode-text").style.color = "#ff8800"; 
    document.body.style.cursor = "default";
}

function setFpsView() {
    state.viewMode = 'FPS'; orbitControls.enabled = false; 
    state.fps.yaw = 0; state.fps.pitch = 0;
    camera.rotation.set(0, 0, 0); 
    state.user.position.set(0, 0, 300); 
    state.user.velocity.set(0, 0, 0);
    camera.position.copy(state.user.position); 
    camera.position.y += CONFIG.userHeightOffset;
    document.getElementById("view-mode-text").innerText = "OBSERVER (Drag to Look)"; 
    document.getElementById("view-mode-text").style.color = "#00ccff"; 
    document.body.style.cursor = "grab";
}
setGodView(); 

const keyState = { KeyW: false, KeyA: false, KeyS: false, KeyD: false };
window.addEventListener('keydown', (e) => { if(keyState.hasOwnProperty(e.code)) keyState[e.code] = true; });
window.addEventListener('keyup', (e) => { if(keyState.hasOwnProperty(e.code)) keyState[e.code] = false; });
window.addEventListener('mousedown', (e) => { if(state.viewMode === 'FPS' && !e.target.closest('button') && e.button === 0) { state.fps.isDragging = true; document.body.style.cursor = "grabbing"; } });
window.addEventListener('mouseup', () => { state.fps.isDragging = false; if(state.viewMode === 'FPS') document.body.style.cursor = "grab"; });
window.addEventListener('mousemove', (e) => {
    if (state.viewMode === 'FPS' && state.fps.isDragging) {
        const sensitivity = 0.002; 
        state.fps.yaw -= e.movementX * sensitivity; 
        state.fps.pitch -= e.movementY * sensitivity;
        state.fps.pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, state.fps.pitch));
        camera.rotation.set(state.fps.pitch, state.fps.yaw, 0, 'YXZ');
    }
});

function updateUserSimulation(deltaTime) {
    if (state.viewMode !== 'FPS') return;
    const thrustPower = 200.0; 
    const inputAccel = new THREE.Vector3(); 
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction); direction.y = 0; direction.normalize();
    const right = new THREE.Vector3(); right.crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();
    
    if(keyState.KeyW) inputAccel.add(direction); 
    if(keyState.KeyS) inputAccel.sub(direction);
    if(keyState.KeyD) inputAccel.add(right); 
    if(keyState.KeyA) inputAccel.sub(right);
    if(inputAccel.lengthSq() > 0) inputAccel.normalize().multiplyScalar(thrustPower);
    
    const gravityAccel = new THREE.Vector3(0, 0, 0); 
    const myPos = state.user.position; 
    const physicsScale = 300.0; 
    
    state.masses.forEach(massObj => {
        const dx = massObj.mesh.position.x - myPos.x; 
        const dz = massObj.mesh.position.z - myPos.z;
        const distSq = dx*dx + dz*dz + CONFIG.epsilon*CONFIG.epsilon; 
        const dist = Math.sqrt(distSq);
        const forceMagnitude = (CONFIG.gravityK * massObj.mass * CONFIG.userMass) / distSq * physicsScale;
        gravityAccel.x += (dx / dist) * forceMagnitude; gravityAccel.z += (dz / dist) * forceMagnitude;
    });
    
    const totalAccel = inputAccel.add(gravityAccel); state.user.velocity.addScaledVector(totalAccel, deltaTime);
    const friction = 0.5; state.user.velocity.multiplyScalar(1.0 - friction * deltaTime);
    state.user.position.addScaledVector(state.user.velocity, deltaTime);
    const mapLimit = 480;
    if(Math.abs(state.user.position.x) > mapLimit) { state.user.position.x = Math.sign(state.user.position.x) * mapLimit; state.user.velocity.x *= -0.5; }
    if(Math.abs(state.user.position.z) > mapLimit) { state.user.position.z = Math.sign(state.user.position.z) * mapLimit; state.user.velocity.z *= -0.5; }
    let displacement = 0.0;
    state.masses.forEach(massObj => {
        const dx = myPos.x - massObj.mesh.position.x; const dz = myPos.z - massObj.mesh.position.z;
        const r = Math.sqrt(dx*dx + dz*dz + CONFIG.epsilon * CONFIG.epsilon);
        displacement += -CONFIG.gravityK * (massObj.mass / r);
    });
    const distFromCenter = Math.sqrt(myPos.x*myPos.x + myPos.z*myPos.z);
    const edgeFactor = 1.0 - THREE.MathUtils.smoothstep(350.0, 490.0, distFromCenter);
    displacement *= edgeFactor;
    state.user.position.y = displacement; camera.position.copy(state.user.position); camera.position.y += CONFIG.userHeightOffset;
}

function createStarfield() {
    const starCount = 5000; const geo = new THREE.BufferGeometry(); const pos = new Float32Array(starCount * 3); const colors = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
        pos[i*3] = (Math.random() - 0.5) * 2500; pos[i*3+1] = (Math.random() - 0.5) * 1500 + 500; pos[i*3+2] = (Math.random() - 0.5) * 2500;
        const color = new THREE.Color().setHSL(Math.random(), 0.5, 0.8);
        colors[i*3] = color.r; colors[i*3+1] = color.g; colors[i*3+2] = color.b;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({ size: 1.5, vertexColors: true, transparent: true, opacity: 0.8 });
    const stars = new THREE.Points(geo, mat); scene.add(stars); return stars;
}
createStarfield();
const sunGeo = new THREE.SphereGeometry(15, 32, 32); const sunMat = new THREE.MeshBasicMaterial({ color: 0xffffee }); const sun = new THREE.Mesh(sunGeo, sunMat); sun.position.set(0, 200, 0); scene.add(sun); sun.add(new THREE.PointLight(0xffaa00, 2, 1000));
const planeGeo = new THREE.PlaneGeometry(CONFIG.planeSize, CONFIG.planeSize, 200, 200);
const shaderMat = new THREE.ShaderMaterial({
    vertexShader: vertShader, fragmentShader: fragShader, side: THREE.DoubleSide, transparent: true,
    uniforms: { uTime: { value: 0 }, uMassCount: { value: 0 }, uMassPositions: { value: Array.from({ length: 5 }, () => new THREE.Vector3()) }, uMassValues: { value: new Float32Array(5) }, uK: { value: CONFIG.gravityK }, uEpsilon: { value: CONFIG.epsilon }, uGridColor: { value: new THREE.Color(0x0088ff) }, uBaseColor: { value: new THREE.Color(0x02020a) }, uGridScale: { value: CONFIG.gridScale }, }
});
const plane = new THREE.Mesh(planeGeo, shaderMat); plane.rotation.x = -Math.PI / 2; scene.add(plane);
const massGeometry = new THREE.SphereGeometry(1, 64, 64); const dragPlane = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshBasicMaterial({ visible: false })); dragPlane.rotation.x = -Math.PI / 2; scene.add(dragPlane);

function updateShaderData() {
    shaderMat.uniforms.uMassCount.value = state.masses.length;
    const pos = shaderMat.uniforms.uMassPositions.value; 
    const val = shaderMat.uniforms.uMassValues.value;
    for(let i=0; i<5; i++) {
        if(i < state.masses.length) { 
            pos[i].copy(state.masses[i].mesh.position); 
            val[i] = state.masses[i].mass; 
        } else { 
            pos[i].set(9999,9999,9999); 
            val[i] = 0; 
} 
    }
    document.getElementById("mass-count").innerText = `Masses: ${state.masses.length} / ${CONFIG.maxMassCount}`;
    const btnAdd = document.getElementById("btn-add-mass"); 
    if(state.masses.length >= CONFIG.maxMassCount) {
        btnAdd.disabled = true; 
        btnAdd.innerText = "Max Limit Reached"; 
    } else { 
        btnAdd.disabled = false; 
        btnAdd.innerText = "✚ Add Mass"; 
    }
    sun.visible = (state.masses.length === 0);
}

// 물리 시뮬레이션 업데이트
function updateMassPhysics(deltaTime) {
    // 속도 계산 
    for(let i=0; i<state.masses.length; i++) {
        const m1 = state.masses[i];
        if (i === 0) { m1.velocity.set(0, 0, 0); continue; } // 중심별 고정
        for(let j=0; j<state.masses.length; j++) {
            if(i === j) continue;
            const m2 = state.masses[j];
            const dx = m2.mesh.position.x - m1.mesh.position.x; const dz = m2.mesh.position.z - m1.mesh.position.z;
            const distSq = dx*dx + dz*dz + CONFIG.epsilon*CONFIG.epsilon; const dist = Math.sqrt(distSq);
            const force = (CONFIG.gravityK * m1.mass * m2.mass) / distSq * CONFIG.physicsSpeedScale;
            const ax = (dx/dist) * force; const az = (dz/dist) * force;
            m1.velocity.x += (ax / m1.mass) * deltaTime; m1.velocity.z += (az / m1.mass) * deltaTime;
        }
    }
    
    // 위치 및 높이 업데이트
    state.masses.forEach((obj) => {
        obj.mesh.position.addScaledVector(obj.velocity, deltaTime);
        const limit = 450;
        if(Math.abs(obj.mesh.position.x) > limit) { obj.mesh.position.x = Math.sign(obj.mesh.position.x) * limit; obj.velocity.x *= -0.8; }
        if(Math.abs(obj.mesh.position.z) > limit) { obj.mesh.position.z = Math.sign(obj.mesh.position.z) * limit; obj.velocity.z *= -0.8; }

        const myPos = obj.mesh.position;
        let displacement = 0.0;
        state.masses.forEach((other) => {
            const dx = myPos.x - other.mesh.position.x; const dz = myPos.z - other.mesh.position.z;
            const r = Math.sqrt(dx*dx + dz*dz + CONFIG.epsilon * CONFIG.epsilon);
            displacement += -CONFIG.gravityK * (other.mass / r);
        });
        const distFromCenter = Math.sqrt(myPos.x*myPos.x + myPos.z*myPos.z);
        const edgeFactor = 1.0 - THREE.MathUtils.smoothstep(350.0, 490.0, distFromCenter);
        displacement *= edgeFactor;
        
        const radius = obj.mesh.scale.x; 
        obj.mesh.position.y = displacement + radius; 
    });
}

function createMass(pos, scale, mass) {
    const randomColor = STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)];
    const material = new THREE.MeshStandardMaterial({
        color: randomColor, 
        emissive: randomColor, 
        emissiveIntensity: 0.6,
        roughness: 0.3, metalness: 0.5
    });
    const mesh = new THREE.Mesh(massGeometry, material);
    mesh.scale.set(scale, scale, scale);
    mesh.position.set(pos.x, 100, pos.z);
    mesh.userData = { isMass: true, massValue: mass };
    scene.add(mesh);
    const initialVelocity = new THREE.Vector3();
    if (state.masses.length > 0) {
        const tangent = new THREE.Vector3(-pos.z, 0, pos.x).normalize();
        const speed = (Math.random() * 20 + 10); 
        initialVelocity.copy(tangent).multiplyScalar(speed);
    }
    gsap.to(mesh.position, {
        y: 0, duration: 1.0, ease: "bounce.out",
        onComplete: () => {
            spawnRipple(pos.x, pos.z);
            state.masses.push({ mesh: mesh, mass: mass, velocity: initialVelocity });
            updateShaderData();
        }
    });
}

function spawnRipple(x, z) {
    const ringGeo = new THREE.RingGeometry(0.5, 1, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.5, z);
    scene.add(ring);
    gsap.to(ring.scale, { x: 50, y: 50, duration: 2, ease: "power2.out" });
    gsap.to(ring.material, { opacity: 0, duration: 2, onComplete: () => {
        scene.remove(ring); ring.geometry.dispose(); ring.material.dispose();
    }});
}

const raycaster = new THREE.Raycaster(); const pointer = new THREE.Vector2(); let spawnGhost = null; 
const btnAdd = document.getElementById("btn-add-mass"); 
const btnToggle = document.getElementById("btn-toggle-view"); 
const btnReset = document.getElementById("btn-reset");

// 리스너 설정
btnReset.addEventListener("click", () => {
    state.masses.forEach(m => { scene.remove(m.mesh); m.mesh.geometry.dispose(); m.mesh.material.dispose(); });
    state.masses = []; updateShaderData(); setGodView();
});

btnToggle.addEventListener("click", () => { if(state.viewMode === 'GOD') setFpsView(); else setGodView(); });
btnAdd.addEventListener("click", () => {
    if(state.masses.length >= CONFIG.maxMassCount) return;
    state.isSpawning = true; btnAdd.classList.add("active"); btnAdd.innerText = "Click & Hold on Plane..."; document.body.style.cursor = "crosshair";
});

const contextMenu = document.getElementById("context-menu"); 
const btnDelete = document.getElementById("btn-delete-mass"); let selectedMassForDelete = null;

window.addEventListener("contextmenu", (e) => {
    e.preventDefault(); if(e.target.closest("#ui-layer")) return;
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1; pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(pointer, camera); 
    const hits = raycaster.intersectObjects(state.masses.map(m => m.mesh));
    if(hits.length > 0) { selectedMassForDelete = hits[0].object; contextMenu.style.display = "block"; contextMenu.style.left = e.clientX + "px"; contextMenu.style.top = e.clientY + "px"; } else { contextMenu.style.display = "none"; }
});
window.addEventListener("click", (e) => { if(!e.target.closest("#context-menu")) contextMenu.style.display = "none"; });
btnDelete.addEventListener("click", () => {
    if(selectedMassForDelete) {
        const index = state.masses.findIndex(m => m.mesh === selectedMassForDelete);
        if(index > -1) { state.masses.splice(index, 1); scene.remove(selectedMassForDelete); selectedMassForDelete.geometry.dispose(); selectedMassForDelete.material.dispose(); updateShaderData(); }
    }
    contextMenu.style.display = "none";
});
window.addEventListener("pointerdown", (e) => {
    if(e.target.closest("#ui-layer") || e.target.closest("#context-menu") || e.button === 2) return;
    if(state.viewMode === 'FPS' && !state.isSpawning) return;
    if(state.isSpawning) {
        pointer.x = (e.clientX / window.innerWidth) * 2 - 1; pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(pointer, camera); 
        const hitPlane = raycaster.intersectObject(dragPlane);
        if(hitPlane.length > 0) {
            state.isCharging = true; state.chargeStartTime = performance.now();
            spawnGhost = new THREE.Mesh(massGeometry, new THREE.MeshBasicMaterial({color: 0xffffff, wireframe:true, transparent:true, opacity:0.5}));
            spawnGhost.position.copy(hitPlane[0].point); scene.add(spawnGhost);
        }
    }
});
window.addEventListener("pointermove", (e) => {
    if(state.isSpawning && state.isCharging && spawnGhost) {
        const duration = (performance.now() - state.chargeStartTime) / 1000;
        let currentMass = Math.min(CONFIG.minMassValue + duration * 50, CONFIG.maxMassValue);
        let scale = 5 + currentMass * 0.2; 
        scale = Math.min(scale, 50); 
        spawnGhost.scale.set(scale, scale, scale);
    }
});
window.addEventListener("pointerup", (e) => {
    if(state.isSpawning && state.isCharging && spawnGhost) {
        const finalScale = spawnGhost.scale.x; 
        const finalMass = (finalScale - 5) * 5; 
        const position = spawnGhost.position.clone(); 
        scene.remove(spawnGhost); 
        spawnGhost = null;
        createMass(position, finalScale, finalMass); 
        state.isSpawning = false; 
        state.isCharging = false;
        btnAdd.classList.remove("active"); 
        btnAdd.innerText = "✚ Add Mass"; 
        document.body.style.cursor = "default";
    }
});

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
bloomPass.threshold = 0.3; 
bloomPass.strength = 1.2; 
bloomPass.radius = 0.5;
composer.addPass(bloomPass);

const clock = new THREE.Clock();
function animate() {
    const deltaTime = clock.getDelta(); 
    const time = clock.getElapsedTime();
    shaderMat.uniforms.uTime.value = time;
    if(state.viewMode === 'GOD') orbitControls.update();
    updateUserSimulation(deltaTime);
    if(state.masses.length > 0) { updateMassPhysics(deltaTime); updateShaderData(); }
    composer.render(); requestAnimationFrame(animate);
}
animate();
window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight); 
    composer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight; 
    camera.updateProjectionMatrix();
});