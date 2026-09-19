import bpy,json,sys
from pathlib import Path
root=Path(__file__).resolve().parents[2];out=root/'private/event-studio/rbc'
if not bpy.data.objects.get('Interior ceiling fill'):
 bpy.ops.object.light_add(type='AREA',location=(-105.5,69,3.8));fill=bpy.context.object;fill.name='Interior ceiling fill';fill.data.energy=2200;fill.data.shape='RECTANGLE';fill.data.size=12;fill.data.size_y=18;fill.data.color=(1,.92,.8)
sc=bpy.context.scene;sc.camera=bpy.data.objects['CAM · Full event overview'];sc.render.resolution_x=3840;sc.render.resolution_y=2160;sc.eevee.shadow_pool_size='1024';sc.frame_set(1)
sc['event_scene_json']=(out/'site-seed.json').read_text()
for name in ['site-seed.json','calibration-report.json','furnishing-report.json','references/venue-research.json']:
 txt=bpy.data.texts.get(name) or bpy.data.texts.new(name);txt.clear();txt.write((out/name).read_text())
bpy.ops.wm.save_as_mainfile(filepath=str(out/'Royal-Bahrain-Concours-2026.blend'),compress=True)
sys.path.insert(0,str(root/'scripts/event-studio'));exec((root/'scripts/event-studio/verify_blender.py').read_text(),{'__file__':str(root/'scripts/event-studio/verify_blender.py'),'__name__':'__main__'})
