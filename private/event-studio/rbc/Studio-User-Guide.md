# Royal Bahrain Concours 2026 — 3D Event Studio

Open https://pico-stock.vercel.app/admin/pico-ai/royal-bahrain-concours-2026 and sign in with the existing Pico Stock staff account. The same studio is available from **Pico AI → Royal Bahrain Concours**.

## Explore the event

- **Orbit:** drag to rotate, scroll to zoom, and right-drag to pan. Select a named location in the Site panel to move directly to it.
- **Plan:** view the calibrated layout from above, with the roofs lifted off so you can see inside. The minimap also takes you to another part of the site.
- **Plan interior:** with a tent selected, this frames that tent alone and draws a one-metre setting-out grid across its floor, so you can read and check furniture positions against real distances.
- **Walk:** the mouse alone is enough: scroll to move forward and back, double-click any spot you can see to walk over to it, and click once to have the mouse turn your head, with Escape to give it back. Dragging works too if you prefer holding on. **W** walks forward and **S** back, **A** and **D** turn you left and right, **Q** and **E** step sideways without turning, and Shift hurries. Arrow keys do the same as WASD. Touch devices have on-screen buttons for walking and turning. Use **Enter tent** in the inspector for an interior view.
- Roofs, walls, location labels, and evening lighting have separate controls along the bottom of the view.
- **Views** contains saved cameras and the guided tour. Save your own viewpoint with a name.

The starting layout contains 931 scene objects: the event kit, plus the existing course features, which are locked. The clubhouse and Majlis appearance has been refined using official venue photographs, with event photographs guiding tent surfaces, lawn and outdoor details. These visual references help recognize the venue; they do not supply survey measurements.

## The ground and the existing course

The site is modelled on its measured slope: it falls 3.8 m from the clubhouse end down to the lake end, 1 in 150. Tent floors stay level, so a tent on the slope stands proud of the ground on its low side, which is what happens on site. Bunker depth and green contours are not modelled; no survey of them was supplied and public elevation data is too coarse to resolve them. The four turf mounds on the driving range are modelled, as domes about 10-11 m across measured from satellite imagery; their 1 m height is an estimate.

The bunkers, greens, teeing grounds, fairway, practice ground and cart paths that already exist on the course are drawn in and locked, so you can see what the event is being built on. Select a tent, stage or building and the inspector says so when it stands on a bunker, a putting green, a teeing ground, a cart path or a driving-range mound, because those change what it costs to build there. Select a display car and it says so when the car stands on a mound, where it would sit tilted. Standing on the fairway or the practice ground is not flagged: the whole event stands on those. Ten structures currently need ground works, including the Coffee Bar on a mound, and five cars stand on a mound; the overview panel keeps both counts. The course is placed by matching the plan's lake to the real shoreline in satellite imagery, to within about 3 m.

## The surroundings

Around the event you see the real neighbourhood: fairways and greens, desert sand, roads and the lakes, classified from satellite imagery, and the houses and buildings at their mapped footprints. They are there to orient you and to make the views honest; they cannot be selected or edited, and the heights of the houses are estimates.

## 5 × 5 m exhibitor booths

Every 5 × 5 m booth follows Pico's elevation of 30 September 2026: a 3.5 m frame on 400 mm red posts, a 4.2 × 1.0 m fascia graphic lit by an LED strip over a 4.2 m wide, 2.3 m high opening, and a 4.8 × 2.4 m backwall graphic inside. Select a booth to see these print sizes in the inspector, and type an exhibitor into **Fascia name** to show it on the fascia; leave it empty to show the plot name. The backwall shows its print size until real artwork is supplied.

## Tent roofs, frames and light

The marquees are built the way frame tents are: a pitched marquee spans its short side and grows in 5 m bays, so its ridge runs the long way. Step inside and you see the aluminium frame overhead: a portal rafter at every bay, the ridge beam and, on the wide halls, a purlin halfway up each slope. Pagodas show their hip rafters and king post, and the hexagonal pavilions their hips to the apex. The frame lifts off with the roof in the plan view. White marquee fabric lets light through, so ceilings glow, a little brighter on the sunlit slope. **Evening light** sets a low sun in the west-south-west, lights the marquees from inside and makes the booth fascias glow. Frame spacing and sections are standard practice; a supplier's drawings would fix them exactly.

## Car club lounge options

Select Lounge 1, Lounge 2 west/east, or Lounge 3. **Lounge tent option** switches between MQ40 and Arabesque while retaining the tent centre, orientation and every furniture position.

Choose **Compare all three configurations** to see matched-scale 3D previews, footprint diagrams and prices together. Each option checks the selected lounge's current neighbours and furniture before you apply it. Choose **Use** to apply an option, or close the comparison to keep your current design. The comparison also has a one-page PDF download.

- **Option A:** open MQ40 hexagon, 10.5 × 12 m, 6.8 m peak. BHD 2,900 per tent. Quoted area is 95 m²; the nominal hexagon is 94.5 m².
- **Option B:** open Arabesque, 12 m frontage × 6 m depth, three peaks. BHD 2,400 per tent. Its 5.5 m height and 2.8 m eave are visual estimates.
- **Glass front:** optional on B only, 12 m long, BHD 1,800 extra (BHD 4,200 total). Enter from the open back or sides.

Furniture and décor are excluded. The shown deck is a proposed addition. Flooring, VAT and rental period were not specified. These are supplied rental rates, not an order or confirmed booking. Changing a footprint reports furniture outside or neighbouring tent overlaps; rearrange using Plan interior. Exact-size editing remains available but the supplier rate then needs reconfirmation. Undo, autosave and named versions apply to options too. Files includes a live CSV of selected lounge costs. Reference photos and the distinction between measured dimensions and estimated construction details are in each lounge inspector.

