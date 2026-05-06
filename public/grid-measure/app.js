const canvas = document.getElementById("measureCanvas");
const ctx = canvas.getContext("2d");
const emptyState = document.getElementById("emptyState");

const inputs = {
  image: document.getElementById("imageInput"),
  waste: document.getElementById("wasteInput"),
  curveType: document.getElementById("curveTypeInput"),
  cols: document.getElementById("colsInput"),
  rows: document.getElementById("rowsInput"),
  cellSize: document.getElementById("cellSizeInput"),
  left: document.getElementById("leftInput"),
  top: document.getElementById("topInput"),
  right: document.getElementById("rightInput"),
  bottom: document.getElementById("bottomInput"),
};

const outputs = {
  cells: document.getElementById("cellCount"),
  cellScale: document.getElementById("cellScaleValue"),
  groupCount: document.getElementById("groupCountValue"),
  area: document.getElementById("areaValue"),
  width: document.getElementById("widthValue"),
  height: document.getElementById("heightValue"),
  boxArea: document.getElementById("boxAreaValue"),
  perimeter: document.getElementById("perimeterValue"),
  wasteArea: document.getElementById("wasteAreaValue"),
  groups: document.getElementById("groupList"),
  fitStatus: document.getElementById("fitStatus"),
  uploadStatus: document.getElementById("uploadStatus"),
  cornerStatus: document.getElementById("cornerStatus"),
  zoomValue: document.getElementById("zoomValue"),
  rotationValue: document.getElementById("rotationValue"),
  areaLabel: document.getElementById("areaLabel"),
  widthLabel: document.getElementById("widthLabel"),
  heightLabel: document.getElementById("heightLabel"),
  boxAreaLabel: document.getElementById("boxAreaLabel"),
  wasteLabel: document.getElementById("wasteLabel"),
  quantitySummary: document.getElementById("quantitySummary"),
};

const buttons = {
  upload: document.getElementById("uploadButton"),
  autoFit: document.getElementById("autoFitGrid"),
  planScale: document.getElementById("planScaleMode"),
  elevScale: document.getElementById("elevScaleMode"),
  zoomOut: document.getElementById("zoomOut"),
  zoomIn: document.getElementById("zoomIn"),
  zoomFit: document.getElementById("zoomFit"),
  rotateLeft: document.getElementById("rotateLeft"),
  rotateRight: document.getElementById("rotateRight"),
  rotateReset: document.getElementById("rotateReset"),
  pan: document.getElementById("panMode"),
  rect: document.getElementById("rectMode"),
  paint: document.getElementById("paintMode"),
  align: document.getElementById("alignMode"),
  corner: document.getElementById("cornerMode"),
  quad: document.getElementById("quadMeasureMode"),
  ellipse: document.getElementById("ellipseMeasureMode"),
  curve: document.getElementById("curveMeasureMode"),
  editShape: document.getElementById("editShapeMode"),
  startCorners: document.getElementById("startCorners"),
  resetCorners: document.getElementById("resetCorners"),
  groupActions: document.getElementById("groupActionsPanel"),
  newPaint: document.getElementById("newPaintGroup"),
  undo: document.getElementById("undoGroup"),
  clear: document.getElementById("clearSelection"),
};

const nudgeButtons = {
  topUp: document.getElementById("nudgeTopUp"),
  topDown: document.getElementById("nudgeTopDown"),
  leftUp: document.getElementById("nudgeLeftUp"),
  leftDown: document.getElementById("nudgeLeftDown"),
  rightUp: document.getElementById("nudgeRightUp"),
  rightDown: document.getElementById("nudgeRightDown"),
  bottomUp: document.getElementById("nudgeBottomUp"),
  bottomDown: document.getElementById("nudgeBottomDown"),
};

const groupColors = ["#32b884", "#e2b72e", "#4fa3ff", "#d96df2", "#ff7a59", "#84d65a"];

const state = {
  image: null,
  mode: "rect",
  scaleMode: "plan",
  dragStart: null,
  hoverCell: null,
  groups: [],
  previewRect: null,
  alignPreview: null,
  ellipsePreview: null,
  curvePreview: null,
  selectedGroupId: null,
  editDrag: null,
  gridCorners: null,
  cornerClicks: [],
  quadClicks: [],
  view: {
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    rotation: 0,
    panStart: null,
  },
  activePaintGroupId: null,
  pendingShapeGroup: false,
  paintingValue: true,
  imageRecord: null,
};

