"""Build every RBC furniture model as editable Blender geometry and optimized GLB.

Usage: blender --background --python scripts/event-studio/build_furniture.py -- [--preview]
The source library keeps named parts. GLB exports combine parts sharing a material
to reduce browser draw calls. Models use metres, Z-up in Blender and Y-up in GLTF.
"""
from pathlib import Path
import argparse, json, math, sys, time
import bpy
from mathutils import Vector, Matrix

ROOT=Path(__file__).resolve().parents[2]
DATA=ROOT/'private/event-studio/rbc'
OUT=ROOT/'public/event-studio/furniture'
OUTPUT=ROOT/'output/event-studio'
PI=math.pi
CURRENT=None

def mat(name, color, metallic=0, rough=.55, transmission=0):
    m=bpy.data.materials.get(name)
    if m:return m
    m=bpy.data.materials.new(name);m.use_nodes=True
    if isinstance(color,str): color=tuple(int(color.lstrip('#')[i:i+2],16)/255 for i in (0,2,4))
    # Convert sRGB catalogue choices into linear physical material values.
    linear=tuple(c/12.92 if c<.04045 else ((c+.055)/1.055)**2.4 for c in color)
    m.diffuse_color=(*linear,1);p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*linear,1);p.inputs['Metallic'].default_value=metallic;p.inputs['Roughness'].default_value=rough
    p.inputs['Transmission Weight'].default_value=transmission
    if transmission:p.inputs['IOR'].default_value=1.46
    return m

def attach(obj,name,material=None):
    obj.name=name
    for c in list(obj.users_collection):c.objects.unlink(obj)
    CURRENT.objects.link(obj)
    if material:obj.data.materials.append(material)
    return obj

def rounded(name,loc,dims,material,bevel=.015,segments=3):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc);o=attach(bpy.context.object,name,material)
    o.scale=dims;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('Soft manufactured edges','BEVEL');mod.width=min(bevel,min(dims)*.45);mod.segments=segments
        bpy.context.view_layer.objects.active=o;bpy.ops.object.modifier_apply(modifier=mod.name)
        o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL')
    return o

def lathe(name,profile,material,loc=(0,0,0),segments=32,flute=0):
    verts=[];faces=[]
    for r,z in profile:
        for j in range(segments):
            a=j*2*PI/segments;radius=r*(1+flute*math.cos(a*12));verts.append((loc[0]+radius*math.cos(a),loc[1]+radius*math.sin(a),loc[2]+z))
    for k in range(len(profile)-1):
        for j in range(segments):a=k*segments+j;b=k*segments+(j+1)%segments;faces.append((a,b,b+segments,a+segments))
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();obj=bpy.data.objects.new(name,mesh);CURRENT.objects.link(obj);obj.data.materials.append(material)
    for p in obj.data.polygons:
        segment=p.index//segments
        p.use_smooth=not flute and abs(profile[segment+1][1]-profile[segment][1])>1e-8
    return obj

def cyl(name,loc,radius,depth,material,vertices=32,radius2=None):
    profile=[(0,-depth/2),(radius,-depth/2),(radius if radius2 is None else radius2,depth/2),(0,depth/2)]
    return lathe(name,profile,material,loc,vertices)

def tube(name,pts,radius,material,res=2,closed=False):
    curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D';curve.resolution_u=2;curve.bevel_depth=radius;curve.bevel_resolution=res;curve.use_fill_caps=True
    spline=curve.splines.new('POLY');spline.points.add(len(pts)-1)
    for p,co in zip(spline.points,pts):p.co=(*co,1)
    spline.use_cyclic_u=closed;obj=bpy.data.objects.new(name,curve);CURRENT.objects.link(obj);obj.data.materials.append(material)
    return obj

def ring(name,loc,rx,ry,radius,material,n=48):
    return tube(name,[(loc[0]+rx*math.cos(i*2*PI/n),loc[1]+ry*math.sin(i*2*PI/n),loc[2]) for i in range(n)],radius,material,closed=True)

def blob(name,loc,dims,material):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24,ring_count=12,location=loc);o=attach(bpy.context.object,name,material);o.scale=tuple(d/2 for d in dims)
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for p in o.data.polygons:p.use_smooth=True
    return o

def slab_oval(name,loc,w,d,h,material):
    o=cyl(name,loc,.5,h,material,64);o.scale.x=w;o.scale.y=d;return o

def leg(name,a,b,r,material):return tube(name,[a,b],r,material)

