"""Import an Event Studio revision into Blender 4.5 (metres, Z-up).
Run: blender -b --python import_layout.py -- --layout revision.json --output revision.blend
The JSON uses Y-up. Coordinate conversion is (x,y,z)->(x,-z,y); Y yaw -> Z yaw.
"""
import bpy, math, json, sys, argparse, random
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]; ASSET_CACHE={}; MATERIALS={}
def coord(p):return (p[0],-p[2],p[1])
def footprint(o):
 w,h,d=o['dimensions'];pts=o.get('points')
 if not pts:return [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]]
 pw=max(p[0] for p in pts)-min(p[0] for p in pts);pd=max(p[1] for p in pts)-min(p[1] for p in pts)
 return [[x*w/pw,z*d/pd] for x,z in pts] if pw and pd else pts
def material(name,color,rough=.6,metal=0,alpha=1):
 if name in MATERIALS:return MATERIALS[name]
 m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF');color=color.lstrip('#');srgb=tuple(int(color[i:i+2],16)/255 for i in (0,2,4));rgb=tuple(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in srgb);p.inputs['Base Color'].default_value=(*rgb,alpha);p.inputs['Roughness'].default_value=rough;p.inputs['Metallic'].default_value=metal
 if alpha<1:p.inputs['Transmission Weight'].default_value=.25;p.inputs['Alpha'].default_value=alpha
 MATERIALS[name]=m;return m
def mesh(name,verts,faces,mat,parent=None):
 data=bpy.data.meshes.new(name);data.from_pydata(verts,[],faces);data.materials.append(mat);data.update();o=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(o)
 if parent:o.parent=parent
 return o
def cube(name,loc,scale,mat,parent=None,bevel=0):
 x,y,z=[a/2 for a in scale];v=[(sx*x,sy*y,sz*z) for sz in [-1,1] for sy in [-1,1] for sx in [-1,1]];f=[(0,1,3,2),(4,6,7,5),(0,4,5,1),(2,3,7,6),(0,2,6,4),(1,5,7,3)];o=mesh(name,v,f,mat,parent);o.location=loc
 if bevel:mod=o.modifiers.new('Soft manufactured edges','BEVEL');mod.width=bevel;mod.segments=2;o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
 return o
def rod(name,a,b,r,mat,parent=None,sides=8):
 a=Vector(a);b=Vector(b);vec=b-a;h=vec.length;v=[(r*math.cos(i*math.tau/sides),r*math.sin(i*math.tau/sides),z) for z in [0,h] for i in range(sides)];f=[tuple(range(sides-1,-1,-1)),tuple(range(sides,sides*2))]+[(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)];o=mesh(name,v,f,mat,parent);o.location=a;o.rotation_euler=vec.to_track_quat('Z','Y').to_euler();return o
def polyfloor(name,pts,z,mat,parent):
 from mathutils.geometry import tessellate_polygon
 verts=[Vector((x,-y,z)) for x,y in pts];tri=tessellate_polygon([verts]);faces=[tuple(v if isinstance(v,int) else verts.index(v) for v in t) for t in tri];return mesh(name,[tuple(v) for v in verts],faces,mat,parent)
def world_parent(o):
 p=bpy.data.objects.new(o['id']+' · '+o['name'],None);bpy.context.collection.objects.link(p);p.location=coord(o['position']);p.rotation_euler=(0,0,o.get('rotation',[0,0,0])[1]);p['event_object_id']=o['id'];p['event_kind']=o['kind'];p['event_dimensions_m']=o['dimensions'];p['event_metadata']=json.dumps(o.get('metadata',{}));p['event_object_json']=json.dumps(o);p.hide_viewport=not o.get('visible',True);p.hide_render=not o.get('visible',True);return p