function numberValue(input, fallback) {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function gridConfig() {
  return {
    cols: Math.max(1, Math.round(numberValue(inputs.cols, 1))),
    rows: Math.max(1, Math.round(numberValue(inputs.rows, 1))),
    cellSize: Math.max(0.01, numberValue(inputs.cellSize, 1)),
    left: clamp(numberValue(inputs.left, 0), 0, 95) / 100,
    top: clamp(numberValue(inputs.top, 0), 0, 95) / 100,
    right: clamp(numberValue(inputs.right, 0), 0, 95) / 100,
    bottom: clamp(numberValue(inputs.bottom, 0), 0, 95) / 100,
  };
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  draw();
}

function screenPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function screenToWorld(point) {
  const rect = canvas.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const translatedX = point.x - state.view.offsetX - cx;
  const translatedY = point.y - state.view.offsetY - cy;
  const cos = Math.cos(-state.view.rotation);
  const sin = Math.sin(-state.view.rotation);
  const rotatedX = translatedX * cos - translatedY * sin;
  const rotatedY = translatedX * sin + translatedY * cos;
  return {
    x: rotatedX / state.view.scale + cx,
    y: rotatedY / state.view.scale + cy,
  };
}

function worldToScreen(point) {
  const rect = canvas.getBoundingClientRect();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const scaledX = (point.x - cx) * state.view.scale;
  const scaledY = (point.y - cy) * state.view.scale;
  const cos = Math.cos(state.view.rotation);
  const sin = Math.sin(state.view.rotation);
  return {
    x: state.view.offsetX + cx + scaledX * cos - scaledY * sin,
    y: state.view.offsetY + cy + scaledX * sin + scaledY * cos,
  };
}

function updateZoomOutput() {
  outputs.zoomValue.textContent = `${Math.round(state.view.scale * 100)}%`;
  outputs.rotationValue.textContent = `${Math.round((state.view.rotation * 180) / Math.PI)} deg`;
}

function resetView() {
  state.view.scale = 1;
  state.view.offsetX = 0;
  state.view.offsetY = 0;
  state.view.rotation = 0;
  state.view.panStart = null;
  updateZoomOutput();
}

function fitViewToGrid(padding = 28) {
  const grid = gridBounds();
  if (!grid || grid.width <= 0 || grid.height <= 0) return;
  const rect = canvas.getBoundingClientRect();
  const availableWidth = Math.max(1, rect.width - padding * 2);
  const availableHeight = Math.max(1, rect.height - padding * 2);
  const scale = clamp(Math.min(availableWidth / grid.width, availableHeight / grid.height), 0.25, 8);
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  const gridCenterX = grid.x + grid.width / 2;
  const gridCenterY = grid.y + grid.height / 2;
  state.view.scale = scale;
  state.view.offsetX = -(gridCenterX - centerX) * scale;
  state.view.offsetY = -(gridCenterY - centerY) * scale;
  updateZoomOutput();
}

function setZoom(nextScale, anchor = null) {
  const scale = clamp(nextScale, 0.25, 8);
  const screen = anchor || {
    x: canvas.getBoundingClientRect().width / 2,
    y: canvas.getBoundingClientRect().height / 2,
  };
  const before = screenToWorld(screen);
  state.view.scale = scale;
  const after = worldToScreen(before);
  state.view.offsetX += screen.x - after.x;
  state.view.offsetY += screen.y - after.y;
  updateZoomOutput();
  draw();
}

function setRotation(nextRotation) {
  const center = {
    x: canvas.getBoundingClientRect().width / 2,
    y: canvas.getBoundingClientRect().height / 2,
  };
  const before = screenToWorld(center);
  state.view.rotation = nextRotation;
  const after = worldToScreen(before);
  state.view.offsetX += center.x - after.x;
  state.view.offsetY += center.y - after.y;
  updateZoomOutput();
  draw();
}

function clearGroups() {
  state.groups = [];
  state.previewRect = null;
  state.alignPreview = null;
  state.ellipsePreview = null;
  state.curvePreview = null;
  state.quadClicks = [];
  state.selectedGroupId = null;
  state.editDrag = null;
  state.activePaintGroupId = null;
  state.pendingShapeGroup = false;
}

function setUploadStatus(message) {
  outputs.uploadStatus.textContent = message;
}

function loadImage(src, options = {}) {
  const img = new Image();
  img.onload = () => {
    state.image = img;
    state.imageRecord = options.imageRecord || state.imageRecord || { path: src, originalName: options.label || "Grid image" };
    clearGroups();
    state.gridCorners = null;
    state.cornerClicks = [];
    resetView();
    emptyState.classList.add("hidden");
    if (options.resetGrid !== false) {
      inputs.cols.value = 58;
      inputs.rows.value = 20;
    }
    if (!autoFitGrid({ updateCounts: true, allowUncertain: true })) {
      setGridPreset({ cols: numberValue(inputs.cols, 58), rows: numberValue(inputs.rows, 20), left: 0, top: 0, right: 0, bottom: 0 });
      if (!outputs.fitStatus.textContent.startsWith("Auto fit uncertain")) {
        setFitStatus("Auto fit could not find a grid. Use Set 4 corners.");
      }
    }
    draw();
    updateOutput();
    if (options.label) setUploadStatus(options.label);
    if (typeof options.afterLoad === "function") options.afterLoad();
    if (options.revokeUrl) URL.revokeObjectURL(options.revokeUrl);
  };
  img.onerror = () => {
    setUploadStatus("Could not load this image");
    setFitStatus("Upload failed. Try JPG or PNG.");
    if (options.revokeUrl) URL.revokeObjectURL(options.revokeUrl);
  };
  img.src = src;
}

function imageBounds() {
  if (!state.image) return null;
  const rect = canvas.getBoundingClientRect();
  const imgRatio = state.image.width / state.image.height;
  const canvasRatio = rect.width / rect.height;
  let width = rect.width;
  let height = rect.height;

  if (imgRatio > canvasRatio) {
    height = width / imgRatio;
  } else {
    width = height * imgRatio;
  }

  return {
    x: (rect.width - width) / 2,
    y: (rect.height - height) / 2,
    width,
    height,
  };
}

function imageToCanvasPoint(point) {
  const bounds = imageBounds();
  return {
    x: bounds.x + (point.x / state.image.naturalWidth) * bounds.width,
    y: bounds.y + (point.y / state.image.naturalHeight) * bounds.height,
  };
}

function canvasToImagePoint(point) {
  const bounds = imageBounds();
  return {
    x: clamp(((point.x - bounds.x) / bounds.width) * state.image.naturalWidth, 0, state.image.naturalWidth),
    y: clamp(((point.y - bounds.y) / bounds.height) * state.image.naturalHeight, 0, state.image.naturalHeight),
  };
}

function cropGridCorners() {
  const grid = gridConfig();
  const imgW = state.image.naturalWidth;
  const imgH = state.image.naturalHeight;
  const left = imgW * grid.left;
  const top = imgH * grid.top;
  const right = imgW * (1 - grid.right);
  const bottom = imgH * (1 - grid.bottom);
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
}

function gridBounds() {
  if (!state.image || !imageBounds()) return null;
  const grid = gridConfig();
  const imageCorners = state.gridCorners || cropGridCorners();
  const corners = imageCorners.map(imageToCanvasPoint);
  const minX = Math.min(...corners.map((point) => point.x));
  const maxX = Math.max(...corners.map((point) => point.x));
  const minY = Math.min(...corners.map((point) => point.y));
  const maxY = Math.max(...corners.map((point) => point.y));
  return {
    ...grid,
    corners,
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
    cellW: (maxX - minX) / grid.cols,
    cellH: (maxY - minY) / grid.rows,
  };
}

function canvasPoint(event) {
  return screenToWorld(screenPoint(event));
}

function pointToCell(point) {
  const grid = gridBounds();
  if (!grid) return null;
  const uv = pointToGridUv(grid, point);
  if (!uv || uv.u < 0 || uv.v < 0 || uv.u >= 1 || uv.v >= 1) return null;

  return {
    col: Math.min(grid.cols - 1, Math.floor(uv.u * grid.cols)),
    row: Math.min(grid.rows - 1, Math.floor(uv.v * grid.rows)),
  };
}

function gridPoint(grid, u, v) {
  const [tl, tr, br, bl] = grid.corners;
  const topX = tl.x + (tr.x - tl.x) * u;
  const topY = tl.y + (tr.y - tl.y) * u;
  const bottomX = bl.x + (br.x - bl.x) * u;
  const bottomY = bl.y + (br.y - bl.y) * u;
  return {
    x: topX + (bottomX - topX) * v,
    y: topY + (bottomY - topY) * v,
  };
}

function pointToGridUv(grid, point) {
  let u = (point.x - grid.x) / Math.max(1, grid.width);
  let v = (point.y - grid.y) / Math.max(1, grid.height);

  for (let index = 0; index < 10; index += 1) {
    const current = gridPoint(grid, u, v);
    const [tl, tr, br, bl] = grid.corners;
    const du = {
      x: (tr.x - tl.x) * (1 - v) + (br.x - bl.x) * v,
      y: (tr.y - tl.y) * (1 - v) + (br.y - bl.y) * v,
    };
    const dv = {
      x: (bl.x - tl.x) * (1 - u) + (br.x - tr.x) * u,
      y: (bl.y - tl.y) * (1 - u) + (br.y - tr.y) * u,
    };
    const ex = current.x - point.x;
    const ey = current.y - point.y;
    const det = du.x * dv.y - du.y * dv.x;
    if (Math.abs(det) < 0.0001) break;
    u -= (ex * dv.y - ey * dv.x) / det;
    v -= (du.x * ey - du.y * ex) / det;
  }

  const pad = 0.000001;
  if (u < -pad || v < -pad || u > 1 + pad || v > 1 + pad) return null;
  return { u: clamp(u, 0, 1), v: clamp(v, 0, 1) };
}

function cellKey(cell) {
  return `${cell.col},${cell.row}`;
}

function normalizeRect(a, b) {
  if (!a || !b) return null;
  return {
    col1: Math.min(a.col, b.col),
    row1: Math.min(a.row, b.row),
    col2: Math.max(a.col, b.col),
    row2: Math.max(a.row, b.row),
  };
}

function rectCells(rect) {
  if (!rect) return [];
  const cells = [];
  for (let row = rect.row1; row <= rect.row2; row += 1) {
    for (let col = rect.col1; col <= rect.col2; col += 1) {
      cells.push({ col, row });
    }
  }
  return cells;
}

function cellsFromGroup(group) {
  if (group.type === "quad" || group.type === "ellipse") return [];

  if (group.type === "paint") {
    return [...group.cells].map((key) => {
      const [col, row] = key.split(",").map(Number);
      return { col, row };
    });
  }

  return rectCells(group.rect);
}

function selectedCells() {
  const unique = new Map();
  state.groups.forEach((group) => {
    cellsFromGroup(group).forEach((cell) => unique.set(cellKey(cell), cell));
  });
  return [...unique.values()];
}

function nonEmptyGroups() {
  return state.groups.filter((group) => group.type === "quad" || group.type === "ellipse" || group.type === "curve" || cellsFromGroup(group).length > 0 || group.rects?.length > 0);
}

function statsForCells(cells) {
  const cellSize = gridConfig().cellSize;
  if (!cells.length) return { count: 0, widthCells: 0, heightCells: 0, width: 0, height: 0, area: 0, boxArea: 0, perimeter: 0 };
  const cols = cells.map((cell) => cell.col);
  const rows = cells.map((cell) => cell.row);
  const widthCells = Math.max(...cols) - Math.min(...cols) + 1;
  const heightCells = Math.max(...rows) - Math.min(...rows) + 1;
  const keys = new Set(cells.map(cellKey));
  let exposedEdges = 0;
  cells.forEach((cell) => {
    [
      { col: cell.col - 1, row: cell.row },
      { col: cell.col + 1, row: cell.row },
      { col: cell.col, row: cell.row - 1 },
      { col: cell.col, row: cell.row + 1 },
    ].forEach((neighbor) => {
      if (!keys.has(cellKey(neighbor))) exposedEdges += 1;
    });
  });
  return {
    count: cells.length,
    widthCells,
    heightCells,
    width: widthCells * cellSize,
    height: heightCells * cellSize,
    area: cells.length * cellSize * cellSize,
    boxArea: widthCells * heightCells * cellSize * cellSize,
    perimeter: exposedEdges * cellSize,
  };
}

function distanceMeters(a, b, grid, cellSize) {
  const dx = (b.u - a.u) * grid.cols;
  const dy = (b.v - a.v) * grid.rows;
  return Math.hypot(dx, dy) * cellSize;
}

function quadStats(group) {
  const grid = gridBounds();
  const cellSize = gridConfig().cellSize;
  if (!grid || !group.points || group.points.length !== 4) {
    return { count: 0, widthCells: 0, heightCells: 0, width: 0, height: 0, area: 0, boxArea: 0, perimeter: 0 };
  }

  const uv = group.points.map((point) => pointToGridUv(grid, point)).filter(Boolean);
  if (uv.length !== 4) return { count: 0, widthCells: 0, heightCells: 0, width: 0, height: 0, area: 0, boxArea: 0, perimeter: 0 };

  const [tl, tr, br, bl] = uv;
  const top = distanceMeters(tl, tr, grid, cellSize);
  const right = distanceMeters(tr, br, grid, cellSize);
  const bottom = distanceMeters(bl, br, grid, cellSize);
  const left = distanceMeters(tl, bl, grid, cellSize);
  const width = (top + bottom) / 2;
  const height = (left + right) / 2;
  const perimeter = top + right + bottom + left;
  const cellPoints = uv.map((point) => ({ x: point.u * grid.cols, y: point.v * grid.rows }));
  let shoelace = 0;
  cellPoints.forEach((point, index) => {
    const next = cellPoints[(index + 1) % cellPoints.length];
    shoelace += point.x * next.y - next.x * point.y;
  });
  const area = Math.abs(shoelace) / 2 * cellSize * cellSize;

  return {
    count: area / (cellSize * cellSize),
    widthCells: width / cellSize,
    heightCells: height / cellSize,
    width,
    height,
    area,
    boxArea: width * height,
    perimeter,
  };
}

function orderQuadPoints(points) {
  const grid = gridBounds();
  if (!grid || !points || points.length !== 4) return points;
  const mapped = points
    .map((point) => ({ point, uv: pointToGridUv(grid, point) }))
    .filter((item) => item.uv);
  if (mapped.length !== 4) return points;
  const byRow = mapped.sort((a, b) => a.uv.v - b.uv.v);
  const top = byRow.slice(0, 2).sort((a, b) => a.uv.u - b.uv.u);
  const bottom = byRow.slice(2, 4).sort((a, b) => a.uv.u - b.uv.u);
  return [top[0].point, top[1].point, bottom[1].point, bottom[0].point];
}

function normalizeUvRect(a, b) {
  return {
    u1: Math.min(a.u, b.u),
    v1: Math.min(a.v, b.v),
    u2: Math.max(a.u, b.u),
    v2: Math.max(a.v, b.v),
  };
}

function rectStats(rect) {
  const grid = gridBounds();
  const cellSize = gridConfig().cellSize;
  if (!grid || !rect) return { count: 0, widthCells: 0, heightCells: 0, width: 0, height: 0, area: 0, boxArea: 0, perimeter: 0 };
  const widthCells = Math.abs(rect.u2 - rect.u1) * grid.cols;
  const heightCells = Math.abs(rect.v2 - rect.v1) * grid.rows;
  const width = widthCells * cellSize;
  const height = heightCells * cellSize;
  const area = width * height;
  return {
    count: area / (cellSize * cellSize),
    widthCells,
    heightCells,
    width,
    height,
    area,
    boxArea: area,
    perimeter: width > 0 && height > 0 ? (width + height) * 2 : 0,
  };
}

function combineStats(statsList) {
  const nonZero = statsList.filter((stats) => stats.area > 0 || stats.count > 0);
  if (!nonZero.length) return { count: 0, widthCells: 0, heightCells: 0, width: 0, height: 0, area: 0, boxArea: 0, perimeter: 0 };
  return {
    count: nonZero.reduce((sum, stats) => sum + stats.count, 0),
    widthCells: Math.max(...nonZero.map((stats) => stats.widthCells)),
    heightCells: Math.max(...nonZero.map((stats) => stats.heightCells)),
    width: Math.max(...nonZero.map((stats) => stats.width)),
    height: Math.max(...nonZero.map((stats) => stats.height)),
    area: nonZero.reduce((sum, stats) => sum + stats.area, 0),
    boxArea: nonZero.reduce((sum, stats) => sum + stats.boxArea, 0),
    perimeter: nonZero.reduce((sum, stats) => sum + stats.perimeter, 0),
  };
}

function moveUvRect(ellipse, du, dv) {
  const width = ellipse.u2 - ellipse.u1;
  const height = ellipse.v2 - ellipse.v1;
  const u1 = clamp(ellipse.u1 + du, 0, 1 - width);
  const v1 = clamp(ellipse.v1 + dv, 0, 1 - height);
  return {
    u1,
    v1,
    u2: u1 + width,
    v2: v1 + height,
  };
}

function ellipseHandleUv(ellipse, handle) {
  const midU = (ellipse.u1 + ellipse.u2) / 2;
  const midV = (ellipse.v1 + ellipse.v2) / 2;
  const handles = {
    nw: { u: ellipse.u1, v: ellipse.v1 },
    n: { u: midU, v: ellipse.v1 },
    ne: { u: ellipse.u2, v: ellipse.v1 },
    e: { u: ellipse.u2, v: midV },
    se: { u: ellipse.u2, v: ellipse.v2 },
    s: { u: midU, v: ellipse.v2 },
    sw: { u: ellipse.u1, v: ellipse.v2 },
    w: { u: ellipse.u1, v: midV },
    center: { u: midU, v: midV },
  };
  return handles[handle];
}

function resizeEllipseFromHandle(ellipse, handle, uv) {
  const next = { ...ellipse };
  if (handle.includes("n")) next.v1 = uv.v;
  if (handle.includes("s")) next.v2 = uv.v;
  if (handle.includes("w")) next.u1 = uv.u;
  if (handle.includes("e")) next.u2 = uv.u;
  return normalizeUvRect({ u: next.u1, v: next.v1 }, { u: next.u2, v: next.v2 });
}

function ellipseStats(group) {
  const grid = gridBounds();
  const cellSize = gridConfig().cellSize;
  const ellipse = group.ellipse;
  if (!grid || !ellipse) return { count: 0, widthCells: 0, heightCells: 0, width: 0, height: 0, area: 0, boxArea: 0, perimeter: 0 };

  const widthCells = Math.abs(ellipse.u2 - ellipse.u1) * grid.cols;
  const heightCells = Math.abs(ellipse.v2 - ellipse.v1) * grid.rows;
  const width = widthCells * cellSize;
  const height = heightCells * cellSize;
  const rx = width / 2;
  const ry = height / 2;
  const area = Math.PI * rx * ry;
  const perimeter = rx + ry === 0 ? 0 : Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  return {
    count: area / (cellSize * cellSize),
    widthCells,
    heightCells,
    width,
    height,
    area,
    boxArea: width * height,
    perimeter,
  };
}

function curveStats(group) {
  const grid = gridBounds();
  const cellSize = gridConfig().cellSize;
  const curve = group.curve;
  if (!grid || !curve) return { count: 0, widthCells: 0, heightCells: 0, width: 0, height: 0, area: 0, boxArea: 0, perimeter: 0 };
  const width = Math.abs(curve.u2 - curve.u1) * grid.cols * cellSize;
  const height = Math.abs(curve.v2 - curve.v1) * grid.rows * cellSize;
  const rx = width / 2;
  const ry = height;
  const ellipseArea = Math.PI * rx * ry;
  const ellipsePerimeter = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
  const type = curve.type || "half";
  let area = ellipseArea / 2;
  let perimeter = ellipsePerimeter / 2 + width;
  if (type === "quarter") {
    area = ellipseArea / 4;
    perimeter = ellipsePerimeter / 4 + rx + ry;
  } else if (type === "ring" || type === "half-ring") {
    const innerRatio = 0.6;
    const innerArea = ellipseArea * innerRatio * innerRatio;
    area = ellipseArea - innerArea;
    perimeter = ellipsePerimeter * (1 + innerRatio);
    if (type === "half-ring") {
      area /= 2;
      perimeter = (ellipsePerimeter * (1 + innerRatio)) / 2 + width * (1 - innerRatio);
    }
  }
  return {
    count: area / (cellSize * cellSize),
    widthCells: width / cellSize,
    heightCells: height / cellSize,
    width,
    height,
    area,
    boxArea: width * height,
    perimeter,
  };
}

function statsForGroup(group) {
  if (group.type === "quad") return quadStats(group);
  if (group.type === "ellipse") return ellipseStats(group);
  if (group.type === "curve") return curveStats(group);
  if (group.type === "paint") return combineStats([statsForCells(cellsFromGroup(group)), ...(group.rects || []).map(rectStats)]);
  return statsForCells(cellsFromGroup(group));
}

function selectionStats() {
  const groupStatsList = state.groups.map(statsForGroup);
  const previewStats = state.previewRect ? rectStats(state.previewRect) : null;
  const ellipsePreviewStats = state.ellipsePreview ? ellipseStats({ ellipse: state.ellipsePreview }) : null;
  const curvePreviewStats = state.curvePreview ? curveStats({ curve: state.curvePreview }) : null;
  return combineStats([...groupStatsList, previewStats, ellipsePreviewStats, curvePreviewStats].filter(Boolean));
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatCount(value) {
  return Number.isInteger(value) ? String(value) : formatNumber(value);
}

function makeGroupId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nextGroupColor() {
  return groupColors[state.groups.length % groupColors.length];
}

function addCellsToActiveGroup(cells) {
  if (!cells.length) return false;
  const group = state.groups.find((item) => item.id === state.activePaintGroupId && item.type === "paint");
  if (!group) return false;
  cells.forEach((cell) => group.cells.add(cellKey(cell)));
  state.selectedGroupId = group.id;
  return true;
}

function addRectToActiveGroup(rect) {
  if (!rect) return false;
  const group = state.groups.find((item) => item.id === state.activePaintGroupId && item.type === "paint");
  if (!group) return false;
  group.rects ||= [];
  group.rects.push(rect);
  state.selectedGroupId = group.id;
  return true;
}

function addRectGroup(rect) {
  if (!rect) return false;
  const id = makeGroupId();
  state.groups.push({
    id,
    type: "rect",
    rect,
    color: nextGroupColor(),
    category: "flooring",
    label: `Group ${state.groups.length + 1}`,
  });
  state.selectedGroupId = id;
  return true;
}

function createPaintGroup() {
  const id = makeGroupId();
  state.groups.push({
    id,
    type: "paint",
    cells: new Set(),
    rects: [],
    color: nextGroupColor(),
    category: "flooring",
    label: `Group ${state.groups.length + 1}`,
  });
  state.activePaintGroupId = id;
  state.selectedGroupId = id;
  state.pendingShapeGroup = false;
  return state.groups.at(-1);
}

function ensurePaintGroup() {
  return activePaintGroup() || createPaintGroup();
}

function preparePendingShapeGroup(mode) {
  const activeGroup = activePaintGroup();
  if (activeGroup && activeGroup.cells.size === 0 && (!activeGroup.rects || activeGroup.rects.length === 0)) {
    state.groups = state.groups.filter((group) => group.id !== activeGroup.id);
  }
  state.pendingShapeGroup = true;
  state.activePaintGroupId = null;
  setFitStatus(`${mode === "quad" ? "4pt" : mode === "ellipse" ? "Ellipse" : "Curve"} group ready. Draw the shape now.`);
}

function addQuadGroup(points) {
  if (!state.pendingShapeGroup) return false;
  const id = makeGroupId();
  const orderedPoints = orderQuadPoints(points);
  state.groups.push({
    id,
    type: "quad",
    points: orderedPoints,
    color: nextGroupColor(),
    category: "flooring",
    label: `4pt ${state.groups.length + 1}`,
  });
  state.selectedGroupId = id;
  state.pendingShapeGroup = false;
  state.activePaintGroupId = null;
  return true;
}

function addEllipseGroup(ellipse) {
  if (!state.pendingShapeGroup) return false;
  const id = makeGroupId();
  state.groups.push({
    id,
    type: "ellipse",
    ellipse,
    color: nextGroupColor(),
    category: "flooring",
    label: `Ellipse ${state.groups.length + 1}`,
  });
  state.selectedGroupId = id;
  state.pendingShapeGroup = false;
  state.activePaintGroupId = null;
  return true;
}

function addCurveGroup(curve) {
  if (!state.pendingShapeGroup) return false;
  const id = makeGroupId();
  state.groups.push({
    id,
    type: "curve",
    curve,
    category: "flooring",
    color: nextGroupColor(),
    label: `Curve ${state.groups.length + 1}`,
  });
  state.selectedGroupId = id;
  state.pendingShapeGroup = false;
  state.activePaintGroupId = null;
  return true;
}

function activePaintGroup() {
  return state.groups.find((group) => group.id === state.activePaintGroupId && group.type === "paint") || null;
}

function selectedGroup() {
  return state.groups.find((group) => group.id === state.selectedGroupId) || null;
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const pi = polygon[i];
    const pj = polygon[j];
    const intersect = pi.y > point.y !== pj.y > point.y && point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y || 0.000001) + pi.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

function shapeHandles(grid, group) {
  if (!grid || !group) return [];
  if (group.type === "quad") {
    return group.points.map((point, index) => ({ kind: "point", index, point }));
  }
  if (group.type === "ellipse") {
    return ["nw", "n", "ne", "e", "se", "s", "sw", "w", "center"].map((handle) => ({
      kind: handle === "center" ? "move" : "ellipse",
      handle,
      point: gridPoint(grid, ellipseHandleUv(group.ellipse, handle).u, ellipseHandleUv(group.ellipse, handle).v),
    }));
  }
  if (group.type === "curve") {
    return ["nw", "ne", "se", "sw"].map((handle) => {
      const u = handle.includes("w") ? group.curve.u1 : group.curve.u2;
      const v = handle.includes("n") ? group.curve.v1 : group.curve.v2;
      return { kind: "curve", handle, point: gridPoint(grid, u, v) };
    });
  }
  return [];
}

function hitShapeHandle(grid, point) {
  const radius = 11 / state.view.scale;
  const groups = [...state.groups].reverse();
  for (const group of groups) {
    if (group.type !== "quad" && group.type !== "ellipse" && group.type !== "curve") continue;
    for (const handle of shapeHandles(grid, group)) {
      if (distance(point, handle.point) <= radius) return { group, handle };
    }
  }
  return null;
}

function hitShapeBody(grid, point) {
  const groups = [...state.groups].reverse();
  for (const group of groups) {
    if (group.type === "quad" && group.points?.length === 4 && pointInPolygon(point, group.points)) return group;
    if (group.type === "ellipse" && group.ellipse) {
      const uv = pointToGridUv(grid, point);
      if (!uv) continue;
      const cx = (group.ellipse.u1 + group.ellipse.u2) / 2;
      const cy = (group.ellipse.v1 + group.ellipse.v2) / 2;
      const rx = Math.abs(group.ellipse.u2 - group.ellipse.u1) / 2;
      const ry = Math.abs(group.ellipse.v2 - group.ellipse.v1) / 2;
      if (rx > 0 && ry > 0 && ((uv.u - cx) / rx) ** 2 + ((uv.v - cy) / ry) ** 2 <= 1) return group;
    }
    if (group.type === "curve" && group.curve) {
      const uv = pointToGridUv(grid, point);
      if (!uv) continue;
      if (uv.u >= group.curve.u1 && uv.u <= group.curve.u2 && uv.v >= group.curve.v1 && uv.v <= group.curve.v2) return group;
    }
  }
  return null;
}

function startShapeEdit(point) {
  const grid = gridBounds();
  if (!grid) return false;
  const handleHit = hitShapeHandle(grid, point);
  if (handleHit) {
    state.selectedGroupId = handleHit.group.id;
    state.editDrag = {
      type: handleHit.handle.kind,
      handle: handleHit.handle,
      groupId: handleHit.group.id,
      startPoint: point,
      lastPoint: point,
      startUv: pointToGridUv(grid, point),
      startEllipse: handleHit.group.ellipse ? { ...handleHit.group.ellipse } : null,
      startCurve: handleHit.group.curve ? { ...handleHit.group.curve } : null,
      startPoints: handleHit.group.points ? handleHit.group.points.map((item) => ({ ...item })) : null,
    };
    return true;
  }

  const bodyHit = hitShapeBody(grid, point);
  if (bodyHit) {
    state.selectedGroupId = bodyHit.id;
    state.editDrag = {
      type: "move",
      groupId: bodyHit.id,
      startPoint: point,
      lastPoint: point,
      startUv: pointToGridUv(grid, point),
      startEllipse: bodyHit.ellipse ? { ...bodyHit.ellipse } : null,
      startCurve: bodyHit.curve ? { ...bodyHit.curve } : null,
      startPoints: bodyHit.points ? bodyHit.points.map((item) => ({ ...item })) : null,
    };
    return true;
  }

  state.selectedGroupId = null;
  state.editDrag = null;
  return false;
}

function updateShapeEdit(point) {
  if (!state.editDrag) return;
  const grid = gridBounds();
  const group = state.groups.find((item) => item.id === state.editDrag.groupId);
  if (!grid || !group) return;

  if (group.type === "quad") {
    if (state.editDrag.type === "point") {
      group.points[state.editDrag.handle.index] = point;
    } else if (state.editDrag.type === "move") {
      const dx = point.x - state.editDrag.startPoint.x;
      const dy = point.y - state.editDrag.startPoint.y;
      group.points = state.editDrag.startPoints.map((item) => ({ x: item.x + dx, y: item.y + dy }));
    }
  }

  if (group.type === "ellipse") {
    const uv = pointToGridUv(grid, point);
    if (!uv) return;
    if (state.editDrag.type === "move") {
      const du = uv.u - state.editDrag.startUv.u;
      const dv = uv.v - state.editDrag.startUv.v;
      group.ellipse = moveUvRect(state.editDrag.startEllipse, du, dv);
    } else if (state.editDrag.type === "ellipse") {
      group.ellipse = resizeEllipseFromHandle(state.editDrag.startEllipse, state.editDrag.handle.handle, uv);
    }
  }
  if (group.type === "curve") {
    const uv = pointToGridUv(grid, point);
    if (!uv) return;
    if (state.editDrag.type === "curve") {
      const rect = resizeEllipseFromHandle(state.editDrag.startCurve, state.editDrag.handle.handle, uv);
      group.curve = { ...rect, type: state.editDrag.startCurve.type };
    } else if (state.editDrag.type === "move") {
      const du = uv.u - state.editDrag.startUv.u;
      const dv = uv.v - state.editDrag.startUv.v;
      group.curve = { ...moveUvRect(state.editDrag.startCurve, du, dv), type: state.editDrag.startCurve.type };
    }
  }
}

function drawImage(bounds) {
  ctx.drawImage(state.image, bounds.x, bounds.y, bounds.width, bounds.height);
}

function drawGrid(grid) {
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.58)";
  ctx.lineWidth = 1;

  for (let col = 0; col <= grid.cols; col += 1) {
    const u = col / grid.cols;
    ctx.beginPath();
    for (let step = 0; step <= 24; step += 1) {
      const point = gridPoint(grid, u, step / 24);
      if (step === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
  }

  for (let row = 0; row <= grid.rows; row += 1) {
    const v = row / grid.rows;
    ctx.beginPath();
    for (let step = 0; step <= 24; step += 1) {
      const point = gridPoint(grid, step / 24, v);
      if (step === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(226, 77, 46, 0.95)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  grid.corners.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function cellPolygon(grid, cell) {
  const u1 = cell.col / grid.cols;
  const u2 = (cell.col + 1) / grid.cols;
  const v1 = cell.row / grid.rows;
  const v2 = (cell.row + 1) / grid.rows;
  return [
    gridPoint(grid, u1, v1),
    gridPoint(grid, u2, v1),
    gridPoint(grid, u2, v2),
    gridPoint(grid, u1, v2),
  ];
}

function drawPolygon(points, fill = true) {
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  if (fill) ctx.fill();
  ctx.stroke();
}

function drawGridRectBoundary(grid, minCol, minRow, width, height) {
  const u1 = minCol / grid.cols;
  const u2 = (minCol + width) / grid.cols;
  const v1 = minRow / grid.rows;
  const v2 = (minRow + height) / grid.rows;
  drawPolygon([gridPoint(grid, u1, v1), gridPoint(grid, u2, v1), gridPoint(grid, u2, v2), gridPoint(grid, u1, v2)], false);
}

function drawUvRect(grid, rect, color, preview = false) {
  if (!rect) return;
  ctx.save();
  ctx.fillStyle = preview ? "rgba(255, 255, 255, 0.18)" : `${color}55`;
  ctx.strokeStyle = preview ? "#ffffff" : color;
  ctx.lineWidth = 2;
  drawPolygon([gridPoint(grid, rect.u1, rect.v1), gridPoint(grid, rect.u2, rect.v1), gridPoint(grid, rect.u2, rect.v2), gridPoint(grid, rect.u1, rect.v2)], true);
  ctx.restore();
}

function drawCellBlock(grid, cells, color) {
  ctx.fillStyle = `${color}66`;
  ctx.strokeStyle = color;
  cells.forEach((cell) => {
    drawPolygon(cellPolygon(grid, cell));
  });

  if (!cells.length) return;
  const stats = statsForCells(cells);
  const minCol = Math.min(...cells.map((cell) => cell.col));
  const minRow = Math.min(...cells.map((cell) => cell.row));
  drawGridRectBoundary(grid, minCol, minRow, stats.widthCells, stats.heightCells);
}

function drawQuadGroup(group) {
  if (!group.points || group.points.length < 2) return;
  ctx.save();
  ctx.fillStyle = `${group.color}66`;
  ctx.strokeStyle = group.color;
  ctx.lineWidth = 2;
  drawPolygon(group.points, group.points.length === 4);
  ctx.restore();
}

function ellipsePoints(grid, ellipse) {
  const cx = (ellipse.u1 + ellipse.u2) / 2;
  const cy = (ellipse.v1 + ellipse.v2) / 2;
  const rx = Math.abs(ellipse.u2 - ellipse.u1) / 2;
  const ry = Math.abs(ellipse.v2 - ellipse.v1) / 2;
  const points = [];
  for (let index = 0; index < 96; index += 1) {
    const angle = (index / 96) * Math.PI * 2;
    points.push(gridPoint(grid, cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry));
  }
  return points;
}

function curvePoints(grid, curve, inner = false) {
  const type = curve.type || "half";
  const u1 = curve.u1;
  const u2 = curve.u2;
  const v1 = curve.v1;
  const v2 = curve.v2;
  const cx = (u1 + u2) / 2;
  const rx = Math.abs(u2 - u1) / 2 * (inner ? 0.6 : 1);
  const ry = Math.abs(v2 - v1) * (inner ? 0.6 : 1);
  const baseY = v2;
  const points = [];
  const start = type === "quarter" ? Math.PI : Math.PI;
  const end = type === "quarter" ? Math.PI * 1.5 : Math.PI * 2;
  for (let index = 0; index <= 72; index += 1) {
    const angle = start + (end - start) * (index / 72);
    points.push(gridPoint(grid, cx + Math.cos(angle) * rx, baseY + Math.sin(angle) * ry));
  }
  return points;
}

function drawEllipseGroup(grid, group, preview = false) {
  if (!group.ellipse) return;
  ctx.save();
  ctx.fillStyle = preview ? "rgba(255, 255, 255, 0.18)" : `${group.color}66`;
  ctx.strokeStyle = preview ? "#ffffff" : group.color;
  ctx.lineWidth = 2;
  drawPolygon(ellipsePoints(grid, group.ellipse), true);
  ctx.restore();
}

function drawCurveGroup(grid, group, preview = false) {
  const curve = group.curve;
  if (!curve) return;
  const type = curve.type || "half";
  ctx.save();
  ctx.fillStyle = preview ? "rgba(255, 255, 255, 0.18)" : `${group.color}66`;
  ctx.strokeStyle = preview ? "#ffffff" : group.color;
  ctx.lineWidth = 2;
  const outer = curvePoints(grid, curve, false);
  if (type === "ring" || type === "half-ring") {
    const inner = curvePoints(grid, curve, true).reverse();
    drawPolygon([...outer, ...inner], true);
  } else {
    const closePoint = type === "quarter" ? gridPoint(grid, curve.u1, curve.v2) : gridPoint(grid, curve.u1, curve.v2);
    drawPolygon([...outer, closePoint], true);
  }
  ctx.restore();
}

function drawShapeHandles(grid) {
  const group = selectedGroup();
  if (!group || (group.type !== "quad" && group.type !== "ellipse")) return;
  const handles = shapeHandles(grid, group);
  ctx.save();
  ctx.lineWidth = 2;
  handles.forEach((handle) => {
    const size = handle.kind === "move" ? 10 : 8;
    const half = size / 2;
    ctx.fillStyle = handle.kind === "move" ? "#111111" : "#ffffff";
    ctx.strokeStyle = group.color;
    ctx.beginPath();
    ctx.rect(handle.point.x - half, handle.point.y - half, size, size);
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
}

function drawSelection(grid) {
  ctx.save();
  ctx.lineWidth = 2;

  state.groups.forEach((group) => {
    if (group.type === "quad") drawQuadGroup(group);
    else if (group.type === "ellipse") drawEllipseGroup(grid, group);
    else if (group.type === "curve") drawCurveGroup(grid, group);
    else {
      drawCellBlock(grid, cellsFromGroup(group), group.color);
      (group.rects || []).forEach((rect) => drawUvRect(grid, rect, group.color));
    }
  });

  if (state.previewRect) {
    drawUvRect(grid, state.previewRect, "#ffffff", true);
  }

  if (state.quadClicks.length) {
    ctx.save();
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
    ctx.lineWidth = 2;
    drawPolygon(state.quadClicks, state.quadClicks.length === 4);
    ctx.restore();
  }

  if (state.ellipsePreview) {
    drawEllipseGroup(grid, { ellipse: state.ellipsePreview, color: "#ffffff" }, true);
  }

  if (state.curvePreview) {
    drawCurveGroup(grid, { curve: state.curvePreview, color: "#ffffff" }, true);
  }

  drawShapeHandles(grid);

  if (state.hoverCell && state.mode !== "align" && state.mode !== "corner" && state.mode !== "quad" && state.mode !== "ellipse") {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
    drawPolygon(cellPolygon(grid, state.hoverCell), false);
  }

  ctx.restore();
}

function drawAlignPreview() {
  if (!state.alignPreview) return;
  const { start, end } = state.alignPreview;
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
  ctx.setLineDash([8, 5]);
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, width, height);
  ctx.restore();
}

function drawCornerMarkers() {
  if (!state.image) return;
  const saved = state.gridCorners || [];
  const active = state.cornerClicks || [];
  const points = [...saved, ...active].map(imageToCanvasPoint);
  const labels = ["TL", "TR", "BR", "BL"];

  ctx.save();
  points.forEach((point, index) => {
    ctx.fillStyle = index < saved.length ? "#e24d2e" : "#32b884";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "12px Segoe UI, Arial";
    ctx.fillText(labels[index] || String(index + 1), point.x + 8, point.y - 8);
  });
  ctx.restore();
}

function draw() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);

  if (!state.image) return;
  const bounds = imageBounds();
  const grid = gridBounds();
  const cx = rect.width / 2;
  const cy = rect.height / 2;
  ctx.save();
  ctx.translate(state.view.offsetX + cx, state.view.offsetY + cy);
  ctx.rotate(state.view.rotation);
  ctx.scale(state.view.scale, state.view.scale);
  ctx.translate(-cx, -cy);
  drawImage(bounds);
  drawGrid(grid);
  drawSelection(grid);
  drawAlignPreview();
  drawCornerMarkers();
  ctx.restore();
}

function renderGroupList() {
  if (!state.groups.length) {
    outputs.groups.innerHTML = '<div class="empty-groups">No groups selected</div>';
    return;
  }

  const groups = nonEmptyGroups();
  if (!groups.length) {
    outputs.groups.innerHTML = '<div class="empty-groups">No selected cells yet</div>';
    return;
  }

  outputs.groups.innerHTML = groups
    .map((group, index) => {
      const stats = statsForGroup(group);
      const groupMetric =
        group.type === "quad"
          ? `${formatNumber(stats.width)}m x ${formatNumber(stats.height)}m, ${formatNumber(stats.area)} m2`
          : group.type === "ellipse"
            ? `Ellipse ${formatNumber(stats.width)}m x ${formatNumber(stats.height)}m, ${formatNumber(stats.area)} m2`
            : group.type === "curve"
              ? `${(group.curve?.type || "curve").replace("-", " ")} ${formatNumber(stats.width)}m x ${formatNumber(stats.height)}m, ${formatNumber(stats.area)} m2`
            : `${formatNumber(stats.area)} m2 selected, ${formatNumber(stats.width)}m x ${formatNumber(stats.height)}m span`;
      return `
        <div class="group-item ${group.id === state.selectedGroupId ? "selected" : ""}" data-select-group="${group.id}">
          <span class="group-color" style="background:${group.color}"></span>
          <span><strong>${group.label}</strong><span class="group-metric">${groupMetric}</span></span>
          <select class="category-select" data-category-group="${group.id}" aria-label="Quantity category">
            ${["flooring", "fabric", "led", "trim", "barrier", "other"].map((category) => `<option value="${category}" ${group.category === category ? "selected" : ""}>${category}</option>`).join("")}
          </select>
          <button type="button" data-delete-group="${group.id}" aria-label="Delete group ${index + 1}">x</button>
        </div>
      `;
    })
    .join("");
}

function updateOutput() {
  const stats = selectionStats();
  const cellSize = gridConfig().cellSize;
  const wastePercent = clamp(numberValue(inputs.waste, 0), 0, 100);
  const wasteArea = stats.area * (1 + wastePercent / 100);
  outputs.areaLabel.textContent = state.scaleMode === "elevation" ? "Selected surface" : "Selected area";
  outputs.widthLabel.textContent = state.scaleMode === "elevation" ? "Width" : "Total span width";
  outputs.heightLabel.textContent = state.scaleMode === "elevation" ? "Height" : "Total span height";
  outputs.boxAreaLabel.textContent = state.scaleMode === "elevation" ? "Full rectangle" : "Bounding area";
  outputs.wasteLabel.textContent = `With ${formatNumber(wastePercent)}% waste`;
  outputs.cellScale.textContent = `${formatNumber(cellSize)}m x ${formatNumber(cellSize)}m`;
  outputs.groupCount.textContent = nonEmptyGroups().length;
  outputs.cells.textContent = formatCount(stats.count);
  outputs.area.textContent = formatNumber(stats.area);
  outputs.width.textContent = formatNumber(stats.width);
  outputs.height.textContent = formatNumber(stats.height);
  outputs.boxArea.textContent = formatNumber(stats.boxArea);
  outputs.perimeter.textContent = formatNumber(stats.perimeter);
  outputs.wasteArea.textContent = formatNumber(wasteArea);
  renderGroupList();
  renderQuantitySummary();
}

function renderQuantitySummary() {
  const totals = new Map();
  nonEmptyGroups().forEach((group) => {
    const category = group.category || "other";
    const stats = statsForGroup(group);
    const current = totals.get(category) || { area: 0, perimeter: 0, count: 0 };
    current.area += stats.area;
    current.perimeter += stats.perimeter;
    current.count += 1;
    totals.set(category, current);
  });
  if (!totals.size) {
    outputs.quantitySummary.textContent = "No quantities yet";
    return;
  }
  outputs.quantitySummary.innerHTML = [...totals.entries()]
    .map(([category, item]) => `<div>${category}: ${formatNumber(item.area)} m2, ${formatNumber(item.perimeter)} m, ${item.count} item${item.count === 1 ? "" : "s"}</div>`)
    .join("");
}

function setScaleMode(mode) {
  state.scaleMode = mode;
  buttons.planScale.classList.toggle("active", mode === "plan");
  buttons.elevScale.classList.toggle("active", mode === "elevation");
  updateOutput();
}

function setMode(mode) {
  state.mode = mode;
  if (mode !== "quad" && mode !== "ellipse" && mode !== "curve") state.pendingShapeGroup = false;
  buttons.rect.classList.toggle("active", mode === "rect");
  buttons.paint.classList.toggle("active", mode === "paint");
  buttons.align.classList.toggle("active", mode === "align");
  buttons.corner.classList.toggle("active", mode === "corner");
  buttons.pan.classList.toggle("active", mode === "pan");
  buttons.quad.classList.toggle("active", mode === "quad");
  buttons.ellipse.classList.toggle("active", mode === "ellipse");
  buttons.curve.classList.toggle("active", mode === "curve");
  buttons.editShape.classList.toggle("active", mode === "edit");
  if (mode === "pan") canvas.style.cursor = "grab";
  else if (mode === "edit") canvas.style.cursor = "pointer";
  else canvas.style.cursor = mode === "align" || mode === "corner" || mode === "quad" || mode === "ellipse" || mode === "curve" ? "copy" : "crosshair";
  updateCornerStatus();
  draw();
  updateOutput();
}

function setGridPreset({ cols, rows, left, top, right, bottom }) {
  inputs.cols.value = cols;
  inputs.rows.value = rows;
  inputs.cellSize.value = 1;
  inputs.left.value = left;
  inputs.top.value = top;
  inputs.right.value = right;
  inputs.bottom.value = bottom;
  state.gridCorners = null;
  state.cornerClicks = [];
  updateCornerStatus();
}

function setFitStatus(message) {
  outputs.fitStatus.textContent = message;
}

function updateCornerStatus() {
  if (state.gridCorners) {
    outputs.cornerStatus.textContent = "4 corners calibrated";
  } else if (state.mode === "corner") {
    outputs.cornerStatus.textContent = `Click ${["top-left", "top-right", "bottom-right", "bottom-left"][state.cornerClicks.length] || "done"}`;
  } else {
    outputs.cornerStatus.textContent = "Corners not set";
  }
}

function setGridCornersFromImageRect(left, top, right, bottom) {
  state.gridCorners = [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
  state.cornerClicks = [];
  updateCornerStatus();
}

function syncCropInputsFromCorners() {
  if (!state.gridCorners || !state.image) return;
  const xs = state.gridCorners.map((point) => point.x);
  const ys = state.gridCorners.map((point) => point.y);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  inputs.left.value = ((left / state.image.naturalWidth) * 100).toFixed(1);
  inputs.top.value = ((top / state.image.naturalHeight) * 100).toFixed(1);
  inputs.right.value = (((state.image.naturalWidth - right) / state.image.naturalWidth) * 100).toFixed(1);
  inputs.bottom.value = (((state.image.naturalHeight - bottom) / state.image.naturalHeight) * 100).toFixed(1);
}

function groupLineRuns(scores, threshold) {
  const runs = [];
  let start = -1;
  let sum = 0;
  let weight = 0;

  scores.forEach((score, index) => {
    if (score >= threshold) {
      if (start === -1) start = index;
      sum += index * score;
      weight += score;
    } else if (start !== -1) {
      runs.push({ start, end: index - 1, center: sum / Math.max(1, weight), score: weight });
      start = -1;
      sum = 0;
      weight = 0;
    }
  });

  if (start !== -1) {
    runs.push({ start, end: scores.length - 1, center: sum / Math.max(1, weight), score: weight });
  }

  return runs;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.floor(sorted.length / 2)];
}

function lineCentersFromScores(scores, preferredCount = 0) {
  const max = Math.max(...scores);
  if (max <= 0) return [];
  const thresholds = [0.42, 0.28, 0.18, 0.12, 0.08, 0.05];
  let best = [];
  let bestScore = -Infinity;

  thresholds.forEach((threshold) => {
    const centers = groupLineRuns(scores, max * threshold)
      .filter((run) => run.end - run.start <= 8)
      .sort((a, b) => a.center - b.center)
      .map((run) => run.center);

    if (centers.length < 3) return;
    const spacing = estimateGridSpacing(centers);
    const regularDiffs = spacing
      ? centers.slice(1).map((center, index) => center - centers[index]).filter((diff) => diff >= spacing * 0.72 && diff <= spacing * 1.35).length
      : 0;
    const countScore = preferredCount
      ? -Math.abs(centers.length - preferredCount) * 6 + (centers.length >= preferredCount * 0.85 ? 60 : 0)
      : centers.length;
    const score = regularDiffs * 12 + countScore - threshold * 8;
    if (score > bestScore) {
      bestScore = score;
      best = centers;
    }
  });

  const centers = best;
  if (centers.length < 3) return centers;
  const spacing = estimateGridSpacing(centers);
  if (!spacing) return centers;

  return centers.filter((center, index) => {
    if (index === 0 || index === centers.length - 1) return true;
    const prev = center - centers[index - 1];
    const next = centers[index + 1] - center;
    return prev > spacing * 0.45 || next > spacing * 0.45;
  });
}

function scoreGridPixels(data, width, height, range) {
  const colScores = new Array(width).fill(0);
  const rowScores = new Array(height).fill(0);
  const xStart = Math.max(0, Math.floor(range?.xStart ?? 0));
  const xEnd = Math.min(width, Math.ceil(range?.xEnd ?? width));
  const yStart = Math.max(0, Math.floor(range?.yStart ?? 0));
  const yEnd = Math.min(height, Math.ceil(range?.yEnd ?? height));
  // Two contrast distances: d1 catches fine structure, d2 catches broad shapes.
  // Both must see dark neighbors for a pixel to be treated as a true grid line.
  // min(contrast_d1, contrast_d2) is high only when the pixel is isolated on both scales.
  const d1 = 3, d2 = 7;

  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const bright = (r + g + b) / 3;
      const colorSpread = Math.max(r, g, b) - Math.min(r, g, b);
      const neutral = colorSpread < 95;
      // Lower floor (85 vs 95) captures slightly dim/anti-aliased grid lines.
      const lineStrength = bright > 85 && neutral ? bright - 70 : 0;
      if (lineStrength > 0) {
        // Horizontal contrast for colScores (vertical line detection).
        let colWeight = 1;
        if (x >= d2 && x < width - d2) {
          const l1 = (y * width + x - d1) * 4, r1 = (y * width + x + d1) * 4;
          const l2 = (y * width + x - d2) * 4, r2 = (y * width + x + d2) * 4;
          const hc1 = Math.max(0, bright - Math.max((data[l1] + data[l1 + 1] + data[l1 + 2]) / 3, (data[r1] + data[r1 + 1] + data[r1 + 2]) / 3));
          const hc2 = Math.max(0, bright - Math.max((data[l2] + data[l2 + 1] + data[l2 + 2]) / 3, (data[r2] + data[r2 + 1] + data[r2 + 2]) / 3));
          const hContrast = Math.min(hc1, hc2);
          colWeight = hContrast > 15 ? 2.5 + hContrast / 50 : 0.15;
        } else if (x >= d1 && x < width - d1) {
          const l1 = (y * width + x - d1) * 4, r1 = (y * width + x + d1) * 4;
          const hc1 = Math.max(0, bright - Math.max((data[l1] + data[l1 + 1] + data[l1 + 2]) / 3, (data[r1] + data[r1 + 1] + data[r1 + 2]) / 3));
          colWeight = hc1 > 15 ? 2.0 : 0.2;
        }

        // Vertical contrast for rowScores (horizontal line detection).
        let rowWeight = 1;
        if (y >= d2 && y < height - d2) {
          const t1 = ((y - d1) * width + x) * 4, b1 = ((y + d1) * width + x) * 4;
          const t2 = ((y - d2) * width + x) * 4, b2 = ((y + d2) * width + x) * 4;
          const vc1 = Math.max(0, bright - Math.max((data[t1] + data[t1 + 1] + data[t1 + 2]) / 3, (data[b1] + data[b1 + 1] + data[b1 + 2]) / 3));
          const vc2 = Math.max(0, bright - Math.max((data[t2] + data[t2 + 1] + data[t2 + 2]) / 3, (data[b2] + data[b2 + 1] + data[b2 + 2]) / 3));
          const vContrast = Math.min(vc1, vc2);
          rowWeight = vContrast > 15 ? 2.5 + vContrast / 50 : 0.15;
        } else if (y >= d1 && y < height - d1) {
          const t1 = ((y - d1) * width + x) * 4, b1 = ((y + d1) * width + x) * 4;
          const vc1 = Math.max(0, bright - Math.max((data[t1] + data[t1 + 1] + data[t1 + 2]) / 3, (data[b1] + data[b1 + 1] + data[b1 + 2]) / 3));
          rowWeight = vc1 > 15 ? 2.0 : 0.2;
        }

        colScores[x] += lineStrength * colWeight;
        rowScores[y] += lineStrength * rowWeight;
      }
    }
  }

  return { colScores, rowScores };
}

function localScore(scores, position) {
  const center = Math.round(position);
  let best = 0;
  for (let index = center - 3; index <= center + 3; index += 1) {
    if (index >= 0 && index < scores.length) best = Math.max(best, scores[index]);
  }
  return best;
}

function uniformLineSeries(centers, scores) {
  if (centers.length < 4) return centers;
  const diffs = centers.slice(1).map((value, index) => value - centers[index]).filter((diff) => diff > 3);
  const spacing = median(diffs.filter((diff) => diff < median(diffs) * 1.8));
  if (!spacing) return centers;

  const fullSize = scores.length;
  const weakLineThreshold = Math.max(...scores) * 0.08;
  const first = centers[0];
  const last = centers.at(-1);
  const extended = [...centers];

  for (let value = first - spacing; value >= 0; value -= spacing) {
    if (localScore(scores, value) < weakLineThreshold) break;
    extended.unshift(value);
  }

  for (let value = last + spacing; value <= fullSize - 1; value += spacing) {
    if (localScore(scores, value) < weakLineThreshold) break;
    extended.push(value);
  }

  return extended;
}

function estimateGridSpacing(lines) {
  if (lines.length < 3) return 0;
  const diffs = lines.slice(1).map((value, index) => value - lines[index]).filter((diff) => diff > 3);
  if (!diffs.length) return 0;
  const rough = median(diffs);
  const regularDiffs = diffs.filter((diff) => diff >= rough * 0.72 && diff <= rough * 1.35);
  return median(regularDiffs.length ? regularDiffs : diffs);
}

function fittedLineSeries(lines, scores, spacing) {
  if (!spacing) return lines;
  const maxScore = Math.max(...scores);
  const threshold = maxScore * 0.045;
  const tolerance = Math.max(3, spacing * 0.18);
  let best = [];
  let bestScore = -Infinity;

  lines.forEach((anchor) => {
    const start = anchor - Math.floor(anchor / spacing) * spacing;
    const series = [];
    for (let value = start; value < scores.length; value += spacing) {
      const score = localScore(scores, value);
      if (score >= threshold && lines.some((line) => Math.abs(line - value) <= tolerance)) {
        series.push(value);
      }
    }
    if (series.length < 4) return;
    const lineScore = series.reduce((sum, line) => sum + localScore(scores, line), 0);
    const spanScore = series.at(-1) - series[0];
    const score = series.length * 100000 + spanScore * 8 + lineScore / series.length;
    if (score > bestScore) {
      bestScore = score;
      best = series;
    }
  });

  if (best.length < 4) return lines;
  const first = best[0];
  const last = best.at(-1);
  const cleaned = best.filter((line) => localScore(scores, line) >= threshold);

  for (let value = first - spacing; value >= 0; value -= spacing) {
    if (localScore(scores, value) < threshold) break;
    cleaned.unshift(value);
  }

  for (let value = last + spacing; value <= scores.length - 1; value += spacing) {
    if (localScore(scores, value) < threshold) break;
    cleaned.push(value);
  }

  const complete = [];
  for (let value = cleaned[0]; value <= cleaned.at(-1) + spacing * 0.25; value += spacing) {
    complete.push(value);
  }
  return complete;
}

function filterRegularLines(lines, scores) {
  if (lines.length < 4) return lines;
  const base = estimateGridSpacing(lines);
  if (!base) return lines;
  const fitted = fittedLineSeries(lines, scores, base);
  const threshold = Math.max(...scores) * 0.045;
  return uniformLineSeries(fitted, scores).filter((line) => localScore(scores, line) >= threshold);
}

// Precision refinement: exhaustive (spacing, offset) search ±18% around the estimated
// spacing to eliminate accumulated drift, followed by sub-pixel peak snapping per line
// and outward boundary extension.
function refineGridLines(lines, scores) {
  if (lines.length < 4) return lines;
  const estSpacing = estimateGridSpacing(lines);
  if (!estSpacing || estSpacing < 4) return lines;
  const maxScore = Math.max(...scores);
  if (maxScore <= 0) return lines;

  const minS = estSpacing * 0.82;
  const maxS = estSpacing * 1.18;
  let bestS = estSpacing;
  let bestO = lines[0] % estSpacing;
  let bestVal = -Infinity;

  // Coarse pass: 0.3px spacing step, 0.6px offset step
  for (let s = minS; s <= maxS; s += 0.3) {
    for (let o = 0; o < s; o += 0.6) {
      let val = 0;
      for (let x = o; x < scores.length; x += s) val += localScore(scores, x);
      if (val > bestVal) { bestVal = val; bestS = s; bestO = o; }
    }
  }

  // Fine pass: ±0.15px around winner, 0.05px steps
  const s0 = bestS, o0 = bestO;
  bestVal = -Infinity;
  for (let s = s0 - 0.15; s <= s0 + 0.15; s += 0.05) {
    for (let o = o0 - 0.4; o <= o0 + 0.4; o += 0.08) {
      const off = ((o % s) + s) % s;
      let val = 0;
      for (let x = off; x < scores.length; x += s) val += localScore(scores, x);
      if (val > bestVal) { bestVal = val; bestS = s; bestO = off; }
    }
  }

  const threshold = maxScore * 0.035;

  // Build line series with sub-pixel peak snapping:
  // for each expected position snap to the highest raw score within ±2px.
  const refined = [];
  for (let x = bestO; x < scores.length; x += bestS) {
    let peakPos = x, peakVal = 0;
    for (let dx = -2; dx <= 2; dx += 0.5) {
      const idx = Math.round(x + dx);
      if (idx >= 0 && idx < scores.length && scores[idx] > peakVal) {
        peakVal = scores[idx];
        peakPos = x + dx;
      }
    }
    if (peakVal >= threshold) refined.push(peakPos);
  }

  // Extend outward along the series beyond the first/last detected position.
  if (refined.length >= 2) {
    for (let x = refined[0] - bestS; x >= 0; x -= bestS) {
      if (localScore(scores, x) >= threshold) refined.unshift(x); else break;
    }
    for (let x = refined.at(-1) + bestS; x < scores.length; x += bestS) {
      if (localScore(scores, x) >= threshold) refined.push(x); else break;
    }
  }

  return refined.length >= lines.length - 2 ? refined : lines;
}

// Fit a line series at a fixed spacing by finding the offset that maximises total score.
function fitLinesAtSpacing(spacing, scores) {
  if (spacing < 2) return [];
  let bestOffset = 0, bestVal = -Infinity;
  const step = Math.max(0.25, spacing / 200);
  for (let o = 0; o < spacing; o += step) {
    let val = 0;
    for (let pos = o; pos < scores.length; pos += spacing) val += localScore(scores, pos);
    if (val > bestVal) { bestVal = val; bestOffset = o; }
  }
  const lines = [];
  for (let pos = bestOffset; pos < scores.length; pos += spacing) lines.push(pos);
  return lines;
}

// When one axis has drifted spacing (≠ the other axis for square cells), re-derive it.
function enforceSquareCells(xLines, yLines, colScores, rowScores) {
  const colSpacing = estimateGridSpacing(xLines);
  const rowSpacing = estimateGridSpacing(yLines);
  if (!colSpacing || !rowSpacing) return { xLines, yLines };
  const ratio = rowSpacing / colSpacing;
  // If spacings agree within 35% the grid is already square-ish — keep both.
  if (ratio >= 0.65 && ratio <= 1.55) return { xLines, yLines };
  // Columns are typically more reliable (vertical lines run full image height).
  // Re-fit rows at column spacing.
  const refitted = fitLinesAtSpacing(colSpacing, rowScores);
  if (refitted.length >= 3) return { xLines, yLines: refitted };
  return { xLines, yLines };
}

function detectGridWithRange(data, width, height, scale, range, expectedCols, expectedRows) {
  const scan = scoreGridPixels(data, width, height, range);
  let xLines = refineGridLines(filterRegularLines(lineCentersFromScores(scan.colScores, expectedCols + 1), scan.colScores), scan.colScores);
  let yLines = refineGridLines(filterRegularLines(lineCentersFromScores(scan.rowScores, expectedRows + 1), scan.rowScores), scan.rowScores);
  ({ xLines, yLines } = enforceSquareCells(xLines, yLines, scan.colScores, scan.rowScores));
  if (xLines.length < 4 || yLines.length < 4) return null;
  const score =
    xLines.reduce((sum, line) => sum + localScore(scan.colScores, line), 0) / xLines.length +
    yLines.reduce((sum, line) => sum + localScore(scan.rowScores, line), 0) / yLines.length +
    Math.min(xLines.length, 80) * 80 +
    Math.min(yLines.length, 60) * 80;
  return {
    left: xLines[0] / scale,
    right: xLines.at(-1) / scale,
    top: yLines[0] / scale,
    bottom: yLines.at(-1) / scale,
    cols: Math.max(1, xLines.length - 1),
    rows: Math.max(1, yLines.length - 1),
    score,
  };
}

function detectGridTwoAxis(data, width, height, scale, expectedCols, expectedRows) {
  const verticalScan = scoreGridPixels(data, width, height, {
    yStart: height * 0.42,
    yEnd: height * 0.96,
  });
  const horizontalScan = scoreGridPixels(data, width, height, {
    xStart: width * 0.02,
    xEnd: width * 0.98,
  });
  let xLines = refineGridLines(filterRegularLines(lineCentersFromScores(verticalScan.colScores, expectedCols + 1), verticalScan.colScores), verticalScan.colScores);
  let yLines = refineGridLines(filterRegularLines(lineCentersFromScores(horizontalScan.rowScores, expectedRows + 1), horizontalScan.rowScores), horizontalScan.rowScores);
  ({ xLines, yLines } = enforceSquareCells(xLines, yLines, verticalScan.colScores, horizontalScan.rowScores));
  if (xLines.length < 4 || yLines.length < 4) return null;
  const score =
    xLines.reduce((sum, line) => sum + localScore(verticalScan.colScores, line), 0) / xLines.length +
    yLines.reduce((sum, line) => sum + localScore(horizontalScan.rowScores, line), 0) / yLines.length +
    Math.min(xLines.length, 80) * 120 +
    Math.min(yLines.length, 60) * 120;
  return {
    left: xLines[0] / scale,
    right: xLines.at(-1) / scale,
    top: yLines[0] / scale,
    bottom: yLines.at(-1) / scale,
    cols: Math.max(1, xLines.length - 1),
    rows: Math.max(1, yLines.length - 1),
    score,
  };
}

function detectGridFromImage() {
  if (!state.image) return null;
  const offscreen = document.createElement("canvas");
  const maxWidth = 1800;
  const scale = Math.min(1, maxWidth / state.image.naturalWidth);
  offscreen.width = Math.round(state.image.naturalWidth * scale);
  offscreen.height = Math.round(state.image.naturalHeight * scale);
  const offCtx = offscreen.getContext("2d", { willReadFrequently: true });
  offCtx.drawImage(state.image, 0, 0, offscreen.width, offscreen.height);

  const { data, width, height } = offCtx.getImageData(0, 0, offscreen.width, offscreen.height);
  const ranges = [
    {},
    { xStart: width * 0.02, xEnd: width * 0.98, yStart: height * 0.02, yEnd: height * 0.98 },
    { xStart: width * 0.02, xEnd: width * 0.98, yStart: height * 0.18, yEnd: height * 0.92 },
    { xStart: width * 0.02, xEnd: width * 0.98, yStart: height * 0.35, yEnd: height * 0.98 },
    { xStart: width * 0.02, xEnd: width * 0.98, yStart: height * 0.02, yEnd: height * 0.65 },
    // Extra bands to improve coverage for off-centre and tightly-cropped grids.
    { xStart: width * 0.05, xEnd: width * 0.95, yStart: height * 0.10, yEnd: height * 0.90 },
    { xStart: width * 0.10, xEnd: width * 0.90, yStart: height * 0.05, yEnd: height * 0.95 },
    { xStart: width * 0.02, xEnd: width * 0.98, yStart: height * 0.25, yEnd: height * 0.75 },
    { xStart: width * 0.15, xEnd: width * 0.85, yStart: height * 0.02, yEnd: height * 0.98 },
  ];
  const expectedCols = Math.max(1, Math.round(numberValue(inputs.cols, 58)));
  const expectedRows = Math.max(1, Math.round(numberValue(inputs.rows, 20)));
  const candidates = [
    detectGridTwoAxis(data, width, height, scale, expectedCols, expectedRows),
    ...ranges.map((range) => detectGridWithRange(data, width, height, scale, range, expectedCols, expectedRows)),
  ].filter(Boolean);
  if (!candidates.length) return null;
  candidates.forEach((candidate) => {
    const countPenalty = (Math.abs(candidate.cols - expectedCols) + Math.abs(candidate.rows - expectedRows)) * 16000;
    const area = Math.max(1, (candidate.right - candidate.left) * (candidate.bottom - candidate.top));
    const areaBonus = Math.min(area / (state.image.naturalWidth * state.image.naturalHeight), 1) * 1200;
    candidate.fitScore = candidate.score + areaBonus - countPenalty;
  });
  candidates.sort((a, b) => b.fitScore - a.fitScore);
  const best = candidates[0];
  const countDiff = Math.abs(best.cols - expectedCols) + Math.abs(best.rows - expectedRows);
  const tooDifferent = countDiff > Math.max(4, Math.min(expectedCols, expectedRows) * 0.25);
  return tooDifferent ? { ...best, uncertain: true } : best;
}

function applyDetectedGrid(detected, { updateCounts = false } = {}) {
  const imgWidth = state.image.naturalWidth;
  const imgHeight = state.image.naturalHeight;
  if (updateCounts) {
    inputs.cols.value = detected.cols;
    inputs.rows.value = detected.rows;
  }
  inputs.left.value = ((detected.left / imgWidth) * 100).toFixed(1);
  inputs.top.value = ((detected.top / imgHeight) * 100).toFixed(1);
  inputs.right.value = (((imgWidth - detected.right) / imgWidth) * 100).toFixed(1);
  inputs.bottom.value = (((imgHeight - detected.bottom) / imgHeight) * 100).toFixed(1);
  setGridCornersFromImageRect(detected.left, detected.top, detected.right, detected.bottom);
}

function autoFitGrid({ updateCounts = false, allowUncertain = false } = {}) {
  const detected = detectGridFromImage();
  if (!detected || !state.image) {
    setFitStatus("Auto fit could not find enough grid lines. Use Align.");
    return false;
  }
  if (detected.uncertain) {
    if (allowUncertain) {
      applyDetectedGrid(detected, { updateCounts });
      setFitStatus(updateCounts
        ? `Auto fit: detected image grid ${detected.cols} x ${detected.rows}.`
        : `Auto fit: grid box aligned to detected ${detected.cols} x ${detected.rows}.`);
      fitViewToGrid();
      draw();
      updateOutput();
      return true;
    }
    setFitStatus(`Auto fit uncertain: detected ${detected.cols} x ${detected.rows}, current scale is ${numberValue(inputs.cols, 0)} x ${numberValue(inputs.rows, 0)}. Click Auto fit again with updated rows/columns, or use Corners.`);
    return false;
  }

  applyDetectedGrid(detected, { updateCounts });
  const countNote = detected.cols !== numberValue(inputs.cols, detected.cols) || detected.rows !== numberValue(inputs.rows, detected.rows)
    ? `, detected ${detected.cols} x ${detected.rows} lines`
    : "";
  setFitStatus(updateCounts ? `Auto fit: ${detected.cols} x ${detected.rows} grid` : `Auto fit: grid box aligned${countNote}`);
  fitViewToGrid();
  draw();
  updateOutput();
  return true;
}

function nudgeInput(input, delta) {
  const value = clamp(numberValue(input, 0) + delta, 0, 50);
  input.value = value.toFixed(1).replace(".0", "");
  state.gridCorners = null;
  state.cornerClicks = [];
  updateCornerStatus();
  draw();
  updateOutput();
}

function applyAlignPreview() {
  if (!state.alignPreview || !state.image) return;
  const bounds = imageBounds();
  const start = state.alignPreview.start;
  const end = state.alignPreview.end;
  const x1 = clamp(Math.min(start.x, end.x), bounds.x, bounds.x + bounds.width);
  const y1 = clamp(Math.min(start.y, end.y), bounds.y, bounds.y + bounds.height);
  const x2 = clamp(Math.max(start.x, end.x), bounds.x, bounds.x + bounds.width);
  const y2 = clamp(Math.max(start.y, end.y), bounds.y, bounds.y + bounds.height);

  if (x2 - x1 < 10 || y2 - y1 < 10) {
    setFitStatus("Align area too small. Drag around the full grid box.");
    return;
  }
  const topLeft = canvasToImagePoint({ x: x1, y: y1 });
  const bottomRight = canvasToImagePoint({ x: x2, y: y2 });
  setGridCornersFromImageRect(topLeft.x, topLeft.y, bottomRight.x, bottomRight.y);
  syncCropInputsFromCorners();
  setFitStatus("Align applied. Grid box updated.");
  updateCornerStatus();
  draw();
  updateOutput();
}

inputs.image.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    setUploadStatus("Please choose an image file");
    return;
  }
  const url = URL.createObjectURL(file);
  setUploadStatus(`Loading ${file.name}`);
  setMode("rect");
  let imageRecord = { path: url, originalName: file.name, type: file.type, size: file.size };
  try {
    const formData = new FormData();
    formData.append("files", file);
    const response = await fetch("/api/upload", { method: "POST", body: formData });
    const payload = await response.json();
    if (response.ok && payload?.files?.[0]?.path) {
      imageRecord = payload.files[0];
    }
  } catch {
    imageRecord.uploadWarning = "Image will preview in this browser but was not uploaded for persistence.";
  }
  state.imageRecord = imageRecord;
  loadImage(url, { revokeUrl: url, label: `Uploaded: ${file.name}`, imageRecord });
});

buttons.upload.addEventListener("click", () => {
  inputs.image.value = "";
  inputs.image.click();
});

buttons.autoFit.addEventListener("click", () => autoFitGrid({ updateCounts: true, allowUncertain: true }));
buttons.planScale.addEventListener("click", () => setScaleMode("plan"));
buttons.elevScale.addEventListener("click", () => setScaleMode("elevation"));
buttons.zoomOut.addEventListener("click", () => setZoom(state.view.scale / 1.25));
buttons.zoomIn.addEventListener("click", () => setZoom(state.view.scale * 1.25));
buttons.zoomFit.addEventListener("click", () => {
  resetView();
  draw();
});
buttons.rotateLeft.addEventListener("click", () => setRotation(state.view.rotation - (5 * Math.PI) / 180));
buttons.rotateRight.addEventListener("click", () => setRotation(state.view.rotation + (5 * Math.PI) / 180));
buttons.rotateReset.addEventListener("click", () => setRotation(0));
buttons.pan.addEventListener("click", () => setMode("pan"));
buttons.rect.addEventListener("click", () => {
  setMode("rect");
  if (buttons.groupActions) buttons.groupActions.open = true;
});
buttons.paint.addEventListener("click", () => setMode("paint"));
buttons.align.addEventListener("click", () => setMode("align"));
buttons.corner.addEventListener("click", () => setMode("corner"));
buttons.quad.addEventListener("click", () => {
  state.quadClicks = [];
  setMode("quad");
  if (activePaintGroup()) {
    preparePendingShapeGroup("quad");
  } else {
    setFitStatus("4pt measure: click object corners TL, TR, BR, BL.");
  }
});
buttons.ellipse.addEventListener("click", () => {
  state.ellipsePreview = null;
  setMode("ellipse");
  if (activePaintGroup()) {
    preparePendingShapeGroup("ellipse");
  } else {
    setFitStatus("Ellipse: drag the outside box around the circle.");
  }
});
buttons.curve.addEventListener("click", () => {
  state.curvePreview = null;
  setMode("curve");
  if (activePaintGroup()) {
    preparePendingShapeGroup("curve");
  } else {
    setFitStatus("Curve: choose type, then drag the curve box.");
  }
});
buttons.editShape.addEventListener("click", () => {
  setMode("edit");
  setFitStatus("Edit: click a 4pt, ellipse, or curve shape, then drag handles or drag inside to move.");
});
buttons.startCorners.addEventListener("click", () => {
  state.cornerClicks = [];
  state.gridCorners = null;
  setMode("corner");
});
buttons.resetCorners.addEventListener("click", () => {
  state.cornerClicks = [];
  state.gridCorners = null;
  updateCornerStatus();
  draw();
});
buttons.newPaint.addEventListener("click", () => {
  if (state.mode === "quad" || state.mode === "ellipse" || state.mode === "curve") {
    preparePendingShapeGroup(state.mode);
  } else {
    setMode(state.mode === "rect" ? "rect" : "paint");
    createPaintGroup();
    setFitStatus("Group ready. Select grid cells now. Use Group actions > Add group for a separate group.");
  }
  updateOutput();
});
buttons.undo.addEventListener("click", () => {
  const removed = state.groups.pop();
  if (removed?.id === state.selectedGroupId) state.selectedGroupId = null;
  state.activePaintGroupId = state.groups.findLast((group) => group.type === "paint")?.id || null;
  draw();
  updateOutput();
});
buttons.clear.addEventListener("click", () => {
  clearGroups();
  draw();
  updateOutput();
});

outputs.groups.addEventListener("click", (event) => {
  if (event.target.closest("[data-category-group]")) return;
  const deleteButton = event.target.closest("[data-delete-group]");
  if (deleteButton) {
    const id = deleteButton.getAttribute("data-delete-group");
    state.groups = state.groups.filter((group) => group.id !== id);
    if (state.activePaintGroupId === id) {
      state.activePaintGroupId = state.groups.findLast((group) => group.type === "paint")?.id || null;
    }
    if (state.selectedGroupId === id) state.selectedGroupId = null;
  } else {
    const item = event.target.closest("[data-select-group]");
    if (!item) return;
    state.selectedGroupId = item.getAttribute("data-select-group");
    const group = selectedGroup();
    if (group?.type === "paint") {
      state.activePaintGroupId = group.id;
      setMode("paint");
      setFitStatus("Group selected. Paint or use Group select to add more cells.");
    } else if (group?.type === "quad" || group?.type === "ellipse" || group?.type === "curve") {
      setMode("edit");
      setFitStatus("Edit: drag handles to adjust shape.");
    }
  }
  draw();
  updateOutput();
});

outputs.groups.addEventListener("change", (event) => {
  const select = event.target.closest("[data-category-group]");
  if (!select) return;
  const group = state.groups.find((item) => item.id === select.getAttribute("data-category-group"));
  if (group) group.category = select.value;
  updateOutput();
});

nudgeButtons.topUp.addEventListener("click", () => nudgeInput(inputs.top, -0.1));
nudgeButtons.topDown.addEventListener("click", () => nudgeInput(inputs.top, 0.1));
nudgeButtons.leftUp.addEventListener("click", () => nudgeInput(inputs.left, -0.1));
nudgeButtons.leftDown.addEventListener("click", () => nudgeInput(inputs.left, 0.1));
nudgeButtons.rightUp.addEventListener("click", () => nudgeInput(inputs.right, -0.1));
nudgeButtons.rightDown.addEventListener("click", () => nudgeInput(inputs.right, 0.1));
nudgeButtons.bottomUp.addEventListener("click", () => nudgeInput(inputs.bottom, -0.1));
nudgeButtons.bottomDown.addEventListener("click", () => nudgeInput(inputs.bottom, 0.1));

Object.values(inputs).forEach((input) => {
  if (input.type !== "file" && input.tagName !== "SELECT") {
    input.addEventListener("input", () => {
      if (input !== inputs.cols && input !== inputs.rows && input !== inputs.cellSize) {
        state.gridCorners = null;
        state.cornerClicks = [];
        updateCornerStatus();
      }
      draw();
      updateOutput();
    });
  }
});

inputs.waste.addEventListener("change", () => updateOutput());

canvas.addEventListener("pointerdown", (event) => {
  if (state.mode === "pan") {
    const point = screenPoint(event);
    canvas.setPointerCapture(event.pointerId);
    state.view.panStart = {
      x: point.x,
      y: point.y,
      offsetX: state.view.offsetX,
      offsetY: state.view.offsetY,
    };
    canvas.style.cursor = "grabbing";
    return;
  }

  const point = canvasPoint(event);
  const grid = gridBounds();
  if (state.mode === "edit") {
    if (startShapeEdit(point)) {
      canvas.setPointerCapture(event.pointerId);
      setFitStatus("Edit: shape selected. Drag handles or inside the shape.");
    } else {
      setFitStatus("Edit: no shape selected. Click a 4pt or ellipse shape.");
    }
    draw();
    updateOutput();
    return;
  }

  if (state.mode === "rect") {
    const uv = pointToGridUv(grid, point);
    if (!uv) return;
    ensurePaintGroup();
    canvas.setPointerCapture(event.pointerId);
    state.dragStart = uv;
    state.previewRect = normalizeUvRect(uv, uv);
    draw();
    updateOutput();
    return;
  }

  if (state.mode === "ellipse") {
    if (!state.pendingShapeGroup) {
      preparePendingShapeGroup("ellipse");
    }
    const uv = pointToGridUv(grid, point);
    if (!uv) return;
    canvas.setPointerCapture(event.pointerId);
    state.dragStart = uv;
    state.ellipsePreview = normalizeUvRect(uv, uv);
    draw();
    updateOutput();
    return;
  }

  if (state.mode === "curve") {
    if (!state.pendingShapeGroup) {
      preparePendingShapeGroup("curve");
    }
    const uv = pointToGridUv(grid, point);
    if (!uv) return;
    canvas.setPointerCapture(event.pointerId);
    state.dragStart = uv;
    state.curvePreview = { ...normalizeUvRect(uv, uv), type: inputs.curveType.value };
    draw();
    updateOutput();
    return;
  }

  if (state.mode === "quad") {
    if (!state.pendingShapeGroup) {
      preparePendingShapeGroup("quad");
    }
    if (!pointToGridUv(grid, point)) return;
    state.quadClicks.push(point);
    if (state.quadClicks.length === 4) {
      addQuadGroup([...state.quadClicks]);
      state.quadClicks = [];
      setFitStatus("4pt measure added. Use Group actions > Add group to measure another 4pt shape.");
    }
    draw();
    updateOutput();
    return;
  }

  if (state.mode === "corner") {
    if (!state.image) return;
    const bounds = imageBounds();
    const insideImage =
      point.x >= bounds.x && point.x <= bounds.x + bounds.width && point.y >= bounds.y && point.y <= bounds.y + bounds.height;
    if (!insideImage) return;
    state.cornerClicks.push(canvasToImagePoint(point));
    if (state.cornerClicks.length === 4) {
      state.gridCorners = [...state.cornerClicks];
      state.cornerClicks = [];
      syncCropInputsFromCorners();
      setFitStatus("Corner calibration active");
    }
    updateCornerStatus();
    draw();
    updateOutput();
    return;
  }

  const cell = pointToCell(point);
  if (!cell && state.mode !== "align") return;
  canvas.setPointerCapture(event.pointerId);
  state.dragStart = state.mode === "align" ? point : cell;

  if (state.mode === "paint") {
    const group = ensurePaintGroup();
    const key = cellKey(cell);
    state.paintingValue = !group.cells.has(key);
    if (state.paintingValue) group.cells.add(key);
    else group.cells.delete(key);
  } else if (state.mode === "align") {
    state.alignPreview = { start: point, end: point };
  }

  draw();
  updateOutput();
});

canvas.addEventListener("pointermove", (event) => {
  if (state.mode === "pan" && state.view.panStart) {
    const point = screenPoint(event);
    state.view.offsetX = state.view.panStart.offsetX + point.x - state.view.panStart.x;
    state.view.offsetY = state.view.panStart.offsetY + point.y - state.view.panStart.y;
    draw();
    return;
  }

  const point = canvasPoint(event);
  const cell = pointToCell(point);
  state.hoverCell = cell;

  if (state.mode === "edit" && state.editDrag) {
    updateShapeEdit(point);
    updateOutput();
    draw();
    return;
  }

  if (event.buttons && state.dragStart) {
    if (state.mode === "ellipse") {
      const uv = pointToGridUv(gridBounds(), point);
      if (uv) state.ellipsePreview = normalizeUvRect(state.dragStart, uv);
    } else if (state.mode === "curve") {
      const uv = pointToGridUv(gridBounds(), point);
      if (uv) state.curvePreview = { ...normalizeUvRect(state.dragStart, uv), type: inputs.curveType.value };
    } else if (state.mode === "rect") {
      const uv = pointToGridUv(gridBounds(), point);
      if (uv) state.previewRect = normalizeUvRect(state.dragStart, uv);
    } else if (state.mode === "paint" && cell) {
      const group = activePaintGroup();
      if (!group) return;
      const key = cellKey(cell);
      if (state.paintingValue) group.cells.add(key);
      else group.cells.delete(key);
    } else if (state.mode === "align") {
      state.alignPreview = { start: state.dragStart, end: point };
    } else if (cell) {
      state.previewRect = normalizeRect(state.dragStart, cell);
    }
    updateOutput();
  }

  draw();
});

canvas.addEventListener("pointerup", (event) => {
  if (state.mode === "pan") {
    state.view.panStart = null;
    canvas.style.cursor = "grab";
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    return;
  }

  if (state.mode === "edit") {
    state.editDrag = null;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    draw();
    updateOutput();
    return;
  }

  if (state.mode === "rect" && state.previewRect) {
    if (!addRectToActiveGroup(state.previewRect)) {
      ensurePaintGroup();
      addRectToActiveGroup(state.previewRect);
    }
    state.previewRect = null;
  }

  if (state.mode === "ellipse" && state.ellipsePreview) {
    if (Math.abs(state.ellipsePreview.u2 - state.ellipsePreview.u1) > 0.001 && Math.abs(state.ellipsePreview.v2 - state.ellipsePreview.v1) > 0.001) {
      addEllipseGroup(state.ellipsePreview);
    }
    state.ellipsePreview = null;
  }

  if (state.mode === "curve" && state.curvePreview) {
    if (Math.abs(state.curvePreview.u2 - state.curvePreview.u1) > 0.001 && Math.abs(state.curvePreview.v2 - state.curvePreview.v1) > 0.001) {
      addCurveGroup(state.curvePreview);
    }
    state.curvePreview = null;
  }

  if (state.mode === "align") {
    applyAlignPreview();
    state.alignPreview = null;
  }

  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }
  state.dragStart = null;
  draw();
  updateOutput();
});

