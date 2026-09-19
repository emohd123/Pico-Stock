"""Apply venue identity and appearance evidence without moving source footprints."""

import json,math

from pathlib import Path

ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'private/event-studio/rbc'

MAP='https://drive.google.com/file/d/15c97fvX-mj1N1E_nIMZet7FOWsnWNaDt/view'

MAP_PAGE='https://www.europeantour.com/dpworld-tour/bapco-energies-bahrain-championship-2026/spectator-info/detail/bapco-energies-bahrain-championship-2026-spectator-information/'

CLUB='https://www.theroyalgolfclub.com/gallery/clubhouse-18th.jpg'

MAJLIS='https://www.theroyalgolfclub.com/gallery/events-majlis.jpg'

WATER='https://royalconcours.com/wp-content/uploads/2025/11/Bahrain-Concours-Classic-Waterfront-Header.jpg'

PALM='https://royalconcours.com/wp-content/uploads/2025/03/the-royal-golf-club-bahrain.jpg'

PROFILE=[[0,.96],[.35,.99],[.65,1],[.78,.97],[.9,.87],[1,.72]]

def apply_scene(scene):

 objects=scene['objects'];byid={o['id']:o for o in objects};s=scene['site']['metresPerPoint'];ox,oz=scene['site']['originPdf']

 evidence='Permanent architecture identified by matching the source plan with the official 2026 DP World Tour site-map aerial inset and current Royal Golf Club photographs. Footprint and position are plan-derived. Height, glazing grid, roof section and facade detailing are visual estimates; no measured elevations were available.'

 for id,name,arch,height in [('arrival-building','Royal Golf Club · main clubhouse','royal-clubhouse-main',12),('existing-west-building','Royal Golf Club · glazed wing','royal-clubhouse-wing',8)]:

  o=byid[id];o['name']=name;o['dimensions'][1]=height;o['color']='#c7c6bd';o['metadata'].update({'architecture':arch,'identityConfidence':'high','footprintStatus':'plan-derived','heightStatus':'estimated','visualReferences':[MAP_PAGE,MAP,CLUB],'notes':evidence})

  if arch=='royal-clubhouse-main':

   a,b=o['points'][:2];v=[b[0]-a[0],b[1]-a[1]];L=math.hypot(*v);o['metadata']['roofAxis']=[round(v[0]/L,8),round(v[1]/L,8)];o['metadata']['roofProfile']=PROFILE

  for z in scene['zones']:

   if z['id']==id:z['name']=name

 cx,cz=913.55517578125,1042.364990234375;diameter=(968.0802001953125-859.0301513671875)*s;pos=[round((cx-ox)*s,5),0,round((cz-oz)*s,5)]

 majlis={'id':'royal-majlis','name':'Royal Golf Club · Majlis','kind':'building','position':pos,'rotation':[0,0,0],'dimensions':[round(diameter,5),15,round(diameter,5)],'color':'#729395','points':[[round(math.cos(i*math.tau/96)*diameter/2,5),round(math.sin(i*math.tau/96)*diameter/2,5)] for i in range(96)],'roofType':'flat','zoneId':'royal-majlis','locked':False,'visible':True,'metadata':{'measurementStatus':'mixed','architecture':'royal-majlis','identityConfidence':'high','footprintStatus':'plan-derived','heightStatus':'estimated','sourceIndices':[14482],'sourceDimensions':f'PDF circle diameter {diameter:.5f} m','sourcePdfCentre':[cx,cz],'visualReferences':[MAP_PAGE,MAP,MAJLIS,CLUB],'notes':evidence+' Circular outline is source path 14482, sampled into 96 vertices. The 15m overall height and diamond lattice proportions are editable photographic estimates.'}}

 if 'royal-majlis' in byid:objects[objects.index(byid['royal-majlis'])]=majlis

 else:objects.append(majlis)

 zone={'id':'royal-majlis','name':majlis['name'],'position':pos,'objectIds':['royal-majlis']}

 zs=next((z for z in scene['zones'] if z['id']=='royal-majlis'),None)

 if zs:zs.update(zone)

 else:scene['zones'].append(zone)

 for o in objects:

  if o['kind']=='water':o['metadata'].update({'visualReferences':[WATER,CLUB],'stoneEdge':True,'shorelineDetail':'Pale irregular stone edge; visual-detail width 0.32m and height 0.24m are estimates and do not change the source shoreline.'})

  elif o['kind']=='tree':o['metadata']['visualReferences']=[PALM];o['metadata']['appearanceStatus']='Palm leaf structure supported by venue photographs; exact species and per-tree size remain estimates.'

 notice='Venue appearance refined from official organizer and venue photographs plus DP World Tour 2026 aerial site map. Clubhouse/Majlis identity is corroborated; all heights and architectural detailing remain estimates. The map is used for permanent architecture only, not golf-tournament temporary structures.'

 scene['site']['assumptions']=[v for v in scene['site']['assumptions'] if not v.startswith('Venue appearance refined')]
 scene['site']['assumptions'].append(notice)

 scene['site']['appearance']={**scene['site'].get('appearance',{}),'turfColor':'#71924c'}

 scene['site']['references']=[{'title':'2026 source site plan','url':'https://1drv.ms/b/c/a3fd1f828162dbab/IQADX25t099mRapXmiVoiV3cAQYnHXpOlhl8p153_kMA_UY','kind':'plan','notes':'User-supplied vector plan controls horizontal positions, footprints and metre scale.'},{'title':'Official venue and clubhouse photograph','url':'https://royalconcours.com/venue/','kind':'venue','notes':'Venue photographs guide turf, palms and materials. Heights remain estimates.'},{'title':'Royal Golf Club Majlis photograph','url':MAJLIS,'kind':'venue','notes':'Circular glazing and diamond lattice appearance; dimensions other than plan footprint are estimates.'},{'title':'2026 DP World Tour venue map','url':MAP_PAGE,'kind':'venue','notes':'Aerial inset corroborates permanent clubhouse and Majlis identity only. Golf-tournament temporary structures are not copied.'},{'title':'2025 Royal Bahrain Concours gallery','url':'https://royalconcours.com/gallery/','kind':'event','notes':'Previous-year photographs guide appearance, not 2026 object positions or allocations.'}]

 return scene

if __name__=='__main__':

 p=OUT/'site-seed.json';scene=apply_scene(json.loads(p.read_text()));p.write_text(json.dumps(scene,indent=2),encoding='utf8')

 report=json.loads((OUT/'calibration-report.json').read_text());report['source']=scene['site'];report['counts']['building']=8;report['venueRefinement']={'addedSourceObject':'royal-majlis','sourcePath':14482,'position':next(o['position'] for o in scene['objects'] if o['id']=='royal-majlis'),'identityEvidence':[MAP_PAGE,MAP,MAJLIS],'existingFootprintsMoved':False,'totalObjectsWithFurniture':len(scene['objects'])};(OUT/'calibration-report.json').write_text(json.dumps(report,indent=2))

 print(json.dumps({'objects':len(scene['objects']),'majlis':next(o for o in scene['objects'] if o['id']=='royal-majlis'),'mainRoofAxis':next(o['metadata']['roofAxis'] for o in scene['objects'] if o['id']=='arrival-building')},indent=2))

