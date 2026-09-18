"""Package the source-faithful editable project without transient caches or credentials."""
from pathlib import Path
import json,zipfile,hashlib
from PIL import Image
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'private/event-studio/rbc'
NAMES=['Royal-Bahrain-Concours-2026.blend','site-seed.json','furniture-assets.json','calibration-report.json','furnishing-report.json','blender-roundtrip-report.json','blender-edited-import-report.json','blender-render-report.json','READ-ME.md','Studio-User-Guide.md','Source-Site-Plan.pdf','source-preview.png','source-model-overlay.jpg']
SCRIPTS=['import_layout.py','build_blender.py','verify_blender.py','test_import_layout.py','extract_site.py','furnish_seed.py','probe_source.py','extract_car_bounds.py','detect_shapes.py','detect_polygons.py','detect_cars.py','validate_source.py','package_scene.py']
files=[OUT/n for n in NAMES]+[ROOT/'scripts/event-studio'/n for n in SCRIPTS]
stills=sorted((OUT/'renders').glob('[0-9][0-9]-*.png'))
assert len(stills)==6
for f in stills:
 with Image.open(f) as im:assert im.size==(3840,2160),(str(f),im.size);im.verify()
# Presentation stills are verified here but delivered separately.
models=sorted((ROOT/'public/event-studio/furniture').glob('*.glb'));assert len(models)==99,len(models);files+=models
for f in files:assert f.is_file(),str(f)
package=OUT/'Royal-Concours-Editable-Kit.zip'
with zipfile.ZipFile(package,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
 for f in files:z.write(f,f.relative_to(ROOT).as_posix())
 z.write(OUT/'READ-ME.md','READ-ME.md');z.write(OUT/'Studio-User-Guide.md','Studio-User-Guide.md')
with zipfile.ZipFile(package) as z:
 assert z.testzip() is None
 assert package.stat().st_size<50_000_000
 assert not any('/renders/' in n for n in z.namelist())
 report={'package':package.name,'bytes':package.stat().st_size,'fileCount':len(z.namelist()),'furnitureModels':len(models),'stillsPacked':0,'stillsDeliveredSeparately':len(stills),'imageDimensions':[3840,2160],'sourcePlanIncluded':True,'studioGuideIncluded':True,'zipIntegrityPass':True,'sha256':hashlib.sha256(package.read_bytes()).hexdigest(),'entries':z.namelist()}
(OUT/'editable-kit-report.json').write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k!='entries'},indent=2))
