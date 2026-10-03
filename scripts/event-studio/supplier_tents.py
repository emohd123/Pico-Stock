"""Supplier tent membrane, matching lib/eventStudioTents.js in Y-up metres."""
import math

def canopy(o,points):
 w,h,d=o['dimensions'];e=o.get('metadata',{}).get('eaveHeight',2.8);vertices=[];faces=[]
 if o['metadata']['supplierTent']=='mq40':
  perimeter=[]
  for i,a in enumerate(points):
   b=points[(i+1)%len(points)]
   for j in range(8):
    t=j/8;perimeter.append((a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,e-.38*math.sin(math.pi*t)))
  rings=12;n=len(perimeter)
  for k in range(rings+1):
   r=1-k/rings
   vertices.extend([(x*r,edge+(h-edge)*(1-r)**1.65,z*r) for x,z,edge in perimeter])
  for k in range(rings):
   for i in range(n):
    a=k*n+i;b=k*n+(i+1)%n;c=(k+1)*n+i;f=(k+1)*n+(i+1)%n;faces.extend([(a,b,c),(b,f,c)])
 else:
  nx=60;nz=30;peak=h-.3
  for j in range(nz+1):
   for i in range(nx+1):
    x=-w/2+w*i/nx;z=-d/2+d*j/nz;bay=w/3;centre=-w/2+bay/2+min(2,math.floor((x+w/2)/bay))*bay;t=min(1,abs(x-centre)/(bay/2));end=min(1,max(0,(w/2-abs(x))/(bay/2)))**.65;side=max(0,1-abs(z)/(d/2))**1.6;rise=(.4+.6*(1-t)**1.65)*end*side
    vertices.append((x,e+(peak-e)*rise,z))
  for j in range(nz):
   for i in range(nx):
    a=j*(nx+1)+i;b=a+1;c=a+nx+1;f=c+1;faces.extend([(a,c,b),(b,c,f)])
 return vertices,faces

def build(o,parent,footprint,mesh,material,polyfloor,rod,cube,coord):
 w,h,d=o['dimensions'];e=o['metadata'].get('eaveHeight',2.8);mq=o['metadata']['supplierTent']=='mq40';points=footprint(o)
 canvas=material('Supplier white membrane '+o.get('color','#f5f3eb'),o.get('color','#f5f3eb'),.83)
 frame=material('MQ40 aluminium' if mq else 'Arabesque black frame','#bdc0b9' if mq else '#292c29',.32,.6)
 def tag(obj,component):obj['component']=component;return obj
 tag(polyfloor(parent.name+' | Proposed deck',points,.12,material('Proposed lounge deck','#b6a78d',.8),parent),'floor')
 verts,faces=canopy(o,points);roof=tag(mesh(parent.name+' | Supplier curved membrane',[coord(v) for v in verts],faces,canvas,parent),'roof')
 for poly in roof.data.polygons:poly.use_smooth=True
 posts=points if mq else [(x,z) for x in [-w/2,-w/6,w/6,w/2] for z in [-d/2,d/2]]
 def bar(name,a,b,r,mat,part='frame'):return tag(rod(parent.name+' | '+name,coord(a),coord(b),r,mat,parent),part)
 for x,z in posts:bar('Post',(x,.12,z),(x,e,z),.055,frame)
 beam=min(2.362,e-.1) if mq else e-.035
 for i,(x,z) in enumerate(points):
  nx,nz=points[(i+1)%len(points)];bar('Eave',(x,beam,z),(nx,beam,nz),.045,frame)
 if mq:
  bar('Suspended centre mast',(0,beam,0),(0,h-.06,0),.05,frame)
  for x,z in points:bar('Overhead bracing',(x,beam,z),(0,beam+.3,0),.035,frame)
 else:
  brass=material('Arabesque brass finials','#bda36a',.27,.8)
  for x in [-w/3,0,w/3]:
   bar('Finial',(x,h-.31,0),(x,h,0),.025,brass,'roof')
   # Small turned collar on the finial; overall height remains exactly h.
   bar('Finial collar',(x,h-.18,0),(x,h-.12,0),.065,brass,'roof')
  if o['metadata'].get('frontGlass'):
   glass=material('Optional lounge glass front','#aac6c6',.12,.15,.19)
   for i in range(8):tag(cube(parent.name+' | Glass front panel',coord((-w/2+w/8*(i+.5),e/2+.02,d/2)),(w/8-.04,.025,e-.2),glass,parent),'wall')
   for i in range(9):tag(cube(parent.name+' | Glass mullion',coord((-w/2+w*i/8,e/2+.04,d/2)),(.035,.05,e-.1),frame,parent),'wall')
   for y in [.13,e-.07]:tag(cube(parent.name+' | Glass track',coord((0,y,d/2)),(w,.06,.045),frame,parent),'wall')
 return parent
