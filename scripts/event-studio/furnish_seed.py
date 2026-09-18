"""Add proposed catalogue furniture without moving measured source geometry."""
import json,math,collections
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'private/event-studio/rbc'
s=json.loads((OUT/'site-seed.json').read_text());reg=json.loads((OUT/'furniture-assets.json').read_text())['items'];assets={x['productId']:x for x in reg}
s['objects']=[o for o in s['objects'] if o['kind']!='furniture'];byid={o['id']:o for o in s['objects']};zones={z['id']:z for z in s['zones']}
for z in zones.values():z['objectIds']=[id for id in z['objectIds'] if not id.startswith('furn-')]
count=0;reject=[]
def place(zone,product,x,z,rot=0,y=.13):
 global count
 a=assets[product];base=byid[zone];yaw=base['rotation'][1];px,py,pz=base['position'];xx=px+x*math.cos(yaw)+z*math.sin(yaw);zz=pz-x*math.sin(yaw)+z*math.cos(yaw)
 count+=1;o={'id':f'furn-{count:04}','name':a['name'],'kind':'furniture','assetId':a['id'],'productId':a['productId'],'zoneId':base.get('zoneId',zone),'position':[round(xx,5),round(py+y,5),round(zz,5)],'rotation':[0,round(yaw+rot,6),0],'dimensions':a['dimensions'],'color':a['color'],'visible':True,'locked':False,'metadata':{'parentTentId':zone,'measurementStatus':a['measurementStatus'],'sourceDimensions':a['sourceDimensions'],'notes':'Proposed furnishing arrangement for review. Furniture photos and catalogue dimension provenance are retained in the asset registry; this placement does not reserve stock.'}}
 s['objects'].append(o);zones[o['zoneId']]['objectIds'].append(o['id']);return o
sofa='wh-soft-frame-sofa';chair='wh-cove-chair';table='wh-sleek-gold-coffee-table'
def seating(zone,x,z,style=0,large=False):
 sf=['wh-soft-frame-sofa','wh-soft-arch-sofa','wh-straight-off-white-sofa-long'][style%3]
 place(zone,sf,x,z-1.45,0);place(zone,'wh-straight-off-white-sofa-short',x,z+1.45,math.pi)
 place(zone,table,x,z);place(zone,'wh-gold-side-table',x+1.7,z-1.45);place(zone,'wh-crystal-table-lamp',x+1.7,z-1.45,y=.68)
 if large:place(zone,'prod-1773061941304-2aleu',x-1.9,z,math.pi/2)
# Owners' 20x40m enclosure: broad centre aisle retained for navigation.
for i,z in enumerate([-12,-4,4]):
 for x in [-5.3,5.3]:seating('owners-enclosure',x,z,i,True)
for x in [-5.2,5.2]:
 for z in [12.5,16.4]:
  place('owners-enclosure','wh-glass-top-dining-table',x,z)
  for dx in [-.65,.65]:
   place('owners-enclosure','wh-white-rattan-back-chair',x+dx,z-.9);place('owners-enclosure','wh-white-rattan-back-chair',x+dx,z+.9,math.pi)
place('owners-enclosure','wh-arch-side-console-table',8,18,math.pi)
# Corporate lounge: six intimate groups and a clear 2.5m central cross aisle.
for i,z in enumerate([-5,4.5]):
 for x in [-7,0,7]:seating('corporate-lounge',x,z,i)
# Hexagonal lounge footprints: two seating islands away from entrance.
for j,zone in enumerate(['lounge-1','lounge-2a','lounge-2b','lounge-3']):
 for x in [-2.4,2.4]:
  place(zone,'wh-straight-off-white-sofa-short',x,-2.6)
  place(zone,'wh-oval-travertine-coffee-table',x,-.9)
  place(zone,'wh-leaf-pouffe-chair',x,1,math.pi)
  place(zone,'wh-layered-pouffe',x,2.7)
 place(zone,'wh-gold-side-table',0,-3.5);place(zone,'wh-silver-table-lamp',0,-3.5,y=.68)
# Hospitality shade deck: slim seating pairs with access from southern side.
for zone in ['shade-pavilion-1','shade-pavilion-2','shade-pavilion-3','shade-pavilion-4']:
 place(zone,'wh-straight-off-white-sofa-short',0,-1.4)
 place(zone,'wh-oval-travertine-coffee-table',0,0)
 place(zone,'wh-leaf-pouffe-chair',-1.45,.9,math.pi/4)
 place(zone,'wh-layered-pouffe',1.35,.9)