def tent(o,parent):
 w,h,d=o['dimensions'];e=o.get('metadata',{}).get('eaveHeight',3.2);e=min(e,h-.2);pts=footprint(o)
 pts=[p for i,p in enumerate(pts) if math.dist(p,pts[i-1])>.025]
 canvas_color=o.get('color','#ece8d9');ivory=material('Tensile canvas '+canvas_color,canvas_color,.68);frame=material('Brushed champagne aluminium','#96958c',.32,.55);floor=material('Warm oak event decking','#ae9168',.8);glass=material('Clear soft-blue glazing','#b1c9c5',.22,.05,.72);dark=material('Tent joinery','#6d695c',.7)
 f=polyfloor(parent.name+' | Floor',pts,.11,floor,parent);f['component']='floor'
 # Soft curved pagoda roof assembled as editable mesh rings.
 if o.get('roofType')=='pagoda':
  verts=[];rise=h-e;rings=[(1.025,e),(1,e+.05*rise),(.72,e+.22*rise),(.42,e+.5*rise),(.12,e+.82*rise),(0,h)]
  for r,z in rings:verts.extend([(x*r,-y*r,z) for x,y in pts])
  faces=[]
  for k in range(len(rings)-1):
   n=len(pts)
   for i in range(n):faces.append((k*n+i,k*n+(i+1)%n,(k+1)*n+(i+1)%n,(k+1)*n+i))
  roof=mesh(parent.name+' | Roof',verts,faces,ivory,parent)
 elif not o.get('points') and o.get('roofType')=='gable':
  v=[(-w/2,-d/2,e),(0,-d/2,h),(w/2,-d/2,e),(-w/2,d/2,e),(0,d/2,h),(w/2,d/2,e)];roof=mesh(parent.name+' | Roof',v,[(0,1,4,3),(1,2,5,4),(0,2,1),(3,4,5)],ivory,parent)
 elif o.get('points') and o.get('roofType')=='gable':
  xmin=min(p[0] for p in pts);xmax=max(p[0] for p in pts);ridge=(xmin+xmax)/2;half=(xmax-xmin)/2
  def clip(side):
   out=[]
   for i,a in enumerate(pts):
    b=pts[(i+1)%len(pts)];ina=(a[0]-ridge)*side>=-1e-8;inb=(b[0]-ridge)*side>=-1e-8
    if ina:out.append(a)
    if ina!=inb:
     t=(ridge-a[0])/(b[0]-a[0]);out.append([ridge,a[1]+t*(b[1]-a[1])])
   return out
  verts=[];faces=[]
  for side in [-1,1]:
   p=clip(side);first=len(verts);verts.extend([(x,-z,e+(h-e)*(1-abs(x-ridge)/half)) for x,z in p]);faces.append(tuple(range(first,len(verts))))
  roof=mesh(parent.name+' | Roof',verts,faces,ivory,parent)
 elif o.get('roofType')=='flat':roof=polyfloor(parent.name+' | Roof',pts,h,ivory,parent)
 else:
  verts=[(x,-y,e) for x,y in pts]+[(0,0,h)];n=len(pts);roof=mesh(parent.name+' | Roof',verts,[(i,(i+1)%n,n) for i in range(n)],ivory,parent)
 roof['component']='roof'
 # Posts and beam network; all open bays retain a walking entrance.
 perimeter=[]
 for i,(x,z) in enumerate(pts):
  nx,nz=pts[(i+1)%len(pts)];length=math.dist((x,z),(nx,nz));div=max(1,round(length/5))
  for k in range(div):perimeter.append((x+(nx-x)*k/div,z+(nz-z)*k/div))
 for i,(x,z) in enumerate(perimeter):
  post=rod(parent.name+f' | Post {i+1}',(x,-z,.11),(x,-z,e),.055,frame,parent);post['component']='frame'
 for i,(x,z) in enumerate(pts):
  nx,nz=pts[(i+1)%len(pts)];beam=rod(parent.name+f' | Eave {i+1}',(x,-z,e),(nx,-nz,e),.045,frame,parent);beam['component']='frame'
 lower=e*.375;glazing=max(.15,e-lower-.3);lower_c=.11+lower/2;glass_c=.11+lower+glazing/2
 # Rectangular shells have back/side fabric panels with glazed upper strips.
 # Polygon shells follow the same footprint and use a centred front opening.
 if not o.get('points'):
  for label,loc,sc in [('Back',(0,d/2,lower_c),(w,.035,lower)),('Left',(-w/2,0,lower_c),(.035,d,lower)),('Right',(w/2,0,lower_c),(.035,d,lower))]:
   wall=cube(parent.name+' | '+label+' wall',loc,sc,ivory,parent);wall['component']='wall'
  for label,loc,sc in [('Back',(0,d/2,glass_c),(w,.025,glazing)),('Left',(-w/2,0,glass_c),(.025,d,glazing)),('Right',(w/2,0,glass_c),(.025,d,glazing))]:
   wall=cube(parent.name+' | '+label+' window',loc,sc,glass,parent);wall['component']='wall'
  # Side frontage panels frame a central open doorway 40 percent of the width.
  opening=min(max(2.2,w*.4),w-1)
  for sign in [-1,1]:
   pw=(w-opening)/2;wall=cube(parent.name+' | Entrance return',(sign*(opening/2+pw/2),-d/2,.11+(e-.2)/2),(pw,.035,e-.2),ivory,parent);wall['component']='wall'
 # Polygon walls follow every actual edge, with a centred front entrance.
 if o.get('points'):
  front=max(range(len(pts)),key=lambda i:((pts[i][1]+pts[(i+1)%len(pts)][1])/2,(pts[i][0]+pts[(i+1)%len(pts)][0])/2))
  for i,(x,z) in enumerate(pts):
   nx,nz=pts[(i+1)%len(pts)];length=math.dist((x,z),(nx,nz))
   if length<.03:continue
   angle=math.atan2(-(nz-z),nx-x);ranges=[(0,1)]
   if i==front:
    gap=min(2.2,length*.65);f=(length-gap)/length/2;ranges=[(0,f),(1-f,1)]
   for a,b in ranges:
    if b-a<.01:continue
    mid=(a+b)/2;cx=x+(nx-x)*mid;cy=-(z+(nz-z)*mid);seg=length*(b-a)
    for label,cz,ch,mat in [('fabric',lower_c,lower,ivory),('glazing',glass_c,glazing,glass)]:
     wall=cube(parent.name+f' | Wall {i+1} '+label,(cx,cy,cz),(seg,.035,ch),mat,parent);wall.rotation_euler.z=angle;wall['component']='wall'
 return parent

