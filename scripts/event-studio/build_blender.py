"""Build the editable Royal Bahrain Concours scene and presentation stills.
Use Blender's embedded Python; geometry remains individually selectable under source IDs.
"""
import bpy,sys,json,math,argparse,time
from pathlib import Path
from mathutils import Vector
sys.path.insert(0,str(Path(__file__).resolve().parent))
from import_layout import import_scene,coord,material,cube,ROOT
OUT=ROOT/'private/event-studio/rbc'
def aim(camera,target):camera.rotation_euler=(Vector(coord(target))-camera.location).to_track_quat('-Z','Y').to_euler()
def lighting():
 sc=bpy.context.scene;sc.render.engine='BLENDER_EEVEE_NEXT';sc.eevee.taa_render_samples=48;sc.eevee.shadow_pool_size='1024';sc.eevee.use_gtao=True;sc.eevee.gtao_distance=3;sc.eevee.gtao_quality=1.5;sc.eevee.use_fast_gi=True;sc.render.resolution_percentage=100;sc.render.image_settings.file_format='PNG';sc.render.film_transparent=False
 sc.world.use_nodes=True;sc.world.node_tree.nodes.get('Background').inputs[0].default_value=(.65,.75,.82,1);sc.world.node_tree.nodes.get('Background').inputs[1].default_value=.62
 bpy.ops.object.light_add(type='SUN',location=(0,0,80));sun=bpy.context.object;sun.name='Warm Bahrain afternoon sun';sun.data.energy=3.0;sun.data.angle=.22;sun.rotation_euler=(math.radians(46),math.radians(-28),math.radians(-28))
 bpy.ops.object.light_add(type='AREA',location=(0,0,140));light=bpy.context.object;light.name='Soft sky fill';light.data.energy=24000;light.data.shape='DISK';light.data.size=180
 cube('Neutral presentation ground',(0,0,-.45),(2000,2000,.3),material('Neutral sand surround','#c8b999',.95))
 sc.view_settings.view_transform='AgX';sc.view_settings.look='AgX - Medium High Contrast';sc.view_settings.exposure=.3;sc.render.resolution_x=3840;sc.render.resolution_y=2160
 sc.render.image_settings.color_mode='RGB';sc.render.image_settings.color_depth='8';sc.render.fps=24;sc.frame_start=1;sc.frame_end=2160
 sc.render.use_persistent_data=True
 return sun
def camera_for(v):
 data=bpy.data.cameras.new(v['name']);camera=bpy.data.objects.new('CAM · '+v['name'],data);bpy.context.collection.objects.link(camera);camera.location=coord(v['position']);aim(camera,v['target']);data.lens=v.get('lens',32);data.clip_end=2500;data.clip_start=.03
 if v.get('ortho'):data.type='ORTHO';data.ortho_scale=v['ortho']
 return camera
VIEWS=[{'id':'01-overview','name':'Full event overview','position':[25,340,300],'target':[0,0,-6],'ortho':610},{'id':'02-waterfront','name':'Waterfront pavilions','position':[98,55,24],'target':[30,0,-55],'lens':32},{'id':'03-arrival','name':'Arrival and Owners Enclosure','position':[-202,83,25],'target':[-136,3,-64],'lens':32},{'id':'04-concours','name':'Concours lawn and hospitality','position':[36,67,143],'target':[39,1,35],'lens':32},{'id':'05-lounges','name':'Hospitality lounges','position':[125,20,62],'target':[83,1,22],'lens':35},{'id':'06-interior','name':'Owners Enclosure furnished interior','position':[-105.7,1.9,-53.0],'target':[-105.7,1.5,-73],'lens':24}]
def scene_notes(scene):
 notes=bpy.data.texts.new('READ ME - editable event studio');notes.write('ROYAL BAHRAIN CONCOURS 2026\n\nSource: '+scene['site']['sourceName']+'\nAll horizontal footprints are calibrated from the vector source; source dimension unit is assumed to be mm. Six calibration spans agree within 1.5mm. This is a visualization model, not a fabrication drawing.\n\nEDITING\nSource objects appear as named Empty parents. Expand each to edit Roof, Frame, Walls and Floor independently. Furniture is linked to catalogue product IDs and named parent tent. The object custom property event_object_json records the exact browser object for round trips. Re-import any saved browser revision using scripts/event-studio/import_layout.py.\n\nCoordinates: JSON Y-up metres -> Blender (x,-z,y). Object position is the floor/base origin, not its centre. All template meshes are linked for efficient editing; make single user when changing one instance.\n\nVertical dimensions, roof forms, openings, generic cars, palms, and material choices are estimated. Furnishings are proposed arrangements and do not reserve stock.\n\nPresentation cameras and a 90-second animated camera are supplied. Display / hide the roof meshes with their component custom property.\n')
 # Embed machine-readable revision and dimension evidence in editable text datablocks.
 for filename in ['site-seed.json','calibration-report.json','furnishing-report.json','references/venue-research.json']:
  text=bpy.data.texts.new(filename);text.write(json.dumps(scene,indent=2) if filename=='site-seed.json' else (OUT/filename).read_text())
