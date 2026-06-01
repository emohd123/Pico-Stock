'use client';

import { useEffect, useRef } from 'react';

/**
 * CatalogueScene — subtle floating field of exhibition furniture (chairs,
 * tables, AV screens) rendered as glowing teal wireframe outlines with a faint
 * solid fill. Slow drift + gentle mouse parallax, depth fog. Deliberately quiet
 * ("not much noise"): few objects, low opacity, slow motion.
 *
 * Same lifecycle as ContactScene/ArenaHero: lazy three, reduced-motion aware,
 * mobile scaling, full dispose on unmount.
 */
export default function CatalogueScene() {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        let renderer, rafId = null, disposed = false;
        const cleanupFns = [];

        const reduceMotion = typeof window !== 'undefined' && window.matchMedia
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const isMobile = typeof window !== 'undefined' && window.innerWidth < 760;
        const QUALITY = isMobile ? 0.6 : 1;

        import('three')
            .then((THREE) => {
                if (disposed) return;

                const TEAL = 0x00c9c9, NAVY = 0x0a0e1a;
                const scene = new THREE.Scene();
                scene.fog = new THREE.FogExp2(NAVY, 0.048);

                const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
                camera.position.set(0, 0, 18);

                renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: true });
                renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2));

                function size() {
                    const w = canvas.clientWidth || canvas.parentElement.clientWidth || window.innerWidth;
                    const h = canvas.clientHeight || canvas.parentElement.clientHeight || window.innerHeight;
                    camera.aspect = w / h;
                    camera.updateProjectionMatrix();
                    renderer.setSize(w, h, false);
                }

                scene.add(new THREE.AmbientLight(0x223040, 0.8));
                const key = new THREE.DirectionalLight(TEAL, 1.0); key.position.set(-6, 5, 8); scene.add(key);

                const world = new THREE.Group();
                scene.add(world);

                const edgeMat = () => new THREE.LineBasicMaterial({ color: TEAL, transparent: true, opacity: 0.7 });
                const solidMat = () => new THREE.MeshStandardMaterial({ color: 0x0c4a4a, metalness: 0.6, roughness: 0.4, transparent: true, opacity: 0.2 });

                // add a box "part" as faint solid + clean edge outline (EdgesGeometry = no triangulation noise)
                function part(group, geo, x, y, z) {
                    const solid = new THREE.Mesh(geo, solidMat()); solid.position.set(x, y, z); group.add(solid);
                    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMat()); edges.position.set(x, y, z); group.add(edges);
                }
                function legs(group, geo, sx, sz, y) {
                    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => part(group, geo, a * sx, y, b * sz));
                }
                function chair(s) {
                    const g = new THREE.Group();
                    part(g, new THREE.BoxGeometry(s, s * 0.12, s), 0, 0, 0);                 // seat
                    part(g, new THREE.BoxGeometry(s, s * 0.9, s * 0.12), 0, s * 0.5, -s * 0.44); // back
                    legs(g, new THREE.BoxGeometry(s * 0.1, s * 0.8, s * 0.1), s * 0.4, s * 0.4, -s * 0.45);
                    return g;
                }
                function table(s) {
                    const g = new THREE.Group();
                    part(g, new THREE.BoxGeometry(s * 1.7, s * 0.12, s), 0, 0, 0);            // top
                    legs(g, new THREE.BoxGeometry(s * 0.1, s * 0.9, s * 0.1), s * 0.72, s * 0.4, -s * 0.5);
                    return g;
                }
                function screen(s) {
                    const g = new THREE.Group();
                    part(g, new THREE.BoxGeometry(s * 1.9, s * 1.15, s * 0.08), 0, s * 0.4, 0); // panel
                    part(g, new THREE.BoxGeometry(s * 0.12, s * 0.5, s * 0.12), 0, -s * 0.35, 0); // neck
                    part(g, new THREE.BoxGeometry(s * 0.7, s * 0.06, s * 0.45), 0, -s * 0.6, 0);  // base
                    return g;
                }

                function sofa(s) {
                    const g = new THREE.Group();
                    part(g, new THREE.BoxGeometry(s * 1.8, s * 0.4, s * 0.8), 0, 0, 0);          // seat base
                    part(g, new THREE.BoxGeometry(s * 1.8, s * 0.7, s * 0.18), 0, s * 0.45, -s * 0.32); // backrest
                    part(g, new THREE.BoxGeometry(s * 0.2, s * 0.5, s * 0.8), -s * 0.8, s * 0.3, 0);     // left arm
                    part(g, new THREE.BoxGeometry(s * 0.2, s * 0.5, s * 0.8), s * 0.8, s * 0.3, 0);      // right arm
                    return g;
                }
                function counter(s) {
                    const g = new THREE.Group();
                    part(g, new THREE.BoxGeometry(s * 1.3, s * 1.1, s * 0.6), 0, 0, 0);          // body
                    part(g, new THREE.BoxGeometry(s * 1.5, s * 0.12, s * 0.75), 0, s * 0.6, 0);  // counter top
                    return g;
                }
                function plinth(s) {
                    const g = new THREE.Group();
                    part(g, new THREE.BoxGeometry(s * 0.6, s * 1.4, s * 0.6), 0, 0, 0);          // column
                    part(g, new THREE.BoxGeometry(s * 0.82, s * 0.1, s * 0.82), 0, s * 0.75, 0); // top cap
                    return g;
                }
                function banner(s) {
                    const g = new THREE.Group();
                    part(g, new THREE.BoxGeometry(s * 0.9, s * 2.0, s * 0.05), 0, s * 0.4, 0);   // roll-up panel
                    part(g, new THREE.BoxGeometry(s * 0.9, s * 0.1, s * 0.4), 0, -s * 0.6, 0);   // base
                    return g;
                }

                const builders = [chair, table, screen, sofa, counter, plinth, banner];
                const objects = [];
                const COUNT = Math.round(12 * QUALITY);
                const perSide = Math.ceil(COUNT / 2);
                const vSpan = 15;            // total vertical range
                const slotH = vSpan / perSide; // even vertical spacing per side
                let leftN = 0, rightN = 0;
                for (let i = 0; i < COUNT; i++) {
                    const side = i % 2 === 0 ? -1 : 1;
                    const slot = side === -1 ? leftN++ : rightN++;
                    const g = builders[i % builders.length](1.0 + Math.random() * 0.6);
                    // each object gets its own vertical slot (+small jitter) so they never stack;
                    // depth layered by slot so neighbours also separate in z
                    const y = -vSpan / 2 + (slot + 0.5) * slotH + (Math.random() - 0.5) * (slotH * 0.3);
                    const x = side * (6.5 + Math.random() * 6);
                    const z = -2 - (slot % 3) * 3.5 - Math.random() * 1.5;
                    g.position.set(x, y, z);
                    g.rotation.set(Math.random() * 6.28, Math.random() * 6.28, 0);
                    g.userData = {
                        ry: (Math.random() - 0.5) * 0.3, fy: 0.3 + Math.random() * 0.35, fx: 0.15 + Math.random() * 0.25,
                        ph: Math.random() * 6.28, bx: x, by: y,
                    };
                    world.add(g); objects.push(g);
                }

                let tmx = 0, tmy = 0, mx = 0, my = 0;
                const onMove = (e) => { tmx = e.clientX / window.innerWidth - 0.5; tmy = e.clientY / window.innerHeight - 0.5; };
                const onResize = () => size();
                window.addEventListener('pointermove', onMove);
                window.addEventListener('resize', onResize);
                cleanupFns.push(() => window.removeEventListener('pointermove', onMove));
                cleanupFns.push(() => window.removeEventListener('resize', onResize));
                size();

                const clock = new THREE.Clock();
                function frame() {
                    const t = clock.getElapsedTime();
                    mx += (tmx - mx) * 0.03; my += (tmy - my) * 0.03;
                    objects.forEach((g) => {
                        const u = g.userData;
                        g.rotation.y += u.ry * 0.008;
                        g.position.y = u.by + Math.sin(t * u.fy + u.ph) * 0.35;
                        g.position.x = u.bx + Math.cos(t * u.fx + u.ph) * 0.25;
                    });
                    world.rotation.y += (mx * 0.3 - world.rotation.y) * 0.04;
                    world.rotation.x += (my * 0.25 - world.rotation.x) * 0.04;
                    renderer.render(scene, camera);
                }

                if (reduceMotion) {
                    size(); renderer.render(scene, camera);
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
            .catch(() => { /* three failed — orbs still show */ });

        return () => {
            disposed = true;
            if (rafId) cancelAnimationFrame(rafId);
            cleanupFns.forEach((fn) => fn());
            if (renderer) { renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss(); }
        };
    }, []);

    return <canvas ref={canvasRef} className="catalogue-3d-canvas" aria-hidden="true" />;
}