canvas.addEventListener("pointerleave", () => {
  if (state.mode === "pan" && state.view.panStart) return;
  state.hoverCell = null;
  draw();
});

canvas.addEventListener(
  "wheel",
  (event) => {
    if (!state.image) return;
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    setZoom(state.view.scale * factor, screenPoint(event));
  },
  { passive: false },
);

window.addEventListener("resize", resizeCanvas);
resizeCanvas();
updateZoomOutput();
renderGroupList();
setFitStatus("Upload an image to auto fit the grid.");

function serializeGroups() {
  return state.groups.map((group) => ({
    ...group,
    cells: group.type === "paint" ? [...group.cells] : group.cells,
  }));
}

function restoreGroups(groups = []) {
  state.groups = groups.map((group) => ({
    ...group,
    cells: group.type === "paint" ? new Set(group.cells || []) : group.cells,
    rects: Array.isArray(group.rects) ? group.rects : [],
  }));
  state.activePaintGroupId = state.groups.findLast((group) => group.type === "paint")?.id || null;
  state.selectedGroupId = state.groups.at(-1)?.id || null;
}

function serializeProjectState() {
  return {
    image: state.imageRecord,
    grid: {
      cols: numberValue(inputs.cols, 58),
      rows: numberValue(inputs.rows, 20),
      cellSize: numberValue(inputs.cellSize, 1),
      left: numberValue(inputs.left, 0),
      top: numberValue(inputs.top, 0),
      right: numberValue(inputs.right, 0),
      bottom: numberValue(inputs.bottom, 0),
      corners: state.gridCorners,
    },
    view: {
      scale: state.view.scale,
      offsetX: state.view.offsetX,
      offsetY: state.view.offsetY,
      rotation: state.view.rotation,
    },
    groups: serializeGroups(),
    checklist: nonEmptyGroups().map((group) => ({ id: group.id, label: group.label, category: group.category || "other", stats: statsForGroup(group) })),
    scale_mode: state.scaleMode,
  };
}