def main():
 args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [];p=argparse.ArgumentParser();p.add_argument('--layout',default=str(OUT/'site-seed.json'));p.add_argument('--pilot',action='store_true');p.add_argument('--stills',action='store_true');p.add_argument('--reuse',action='store_true');p.add_argument('--output',default=str(OUT/'Royal-Bahrain-Concours-2026.blend'));a=p.parse_args(args)
 scene=json.loads(Path(a.layout).read_text());start=time.monotonic()
 if not a.reuse:
  parents,missing=import_scene(scene);lighting();scene_notes(scene)
  if missing:raise RuntimeError('Missing furniture models: '+str(sorted(set(missing))))
  cameras=[camera_for(v) for v in VIEWS]
  bpy.context.view_layer.update()
  # Furniture parent moves are represented by actual Blender parenting with transform preservation.
  for o in scene['objects']:
   host=o.get('metadata',{}).get('parentTentId')
   if host and host in parents:
    p=parents[o['id']];matrix=p.matrix_world.copy();p.parent=parents[host];p.matrix_world=matrix
  cam=camera_for({'name':'Animated 90-second walkthrough','position':VIEWS[0]['position'],'target':VIEWS[0]['target'],'lens':28});cam.name='CAM · Guided tour 90 seconds'
  frames=[1,361,721,1081,1441,1801,2160];sequence=[VIEWS[0],VIEWS[1],VIEWS[4],VIEWS[3],VIEWS[2],VIEWS[5],VIEWS[5]]
  for f,v in zip(frames,sequence):
   cam.location=coord(v['position']);aim(cam,v['target']);cam.keyframe_insert('location',frame=f);cam.keyframe_insert('rotation_euler',frame=f)
  bpy.context.scene.camera=cameras[0];bpy.context.scene.frame_set(1)
  # Remove template Empty containers from the visible outliner; mesh copies staylinked.
  for obj in list(bpy.data.objects):
   if 'template' in obj.name.lower() and obj.parent is None:obj.hide_render=True;obj.hide_set(True)
  for area in bpy.context.screen.areas if bpy.context.screen else []:
   if area.type=='VIEW_3D':area.spaces.active.region_3d.view_distance=350;area.spaces.active.clip_end=2500
  bpy.ops.wm.save_as_mainfile(filepath=a.output,compress=True)
 else:cameras=[bpy.data.objects['CAM · '+v['name']] for v in VIEWS]
 report={'blend':a.output,'objectCount':len(scene['objects']),'missingModels':[],'renders':[],'elapsedSeconds':0}
 renderdir=OUT/'renders';renderdir.mkdir(exist_ok=True)
 for i,(v,cam) in enumerate(zip(VIEWS,cameras)):
  if a.pilot and i>0:break
  if not (a.pilot or a.stills):break
  sc=bpy.context.scene;sc.camera=cam;sc.render.resolution_x=1280 if a.pilot else 3840;sc.render.resolution_y=720 if a.pilot else 2160;sc.eevee.taa_render_samples=16 if a.pilot else 48
  # Interior illumination uses a wide soft source under the roof.
  if i==5 and not bpy.data.objects.get('Interior ceiling fill'):
   bpy.ops.object.light_add(type='AREA',location=coord([-105.5,3.8,-69]));fill=bpy.context.object;fill.name='Interior ceiling fill';fill.data.energy=2200;fill.data.shape='RECTANGLE';fill.data.size=12;fill.data.size_y=18;fill.data.color=(1,.92,.8)
  path=renderdir/('pilot-overview.png' if a.pilot else v['id']+'.png');sc.render.filepath=str(path);t=time.monotonic();bpy.ops.render.render(write_still=True);report['renders'].append({'path':str(path),'width':sc.render.resolution_x,'height':sc.render.resolution_y,'seconds':time.monotonic()-t});print('RENDER_DONE',v['id'],round(time.monotonic()-t,2),flush=True)
 bpy.context.scene.camera=cameras[0];bpy.context.scene.render.resolution_x=3840;bpy.context.scene.render.resolution_y=2160
 if not a.pilot:bpy.ops.wm.save_as_mainfile(filepath=a.output,compress=True)
 report['elapsedSeconds']=time.monotonic()-start;(OUT/('blender-pilot-report.json' if a.pilot else 'blender-render-report.json')).write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)
if __name__=='__main__':main()






