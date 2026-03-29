import { promises as fs } from 'fs';
import path from 'path';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

class NodeFileReader {
    readAsArrayBuffer(blob) {
        blob.arrayBuffer().then((buffer) => {
            this.result = buffer;
            this.onloadend?.();
        }).catch((error) => {
            this.error = error;
            this.onerror?.(error);
        });
    }

    readAsDataURL(blob) {
        blob.arrayBuffer().then((buffer) => {
            const base64 = Buffer.from(buffer).toString('base64');
            this.result = `data:${blob.type || 'application/octet-stream'};base64,${base64}`;
            this.onloadend?.();
        }).catch((error) => {
            this.error = error;
            this.onerror?.(error);
        });
    }
}

global.FileReader = NodeFileReader;

const OUTPUT_DIR = path.join(process.cwd(), 'public', 'stand-design-kit');

function makeMaterial(color, metalness = 0.1, roughness = 0.75) {
    return new THREE.MeshStandardMaterial({ color, metalness, roughness });
}

function mesh(geometry, material, position = [0, 0, 0], rotation = [0, 0, 0]) {
    const item = new THREE.Mesh(geometry, material);
    item.position.set(...position);
    item.rotation.set(...rotation);
    item.castShadow = true;
    item.receiveShadow = true;
    return item;
}

function createChairModern() {
    const group = new THREE.Group();
    const seatMaterial = makeMaterial('#d6c6a3', 0.08, 0.72);
    const frameMaterial = makeMaterial('#90744d', 0.22, 0.42);
    group.add(mesh(new THREE.BoxGeometry(0.46, 0.08, 0.46), seatMaterial, [0, 0.5, 0]));
    group.add(mesh(new THREE.BoxGeometry(0.46, 0.46, 0.08), seatMaterial, [0, 0.73, -0.19]));
    [[-0.18, 0.24, -0.18], [0.18, 0.24, -0.18], [-0.18, 0.24, 0.18], [0.18, 0.24, 0.18]].forEach((position) => {
        group.add(mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.48, 12), frameMaterial, position));
    });
    return group;
}

function createSofaLounge() {
    const group = new THREE.Group();
    const bodyMaterial = makeMaterial('#e8ddc5', 0.05, 0.82);
    const accentMaterial = makeMaterial('#cab07a', 0.15, 0.55);
    group.add(mesh(new THREE.BoxGeometry(1.8, 0.28, 0.82), bodyMaterial, [0, 0.2, 0]));
    group.add(mesh(new THREE.BoxGeometry(1.8, 0.46, 0.18), bodyMaterial, [0, 0.52, -0.32]));
    group.add(mesh(new THREE.BoxGeometry(0.18, 0.44, 0.82), bodyMaterial, [-0.81, 0.42, 0]));
    group.add(mesh(new THREE.BoxGeometry(0.18, 0.44, 0.82), bodyMaterial, [0.81, 0.42, 0]));
    group.add(mesh(new THREE.BoxGeometry(1.8, 0.08, 0.82), accentMaterial, [0, 0.04, 0]));
    return group;
}

function createCoffeeTable() {
    const group = new THREE.Group();
    const topMaterial = makeMaterial('#f4efe5', 0.18, 0.46);
    const frameMaterial = makeMaterial('#9f8457', 0.22, 0.35);
    group.add(mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.05, 24), topMaterial, [0, 0.38, 0]));
    group.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.34, 12), frameMaterial, [0, 0.19, 0]));
    group.add(mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.04, 18), frameMaterial, [0, 0.02, 0]));
    return group;
}

function createMeetingTableRound() {
    const group = new THREE.Group();
    const topMaterial = makeMaterial('#f7f6f2', 0.1, 0.42);
    const frameMaterial = makeMaterial('#b4996b', 0.2, 0.36);
    group.add(mesh(new THREE.CylinderGeometry(0.47, 0.5, 0.06, 28), topMaterial, [0, 0.76, 0]));
    group.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.72, 14), frameMaterial, [0, 0.38, 0]));
    group.add(mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.04, 24), frameMaterial, [0, 0.02, 0]));
    return group;
}

function createScreenKiosk() {
    const group = new THREE.Group();
    const bodyMaterial = makeMaterial('#d4d9df', 0.22, 0.36);
    const screenMaterial = makeMaterial('#1f2937', 0.28, 0.24);
    group.add(mesh(new THREE.BoxGeometry(0.4, 0.95, 0.24), bodyMaterial, [0, 0.48, 0]));
    group.add(mesh(new THREE.BoxGeometry(0.72, 1.28, 0.08), screenMaterial, [0, 1.36, -0.03], [-0.28, 0, 0]));
    group.add(mesh(new THREE.BoxGeometry(0.7, 0.06, 0.38), bodyMaterial, [0, 0.03, 0.05]));
    return group;
}

function createDisplayPlinth() {
    const group = new THREE.Group();
    const material = makeMaterial('#efe9dc', 0.06, 0.76);
    const bandMaterial = makeMaterial('#c8a25b', 0.16, 0.42);
    group.add(mesh(new THREE.BoxGeometry(0.65, 0.92, 0.65), material, [0, 0.46, 0]));
    group.add(mesh(new THREE.BoxGeometry(0.68, 0.06, 0.68), bandMaterial, [0, 0.9, 0]));
    return group;
}

function createPlanterTall() {
    const group = new THREE.Group();
    const potMaterial = makeMaterial('#b89459', 0.16, 0.48);
    const plantMaterial = makeMaterial('#617a4e', 0.02, 0.88);
    group.add(mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.44, 16), potMaterial, [0, 0.22, 0]));
    group.add(mesh(new THREE.IcosahedronGeometry(0.34, 1), plantMaterial, [0, 0.76, 0]));
    return group;
}

function createBarStool() {
    const group = new THREE.Group();
    const seatMaterial = makeMaterial('#ddd2c2', 0.08, 0.7);
    const frameMaterial = makeMaterial('#8b6f46', 0.2, 0.38);
    group.add(mesh(new THREE.CylinderGeometry(0.19, 0.23, 0.08, 18), seatMaterial, [0, 0.78, 0]));
    group.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.74, 12), frameMaterial, [0, 0.37, 0]));
    group.add(mesh(new THREE.TorusGeometry(0.2, 0.02, 10, 24), frameMaterial, [0, 0.35, 0], [Math.PI / 2, 0, 0]));
    group.add(mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.04, 18), frameMaterial, [0, 0.02, 0]));
    return group;
}

function exportBinary(root) {
    return new Promise((resolve, reject) => {
        const exporter = new GLTFExporter();
        exporter.parse(root, (result) => resolve(Buffer.from(result)), reject, { binary: true });
    });
}

async function writeAsset(name, factory) {
    const scene = new THREE.Scene();
    const object = factory();
    scene.add(object);
    const buffer = await exportBinary(scene);
    await fs.writeFile(path.join(OUTPUT_DIR, `${name}.glb`), buffer);
}

async function main() {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const tasks = [
        ['chair-modern', createChairModern],
        ['sofa-lounge', createSofaLounge],
        ['coffee-table', createCoffeeTable],
        ['meeting-table-round', createMeetingTableRound],
        ['screen-kiosk', createScreenKiosk],
        ['display-plinth', createDisplayPlinth],
        ['planter-tall', createPlanterTall],
        ['bar-stool', createBarStool],
    ];

    for (const [name, factory] of tasks) {
        await writeAsset(name, factory);
    }

    console.log(`Generated ${tasks.length} stand-design kit assets in ${OUTPUT_DIR}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
