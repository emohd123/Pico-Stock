'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';

/**
 * Pico cinematic arena hero (Three.js).
 * Inspired by the FIBA 3x3 World Tour arena build in Manama.
 * - Lazy-loads three only on the client.
 * - Respects prefers-reduced-motion (renders a static frame, no animation).
 * - Scales crowd/beam counts down on small / low-power devices.
 */
export default function ArenaHero() {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        let renderer, cleanupFns = [];
        let rafId = null;
        let disposed = false;

        const reduceMotion =
            typeof window !== 'undefined' &&
            window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 760;
        const QUALITY = isMobile ? 0.6 : 1;

        import('three')
            .then(async (THREE) => {
                if (disposed) return;

                const TEAL = 0x00c9c9, EMBER = 0xff5a1f, EMBER2 = 0xff8a3d, FABRIC = 0xc9b6ad;
                const scene = new THREE.Scene();
                scene.fog = new THREE.FogExp2(0x0b0e16, 0.03);

                const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
                renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: true });
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));
                renderer.setClearColor(0x000000, 0);

                let composer = null, bloomPass = null, ReflectorCls = null;
                const useBloom = !isMobile && !reduceMotion;
                function renderFrame() { if (composer) composer.render(); else renderer.render(scene, camera); }

                function size() {
                    const w = canvas.clientWidth || window.innerWidth;
                    const h = canvas.clientHeight || window.innerHeight;
                    camera.aspect = w / h;
                    camera.updateProjectionMatrix();
                    renderer.setSize(w, h, false);
                    if (composer) composer.setSize(w, h);
                }

                const arena = new THREE.Group();
                scene.add(arena);
                arena.position.y = -2;

                /* ---- canvas-texture engine (redraws when logo loads) ---- */
                const texList = [];
                function tex(draw, w, h) {
                    const c = document.createElement('canvas');
                    c.width = w; c.height = h;
                    const ctx = c.getContext('2d');
                    const t = new THREE.CanvasTexture(c);
                    t.anisotropy = 4;
                    t._redraw = () => { ctx.clearRect(0, 0, w, h); draw(ctx, w, h); t.needsUpdate = true; };
                    t._redraw();
                    texList.push(t);
                    return t;
                }
                const logoImg = new Image();
                let logoReady = false;
                logoImg.onload = () => { logoReady = true; texList.forEach((t) => t._redraw()); };
                logoImg.src = '/branding/pico-logo.png';
                function drawLogo(x, cx, cy, tw) {
                    if (!logoReady) return;
                    const ar = logoImg.width / logoImg.height;
                    x.drawImage(logoImg, cx - tw / 2, cy - tw / ar / 2, tw, tw / ar);
                }
                function roundRect(x, X, Y, W, H, r) {
                    x.beginPath(); x.moveTo(X + r, Y);
                    x.arcTo(X + W, Y, X + W, Y + H, r); x.arcTo(X + W, Y + H, X, Y + H, r);
                    x.arcTo(X, Y + H, X, Y, r); x.arcTo(X, Y, X + W, Y, r); x.closePath();
                }
                const scoreTex = tex((x, w, h) => {
                    roundRect(x, 6, 6, w - 12, h - 12, 22); x.fillStyle = '#cfd8de'; x.fill();
                    x.lineWidth = 6; x.strokeStyle = 'rgba(0,165,165,.55)'; x.stroke();
                    drawLogo(x, w / 2, h / 2 - 22, 300);
                    x.fillStyle = 'rgba(60,70,78,.7)'; x.font = '700 26px Inter,Arial';
                    x.textAlign = 'center'; x.textBaseline = 'alphabetic';
                    x.fillText('TOTAL BRAND ACTIVATION', w / 2, h - 44);
                }, 512, 256);
                const ledTex = tex((x, w, h) => {
                    x.fillStyle = '#c2ccd3'; x.fillRect(0, 0, w, h);
                    drawLogo(x, w / 2, h / 2 - 12, 330);
                    x.fillStyle = 'rgba(60,70,78,.7)'; x.font = '700 28px Inter,Arial';
                    x.textAlign = 'center'; x.textBaseline = 'alphabetic';
                    x.fillText('TOTAL BRAND ACTIVATION', w / 2, h - 46);
                }, 512, 256);
                const courtTex = tex((x, w, h) => {
                    x.clearRect(0, 0, w, h);
                    const g = x.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, h * 0.62);
                    g.addColorStop(0, 'rgba(255,255,255,.16)'); g.addColorStop(1, 'rgba(255,255,255,0)');
                    x.fillStyle = g; x.fillRect(0, 0, w, h);
                    drawLogo(x, w / 2, h / 2 - 30, 520);
                    x.fillStyle = 'rgba(220,230,236,.8)'; x.font = '800 44px Inter,Arial';
                    x.textAlign = 'center'; x.textBaseline = 'alphabetic';
                    x.fillText('TOTAL BRAND ACTIVATION', w / 2, h / 2 + 150);
                }, 1024, 512);

                /* ---- lighting ---- */
                scene.add(new THREE.AmbientLight(0x20242e, 0.85));
                scene.add(new THREE.HemisphereLight(0x0d2c3e, 0x05070c, 0.55)); // teal night sky lift so stands read
                const moon = new THREE.DirectionalLight(0x8aa0c0, 0.32); moon.position.set(10, 30, 10); scene.add(moon);
                const warm = new THREE.PointLight(EMBER, 2.4, 70); warm.position.set(0, 4, 0); arena.add(warm);
                const warm2 = new THREE.PointLight(EMBER2, 1.4, 90); warm2.position.set(0, 14, 0); arena.add(warm2);
                const tealKey = new THREE.PointLight(TEAL, 1.3, 80); tealKey.position.set(-18, 10, 8); arena.add(tealKey);
                const tealRim = new THREE.PointLight(TEAL, 0.9, 120); tealRim.position.set(16, 15, -12); arena.add(tealRim);
                const strobe = new THREE.PointLight(0xffffff, 0, 120); strobe.position.set(0, 18, 0); arena.add(strobe);

                /* ---- bloom post-processing (desktop only) ---- */
                if (useBloom) {
                    try {
                        const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }, { Reflector }] = await Promise.all([
                            import('three/examples/jsm/postprocessing/EffectComposer.js'),
                            import('three/examples/jsm/postprocessing/RenderPass.js'),
                            import('three/examples/jsm/postprocessing/UnrealBloomPass.js'),
                            import('three/examples/jsm/postprocessing/OutputPass.js'),
                            import('three/examples/jsm/objects/Reflector.js'),
                        ]);
                        if (disposed) return;
                        ReflectorCls = Reflector;
                        const w0 = canvas.clientWidth || window.innerWidth;
                        const h0 = canvas.clientHeight || window.innerHeight;
                        const dpr = renderer.getPixelRatio();
                        const rt = new THREE.WebGLRenderTarget(Math.round(w0 * dpr), Math.round(h0 * dpr), { type: THREE.HalfFloatType, samples: 2 });
                        composer = new EffectComposer(renderer, rt);
                        composer.addPass(new RenderPass(scene, camera));
                        // (resolution, strength, radius, threshold) — higher threshold so only the brightest sources bloom (no central white-out)
                        bloomPass = new UnrealBloomPass(new THREE.Vector2(w0, h0), 0.55, 0.5, 0.7);
                        composer.addPass(bloomPass);
                        composer.addPass(new OutputPass());
                    } catch (e) { composer = null; bloomPass = null; }
                }

                const R = 12, RIM = 6.2, APEX = 11.5;

                /* ---- canopy ---- */
                const canopyGeo = new THREE.ConeGeometry(R, APEX - RIM, 60, 1, true);
                const canopy = new THREE.Mesh(canopyGeo, new THREE.MeshStandardMaterial({ color: FABRIC, emissive: 0x140a06, side: THREE.DoubleSide, metalness: 0.1, roughness: 0.92 }));
                canopy.position.y = RIM + (APEX - RIM) / 2; arena.add(canopy);
                const spokes = new THREE.Mesh(canopyGeo, new THREE.MeshBasicMaterial({ color: 0x2a1c14, wireframe: true, transparent: true, opacity: 0.22 }));
                spokes.position.copy(canopy.position); arena.add(spokes);
                const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 0.8, 16), new THREE.MeshStandardMaterial({ color: 0x10151d, metalness: 0.8, roughness: 0.4 }));
                hub.position.y = APEX - 0.2; arena.add(hub);
                const hubGlow = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 16), new THREE.MeshBasicMaterial({ color: 0xfff0d0 }));
                hubGlow.position.y = APEX - 0.5; arena.add(hubGlow);

                /* ---- scoreboard ---- */
                const sbGroup = new THREE.Group(); arena.add(sbGroup);
                const sb = new THREE.Mesh(new THREE.BoxGeometry(3, 1.6, 3), new THREE.MeshBasicMaterial({ map: scoreTex }));
                sb.position.y = RIM + 1.4; sbGroup.add(sb);
                const sbTop = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 3.2), new THREE.MeshStandardMaterial({ color: 0x10151d, metalness: 0.7, roughness: 0.4 }));
                sbTop.position.y = RIM + 2.3; sbGroup.add(sbTop);
                const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, APEX - (RIM + 2.3), 6), new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6 }));
                cable.position.y = (APEX + RIM + 2.3) / 2; sbGroup.add(cable);

                /* ---- truss ring + posts ---- */
                const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.22, 10, 80), new THREE.MeshStandardMaterial({ color: 0xb8c3d2, metalness: 0.95, roughness: 0.3 }));
                ring.rotation.x = Math.PI / 2; ring.position.y = RIM; arena.add(ring);
                const ring2 = new THREE.Mesh(new THREE.TorusGeometry(R - 0.45, 0.12, 8, 80), new THREE.MeshStandardMaterial({ color: 0x8b97a8, metalness: 0.9, roughness: 0.35 }));
                ring2.rotation.x = Math.PI / 2; ring2.position.y = RIM - 0.5; arena.add(ring2);
                // glowing teal LED ribbon on the rim — defines the arena silhouette and blooms
                const ledRimMat = new THREE.MeshStandardMaterial({ color: 0x002525, emissive: TEAL, emissiveIntensity: 1.7, metalness: 0.2, roughness: 0.5 });
                const ledRim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.06, 0.11, 10, 140), ledRimMat);
                ledRim.rotation.x = Math.PI / 2; ledRim.position.y = RIM + 0.06; arena.add(ledRim);
                const postMat = new THREE.MeshStandardMaterial({ color: 0x9fb0c2, metalness: 0.9, roughness: 0.35 });
                for (let i = 0; i < 28; i++) {
                    const a = (i / 28) * Math.PI * 2;
                    const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, RIM, 0.16), postMat);
                    p.position.set(Math.cos(a) * R, RIM / 2, Math.sin(a) * R); arena.add(p);
                }

                /* ---- court + logo ---- */
                // reflective glossy floor (desktop) — mirrors beams/logo/crowd like a real arena court
                if (ReflectorCls) {
                    const mirror = new ReflectorCls(new THREE.CircleGeometry(R - 1.25, 64), {
                        textureWidth: 1024, textureHeight: 1024, color: 0x2b3a4c, clipBias: 0.003,
                    });
                    mirror.rotation.x = -Math.PI / 2; mirror.position.y = 0.0; arena.add(mirror);
                }
                // court tint laid over the mirror — translucent so reflections read through it (wet-court look)
                const court = new THREE.Mesh(new THREE.CircleGeometry(R - 1.3, 64), new THREE.MeshStandardMaterial({ color: 0x14233b, metalness: 0.3, roughness: 0.7, emissive: 0x06121f, emissiveIntensity: 0.5, transparent: !!ReflectorCls, opacity: ReflectorCls ? 0.5 : 1, depthWrite: !ReflectorCls }));
                court.rotation.x = -Math.PI / 2; court.position.y = 0.02; arena.add(court);
                const courtLogo = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), new THREE.MeshBasicMaterial({ map: courtTex, transparent: true, depthWrite: false }));
                courtLogo.rotation.x = -Math.PI / 2; courtLogo.position.y = 0.06; arena.add(courtLogo);
                const mk = new THREE.LineBasicMaterial({ color: 0x8fb6d6, transparent: true, opacity: 0.5 });
                const cp = [];
                for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2; cp.push(new THREE.Vector3(Math.cos(a) * 2.2, 0.05, Math.sin(a) * 2.2)); }
                arena.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(cp), mk));
                // ground haze — soft teal glow beneath the arena so it sits in a space, not a void
                const hazeTex = tex((x, w, h) => {
                    const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
                    g.addColorStop(0, 'rgba(0,201,201,0.5)');
                    g.addColorStop(0.5, 'rgba(0,120,140,0.18)');
                    g.addColorStop(1, 'rgba(0,0,0,0)');
                    x.fillStyle = g; x.fillRect(0, 0, w, h);
                }, 256, 256);
                const haze = new THREE.Mesh(new THREE.PlaneGeometry(74, 74), new THREE.MeshBasicMaterial({ map: hazeTex, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
                haze.rotation.x = -Math.PI / 2; haze.position.y = -0.04; arena.add(haze);

                /* ---- grandstands + crowd ---- */
                const standMat = new THREE.MeshStandardMaterial({ color: 0x182c44, metalness: 0.4, roughness: 0.7, emissive: 0x0a1d30, emissiveIntensity: 0.6 });
                const cPos = [], cBase = [], cAng = [], screenList = [];
                const pal = [0x2f6fb0, 0x3b8fd0, 0x59b0e0, 0x7fd0e8, 0x244e7a, 0x9fe0ee];
                const perRow = Math.round(96 * QUALITY);
                function stand(angle) {
                    const g = new THREE.Group(); const rows = 6, seatW = 11;
                    for (let r = 0; r < rows; r++) {
                        const depth = 0.9, hh = 0.55 + r * 0.55;
                        const tier = new THREE.Mesh(new THREE.BoxGeometry(seatW, hh, depth), standMat);
                        tier.position.set(0, hh / 2, R + 0.6 + r * depth); g.add(tier);
                        for (let c = 0; c < perRow; c++) {
                            const lx = (Math.random() - 0.5) * seatW;
                            const lz = R + 0.6 + r * depth + (Math.random() - 0.5) * depth * 0.6;
                            const ly = hh + 0.12 + Math.random() * 0.12;
                            const wx = Math.cos(angle) * lz - Math.sin(angle) * lx;
                            const wz = Math.sin(angle) * lz + Math.cos(angle) * lx;
                            cPos.push(wx, ly, wz);
                            const col = new THREE.Color(pal[(Math.random() * pal.length) | 0]);
                            cBase.push(col.r, col.g, col.b);
                            cAng.push(Math.atan2(wz, wx));
                        }
                    }
                    const screen = new THREE.Mesh(new THREE.BoxGeometry(6, 2.2, 0.2), new THREE.MeshBasicMaterial({ map: ledTex }));
                    screen.position.set(0, RIM + 1.5, R + 1.2); g.add(screen);
                    screen.userData = { phase: Math.random() * 6.28 }; screenList.push(screen);
                    g.rotation.y = angle; return g;
                }
                [0, Math.PI / 2, Math.PI, Math.PI * 1.5].forEach((a) => arena.add(stand(a)));
                const cg = new THREE.BufferGeometry();
                cg.setAttribute('position', new THREE.Float32BufferAttribute(cPos, 3));
                const colAttr = new THREE.Float32BufferAttribute(cBase.slice(), 3);
                cg.setAttribute('color', colAttr);
                const crowd = new THREE.Points(cg, new THREE.PointsMaterial({ size: 0.17, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false }));
                arena.add(crowd);
                const cN = cAng.length;

                /* ---- sweeping beams ---- */
                const beams = new THREE.Group(); arena.add(beams);
                const beamList = [];
                const NB = Math.round(18 * QUALITY);
                const DOWN = new THREE.Vector3(0, -1, 0);
                // soft radial glow texture for the spotlight floor pools
                const poolTex = tex((x, w, h) => {
                    const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
                    g.addColorStop(0, 'rgba(255,180,120,0.9)');
                    g.addColorStop(0.35, 'rgba(0,201,201,0.4)');
                    g.addColorStop(1, 'rgba(0,0,0,0)');
                    x.fillStyle = g; x.fillRect(0, 0, w, h);
                }, 128, 128);
                const poolList = [];
                for (let i = 0; i < NB; i++) {
                    const a = (i / NB) * Math.PI * 2;
                    const fpos = new THREE.Vector3(Math.cos(a) * (R - 0.4), RIM + 0.3, Math.sin(a) * (R - 0.4));
                    // geometry offset so the narrow apex is at the fixture and the cone hangs DOWN (-Y), wide pool at the floor
                    const geo = new THREE.ConeGeometry(1.7, 7, 16, 1, true);
                    geo.translate(0, -3.5, 0);
                    const cone = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: EMBER, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
                    cone.position.copy(fpos);
                    // aim the downward beam inward toward a point on the court floor (spotlight on the floor)
                    const target = new THREE.Vector3(Math.cos(a) * 2.5, 0.1, Math.sin(a) * 2.5);
                    cone.quaternion.setFromUnitVectors(DOWN, target.clone().sub(fpos).normalize());
                    cone.userData = { base: 0.12, phase: Math.random() * 6.28, spd: 0.6 + Math.random() * 0.8 };
                    beams.add(cone); beamList.push(cone);
                    // bright inner core shaft (blooms into a crisp light beam)
                    const coreGeo = new THREE.ConeGeometry(0.5, 7, 12, 1, true);
                    coreGeo.translate(0, -3.5, 0);
                    const core = new THREE.Mesh(coreGeo, new THREE.MeshBasicMaterial({ color: 0xfff4e6, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
                    core.position.copy(fpos); core.quaternion.copy(cone.quaternion);
                    core.userData = { base: 0.15, phase: cone.userData.phase, spd: cone.userData.spd };
                    beams.add(core); beamList.push(core);
                    const fix = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: EMBER2 }));
                    fix.position.copy(fpos); arena.add(fix);
                    // glowing light pool where the beam lands on the floor (sweeps with the beam group)
                    const pool = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
                    pool.rotation.x = -Math.PI / 2;
                    pool.position.set(Math.cos(a) * 2.5, 0.06, Math.sin(a) * 2.5);
                    pool.userData = { phase: cone.userData.phase, spd: cone.userData.spd };
                    beams.add(pool); poolList.push(pool);
                }

                /* ---- falling sparks ---- */
                const sCount = Math.round(160 * QUALITY);
                const sg = new THREE.BufferGeometry(), sp = new Float32Array(sCount * 3), sv = [];
                for (let i = 0; i < sCount; i++) { const a = Math.random() * 6.28, rr = Math.random() * R * 0.9; sp[i * 3] = Math.cos(a) * rr; sp[i * 3 + 1] = Math.random() * APEX; sp[i * 3 + 2] = Math.sin(a) * rr; sv.push(0.01 + Math.random() * 0.04); }
                sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
                const sparks = new THREE.Points(sg, new THREE.PointsMaterial({ color: EMBER2, size: 0.09, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
                arena.add(sparks);

                /* ---- drifting air haze (dust motes the beams cut through) ---- */
                const moteCount = Math.round(120 * QUALITY);
                const mg = new THREE.BufferGeometry(), mPos = new Float32Array(moteCount * 3), mRise = [], mPhase = [];
                for (let i = 0; i < moteCount; i++) {
                    const a = Math.random() * 6.28, rr = Math.random() * (R - 0.5);
                    mPos[i * 3] = Math.cos(a) * rr; mPos[i * 3 + 1] = Math.random() * APEX; mPos[i * 3 + 2] = Math.sin(a) * rr;
                    mRise.push(0.1 + Math.random() * 0.22); mPhase.push(Math.random() * 6.28);
                }
                mg.setAttribute('position', new THREE.BufferAttribute(mPos, 3));
                const motes = new THREE.Points(mg, new THREE.PointsMaterial({ color: 0x9fe0ee, size: 0.06, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }));
                arena.add(motes);

                /* ---- signature firework bursts above the canopy ---- */
                const FW = Math.round(90 * QUALITY);
                const fwG = new THREE.BufferGeometry();
                const fwPos = new Float32Array(FW * 3), fwCol = new Float32Array(FW * 3), fwVel = new Float32Array(FW * 3);
                for (let i = 0; i < FW; i++) fwPos[i * 3 + 1] = -80; // parked off-screen until launch
                fwG.setAttribute('position', new THREE.BufferAttribute(fwPos, 3));
                fwG.setAttribute('color', new THREE.BufferAttribute(fwCol, 3));
                const fwMat = new THREE.PointsMaterial({ size: 0.18, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
                const fireworks = new THREE.Points(fwG, fwMat); arena.add(fireworks);
                const fwPalette = [new THREE.Color(TEAL), new THREE.Color(0xffd27a), new THREE.Color(EMBER2), new THREE.Color(0xffffff)];
                const fwBase = new THREE.Color();
                let fwLife = 0, nextFw = 3.5;
                function launchFw() {
                    fwBase.copy(fwPalette[(Math.random() * fwPalette.length) | 0]);
                    const ox = (Math.random() - 0.5) * 10, oy = APEX + 2.5 + Math.random() * 3, oz = (Math.random() - 0.5) * 10;
                    for (let i = 0; i < FW; i++) {
                        fwPos[i * 3] = ox; fwPos[i * 3 + 1] = oy; fwPos[i * 3 + 2] = oz;
                        const u = Math.random() * 2 - 1, th = Math.random() * 6.28, sp = 2.4 + Math.random() * 3.4, sq = Math.sqrt(1 - u * u);
                        fwVel[i * 3] = Math.cos(th) * sq * sp; fwVel[i * 3 + 1] = u * sp; fwVel[i * 3 + 2] = Math.sin(th) * sq * sp;
                        fwCol[i * 3] = fwBase.r; fwCol[i * 3 + 1] = fwBase.g; fwCol[i * 3 + 2] = fwBase.b;
                    }
                    fwLife = 1;
                    fwG.attributes.position.needsUpdate = true; fwG.attributes.color.needsUpdate = true;
                }

                /* ---- interaction ---- */
                let mx = 0, my = 0, tmx = 0, tmy = 0, scrollY = 0;
                const onMove = (e) => { tmx = (e.clientX / window.innerWidth - 0.5); tmy = (e.clientY / window.innerHeight - 0.5); };
                const onScroll = () => { scrollY = window.scrollY; };
                const onResize = () => size();
                window.addEventListener('pointermove', onMove);
                window.addEventListener('scroll', onScroll, { passive: true });
                window.addEventListener('resize', onResize);
                cleanupFns.push(() => window.removeEventListener('pointermove', onMove));
                cleanupFns.push(() => window.removeEventListener('scroll', onScroll));
                cleanupFns.push(() => window.removeEventListener('resize', onResize));
                size();

                const clock = new THREE.Clock();
                const start = performance.now();
                let lastStrobe = 0, lastT = 0;
                const smooth = (x) => x * x * (3 - 2 * x);
                const cA = new THREE.Color(EMBER), cB = new THREE.Color(TEAL), tmpC = new THREE.Color();

                function frame() {
                    const t = clock.getElapsedTime();
                    const dt = Math.min(0.05, t - lastT); lastT = t;
                    const el = (performance.now() - start) / 1000;
                    mx += (tmx - mx) * 0.05; my += (tmy - my) * 0.05;

                    const mix = (Math.sin(t * 0.5) * 0.5 + 0.5);
                    tmpC.copy(cA).lerp(cB, mix);
                    warm.color.copy(tmpC); beams.children.forEach((b) => b.material.color.copy(tmpC));
                    warm.intensity = 2.0 + Math.sin(t * 1.6) * 0.7;
                    ledRimMat.emissiveIntensity = 1.5 + Math.sin(t * 1.4) * 0.5;
                    beamList.forEach((b) => { b.material.opacity = b.userData.base + Math.sin(t * b.userData.spd + b.userData.phase) * 0.09; });
                    poolList.forEach((p) => { p.material.opacity = 0.42 + Math.sin(t * p.userData.spd + p.userData.phase) * 0.18; });
                    beams.rotation.y = t * 0.18;

                    if (t - lastStrobe > 7) lastStrobe = t;
                    const sPhase = t - lastStrobe;
                    strobe.intensity = (sPhase < 0.18 ? (1 - sPhase / 0.18) : 0) * 7;

                    sbGroup.rotation.y = t * 0.25; sb.position.y = RIM + 1.4 + Math.sin(t * 0.8) * 0.12;

                    const colArr = colAttr.array, wave = t * 1.1;
                    for (let i = 0; i < cN; i++) {
                        const d = Math.cos(cAng[i] - wave);
                        const b = 0.7 + Math.max(0, d) * Math.max(0, d) * 1.7;
                        colArr[i * 3] = Math.min(1, cBase[i * 3] * b);
                        colArr[i * 3 + 1] = Math.min(1, cBase[i * 3 + 1] * b);
                        colArr[i * 3 + 2] = Math.min(1, cBase[i * 3 + 2] * b);
                    }
                    // camera-flash twinkles in the crowd
                    for (let k = 0; k < 6; k++) { const idx = (Math.random() * cN) | 0; colArr[idx * 3] = 1; colArr[idx * 3 + 1] = 1; colArr[idx * 3 + 2] = 1; }
                    colAttr.needsUpdate = true;

                    const sa = sg.attributes.position.array;
                    for (let i = 0; i < sCount; i++) { sa[i * 3 + 1] -= sv[i] * 6; if (sa[i * 3 + 1] < 0.1) { const a = Math.random() * 6.28, rr = Math.random() * R * 0.9; sa[i * 3] = Math.cos(a) * rr; sa[i * 3 + 1] = APEX - 0.5; sa[i * 3 + 2] = Math.sin(a) * rr; } }
                    sg.attributes.position.needsUpdate = true;
                    courtLogo.material.opacity = 0.85 + Math.sin(t * 1.2) * 0.1;

                    // LED screen sheen — subtle brightness breathing so the boards read as live screens
                    for (let i = 0; i < screenList.length; i++) {
                        const s = 0.82 + Math.sin(t * 1.8 + screenList[i].userData.phase) * 0.14;
                        screenList[i].material.color.setScalar(s);
                    }

                    // drifting air haze
                    const ma = mg.attributes.position.array;
                    for (let i = 0; i < moteCount; i++) {
                        ma[i * 3 + 1] += mRise[i] * dt;
                        ma[i * 3] += Math.sin(t * 0.3 + mPhase[i]) * 0.004;
                        if (ma[i * 3 + 1] > APEX) ma[i * 3 + 1] = 0.1;
                    }
                    mg.attributes.position.needsUpdate = true;

                    // signature fireworks
                    if (t > nextFw) { launchFw(); nextFw = t + 4.5 + Math.random() * 3.5; }
                    if (fwLife > 0) {
                        fwLife = Math.max(0, fwLife - dt * 0.5);
                        for (let i = 0; i < FW; i++) {
                            fwVel[i * 3 + 1] -= dt * 3.2; // gravity
                            fwPos[i * 3] += fwVel[i * 3] * dt;
                            fwPos[i * 3 + 1] += fwVel[i * 3 + 1] * dt;
                            fwPos[i * 3 + 2] += fwVel[i * 3 + 2] * dt;
                            fwCol[i * 3] = fwBase.r * fwLife; fwCol[i * 3 + 1] = fwBase.g * fwLife; fwCol[i * 3 + 2] = fwBase.b * fwLife;
                        }
                        fwMat.opacity = 0.95 * fwLife;
                        fwG.attributes.position.needsUpdate = true; fwG.attributes.color.needsUpdate = true;
                    }

                    const intro = smooth(Math.min(el / 4.8, 1));
                    const f = Math.min(scrollY / (window.innerHeight || 800), 1);
                    // cinematic settle: bloom flash as the camera lands + FOV ease-in
                    if (bloomPass) bloomPass.strength = 0.55 + Math.max(0, 0.2 - Math.abs(intro - 0.92) * 4);
                    if (intro < 1) { camera.fov = THREE.MathUtils.lerp(58, 50, intro); camera.updateProjectionMatrix(); }
                    const orbit = t * 0.05;
                    const radius = THREE.MathUtils.lerp(2, 27, intro) + mx * 3;
                    const camY = THREE.MathUtils.lerp(46, 11, intro) - my * 2.4 + f * 5;
                    camera.position.set(Math.sin(orbit) * radius, camY, Math.cos(orbit) * radius);
                    camera.lookAt(0, THREE.MathUtils.lerp(8, 4.5, intro) - f * 1.2, 0);

                    renderFrame();
                }

                if (reduceMotion) {
                    // single settled frame, no animation loop
                    const t = 3, el = 6;
                    void t; void el;
                    camera.position.set(0, 11, 27);
                    camera.lookAt(0, 4.5, 0);
                    // give crowd a neutral brightness
                    renderFrame();
                } else {
                    const loop = () => { if (disposed) return; frame(); rafId = requestAnimationFrame(loop); };
                    const onVis = () => { if (document.hidden) { if (rafId) cancelAnimationFrame(rafId); rafId = null; } else if (!rafId && !disposed) loop(); };
                    document.addEventListener('visibilitychange', onVis);
                    cleanupFns.push(() => document.removeEventListener('visibilitychange', onVis));
                    loop();
                }
            })
            .catch(() => {
                // three failed to load — leave the CSS gradient fallback visible
            });

        return () => {
            disposed = true;
            if (rafId) cancelAnimationFrame(rafId);
            cleanupFns.forEach((fn) => fn());
            if (renderer) {
                renderer.dispose();
                renderer.forceContextLoss && renderer.forceContextLoss();
            }
        };
    }, []);

    return (
        <header className="arena-hero">
            <canvas ref={canvasRef} className="arena-canvas" />
            <div className="arena-vignette" />
            <div className="arena-fade" />
            <div className="arena-header">
                <div className="arena-badge"><span className="arena-pulse" /> &#10024; Premium Exhibition &amp; Event Services &middot; Bahrain</div>
            </div>
            <div className="arena-text-scrim" aria-hidden="true" />
            <div className="arena-inner">
                <h1 className="arena-title">We Build the <span className="arena-highlight">Show</span></h1>
                <p className="arena-sub">
                    From a single booth to a full arena — furniture, LED displays, graphics, and structures,
                    designed and installed by Pico. Order online and we&apos;ll handle the rest.
                </p>
                <div className="arena-actions">
                    <Link href="/catalogue" className="btn btn-primary btn-lg">Browse Catalogue &#8594;</Link>
                    <Link href="/cart" className="btn btn-secondary btn-lg arena-cta-ghost">&#128722; View Cart</Link>
                </div>
            </div>
            <div className="arena-credit">Inspired by our build for the FIBA 3x3 World Tour Finals — Manama, Bahrain.</div>
            <div className="arena-scroll"><span className="arena-scroll-txt">Scroll</span><span className="arena-scroll-arrow" aria-hidden="true">&#8595;</span></div>
        </header>
    );
}
