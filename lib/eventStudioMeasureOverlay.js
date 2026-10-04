import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { pointName, formatLength, formatArea } from './eventStudioMeasure.js';

const INK = '#1d2b29', AMBER = '#ffc93c', SNAP = '#5fd68a', FONT = '600 30px Arial, Helvetica, sans-serif';

function drawPlate(canvas, text, accent) {
  const ctx = canvas.getContext('2d'); ctx.font = FONT;
  const plate = Math.min(canvas.width, Math.ceil(ctx.measureText(text).width + 34)), left = (canvas.width - plate) / 2;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = accent ? AMBER : 'rgba(24,43,41,.92)'; ctx.beginPath(); ctx.roundRect(left + 1, 1, plate - 2, 48, 12); ctx.fill();
  ctx.fillStyle = accent ? INK : '#fff7e3'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, canvas.width / 2, 26, plate - 20);
}
function plateCanvas(text, accent = false) {
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d'); ctx.font = FONT;
  canvas.width = Math.ceil(ctx.measureText(text).width + 34); canvas.height = 50;
  drawPlate(canvas, text, accent); return canvas;
}
function dotCanvas(letter, fill) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.beginPath(); ctx.arc(32, 32, 27, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.stroke();
  if (letter) { ctx.fillStyle = INK; ctx.font = '700 30px Arial, Helvetica, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(letter, 32, 34); }
  return canvas;
}
/** A canvas drawn as a sprite that `MeasureOverlay.update` keeps a fixed number of pixels high. */
function canvasSprite(canvas, pixels, center, order) {
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.generateMipmaps = false; texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  sprite.center.set(...center); sprite.renderOrder = order; sprite.frustumCulled = false;
  Object.assign(sprite.userData, { pixels, aspect: canvas.width / canvas.height });
  return sprite;
}
const disposeSprite = sprite => { sprite.material.map?.dispose(); sprite.material.dispose(); };

/**
 * What the ruler draws: the measured run as a bright line on a dark casing, drawn over everything so
 * it reads against turf, sand or roofs; a lettered dot at each point; each leg's length; the total, or
 * the area of a closed shape; and a fainter leg from the last point to the cursor while drawing.
 * Line widths and labels are sized in screen pixels, so they read alike zoomed in or out, in plan or in perspective.
 */
export class MeasureOverlay {
  constructor() {
    this.group = new THREE.Group(); this.group.name = 'measure'; this.group.visible = false;
    const material = (color, linewidth, opacity) => new LineMaterial({ color, linewidth, opacity, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
    this.lineMaterials = [material(INK, 7, .6), material(AMBER, 3.5, 1), material(INK, 6, .45), material(AMBER, 2.5, .9)];
    this.run = this.fatLine(this.lineMaterials[0], this.lineMaterials[1], 990);
    this.live = this.fatLine(this.lineMaterials[2], this.lineMaterials[3], 992);
    this.marks = new THREE.Group(); this.group.add(this.marks);
    this.cursorCanvases = { free: dotCanvas('', AMBER), snap: dotCanvas('', SNAP) };
    this.cursor = canvasSprite(this.cursorCanvases.free, 15, [.5, .5], 996);
    this.liveCanvas = document.createElement('canvas'); this.liveCanvas.width = 620; this.liveCanvas.height = 50; this.liveText = '';
    this.liveLabel = canvasSprite(this.liveCanvas, 25, [.5, -.45], 997);
    this.cursor.visible = this.liveLabel.visible = false;
    this.group.add(this.cursor, this.liveLabel);
  }
  fatLine(casing, ink, order) {
    const geometry = new LineGeometry(); geometry.setPositions([0, 0, 0, 0, 0, 0]);
    const lines = [new Line2(geometry, casing), new Line2(geometry, ink)];
    lines.forEach((line, i) => { line.renderOrder = order + i; line.frustumCulled = false; line.visible = false; this.group.add(line); });
    return lines;
  }
  /** Draws the committed run from its `measureSummary`. */
  setRun(points, summary) {
    const [casing, ink] = this.run, path = summary.closed ? [...points, points[0]] : points;
    casing.geometry.dispose();
    const geometry = new LineGeometry(); geometry.setPositions(path.length > 1 ? path.flat() : [0, 0, 0, 0, 0, 0]);
    casing.geometry = ink.geometry = geometry; casing.visible = ink.visible = path.length > 1;
    for (const sprite of [...this.marks.children]) { disposeSprite(sprite); this.marks.remove(sprite); }
    const mark = (canvas, pixels, center, order, position) => { const sprite = canvasSprite(canvas, pixels, center, order); sprite.position.fromArray(position); this.marks.add(sprite); };
    points.forEach((point, i) => mark(dotCanvas(pointName(i), '#ffffff'), 22, [.5, .5], 995, point));
    for (const leg of summary.legs) {
      const a = points[leg.from], b = points[leg.to], rise = Math.abs(leg.rise) >= .25 ? ` · ${leg.rise > 0 ? '↑' : '↓'} ${formatLength(Math.abs(leg.rise))}` : '';
      mark(plateCanvas(formatLength(leg.length) + rise), 24, [.5, -.35], 994, a.map((value, k) => (value + b[k]) / 2));
    }
    if (summary.closed) {
      const middle = [0, 1, 2].map(k => points.reduce((total, p) => total + p[k], 0) / points.length);
      mark(plateCanvas(`Area ${formatArea(summary.area)} · perimeter ${formatLength(summary.total)}`, true), 27, [.5, .5], 998, middle);
    } else if (summary.legs.length > 1) mark(plateCanvas(`Total ${formatLength(summary.total)}`, true), 27, [.5, 1.55], 998, points[points.length - 1]);
  }
  /** The leg being drawn, from the last point to the cursor; the cursor dot turns green when it snaps. */
  setLive(from, to, text = '', snapped = false) {
    const [casing, ink] = this.live, leg = Boolean(from && to);
    casing.visible = ink.visible = leg;
    if (leg) {
      const data = casing.geometry.attributes.instanceStart.data;
      data.array.set([...from, ...to]); data.needsUpdate = true; casing.geometry.computeBoundingSphere();
    }
    this.cursor.visible = Boolean(to);
    if (to) {
      this.cursor.position.fromArray(to);
      const canvas = snapped ? this.cursorCanvases.snap : this.cursorCanvases.free, map = this.cursor.material.map;
      if (map.image !== canvas) { map.image = canvas; map.needsUpdate = true; }
    }
    this.liveLabel.visible = leg && Boolean(text);
    if (this.liveLabel.visible) {
      this.liveLabel.position.set((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2);
      if (text !== this.liveText) { drawPlate(this.liveCanvas, text, false); this.liveLabel.material.map.needsUpdate = true; this.liveText = text; }
    }
  }
  /** Each frame: line widths against the canvas size, and every dot and label held at its pixel size. */
  update(camera, width, height) {
    for (const material of this.lineMaterials) material.resolution.set(width, height);
    const tan = camera.isPerspectiveCamera ? Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) : 0;
    this.group.traverse(sprite => {
      if (!sprite.isSprite || !sprite.visible) return;
      const perPixel = camera.isOrthographicCamera ? (camera.top - camera.bottom) / (height * camera.zoom) : 2 * camera.position.distanceTo(sprite.position) * tan / height;
      const size = sprite.userData.pixels * perPixel; sprite.scale.set(size * sprite.userData.aspect, size, 1);
    });
  }
  dispose() {
    for (const [casing] of [this.run, this.live]) casing.geometry.dispose();
    for (const material of this.lineMaterials) material.dispose();
    for (const sprite of [...this.marks.children, this.cursor, this.liveLabel]) disposeSprite(sprite);
    this.group.clear();
  }
}