def chair(item,w,h,d,body,frame,kind):
    name=item['name'].lower();desc=item['description'].lower();pid=item['productId']
    sh=min(.46,h*.56);sw=w*.87;sd=d*.79
    seat=rounded('Upholstered seat',(0,-d*.04,sh),(sw,sd,.065 if 'pvc' in desc else .09),body,.04)
    if kind in ('cove_chair','leaf_chair'):
        cyl('Upholstered drum',(0,0,sh*.47),w*.46,sh*.93,body,40,radius2=w*.44)
        if kind=='leaf_chair':
            for xx,aa in [(-w*.18,-.25),(w*.18,.25)]:
                o=blob('Leaf back petal',(xx,d*.3,sh+(h-sh)*.46),(w*.5,d*.15,(h-sh)*1.2),body);o.rotation_euler[1]=aa
        else:
            rounded('Cove back cushion',(0,d*.29,sh+(h-sh)*.62),(w*.77,.1,(h-sh)*.78),body,.09)
            leg('Back support',(0,d*.29,sh),(0,d*.29,h*.8),.035,frame)
        return
    if kind in ('executive_chair','swivel_chair'):
        for i in range(5):
            a=i*2*PI/5;end=(math.cos(a)*w*.44,math.sin(a)*d*.44,.08)
            leg('Castor star',(0,0,.16),end,.025,frame)
            blob('Wheel',(*end[:2],.045),(.07,.065,.09),mat('Rubber','#202223'))
        cyl('Lift column',(0,0,sh*.45),.032,sh*.7,frame)
    else:
        for x in [-1,1]:
            for y in [-1,1]:
                leg('Chair leg',(x*w*.37,y*d*.35,sh-.035),(x*w*.43,y*d*.43,.02),.018 if 'chrome' in desc else .023,frame)
    bh=h-sh
    if kind in ('wishbone_chair','crossback_chair','rattan_chair','woven_chair','banquet_chair','arabic_bench'):
        z1=sh+.075;z2=h-.035
        for x in [-1,1]:leg('Back stile',(x*w*.38,d*.34,sh-.02),(x*w*.43,d*.38,z2),.022,frame)
        leg('Lower back rail',(-w*.38,d*.37,z1),(w*.38,d*.37,z1),.02,frame)
        tube('Crown rail',[(w*.43*math.cos(a),d*.35+.09*math.sin(a),z2-.025*(math.cos(a)**2)) for a in [PI-i*PI/20 for i in range(21)]],.027,frame)
        if kind=='wishbone_chair':
            tube('Wishbone Y support',[(-w*.25,d*.38,z2-.01),(0,d*.38,z1+.05),(w*.25,d*.38,z2-.01)],.018,frame)
        elif kind=='crossback_chair':
            for s in [-1,1]:leg('Cross back brace',(s*w*.33,d*.37,z1),(-s*w*.35,d*.37,z2-.01),.018,frame)
        elif kind in ('rattan_chair','woven_chair'):
            woven=mat('Natural woven cane','#bca078',rough=.85) if kind=='rattan_chair' else mat('Bistro woven charcoal','#554f40',rough=.85)
            for ix in range(19):
                x=-w*.36+ix*w*.72/18;leg('Woven back vertical',(x,d*.37,z1),(x,d*.37,z2-.035),.003,woven)
            for iz in range(17):
                z=z1+iz*(z2-z1-.04)/16;leg('Woven back horizontal',(-w*.36,d*.368,z),(w*.36,d*.368,z),.003,woven)
        else:
            for x in [-.3,-.15,0,.15,.3]:
                leg('Turned back spindle',(x*w,d*.37,z1),(x*w,d*.37,z2-.025),.014,frame)
    elif ('molded pvc' in desc or 'painted steel leg' in desc) and '4281' not in name:
        # Open lattice rather than a solid billboard back; matches family photos.
        y=d*.34;low=sh+.13;top=h-.04
        tube('Molded back perimeter',[(-w*.4,y,sh),(-w*.43,y+.025,top),(-w*.3,y+.03,h-.012),(w*.3,y+.03,h-.012),(w*.43,y+.025,top),(w*.4,y,sh)],.021,body)
        for i in range(5):
            x=-.34*w+i*.17*w
            leg('Open back lattice A',(x,y,low),(min(w*.35,x+w*.2),y+.02,top),.012,body)
            leg('Open back lattice B',(x,y,top),(min(w*.35,x+w*.2),y,low),.011,body)
    else:
        back=rounded('Chair back',(0,d*.30,sh+bh*.58),(w*.84,.065,bh*.86),body,.055);back.rotation_euler[0]=-.08
        if kind=='executive_chair':
            for z in [sh+bh*.35,sh+bh*.65]:leg('Back upholstery seam',(-w*.36,d*.25,z),(w*.36,d*.25,z),.003,mat('Black piping','#141515'))
    if kind=='executive_chair' or 'visitor' in desc or '4281' in name:
        for s in [-1,1]:
            tube('Arm rest frame',[(s*w*.4,d*.25,sh),(s*w*.44,d*.22,sh+.18),(s*w*.44,-d*.27,sh+.18),(s*w*.38,-d*.3,sh)],.019,frame)
            rounded('Arm pad',(s*w*.43,0,sh+.19),(.06,d*.65,.04),body,.018)

def sofa(item,w,h,d,body,frame,kind):
    pid=item['productId'];name=item['name'].lower();sh=h*.48
    if kind=='arch_sofa':
        # A gently crescent shaped sofa assembled from editable, joined cushions.
        points=[]
        for i in range(25):
            t=-1+i/12;points.append((t*w*.43,d*.14*(t*t),sh*.65))
        tube('Curved upholstered plinth',points,min(d*.36,sh*.7),body,4)
        points2=[(x,y+d*.28,h*.69) for x,y,z in points]
        tube('Continuous curved back',points2,min(d*.16,h*.21),body,4)
        return
    if '4938' in name or '5120' in name or '5121' in name:
        if '4938' in name:
            cyl('Round upholstered base',(0,0,sh*.45),w*.48,sh*.9,body,48)
            slab_oval('Round seat cushion',(0,0,sh),w*.92,d*.83,.12,body)
        else:
            rounded('Floating seat',(0,-d*.07,sh),(w*.74,d*.81,.14),body,.055)
        # Horseshoe upholstered back and side supports.
        pts=[(math.cos(a)*w*.41,math.sin(a)*d*.4,h*.72) for a in [i*PI/28 for i in range(29)]]
        tube('Curved upholstered shell',pts,w*.10,body,4)
        for s in [-1,1]:rounded('Side upholstered support',(s*w*.42,0,h*.31),(.13,d*.72,h*.62),body,.055)
        return
    for x in [-1,1]:
        for y in [-1,1]:
            rounded('Sofa foot',(x*w*.4,y*d*.36,.065),(.055,.055,.13),frame,.008)
    rounded('Sofa base',(0,0,sh*.59),(w,d*.95,sh*.73),body,.06)
    n=1 if kind=='armchair' else max(2,round(w/.75))
    for i in range(n):
        x=(i-(n-1)/2)*(w*.78/n)
        rounded('Seat cushion '+str(i+1),(x,-d*.075,sh),(w*.76/n,d*.73,h*.18),body,.055)
    arm_less='straight off white' in name
    rounded('Backrest',(0,d*.36,h*.74),(w*.97,d*.23,h*.49),body,.075)
    if not arm_less:
        for s in [-1,1]:rounded('Arm bolster',(s*w*.43,0,h*.53),(w*.15,d*.9,h*.47),body,.055)
    if 'vip armchair' in name:
        # Formal exposed metallic/wood frame visible around the upholstered back.
        for s in [-1,1]:leg('Formal chair back trim',(s*w*.4,d*.42,sh),(s*w*.4,d*.42,h),.019,mat('Antique silver','#96918a',.8,.28))

