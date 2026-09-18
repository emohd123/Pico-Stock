"""Reconstruct the RBC sheet from transformed PDF vector geometry.
Requires PyMuPDF, Shapely, numpy and OpenCV. One source-specific semantic map
assigns names to extracted paths; inferred verticals are never labelled measured.
"""
import json, math, re, hashlib, collections, subprocess, sys
from pathlib import Path
from shapely.geometry import Polygon, MultiPoint, LineString
from shapely.ops import unary_union, polygonize
ROOT=Path(__file__).resolve().parents[2]; OUT=ROOT/'private/event-studio/rbc'
SOURCE=OUT/'Source-Site-Plan.pdf'
S=.174835; ORIGIN=[1685,1192]
def load(name):return json.loads((OUT/name).read_text())
def save(name,data): (OUT/name).write_text(json.dumps(data,indent=2),encoding='utf8')
def position(p,y=0):return [round((p[0]-ORIGIN[0])*S,5),y,round((p[1]-ORIGIN[1])*S,5)]
def normpoly(poly):
 if not poly.is_valid:poly=poly.buffer(0)
 return poly
for script,file in [('probe_source.py','vector-groups.json'),('extract_car_bounds.py','all-blue-vegetation.json'),('detect_shapes.py','rectangle-candidates.json'),('detect_polygons.py','polygon-candidates.json'),('detect_cars.py','car-candidates.json')]:
 if not (OUT/file).exists():subprocess.run([sys.executable,str(Path(__file__).with_name(script))],check=True)
ds=[d for g in load('vector-groups.json').values() for d in g];byidx={d['index']:d for d in ds};texts=load('source-text.json');rects=load('rectangle-candidates.json');polys=load('polygon-candidates.json')
objects=[];zones=[];matched=[]
def addrect(id,name,r,kind='tent',height=5.2,roof='pagoda',zone=None):
 # r angle describes displayed PDF edge; Three.js positive Y rotates X toward -Z.
 o={'id':id,'name':name,'kind':kind,'position':position(r['center']),'rotation':[0,round(-r['angle'],7),0], 'dimensions':[round(r['width']*S,5),height,round(r['depth']*S,5)],'color':'#f1eee5' if kind=='tent' else '#d4c9b7','roofType':roof,'zoneId':zone or id,'locked':False,'visible':True,'metadata':{'measurementStatus':'mixed','footprintStatus':'plan-derived','heightStatus':'estimated','eaveHeight':3.2 if height<6 else 4.2,'openingSide':'front','sourceIndices':r.get('sourceIndices',[]),'sourceDimensions':f"PDF vector footprint {r['width']*S:.2f} × {r['depth']*S:.2f} m",'notes':'Horizontal position, rotation and footprint from source vectors. Height, roof profile, materials and openings are editable design estimates.'}}
 objects.append(o);return o
def addpoly(id,name,pts,kind='ground',color='#8eac67',height=.02,zone=None,roof='flat',notes=None):
 poly=normpoly(Polygon(pts));c=poly.centroid.coords[0];p=list(poly.exterior.coords)[:-1];x0,z0,x1,z1=poly.bounds
 o={'id':id,'name':name,'kind':kind,'position':position(c),'rotation':[0,0,0],'dimensions':[round((x1-x0)*S,5),height,round((z1-z0)*S,5)],'color':color,'points':[[round((x-c[0])*S,5),round((z-c[1])*S,5)] for x,z in p],'roofType':roof,'locked':kind in ['ground','water','path'],'visible':True,'metadata':{'measurementStatus':'plan-derived' if kind in ['ground','water','path'] else 'mixed','eaveHeight':3.2 if height<6 else 4.2,'openingSide':'front','notes':notes or 'Footprint traced from transformed PDF vector paths. Terrain height and material are provisional.'}}
 if zone:o['zoneId']=zone
 objects.append(o);return o
def points(d,sample=6):
 out=[]
 for it in d['items']:
  if it[0]=='l':out.extend(it[1:])
  elif it[0]=='qu':out.extend(it[1])
  elif it[0]=='re':
   x0,y0,x1,y1=it[1];out.extend([[x0,y0],[x1,y0],[x1,y1],[x0,y1]])
  elif it[0]=='c':
   a,b,c,d=it[1:]
   for k in range(sample+1):
    t=k/sample;out.append([(1-t)**3*a[q]+3*(1-t)**2*t*b[q]+3*(1-t)*t*t*c[q]+t**3*d[q] for q in range(2)])
 return out
