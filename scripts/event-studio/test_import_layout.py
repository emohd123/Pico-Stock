"""Exercise edited geometry, tint, parent links and transform preservation."""
import bpy,json,sys,math
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from import_layout import import_scene,ROOT,coord
from mathutils import Vector
out=ROOT/'private/event-studio/rbc';base=json.loads((out/'site-seed.json').read_text());byid={o['id']:o for o in base['objects']}
a=json.loads(json.dumps(byid['A1']));a['dimensions']=[7,7,6];a['color']='#264653';a['rotation']=[0,.8,0];a['metadata']['eaveHeight']=4
b=json.loads(json.dumps(byid['lounge-1']));b['dimensions'][0]*=1.5;b['dimensions'][2]*=.8;b['dimensions'][1]=8;b['metadata']['eaveHeight']=4.5;b['roofType']='gable';b['color']='#356859'
f=json.loads(json.dumps(next(o for o in base['objects'] if o['kind']=='furniture' and o['metadata']['parentTentId']=='owners-enclosure')));f['metadata']['parentTentId']='A1';f['color']='#bc8442';f['position']=[a['position'][0]+1,.13,a['position'][2]+1];f['dimensions']=[v*k for v,k in zip(f['dimensions'],[1.2,.8,.7])];f['visible']=False
scene={**base,'objects':[a,b,f]};parents,missing=import_scene(scene);bpy.context.view_layer.update();errors=[]
for o in [a,b,f]:
 p=parents[o['id']];error=(p.matrix_world.translation-Vector(coord(o['position']))).length
 if error>.01:errors.append(o['id']+' world position')
roof=next(o for o in parents['A1'].children if o.get('component')=='roof');maxz=max(v.co.z for v in roof.data.vertices)
if abs(maxz-7)>.001:errors.append('Edited roof height')
polyfloor=next(o for o in parents['lounge-1'].children if o.get('component')=='floor');xs=[v.co.x for v in polyfloor.data.vertices];ys=[v.co.y for v in polyfloor.data.vertices]
if abs(max(xs)-min(xs)-b['dimensions'][0])>.001 or abs(max(ys)-min(ys)-b['dimensions'][2])>.001:errors.append('Edited polygon footprint')
if parents[f['id']].parent!=parents['A1']:errors.append('Furniture parent')
if not any('Furniture custom #bc8442' in m.name for o in parents[f['id']].children if o.type=='MESH' for m in o.data.materials):errors.append('Furniture custom color')
if 'Tensile canvas #264653' not in roof.data.materials[0].name:errors.append('Tent canvas color')
if not all(o.hide_render for o in [parents[f['id']],*parents[f['id']].children_recursive]):errors.append('Hidden furniture visibility')
report={'editedRectangleHeightMetres':maxz,'editedPolygonDimensions':[max(xs)-min(xs),max(ys)-min(ys)],'expectedPolygonDimensions':[b['dimensions'][0],b['dimensions'][2]],'furnitureParentVerified':parents[f['id']].parent==parents['A1'],'missingAssets':missing,'errors':errors,'pass':not errors};(out/'blender-edited-import-report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report,indent=2));assert not errors
