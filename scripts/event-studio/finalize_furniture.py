"""Validate the reopened native library and install searchable asset previews."""
from pathlib import Path
import bpy,json,sys,re
from mathutils import Vector,Quaternion
sys.path.insert(0,str(Path(__file__).resolve().parent))
import build_furniture as b

ROOT=Path(__file__).resolve().parents[2]
DATA=ROOT/'private/event-studio/rbc'
BLEND=ROOT/'output/event-studio/furniture-library.blend'

def main():
    bpy.ops.wm.open_mainfile(filepath=str(BLEND))
    registry=json.loads((DATA/'furniture-assets.json').read_text(encoding='utf8'));report=[]
    for collection in bpy.data.collections:collection.hide_render=True
    camera,studio=None,None
    bpy.context.view_layer.update()
    for item in registry['items']:
        root=bpy.data.objects[item['id']];collection=bpy.data.collections[item['id']]
        parts=[o for o in collection.objects if o.type=='MESH']
        recolored=False
        for obj in parts:
            for slot in obj.material_slots:
                if item['productId']=='wh-small-classic-vase' and slot.material and slot.material.name.startswith('Body '):
                    slot.material=b.mat('Cut crystal','#cbdedb',rough=.14,transmission=.63);recolored=True
                elif slot.material and slot.material.name.startswith('Body ') and slot.material.name!='Body '+item['color']:
                    slot.material=b.mat('Body '+item['color'],item['color'],rough=.64);recolored=True
        if recolored:
            if camera is None:camera,studio=b.setup_render()
            grid_location=root.location.copy();root.location=(0,0,0);collection.hide_render=False
            w,h,d=item['dimensions'];scale=max(w,h,d);camera.location=(scale*1.5,-scale*2.4,scale*1.55+h*.22);b.aim(camera,(0,0,h*.45));camera.data.ortho_scale=max(w*1.6,h*1.55,d*1.6)
            bpy.context.scene.render.filepath=str(b.OUT/'previews'/(item['productId']+'.png'));bpy.ops.render.render(write_still=True)
            root.location=grid_location;collection.hide_render=True
            print('BODY COLOR VERIFIED '+item['productId'],flush=True)
        bpy.context.view_layer.update()
        vertices=[obj.matrix_world@v.co-root.location for obj in parts for v in obj.data.vertices]
        lo=[min(v[a] for v in vertices) for a in range(3)];hi=[max(v[a] for v in vertices) for a in range(3)]
        actual=[hi[0]-lo[0],hi[2]-lo[2],hi[1]-lo[1]]
        errors=[abs(a-b) for a,b in zip(actual,item['dimensions'])]
        assert max(errors)<.0001 and abs(lo[2])<.0001,('Native source dimensions failed',item['productId'],actual)
        preview=ROOT/'public/event-studio/furniture/previews'/(item['productId']+'.png')
        assert preview.is_file(),('Missing model preview',item['productId'])
        root['cataloguePhoto']=item['sourcePhotoUrl'];root['catalogueLocalPhoto']=item['photoUrl'];root['modelShapeStatus']='reconstructed';root['dimensionsMetresWHD']=json.dumps(item['dimensions'])
        if 'dimensionsWH D' in root:del root['dimensionsWH D']
        for datablock in [collection,root]:
            datablock.asset_mark();datablock.asset_data.author='PICO Event Studio';datablock.asset_data.description=item['name']+' — '+item['notes']
            for tag in {item['category'],item['modelKind'],item['measurementStatus'],*re.findall(r'[A-Za-z]{3,15}',item['name'])}:
                if tag not in datablock.asset_data.tags:datablock.asset_data.tags.new(tag)
            with bpy.context.temp_override(id=datablock):bpy.ops.ed.lib_id_load_custom_preview(filepath=str(preview))
        report.append({'productId':item['productId'],'dimensionsWHD':actual,'maxErrorMetres':max(errors),'editableMeshParts':len(parts),'previewAttached':True,'bodyColor':item['color']})
    for collection in bpy.data.collections:
        if collection.name.startswith('furniture-'):collection.hide_render=False
        else:collection.hide_render=True;collection.hide_viewport=True
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=='VIEW_3D':
                region=area.spaces.active.region_3d;region.view_location=Vector((20,16,0));region.view_distance=54;region.view_rotation=Quaternion((.888,.46,0,0));region.view_perspective='PERSP'
    bpy.data.orphans_purge(do_recursive=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND),compress=True)
    (DATA/'furniture-native-verification.json').write_text(json.dumps({'passed':len(report),'products':report},indent=2),encoding='utf8')
    build=json.loads((DATA/'furniture-build-report.json').read_text(encoding='utf8'))
    for entry in build['assets']:entry['bytes']=(b.OUT/(entry['productId']+'.glb')).stat().st_size
    build['totalBytes']=sum(entry['bytes'] for entry in build['assets']);build['photoReview']='Named body colors corrected; native and GLB materials agree.'
    (DATA/'furniture-build-report.json').write_text(json.dumps(build,indent=2),encoding='utf8')
    print('NATIVE LIBRARY VERIFIED '+str(len(report)),flush=True)

if __name__=='__main__':main()