## Edit tents and furniture

Select an object and press **Edit layout** to use movement or rotation handles. The inspector also accepts exact metre dimensions, positions, elevation, rotation in degrees, and a surface colour. The snap control uses 0.5 m and 15° increments. Locked objects must be unlocked before editing.

Moving or rotating a tent carries its attached furniture. Furniture can also be moved individually. An optional shared **Move with group** name links other objects for movement and rotation. Duplicating a tent duplicates its contents. Removing a tent leaves its furniture in place; use Undo to restore the tent.

The Furniture panel contains the 99 items Pico Stock rents, taken from the live product catalogue with photographs, metre dimensions, and measurement status. An item whose product record publishes its size, such as `H79*D47*W51cm`, is shown at exactly that size and marked **Dimensions listed**; the rest are marked **Estimated size** until their product records carry measurements.

Select a tent, or any piece already standing in it, and the next item you add is placed on a clear patch of that tent's floor: the studio reads the item's own width and depth, sets it out on the half-metre grid, and keeps it clear of the walls and of everything already placed. If the floor is full, the studio says so rather than stacking pieces. A piece nudged past the tent walls is brought back onto its floor, and resizing a tent brings its contents back inside. Move a piece right out of its tent, though, and it belongs where you put it: it joins whichever tent it now stands in, or stays on the lawn. With furniture selected, inspect another catalogue item and choose **Replace selected furniture** to retain the placement. Colours recolour the main opaque surface while retaining metal and glass finishes. Furniture models are editable reconstructions from photographs; they are not manufacturer CAD files.

The initial 238 furniture instances are a proposed arrangement across 28 zones. Stock warnings compare placed quantities against the catalogue snapshot. They do not reserve inventory. Use **Furniture schedule** for a CSV of the proposed quantities.

## Furnish a tent with AI

Select any tent and open **Furnish with AI** in the inspector. Describe what the tent is for, such as "VIP lounge for 30 guests with a coffee bar" or "client meetings with a reception desk", or pick one of the suggestions, then choose **Suggest three layouts**.

Claude reads the brief and chooses arrangements and catalogue pieces: lounge sets, a majlis along the walls, dining rounds or long tables, cocktail tables, theatre rows, a bar against the back wall, a reception desk by the door. The studio then sets every piece out on that tent's own floor and checks it. The tent never changes size; pieces stay inside the walls and clear of each other, chairs are tucked to their tables, aisles and the entrance stay open, and only Pico Stock items that are in stock are used, counting what the rest of the event already uses. Whatever will not fit is left out and the card says so; when a piece is too large, a smaller one of the same kind is used and named.

Each option shows a scaled plan of the tent with the entrance marked in red, the seats and pieces it actually holds, and the main items. **Use this layout** replaces the tent's furniture in one step (locked pieces stay, and were planned around); **Undo** brings back what was there. Tick **Keep the pieces already here** to add around the existing furniture instead. Planning takes about 15 to 40 seconds. If Claude cannot be reached, the studio's own planner offers three layouts instead and says so. Proposed furniture does not reserve stock.

## Save, restore, and exchange layouts

Changes autosave to the event's private cloud layout. **Save layout** saves immediately. **Files & versions** lets you name a version and restore any retained version as a new revision. Undo and Redo cover the current editing session.

If another browser saves first, the studio stops overwriting and asks you to download your work and reload the latest version. If the network fails, your current unsaved work remains in the open tab. Use **Download my work** before closing it.

**Editable layout** exports metre-based JSON. **Import layout JSON** reopens that document in the studio. The same JSON can rebuild a Blender file using the importer in the editable project kit. This is an explicit export/import workflow; Blender and the browser do not synchronize automatically.

In the **Files** tab, **Venue references** opens the official source pages in a new tab. 2026 plan sets positions and scale. Venue photos guide appearance; heights remain estimates. The DP World aerial map is a reference for permanent venue architecture only; its tournament layout is not the Concours layout.

## Render and record

The camera button downloads the current view as a high-quality PNG: drawn at up to twice the screen resolution, with soft ambient shading where tents meet the turf, under cars and furniture and in corners. The live view is unchanged. Six prepared 3840 × 2160 renders and a 90-second 1920 × 1080 MP4 are included with the finished files.

**Record walkthrough** records the current scene's guided tour to a 1920 × 1080 WebM video for 90 seconds. Keep the tab visible. It captures the 3D canvas without the editor controls. Rendering quality and frame rate depend on the device and other running graphics tasks. Use Chrome or Edge for recording. The prepared MP4 is also suitable for presentation software that does not accept WebM.

## Blender and source accuracy

Open the delivered `.blend` in Blender 4.5 or newer. Named source objects, individual structural parts, furniture, materials, and cameras remain editable. A 90-second camera animation is included. The project kit preserves the importer, source JSON, registry, and GLB library; see its READ-ME for the rebuild command.

**Lounge-Tent-Options.blend** is a separate library of all three supplier configurations. Each is a named asset collection with editable roof, frame, glazing and proposed deck. Append a collection into your Blender project or add the file's folder as an Asset Library. Its side-by-side arrangement is for comparison only; use the main event file for site positions. The library, comparison PDF and render previews are in **Files & versions** and the editable project kit.

The PDF's six dimension spans establish the horizontal metre scale. Source plot labels A1–A27, S1–S19 and V1–V6 are retained. Shape tracing and simplification introduce small tolerances; the calibration report records them. Heights, roof sections, openings, site levels, materials, generic cars and trees are visualization estimates. Furniture dimensions are labelled as listed, partially estimated, or estimated according to the catalogue. The original source plan and catalogue remain the references for later technical verification.
