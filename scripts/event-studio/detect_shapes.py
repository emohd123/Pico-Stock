import json,math,collections
from pathlib import Path
from shapely.geometry import Polygon,MultiPoint
root=Path(__file__).resolve().parents[2]/'private/event-studio/rbc'
gs=json.loads((root/'vector-groups.json').read_text());ds=[d for g in gs.values() for d in g]
segs=[]
for d in ds:
 if d['color'] and d['fill'] is None and d.get('layer')!='Vegetation':
  for it in d['items']:
   if it[0]=='l':segs.append((it[1],it[2],d['index']))
   elif it[0]=='qu':
    p=it[1]
    segs.extend((p[a],p[b],d['index']) for a,b in [(0,1),(1,3),(3,2),(2,0)])
   elif it[0]=='re':
    x0,y0,x1,y1=it[1];p=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]]
    segs.extend((p[a],p[(a+1)%4],d['index']) for a in range(4))
# endpoints robustly quantized to .1 display pt (1.75cm)
def key(p):return tuple(round(v,1) for v in p)
edges={}; neigh=collections.defaultdict(set)
for a,b,i in segs:
 a,b=key(a),key(b)
 if a==b:continue
 edges[tuple(sorted((a,b)))]=i; neigh[a].add(b);neigh[b].add(a)
rects={}
for a,b in edges:
 u=(b[0]-a[0],b[1]-a[1]);la=math.dist(a,b)
 if la<10:continue
 for c in neigh[b]:
  v=(c[0]-b[0],c[1]-b[1]);lb=math.dist(b,c)
  if lb<10 or abs(u[0]*v[0]+u[1]*v[1])/(la*lb)>.012:continue
  expect=(a[0]+v[0],a[1]+v[1]);hits=[d for d in neigh[a] if math.dist(d,expect)<.25]
  for d in hits:
   if c not in neigh[d]:continue
   p=Polygon([a,b,c,d]);center=tuple(round(v,1) for v in p.centroid.coords[0]);k=(center,round(p.area))
   rects[k]={'center':center,'points':[a,b,c,d],'width':la,'depth':lb,'area':p.area,'angle':math.atan2(u[1],u[0]),'sourceIndices':[edges[tuple(sorted((a,b)))],edges[tuple(sorted((b,c)))],edges[tuple(sorted((c,d)))],edges[tuple(sorted((d,a)))]]}
res=sorted(rects.values(),key=lambda d:d['area'])
(root/'rectangle-candidates.json').write_text(json.dumps(res,indent=2))
print('rectangles',len(res))
for i,r in enumerate(res):print(i,[round(x,1) for x in r['center']],round(r['width']*.174835,2),round(r['depth']*.174835,2))