# Vector filled areas arrive as adjoining triangular scan strips. Union the strips
# rather than reducing them to rectangles; 0.05 pt snapping closes export cracks.
fillgroups=collections.defaultdict(list)
for d in ds:
 if d.get('fill') is None:continue
 f=tuple(round(c,3) for c in d['fill'])
 if f[0]>.99 and f[1]>.99:continue
 p=MultiPoint(points(d)).convex_hull
 if isinstance(p,Polygon) and p.area>.01:fillgroups[f].append(p.buffer(.04))
for f,shapes in fillgroups.items():
 u=unary_union(shapes).buffer(-.04).simplify(.7,preserve_topology=True)
 parts=list(u.geoms) if hasattr(u,'geoms') else [u]
 for j,p in enumerate(sorted(parts,key=lambda p:p.area,reverse=True)):
  if not isinstance(p,Polygon) or p.area<100:continue
  if f[2]>.8 and f[0]<.2:kind,color,prefix='water','#66acba','water'
  elif f[1]>.4 and f[0]<.4:kind,color,prefix='ground',('#668552' if f[1]<.55 else '#809f63'),'landscape'
  elif f[0]>.8 and f[1]<.1:kind,color,prefix='path','#b35443','access-carpet'
  elif f[0]>.8:kind,color,prefix='path','#cacbc1','paved'
  elif f[0]>.6:kind,color,prefix='path','#b9b4a6','walkway'
  else:continue
  addpoly(f'{prefix}-{f[1]}-{j}',prefix.replace('-',' ').title(),list(p.exterior.coords)[:-1],kind,color)
# Join adjacent text spans to preserve the source IDs exactly.
labels=[]
for i,t in enumerate(texts):
 v=t['text'].strip()
 if v in ['A','S'] and i+1<len(texts) and texts[i+1]['text'].strip().isdigit():
  nxt=texts[i+1];b=t['box'];n=nxt['box'];labels.append((v+nxt['text'].strip(),[(min(b[0],n[0])+max(b[2],n[2]))/2,(min(b[1],n[1])+max(b[3],n[3]))/2]))
 elif re.fullmatch(r'V[1-6]',v):b=t['box'];labels.append((v,[(b[0]+b[2])/2,(b[1]+b[3])/2]))
for id,p in labels:
 if id=='A27':continue
 r=min(rects,key=lambda r:math.dist(p,r['center']))
 if math.dist(p,r['center'])>10:raise RuntimeError(f'No vector rectangle for {id}')
 addrect(id,id,r);matched.append(r['center'])
# A27 is an open three-sided booth in the drawing, not a square pagoda.
a27pts=[p for d in ds if 289062<=d['index']<=289068 for p in points(d)]
hull=MultiPoint(a27pts).minimum_rotated_rectangle;pp=list(hull.exterior.coords)[:-1];c=hull.centroid.coords[0]
r={'center':c,'width':math.dist(pp[0],pp[1]),'depth':math.dist(pp[1],pp[2]),'angle':math.atan2(pp[1][1]-pp[0][1],pp[1][0]-pp[0][0]),'sourceIndices':list(range(289062,289069))}
o=addrect('A27','A27 · open booth',r,'tent',3.2,'flat');o['metadata']['notes']='Source shows an open booth, not a pagoda. U-shaped walls and flat canopy are editable height assumptions.'
# Remaining 5m modules: named heritage/shop clusters plus western marquee bays.
extras=[]
for r in rects:
 if min(r['width'],r['depth'])*S<4.5 or max(r['width'],r['depth'])*S>10.1:continue
 if any(math.dist(r['center'],p)<.5 for p in matched+extras):continue
 x,z=r['center'];name='Unlabelled pavilion';zone='event-pavilions'
 if x<1215 and 1150<z<1517:name='West marquee bay';zone='west-marquee'
 elif 1350<x<1520 and 770<z<910:name='British Heritage pavilion';zone='british-heritage'
 elif 1620<x<1830 and 1070<z<1145:name='Made in EU pavilion';zone='made-in-eu'
 elif 1200<x<1290 and 1020<z<1090:name='RBC Shop pavilion';zone='rbc-shop'
 elif 1960<x<2000 and 1140<z<1180:name='RBC TV';zone='rbc-tv'
 else:continue
 extras.append(r['center']);addrect(f'{zone}-{len(extras)}',name,r,zone=zone)
