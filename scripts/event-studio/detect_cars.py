import json,numpy as np,cv2,math
from pathlib import Path
r=Path(__file__).resolve().parents[2]/'private/event-studio/rbc';a=np.array(json.loads((r/'car-vector-bounds.json').read_text()));mask=np.zeros((2384*2,3370*2),np.uint8)
for i,x0,y0,x1,y1 in a:cv2.rectangle(mask,(round(x0*2),round(y0*2)),(round(x1*2),round(y1*2)),255,-1)
mask=cv2.dilate(mask,np.ones((3,3),np.uint8));n,labels,stats,cents=cv2.connectedComponentsWithStats(mask)
res=[]
for label,(x,y,w,h,area) in enumerate(stats[1:],1):
 if area<150:continue
 sel=(labels[np.clip(np.round((a[:,2]+a[:,4])).astype(int),0,4767),np.clip(np.round((a[:,1]+a[:,3])).astype(int),0,6739)]==label)
 arr=a[sel];pts=np.concatenate([arr[:,[1,2]],arr[:,[3,4]]]);rect=cv2.minAreaRect(pts.astype(np.float32));(cx,cy),(ww,hh),angle=rect
 if 5<min(ww,hh)<18 and 12<max(ww,hh)<40:
  res.append({'center':[float(cx),float(cy)],'width':float(ww),'depth':float(hh),'angle':math.radians(angle),'points':cv2.boxPoints(rect).tolist(),'sourceCount':len(arr),'sourceRange':[int(arr[:,0].min()),int(arr[:,0].max())]})
print('components',n,'cars',len(res));print(res[:3]);(r/'car-candidates.json').write_text(json.dumps(res,indent=2))