def car_template(color):
 key=('car',color)
 if key in ASSET_CACHE:return ASSET_CACHE[key]
 root=bpy.data.objects.new('Car template',None);bpy.context.collection.objects.link(root);paint=material('Automotive lacquer '+color,color,.24,.55);glass=material('Automotive tinted glass','#263739',.14,.35);rubber=material('Tyre rubber','#202323',.88);chrome=material('Wheel alloy','#b7bab5',.22,.85);light=material('Headlamp lenses','#f4efd2',.25)
 cube('Rounded body',(0,0,.62),(1.86,4.65,.72),paint,root,.2);cube('Cabin glass',(0,-.1,1.12),(1.63,2.16,.57),glass,root,.18);cube('Roof',(0,-.18,1.44),(1.49,1.72,.07),paint,root,.05)
 for x in [-.89,.89]:
  for y in [-1.42,1.42]:
   rod('Tyre',(x-.12,y,.4),(x+.12,y,.4),.35,rubber,root,14);rod('Alloy',(x-.125,y,.4),(x+.125,y,.4),.2,chrome,root,10)
 for x in [-.6,.6]:cube('Headlamp',(x,-2.31,.74),(.42,.05,.18),light,root,.02)
 cube('Grille',(0,-2.36,.51),(.9,.04,.2),chrome,root)
 ASSET_CACHE[key]=[o for o in root.children]
 for o in root.children:o.hide_render=True;o.hide_set(True)
 root.hide_render=True;return ASSET_CACHE[key]
def clone_children(templates,parent,scale=(1,1,1)):
 for t in templates:
  c=t.copy();c.data=t.data;bpy.context.collection.objects.link(c);c.parent=parent;c.hide_render=False;c.hide_set(False);c.location=tuple(t.location[i]*scale[i] for i in range(3));c.scale=tuple(t.scale[i]*scale[i] for i in range(3))