def legs_rect(w,h,d,frame,turned=False):
    for x in [-1,1]:
        for y in [-1,1]:
            if turned:
                lathe('Turned table leg',[(.018,0),(.027,h*.15),(.017,h*.25),(.033,h*.4),(.018,h*.55),(.03,h*.8),(.025,h)],frame,(x*w*.43,y*d*.39,0),24)
            else:leg('Table leg',(x*w*.43,y*d*.39,.015),(x*w*.43,y*d*.39,h),.017,frame)

def table(item,w,h,d,body,frame,kind):
    text=(item['name']+' '+item['description']).lower()
    glass=mat('Clear table glass','#c4d9d4',rough=.11,transmission=.65)
    topmat=glass if any(t in text for t in ['glass','clear acrylic']) else body
    if item['productId']=='wh-cocktail-table':topmat=mat('Warm white table top','#e9e1d0',rough=.4)
    if 'gold' in text and 'white' not in text and topmat!=glass:topmat=mat('Satin gold','#b89450',.8,.25)
    if 'marble' in text or 'travertine' in text:topmat=mat('Warm ivory stone','#d8cdb7',rough=.4)
    th=.025 if topmat==glass else .055
    if kind in ('table_rect','turned_table'):
        rounded('Table top',(0,0,h-th/2),(w,d,th),topmat,.008)
        if 'square wooden' in text:
            rounded('Square pedestal base',(0,0,.045),(w*.63,d*.63,.09),body,.014)
            rounded('Square pedestal column',(0,0,h*.48),(w*.18,d*.18,h*.88),mat('Brushed warm steel','#b4ad93',.75,.28),.006)
        else:
            legs_rect(w,h-th,d,frame,kind=='turned_table' or 'sleek gold' in text)
            if 'glass top dining' in text:
                for x in [-.35,.35]:
                    for y in [-.4,.4]:leg('Dining frame',(x*w,y*d,.03),(x*w,y*d,h-.05),.019,frame)
                    tube('Lower frame',[(x*w,-d*.4,.03),(x*w+d*.24,-d*.4,.03),(x*w+d*.24,d*.4,.03),(x*w,d*.4,.03)],.019,frame,closed=True)
            elif topmat==glass:
                tube('Table rim',[(-w*.47,-d*.47,h-.025),(w*.47,-d*.47,h-.025),(w*.47,d*.47,h-.025),(-w*.47,d*.47,h-.025)],.012,frame,closed=True)
        return
    if kind=='oval_frame_table':
        slab_oval('Oval white top',(0,0,h-.025),w,d,.05,body)
        ring('Oval gold foot rail',(0,0,.035),w*.45,d*.45,.014,frame)
        for i in range(14):
            a=2*PI*i/14;leg('Gold crossed support',(math.cos(a)*w*.4,math.sin(a)*d*.4,.04),(math.cos(a+.4)*w*.42,math.sin(a+.4)*d*.42,h-.06),.013,frame)
        return
    slab_oval('Round or oval tabletop',(0,0,h-th/2),w,d,th,topmat)
    if kind=='oval_table':
        lathe('Travertine sculpted pedestal',[(0,0),(min(w,d)*.32,0),(min(w,d)*.35,.025),(min(w,d)*.19,h-.055),(0,h-.055)],topmat,segments=48)
    elif kind=='lantern_table':
        for i in range(36):
            a=i*2*PI/36
            tube('Lantern wicker rib',[(math.cos(a)*w*r,math.sin(a)*d*r,h*z) for r,z in [(.16,0),(.27,.5),(.18,.93)]],.007,frame)
        for r,z in [(.16,.02),(.27,.5),(.18,.93)]:ring('Lantern woven band',(0,0,h*z),w*r,d*r,.014,frame)
    elif kind=='geometric_table':
        for i in range(8):
            a=i*2*PI/8;leg('Geometric splayed leg',(math.cos(a)*w*.34,math.sin(a)*d*.34,.03),(math.cos(a+.2)*w*.4,math.sin(a+.2)*d*.4,h-.04),.015,frame)
            leg('Geometric base crossing',(math.cos(a)*w*.34,math.sin(a)*d*.34,.035),(math.cos(a+PI*.75)*w*.34,math.sin(a+PI*.75)*d*.34,.035),.014,frame)
    elif kind=='fluted_table':
        if 'engraved' in text:
            for axis in [0,PI/2]:
                pts=[]
                for i in range(25):
                    t=i/24;xx=(t-.5)*w*.72;zz=h*(.08+.82*(.5+.5*math.sin(t*PI*2)))
                    pts.append((xx*math.cos(axis),xx*math.sin(axis),zz))
                tube('Carved curved white base',pts,.045,body,3)
        else:
            base=mat('Cocktail walnut','#96714c',rough=.45)
            cyl('Core tapered base',(0,0,h*.46),w*.34,h*.89,base,48,radius2=w*.27)
            for i in range(32):
                a=i*2*PI/32;leg('Timber vertical flute',(math.cos(a)*w*.35,math.sin(a)*d*.35,.02),(math.cos(a)*w*.28,math.sin(a)*d*.28,h-.07),.012,base)
    elif 'truss' in text:
        cyl('Black circular base',(0,0,.02),w*.29,.04,mat('Black powder coat','#242826'))
        for a in [0,PI/2,PI,PI*1.5]:
            x=math.cos(a)*w*.12;y=math.sin(a)*d*.12;leg('Truss upright',(x,y,.04),(x,y,h-.03),.012,frame)
        for n in range(4):
            z=.04+n*(h-.1)/4
            for s in [-1,1]:leg('Truss diagonal',(-w*.12,s*d*.12,z),(w*.12,s*d*.12,z+(h-.1)/4),.004,frame)
    else:
        cyl('Pedestal foot',(0,0,.02),min(w,d)*.34,.035,frame,48)
        lathe('Pedestal lower flare',[(min(w,d)*.17,.03),(.05,.07),(.025,.14)],frame)
        cyl('Pedestal column',(0,0,h*.5),.026,h-.1,frame,32)