# Large semantic outlines selected by exact source path indices, never pixel tracing.
for id,name,idx,kind,h,roof in [('oasis-club','Oasis Club',110082,'tent',5.6,'gable'),('lounge-1','Lounge 1',110227,'tent',6.5,'hexagon'),('lounge-2a','Lounge 2 · west',110240,'tent',6.5,'hexagon'),('lounge-2b','Lounge 2 · east',110202,'tent',6.5,'hexagon'),('lounge-3','Lounge 3',110215,'tent',6.5,'hexagon'),('north-stage','Waterfront presentation stage',447951,'stage',.85,'flat'),('south-stage','Concours presentation stage',447952,'stage',.85,'flat'),('existing-west-building','Existing west building',14548,'building',8,'gable')]:
 p=max([p for p in polys if p['index']==idx],key=lambda p:p['area']);o=addpoly(id,name,p['points'],kind,'#f1eee5' if kind=='tent' else '#c8baa1',h,id,roof);o['metadata']['sourceIndices']=[idx]
# Enclosure has explicit 20 x 40m boundary lines.
addrect('owners-enclosure','Owners Enclosure',{'center':[1079.545,794.01],'width':114.39,'depth':228.78,'angle':0,'sourceIndices':[218577,218578,218579]},height=8,roof='gable')
# Service, registration and toilets: choose exact reconstructed rectangles.
for id,name,target,kind in [('registration-1','Registration 1',[709.7,970.9],'tent'),('registration-2','Registration 2',[709.7,1104.5],'tent'),('service-area','Service Area',[1062.4,628.1],'tent'),('toilet-north-a','North Toilets A',[1146.6,628.1],'building'),('toilet-north-b','North Toilets B',[1171.5,628.2],'building'),('generator','Generator set',[1122.5,516.2],'building')]:
 candidates=[r for r in rects if math.dist(r['center'],target)<1];r=max(candidates,key=lambda r:r['area']) if id!='service-area' else min(candidates,key=lambda r:abs(r['width']*r['depth']*S*S-144))
 addrect(id,name,r,kind,5 if kind=='tent' else 3.2,'pagoda' if kind=='tent' else 'flat')
r=min(rects,key=lambda r:math.dist(r['center'],[917,927.9]));addrect('corporate-lounge','Corporate Lounge Area',r,'tent',6.5,'gable')
# Permanent arrival building and exact source toilet hulls.
q=byidx[15287]['items'][0][1]
addpoly('arrival-building','Arrival building', [q[0],q[1],q[3],q[2]],'building','#ccbea4',9,'arrival-building','gable')
for id,name,idx in [('toilet-east','East Toilets',23641),('toilet-south','South Toilets',447690)]:
 p=MultiPoint(points(byidx[idx])).convex_hull
 addpoly(id,name,list(p.exterior.coords)[:-1],'building','#ddd6c5',3.1,id,'flat')
for id,name,target in [('stage-north-wing-a','Waterfront stage west wing',[1960,839]),('stage-north-wing-b','Waterfront stage east wing',[2085.9,877.1]),('stage-south-wing-a','Concours stage west wing',[1798.9,1662.2]),('stage-south-wing-b','Concours stage east wing',[1930.5,1662.2])]:
 r=min(rects,key=lambda r:math.dist(r['center'],target));addrect(id,name,r,'tent',5.6,'pagoda',zone='north-stage' if 'north' in id else 'south-stage')
# Entrance span follows the red carpet crossing and source entrance label.
objects.append({'id':'entrance-arch','name':'Entrance arch','kind':'sign','position':position([701.8,1038.7]),'rotation':[0,math.pi/2,0],'dimensions':[8,4.5,.7],'color':'#e7d6af','zoneId':'entrance','metadata':{'measurementStatus':'estimated','notes':'Located at the source entrance label. Arch width, height and detailing are editable design estimates.'}})
# Four sculptural shade pavilions have Bezier roof outlines. Preserve their
# six-point outline using the actual curve endpoints, with provisional verticals.
for i,(lo,hi) in enumerate([(218815,218839),(218840,218864),(218865,218889),(218890,218907)],1):
 p=MultiPoint([p for d in ds if lo<=d['index']<=hi for p in points(d)]).convex_hull.simplify(.3)
 if isinstance(p,Polygon):addpoly(f'shade-pavilion-{i}',f'Hospitality shade pavilion {i}',list(p.exterior.coords)[:-1],'tent','#f4efdf',5.8,'hospitality-terrace','hexagon')