def palm_template():
 key='palm'
 if key in ASSET_CACHE:return ASSET_CACHE[key]
 root=bpy.data.objects.new('Palm template',None);bpy.context.collection.objects.link(root)
 trunk=material('Palm ringed bark','#806649',.92);leaf=material('Palm date fronds','#486d37',.78)
 # Venue photographs show dense arching pinnate crowns, not thin wire symbols.
 verts=[];faces=[];sides=12;rows=32
 for j in range(rows+1):
  t=j/rows;radius=(.21-.065*t)*(1+.045*math.sin(j*math.pi/2));verts.extend([(.11*t*t+radius*math.cos(i*math.tau/sides),radius*math.sin(i*math.tau/sides),t*5.65) for i in range(sides)])
 for j in range(rows):
  for i in range(sides):faces.append((j*sides+i,j*sides+(i+1)%sides,(j+1)*sides+(i+1)%sides,(j+1)*sides+i))
 mesh('Palm textured trunk',verts,faces,trunk,root)
 verts=[];faces=[]
 for j in range(24):
  a=j*2.399963;layer=j%3
  def stem(t):
   r=(2.45-.22*layer)*t;z=5.66+.48*layer+math.sin(t*math.pi)*(.9-.1*layer)-t*t*(1.05-.33*layer)
   return Vector((.11+math.cos(a)*r,math.sin(a)*r,z))
  # Central rib is a tapered ribbon; paired tapered leaflets catch the light.
  for k in range(16):
   t=k/16;u=(k+1)/16;c=stem(t);n=stem(u);side=Vector((-math.sin(a),math.cos(a),0))*(.028*(1-t)+.006);idx=len(verts);verts.extend([tuple(c-side),tuple(c+side),tuple(n+side*.9),tuple(n-side*.9)]);faces.append((idx,idx+1,idx+2,idx+3))
  for k in range(2,19):
   t=k/20;c=stem(t);length=.66*math.sin(math.pi*t)**.6*(1-.3*t)
   for sign in [-1,1]:
    lateral=Vector((math.cos(a+sign*.95),math.sin(a+sign*.95),-.34));tip=c+lateral*length;along=Vector((math.cos(a),math.sin(a),0))*.07;mid=c+lateral*length*.5;idx=len(verts);verts.extend([tuple(c-along*.45),tuple(mid-along),tuple(tip),tuple(mid+along),tuple(c+along*.45)]);faces.append((idx,idx+1,idx+2,idx+3,idx+4))
 mesh('Palm full pinnate crown',verts,faces,leaf,root)
 templates=list(root.children);allv=[v.co for obj in templates for v in obj.data.vertices];mn=[min(v[i] for v in allv) for i in range(3)];mx=[max(v[i] for v in allv) for i in range(3)]
 # Canonical exact5x5x7m template; existing per-tree declared dimensions remain authoritative.
 for obj in templates:
  for v in obj.data.vertices:v.co=((v.co.x-(mn[0]+mx[0])/2)*5/(mx[0]-mn[0]),(v.co.y-(mn[1]+mx[1])/2)*5/(mx[1]-mn[1]),(v.co.z-mn[2])*7/(mx[2]-mn[2]))
  obj.hide_render=True;obj.hide_set(True)
 ASSET_CACHE[key]=templates;root.hide_render=True;return templates

def furniture(o,parent,registry):
 a=registry.get(o.get('assetId'))
 if not a:return False
 path=ROOT/'public'/a['modelUrl'].lstrip('/')
 if not path.exists():return False
 if a['id'] not in ASSET_CACHE:
  before=set(bpy.data.objects);bpy.ops.import_scene.gltf(filepath=str(path));created=[x for x in bpy.data.objects if x not in before];meshes=[x for x in created if x.type=='MESH'];templates=[]
  # Bake imported hierarchy transforms so future copies share data at a knownorigin.
  for x in meshes:
   data=x.data.copy();data.transform(x.matrix_world);tmp=bpy.data.objects.new('Furniture template · '+a['name'],data);bpy.context.collection.objects.link(tmp);tmp.hide_render=True;tmp.hide_set(True);templates.append(tmp)
  for x in created:bpy.data.objects.remove(x,do_unlink=True)
  ASSET_CACHE[a['id']]=templates
 dims=o['dimensions'];original=a['dimensions'];scale=(dims[0]/original[0],dims[2]/original[2],dims[1]/original[1]);clone_children(ASSET_CACHE[a['id']],parent,scale)
 if o.get('color') and o['color'].lower()!=a.get('color','').lower():
  tint=material('Furniture custom '+o['color'],o['color'],.65)
  for child in parent.children:
   if child.type=='MESH':
    child.data=child.data.copy()
    for i,mat in enumerate(child.data.materials):
     if mat and ('body' in mat.name.lower() or 'upholstery' in mat.name.lower()):child.data.materials[i]=tint
 return True

