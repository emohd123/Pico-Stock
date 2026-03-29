'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Canvas, useThree } from '@react-three/fiber';
import { ContactShadows, Environment, Grid, Html, OrbitControls, RoundedBox, TransformControls, useGLTF } from '@react-three/drei';
import { DoubleSide } from 'three';
import {
    getStandDesignAsset,
    getStandDesignAssetPalette,
    getStandDesignMaterialPalette,
    getStandDesignPrimitive,
    getStandDesignPrimitivePalette,
} from '@/lib/standDesignAssetRegistry';
import { createDefaultStandDesignBrief, summarizeStandDesignBrief } from '@/lib/standDesignBrief';
import { createEmptyStandScene, createHeuristicStandScene, createSceneObjectFromPalette, validateStandDesignScene } from '@/lib/standDesignScene';

function numberValue(value, fallback = 0) {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
}

function createMessage(type = '', text = '') {
    return { type, text };
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function hexToRgb(hex) {
    const normalized = String(hex || '').replace('#', '').trim();
    const safe = normalized.length === 3
        ? normalized.split('').map((char) => char + char).join('')
        : normalized.padEnd(6, '0').slice(0, 6);
    const value = Number.parseInt(safe, 16);
    return {
        r: (value >> 16) & 255,
        g: (value >> 8) & 255,
        b: value & 255,
    };
}

function rgbToHex({ r, g, b }) {
    const toHex = (value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function mixHex(hex, targetHex, amount) {
    const source = hexToRgb(hex);
    const target = hexToRgb(targetHex);
    const ratio = clamp(amount, 0, 1);
    return rgbToHex({
        r: source.r + ((target.r - source.r) * ratio),
        g: source.g + ((target.g - source.g) * ratio),
        b: source.b + ((target.b - source.b) * ratio),
    });
}

function lightenHex(hex, amount = 0.12) {
    return mixHex(hex, '#ffffff', amount);
}

function darkenHex(hex, amount = 0.12) {
    return mixHex(hex, '#111827', amount);
}

function extractHexColors(text) {
    return (String(text || '').match(/#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g) || [])
        .map((item) => item.toLowerCase());
}

function inferNamedColor(text) {
    const haystack = String(text || '').toLowerCase();
    if (/gold|champagne|brass/.test(haystack)) return '#c8a24b';
    if (/white|ivory|cream/.test(haystack)) return '#f2ede3';
    if (/beige|sand|taupe/.test(haystack)) return '#d9cbb3';
    if (/wood|timber|oak|parquet/.test(haystack)) return '#bf9558';
    if (/black|charcoal|graphite/.test(haystack)) return '#1f2937';
    if (/blue|navy/.test(haystack)) return '#3b5d8f';
    if (/green|olive/.test(haystack)) return '#6f8660';
    return '';
}

function inferReferenceTheme(selectedConcept, brief) {
    const analysis = selectedConcept?.reference_analysis || {};
    const colorText = [
        brief?.brand_colors || '',
        brief?.material_direction_notes || '',
        ...(analysis?.materials_and_colors || []),
        ...(analysis?.matching_notes || []),
    ].join(' ');
    const extracted = extractHexColors(colorText);
    const namedPrimary = inferNamedColor(brief?.brand_colors || colorText) || '#f2ede3';
    const namedAccent = inferNamedColor(
        [
            brief?.brand_colors || '',
            brief?.branding_elements || '',
            ...(analysis?.materials_and_colors || []),
        ].join(' ')
    ) || '#c8a24b';
    const base = extracted[0] || namedPrimary;
    const accent = extracted[1] || (namedAccent === base ? lightenHex(namedAccent, 0.14) : namedAccent);
    const dark = extracted[2] || darkenHex(base, 0.72);
    const wood = /parquet|wood|timber|oak/.test(colorText.toLowerCase()) ? '#bf9558' : mixHex(base, '#b8894f', 0.45);
    return {
        base,
        accent,
        dark,
        wood,
        soft: lightenHex(base, 0.06),
        trim: darkenHex(base, 0.24),
        glow: lightenHex(accent, 0.18),
        neutral: mixHex(base, '#d7d1c7', 0.35),
    };
}

function applyReferenceThemeToScene(scene, selectedConcept, brief) {
    const theme = inferReferenceTheme(selectedConcept, brief);
    const nextObjects = (scene?.objects || []).map((sceneObject) => {
        const groupId = sceneObject.group_id || inferObjectZone(sceneObject).toLowerCase();
        const nextMaterial = { ...(sceneObject.material || {}) };
        const family = getObjectFamily(sceneObject);
        if (sceneObject.type === 'floor' || sceneObject.type === 'raised_floor') {
            nextMaterial.preset_id = 'oak-parquet';
            nextMaterial.color = theme.wood;
            nextMaterial.metalness = 0.04;
            nextMaterial.roughness = 0.62;
        } else if (/fascia|logo_beam|arch_band|portal_leg/.test(sceneObject.type)) {
            nextMaterial.preset_id = 'brushed-gold';
            nextMaterial.color = theme.accent;
            nextMaterial.metalness = 0.18;
            nextMaterial.roughness = 0.34;
            nextMaterial.emissive = theme.glow;
        } else if (sceneObject.type === 'screen' || sceneObject.type === 'screen_cluster_wall' || /AV/.test(family)) {
            nextMaterial.preset_id = 'polished-obsidian';
            nextMaterial.color = sceneObject.type === 'screen_cluster_wall' ? theme.trim : theme.dark;
            nextMaterial.metalness = 0.24;
            nextMaterial.roughness = 0.26;
            nextMaterial.emissive = mixHex(theme.accent, '#4f8fd8', 0.35);
        } else if (/counter|plinth|display/.test(sceneObject.type) || family === 'Display') {
            nextMaterial.preset_id = sceneObject.type === 'counter' ? 'anodized-aluminum' : '';
            nextMaterial.color = theme.soft;
            nextMaterial.metalness = 0.08;
            nextMaterial.roughness = 0.62;
        } else if (sceneObject.type === 'branded_wall' || /Branding/.test(family)) {
            nextMaterial.preset_id = 'gallery-white';
            nextMaterial.color = theme.base;
            nextMaterial.metalness = 0.06;
            nextMaterial.roughness = 0.72;
            nextMaterial.emissive = theme.glow;
        } else if (/wall|partition|storage_core|lounge_enclosure/.test(sceneObject.type) || family === 'Structure') {
            nextMaterial.preset_id = 'gallery-white';
            nextMaterial.color = theme.base;
            nextMaterial.metalness = 0.04;
            nextMaterial.roughness = 0.78;
        } else if (sceneObject.type === 'plane') {
            nextMaterial.preset_id = 'clear-glass';
            nextMaterial.color = lightenHex(theme.base, 0.12);
            nextMaterial.opacity = 0.32;
            nextMaterial.double_sided = true;
            nextMaterial.metalness = 0.04;
            nextMaterial.roughness = 0.08;
        } else if (family === 'Seating' || family === 'Tables') {
            nextMaterial.color = family === 'Seating' ? theme.neutral : theme.soft;
            nextMaterial.metalness = 0.08;
            nextMaterial.roughness = 0.72;
        } else if (family === 'Decor') {
            nextMaterial.color = sceneObject.type === 'planter' ? '#6f8660' : theme.neutral;
            nextMaterial.metalness = 0.04;
            nextMaterial.roughness = 0.84;
        }
        return {
            ...sceneObject,
            group_id: groupId,
            material: nextMaterial,
        };
    });
    return {
        ...scene,
        objects: nextObjects,
    };
}

function assetDisplayName(sceneObject) {
    const asset = getStandDesignAsset(sceneObject.asset_key);
    return asset?.label || sceneObject.label || sceneObject.type;
}

function primitiveDisplayName(sceneObject) {
    const primitive = getStandDesignPrimitive(sceneObject.type);
    return primitive?.label || sceneObject.label || sceneObject.type;
}

function getObjectFamily(sceneObject) {
    const primitive = sceneObject.kind === 'primitive' ? getStandDesignPrimitive(sceneObject.type) : null;
    const asset = sceneObject.kind === 'asset' ? getStandDesignAsset(sceneObject.asset_key) : null;
    const category = primitive?.category || asset?.category || '';
    if (/branding/i.test(category) || /fascia|logo|brand/i.test(sceneObject.type || '')) return 'Branding';
    if (/av/i.test(category) || /screen|kiosk|av/i.test(sceneObject.type || '')) return 'AV';
    if (/display/i.test(category) || /plinth|model/i.test(sceneObject.type || '')) return 'Display';
    if (/seating/i.test(category) || /chair|sofa|stool/i.test(sceneObject.type || '')) return 'Seating';
    if (/table/i.test(category) || /table/i.test(sceneObject.type || '')) return 'Tables';
    if (/access/i.test(category) || /ramp/i.test(sceneObject.type || '')) return 'Access';
    if (/decor/i.test(category) || /planter/i.test(sceneObject.type || '')) return 'Decor';
    return 'Structure';
}

function inferObjectZone(sceneObject) {
    const haystack = `${sceneObject.group_id || ''} ${sceneObject.label || ''} ${sceneObject.type || ''}`.toLowerCase();
    if (/vip|lounge/.test(haystack)) return 'VIP';
    if (/meeting|discussion/.test(haystack)) return 'Meeting';
    if (/reception|entry|entrance|counter|ramp/.test(haystack)) return 'Entry';
    if (/screen|kiosk|av/.test(haystack)) return 'AV';
    if (/model|display|plinth/.test(haystack)) return 'Display';
    if (/logo|brand|fascia|beam/.test(haystack)) return 'Branding';
    return 'Core';
}

function buildSceneTreeGroups(objects = []) {
    const groups = new Map();
    objects.forEach((sceneObject) => {
        const zone = inferObjectZone(sceneObject);
        const family = getObjectFamily(sceneObject);
        const key = `${zone}__${family}`;
        if (!groups.has(key)) {
            groups.set(key, { key, zone, family, items: [] });
        }
        groups.get(key).items.push(sceneObject);
    });
    return [...groups.values()].sort((left, right) => {
        if (left.zone === right.zone) return left.family.localeCompare(right.family);
        return left.zone.localeCompare(right.zone);
    });
}

function tokenizeReferenceHints(selectedConcept, brief) {
    const parts = [
        ...(selectedConcept?.reference_analysis?.major_structures || []),
        ...(selectedConcept?.reference_analysis?.zoned_elements || []),
        ...(selectedConcept?.reference_analysis?.anchor_objects || []),
        ...(selectedConcept?.reference_analysis?.materials_and_colors || []),
        brief?.brand_colors || '',
        brief?.screen_requirements || '',
        brief?.vip_requirements || '',
        brief?.meeting_requirements || '',
        brief?.reception_requirements || '',
        brief?.model_display_requirements || '',
    ];
    return parts.join(' ').toLowerCase();
}

function buildSuggestedPalette(selectedConcept, brief, objects = []) {
    const hintText = tokenizeReferenceHints(selectedConcept, brief);
    const objectTypes = new Set(objects.map((item) => item.type));
    const objectAssetKeys = new Set(objects.map((item) => item.asset_key).filter(Boolean));
    const primitiveSuggestions = getStandDesignPrimitivePalette()
        .map((item) => {
            let score = 0;
            if (objectTypes.has(item.type)) score += 6;
            if (hintText.includes(item.type.replace(/_/g, ' '))) score += 4;
            if (hintText.includes(item.label.toLowerCase())) score += 5;
            if (/branding|logo|beam|fascia/.test(item.type) && /brand|logo|gold/.test(hintText)) score += 3;
            if (/screen/.test(item.type) && /screen|touch|presentation/.test(hintText)) score += 3;
            if (/plinth|display/.test(item.type) && /display|model/.test(hintText)) score += 3;
            return { ...item, score, kind: 'primitive' };
        })
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, 4);

    const assetSuggestions = getStandDesignAssetPalette()
        .map((item) => {
            let score = 0;
            if (objectAssetKeys.has(item.key)) score += 6;
            if (hintText.includes(item.type.replace(/_/g, ' '))) score += 4;
            if (hintText.includes(item.label.toLowerCase())) score += 5;
            if (/chair|table/.test(item.type) && /meeting|discussion/.test(hintText)) score += 3;
            if (/sofa/.test(item.type) && /vip|lounge/.test(hintText)) score += 3;
            if (/screen/.test(item.type) && /touch|screen/.test(hintText)) score += 3;
            return { ...item, score, kind: 'asset' };
        })
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, 6);

    return [...primitiveSuggestions, ...assetSuggestions].slice(0, 8);
}

function AutoBlueprintSummary({ selectedConcept, brief, scene }) {
    const analysis = selectedConcept?.reference_analysis || null;
    const zones = analysis?.zoned_elements || [];
    const structures = analysis?.major_structures || [];
    const materials = analysis?.materials_and_colors || [];
    const anchors = analysis?.anchor_objects || [];
    return (
        <div className="stand-design-3d-blueprint">
            <div className="stand-design-3d-blueprint-row">
                <strong>Layout</strong>
                <span>{analysis?.layout_summary || summarizeStandDesignBrief(brief) || 'Reference blueprint summary will appear after analysis.'}</span>
            </div>
            <div className="stand-design-3d-blueprint-row">
                <strong>Scene objects</strong>
                <span>{Array.isArray(scene?.objects) ? `${scene.objects.length} mapped objects` : 'No scene objects yet'}</span>
            </div>
            {zones.length > 0 ? (
                <div className="stand-design-3d-blueprint-block">
                    <strong>Detected zones</strong>
                    <div className="stand-design-3d-chip-row">
                        {zones.slice(0, 8).map((item, index) => <span key={`${item}-${index}`} className="stand-design-mini-pill">{item}</span>)}
                    </div>
                </div>
            ) : null}
            {structures.length > 0 ? (
                <div className="stand-design-3d-blueprint-block">
                    <strong>Major structures</strong>
                    <div className="stand-design-3d-chip-row">
                        {structures.slice(0, 8).map((item, index) => <span key={`${item}-${index}`} className="stand-design-mini-pill">{item}</span>)}
                    </div>
                </div>
            ) : null}
            {materials.length > 0 ? (
                <div className="stand-design-3d-blueprint-block">
                    <strong>Material cues</strong>
                    <div className="stand-design-3d-chip-row">
                        {materials.slice(0, 8).map((item, index) => <span key={`${item}-${index}`} className="stand-design-mini-pill">{item}</span>)}
                    </div>
                </div>
            ) : null}
            {anchors.length > 0 ? (
                <div className="stand-design-3d-blueprint-block">
                    <strong>Anchor objects</strong>
                    <div className="stand-design-3d-chip-row">
                        {anchors.slice(0, 8).map((item, index) => <span key={`${item}-${index}`} className="stand-design-mini-pill">{item}</span>)}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function buildBlueprintData(scene, brief, selectedConcept) {
    const footprint = scene?.footprint || { width: 0, depth: 0 };
    const objects = Array.isArray(scene?.objects) ? scene.objects.filter((item) => item.visible !== false) : [];
    const materialScheduleMap = new Map();
    objects.forEach((item) => {
        const material = item?.material || {};
        const key = material.preset_id || material.color || 'default';
        if (materialScheduleMap.has(key)) return;
        materialScheduleMap.set(key, {
            key,
            label: material.preset_id || material.color || 'Default',
            color: material.color || '#e9e2d2',
            opacity: Number.isFinite(Number(material.opacity)) ? Number(material.opacity) : 1,
        });
    });
    return {
        projectName: selectedConcept?.blueprint?.project_name || selectedConcept?.title || 'Stand Design',
        venue: selectedConcept?.blueprint?.venue || brief?.location || brief?.event_name || 'Venue not specified',
        scaleLabel: selectedConcept?.blueprint?.scale_label || '1:100',
        footprint,
        objects,
        materialSchedule: [...materialScheduleMap.values()],
    };
}

function BlueprintView({ scene, brief, selectedConcept }) {
    const blueprint = useMemo(() => buildBlueprintData(scene, brief, selectedConcept), [scene, brief, selectedConcept]);
    const width = 860;
    const height = 540;
    const padding = 48;
    const footprintWidth = Math.max(Number(blueprint.footprint?.width || 1), 1);
    const footprintDepth = Math.max(Number(blueprint.footprint?.depth || 1), 1);
    const scale = Math.min((width - (padding * 2)) / footprintWidth, (height - (padding * 2)) / footprintDepth);
    const toSvgRect = (sceneObject) => {
        const x = Number(sceneObject.position?.[0] || 0);
        const z = Number(sceneObject.position?.[2] || 0);
        const objectWidth = Number(sceneObject.dimensions?.width || 1);
        const objectDepth = Math.max(Number(sceneObject.dimensions?.depth || 1), sceneObject.type === 'plane' ? 0.12 : 0.2);
        return {
            x: ((x - (objectWidth / 2)) + (footprintWidth / 2)) * scale + padding,
            y: ((z - (objectDepth / 2)) + (footprintDepth / 2)) * scale + padding,
            width: objectWidth * scale,
            height: objectDepth * scale,
        };
    };

    return (
        <div className="stand-design-blueprint-shell">
            <svg className="stand-design-blueprint-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Stand blueprint view">
                <rect x="0" y="0" width={width} height={height} fill="#f8fafc" />
                <rect x={padding} y={padding} width={footprintWidth * scale} height={footprintDepth * scale} fill="#ffffff" stroke="#0f172a" strokeWidth="2.5" />
                {blueprint.objects.map((sceneObject) => {
                    const rect = toSvgRect(sceneObject);
                    return (
                        <g key={sceneObject.id}>
                            <rect
                                x={rect.x}
                                y={rect.y}
                                width={Math.max(rect.width, 4)}
                                height={Math.max(rect.height, 4)}
                                fill={sceneObject.material?.color || '#d6d3d1'}
                                fillOpacity={sceneObject.material?.opacity ?? 0.95}
                                stroke="#1f2937"
                                strokeWidth="1"
                            />
                            <text x={rect.x + 4} y={rect.y + 14} fontSize="10" fill="#0f172a">
                                {(sceneObject.label || sceneObject.type).slice(0, 18)}
                            </text>
                        </g>
                    );
                })}
                <text x={padding} y={22} fontSize="18" fontWeight="700" fill="#0f172a">{blueprint.projectName}</text>
                <text x={padding} y={42} fontSize="11" fill="#475569">Venue: {blueprint.venue} | Scale: {blueprint.scaleLabel}</text>
                <text x={padding} y={height - 18} fontSize="11" fill="#475569">Width: {footprintWidth}m</text>
                <text x={padding + (footprintWidth * scale) - 70} y={height - 18} fontSize="11" fill="#475569">Depth: {footprintDepth}m</text>
            </svg>
            <div className="stand-design-blueprint-meta">
                <div>
                    <strong>Project Legend</strong>
                    <p>{blueprint.projectName}</p>
                    <p>{blueprint.venue}</p>
                    <p>Scale {blueprint.scaleLabel}</p>
                </div>
                <div>
                    <strong>Material Schedule</strong>
                    <div className="stand-design-3d-chip-row">
                        {blueprint.materialSchedule.map((item) => (
                            <span key={item.key} className="stand-design-mini-pill">
                                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999, background: item.color, marginRight: 6, verticalAlign: 'middle' }} />
                                {item.label}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function normalizeSceneObjectForClient(object) {
    return {
        ...object,
        position: Array.isArray(object?.position) ? object.position : [0, 0, 0],
        rotation: Array.isArray(object?.rotation) ? object.rotation : [0, 0, 0],
        scale: Array.isArray(object?.scale) ? object.scale : [1, 1, 1],
        dimensions: object?.dimensions || { width: 1, height: 1, depth: 1 },
        material: object?.material || { color: '#e9e2d2', metalness: 0.08, roughness: 0.72, emissive: '' },
        visible: object?.visible !== false,
        group_id: object?.group_id || '',
        mirror_of: object?.mirror_of || '',
        params: object?.params || {},
    };
}

function normalizeSceneForClient(scene, brief) {
    try {
        const validated = validateStandDesignScene(scene || createEmptyStandScene(brief), brief);
        return {
            ...validated,
            objects: Array.isArray(validated.objects)
                ? validated.objects.map(normalizeSceneObjectForClient)
                : [],
        };
    } catch {
        return createEmptyStandScene(brief);
    }
}

function conceptIndexFromConcept(selectedConcept) {
    const match = String(selectedConcept?.id || '').match(/concept-(\d+)/i);
    if (!match) return 0;
    return Math.max(0, Number(match[1]) - 1);
}

function enrichSparseScene(scene, brief, selectedConcept) {
    const normalized = normalizeSceneForClient(scene, brief);
    if ((normalized.objects || []).length >= 16) return normalized;
    const heuristicScene = createHeuristicStandScene({
        brief,
        conceptIndex: conceptIndexFromConcept(selectedConcept),
    });
    const preferredTypes = ['raised_floor', 'branded_wall', 'fascia', 'logo_beam', 'portal_leg', 'arch_band', 'screen_cluster_wall', 'lounge_enclosure', 'plane'];
    const existingTypeCounts = normalized.objects.reduce((acc, item) => {
        acc[item.type] = (acc[item.type] || 0) + 1;
        return acc;
    }, {});
    const enhancementObjects = heuristicScene.objects
        .filter((item) => preferredTypes.includes(item.type))
        .filter((item) => (existingTypeCounts[item.type] || 0) < (item.type === 'portal_leg' ? 2 : 1))
        .slice(0, 8)
        .map((item) => ({
            ...item,
            id: `${item.id}-enhanced`,
            label: `${item.label} Detail`,
            locked: true,
        }));
    return {
        ...normalized,
        objects: [...normalized.objects, ...enhancementObjects],
    };
}

function hydrateSceneForEditor(scene, brief, selectedConcept) {
    const normalized = enrichSparseScene(scene, brief, selectedConcept);
    return applyReferenceThemeToScene(normalized, selectedConcept, brief);
}

function MessageBar({ message }) {
    if (!message?.text) return null;
    return (
        <div className={`stand-design-editor-message ${message.type ? `is-${message.type}` : ''}`}>
            {message.text}
        </div>
    );
}

function CameraSync({ cameraConfig, orbitRef, onCaptureReady }) {
    const { camera, gl } = useThree();

    useEffect(() => {
        camera.position.set(...cameraConfig.position);
        camera.lookAt(...cameraConfig.target);
        camera.updateProjectionMatrix();
        if (orbitRef.current) {
            orbitRef.current.target.set(...cameraConfig.target);
            orbitRef.current.update();
        }
    }, [camera, cameraConfig, orbitRef]);

    useEffect(() => {
        onCaptureReady(() => () => gl.domElement.toDataURL('image/png'));
    }, [gl, onCaptureReady]);

    return null;
}

function SelectedBounds({ object }) {
    if (!object) return null;
    return (
        <mesh position={[0, object.dimensions.height / 2, 0]}>
            <boxGeometry args={[object.dimensions.width * 1.04, object.dimensions.height * 1.04, object.dimensions.depth * 1.04]} />
            <meshBasicMaterial color="#12b8af" wireframe transparent opacity={0.45} />
        </mesh>
    );
}

function PrimitiveObject({ object, selected, showHelpers }) {
    const materialProps = {
        color: object.material?.color || '#e9e2d2',
        metalness: object.material?.metalness ?? 0.08,
        roughness: object.material?.roughness ?? 0.72,
        emissive: selected && object.material?.emissive ? object.material.emissive : (selected ? '#0e7490' : object.material?.emissive || '#000000'),
        transparent: (object.material?.opacity ?? 1) < 0.999,
        opacity: object.material?.opacity ?? 1,
        side: object.material?.double_sided ? DoubleSide : undefined,
    };
    const baseColor = materialProps.color;
    const accentColor = lightenHex(baseColor, 0.18);
    const trimColor = darkenHex(baseColor, 0.2);
    const glowColor = object.material?.emissive || lightenHex(baseColor, 0.35);

    const width = object.dimensions.width;
    const height = object.dimensions.height;
    const depth = object.dimensions.depth;
    const thickness = numberValue(object.params?.thickness, Math.min(width, depth, 0.24));
    const innerRadius = numberValue(object.params?.innerRadius, Math.max(0.2, (width / 2) - thickness));
    const roundedness = numberValue(object.params?.roundedness, 0.16);

    function renderPrimitiveMesh() {
        switch (object.type) {
        case 'floor':
        case 'raised_floor': {
            const plankCount = Math.max(6, Math.min(18, Math.round(width / 0.45)));
            return (
                <group>
                    <RoundedBox args={[width, height, depth]} radius={0.04} smoothness={4} position={[0, height / 2, 0]}>
                        <meshStandardMaterial {...materialProps} />
                    </RoundedBox>
                    {Array.from({ length: plankCount }).map((_, index) => {
                        const plankWidth = width / plankCount;
                        const x = (-width / 2) + (plankWidth / 2) + (index * plankWidth);
                        return (
                            <mesh key={`plank-${index}`} position={[x, height + 0.003, 0]}>
                                <boxGeometry args={[plankWidth * 0.92, 0.006, depth * 0.985]} />
                                <meshStandardMaterial color={index % 2 === 0 ? lightenHex(baseColor, 0.08) : darkenHex(baseColor, 0.04)} metalness={0.02} roughness={0.82} />
                            </mesh>
                        );
                    })}
                </group>
            );
        }
        case 'arch_band':
            return (
                <group position={[0, height / 2, 0]}>
                    <mesh rotation={[Math.PI / 2, 0, 0]}>
                        <torusGeometry args={[Math.max(0.2, innerRadius), Math.max(0.04, thickness / 2), 18, 48, Math.PI]} />
                        <meshStandardMaterial {...materialProps} />
                    </mesh>
                    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, depth * 0.12]}>
                        <torusGeometry args={[Math.max(0.18, innerRadius - (thickness * 0.28)), Math.max(0.025, thickness / 6), 16, 40, Math.PI]} />
                        <meshStandardMaterial color={accentColor} metalness={0.22} roughness={0.34} emissive={glowColor} emissiveIntensity={0.22} />
                    </mesh>
                    <mesh position={[-innerRadius, -height / 2.2, 0]}>
                        <boxGeometry args={[thickness, height, depth * 0.9]} />
                        <meshStandardMaterial {...materialProps} />
                    </mesh>
                    <mesh position={[innerRadius, -height / 2.2, 0]}>
                        <boxGeometry args={[thickness, height, depth * 0.9]} />
                        <meshStandardMaterial {...materialProps} />
                    </mesh>
                </group>
            );
        case 'counter':
            return (
                <group>
                    <RoundedBox args={[width, height, depth]} radius={Math.max(0.05, roundedness)} smoothness={5} position={[0, height / 2, 0]}>
                        <meshStandardMaterial {...materialProps} />
                    </RoundedBox>
                    <mesh position={[0, height - 0.04, 0]}>
                        <boxGeometry args={[width * 0.92, 0.05, depth * 0.92]} />
                        <meshStandardMaterial color={lightenHex(baseColor, 0.1)} metalness={0.12} roughness={0.58} />
                    </mesh>
                    <mesh position={[0, height * 0.38, (depth / 2) + 0.008]}>
                        <boxGeometry args={[width * 0.78, height * 0.12, 0.02]} />
                        <meshStandardMaterial color={accentColor} emissive={glowColor} emissiveIntensity={0.12} metalness={0.18} roughness={0.42} />
                    </mesh>
                </group>
            );
        case 'plinth':
            return (
                <group>
                    <RoundedBox args={[width, height, depth]} radius={0.05} smoothness={4} position={[0, height / 2, 0]}>
                        <meshStandardMaterial {...materialProps} />
                    </RoundedBox>
                    <mesh position={[0, height + 0.03, 0]}>
                        <boxGeometry args={[width * 0.88, 0.06, depth * 0.88]} />
                        <meshStandardMaterial color={lightenHex(baseColor, 0.14)} metalness={0.08} roughness={0.62} />
                    </mesh>
                    <mesh position={[0, 0.08, 0]}>
                        <boxGeometry args={[width * 0.92, 0.04, depth * 0.92]} />
                        <meshStandardMaterial color={accentColor} emissive={glowColor} emissiveIntensity={0.16} metalness={0.12} roughness={0.44} />
                    </mesh>
                </group>
            );
        case 'screen':
            return (
                <group>
                    <RoundedBox args={[width, height, depth]} radius={0.04} smoothness={4} position={[0, height / 2, 0]}>
                        <meshStandardMaterial color={trimColor} metalness={0.28} roughness={0.24} />
                    </RoundedBox>
                    <mesh position={[0, height / 2, (depth / 2) + 0.008]}>
                        <planeGeometry args={[width * 0.82, height * 0.84]} />
                        <meshStandardMaterial color={lightenHex(trimColor, 0.05)} emissive={object.material?.emissive || '#5b8ad6'} emissiveIntensity={0.42} metalness={0.06} roughness={0.18} />
                    </mesh>
                </group>
            );
        case 'screen_cluster_wall':
            return (
                <group>
                    <RoundedBox args={[width, height, depth]} radius={0.05} smoothness={4} position={[0, height / 2, 0]}>
                        <meshStandardMaterial {...materialProps} />
                    </RoundedBox>
                    {[-0.28, 0.28].map((offset, index) => (
                        <mesh key={`cluster-screen-${index}`} position={[width * offset, height * 0.56, (depth / 2) + 0.012]}>
                            <planeGeometry args={[width * 0.36, height * 0.38]} />
                            <meshStandardMaterial color="#1e293b" emissive="#4f8fd8" emissiveIntensity={0.38} metalness={0.06} roughness={0.16} />
                        </mesh>
                    ))}
                </group>
            );
        case 'wall':
        case 'partition':
            return (
                <group>
                    <RoundedBox args={[width, height, depth]} radius={0.03} smoothness={4} position={[0, height / 2, 0]}>
                        <meshStandardMaterial {...materialProps} />
                    </RoundedBox>
                    <mesh position={[0, height * 0.58, (depth / 2) + 0.01]}>
                        <boxGeometry args={[width * 0.74, height * 0.22, 0.018]} />
                        <meshStandardMaterial color={lightenHex(baseColor, 0.08)} metalness={0.08} roughness={0.58} />
                    </mesh>
                    <mesh position={[0, height * 0.24, (depth / 2) + 0.012]}>
                        <boxGeometry args={[width * 0.8, height * 0.022, 0.016]} />
                        <meshStandardMaterial color={accentColor} emissive={glowColor} emissiveIntensity={0.1} metalness={0.12} roughness={0.42} />
                    </mesh>
                </group>
            );
        case 'branded_wall':
            return (
                <group>
                    <RoundedBox args={[width, height, depth]} radius={0.06} smoothness={4} position={[0, height / 2, 0]}>
                        <meshStandardMaterial {...materialProps} />
                    </RoundedBox>
                    <mesh position={[0, height * 0.5, (depth / 2) + 0.004]}>
                        <boxGeometry args={[width * 0.78, height * 0.68, 0.012]} />
                        <meshStandardMaterial color={lightenHex(baseColor, 0.04)} metalness={0.04} roughness={0.82} />
                    </mesh>
                    <mesh position={[0, height * 0.62, (depth / 2) + 0.01]}>
                        <boxGeometry args={[width * 0.52, height * 0.22, 0.02]} />
                        <meshStandardMaterial color={accentColor} metalness={0.14} roughness={0.36} />
                    </mesh>
                    <mesh position={[0, height * 0.28, (depth / 2) + 0.01]}>
                        <boxGeometry args={[width * 0.62, height * 0.018, 0.016]} />
                        <meshStandardMaterial color={trimColor} emissive={glowColor} emissiveIntensity={0.1} />
                    </mesh>
                </group>
            );
        case 'plane':
            return (
                <group position={[0, height / 2, 0]}>
                    <mesh>
                        <planeGeometry args={[width, height]} />
                        <meshStandardMaterial {...materialProps} />
                    </mesh>
                    {depth > 0.035 ? (
                        <mesh position={[0, 0, depth / 2]}>
                            <boxGeometry args={[width, height, depth]} />
                            <meshStandardMaterial {...materialProps} />
                        </mesh>
                    ) : null}
                </group>
            );
        case 'fascia':
        case 'logo_beam':
            return (
                <group>
                    <RoundedBox args={[width, height, depth]} radius={0.04} smoothness={4} position={[0, height / 2, 0]}>
                        <meshStandardMaterial {...materialProps} />
                    </RoundedBox>
                    <mesh position={[0, height / 2, (depth / 2) + 0.008]}>
                        <boxGeometry args={[width * 0.74, height * 0.42, 0.02]} />
                        <meshStandardMaterial color={lightenHex(baseColor, 0.12)} emissive={glowColor} emissiveIntensity={0.1} metalness={0.12} roughness={0.34} />
                    </mesh>
                </group>
            );
        case 'portal_leg':
            return (
                <group>
                    <RoundedBox args={[width, height, depth]} radius={Math.max(0.04, roundedness)} smoothness={4} position={[0, height / 2, 0]}>
                        <meshStandardMaterial {...materialProps} />
                    </RoundedBox>
                    <mesh position={[0, height * 0.5, (depth / 2) + 0.01]}>
                        <boxGeometry args={[width * 0.36, height * 0.74, 0.018]} />
                        <meshStandardMaterial color={accentColor} emissive={glowColor} emissiveIntensity={0.09} metalness={0.12} roughness={0.42} />
                    </mesh>
                </group>
            );
        case 'storage_core':
        case 'av_cabinet':
            return (
                <group>
                    <RoundedBox args={[width, height, depth]} radius={Math.max(0.02, roundedness)} smoothness={4} position={[0, height / 2, 0]}>
                        <meshStandardMaterial {...materialProps} />
                    </RoundedBox>
                    <mesh position={[0, height * 0.74, (depth / 2) + 0.012]}>
                        <boxGeometry args={[width * 0.58, height * 0.12, 0.018]} />
                        <meshStandardMaterial color={lightenHex(baseColor, 0.08)} metalness={0.12} roughness={0.54} />
                    </mesh>
                    <mesh position={[0, height * 0.28, (depth / 2) + 0.012]}>
                        <boxGeometry args={[width * 0.68, height * 0.02, 0.018]} />
                        <meshStandardMaterial color={accentColor} emissive={glowColor} emissiveIntensity={0.08} metalness={0.12} roughness={0.42} />
                    </mesh>
                </group>
            );
        case 'raised_floor':
            return (
                <group>
                    <RoundedBox args={[width, height, depth]} radius={Math.max(0.02, roundedness)} smoothness={4} position={[0, height / 2, 0]}>
                        <meshStandardMaterial {...materialProps} />
                    </RoundedBox>
                    <mesh position={[0, height + 0.006, 0]}>
                        <boxGeometry args={[width * 0.96, 0.012, depth * 0.96]} />
                        <meshStandardMaterial color={lightenHex(baseColor, 0.06)} metalness={0.04} roughness={0.72} />
                    </mesh>
                    <mesh position={[0, height * 0.22, 0]}>
                        <boxGeometry args={[width * 0.98, 0.016, depth * 0.98]} />
                        <meshStandardMaterial color={accentColor} emissive={glowColor} emissiveIntensity={0.08} metalness={0.08} roughness={0.46} />
                    </mesh>
                </group>
            );
        case 'lounge_enclosure':
            return (
                <group>
                    <RoundedBox args={[width, height, depth * 0.12]} radius={Math.max(0.02, roundedness)} smoothness={4} position={[0, height / 2, -(depth * 0.44)]}>
                        <meshStandardMaterial {...materialProps} />
                    </RoundedBox>
                    <RoundedBox args={[width * 0.12, height, depth]} radius={Math.max(0.02, roundedness)} smoothness={4} position={[-(width * 0.44), height / 2, 0]}>
                        <meshStandardMaterial {...materialProps} />
                    </RoundedBox>
                    <RoundedBox args={[width * 0.12, height, depth]} radius={Math.max(0.02, roundedness)} smoothness={4} position={[width * 0.44, height / 2, 0]}>
                        <meshStandardMaterial {...materialProps} />
                    </RoundedBox>
                    <mesh position={[0, height * 0.28, -(depth * 0.44) + 0.012]}>
                        <boxGeometry args={[width * 0.6, height * 0.024, 0.018]} />
                        <meshStandardMaterial color={accentColor} emissive={glowColor} emissiveIntensity={0.08} metalness={0.12} roughness={0.42} />
                    </mesh>
                </group>
            );
        default:
            return (
                <mesh position={[0, height / 2, 0]}>
                    <boxGeometry args={[width, height, depth]} />
                    <meshStandardMaterial {...materialProps} />
                </mesh>
            );
        }
    }

    return (
        <group>
            {renderPrimitiveMesh()}
            {showHelpers && selected && <SelectedBounds object={object} />}
        </group>
    );
}

function AssetObject({ object, selected, showHelpers }) {
    const asset = getStandDesignAsset(object.asset_key);
    const materialProps = {
        color: object.material?.color || '#e9e2d2',
        metalness: object.material?.metalness ?? 0.08,
        roughness: object.material?.roughness ?? 0.72,
        emissive: selected && object.material?.emissive ? object.material.emissive : (selected ? '#0e7490' : object.material?.emissive || '#000000'),
        transparent: (object.material?.opacity ?? 1) < 0.999,
        opacity: object.material?.opacity ?? 1,
        side: object.material?.double_sided ? DoubleSide : undefined,
    };
    const baseColor = materialProps.color;
    const accentColor = lightenHex(baseColor, 0.14);
    const trimColor = darkenHex(baseColor, 0.18);
    const glowColor = object.material?.emissive || lightenHex(baseColor, 0.28);
    const width = object.dimensions.width;
    const height = object.dimensions.height;
    const depth = object.dimensions.depth;

    function renderAssetMesh() {
        switch (asset.type) {
        case 'reception-desk':
            return (
                <group>
                    <RoundedBox args={[width, height, depth]} radius={0.12} smoothness={5} position={[0, height / 2, 0]}>
                        <meshStandardMaterial {...materialProps} />
                    </RoundedBox>
                    <mesh position={[0, height * 0.44, (depth / 2) + 0.018]}>
                        <boxGeometry args={[width * 0.62, height * 0.26, 0.04]} />
                        <meshStandardMaterial color={accentColor} emissive={glowColor} emissiveIntensity={0.12} metalness={0.22} roughness={0.34} />
                    </mesh>
                    <mesh position={[0, height - 0.04, 0]}>
                        <boxGeometry args={[width * 0.92, 0.05, depth * 0.92]} />
                        <meshStandardMaterial color={lightenHex(baseColor, 0.08)} metalness={0.12} roughness={0.52} />
                    </mesh>
                </group>
            );
        case 'chair':
        case 'stool':
            return (
                <group>
                    <mesh position={[0, height * 0.52, 0]}>
                        <boxGeometry args={[width * 0.8, height * 0.12, depth * 0.8]} />
                        <meshStandardMaterial {...materialProps} />
                    </mesh>
                    {asset.type === 'chair' ? (
                        <mesh position={[0, height * 0.82, -(depth * 0.28)]}>
                            <boxGeometry args={[width * 0.75, height * 0.42, depth * 0.12]} />
                            <meshStandardMaterial color={accentColor} metalness={0.08} roughness={0.66} />
                        </mesh>
                    ) : null}
                    {[-1, 1].flatMap((xDir) => [-1, 1].map((zDir) => (
                        <mesh key={`${xDir}-${zDir}`} position={[xDir * (width * 0.24), height * 0.24, zDir * (depth * 0.24)]}>
                            <boxGeometry args={[0.06, height * 0.48, 0.06]} />
                            <meshStandardMaterial color={trimColor} metalness={0.22} roughness={0.34} />
                        </mesh>
                    )))}
                </group>
            );
        case 'sofa':
            return (
                <group>
                    <RoundedBox args={[width, height * 0.48, depth]} radius={0.12} smoothness={4} position={[0, height * 0.24, 0]}>
                        <meshStandardMaterial {...materialProps} />
                    </RoundedBox>
                    <RoundedBox args={[width, height * 0.52, depth * 0.24]} radius={0.08} smoothness={4} position={[0, height * 0.56, -(depth * 0.34)]}>
                        <meshStandardMaterial color={accentColor} metalness={0.06} roughness={0.76} />
                    </RoundedBox>
                    {[-1, 1].map((dir) => (
                        <RoundedBox key={dir} args={[width * 0.12, height * 0.36, depth * 0.92]} radius={0.06} smoothness={4} position={[dir * (width * 0.44), height * 0.34, 0]}>
                            <meshStandardMaterial color={accentColor} metalness={0.06} roughness={0.76} />
                        </RoundedBox>
                    ))}
                </group>
            );
        case 'meeting-table':
        case 'coffee-table':
            return (
                <group>
                    <mesh position={[0, height * 0.86, 0]}>
                        <cylinderGeometry args={[width * 0.46, width * 0.5, height * 0.1, 32]} />
                        <meshStandardMaterial {...materialProps} />
                    </mesh>
                    <mesh position={[0, height * 0.42, 0]}>
                        <cylinderGeometry args={[0.07, 0.09, height * 0.72, 18]} />
                        <meshStandardMaterial color={trimColor} metalness={0.26} roughness={0.3} />
                    </mesh>
                    <mesh position={[0, 0.03, 0]}>
                        <cylinderGeometry args={[width * 0.2, width * 0.24, 0.06, 20]} />
                        <meshStandardMaterial color={trimColor} metalness={0.18} roughness={0.38} />
                    </mesh>
                </group>
            );
        case 'screen-kiosk':
            return (
                <group>
                    <RoundedBox args={[width * 0.42, height, depth * 0.42]} radius={0.06} smoothness={4} position={[0, height / 2, 0]}>
                        <meshStandardMaterial color={trimColor} metalness={0.22} roughness={0.28} />
                    </RoundedBox>
                    <mesh position={[0, height * 0.56, (depth * 0.21) + 0.01]}>
                        <planeGeometry args={[width * 0.28, height * 0.56]} />
                        <meshStandardMaterial color={lightenHex(trimColor, 0.05)} emissive={glowColor} emissiveIntensity={0.42} metalness={0.08} roughness={0.16} />
                    </mesh>
                    <mesh position={[0, height * 0.94, 0]}>
                        <boxGeometry args={[width * 0.5, 0.05, depth * 0.18]} />
                        <meshStandardMaterial color={accentColor} metalness={0.2} roughness={0.34} />
                    </mesh>
                </group>
            );
        case 'display-plinth':
            return (
                <group>
                    <RoundedBox args={[width, height, depth]} radius={0.08} smoothness={4} position={[0, height / 2, 0]}>
                        <meshStandardMaterial {...materialProps} />
                    </RoundedBox>
                    <mesh position={[0, height + 0.02, 0]}>
                        <boxGeometry args={[width * 0.88, 0.04, depth * 0.88]} />
                        <meshStandardMaterial color={accentColor} emissive={glowColor} emissiveIntensity={0.12} metalness={0.12} roughness={0.42} />
                    </mesh>
                </group>
            );
        case 'planter':
            return (
                <group>
                    <mesh position={[0, height * 0.18, 0]}>
                        <cylinderGeometry args={[width * 0.28, width * 0.34, height * 0.36, 18]} />
                        <meshStandardMaterial color={trimColor} metalness={0.12} roughness={0.62} />
                    </mesh>
                    <mesh position={[0, height * 0.72, 0]}>
                        <sphereGeometry args={[width * 0.34, 18, 18]} />
                        <meshStandardMaterial color="#6f8660" metalness={0.02} roughness={0.9} />
                    </mesh>
                </group>
            );
        default:
            return (
                <RoundedBox args={[width, height, depth]} radius={0.08} smoothness={4} position={[0, height / 2, 0]}>
                    <meshStandardMaterial {...materialProps} />
                </RoundedBox>
            );
        }
    }

    return (
        <group>
            {renderAssetMesh()}
            {showHelpers && selected && <SelectedBounds object={object} />}
        </group>
    );
}

function SceneObjectInstance({
    sceneObject,
    selected,
    showHelpers,
    showLabels,
    onSelect,
    transformMode,
    orbitRef,
    onTransformCommit,
}) {
    const groupRef = useRef(null);

    function commitTransform() {
        const node = groupRef.current;
        if (!node) return;
        onTransformCommit(sceneObject.id, {
            position: [node.position.x, node.position.y, node.position.z],
            rotation: [node.rotation.x, node.rotation.y, node.rotation.z],
            scale: [node.scale.x, node.scale.y, node.scale.z],
        });
    }

    const baseGroup = (
        <group
            ref={groupRef}
            visible={sceneObject.visible !== false}
            position={sceneObject.position}
            rotation={sceneObject.rotation}
            scale={sceneObject.scale}
            onPointerDown={(event) => {
                event.stopPropagation();
                onSelect(sceneObject.id);
            }}
        >
            {sceneObject.kind === 'asset'
                ? (
                    <Suspense fallback={null}>
                        <AssetObject object={sceneObject} selected={selected} showHelpers={showHelpers} />
                    </Suspense>
                )
                : <PrimitiveObject object={sceneObject} selected={selected} showHelpers={showHelpers} />}
            {(showLabels || (showHelpers && selected)) ? (
                <Html position={[0, sceneObject.dimensions.height + 0.12, 0]} center distanceFactor={12}>
                    <div className={`stand-design-editor-label ${selected ? 'is-selected' : ''}`}>
                        {sceneObject.label}
                    </div>
                </Html>
            ) : null}
        </group>
    );

    if (!selected || sceneObject.locked) {
        return baseGroup;
    }

    return (
        <TransformControls
            mode={transformMode}
            onMouseDown={() => {
                if (orbitRef.current) orbitRef.current.enabled = false;
            }}
            onMouseUp={() => {
                if (orbitRef.current) orbitRef.current.enabled = true;
                commitTransform();
            }}
            onObjectChange={commitTransform}
        >
            {baseGroup}
        </TransformControls>
    );
}

function SceneViewport({
    scene,
    selectedObjectId,
    transformMode,
    showHelpers,
    showLabels,
    showGrid,
    onSelectObject,
    onTransformCommit,
    onCaptureReady,
}) {
    const orbitRef = useRef(null);
    const selectedObject = Array.isArray(scene?.objects)
        ? scene.objects.find((item) => item.id === selectedObjectId) || null
        : null;

    return (
        <div className="stand-design-editor-canvas-shell">
            <Canvas
                shadows
                camera={{ position: scene.camera.position, fov: 46 }}
                gl={{ antialias: true, preserveDrawingBuffer: true }}
            >
                <color attach="background" args={['#f5f3ee']} />
                <fog attach="fog" args={['#f5f3ee', 18, 44]} />
                <ambientLight intensity={1.05} />
                <directionalLight position={[8, 12, 6]} intensity={2.15} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
                <directionalLight position={[-6, 8, -4]} intensity={0.9} />
                <Environment preset="city" />
                {showGrid ? (
                    <Grid args={[40, 40]} cellSize={0.5} sectionSize={2} cellColor="#bfd4db" sectionColor="#94aab8" fadeDistance={45} fadeStrength={1} infiniteGrid />
                ) : null}
                <ContactShadows
                    position={[0, 0.01, 0]}
                    opacity={0.34}
                    scale={Math.max(scene.footprint?.width || 10, scene.footprint?.depth || 10) * 1.6}
                    blur={2.6}
                    far={20}
                    resolution={1024}
                    color="#8f8a7a"
                />
                <CameraSync cameraConfig={scene.camera} orbitRef={orbitRef} onCaptureReady={onCaptureReady} />
                {scene.objects.map((sceneObject) => (
                    <SceneObjectInstance
                        key={sceneObject.id}
                        sceneObject={sceneObject}
                        selected={sceneObject.id === selectedObjectId}
                        showHelpers={showHelpers}
                        showLabels={showLabels}
                        onSelect={onSelectObject}
                        transformMode={transformMode}
                        orbitRef={orbitRef}
                        onTransformCommit={onTransformCommit}
                    />
                ))}
                <OrbitControls ref={orbitRef} makeDefault target={scene.camera.target} />
            </Canvas>
            {!selectedObject ? (
                <div className="stand-design-editor-canvas-hint">
                    Click an object to edit it.
                </div>
            ) : null}
        </div>
    );
}

function PropertyNumberRow({ label, values, onChange, step = 0.1 }) {
    return (
        <div className="stand-design-editor-vector-row">
            <span>{label}</span>
            {['X', 'Y', 'Z'].map((axis, index) => (
                <label key={axis}>
                    <span>{axis}</span>
                    <input
                        type="number"
                        step={step}
                        value={values[index]}
                        onChange={(event) => onChange(index, numberValue(event.target.value, values[index]))}
                    />
                </label>
            ))}
        </div>
    );
}

getStandDesignAssetPalette().forEach((item) => {
    useGLTF.preload(item.path);
});

export default function StandDesign3DEditor({ recordId, initialConceptIndex = 0 }) {
    const [record, setRecord] = useState(null);
    const [scene, setScene] = useState(createEmptyStandScene(createDefaultStandDesignBrief()));
    const [conceptIndex, setConceptIndex] = useState(Number(initialConceptIndex) === 1 ? 1 : 0);
    const [selectedObjectId, setSelectedObjectId] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [transformMode, setTransformMode] = useState('translate');
    const [message, setMessage] = useState(createMessage());
    const [captureScene, setCaptureScene] = useState(() => () => '');
    const [referenceMode, setReferenceMode] = useState(true);
    const [referenceOverlayOpacity, setReferenceOverlayOpacity] = useState(0.45);
    const [referenceZoom, setReferenceZoom] = useState(1);
    const [showHelpers, setShowHelpers] = useState(false);
    const [showLabels, setShowLabels] = useState(false);
    const [showGrid, setShowGrid] = useState(false);
    const [viewMode, setViewMode] = useState('3d');

    const selectedConcept = record?.concepts?.[conceptIndex] || null;
    const selectedObject = useMemo(
        () => scene?.objects?.find((item) => item.id === selectedObjectId) || null,
        [scene, selectedObjectId],
    );
    const matchPreview = useMemo(
        () => (Array.isArray(selectedConcept?.scene_renders)
            ? selectedConcept.scene_renders.find((item) => /match preview/i.test(item.label || '')) || selectedConcept.scene_renders[0] || null
            : null),
        [selectedConcept],
    );
    const sceneTreeGroups = useMemo(() => buildSceneTreeGroups(scene?.objects || []), [scene]);
    const suggestedPalette = useMemo(
        () => buildSuggestedPalette(selectedConcept, record?.brief || createDefaultStandDesignBrief(), scene?.objects || []),
        [selectedConcept, record?.brief, scene],
    );
    const materialPalette = useMemo(() => getStandDesignMaterialPalette(), []);

    function flash(type, text) {
        setMessage(createMessage(type, text));
    }

    async function generateScene(index = conceptIndex) {
        setBusy(true);
        flash('', 'Generating a 3D scene from the selected concept...');
        try {
            const response = await fetch(`/api/stand-design/${recordId}/scene/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ concept_index: index }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to generate 3D scene');
            setRecord(data.item);
            const generatedConcept = data.item?.concepts?.[index] || null;
            const nextScene = hydrateSceneForEditor(data.scene, data.item?.brief, generatedConcept);
            const preferredCamera = data.item?.concepts?.[index]?.scene_match_camera || nextScene.match_camera;
            if (preferredCamera?.position && preferredCamera?.target) {
                nextScene.camera = {
                    preset: 'match',
                    position: preferredCamera.position,
                    target: preferredCamera.target,
                };
            }
            setScene(nextScene);
            setSelectedObjectId('');
            flash('success', data.generated_by === 'gemini' ? '3D scene generated from Gemini blueprint.' : '3D scene generated from the internal layout fallback.');
        } catch (error) {
            flash('error', error.message || 'Failed to generate 3D scene');
        } finally {
            setBusy(false);
        }
    }

    async function loadScene(index, autoGenerate = true) {
        setLoading(true);
        try {
            const response = await fetch(`/api/stand-design/${recordId}/scene?concept=${index}`, { cache: 'no-store' });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to load 3D scene');
            setRecord(data.item);
            const loadedConcept = data.item?.concepts?.[index] || null;
            const nextScene = hydrateSceneForEditor(data.scene, data.item?.brief, loadedConcept);
            const preferredCamera = data.item?.concepts?.[index]?.scene_match_camera || nextScene.match_camera;
            if (preferredCamera?.position && preferredCamera?.target) {
                nextScene.camera = {
                    preset: 'match',
                    position: preferredCamera.position,
                    target: preferredCamera.target,
                };
            }
            setScene(nextScene);
            setSelectedObjectId('');
            if (!data.scene && autoGenerate) {
                await generateScene(index);
            }
        } catch (error) {
            flash('error', error.message || 'Failed to load 3D scene');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadScene(conceptIndex);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recordId, conceptIndex]);

    async function saveScene() {
        setBusy(true);
        flash('', 'Saving 3D scene...');
        try {
            const response = await fetch(`/api/stand-design/${recordId}/scene`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    concept_index: conceptIndex,
                    scene,
                    scene_generated_by: selectedConcept?.scene_generated_by || 'manual',
                    reference_analysis: selectedConcept?.reference_analysis || null,
                    scene_match_camera: selectedConcept?.scene_match_camera || scene.match_camera || null,
                    scene_match_score: selectedConcept?.scene_match_score ?? null,
                    scene_match_notes: selectedConcept?.scene_match_notes || [],
                    scene_reference_views_used: selectedConcept?.scene_reference_views_used || [],
                    scene_reconstruction_status: selectedConcept?.scene_reconstruction_status || 'needs-manual-correction',
                    architectural_reasoning: selectedConcept?.architectural_reasoning || '',
                    blueprint: selectedConcept?.blueprint || null,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to save 3D scene');
            setRecord(data.item);
            setScene(hydrateSceneForEditor(data.scene, data.item?.brief, data.item?.concepts?.[conceptIndex] || null));
            flash('success', '3D scene saved.');
        } catch (error) {
            flash('error', error.message || 'Failed to save 3D scene');
        } finally {
            setBusy(false);
        }
    }

    async function renderSceneSnapshot() {
        const dataUrl = captureScene?.();
        if (!dataUrl) {
            flash('error', 'Scene snapshot is not available yet.');
            return;
        }

        setBusy(true);
        flash('', 'Saving a rendered snapshot from the 3D editor...');
        try {
            const response = await fetch(`/api/stand-design/${recordId}/scene/render`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    concept_index: conceptIndex,
                    image_data_url: dataUrl,
                    label: `Scene Snapshot ${new Date().toLocaleTimeString()}`,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to save scene snapshot');
            setRecord(data.item);
            flash('success', 'Scene snapshot saved to the stand design record.');
        } catch (error) {
            flash('error', error.message || 'Failed to save scene snapshot');
        } finally {
            setBusy(false);
        }
    }

    async function saveBlueprintSnapshot() {
        const blueprintNode = document.querySelector('.stand-design-blueprint-svg');
        if (!blueprintNode) {
            flash('error', 'Blueprint view is not available yet.');
            return;
        }
        try {
            const svgMarkup = new XMLSerializer().serializeToString(blueprintNode);
            const encoded = window.btoa(unescape(encodeURIComponent(svgMarkup)));
            const dataUrl = `data:image/svg+xml;base64,${encoded}`;
            setBusy(true);
            flash('', 'Saving blueprint snapshot...');
            const response = await fetch(`/api/stand-design/${recordId}/scene/render`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    concept_index: conceptIndex,
                    image_data_url: dataUrl,
                    label: `Blueprint Snapshot ${new Date().toLocaleTimeString()}`,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to save blueprint snapshot');
            setRecord(data.item);
            flash('success', 'Blueprint snapshot saved to the stand design record.');
        } catch (error) {
            flash('error', error.message || 'Failed to save blueprint snapshot');
        } finally {
            setBusy(false);
        }
    }

    async function analyzeReference() {
        setBusy(true);
        flash('', 'Analyzing the selected reference concept...');
        try {
            const response = await fetch(`/api/stand-design/${recordId}/scene/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ concept_index: conceptIndex }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to analyze reference concept');
            setRecord(data.item);
            flash('success', 'Reference analysis updated for exact-match reconstruction.');
        } catch (error) {
            flash('error', error.message || 'Failed to analyze reference concept');
        } finally {
            setBusy(false);
        }
    }

    function applyMatchCamera() {
        const matchCamera = selectedConcept?.scene_match_camera || scene.match_camera;
        if (!matchCamera?.position || !matchCamera?.target) {
            flash('error', 'No match camera is available yet. Analyze or regenerate the scene first.');
            return;
        }
        setScene((current) => ({
            ...current,
            camera: {
                preset: 'match',
                position: matchCamera.position,
                target: matchCamera.target,
            },
            match_camera: {
                preset: 'match',
                position: matchCamera.position,
                target: matchCamera.target,
            },
        }));
        flash('success', 'Match camera applied to the 3D viewport.');
    }

    async function renderMatchPreview() {
        if (selectedConcept?.scene_match_camera?.position) {
            applyMatchCamera();
            await new Promise((resolve) => setTimeout(resolve, 220));
        }
        const dataUrl = captureScene?.();
        if (!dataUrl) {
            flash('error', 'Match preview is not available yet.');
            return;
        }

        setBusy(true);
        flash('', 'Saving a match preview from the aligned camera...');
        try {
            const response = await fetch(`/api/stand-design/${recordId}/scene/render-match`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    concept_index: conceptIndex,
                    image_data_url: dataUrl,
                    label: `Match Preview ${new Date().toLocaleTimeString()}`,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to save match preview');
            setRecord(data.item);
            flash('success', 'Match preview saved for comparison.');
        } catch (error) {
            flash('error', error.message || 'Failed to save match preview');
        } finally {
            setBusy(false);
        }
    }

    function applyAutoTheme() {
        setScene((current) => hydrateSceneForEditor(current, brief, selectedConcept));
        flash('success', 'Reference-based material theme applied to the current 3D scene.');
    }

    function setObjectPatch(objectId, patch) {
        setScene((current) => ({
            ...current,
            objects: current.objects.map((item) => (item.id === objectId ? { ...item, ...patch } : item)),
        }));
    }

    function setObjectVector(objectId, field, nextValues) {
        setObjectPatch(objectId, { [field]: nextValues });
    }

    function setObjectDimensions(objectId, key, value) {
        setScene((current) => ({
            ...current,
            objects: current.objects.map((item) => (
                item.id === objectId
                    ? { ...item, dimensions: { ...item.dimensions, [key]: numberValue(value, item.dimensions[key]) } }
                    : item
            )),
        }));
    }

    function setObjectMaterial(objectId, key, value) {
        setScene((current) => ({
            ...current,
            objects: current.objects.map((item) => (
                item.id === objectId
                    ? { ...item, material: { ...item.material, [key]: value } }
                    : item
            )),
        }));
    }

    function applyMaterialPreset(objectId, presetId) {
        const preset = materialPalette.find((item) => item.id === presetId);
        if (!preset) return;
        setScene((current) => ({
            ...current,
            objects: current.objects.map((item) => (
                item.id === objectId
                    ? {
                        ...item,
                        material: {
                            ...item.material,
                            preset_id: preset.id,
                            color: preset.color,
                            metalness: preset.metalness,
                            roughness: preset.roughness,
                            emissive: preset.emissive,
                            opacity: preset.opacity,
                            double_sided: preset.doubleSided,
                        },
                    }
                    : item
            )),
        }));
    }

    function addPrimitive(type) {
        try {
            const object = createSceneObjectFromPalette({ primitiveType: type });
            object.position = [0, object.dimensions.height / 2, 0];
            setScene((current) => ({ ...current, objects: [...current.objects, object] }));
            setSelectedObjectId(object.id);
        } catch (error) {
            flash('error', error.message || 'Failed to add primitive');
        }
    }

    function addAsset(assetKey) {
        try {
            const object = createSceneObjectFromPalette({ assetKey });
            object.position = [0, 0, 0];
            setScene((current) => ({ ...current, objects: [...current.objects, object] }));
            setSelectedObjectId(object.id);
        } catch (error) {
            flash('error', error.message || 'Failed to add asset');
        }
    }

    function deleteSelectedObject() {
        if (!selectedObject) return;
        setScene((current) => ({
            ...current,
            objects: current.objects.filter((item) => item.id !== selectedObject.id),
        }));
        setSelectedObjectId('');
    }

    function duplicateSelectedObject() {
        if (!selectedObject) return;
        const duplicate = {
            ...selectedObject,
            id: `${selectedObject.id}-copy-${Math.random().toString(36).slice(2, 6)}`,
            label: `${selectedObject.label} Copy`,
            position: [
                selectedObject.position[0] + 0.65,
                selectedObject.position[1],
                selectedObject.position[2] + 0.65,
            ],
        };
        setScene((current) => ({ ...current, objects: [...current.objects, duplicate] }));
        setSelectedObjectId(duplicate.id);
    }

    function duplicateMirroredSelectedObject() {
        if (!selectedObject) return;
        const duplicate = {
            ...selectedObject,
            id: `${selectedObject.id}-mirror-${Math.random().toString(36).slice(2, 6)}`,
            label: `${selectedObject.label} Mirror`,
            position: [-selectedObject.position[0], selectedObject.position[1], selectedObject.position[2]],
            rotation: [selectedObject.rotation[0], -selectedObject.rotation[1], selectedObject.rotation[2]],
            mirror_of: selectedObject.id,
        };
        setScene((current) => ({ ...current, objects: [...current.objects, duplicate] }));
        setSelectedObjectId(duplicate.id);
    }

    function snapSelectedObjectToFloor() {
        if (!selectedObject) return;
        setObjectPatch(selectedObject.id, {
            position: [selectedObject.position[0], Math.max(0, selectedObject.dimensions.height / 2), selectedObject.position[2]],
        });
    }

    function snapSelectedObjectToEdge(edge) {
        if (!selectedObject) return;
        const footprint = scene.footprint || { width: 6, depth: 6 };
        const next = [...selectedObject.position];
        if (edge === 'left') next[0] = -(footprint.width / 2) + (selectedObject.dimensions.width / 2);
        if (edge === 'right') next[0] = (footprint.width / 2) - (selectedObject.dimensions.width / 2);
        if (edge === 'front') next[2] = (footprint.depth / 2) - (selectedObject.dimensions.depth / 2);
        if (edge === 'back') next[2] = -(footprint.depth / 2) + (selectedObject.dimensions.depth / 2);
        setObjectPatch(selectedObject.id, { position: next });
    }

    function setCameraPreset(preset) {
        setScene((current) => {
            const footprint = current.footprint || { width: 6, depth: 6 };
            const nextCamera = {
                perspective: {
                    preset: 'perspective',
                    position: [footprint.width * 0.9, footprint.width * 0.7, footprint.depth * 0.9],
                    target: [0, 1.2, 0],
                },
                front: {
                    preset: 'front',
                    position: [0, 2.2, footprint.depth * 1.2],
                    target: [0, 1.3, 0],
                },
                top: {
                    preset: 'top',
                    position: [0, Math.max(10, footprint.width + footprint.depth), 0.1],
                    target: [0, 0, 0],
                },
            }[preset] || current.camera;
            return { ...current, camera: nextCamera };
        });
    }

    if (loading && !record) {
        return (
            <div className="stand-design-3d-page">
                <div className="stand-design-3d-shell">
                    <div className="stand-design-editor-empty">Loading 3D editor...</div>
                </div>
            </div>
        );
    }

    const brief = record?.brief || createDefaultStandDesignBrief();
    const sceneRenders = Array.isArray(selectedConcept?.scene_renders) ? selectedConcept.scene_renders : [];

    return (
        <div className="stand-design-3d-page">
            <div className="stand-design-3d-shell">
                <div className="stand-design-3d-topbar">
                    <div>
                        <div className="quotation-dashboard-kicker">Stand Design 3D</div>
                        <h1>{selectedConcept?.title || `Concept ${conceptIndex + 1}`} 3D Editor</h1>
                        <p>{summarizeStandDesignBrief(brief) || 'Interactive scene editor for your selected stand concept.'}</p>
                    </div>
                        <div className="stand-design-3d-actions">
                        <Link className="stand-design-inline-link" href="/admin/stand-design">Back to Stand Design</Link>
                        <button type="button" className="stand-design-inline-link" disabled={busy} onClick={analyzeReference}>
                            {busy ? 'Working...' : 'Analyze Reference'}
                        </button>
                        <button type="button" className="stand-design-inline-link" disabled={busy} onClick={() => generateScene()}>
                            {busy ? 'Working...' : 'Regenerate Scene'}
                        </button>
                        <button type="button" className="stand-design-inline-link" disabled={busy} onClick={applyMatchCamera}>Match Camera</button>
                        <button type="button" className="stand-design-inline-link" disabled={busy} onClick={applyAutoTheme}>Auto Theme</button>
                        <button type="button" className="stand-design-inline-link" disabled={busy} onClick={saveScene}>Save Scene</button>
                        <button type="button" className="stand-design-inline-link" disabled={busy} onClick={renderSceneSnapshot}>Render Snapshot</button>
                        <button type="button" className="stand-design-inline-link" disabled={busy} onClick={renderMatchPreview}>Render Match Preview</button>
                        <button type="button" className="stand-design-inline-link" disabled={busy} onClick={saveBlueprintSnapshot}>Save Blueprint</button>
                    </div>
                </div>

                <MessageBar message={message} />

                <div className="stand-design-3d-concept-switcher">
                    {[0, 1].map((index) => (
                        <button
                            key={index}
                            type="button"
                            className={`stand-design-chip ${conceptIndex === index ? 'is-active' : ''}`}
                            onClick={() => setConceptIndex(index)}
                        >
                            {record?.concepts?.[index]?.title || `Concept ${index + 1}`}
                        </button>
                    ))}
                    <div className="stand-design-3d-camera-switcher">
                        {['3d', 'blueprint'].map((mode) => (
                            <button
                                key={mode}
                                type="button"
                                className={`stand-design-inline-link ${viewMode === mode ? 'is-active' : ''}`}
                                onClick={() => setViewMode(mode)}
                            >
                                {mode === '3d' ? '3D View' : 'Blueprint View'}
                            </button>
                        ))}
                        {['match', 'perspective', 'front', 'top'].map((preset) => (
                            <button
                                key={preset}
                                type="button"
                                className={`stand-design-inline-link ${scene.camera?.preset === preset ? 'is-active' : ''}`}
                                onClick={() => (preset === 'match' ? applyMatchCamera() : setCameraPreset(preset))}
                            >
                                {preset}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="stand-design-3d-grid">
                    <aside className="stand-design-3d-sidebar">
                        <section className="stand-design-3d-card">
                            <h3>Scene Tree</h3>
                            <div className="stand-design-3d-tree">
                                {sceneTreeGroups.map((group) => (
                                    <div key={group.key} className="stand-design-3d-tree-group">
                                        <div className="stand-design-3d-tree-group-title">
                                            <strong>{group.zone}</strong>
                                            <span>{group.family} · {group.items.length}</span>
                                        </div>
                                        {group.items.map((sceneObject) => (
                                            <button
                                                key={sceneObject.id}
                                                type="button"
                                                className={`stand-design-3d-tree-item ${selectedObjectId === sceneObject.id ? 'is-active' : ''}`}
                                                onClick={() => setSelectedObjectId(sceneObject.id)}
                                            >
                                                <span>{sceneObject.kind === 'asset' ? assetDisplayName(sceneObject) : primitiveDisplayName(sceneObject)}</span>
                                                <small>{sceneObject.locked ? 'Locked' : getObjectFamily(sceneObject)}</small>
                                            </button>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="stand-design-3d-card">
                            <h3>Asset Palette</h3>
                            <div className="stand-design-3d-palette">
                                {suggestedPalette.length > 0 ? (
                                    <div>
                                        <strong>Suggested from Picture</strong>
                                        <div className="stand-design-3d-palette-grid">
                                            {suggestedPalette.map((item) => (
                                                <button
                                                    key={`${item.kind}-${item.kind === 'asset' ? item.key : item.type}`}
                                                    type="button"
                                                    className="stand-design-3d-palette-item is-suggested"
                                                    onClick={() => (item.kind === 'asset' ? addAsset(item.key) : addPrimitive(item.type))}
                                                >
                                                    <span>{item.label}</span>
                                                    <small>{item.kind === 'asset' ? item.category : `${item.category} · suggested`}</small>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                                <div>
                                    <strong>Primitives</strong>
                                    <div className="stand-design-3d-palette-grid">
                                        {getStandDesignPrimitivePalette().map((item) => (
                                            <button key={item.key} type="button" className="stand-design-3d-palette-item" onClick={() => addPrimitive(item.type)}>
                                                <span>{item.label}</span>
                                                <small>{item.category}</small>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <strong>Kit Assets</strong>
                                    <div className="stand-design-3d-palette-grid">
                                        {getStandDesignAssetPalette().map((item) => (
                                            <button key={item.key} type="button" className="stand-design-3d-palette-item" onClick={() => addAsset(item.key)}>
                                                <span>{item.label}</span>
                                                <small>{item.category}</small>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <strong>Material Library</strong>
                                    <div className="stand-design-3d-palette-grid">
                                        {materialPalette.map((item) => (
                                            <div key={item.id} className="stand-design-3d-palette-item">
                                                <span>{item.label}</span>
                                                <small>{item.id}</small>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="stand-design-3d-card">
                            <h3>Reconstruction QA</h3>
                            <div className="stand-design-3d-qa">
                                <div className="stand-design-3d-qa-row">
                                    <strong>Status</strong>
                                    <span className={`stand-design-chip is-${selectedConcept?.scene_reconstruction_status || 'idle'}`}>
                                        {selectedConcept?.scene_reconstruction_status || 'idle'}
                                    </span>
                                </div>
                                <div className="stand-design-3d-qa-row">
                                    <strong>Match Score</strong>
                                    <span>{selectedConcept?.scene_match_score ?? '--'} / 99</span>
                                </div>
                                {Array.isArray(selectedConcept?.scene_reference_views_used) && selectedConcept.scene_reference_views_used.length > 0 ? (
                                    <div className="stand-design-3d-qa-row">
                                        <strong>Views used</strong>
                                        <span>{selectedConcept.scene_reference_views_used.join(', ')}</span>
                                    </div>
                                ) : null}
                                {Array.isArray(selectedConcept?.scene_match_notes) && selectedConcept.scene_match_notes.length > 0 ? (
                                    <ul className="stand-design-3d-note-list">
                                        {selectedConcept.scene_match_notes.map((note, index) => <li key={`${note}-${index}`}>{note}</li>)}
                                    </ul>
                                ) : (
                                    <div className="stand-design-editor-empty">Match notes will appear after scene generation.</div>
                                )}
                            </div>
                        </section>

                        <section className="stand-design-3d-card">
                            <h3>Architectural Reasoning</h3>
                            {selectedConcept?.architectural_reasoning ? (
                                <div className="stand-design-3d-blueprint">
                                    <p>{selectedConcept.architectural_reasoning}</p>
                                </div>
                            ) : (
                                <div className="stand-design-editor-empty">Architectural reasoning will appear after analysis or scene generation.</div>
                            )}
                        </section>

                        <section className="stand-design-3d-card">
                            <h3>Property Inspector</h3>
                            {selectedObject ? (
                                <div className="stand-design-3d-inspector">
                                    <label className="stand-design-field">
                                        <span>Label</span>
                                        <input value={selectedObject.label} onChange={(event) => setObjectPatch(selectedObject.id, { label: event.target.value })} />
                                    </label>
                                    <div className="stand-design-3d-transform-modes">
                                        {['translate', 'rotate', 'scale'].map((mode) => (
                                            <button
                                                key={mode}
                                                type="button"
                                                className={`stand-design-inline-link ${transformMode === mode ? 'is-active' : ''}`}
                                                onClick={() => setTransformMode(mode)}
                                            >
                                                {mode}
                                            </button>
                                        ))}
                                    </div>
                                    <PropertyNumberRow
                                        label="Position"
                                        values={selectedObject.position}
                                        onChange={(axis, value) => {
                                            const next = [...selectedObject.position];
                                            next[axis] = value;
                                            setObjectVector(selectedObject.id, 'position', next);
                                        }}
                                    />
                                    <PropertyNumberRow
                                        label="Rotation"
                                        values={selectedObject.rotation}
                                        onChange={(axis, value) => {
                                            const next = [...selectedObject.rotation];
                                            next[axis] = value;
                                            setObjectVector(selectedObject.id, 'rotation', next);
                                        }}
                                        step={0.05}
                                    />
                                    <PropertyNumberRow
                                        label="Scale"
                                        values={selectedObject.scale}
                                        onChange={(axis, value) => {
                                            const next = [...selectedObject.scale];
                                            next[axis] = value;
                                            setObjectVector(selectedObject.id, 'scale', next);
                                        }}
                                        step={0.05}
                                    />
                                    <div className="stand-design-editor-dimensions">
                                        {['width', 'height', 'depth'].map((key) => (
                                            <label key={key}>
                                                <span>{key}</span>
                                                <input
                                                    type="number"
                                                    step="0.05"
                                                    value={selectedObject.dimensions[key]}
                                                    onChange={(event) => setObjectDimensions(selectedObject.id, key, event.target.value)}
                                                />
                                            </label>
                                        ))}
                                    </div>
                                    <label className="stand-design-field">
                                        <span>Color</span>
                                        <input type="color" value={selectedObject.material.color} onChange={(event) => setObjectMaterial(selectedObject.id, 'color', event.target.value)} />
                                    </label>
                                    <label className="stand-design-field">
                                        <span>Material Preset</span>
                                        <select
                                            value={selectedObject.material?.preset_id || ''}
                                            onChange={(event) => applyMaterialPreset(selectedObject.id, event.target.value)}
                                        >
                                            <option value="">Custom</option>
                                            {materialPalette.map((item) => (
                                                <option key={item.id} value={item.id}>{item.label}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <div className="stand-design-editor-dimensions">
                                        {[
                                            ['metalness', 0, 1, 0.05],
                                            ['roughness', 0, 1, 0.05],
                                            ['opacity', 0.05, 1, 0.05],
                                        ].map(([key, min, max, step]) => (
                                            <label key={key}>
                                                <span>{key}</span>
                                                <input
                                                    type="number"
                                                    min={min}
                                                    max={max}
                                                    step={step}
                                                    value={selectedObject.material?.[key] ?? (key === 'opacity' ? 1 : 0)}
                                                    onChange={(event) => setObjectMaterial(selectedObject.id, key, numberValue(event.target.value, selectedObject.material?.[key] ?? 0))}
                                                />
                                            </label>
                                        ))}
                                    </div>
                                    <label className="stand-design-field">
                                        <span>Group ID</span>
                                        <input value={selectedObject.group_id || ''} onChange={(event) => setObjectPatch(selectedObject.id, { group_id: event.target.value })} />
                                    </label>
                                    {selectedObject.mirror_of ? (
                                        <div className="stand-design-editor-mini-note">Mirrored from: {selectedObject.mirror_of}</div>
                                    ) : null}
                                    <label className="stand-design-3d-toggle">
                                        <input
                                            type="checkbox"
                                            checked={selectedObject.locked}
                                            onChange={(event) => setObjectPatch(selectedObject.id, { locked: event.target.checked })}
                                        />
                                        Lock object
                                    </label>
                                    <label className="stand-design-3d-toggle">
                                        <input
                                            type="checkbox"
                                            checked={selectedObject.visible !== false}
                                            onChange={(event) => setObjectPatch(selectedObject.id, { visible: event.target.checked })}
                                        />
                                        Visible
                                    </label>
                                    <label className="stand-design-3d-toggle">
                                        <input
                                            type="checkbox"
                                            checked={Boolean(selectedObject.material?.double_sided)}
                                            onChange={(event) => setObjectMaterial(selectedObject.id, 'double_sided', event.target.checked)}
                                        />
                                        Double sided
                                    </label>
                                    <div className="stand-design-3d-inspector-actions">
                                        <button type="button" className="stand-design-inline-link" onClick={snapSelectedObjectToFloor}>Snap to floor</button>
                                        <button type="button" className="stand-design-inline-link" onClick={() => snapSelectedObjectToEdge('left')}>Snap left</button>
                                        <button type="button" className="stand-design-inline-link" onClick={() => snapSelectedObjectToEdge('right')}>Snap right</button>
                                        <button type="button" className="stand-design-inline-link" onClick={() => snapSelectedObjectToEdge('front')}>Snap front</button>
                                        <button type="button" className="stand-design-inline-link" onClick={() => snapSelectedObjectToEdge('back')}>Snap back</button>
                                    </div>
                                    <div className="stand-design-3d-inspector-actions">
                                        <button type="button" className="stand-design-inline-link" onClick={duplicateSelectedObject}>Duplicate</button>
                                        <button type="button" className="stand-design-inline-link" onClick={duplicateMirroredSelectedObject}>Duplicate mirrored</button>
                                        <button type="button" className="stand-design-inline-link is-danger" onClick={deleteSelectedObject}>Delete</button>
                                    </div>
                                </div>
                            ) : (
                                <AutoBlueprintSummary selectedConcept={selectedConcept} brief={brief} scene={scene} />
                            )}
                        </section>

                        <section className="stand-design-3d-card">
                            <h3>Scene Renders</h3>
                            {sceneRenders.length > 0 ? (
                                <div className="stand-design-3d-render-list">
                                    {sceneRenders.map((render) => (
                                        <a key={render.id} className="stand-design-3d-render-card" href={render.path} target="_blank" rel="noreferrer">
                                            <img src={render.path} alt={render.label} />
                                            <div>
                                                <strong>{render.label}</strong>
                                                <span>{new Date(render.created_at).toLocaleString()}</span>
                                            </div>
                                        </a>
                                    ))}
                                </div>
                            ) : (
                                <div className="stand-design-editor-empty">Render snapshots will appear here after you capture them.</div>
                            )}
                        </section>
                    </aside>

                    <section className="stand-design-3d-canvas-panel">
                        {viewMode === 'blueprint' ? (
                            <BlueprintView scene={scene} brief={brief} selectedConcept={selectedConcept} />
                        ) : (
                            <SceneViewport
                                scene={scene}
                                selectedObjectId={selectedObjectId}
                                transformMode={transformMode}
                                showHelpers={showHelpers}
                                showLabels={showLabels}
                                showGrid={showGrid}
                                onSelectObject={setSelectedObjectId}
                                onTransformCommit={(objectId, patch) => setObjectPatch(objectId, patch)}
                                onCaptureReady={setCaptureScene}
                            />
                        )}
                        <div className="stand-design-3d-reference">
                            <div className="stand-design-3d-reference-card">
                                <div className="stand-design-3d-reference-top">
                                    <strong>Reference Match</strong>
                                    <div className="stand-design-3d-reference-top-controls">
                                        <label className="stand-design-3d-toggle">
                                            <input type="checkbox" checked={referenceMode} onChange={(event) => setReferenceMode(event.target.checked)} />
                                            Reference Match mode
                                        </label>
                                        <label className="stand-design-3d-toggle">
                                            <input type="checkbox" checked={showGrid} onChange={(event) => setShowGrid(event.target.checked)} />
                                            Grid
                                        </label>
                                        <label className="stand-design-3d-toggle">
                                            <input type="checkbox" checked={showLabels} onChange={(event) => setShowLabels(event.target.checked)} />
                                            Labels
                                        </label>
                                        <label className="stand-design-3d-toggle">
                                            <input type="checkbox" checked={showHelpers} onChange={(event) => setShowHelpers(event.target.checked)} />
                                            Helpers
                                        </label>
                                    </div>
                                </div>
                                <div className="stand-design-3d-reference-controls">
                                    <label>
                                        <span>Overlay opacity</span>
                                        <input type="range" min="0" max="1" step="0.05" value={referenceOverlayOpacity} onChange={(event) => setReferenceOverlayOpacity(numberValue(event.target.value, 0.45))} />
                                    </label>
                                    <label>
                                        <span>Zoom</span>
                                        <input type="range" min="0.8" max="1.8" step="0.05" value={referenceZoom} onChange={(event) => setReferenceZoom(numberValue(event.target.value, 1))} />
                                    </label>
                                </div>
                                <div className={`stand-design-3d-compare ${referenceMode ? 'is-reference-mode' : ''}`}>
                                    <div className="stand-design-3d-compare-pane">
                                        <span>Reference concept</span>
                                        {selectedConcept?.path ? (
                                            <img
                                                src={selectedConcept.path}
                                                alt={selectedConcept.title || 'Reference concept'}
                                                style={{ transform: `scale(${referenceZoom})` }}
                                            />
                                        ) : (
                                            <div className="stand-design-editor-empty">Reference image unavailable</div>
                                        )}
                                    </div>
                                    <div className="stand-design-3d-compare-pane">
                                        <span>Current 3D match render</span>
                                        {matchPreview?.path ? (
                                            <div className="stand-design-3d-compare-overlay">
                                                <img src={matchPreview.path} alt={matchPreview.label || 'Match preview'} style={{ transform: `scale(${referenceZoom})` }} />
                                                {referenceMode && selectedConcept?.path ? (
                                                    <img
                                                        src={selectedConcept.path}
                                                        alt="Reference overlay"
                                                        className="is-overlay"
                                                        style={{ opacity: referenceOverlayOpacity, transform: `scale(${referenceZoom})` }}
                                                    />
                                                ) : null}
                                            </div>
                                        ) : (
                                            <div className="stand-design-editor-empty">Render a match preview to compare against the reference concept.</div>
                                        )}
                                    </div>
                                </div>
                                <p>{selectedConcept?.summary || 'This concept render is used as the visual source while the 3D scene remains fully editable.'}</p>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