# Coffee canopy: bounded source glyph consists of radial lines and roof curves.
co=[d for d in ds if d.get('fill') is None and d.get('layer')!='Vegetation' and 1820<d['rect'][0]<1930 and 1420<d['rect'][1]<1510 and d['rect'][2]<1930 and d['rect'][3]<1515]
if co:
 p=MultiPoint([p for d in co for p in points(d)]).convex_hull
 if isinstance(p,Polygon):addpoly('coffee-bar','Coffee Bar',list(p.exterior.coords)[:-1],'tent','#f1eee5',5.8,'coffee-bar','hexagon')
# Vehicle minimum rectangles originate from clustered CAD stroke bounds.
for i,r in enumerate(load('car-candidates.json'),1):
 if r['width']>r['depth']:r={**r,'width':r['depth'],'depth':r['width'],'angle':r['angle']+math.pi/2}
 o=addrect(f'car-{i:03}',f'Display car {i:03}',r,'car',1.5,'flat',zone='car-display');o['color']=['#294b45','#efe3cc','#9f3534','#3a506a','#b9c1bb','#242724'][i%6];o['metadata']={'measurementStatus':'mixed','footprintStatus':'plan-derived','heightStatus':'estimated','sourceRange':r['sourceRange'],'notes':'Placement, orientation and footprint from CAD car symbol. Generic editable vehicle body; not a representation of any confirmed exhibitor vehicle.'}
# Tree centres are repetitive endpoints of radial vegetation vectors; cluster
# within 1 PDF point, then require a high-valency symbol centre.
vegs=[d for d in load('all-blue-vegetation.json') if d['layer']=='Vegetation'];ends=[]
for d in vegs:
 if len(d['items'])==1 and d['items'][0][0]=='l':ends.extend(d['items'][0][1:])
clusters={}
for p in ends:
 k=(round(p[0]),round(p[1]));clusters.setdefault(k,[]).append(p)
tree=[]
for k,pts in sorted(clusters.items(),key=lambda kv:-len(kv[1])):
 if len(pts)<8 or any(math.dist(k,a)<3 for a in tree):continue
 tree.append(k)
for i,p in enumerate(tree,1):
 objects.append({'id':f'tree-{i:03}','name':f'Existing palm {i:03}','kind':'tree','position':position(p),'rotation':[0,(i*.7)%6.28,0],'dimensions':[5,7+(i%3),5],'color':'#667e42','locked':True,'visible':True,'metadata':{'measurementStatus':'mixed','notes':'Tree centre detected from vegetation vector symbol. Species, crown and height are visual estimates.'}})
# Named navigation destinations from source text, consolidated across spans.
for id,name,search in [('main-parking','Main Car Parking','MAIN CAR PARKING'),('entrance','Entrance Arch','ENTRANCE'),('public-access','Public Access','PUBLIC ACCESS'),('vip-access','VIP Access','VIP ACCESS'),('british-heritage','British Heritage','BRITISH HERITAGE'),('made-in-eu','Made in EU','MADE IN EU'),('rbc-shop','RBC Shop','RBC SHOP'),('rbc-tv','RBC TV','RBC TV'),('corporate-lounge','Corporate Lounge Area','CORPORATE LOUNGE AREA'),('oasis-club','Oasis Club','OASIS CLUB'),('lounge-1','Lounge 1','LOUNGE 1'),('lounge-2','Lounge 2','LOUNGE 2'),('lounge-3','Lounge 3','LOUNGE 3'),('coffee-bar','Coffee Bar','COFFEE BAR'),('registration-1','Registration 1','REGISTRATION 1'),('registration-2','Registration 2','REGISTRATION 2'),('service-area','Service Area','SERVICE AREA'),('owners-enclosure','Owners Enclosure','OWNERS')]:
 t=next(t for t in texts if t['text']==search);b=t['box'];p=[(b[0]+b[2])/2,(b[1]+b[3])/2];objs=[o for o in objects if o.get('zoneId')==id or o['id']==id or (id=='lounge-2' and o['id'].startswith(id))];pos=objs[0]['position'] if objs else position(p)
 zones.append({'id':id,'name':name,'position':pos,'objectIds':[o['id'] for o in objs]})
