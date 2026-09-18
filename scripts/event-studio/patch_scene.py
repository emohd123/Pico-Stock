import bpy,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from import_layout import coord
from build_blender import aim,VIEWS,OUT
for o in bpy.data.objects:
 if o.parent and o.parent.get('event_kind')=='furniture':o.hide_render=False;o.hide_set(False)
cam=bpy.data.objects['CAM · Owners Enclosure furnished interior'];v=VIEWS[-1];cam.location=coord(v['position']);cam.data.lens=v['lens'];aim(cam,v['target'])
# Persist the interior area light for interactive editing and future renders.
bpy.ops.object.light_add(type='AREA',location=coord([-105.5,3.8,-69]));fill=bpy.context.object;fill.name='Interior ceiling fill';fill.data.energy=2200;fill.data.shape='RECTANGLE';fill.data.size=12;fill.data.size_y=18;fill.data.color=(1,.92,.8)
bpy.context.scene.camera=bpy.data.objects['CAM · Full event overview'];bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'Royal-Bahrain-Concours-2026.blend'))
