"""Verify browser-to-Blender identity and transformation roundtrip."""
import bpy,json,math,sys
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'private/event-studio/rbc'
s=json.loads((OUT/'site-seed.json').read_text());expected={o['id']:o for o in s['objects']};actual={o['event_object_id']:o for o in bpy.data.objects if o.get('event_object_id')};bpy.context.view_layer.update();errors=[];maximum=0
for id,e in expected.items():
 if id not in actual:errors.append({'id':id,'error':'missing object'});continue
 o=actual[id];p=o.matrix_world.translation;back=[p.x,p.z,-p.y];dist=math.dist(back,e['position']);maximum=max(maximum,dist)
 if dist>.01:errors.append({'id':id,'positionErrorMetres':dist,'expected':e['position'],'actual':back})
 if max(abs(a-b) for a,b in zip(o['event_dimensions_m'],e['dimensions']))>.01:errors.append({'id':id,'error':'dimension mismatch'})
for id in [f'A{i}' for i in range(1,28)]+[f'S{i}' for i in range(1,20)]+[f'V{i}' for i in range(1,7)]:
 if id not in actual:errors.append({'id':id,'error':'source ID missing'})
report={'objectsExpected':len(expected),'objectsPresent':len(actual),'maximumPositionErrorMetres':maximum,'identityAndPositionPass':not errors,'errors':errors,'cameras':[o.name for o in bpy.data.objects if o.type=='CAMERA'],'missingFurnitureAssets':json.loads(bpy.context.scene.get('event_missing_assets','[]')),'frameRange':[bpy.context.scene.frame_start,bpy.context.scene.frame_end],'framesPerSecond':bpy.context.scene.render.fps}
(OUT/'blender-roundtrip-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2));assert not errors