for id,p in labels:zones.append({'id':id,'name':id,'position':next(o['position'] for o in objects if o['id']==id),'objectIds':[id]})
for i,o in enumerate(objects):
 if o['kind'] in ['tent','building'] and o['id'] not in {z['id'] for z in zones}:zones.append({'id':o['id'],'name':o['name'],'position':o['position'],'objectIds':[o['id']]})
# Ensure every object group is a navigable zone and every objectId resolves.
zone_map={z['id']:z for z in zones}
for o in objects:
 zid=o.get('zoneId')
 if zid:
  if zid not in zone_map:
   z={'id':zid,'name':zid.replace('-',' ').title(),'position':o['position'],'objectIds':[]};zones.append(z);zone_map[zid]=z
  if o['id'] not in zone_map[zid]['objectIds']:zone_map[zid]['objectIds'].append(o['id'])
# All displayed drawing content lies in this source frame; origin remains stable.
bounds={'minX':(48-1685)*S,'maxX':(3322-1685)*S,'minZ':(387-1192)*S,'maxZ':(1996-1192)*S}
views=[{'id':'overview','name':'Whole site','position':[40,230,230],'target':[0,0,5]},{'id':'waterfront','name':'Waterfront pavilions','position':[155,58,12],'target':[35,0,-60]},{'id':'arrival','name':'Arrival and owners enclosure','position':[-152,42,-8],'target':[-100,1,-51]},{'id':'concours','name':'Concours lawn','position':[18,46,134],'target':[18,1,47]},{'id':'lounges','name':'Hospitality lounges','position':[129,27,71],'target':[84,1,20]},{'id':'interior','name':'Inside Owners Enclosure','position':[-104,1.7,-55],'target':[-104,1.7,-85]}]
tour=[dict(v,duration=15) for v in views]
scene={'schemaVersion':1,'id':'royal-bahrain-concours-2026','name':'Royal Bahrain Concours 2026','units':'m','site':{'bounds':bounds,'originPdf':ORIGIN,'metresPerPoint':S,'groundY':0,'sourceName':SOURCE.name,'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'sourceRotation':270,'displayPagePoints':[3370,2384],'assumptions':['Dimension annotations are millimetres; 50000 = 50 metres.','Only horizontal geometry is dimension-calibrated. No elevation survey or tent supplier sections were supplied.','Roof heights and profiles, terrain, materials, generic vehicle bodies and vegetation are editable visual estimates.','Source labels A1-A27, S1-S19 and V1-V6 are preserved; A27 is an open booth in the drawing.']},'objects':objects,'zones':zones,'views':views,'tour':tour}
# Pair source dimension endpoint circles with the six annotations.
cal=[]
for name,a,b,expected in [('south-west 50m',[1427.125,1612.545],[1713.115,1612.545],50),('south-east 50m',[2021.545,1612.545],[2307.535,1612.545],50),('east depth',[2373.625,1642.305],[2373.625,1741.095],17.273),('east frontage',[1971.355,1762.875],[2357.695,1762.875],67.545),('west depth',[1367.005,1642.305],[1367.005,1741.095],17.273),('west frontage',[1393.135,1767.915],[1747.135,1767.915],61.893)]:
 measured=math.dist(a,b)*S;cal.append({'name':name,'expectedMetres':expected,'measuredMetres':round(measured,6),'errorMetres':round(measured-expected,6),'pdfEndpoints':[a,b]})
report={'source':scene['site'],'calibration':cal,'counts':dict(collections.Counter(o['kind'] for o in objects)),'labelledZones':sorted(id for id,p in labels),'missingLabels':sorted(set([f'A{i}' for i in range(1,28)]+[f'S{i}' for i in range(1,20)]+[f'V{i}' for i in range(1,7)])-{id for id,p in labels}),'largestCalibrationErrorMetres':max(abs(c['errorMetres']) for c in cal),'method':'PDF rotation matrix + vector endpoint rectangle detection; filled triangle union; text anchor matching; CAD stroke component clustering. No screenshot-derived site placement. Rectangle endpoint quantization 0.1 PDF point (1.75 cm), vector fill simplification 0.7 point (12.2 cm).'}
save('site-seed.json',scene);save('calibration-report.json',report)
print(json.dumps({'counts':report['counts'],'labels':len(labels),'maxCalibrationErrorMetres':report['largestCalibrationErrorMetres'],'output':str(OUT/'site-seed.json')},indent=2))