def detailed_surface(kind,col):
 mat=material(kind+' detailed '+col,col,.2 if kind=='water' else .87,.28 if kind=='water' else 0)
 if mat.get('venue_detail'):return mat
 mat['venue_detail']=True;n=mat.node_tree.nodes;links=mat.node_tree.links;p=n.get('Principled BSDF');geo=n.new('ShaderNodeNewGeometry');noise=n.new('ShaderNodeTexNoise');links.new(geo.outputs['Position'],noise.inputs['Vector']);noise.inputs['Scale'].default_value=.7 if kind=='water' else 35;noise.inputs['Detail'].default_value=2
 bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.24 if kind=='water' else .16;bump.inputs['Distance'].default_value=.035 if kind=='water' else .018;links.new(noise.outputs['Fac'],bump.inputs['Height']);links.new(bump.outputs['Normal'],p.inputs['Normal'])
 if kind!='water':
  broad=n.new('ShaderNodeTexNoise');broad.inputs['Scale'].default_value=.065;broad.inputs['Detail'].default_value=2;links.new(geo.outputs['Position'],broad.inputs['Vector']);ramp=n.new('ShaderNodeValToRGB');base=p.inputs['Base Color'].default_value[:];ramp.color_ramp.elements[0].color=tuple(v*.8 for v in base[:3])+(1,);ramp.color_ramp.elements[1].color=tuple(min(1,v*1.15) for v in base[:3])+(1,);links.new(broad.outputs['Fac'],ramp.inputs['Fac']);links.new(ramp.outputs['Color'],p.inputs['Base Color'])
 return mat

def stone_edge(o,parent):
 pts=footprint(o);verts=[];faces=[]
 # Narrow visual coping follows the exact source shoreline; thickness is an estimate.
 for i,(x,z) in enumerate(pts):
  nx,nz=pts[(i+1)%len(pts)];length=math.hypot(nx-x,nz-z)
  if length<.001:continue
  px=-(nz-z)/length*.16;pz=(nx-x)/length*.16;idx=len(verts)
  verts.extend([(xx,-zz,yy) for yy in [.01,.25] for xx,zz in [(x+px,z+pz),(nx+px,nz+pz),(nx-px,nz-pz),(x-px,z-pz)]])
  faces.extend([tuple(idx+j for j in f) for f in [(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7),(4,5,6,7)]])
 mat=detailed_surface('stone','#b2aa96');n=mat.node_tree.nodes;links=mat.node_tree.links;p=n.get('Principled BSDF');geo=n.new('ShaderNodeNewGeometry');vor=n.new('ShaderNodeTexVoronoi');vor.distance='EUCLIDEAN';vor.feature='DISTANCE_TO_EDGE';vor.inputs['Scale'].default_value=5;links.new(geo.outputs['Position'],vor.inputs['Vector']);b=n.new('ShaderNodeBump');b.inputs['Strength'].default_value=.6;b.inputs['Distance'].default_value=.065;links.new(vor.outputs['Distance'],b.inputs['Height']);links.new(b.outputs['Normal'],p.inputs['Normal'])
 edge=mesh(parent.name+' | Pale stone shoreline coping',verts,faces,mat,parent);edge['component']='shoreline';edge['measurement_status']='estimated detail; source shoreline retained'