def stool(item,w,h,d,body,frame):
    name=item['name'].lower();sh=h*.76 if '4675' in name else h*.9
    if '1422' in name:
        cyl('Round upholstered bar seat',(0,0,sh),w*.49,.09,body)
        for i in range(4):
            a=i*PI/2+PI/4;leg('High stool bent leg',(math.cos(a)*w*.4,math.sin(a)*d*.4,0),(math.cos(a)*w*.22,math.sin(a)*d*.22,sh),.012,frame)
        ring('Foot ring',(0,0,sh*.39),w*.36,d*.36,.012,frame)
        tube('Low back support',[(-w*.33,d*.28,sh),(-w*.33,d*.28,h),(w*.33,d*.28,h),(w*.33,d*.28,sh)],.009,frame)
    else:
        cyl('Circular pedestal base',(0,0,.015),w*.47,.03,frame)
        cyl('Gas lift column',(0,0,sh*.45),.025,sh*.86,frame)
        ring('Footrest',(0,-d*.12,sh*.43),w*.27,d*.22,.014,frame)
        if 'low stool' in name:
            cyl('Stool upholstered seat',(0,0,sh),w*.5,.055,body)
            for i in range(5):
                a=i*2*PI/5;blob('Castor',(math.cos(a)*w*.42,math.sin(a)*d*.42,.038),(.05,.05,.07),body)
        else:
            rounded('Sculpted stool seat',(0,-d*.03,sh),(w*.95,d*.84,.065),body,.04)
            back_height=max(h-sh,.09);rounded('Stool back',(0,d*.3,h-back_height/2),(w*.84,.055,back_height),body,.05)

def accessory(item,w,h,d,body,frame,kind):
    pid=item['productId'];text=(item['name']+' '+item['description']).lower();glass=mat('Cut crystal','#cbdedb',rough=.14,transmission=.63)
    if kind=='cushion':
        o=rounded('Soft cushion',(0,0,h*.5),(w,d,h),body,min(w,h)*.21,5)
        # Edge piping and restrained geometric motifs remain individually editable.
        tube('Cushion stitched edge',[(-w*.43,-d*.49,h*.09),(w*.43,-d*.49,h*.09),(w*.43,-d*.49,h*.91),(-w*.43,-d*.49,h*.91)],.003,body,2,True)
        if 'leaf' in text or 'palm' in text:
            green=mat('Botanical fabric print','#7d8052',rough=.92)
            for i in range(3):
                x=(i-1)*w*.26;z=h*(.25+.12*(i%2));leg('Botanical printed stem',(x,-d*.51,z),(x+w*.08,-d*.51,z+h*.42),.0025,green)
                for j in range(4):
                    for s in [-1,1]:
                        o=blob('Printed leaf',(x+w*.02+s*w*.06,-d*.505,z+h*(.1+j*.085)),(w*.15,.003,h*.065),green);o.rotation_euler[1]=s*.4
        return
    if kind=='tissue':
        material=glass if 'acrylic' in text else mat('Mirrored silver','#d9dddf',.95,.08)
        rounded('Tissue holder bottom',(0,0,.007),(w,d,.014),material,.002)
        for s in [-1,1]:
            rounded('Tissue holder side',(s*(w/2-.003),0,h*.43),(.006,d,h*.86),material,.001)
            rounded('Tissue holder end',(0,s*(d/2-.003),h*.43),(w,.006,h*.86),material,.001)
        rounded('Tissue pack',(0,0,h*.35),(w*.9,d*.85,h*.6),mat('White tissue','#fcfaf5',rough=1),.005)
        sheet=rounded('Raised tissue',(0,0,h*.85),(w*.31,.012,h*.45),mat('White tissue','#fcfaf5',rough=1),.005);sheet.rotation_euler[1]=.24
        return
    if kind in ('crystal_lamp','table_lamp'):
        metal=glass if kind=='crystal_lamp' else mat('Satin lamp silver','#c5c9c5',.75,.26)
        cyl('Lamp foot',(0,0,h*.055),w*.42,h*.11,metal)
        cyl('Lamp stem',(0,0,h*.43),w*.085,h*.73,metal,24)
        lathe('Lamp shade',[(w*.48,h*.63),(w*.35,h*.96),(w*.0,h*.96)],glass if kind=='crystal_lamp' else mat('White lamp diffuser','#fff5da',rough=.5),segments=32,flute=.025)
        return
    if kind=='bowls_set':
        for i,(x,scale) in enumerate([(-w*.33,.9),(0,.65),(w*.34,.75)]):
            r=w*.19*scale;hh=h*scale
            lathe('Wood bowl stand',[(r*.5,0),(r*.36,hh*.45)],mat('Bowl walnut','#795136',rough=.55),(x,0,0))
            lathe('Silver bowl',[(r*.1,hh*.38),(r*.7,hh*.57),(r,hh*.96),(r*.94,hh*.97),(r*.63,hh*.57),(r*.1,hh*.42)],mat('Polished silver','#d9dee0',.96,.11),(x,0,0))
        return
    if kind in ('shell_bowl','long_vase'):
        r=min(w,d)*.5
        obj=lathe('Scalloped crystal bowl',[(0,0),(r*.5,h*.03),(r*.8,h*.28),(r,h),(r*.92,h),(r*.73,h*.3),(0,h*.12)],glass,segments=48,flute=.05)
        obj.scale.x=w/(r*2);obj.scale.y=d/(r*2)
        return
    usemat=glass if 'crystal' in text or 'glass' in text else body
    if 'black' in text:usemat=mat('Smoked crystal','#3e4540',rough=.16,transmission=.2)
    if 'gold' in text:usemat=mat('Vase polished gold','#bd963f',.87,.18)
    radius=min(w,d)/2
    if kind=='bowl_stand':
        lathe('Silver fluted foot',[(0,0),(radius*.65,.02*h),(radius*.6,h*.1),(radius*.18,h*.25),(radius*.15,h*.44)],frame,segments=48,flute=.04)
        lathe('Crystal bowl',[(radius*.15,h*.4),(radius*.65,h*.64),(radius,h),(radius*.95,h),(radius*.6,h*.65),(radius*.1,h*.44)],glass,segments=48,flute=.025)
    elif kind=='trumpet_vase':
        lathe('Turned trumpet vase',[(0,0),(radius*.65,0),(radius*.6,h*.06),(radius*.18,h*.21),(radius*.1,h*.3),(radius*.23,h*.4),(radius*.65,h*.95),(radius,h),(radius*.94,h),(radius*.59,h*.95),(radius*.18,h*.41)],usemat,segments=48,flute=.018)
    elif kind=='urn':
        lathe('Fluted pedestal urn',[(0,0),(radius*.61,0),(radius*.55,h*.07),(radius*.2,h*.19),(radius*.17,h*.3),(radius*.57,h*.42),(radius*.72,h*.54),(radius*.67,h*.66),(radius*.95,h),(radius*.88,h),(radius*.6,h*.67),(radius*.65,h*.56),(radius*.5,h*.45),(0,h*.37)],usemat,segments=48,flute=.045)
    else:
        lathe('Open vase',[(0,0),(radius*.6,0),(radius*.85,h*.08),(radius,h*.4),(radius*.9,h*.78),(radius*.8,h),(radius*.72,h),(radius*.82,h*.77),(radius*.92,h*.4),(radius*.7,h*.12),(0,h*.1)],usemat,segments=48,flute=.035)

