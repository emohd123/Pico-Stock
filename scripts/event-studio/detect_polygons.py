import json,math
from pathlib import Path
from shapely.geometry import LineString,Polygon
from shapely.ops import polygonize,unary_union
r=Path(__file__).resolve().parents[2]/'private/event-studio/rbc';ds=[d for g in json.loads((r/'vector-groups.json').read_text()).values() for d in g]
res=[]
for d in ds:
 if d['fill'] is not None or d.get('layer')=='Vegetation' or not 3<=len(d['items'])<=20:continue
 if any(i[0]!='l' for i in d['items']):continue
 ps=list(polygonize(unary_union([LineString(i[1:]) for i in d['items']])))
 for p in ps:
  if p.area>300:res.append({'index':d['index'],'area':p.area,'center':list(p.centroid.coords)[0],'points':list(p.exterior.coords)[:-1],'color':d['color']})
(r/'polygon-candidates.json').write_text(json.dumps(res,indent=2))
for i,p in enumerate(res):print(i,p['index'],[round(x,1) for x in p['center']],round(p['area']*.174835**2,1),len(p['points']))
