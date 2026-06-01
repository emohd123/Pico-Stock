'use client';

import { useEffect, useRef } from 'react';

/**
 * ContactScene — a floating field of 3D objects for the company-profile Contact
 * background. Icosahedrons, torus knots, screen-panels and octahedrons, each a
 * teal/metal solid body wrapped in a glowing wireframe shell, drifting and
 * rotating independently. Cinematic 3-point lighting (teal key / violet rim /
 * blue fill) + exponential depth fog, a 900-point starfield, mouse parallax and
 * a subtle scroll dolly.
 *
 * Mirrors ArenaHero's lifecycle: lazy-loads three on the client, respects
 * prefers-reduced-motion, scales down on mobile, and fully disposes on unmount.
 */
export default function ContactScene() {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        let renderer, rafId = null, disposed = false;
        const cleanupFns = [];

        const reduceMotion =
            typeof window !== 'undefined' &&
            window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 760;
        const QUALITY = isMobile ? 0.6 : 1;

        import('three')
            .then((THREE) => {
                if (disposed) return;

                const TEAL = 0x00c9c9, VIOLET = 0x7c4dff, BLUE = 0x2f6fff, NAVY = 0x0a0e1a;

                const scene = new THREE.Scene();
                scene.fog = new THREE.FogExp2(NAVY, 0.055);

                const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);
                camera.position.set(0, 0, 16);

                renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: true });
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));

                function size() {
                    const w = canvas.clientWidth || canvas.parentElement.clientWidth || window.innerWidth;
                    const h = canvas.clientHeight || canvas.parentElement.clientHeight || window.innerHeight;
                    camera.aspect = w / h;
                    camera.updateProjectionMatrix();
                    renderer.setSize(w, h, false);
                }

                /* ---- cinematic 3-point lighting ---- */
                scene.add(new THREE.AmbientLight(0x18202e, 0.7));
                const key = new THREE.DirectionalLight(TEAL, 2.2); key.position.set(-8, 6, 10); scene.add(key);
                const rim = new THREE.DirectionalLight(VIOLET, 1.7); rim.position.set(9, 4, -8); scene.add(rim);
                const fill = new THREE.DirectionalLight(BLUE, 0.9); fill.position.set(4, -6, 6); scene.add(fill);

                /* ---- the scene group (tilts with the mouse) ---- */
                const world = new THREE.Group();
                scene.add(world);

                /* ---- floating objects: solid teal/metal body + glowing wireframe shell ---- */
                const solidMat = () => new THREE.MeshStandardMaterial({
                    color: 0x0e5a5a, metalness: 0.85, roughness: 0.28,
                    emissive: 0x00343a, emissiveIntensity: 0.6,
                });
                const wireMat = () => new THREE.MeshBasicMaterial({
                    color: TEAL, wireframe: true, transparent: true, opacity: 0.55,
                });

                function makeGeo(kind, s) {
                    switch (kind) {
                        case 'ico':   return new THREE.IcosahedronGeometry(s, 0);
                        case 'knot':  return new THREE.TorusKnotGeometry(s * 0.7, s * 0.26, 90, 14);
                        case 'octa':  return new THREE.OctahedronGeometry(s, 0);
                        case 'panel': return new THREE.BoxGeometry(s * 1.7, s * 1.1, s * 0.12);
                        default:      return new THREE.IcosahedronGeometry(s, 0);
                    }
                }

                const kinds = ['ico', 'knot', 'octa', 'panel'];
                const objects = [];
                const COUNT = Math.round(13 * QUALITY);
                for (let i = 0; i < COUNT; i++) {
                    const kind = kinds[i % kinds.length];
                    const s = 0.7 + Math.random() * 1.2;
                    const geo = makeGeo(kind, s);
                    const g = new THREE.Group();
                    const solid = new THREE.Mesh(geo, solidMat());
                    const shell = new THREE.Mesh(geo, wireMat());
                    shell.scale.setScalar(1.06);
                    g.add(solid); g.add(shell);
                    // scatter through a volume; spread in z so fog fades distant ones
                    g.position.set(
                        (Math.random() - 0.5) * 22,
                        (Math.random() - 0.5) * 13,
                        -2 - Math.random() * 24
                    );
                    g.rotation.set(Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28);
                    g.userData = {
                        rx: (Math.random() - 0.5) * 0.4, ry: (Math.random() - 0.5) * 0.4,
                        rz: (Math.random() - 0.5) * 0.3,
                        fy: 0.4 + Math.random() * 0.8, fx: 0.3 + Math.random() * 0.6,
                        phase: Math.random() * 6.28, baseY: g.position.y, baseX: g.position.x,
                    };
                    world.add(g); objects.push(g);
                }

                /* ---- 900-point starfield rotating behind everything ---- */
                const starN = Math.round(900 * QUALITY);
                const sg = new THREE.BufferGeometry();
                const sp = new Float32Array(starN * 3);
                for (let i = 0; i < starN; i++) {
                    const r = 30 + Math.random() * 40;
                    const th = Math.random() * 6.28, ph = Math.acos(2 * Math.random() - 1);
                    sp[i * 3] = r * Math.sin(ph) * Math.cos(th);
                    sp[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
                    sp[i * 3 + 2] = r * Math.cos(ph) - 20;
                }
                sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
                const stars = new THREE.Points(sg, new THREE.PointsMaterial({
                    color: 0x8fe9e9, size: 0.13, transparent: true, opacity: 0.7,
                    depthWrite: false, blending: THREE.AdditiveBlending,
                }));
                scene.add(stars);

                /* ---- interaction: mouse parallax + scroll dolly ---- */
                let tmx = 0, tmy = 0, mx = 0, my = 0, scrollY = 0;
                const onMove = (e) => { tmx = e.clientX / window.innerWidth - 0.5; tmy = e.clientY / window.innerHeight - 0.5; };
                const onScroll = () => { scrollY = window.scrollY || 0; };
                const onResize = () => size();
                window.addEventListener('pointermove', onMove);
                window.addEventListener('scroll', onScroll, { passive: true });
                window.addEventListener('resize', onResize);
                cleanupFns.push(() => window.removeEventListener('pointermove', onMove));
                cleanupFns.push(() => window.removeEventListener('scroll', onScroll));
                cleanupFns.push(() => window.removeEventListener('resize', onResize));
                size();

                const clock = new THREE.Clock();

                function frame() {
                    const t = clock.getElapsedTime();
                    mx += (tmx - mx) * 0.04; my += (tmy - my) * 0.04;

                    objects.forEach((g) => {
                        const u = g.userData;
                        g.rotation.x += u.rx * 0.01;
                        g.rotation.y += u.ry * 0.01;
                        g.rotation.z += u.rz * 0.01;
                        g.position.y = u.baseY + Math.sin(t * u.fy + u.phase) * 0.6;
                        g.position.x = u.baseX + Math.cos(t * u.fx + u.phase) * 0.4;
                    });

                    stars.rotation.y = t * 0.02;
                    stars.rotation.x = t * 0.008;

                    // parallax — whole scene tilts toward the cursor
                    world.rotation.y += (mx * 0.5 - world.rotation.y) * 0.05;
                    world.rotation.x += (my * 0.4 - world.rotation.x) * 0.05;

                    // scroll dolly — push in + lift (no-op on scroll-jacked sections where scrollY stays 0)
                    const f = Math.min(scrollY / (window.innerHeight || 800), 1);
                    camera.position.z = 16 - f * 6;
                    camera.position.y = f * 3;
                    camera.lookAt(0, 0, -6);

                    renderer.render(scene, camera);
                }

                if (reduceMotion) {
                    size();
                    renderer.render(scene, camera);
                } else {
                    const loop = () => { if (disposed) return; frame(); rafId = requestAnimationFrame(loop); };
                    const onVis = () => {
                        if (document.hidden) { if (rafId) cancelAnimationFrame(rafId); rafId = null; }
                        else if (!rafId && !disposed) loop();
                    };
                    document.addEventListener('visibilitychange', onVis);
                    cleanupFns.push(() => document.removeEventListener('visibilitychange', onVis));
                    loop();
                }
            })
            .catch(() => { /* three failed — section keeps its solid bg */ });

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
        <div className="cpv2-contact-3d" aria-hidden="true">
            <canvas ref={canvasRef} className="cpv2-contact-3d-canvas" />
            <div className="cpv2-contact-3d-vignette" />
            <div className="cpv2-contact-3d-fade" />
        </div>
    );
}
