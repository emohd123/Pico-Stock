# Royal Bahrain Concours 2026 — 3D Event Studio

Open https://pico-stock.vercel.app/admin/pico-ai/royal-bahrain-concours-2026 and sign in with the existing Pico Stock staff account. The same studio is available from **Pico AI → Royal Bahrain Concours**.

## Explore the event

- **Orbit:** drag to rotate, scroll to zoom, and right-drag to pan. Select a named location in the Site panel to move directly to it.
- **Plan:** view the calibrated layout from above, with the roofs lifted off so you can see inside. The minimap also takes you to another part of the site.
- **Plan interior:** with a tent selected, this frames that tent alone and draws a one-metre setting-out grid across its floor, so you can read and check furniture positions against real distances.
- **Walk:** drag to look and use WASD or arrow keys. Shift moves faster. Touch devices have on-screen directional buttons. Use **Enter tent** in the inspector for an interior view.
- Roofs, walls, location labels, and evening lighting have separate controls along the bottom of the view.
- **Views** contains saved cameras and the guided tour. Save your own viewpoint with a name.

The starting layout contains 916 scene objects: the event kit, plus the existing course features, which are locked. The clubhouse and Majlis appearance has been refined using official venue photographs, with event photographs guiding tent surfaces, lawn and outdoor details. These visual references help recognize the venue; they do not supply survey measurements.

## The ground and the existing course

The site is modelled on its measured slope: it falls 3.8 m from the clubhouse end down to the lake end, 1 in 150. Tent floors stay level, so a tent on the slope stands proud of the ground on its low side, which is what happens on site. Local mounding, bunker depth and green contours are not modelled; no survey of them was supplied and public elevation data is too coarse to resolve them.

The bunkers, greens, teeing grounds, fairway, practice ground and cart paths that already exist on the course are drawn in and locked, so you can see what the event is being built on. Select a tent, stage or building and the inspector says so when it stands on a bunker, a putting green, a teeing ground or a cart path, because those change what it costs to build there. Standing on the fairway or the practice ground is not flagged: the whole event stands on those. Nine structures currently need ground works: eight on a bunker and one on a cart path, and the overview panel keeps that count.

## Edit tents and furniture

Select an object and press **Edit layout** to use movement or rotation handles. The inspector also accepts exact metre dimensions, positions, elevation, rotation in degrees, and a surface colour. The snap control uses 0.5 m and 15° increments. Locked objects must be unlocked before editing.

Moving or rotating a tent carries its attached furniture. Furniture can also be moved individually. An optional shared **Move with group** name links other objects for movement and rotation. Duplicating a tent duplicates its contents. Removing a tent leaves its furniture in place; use Undo to restore the tent.

The Furniture panel contains the 99 items Pico Stock rents, taken from the live product catalogue with photographs, metre dimensions, and measurement status. An item whose product record publishes its size, such as `H79*D47*W51cm`, is shown at exactly that size and marked **Dimensions listed**; the rest are marked **Estimated size** until their product records carry measurements.

Select a tent, or any piece already standing in it, and the next item you add is placed on a clear patch of that tent's floor: the studio reads the item's own width and depth, sets it out on the half-metre grid, and keeps it clear of the walls and of everything already placed. If the floor is full, the studio says so rather than stacking pieces. A piece nudged past the tent walls is brought back onto its floor, and resizing a tent brings its contents back inside. Move a piece right out of its tent, though, and it belongs where you put it: it joins whichever tent it now stands in, or stays on the lawn. With furniture selected, inspect another catalogue item and choose **Replace selected furniture** to retain the placement. Colours recolour the main opaque surface while retaining metal and glass finishes. Furniture models are editable reconstructions from photographs; they are not manufacturer CAD files.

The initial 238 furniture instances are a proposed arrangement across 28 zones. Stock warnings compare placed quantities against the catalogue snapshot. They do not reserve inventory. Use **Furniture schedule** for a CSV of the proposed quantities.

## Save, restore, and exchange layouts

Changes autosave to the event's private cloud layout. **Save layout** saves immediately. **Files & versions** lets you name a version and restore any retained version as a new revision. Undo and Redo cover the current editing session.

If another browser saves first, the studio stops overwriting and asks you to download your work and reload the latest version. If the network fails, your current unsaved work remains in the open tab. Use **Download my work** before closing it.

**Editable layout** exports metre-based JSON. **Import layout JSON** reopens that document in the studio. The same JSON can rebuild a Blender file using the importer in the editable project kit. This is an explicit export/import workflow; Blender and the browser do not synchronize automatically.

In the **Files** tab, **Venue references** opens the official source pages in a new tab. 2026 plan sets positions and scale. Venue photos guide appearance; heights remain estimates. The DP World aerial map is a reference for permanent venue architecture only; its tournament layout is not the Concours layout.

## Render and record

The camera button downloads the current view as PNG. Six prepared 3840 × 2160 renders and a 90-second 1920 × 1080 MP4 are included with the finished files.

**Record walkthrough** records the current scene's guided tour to a 1920 × 1080 WebM video for 90 seconds. Keep the tab visible. It captures the 3D canvas without the editor controls. Rendering quality and frame rate depend on the device and other running graphics tasks. Use Chrome or Edge for recording. The prepared MP4 is also suitable for presentation software that does not accept WebM.

## Blender and source accuracy

Open the delivered `.blend` in Blender 4.5 or newer. Named source objects, individual structural parts, furniture, materials, and cameras remain editable. A 90-second camera animation is included. The project kit preserves the importer, source JSON, registry, and GLB library; see its READ-ME for the rebuild command.

The PDF's six dimension spans establish the horizontal metre scale. Source plot labels A1–A27, S1–S19 and V1–V6 are retained. Shape tracing and simplification introduce small tolerances; the calibration report records them. Heights, roof sections, openings, site levels, materials, generic cars and trees are visualization estimates. Furniture dimensions are labelled as listed, partially estimated, or estimated according to the catalogue. The original source plan and catalogue remain the references for later technical verification.
