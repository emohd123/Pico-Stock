"""Build reusable tent assets and matched orthographic option renders."""
import bpy,json,sys,math
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).parent))
from import_layout import ROOT,world_parent,tent,coord,material,cube

out=ROOT/'private/event-studio/rbc';document=json.loads((out/'supplier/tent-library.json').read_text())
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
sc=bpy.context.scene;sc.unit_settings.system='METRIC';sc.unit_settings.scale_length=1;sc.render.engine='BLENDER_EEVEE_NEXT';sc.eevee.taa_render_samples=64
sc.render.resolution_x=1600;sc.render.resolution_y=1200;sc.render.resolution_percentage=100;sc.render.image_settings.file_format='PNG';sc.render.image_settings.color_mode='RGB'
sc.world.use_nodes=True;sc.world.node_tree.nodes.get('Background').inputs[0].default_value=(.76,.82,.9,1);sc.world.node_tree.nodes.get('Background').inputs[1].default_value=.8
sc.view_settings.view_transform='AgX';sc.view_settings.look='AgX - Medium High Contrast';sc.view_settings.exposure=.5
bpy.ops.object.light_add(type='SUN',location=(0,0,20));sun=bpy.context.object;sun.name='Soft afternoon daylight';sun.data.energy=2.8;sun.data.angle=.16;sun.rotation_euler=(math.radians(32),math.radians(-24),math.radians(-32))
bpy.ops.object.light_add(type='AREA',location=(0,-6,16));fill=bpy.context.object;fill.name='Large soft fill';fill.data.energy=1800;fill.data.shape='DISK';fill.data.size=18
cube('Neutral comparison ground',(0,0,-.11),(180,180,.2),material('Warm neutral background','#e4e4d9',.95))
collections=[];parents=[];reports=[]
for o in document['objects']:
 parent=world_parent(o);tent(o,parent);parents.append(parent)
 collection=bpy.data.collections.new(o['name']);sc.collection.children.link(collection);collections.append(collection)
 for obj in [parent,*parent.children_recursive]:
  for old in list(obj.users_collection):old.objects.unlink(obj)
  collection.objects.link(obj)
 collection.asset_mark();collection.asset_data.description=o['metadata']['notes'];collection.asset_data.tags.new('Royal Bahrain Concours');collection.asset_data.tags.new('Supplier tent');collection.instance_offset=coord(o['position'])
 camera_data=bpy.data.cameras.new(o['name']+' camera');camera=bpy.data.objects.new(o['name']+' camera',camera_data);sc.collection.objects.link(camera)
 x=o['position'][0];camera.location=coord([x+15,10.5,23]);target=Vector(coord([x,2.3,0]));camera.rotation_euler=(target-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.type='ORTHO';camera_data.ortho_scale=18.8;sc.camera=camera
 for c in collections:c.hide_render=c!=collection
 sc.render.filepath=str(out/o['preview']);bpy.ops.render.render(write_still=True)
 bpy.context.view_layer.update();roof=[c for c in parent.children if c.get('component')=='roof'];max_height=max((child.matrix_local @ v.co).z for child in roof for v in child.data.vertices)
 assert abs(max_height-o['dimensions'][1])<.001,(o['name'],max_height)
 floor=next(c for c in parent.children if c.get('component')=='floor');xs=[v.co.x for v in floor.data.vertices];ys=[v.co.y for v in floor.data.vertices]
 assert abs(max(xs)-min(xs)-o['dimensions'][0])<.001
 assert abs(max(ys)-min(ys)-o['dimensions'][2])<.001
 glass=[c for c in parent.children if c.get('component')=='wall'];assert bool(glass)==bool(o['metadata']['frontGlass'])
 reports.append({'id':o['id'],'dimensions':o['dimensions'],'roofMaximumHeight':max_height,'wallParts':len(glass),'quote':o['metadata']['quote'],'preview':o['preview'],'renderSize':[1600,1200]})
for c in collections:c.hide_render=False
camera_data=bpy.data.cameras.new('All three options');camera=bpy.data.objects.new('All three options',camera_data);sc.collection.objects.link(camera);camera.location=coord([0,28,48]);camera.rotation_euler=(Vector(coord([0,2,0]))-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.type='ORTHO';camera_data.ortho_scale=58;sc.camera=camera
notes=bpy.data.texts.new('READ ME - supplier tent options');notes.write(document['notes']+'\n\nThree named asset collections: MQ40, Arabesque open, Arabesque glass-front. Append the required collection or use the Asset Browser. Each Empty parent carries the browser object JSON and exact metre dimensions. Roof, frame, glazing and proposed floor remain separate meshes. Collection instance offsets put dragged assets at their local centre. The library arrangement is for comparison only and does not set site locations.\n\nGlass is front-only, without an invented front door; back and sides remain open. Arabesque heights are estimates pending supplier sections. No furniture or decor is included.\n')
for area in bpy.context.screen.areas if bpy.context.screen else []:
 if area.type=='VIEW_3D':area.spaces.active.region_3d.view_perspective='CAMERA';area.spaces.active.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(out/'supplier/Lounge-Tent-Options.blend'),compress=True)
(out/'supplier/tent-library-report.json').write_text(json.dumps({'pass':True,'units':'m','assetCollections':len(collections),'matchedCameraScale':18.8,'variants':reports},indent=2))
print('SUPPLIER_LIBRARY_VERIFIED',len(reports),flush=True)
