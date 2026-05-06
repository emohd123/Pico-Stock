import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export function GET() {
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Grid Measure</title>
    <link rel="stylesheet" href="/grid-measure/styles.css" />
  </head>
  <body>
    <main class="app-shell">
      <aside class="toolbar" aria-label="Measurement controls">
        <div class="brand">
          <span class="brand-mark"></span>
          <div>
            <h1>Grid Measure</h1>
            <p>Each square is 1m x 1m.</p>
          </div>
        </div>
        <section class="upload-panel" aria-label="Upload and status">
          <input id="imageInput" class="hidden-file" type="file" accept="image/*" />
          <button id="uploadButton" class="upload-button" type="button">Upload image</button>
          <button id="autoFitGrid" type="button" class="quiet">Auto fit grid</button>
          <div id="uploadStatus" class="fit-status">No uploaded image</div>
          <div id="fitStatus" class="fit-status">Ready</div>
        </section>
        <details class="panel-section" open>
          <summary>Measure</summary>
          <section class="control-group" aria-label="Measurement tools">
            <div class="segmented" role="group" aria-label="Selection mode">
              <button id="rectMode" class="active" type="button">Group</button>
              <button id="paintMode" type="button">Paint</button>
              <button id="alignMode" type="button">Align</button>
              <button id="cornerMode" type="button">Corners</button>
            </div>
            <details id="groupActionsPanel" class="tool-menu">
              <summary>Group actions</summary>
              <div class="sample-row">
                <button id="newPaintGroup" type="button">Add group</button>
                <button id="undoGroup" type="button">Undo group</button>
              </div>
            </details>
            <div class="sample-row">
              <button id="quadMeasureMode" type="button">4pt measure</button>
              <button id="ellipseMeasureMode" type="button">Ellipse</button>
            </div>
            <div class="sample-row">
              <button id="curveMeasureMode" type="button">Curve</button>
              <select id="curveTypeInput" aria-label="Curve shape type">
                <option value="half">Half circle</option>
                <option value="quarter">Quarter circle</option>
                <option value="ring">Ring</option>
                <option value="half-ring">Half ring</option>
              </select>
            </div>
            <button id="editShapeMode" type="button" class="quiet">Edit selected shape</button>
            <button id="clearSelection" type="button" class="quiet">Clear all</button>
          </section>
        </details>
        <details class="panel-section" open>
          <summary>Calculated</summary>
          <section class="measurement" aria-live="polite">
            <label class="waste-control">
              Waste
              <select id="wasteInput">
                <option value="0">0%</option>
                <option value="5">5%</option>
                <option value="10" selected>10%</option>
                <option value="15">15%</option>
                <option value="20">20%</option>
              </select>
            </label>
            <dl>
              <div><dt>Cell scale</dt><dd><span id="cellScaleValue">1m x 1m</span></dd></div>
              <div><dt>Groups</dt><dd id="groupCountValue">0</dd></div>
              <div><dt>Selected cells</dt><dd id="cellCount">0</dd></div>
              <div><dt id="areaLabel">Selected area</dt><dd><span id="areaValue">0</span> m2</dd></div>
              <div><dt id="widthLabel">Total span width</dt><dd><span id="widthValue">0</span> m</dd></div>
              <div><dt id="heightLabel">Total span height</dt><dd><span id="heightValue">0</span> m</dd></div>
              <div><dt id="boxAreaLabel">Bounding area</dt><dd><span id="boxAreaValue">0</span> m2</dd></div>
              <div><dt>Perimeter</dt><dd><span id="perimeterValue">0</span> m</dd></div>
              <div><dt id="wasteLabel">With 10% waste</dt><dd><span id="wasteAreaValue">0</span> m2</dd></div>
            </dl>
          </section>
        </details>
        <details class="panel-section" open>
          <summary>Groups & Checklist</summary>
          <section class="groups-panel" aria-label="Selection groups">
            <div id="groupList" class="group-list"></div>
            <div class="quantity-summary">
              <h3>Checklist</h3>
              <div id="quantitySummary" class="quantity-list">No quantities yet</div>
            </div>
          </section>
        </details>
        <details class="panel-section">
          <summary>Grid Setup</summary>
          <section class="control-group" aria-label="Grid setup">
            <label>Columns<input id="colsInput" type="number" min="1" max="300" value="58" /></label>
            <label>Rows<input id="rowsInput" type="number" min="1" max="200" value="20" /></label>
            <label>Cell size m<input id="cellSizeInput" type="number" min="0.01" max="100" step="0.01" value="1" /></label>
            <div class="sample-row">
              <button id="startCorners" type="button">Set 4 corners</button>
              <button id="resetCorners" type="button">Reset corners</button>
            </div>
            <div id="cornerStatus" class="fit-status">Corners not set</div>
          </section>
        </details>
        <details class="panel-section">
          <summary>Fine Tune Crop</summary>
          <section class="control-group" aria-label="Grid crop controls">
            <label>Left crop %<input id="leftInput" type="number" min="0" max="50" step="0.1" value="3.8" /></label>
            <label>Top crop %<input id="topInput" type="number" min="0" max="50" step="0.1" value="24.3" /></label>
            <label>Right crop %<input id="rightInput" type="number" min="0" max="50" step="0.1" value="2.5" /></label>
            <label>Bottom crop %<input id="bottomInput" type="number" min="0" max="50" step="0.1" value="11.1" /></label>
            <div class="nudge-grid" aria-label="Grid crop nudges">
              <button id="nudgeTopUp" type="button">Top -</button><button id="nudgeTopDown" type="button">Top +</button>
              <button id="nudgeLeftUp" type="button">Left -</button><button id="nudgeLeftDown" type="button">Left +</button>
              <button id="nudgeRightUp" type="button">Right -</button><button id="nudgeRightDown" type="button">Right +</button>
              <button id="nudgeBottomUp" type="button">Bottom -</button><button id="nudgeBottomDown" type="button">Bottom +</button>
            </div>
          </section>
        </details>
        <details class="panel-section">
          <summary>View</summary>
          <section class="control-group" aria-label="View controls">
            <div class="view-row"><button id="zoomOut" type="button">-</button><div id="zoomValue" class="zoom-readout">100%</div><button id="zoomIn" type="button">+</button></div>
            <div class="sample-row"><button id="zoomFit" type="button">Fit</button><button id="panMode" type="button">Pan</button></div>
            <div class="view-row"><button id="rotateLeft" type="button">-5</button><div id="rotationValue" class="zoom-readout">0 deg</div><button id="rotateRight" type="button">+5</button></div>
            <button id="rotateReset" type="button" class="quiet">Reset rotation</button>
          </section>
        </details>
        <details class="panel-section">
          <summary>Scale Mode</summary>
          <section class="control-group" aria-label="Scale mode">
            <div class="segmented two" role="group" aria-label="Scale calculation mode">
              <button id="planScaleMode" class="active" type="button">Plan</button>
              <button id="elevScaleMode" type="button">Elevation</button>
            </div>
          </section>
        </details>
      </aside>
      <section class="workspace" aria-label="Image measurement workspace">
        <div class="canvas-wrap">
          <canvas id="measureCanvas"></canvas>
          <div id="emptyState" class="empty-state">
            <strong>Upload a grid image</strong>
            <span>Then drag across the grid squares to calculate meters.</span>
          </div>
        </div>
      </section>
    </main>
    <script src="/grid-measure/app.js"></script>
  </body>
</html>`;

    return new NextResponse(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
}