function restoreProjectState(project = {}) {
  const grid = project.grid || {};
  inputs.cols.value = grid.cols ?? 58;
  inputs.rows.value = grid.rows ?? 20;
  inputs.cellSize.value = grid.cellSize ?? 1;
  inputs.left.value = grid.left ?? 0;
  inputs.top.value = grid.top ?? 0;
  inputs.right.value = grid.right ?? 0;
  inputs.bottom.value = grid.bottom ?? 0;
  state.gridCorners = Array.isArray(grid.corners) ? grid.corners : null;
  state.imageRecord = project.image || null;
  state.scaleMode = project.scale_mode || "plan";
  const nextView = project.view || {};
  state.view.scale = Number(nextView.scale) || 1;
  state.view.offsetX = Number(nextView.offsetX) || 0;
  state.view.offsetY = Number(nextView.offsetY) || 0;
  state.view.rotation = Number(nextView.rotation) || 0;
  restoreGroups(project.groups || []);
  updateZoomOutput();
  updateCornerStatus();
  setScaleMode(state.scaleMode);
  draw();
  updateOutput();
}

window.GridMeasureAPI = {
  getProjectState: serializeProjectState,
  loadProject(project) {
    const image = project?.image;
    if (image?.path) {
      state.imageRecord = image;
      loadImage(image.path, {
        label: image.originalName ? `Loaded: ${image.originalName}` : "Loaded saved project",
        imageRecord: image,
        resetGrid: false,
        afterLoad: () => {
          restoreProjectState(project);
          state.imageRecord = image;
          setUploadStatus(image.originalName ? `Loaded: ${image.originalName}` : "Loaded saved project");
        },
      });
      return;
    }
    restoreProjectState(project || {});
  },
  clearProject() {
    clearGroups();
    state.image = null;
    state.imageRecord = null;
    emptyState.classList.remove("hidden");
    draw();
    updateOutput();
    setUploadStatus("No uploaded image");
    setFitStatus("Upload an image to auto fit the grid.");
  },
};