def venue_building(o,parent):
 arch=o.get('metadata',{}).get('architecture');pts=footprint(o);w,h,d=o['dimensions'];frame=material('Venue pale structural frame '+o.get('color','#c7c6bd'),o.get('color','#c7c6bd'),.38,.2);glass=material('Venue reflective blue-grey glazing','#657d83',.17,.35)
 def ring(name,level,radius_scale=1):
  n=len(pts);v=[(x*radius_scale,-z*radius_scale,y) for y in [level-.09,level+.09] for x,z in pts];faces=[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)];return mesh(parent.name+' | '+name,v,faces,frame,parent)
 if arch=='royal-majlis':
  frame=material('Majlis dark metal diamond frame','#687475',.29,.6);glass=material('Majlis reflective glazing '+o.get('color','#729395'),o.get('color','#729395'),.15,.4);roofmat=material('Majlis pale roof cap','#b3b7b3',.5,.15)
  n=len(pts);v=[(x,-z,y) for y in [.1,h-.1] for x,z in pts];body=mesh(parent.name+' | Circular glass envelope',v,[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],glass,parent);body['component']='wall';polyfloor(parent.name+' | Roof',pts,h,roofmat,parent)['component']='roof';polyfloor(parent.name+' | Floor',pts,.1,frame,parent)['component']='floor';ring('Top rim',h-.1);ring('Base rim',.12)
  verts=[];faces=[];rx=w/2;rz=d/2
  for sign in [-1,1]:
   for line in range(24):
    for k in range(28):
     j=len(verts)
     for t in [k/28,(k+1)/28]:
      a=line*math.tau/24+sign*t*math.pi*.95
      for offset in [-.0035,.0035]:verts.append(((rx+.015)*math.cos(a+offset),-(rz+.015)*math.sin(a+offset),.16+t*(h-.32)))
     faces.append((j,j+1,j+3,j+2))
  grid=mesh(parent.name+' | Diamond facade lattice',verts,faces,frame,parent);grid['component']='frame'
  door=cube(parent.name+' | West entrance glazing',(-rx-.025,0,1.55),(.045,2.5,3.1),material('Venue dark entrance glass','#365257',.2,.3),parent);door['component']='wall'
  for y in [-1.28,1.28]:rod(parent.name+' | Door frame',(-rx-.06,y,0),(-rx-.06,y,3.15),.055,frame,parent)
  return
 # Existing architecture keeps the exact concave/rotated source footprint.
 ismain=arch=='royal-clubhouse-main';low=.70*h if ismain else h-.3;profile=o.get('metadata',{}).get('roofProfile',[[0,.96],[.35,.99],[.65,1],[.78,.97],[.9,.87],[1,.72]])
 a,b=pts[:2];axis=Vector((b[0]-a[0],b[1]-a[1]));axis.normalize();projs=[x*axis.x+z*axis.y for x,z in pts];lo=min(projs);hi=max(projs)
 def roofheight(x,z):
  if not ismain:return h
  t=max(0,min(1,((x*axis.x+z*axis.y)-lo)/(hi-lo)))
  for i,(u,yy) in enumerate(profile[1:],1):
   if t<=u:
    u0,y0=profile[i-1];f=(t-u0)/(u-u0);return h*(y0+(yy-y0)*f)
  return h*profile[-1][1]
 n=len(pts);verts=[(x,-z,y) for y in [.25,low] for x,z in pts];walls=mesh(parent.name+' | Glazed facade',verts,[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],glass,parent);walls['component']='wall'
 for level in [.2,low*.48,low]:
  slab=polyfloor(parent.name+' | Structural floor slab',pts,level,frame,parent);slab['component']='floor';ring('Horizontal fascia',level)
 for i,(x,z) in enumerate(pts):
  nx,nz=pts[(i+1)%n];length=math.hypot(nx-x,nz-z);count=max(1,math.ceil(length/2.8))
  for k in range(count):
   t=k/count;cx=x+(nx-x)*t;cz=z+(nz-z)*t;post=rod(parent.name+' | Facade mullion',(cx,-cz,.1),(cx,-cz,low),.05,frame,parent,6);post['component']='frame'
 if ismain and len(pts)==4:
  # Roof strips interpolate inside the original four boundary edges.
  verts=[];faces=[];a,b,c,d0=pts
  for i in range(49):
   t=i/48
   for pa,pb in [(a,b),(d0,c)]:
    x=pa[0]+(pb[0]-pa[0])*t;z=pa[1]+(pb[1]-pa[1])*t;verts.append((x,-z,roofheight(x,z)))
  for i in range(48):faces.append((i*2,i*2+1,i*2+3,i*2+2))
  roof=mesh(parent.name+' | Asymmetric curved roof',verts,faces,frame,parent);roof['component']='roof';solid=roof.modifiers.new('Roof slab thickness','SOLIDIFY');solid.thickness=.22
  for side in [0,1]:
   v=[];f=[]
   for i in range(49):
    x,y,z=verts[i*2+side];v.extend([(x,y,low),(x,y,z-.2)])
   for i in range(48):f.append((i*2,i*2+2,i*2+3,i*2+1))
   panel=mesh(parent.name+' | Upper clerestory glazing',v,f,glass,parent);panel['component']='wall'
 else:polyfloor(parent.name+' | Flat roof',pts,h,frame,parent)['component']='roof'

