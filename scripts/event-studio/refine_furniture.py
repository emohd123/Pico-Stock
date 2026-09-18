"""Apply photo-review refinements to the generated full library without rebuilding it."""
from pathlib import Path
import sys,json
import bpy

HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
import build_furniture as b

def main():
    bpy.ops.wm.open_mainfile(filepath=str(b.OUTPUT/'furniture-library.blend'))
    registry=json.loads((b.DATA/'furniture-assets.json').read_text(encoding='utf8'))
    refinements={'wh-cocktail-table','wh-gold-side-table','wh-sleek-gold-coffee-table','wh-outdoor-weaved-chair','wh-oval-travertine-coffee-table','wh-traditional-arabic-chair','wh-weaved-clay-pot'}
    for col in list(bpy.data.collections):col.hide_render=True
    cam,studio=b.setup_render()
    for index,item in enumerate(registry['items']):
        col=bpy.data.collections.get(item['id']);root=bpy.data.objects.get(item['id'])
        if item['productId'] in refinements:
            for obj in list(col.objects):bpy.data.objects.remove(obj,do_unlink=True)
            bpy.data.collections.remove(col)
            root,parts,col=b.build_asset(item);b.export_asset(root,parts,item)
            w,h,d=item['dimensions'];s=max(w,h,d);cam.location=(s*1.5,-s*2.4,s*1.55+h*.22);b.aim(cam,(0,0,h*.45));cam.data.ortho_scale=max(w*1.6,h*1.55,d*1.6)
            col.hide_render=False;bpy.context.scene.render.filepath=str(b.OUT/'previews'/(item['productId']+'.png'));bpy.ops.render.render(write_still=True);col.hide_render=True
            root.location=((index%11)*4,(index//11)*4,0)
        root['dimensionsMetresWHD']=json.dumps(item['dimensions'])
        if 'dimensionsWH D' in root:del root['dimensionsWH D']
        root.asset_mark();root.asset_data.description=item['notes'];root.asset_data.author='PICO Event Studio'
        col.asset_mark();col.asset_data.description=item['name']+' — '+item['notes'];col.asset_data.author='PICO Event Studio'
    for col in bpy.data.collections:
        if col.name.startswith('furniture-'):col.hide_render=False
        else:col.hide_render=True;col.hide_viewport=True
    bpy.ops.wm.save_as_mainfile(filepath=str(b.OUTPUT/'furniture-library.blend'),compress=True)
    print('PHOTO REVIEW REFINEMENTS COMPLETE',flush=True)

if __name__=='__main__':main()
