import fitz,json,collections
from pathlib import Path
root=Path(__file__).resolve().parents[2]/'private/event-studio/rbc';p=fitz.open(root/'Source-Site-Plan.pdf')[0];mat=p.rotation_matrix
cars=[];extra=[]
for i,d in enumerate(p.get_drawings()):
 c=d.get('color')
 if c and abs(c[0])<.001 and abs(c[1]-.29804)<.001:
  r=d['rect']*mat;cars.append([i,*list(r)])
 if c and abs(c[0])<.001 and abs(c[1]-.24706)<.001 or d.get('layer')=='Vegetation':
  r=d['rect']*mat;items=[]
  for it in d['items']:items.append([it[0]]+[[list(pt*mat) for pt in x] if isinstance(x,fitz.Quad) else list(x*mat) if isinstance(x,(fitz.Point,fitz.Rect)) else x for x in it[1:]])
  extra.append({'index':i,'rect':list(r),'items':items,'closePath':d.get('closePath'),'fill':d.get('fill'),'color':c,'layer':d.get('layer'),'width':d.get('width')})
(root/'car-vector-bounds.json').write_text(json.dumps(cars))
(root/'all-blue-vegetation.json').write_text(json.dumps(extra))
print(len(cars),len(extra))