def special(item,w,h,d,body,frame,kind):
    text=item['name'].lower()
    if kind in ('pouffe','gold_pouffe','layered_pouffe'):
        if kind=='gold_pouffe':
            for i in range(24):
                a=i*2*PI/24;leg('Gold basket upright',(math.cos(a)*w*.32,math.sin(a)*d*.32,.025),(math.cos(a)*w*.47,math.sin(a)*d*.47,h*.86),.007,frame)
            ring('Basket foot',(0,0,.02),w*.32,d*.32,.01,frame);ring('Basket top',(0,0,h*.84),w*.47,d*.47,.01,frame)
        else:cyl('Pouffe upholstery',(0,0,h*.48),w*.48,h*.93,body,48)
        slab_oval('Seat cushion',(0,0,h*.89),w,d,h*.2,body)
        if kind=='layered_pouffe':
            for z in [h*.33,h*.66]:ring('Layer piping',(0,0,z),w*.486,d*.486,.007,mat('Warm gold piping','#c4b79d',.2,.6))
        if 'green' in text:
            green=mat('Leaf pattern olive','#777649',rough=.9)
            for i in range(30):
                a=i*2*PI/15;z=h*(.22+.5*(i//15));o=blob('Leaf fabric motif',(math.cos(a)*w*.482,math.sin(a)*d*.482,z),(.07,.018,.12),green);o.rotation_euler[2]=a-PI/2
        return
    if kind in ('ottoman','arabic_ottoman','arabic_bench'):
        sh=h*.5 if kind=='arabic_bench' else h
        seatmat=mat('Arabic woven red','#9d594d',rough=.86) if kind=='arabic_ottoman' else body
        rounded('Bench upholstered top',(0,0,sh*.84),(w,d,sh*.26),seatmat,.045)
        legs_rect(w,sh*.74,d,frame,True)
        rounded('Timber apron',(0,0,sh*.65),(w*.9,d*.9,.08),frame,.005)
        if kind=='arabic_bench':
            for s in [-1,1]:
                leg('Bench back post',(s*w*.46,d*.38,sh*.4),(s*w*.46,d*.38,h),.023,frame)
                tube('Bench arm',[(s*w*.46,-d*.4,sh*.6),(s*w*.46,-d*.4,sh*1.27),(s*w*.46,d*.38,sh*1.27)],.02,frame)
            for i in range(15):
                x=(i-7)*w*.061;leg('Carved bench back spindle',(x,d*.38,sh),(x,d*.38,h*.94),.015,frame)
            rounded('Carved crown rail',(0,d*.38,h*.95),(w,.05,.075),frame,.008)
        else:
            for x in range(8):
                for y in range(3):blob('Upholstery button',((x-3.5)*w*.1,(y-1)*d*.25,h*.97),(.018,.018,.009),body)
        return
    if kind=='beanbag':
        profile=[(0,0),(w*.31,.015),(w*.47,h*.15),(w*.49,h*.45),(w*.43,h*.75),(w*.33,h*.98),(w*.20,h*.83),(w*.08,h*.52),(0,h*.48)]
        lathe('Soft bean bag',profile,body,segments=48,flute=.025)
        for i in range(8):
            a=i*2*PI/8;tube('Bean bag stitch',[(math.cos(a)*r,math.sin(a)*r,z) for r,z in profile[1:8]],.0018,mat('Bean bag stitching','#424849'))
        return
    if kind=='led_bench':
        for s in [-1,1]:
            tube('Bench metal side',[(s*w*.47,-d*.4,0),(s*w*.47,-d*.4,h*.52),(s*w*.47,d*.4,h*.52),(s*w*.47,d*.45,h)],.019,frame)
        colors=['#9fe2ff','#f5acfd','#adffc8','#f6caa0']
        for i in range(4):
            m=mat('LED strip '+str(i),colors[i],rough=.3);p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Emission Color'].default_value=m.diffuse_color;p.inputs['Emission Strength'].default_value=.7
            rounded('Back luminous slat',(0,d*.4,h*(.59+i*.115)),(w,.035,h*.075),m,.006)
            rounded('Seat luminous slat',(0,-d*.3+i*d*.2,h*.49),(w,d*.16,.035),m,.006)
        return
    if kind=='arch_console':
        rounded('Console top',(0,0,h*.96),(w,d,h*.08),body,.012)
        for x in [-w*.44,0,w*.44]:rounded('Pier',(x,0,h*.47),(w*.12,d,h*.94),body,.008)
        for mid in [-w*.22,w*.22]:
            # Solid spandrel with true arched opening, extruded front to back.
            verts=[];faces=[];r=w*.16;spring=h*.57;top=h*.93
            for y in [-d/2,d/2]:
                for i in range(25):
                    x=-r+2*r*i/24;z=spring+math.sqrt(max(0,r*r-x*x));verts.extend([(mid+x,y,z),(mid+x,y,top)])
            for off in [0,50]:
                for i in range(24):faces.append((off+i*2,off+i*2+2,off+i*2+3,off+i*2+1))
            for i in range(24):faces.append((i*2,i*2+2,50+i*2+2,50+i*2));faces.append((i*2+1,i*2+3,50+i*2+3,50+i*2+1))
            me=bpy.data.meshes.new('Arch spandrel');me.from_pydata(verts,[],faces);o=bpy.data.objects.new('Arch spandrel',me);CURRENT.objects.link(o);me.materials.append(body)
        return
    if kind=='curved_bar':
        # Curved counter in plan; open service side behind.
        for i in range(24):
            t=(i-11.5)/11.5;x=t*w*.46;y=.18*d*(t*t);rounded('Counter front panel',(x,y,h*.45),(w/24*1.03,d*.18,h*.84),body,.004)
            for j in range(5):
                diamond=rounded('Front decorative inlay',(x,y-d*.098,h*(.16+j*.13)),(.033,.005,.033),mat('Bar patterned inlay','#8e927e',.15,.6),.002);diamond.rotation_euler[1]=PI/4
        rounded('Central service counter',(0,d*.12,h*.93),(w*.33,d*.8,h*.14),body,.016)
        for s in [-1,1]:slab_oval('Curved counter wing',(s*w*.32,d*.05,h*.84),w*.43,d,.045,mat('Counter ivory','#e7dfc8',rough=.3))
        return
    if kind=='umbrella_table':
        table(item,w*.57,h*.29,d*.57,body,frame,'table_round')
        # Pleated tablecloth with modest scallops.
        lathe('Pleated tablecloth',[(w*.28,.04),(w*.29,h*.27),(w*.28,h*.29+.006),(0,h*.29+.006)],body,segments=96,flute=.016)
        pole=mat('Umbrella pale timber','#b69665',rough=.5);cyl('Umbrella pole',(0,0,h*.48),.022,h*.96,pole)
        lathe('Umbrella fabric canopy',[(0,h),(w*.12,h*.98),(w*.46,h*.81),(w*.5,h*.79)],body,segments=64,flute=.012)
        for i in range(16):
            a=i*2*PI/16;leg('Umbrella rib',(0,0,h*.985),(math.cos(a)*w*.48,math.sin(a)*d*.48,h*.8),.006,pole)
        for i in range(100):
            a=i*2*PI/100;leg('Fringe',(math.cos(a)*w*.492,math.sin(a)*d*.492,h*.795),(math.cos(a)*w*.492,math.sin(a)*d*.492,h*.76),.002,body)
        return
    if kind=='lounge_set':
        wood=mat('Outdoor woven frame','#8c7660',rough=.78)
        for s in [-1,1]:
            rounded('Outdoor side sofa base',(s*w*.38,0,h*.19),(w*.24,d,h*.3),wood,.02)
            rounded('Outdoor side sofa back',(s*w*.47,0,h*.62),(w*.07,d,h*.7),body,.05)
            for i in range(3):rounded('Outdoor side seat cushion',(s*w*.35,(i-1)*d*.31,h*.43),(w*.22,d*.3,h*.18),body,.04)
        rounded('Outdoor rear sofa base',(0,d*.38,h*.19),(w*.57,d*.24,h*.3),wood,.02)
        rounded('Outdoor rear backrest',(0,d*.48,h*.62),(w*.57,d*.055,h*.7),body,.05)
        for i in range(3):rounded('Outdoor rear seat cushion',((i-1)*w*.18,d*.35,h*.43),(w*.175,d*.22,h*.18),body,.04)
        rounded('Outdoor coffee table',(0,-d*.17,h*.18),(w*.27,d*.32,h*.35),wood,.018)
        return
    if kind in ('rect_table_set','round_table_set'):
        for i,(x,scale) in enumerate([(-w*.23,1),(w*.3,.74)]):
            ww=w*.64*scale;dd=d*scale;hh=h*scale
            if kind=='rect_table_set':
                for zz in [hh*.12,hh]:rounded('Glass nesting top',(x,0,zz),(ww,dd,.016),mat('Clear table glass','#c4d9d4',rough=.11,transmission=.65),.004)
                for sx in [-1,1]:
                    for sy in [-1,1]:leg('Gold nesting leg',(x+sx*ww*.47,sy*dd*.47,.01),(x+sx*ww*.47,sy*dd*.47,hh),.01,frame)
            else:
                slab_oval('Round nesting white top',(x,0,hh),ww,dd,.04,body)
                ring('Gold nesting basket bottom',(x,0,.015),ww*.32,dd*.32,.008,frame)
                for j in range(20):
                    a=j*2*PI/20;tube('Nesting basket rib',[(x+math.cos(a)*ww*r,math.sin(a)*dd*r,z) for r,z in [(.32,.02),(.47,hh*.38),(.49,hh+.02)]],.006,frame)
        return
    raise ValueError('Unimplemented type '+kind)

def build_asset(item):
    global CURRENT
    pid=item['productId'];kind=item['modelKind'];w,h,d=item['dimensions']
    collection=bpy.data.collections.new(item['id']);bpy.context.scene.collection.children.link(collection);CURRENT=collection
    body=mat('Body '+item['color'],item['color'],rough=.64)
    if kind=='woven_chair':body=mat('Bistro woven charcoal','#554f40',rough=.85)
    if pid=='wh-weaved-clay-pot':body=mat('Ivory ceramic','#e1daca',rough=.75)
    text=(item['name']+' '+item['description']).lower()
    frame=mat('Chrome','#b8c3c6',.9,.19)
    if any(x in text for x in ['wood','walnut','rattan','wishbone','weaved','traditional']):frame=mat('Natural wood','#a27c51',rough=.52)
    if 'walnut' in text:frame=mat('Dark walnut','#60412c',rough=.45)
    if 'gold' in text:frame=mat('Satin gold','#b89450',.8,.25)
    if 'black banquet' in text:frame=mat('Black lacquer','#242624',.15,.32);body=mat('Ivory fabric','#e6ddc8',rough=.85)
    if 'white rattan' in text:frame=mat('White painted frame','#eee9df',rough=.55)
    if 'black geometric' in text:frame=mat('Black powder coat','#242826',rough=.48)
    if item['category']=='accessories':accessory(item,w,h,d,body,frame,kind)
    elif kind in ('armchair','sofa','arch_sofa'):sofa(item,w,h,d,body,frame,kind)
    elif kind.endswith('_chair') or kind=='chair':chair(item,w,h,d,body,frame,kind)
    elif kind=='stool':stool(item,w,h,d,body,frame)
    elif kind in ('table_rect','table_round','turned_table','fluted_table','lantern_table','oval_table','geometric_table','oval_frame_table'):table(item,w,h,d,body,frame,kind)
    else:special(item,w,h,d,body,frame,kind)
    parts=list(collection.objects)
    # Convert curves to editable meshes and apply normals before GLTF merging.
    bpy.ops.object.select_all(action='DESELECT')
    for obj in parts:obj.select_set(True)
    bpy.context.view_layer.objects.active=parts[0];bpy.ops.object.convert(target='MESH')
    parts=list(collection.objects);bpy.context.view_layer.update()
    bounds=[obj.matrix_world @ v.co for obj in parts for v in obj.data.vertices]
    lo=Vector(tuple(min(v[a] for v in bounds) for a in range(3)));hi=Vector(tuple(max(v[a] for v in bounds) for a in range(3)))
    center=Vector(((lo.x+hi.x)/2,(lo.y+hi.y)/2,lo.z));target=Vector((w,d,h));extent=hi-lo
    correction=Matrix.Diagonal(Vector((target.x/extent.x,target.y/extent.y,target.z/extent.z,1)))@Matrix.Translation(-center)
    root=bpy.data.objects.new(item['id'],None);collection.objects.link(root)
    root['productId']=pid;root['name']=item['name'];root['dimensionsMetresWHD']=json.dumps(item['dimensions']);root['measurementStatus']=item['measurementStatus'];root['sourceDimensions']=item['sourceDimensions'];root['notes']=item['notes'];root['modelKind']=kind
    for obj in parts:
        # Bake the full matrix into vertices. Decomposing non-uniformly scaled
        # rotations loses shear and makes later bounding boxes overestimate size.
        obj.data.transform(correction@obj.matrix_world);obj.matrix_world=Matrix.Identity(4);obj.parent=root
    return root,parts,collection

def export_asset(root,parts,item):
    # One mesh per material for the runtime; editable construction stays untouched.
    bpy.ops.object.select_all(action='DESELECT');copies=[]
    for obj in parts:
        copy=obj.copy();copy.data=obj.data.copy();CURRENT.objects.link(copy);copy.parent=None;copy.matrix_world=obj.matrix_world.copy();copies.append(copy)
    by_material={}
    for obj in copies:by_material.setdefault(obj.data.materials[0].name if obj.data.materials else 'none',[]).append(obj)
    merged=[]
    for group in by_material.values():
        bpy.ops.object.select_all(action='DESELECT')
        for obj in group:obj.select_set(True)
        bpy.context.view_layer.objects.active=group[0]
        if len(group)>1:bpy.ops.object.join()
        merged.append(group[0])
    bpy.ops.object.select_all(action='DESELECT')
    for obj in merged:
        obj.select_set(True)
        obj['productId']=item['productId'];obj['measurementStatus']=item['measurementStatus'];obj['modelKind']=item['modelKind'];obj['notes']=item['notes']
    path=OUT/(item['productId']+'.glb')
    bpy.ops.export_scene.gltf(filepath=str(path),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_cameras=False,export_lights=False,export_extras=True)
    for obj in merged:bpy.data.objects.remove(obj,do_unlink=True)
    return path.stat().st_size

def aim(obj,target):obj.rotation_euler=(Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()

def setup_render():
    global CURRENT
    CURRENT=bpy.data.collections.new('Studio');bpy.context.scene.collection.children.link(CURRENT)
    sc=bpy.context.scene;sc.render.engine='CYCLES';sc.cycles.samples=12;sc.cycles.use_denoising=True
    # Prefer the installed NVIDIA GPU; retain CPU portability on other workstations.
    try:
        prefs=bpy.context.preferences.addons['cycles'].preferences;prefs.compute_device_type='CUDA';prefs.get_devices()
        gpu=False
        for device in prefs.devices:
            device.use=device.type=='CUDA';gpu=gpu or device.use
        if gpu:sc.cycles.device='GPU'
    except Exception as error:print('CUDA unavailable; using CPU:',error,flush=True)
    sc.render.resolution_x=400;sc.render.resolution_y=400;sc.render.resolution_percentage=100
    sc.world.color=(.6,.6,.6);sc.view_settings.view_transform='AgX';sc.render.image_settings.file_format='PNG'
    floor=rounded('Studio ground',(0,0,-.035),(200,200,.06),mat('Studio warm grey','#e5e3dc',rough=.85),.005)
    for name,pos,power,size in [('Key',(3,-4,6),450,5),('Fill',(-4,-2,3),280,4),('Rim',(1,4,5),400,3)]:
        data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size;o=bpy.data.objects.new(name,data);CURRENT.objects.link(o);o.location=pos;aim(o,(0,0,.5))
    data=bpy.data.cameras.new('Asset preview camera');cam=bpy.data.objects.new('Asset preview camera',data);CURRENT.objects.link(cam);sc.camera=cam;data.type='ORTHO'
    return cam,CURRENT

def main():
    args=argparse.ArgumentParser();args.add_argument('--preview',action='store_true');args.add_argument('--limit',type=int);args.add_argument('--only',default='');args.add_argument('--eevee',action='store_true');args.add_argument('--skip-existing-previews',action='store_true')
    cli=args.parse_args(sys.argv[sys.argv.index('--')+1:] if '--' in sys.argv else [])
    OUT.mkdir(parents=True,exist_ok=True);OUTPUT.mkdir(parents=True,exist_ok=True);(OUT/'previews').mkdir(exist_ok=True)
    registry=json.loads((DATA/'furniture-assets.json').read_text(encoding='utf8'));items=registry['items']
    if cli.only:items=[i for i in items if i['productId'] in cli.only.split(',')]
    if cli.limit:items=items[:cli.limit]
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    for c in list(bpy.data.collections):
        if c.name!='Collection':bpy.data.collections.remove(c)
    bpy.context.scene.unit_settings.system='METRIC';bpy.context.scene.unit_settings.scale_length=1
    assets=[];report=[];start=time.time()
    for n,item in enumerate(items):
        root,parts,col=build_asset(item);size=export_asset(root,parts,item);assets.append((item,root,parts,col));col.hide_render=True
        record={'productId':item['productId'],'dimensions':item['dimensions'],'editableParts':len(parts),'vertices':sum(len(o.data.vertices) for o in parts),'bytes':size,'measurementStatus':item['measurementStatus']};report.append(record)
        print('ASSET '+str(n+1)+'/'+str(len(items))+' '+item['productId']+' '+str(size),flush=True)
    cam,studio=setup_render()
    if cli.eevee:bpy.context.scene.render.engine='BLENDER_EEVEE_NEXT';bpy.context.scene.eevee.taa_render_samples=32
    # Retain editable source before a long render so an interrupted render never
    # destroys the completed modelling work.
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT/'furniture-library-working.blend'),compress=True)
    review_path=DATA/'furniture-color-review.json'
    reviewed_colors={r['productId'] for r in json.loads(review_path.read_text(encoding='utf8')).get('changes',[])} if review_path.exists() else set()
    if cli.preview:
        for n,(item,root,parts,col) in enumerate(assets):
            preview_path=OUT/'previews'/(item['productId']+'.png')
            if cli.skip_existing_previews and preview_path.is_file() and item['productId'] not in reviewed_colors:
                print('PREVIEW REUSED '+str(n+1)+'/'+str(len(assets)),flush=True);continue
            col.hide_render=False;w,h,d=item['dimensions'];s=max(w,h,d)
            cam.location=(s*1.5,-s*2.4,s*1.55+h*.22);aim(cam,(0,0,h*.45));cam.data.ortho_scale=max(w*1.6,h*1.55,d*1.6)
            bpy.context.scene.render.filepath=str(preview_path);bpy.ops.render.render(write_still=True);col.hide_render=True
            print('PREVIEW '+str(n+1)+'/'+str(len(assets)),flush=True)
    studio.hide_render=True;studio.hide_viewport=True
    for n,(item,root,parts,col) in enumerate(assets):
        root.location=((n%11)*4,(n//11)*4,0);col.hide_render=False
        root.asset_mark();root.asset_data.description=item['notes'];root.asset_data.author='PICO Event Studio'
        col.asset_mark();col.asset_data.description=item['name']+' — '+item['notes'];col.asset_data.author='PICO Event Studio'
    bpy.ops.object.select_all(action='DESELECT');bpy.context.scene['README']='Royal Bahrain Concours furniture library. Each product collection retains editable parts. Metres, Z-up. Imported source dimensions and estimated status are on root empties. GLBs at public/event-studio/furniture have floor-centre origin and Y-up. Catalogue photographs may contain mismatches; consult per-product notes.'
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT/'furniture-library.blend'),compress=True)
    (DATA/'furniture-build-report.json').write_text(json.dumps({'schemaVersion':1,'count':len(report),'elapsedSeconds':round(time.time()-start,1),'totalBytes':sum(i['bytes'] for i in report),'assets':report},indent=2),encoding='utf8')
    print('FURNITURE COMPLETE '+str(len(report))+' models',flush=True)

if __name__=='__main__':main()
