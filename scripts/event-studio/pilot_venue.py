import bpy
from pathlib import Path
sc=bpy.context.scene;sc.camera=bpy.data.objects['CAM · Arrival and Owners Enclosure'];sc.render.resolution_x=1600;sc.render.resolution_y=900;sc.eevee.taa_render_samples=24;sc.render.filepath=str(Path(r'C:\Users\PICO\Desktop\New folder\apps\Pico Stock\private\event-studio\rbc\renders\pilot-architecture.png'));bpy.ops.render.render(write_still=True)