def import_scene(scene,clear=True):
 if clear:bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
 sc=bpy.context.scene;sc.unit_settings.system='METRIC';sc.unit_settings.scale_length=1
 registry_path=ROOT/'private/event-studio/rbc/furniture-assets.json';registry={a['id']:a for a in json.loads(registry_path.read_text())['items']} if registry_path.exists() else {}
 turf=detailed_surface('ground',scene['site'].get('appearance',{}).get('turfColor','#71924c'))
 b=scene['site']['bounds'];cube('Event site terrain',((b['minX']+b['maxX'])/2,-(b['minZ']+b['maxZ'])/2,-.2),(b['maxX']-b['minX'],b['maxZ']-b['minZ'],.3),turf)
 missing=[];parents={}
 for n,o in enumerate(scene['objects']):
  par=world_parent(o);parents[o['id']]=par;kind=o['kind'];w,h,d=o['dimensions'];col=o.get('color','#e2dfd0')
  if kind=='tent':tent(o,par)
  elif kind=='furniture':
   if not furniture(o,par,registry):missing.append(o['assetId']);cube('Missing model proxy',(0,0,h/2),(w,d,h),material('Missing furniture',col),par)
  elif kind=='building' and o.get('metadata',{}).get('architecture'):venue_building(o,par)
  elif kind=='car':clone_children(car_template(col),par,(w/1.9,d/4.7,h/1.5))
  elif kind=='tree':clone_children(palm_template(),par,(w/5,d/5,h/7))
  elif kind in ['ground','path','water','stage']:
   mat=detailed_surface(kind,'#567f85' if kind=='water' else col) if kind in ['ground','water'] else material(kind+' '+col,col,.85);pts=footprint(o);polyfloor(par.name+' | Surface',pts,.025 if kind=='water' else .04 if kind=='ground' else max(h,.06),mat,par)
   if kind=='water' and o.get('metadata',{}).get('stoneEdge'):stone_edge(o,par)
  elif kind=='sign':
   mat=material('Arch ivory',col);cube('Arch left',(-w/2+.2,0,h/2),(.4,d,h),mat,par);cube('Arch right',(w/2-.2,0,h/2),(.4,d,h),mat,par);cube('Arch header',(0,0,h-.3),(w,d,.6),mat,par)
  else:
   mat=material('Building '+col,col,.8)
   if o.get('points'):
    pts=footprint(o);verts=[(x,-z,y) for y in [0,h] for x,z in pts];N=len(pts);faces=[tuple(range(N,N*2))]+[(i,(i+1)%N,(i+1)%N+N,i+N) for i in range(N)];mesh(par.name+' | Building shell',verts,faces,mat,par)
   else:cube(par.name+' | Building shell',(0,0,h/2),(w,d,h),mat,par)
  if n%100==0:print('Imported',n,'/',len(scene['objects']),flush=True)
 sc['event_scene_json']=json.dumps(scene);sc['event_missing_assets']=json.dumps(sorted(set(missing)));sc['event_source']=scene['site']['sourceName'];sc['event_measurement_notice']='Horizontal footprints follow the dimension-calibrated plan. Heights, roofs, furniture reconstructions, terrain and material choices are editable estimates.'
 bpy.context.view_layer.update()
 for o in scene['objects']:
  host=o.get('metadata',{}).get('parentTentId')
  if host in parents and o['id'] in parents:
   obj=parents[o['id']];matrix=obj.matrix_world.copy();obj.parent=parents[host];obj.matrix_world=matrix
 bpy.context.view_layer.update()
 # Parent visibility in Blender does not automatically hide child meshes.
 for o in scene['objects']:
  if o.get('visible') is False:
   par=parents[o['id']]
   for child in [par,*par.children_recursive]:child.hide_render=True;child.hide_set(True)
 return parents,missing

def main():
 args=sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [];p=argparse.ArgumentParser();p.add_argument('--layout',required=True);p.add_argument('--output',required=True);a=p.parse_args(args);scene=json.loads(Path(a.layout).read_text());parents,missing=import_scene(scene);bpy.ops.wm.save_as_mainfile(filepath=str(Path(a.output).resolve()));print('Imported objects',len(parents),'Missing furniture assets',len(set(missing)))
if __name__=='__main__':main()






