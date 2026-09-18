import fitz,json,collections,pickle
from pathlib import Path
root=Path(__file__).resolve().parents[2]/'private/event-studio/rbc'
p=fitz.open(root/'Source-Site-Plan.pdf')[0]
p.get_pixmap(matrix=fitz.Matrix(.65,.65)).save(root/'source-preview.png')
mat=p.rotation_matrix
texts=[]
for b in p.get_text('dict')['blocks']:
 for line in b.get('lines',[]):
  for span in line['spans']:
   r=fitz.Rect(span['bbox'])*mat
   texts.append({'text':span['text'],'box':list(r),'origin':list(fitz.Point(span['origin'])*mat),'size':span['size']})
(root/'source-text.json').write_text(json.dumps(texts,indent=2))
print('Text and preview ready',flush=True)
ds=p.get_drawings()
print('Drawings ready',len(ds),flush=True)
colors=collections.Counter(); groups=collections.defaultdict(list)
for i,d in enumerate(ds):
 color=(d.get('layer',''),d['type'],str(d.get('color')),str(d.get('fill')))
 colors[color]+=1
 # Store outline vertices transformed to displayed landscape coordinates.
 r=d['rect']*mat
 if (r.width>12 or r.height>12) or d.get('layer') not in ['','0','Vegetation']:
  items=[]
  for item in d['items']:
   items.append([item[0]]+[[list(pt*mat) for pt in x] if isinstance(x,fitz.Quad) else list(x*mat) if isinstance(x,(fitz.Point,fitz.Rect)) else x for x in item[1:]])
  groups[str(color)].append({'index':i,'rect':list(r),'items':items,'closePath':d.get('closePath'),'fill':d.get('fill'),'color':d.get('color'),'layer':d.get('layer'),'width':d.get('width')})
(root/'vector-groups.json').write_text(json.dumps(groups))
(root/'source-colors.json').write_text(json.dumps([{'style':k,'count':v} for k,v in colors.most_common()],indent=2))
print('Saved',len(groups),'groups',sum(len(x) for x in groups.values()),flush=True)

