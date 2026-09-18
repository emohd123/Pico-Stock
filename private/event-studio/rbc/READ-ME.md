# Royal Bahrain Concours 2026 - editable scene handoff

Open `private/event-studio/rbc/Royal-Bahrain-Concours-2026.blend` in Blender 4.5 or newer. The file is self-contained: geometry and materials are embedded, with 870 source and furniture objects, presentation cameras, and an editable 90-second camera animation.

Each tent is a named parent with separate roof, frame, walls, glazing and floor. Furniture is attached to its host tent and keeps its catalogue product ID. The original scene, calibration and furnishing records are embedded as Blender text blocks as well as included JSON files.

The browser scene uses metres and Y-up coordinates. Blender uses metres and Z-up: `(x, y, z)` becomes `(x, -z, y)`. Position means the floor/base origin. Named source plots A1-A27, S1-S19 and V1-V6 are preserved.

To rebuild a Blender file from a saved browser revision, retain this bundle's directory structure and run:

```powershell
blender --background --factory-startup --python scripts/event-studio/import_layout.py -- --layout path/to/revision.json --output path/to/revision.blend
```

Use the model's custom properties to locate its source object ID, dimensions, measurement status and catalogue product reference. To edit one linked furniture instance without changing matching instances, make its mesh data single-user first. Export an edited furniture mesh to GLB at metre scale with its origin at floor centre, retaining its product ID for replacement in the catalogue.

The 2D drawing is the horizontal reference. All six explicit dimension spans agree with the chosen scale within 1.5 mm; dimension annotations are assumed to be millimetres. Rectangular footprint detection quantizes vector endpoints to 1.75 cm. Water and landscape curves are simplified within approximately 12.2 cm. Heights, tent roof sections, openings, site levels, materials, generic cars and tree geometry are editable visual estimates because construction sections and an elevation survey were not provided.

The 238 furniture placements across 28 zones are proposed arrangements. Catalogue stock was checked at creation; no stock was reserved. Furniture that lacked source dimensions retains an estimated measurement status.

The six 3840 x 2160 PNG renders are supplied as separate downloads and are not packed in the editable kit. The animated camera in Blender covers frames 1-2160 at 24 fps. The delivered browser walkthrough is a separate real-time recording.

To reproduce source extraction, install Python packages `pymupdf shapely numpy opencv-python pillow` and run `scripts/event-studio/extract_site.py` followed by `scripts/event-studio/furnish_seed.py`. The included `Source-Site-Plan.pdf` is used as the input. Re-extraction restores the source layout, so export any saved working revision before regenerating it.

The included `Studio-User-Guide.md` explains browser navigation, saved versions, stock guidance, render capture and the JSON exchange workflow.

`Royal-Concours-Editable-Kit.zip` contains the Blender file, all 99 furniture GLBs, scripts, source PDF, guides and JSON records. Presentation renders and the recorded walkthrough are separate downloads to keep this kit below the storage upload limit.
