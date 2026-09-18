"""Render a diagnostic overlay of final footprint geometry on the source sheet."""
import json,math
from pathlib import Path
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'private/event-studio/rbc';s=json.loads((OUT/'site-seed.json').read_text());im=Image.open(OUT/'source-preview.png').convert('RGBA');layer=Image.new('RGBA',im.size);d=ImageDraw.Draw(layer)
for o in s['objects']:
 if o['kind'] in ['tree','furniture','sign']:continue
 x,y,z=o['position'];yaw=o['rotation'][1];w,h,dep=o['dimensions'];pts=o.get('points') or [[-w/2,-dep/2],[w/2,-dep/2],[w/2,dep/2],[-w/2,dep/2]];world=[(x+a*math.cos(yaw)+b*math.sin(yaw),z-a*math.sin(yaw)+b*math.cos(yaw)) for a,b in pts];p=[((a/.174835+1685)*.65,(b/.174835+1192)*.65) for a,b in world]
 if o['kind'] in ['tent','building']:d.polygon(p,fill=(224,0,159,60));d.line(p+[p[0]],fill=(224,0,159,200),width=2)
 else:d.line(p+[p[0]],fill=(224,0,159,150),width=1)
 if o['kind']=='tent' and o['id'][0] in 'ASV' and len(o['id'])<4:d.text(p[0],o['id'],fill=(150,0,150,255))
Image.alpha_composite(im,layer).convert('RGB').save(OUT/'source-model-overlay.jpg',quality=95)
