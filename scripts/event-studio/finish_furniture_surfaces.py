"""Close curved upholstery end caps and remove coincident umbrella cloth surfaces."""
from pathlib import Path
import bpy,bmesh,json,sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
import build_furniture as b

def main():
    bpy.ops.wm.open_mainfile(filepath=str(b.OUTPUT/'furniture-library.blend'))
    items=json.loads((b.DATA/'furniture-assets.json').read_text(encoding='utf8'))['items']
    for col in bpy.data.collections:col.hide_render=True
    camera,studio=b.setup_render();fixed=[]
    for item in items:
        root=bpy.data.objects[item['id']];collection=bpy.data.collections[item['id']];parts=[o for o in collection.objects if o.type=='MESH'];changed=False
        for obj in parts:
            if obj.name.startswith(('Curved upholstered plinth','Continuous curved back','Curved upholstered shell','Carved curved white base')):
                mesh=bmesh.new();mesh.from_mesh(obj.data);boundary=[e for e in mesh.edges if e.is_boundary]
                if boundary:
                    result=bmesh.ops.holes_fill(mesh,edges=boundary,sides=0)
                    for face in result['faces']:face.smooth=False
                    bmesh.ops.recalc_face_normals(mesh,faces=list(mesh.faces));mesh.to_mesh(obj.data);obj.data.update();changed=True
                mesh.free()
            if obj.name.startswith('Pleated tablecloth'):
                top=max(v.co.z for v in obj.data.vertices)
                for v in obj.data.vertices:
                    if abs(v.co.z-top)<.0001:v.co.z+=.006
                obj.data.update();changed=True
        if not changed:continue
        grid=root.location.copy();root.location=(0,0,0);bpy.context.view_layer.update();b.CURRENT=collection;b.export_asset(root,parts,item)
        w,h,d=item['dimensions'];scale=max(w,h,d);camera.location=(scale*1.5,-scale*2.4,scale*1.55+h*.22);b.aim(camera,(0,0,h*.45));camera.data.ortho_scale=max(w*1.6,h*1.55,d*1.6)
        collection.hide_render=False;bpy.context.scene.render.filepath=str(b.OUT/'previews'/(item['productId']+'.png'));bpy.ops.render.render(write_still=True);collection.hide_render=True;root.location=grid
        fixed.append(item['productId']);print('SURFACE FIX '+item['productId'],flush=True)
    for col in bpy.data.collections:
        if col.name.startswith('furniture-'):col.hide_render=False
        else:col.hide_render=True;col.hide_viewport=True
    bpy.ops.wm.save_as_mainfile(filepath=str(b.OUTPUT/'furniture-library.blend'),compress=True)
    (b.DATA/'furniture-surface-review.json').write_text(json.dumps({'corrected':fixed},indent=2),encoding='utf8')
    print('SURFACE REVIEW COMPLETE '+str(len(fixed)),flush=True)

if __name__=='__main__':main()