# Oasis terrace: shade tables and slim dining groups, all within exact outline.
for x in [-12,-6,0,6]:
 place('oasis-club','wh-outdoor-umbrella-dining-table',x,0)
 for dx,dz,rot in [(-1.5,0,math.pi/2),(1.5,0,-math.pi/2),(0,1.5,math.pi)]:place('oasis-club','wh-outdoor-weaved-chair',x+dx,dz,rot)
# Registration: paired desks with operator chairs, front waiting remains open.
for zone in ['registration-1','registration-2']:
 for x in [-1.5,1.5]:
  place(zone,'prod-1773061941304-2a65k',x,-1.25)
  place(zone,'prod-1773061941304-sye77',x,-2.1)
  place(zone,'wh-clear-acrylic-tissue-holder',x+.4,-1.25,y=.86)
 for x in [-2,0,2]:place(zone,'prod-1773061941304-lwd2x',x,1.7,math.pi)
# Coffee bar has single stocked station with stool pairs and standing tables.
place('coffee-bar','wh-coffee-bar-station',0,-3)
for x in [-2.5,2.5]:
 place('coffee-bar','wh-cocktail-table',x,.4)
 for z in [-.45,1.25]:place('coffee-bar','prod-1435-fhswht04',x,z,math.pi if z>0 else 0)
# Selected exhibition and VIP tents only; display and circulation lawns stay clear.
for zone in ['A1','A3','A8','A14','A21','S1','S5','S8','S14','S19']:
 place(zone,'prod-1548-fwstbl',0,-.6)
 seat='prod-1773061941304-lwd2x' if zone in ['S14','S19'] else 'prod-1773061941304-pcl31';place(zone,seat,-.8,-.6,math.pi/2);place(zone,seat,.8,-.6,-math.pi/2)
for zone in ['V1','V2','V3','V4','V5','V6']:
 place(zone,'wh-straight-off-white-sofa-short',0,-1.5)
 place(zone,'wh-oval-travertine-coffee-table',0,-.1)
 place(zone,'wh-gold-lined-pouffe',1,.9)
# Service furniture is limited to operational tables and chairs.
for x in [-3,0,3]:
 place('service-area','prod-1773061941304-l2qbw',x,-2)
 place('service-area','wh-banquet-chair',x,-3)
# Position acceptance: furniture must lie inside each tent footprint and no
# heightless float except explicitly table-mounted accessories.
from shapely.geometry import Polygon,Point
errors=[]
for o in s['objects']:
 if o['kind']!='furniture':continue
 # Placement groups map to specific host identity (shade group hasfour hosts).
 hosts=[b for b in byid.values() if b.get('zoneId',b['id'])==o['zoneId'] and b['kind']=='tent']
 contained=False
 for b in hosts:
  x,z=o['position'][0]-b['position'][0],o['position'][2]-b['position'][2];a=b['rotation'][1];lx=x*math.cos(a)-z*math.sin(a);lz=x*math.sin(a)+z*math.cos(a)
  w,h,d=b['dimensions'];p=Polygon(b.get('points') or [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]])
  if p.buffer(.03).contains(Point(lx,lz)):contained=True;break
 if not contained:errors.append(o['id'])
counts=collections.Counter(o['productId'] for o in s['objects'] if o['kind']=='furniture');overruns=[{'productId':pid,'name':assets[pid]['name'],'placed':n,'reportedStock':assets[pid]['stock']} for pid,n in counts.items() if assets[pid]['stock'] is not None and n>assets[pid]['stock']]
report={'furnitureInstances':count,'uniqueProductsUsed':len(counts),'furnishedZones':dict(collections.Counter(o['zoneId'] for o in s['objects'] if o['kind']=='furniture')),'stockOverruns':overruns,'outsideHostCentreErrors':errors,'notes':['Arrangements are proposed designs, not source-confirmed allocations.','Central circulation was kept clear; final accessible circulation and furniture clearances require operational review.','No stock reservation performed.','Object centres verified within containing tent footprints.']}
if errors:raise RuntimeError('Outside host: '+','.join(errors))
(OUT/'site-seed.json').write_text(json.dumps(s,indent=2),encoding='utf8');(OUT/'furnishing-report.json').write_text(json.dumps(report,indent=2),encoding='utf8');print(json.dumps(report,indent=2))



