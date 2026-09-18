"""Download the RBC catalogue/reference photographs and produce an honest model registry.

Run with system Python. Numeric dimensions are metres in browser [width,height,depth]
order. H/D/W catalogue notation is retained verbatim; D is treated as diameter only
for genuinely round items, not every item that omits W.
"""
from pathlib import Path
import concurrent.futures, datetime, json, re, urllib.request

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'private/event-studio/rbc'
PUBLIC = ROOT / 'public/event-studio/furniture'
BASE = 'https://pico-stock.vercel.app'
URL = BASE + '/api/events/royal-bahrain-concours-2026'

# Estimates based on the reference photographs. They are deliberately not reported
# as measured dimensions. Source dimensions below override individual axes only.
OVERRIDES = {
 'wh-arch-side-console-table': ('arch_console',[1.6,.85,.4]),
 'wh-banquet-chair': ('banquet_chair',[.48,.94,.54]),
 'wh-black-crystal-vase': ('vase',[.17,.30,.17]),
 'wh-classic-crystal-vase': ('urn',[.28,.65,.28]),
 'wh-clear-acrylic-tissue-holder': ('tissue',[.25,.13,.14]),
 'wh-cocktail-table': ('fluted_table',[.65,1.05,.65]),
 'wh-coffee-bar-station': ('curved_bar',[3.2,1.1,.8]),
 'wh-cove-chair': ('cove_chair',[.62,.8,.6]),
 'wh-crystal-table-lamp': ('crystal_lamp',[.13,.24,.13]),
 'wh-curve-back-chair': ('curve_chair',[.55,.78,.55]),
 'wh-decorative-pedestal-pot': ('urn',[.32,.6,.32]),
 'wh-forest-green-cushion': ('cushion',[.45,.45,.16]),
 'wh-glass-and-silver-bowl-stand': ('bowl_stand',[.32,.34,.32]),
 'wh-glass-and-silver-bowl-stand-small': ('bowl_stand',[.24,.24,.24]),
 'wh-glass-top-dining-table': ('table_rect',[2,.76,1]),
 'wh-gold-lined-pouffe': ('gold_pouffe',[.45,.43,.45]),
 'wh-gold-side-table': ('turned_table',[.55,.55,.55]),
 'wh-green-leaf-cushion': ('cushion',[.4,.4,.15]),
 'wh-green-leaf-patterned-pouffe': ('pouffe',[.5,.45,.5]),
 'wh-ivory-cushion': ('cushion',[.45,.45,.16]),
 'wh-ivory-textured-cushion': ('cushion',[.5,.5,.18]),
 'wh-lantern-base-wood-dining-table': ('lantern_table',[1.2,.76,1.2]),
 'wh-layered-pouffe': ('layered_pouffe',[.48,.45,.48]),
 'wh-leaf-pouffe-chair': ('leaf_chair',[.6,.72,.65]),
 'wh-linen-pouffe': ('pouffe',[.5,.45,.5]),
 'wh-long-crystal-vase': ('long_vase',[.42,.14,.14]),
 'wh-offwhite-buttoned-ottoman': ('ottoman',[1.8,.45,.65]),
 'wh-outdoor-lounge-set': ('lounge_set',[3.6,.85,2.6]),
 'wh-outdoor-umbrella-dining-table': ('umbrella_table',[2.4,2.6,2.4]),
 'wh-outdoor-weaved-chair': ('woven_chair',[.52,.86,.56]),
 'wh-oval-travertine-coffee-table': ('oval_table',[.65,.38,.45]),
 'wh-palm-trees-printed-cushion': ('cushion',[.4,.4,.15]),
 'wh-rectangle-and-square-gold-x-glass-coffee-table-set': ('rect_table_set',[1.55,.45,.65]),
 'wh-round-marble-dining-table': ('geometric_table',[1.2,.76,1.2]),
 'wh-round-ottoman': ('pouffe',[1.2,.45,1.2]),
 'wh-shell-crystal-bowl': ('shell_bowl',[.22,.10,.19]),
 'wh-silver-bowls-set': ('bowls_set',[.65,.32,.25]),
 'wh-silver-box-tissue-holder': ('tissue',[.25,.13,.14]),
 'wh-silver-table-lamp': ('table_lamp',[.13,.28,.13]),
 'wh-sleek-gold-coffee-table': ('table_rect',[1.2,.4,.65]),
 'wh-small-classic-vase': ('urn',[.17,.30,.17]),
 'wh-soft-arch-sofa': ('arch_sofa',[2.1,.78,.92]),
 'wh-soft-frame-sofa': ('sofa',[2.2,.82,.9]),
 'wh-straight-off-white-sofa-long': ('sofa',[2.4,.78,.85]),
 'wh-straight-off-white-sofa-short': ('sofa',[1.4,.78,.85]),
 'wh-tall-classic-gold-vase': ('trumpet_vase',[.26,.65,.26]),
 'wh-traditional-arabic-chair': ('arabic_bench',[1.5,.95,.6]),
 'wh-traditional-arabic-ottoman': ('arabic_ottoman',[1.4,.43,.55]),
 'wh-weaved-clay-pot': ('urn',[.2,.20,.2]),
 'wh-white-detailed-pot': ('vase',[.18,.23,.18]),
 'wh-white-engraved-round-dining-table': ('fluted_table',[1,.75,1]),
 'wh-white-rattan-back-chair': ('rattan_chair',[.5,.86,.54]),
 'wh-white-x-gold-coffee-table': ('oval_frame_table',[2,.43,.8]),
 'wh-white-x-gold-coffee-table-set': ('round_table_set',[1.25,.45,.8]),
 'wh-wishbone-chair': ('wishbone_chair',[.56,.76,.55]),
 'wh-wooden-chair': ('crossback_chair',[.48,.88,.53]),
}

def classify(item):
    text = (item['name']+' '+item['description']).lower()
    if item['id'] in OVERRIDES: return OVERRIDES[item['id']]
    if 'bean bag' in text: return 'beanbag',[.8,.7,.8]
    if 'executive chair' in text: return 'executive_chair',[.6,1.3,.67]
    if 'armchair' in text: return 'armchair',[.8,.8,.8]
    if 'bench led' in text: return 'led_bench',[1.5,.75,.6]
    if 'stool' in text: return 'stool',[.4,.85,.4]
    if 'revolving' in text: return 'swivel_chair',[.63,.82,.63]
    if 'chair' in text: return 'chair',[.5,.85,.55]
    if 'table' in text:
        if any(x in text for x in ['rectangular','square','console']): return 'table_rect',[1.2,.75,.6]
        return 'table_round',[.6,.75,.6]
    raise ValueError('Unclassified catalogue item '+item['id'])

def color_for(item):
    text = item['name'].lower()
    # The item name identifies the body. A description such as "gray wooden base"
    # must not turn a Cream Armchair gray, and "upholstered" must not match red.
    overrides={'wh-gold-lined-pouffe':'#e9e4d8','wh-green-leaf-cushion':'#e9e4d8','wh-green-leaf-patterned-pouffe':'#e9e4d8','wh-palm-trees-printed-cushion':'#e9e4d8','wh-outdoor-weaved-chair':'#554f40','wh-weaved-clay-pot':'#e1daca','wh-cocktail-table':'#96714c','wh-oval-travertine-coffee-table':'#d8cdb7','wh-traditional-arabic-chair':'#ab8154'}
    if item['id'] in overrides:return overrides[item['id']]
    if item['id']=='wh-small-classic-vase':return '#c7dfdf'
    patterns=[(r'black\s+white','#d4d0c7'),(r'dark\s+gr[ae]y','#454748'),(r'dark\s+brown','#493023'),(r'forest\s+green','#214336'),(r'white|offwhite|ivory','#e9e4d8'),(r'beige|cream|linen','#d9cbb1'),(r'green','#678460'),(r'orange','#d86a32'),(r'red','#ad2829'),(r'blue','#16458e'),(r'black','#202322'),(r'gr[ae]y','#777879'),(r'gold','#bb9451'),(r'silver','#c0c6c8'),(r'glass|crystal|acrylic','#c7dfdf'),(r'wood|wooden|walnut|wishbone','#ab8154')]
    for pattern,color in patterns:
        if re.search(r'\b(?:'+pattern+r')\b',text):return color
    return '#e9e4d8'

def dimensions(item, kind, defaults):
    source = item['name'] + '\n' + item['description']
    matches = re.findall(r'\b([HDWL])\s*(\d+(?:\.\d+)?)', source, re.I)
    dims = list(defaults); known = set(); notes=[]
    values = {k.upper():float(v)/100 for k,v in matches}
    if 'H' in values: dims[1]=values['H']; known.add(1)
    if 'W' in values or 'L' in values: dims[0]=values.get('W',values.get('L')); known.add(0)
    if 'D' in values:
        dims[2]=values['D']; known.add(2)
        # Round stools have a nominal seat diameter; foot/base width is modeled
        # inside that footprint. Square catalogue table H49*D58 is an edge size.
        round_kind = kind in ('table_round','stool','beanbag','swivel_chair')
        square = 'square' in source.lower()
        if 'W' not in values and (round_kind or square):
            dims[0]=values['D'];known.add(0)
            notes.append('D interpreted as diameter for round item.' if not square else 'D interpreted as square edge length from description.')
    length = re.search(r'(\d+(?:\.\d+)?)\s*(cm|m)\s+length',source,re.I)
    if length: dims[0]=float(length[1])*(.01 if length[2].lower()=='cm' else 1);known.add(0)
    cushion = re.search(r'(\d+)\s*x\s*(\d+)\s*cm',source,re.I)
    if cushion and kind=='cushion': dims[0]=int(cushion[1])*.01;dims[1]=int(cushion[2])*.01;known.update((0,1))
    if item['id']=='prod-1773061941304-nbnj6': notes.append('Catalogue groups large and medium bean bags; model uses the stated H70 D80 large size. Stock is not a size-specific guarantee.')
    missing = [axis for n,axis in enumerate(('width','height','depth')) if n not in known]
    if missing: notes.append('Estimated '+', '.join(missing)+' from photographs and typical proportions; verify before production.')
    if item['id'] in {'prod-1773061941304-l2qbw','prod-1773061941304-7gt1o','prod-1773061941304-jn5xe','prod-1773061941304-8d54j','prod-1773061941304-jpapo'}:
        notes.append('Reference discrepancy: catalogue main photograph does not clearly match the named item or colour; model follows the written item identity and dimensions. Confirm the physical item before final furniture approval.')
    notes.append('Shape reconstructed from catalogue photographs; editable visualization model, not a manufacturer CAD model.')
    return [round(v,4) for v in dims], 'catalogue' if len(known)==3 else ('partial' if known else 'estimated'), ' '.join(notes)

def download(pair):
    url,path=pair
    if urllib.parse.urlparse(url).scheme not in ('http','https'):return {'url':url,'error':'Only HTTP(S) catalogue photographs are supported.'}
    if path.exists() and path.stat().st_size>100: return None
    try:
        with urllib.request.urlopen(url,timeout=50) as r: path.write_bytes(r.read())
    except Exception as e: return {'url':url,'error':str(e)}

def main():
    DATA.mkdir(parents=True,exist_ok=True); (PUBLIC/'photos').mkdir(parents=True,exist_ok=True)
    with urllib.request.urlopen(URL,timeout=45) as r: raw=json.load(r)
    raw['retrievedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat();raw['sourceUrl']=URL
    (DATA/'catalogue.json').write_text(json.dumps(raw,ensure_ascii=False,indent=2),encoding='utf8')
    items=[];downloads=[]
    for row in raw['items']:
        row['id']=str(row['id'])
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,120}',row['id']):raise ValueError('Unsupported product identifier')
        kind,default=classify(row)
        dims,status,notes=dimensions(row,kind,default)
        source_url=urllib.parse.urljoin(BASE,row['image'])
        ext=Path(urllib.parse.urlparse(source_url).path).suffix or '.jpg'
        photo='/event-studio/furniture/photos/'+row['id']+ext
        downloads.append((source_url,ROOT/'public'/photo.lstrip('/')))
        galleries=[]
        for n,url in enumerate(row.get('gallery',[])):
            url=urllib.parse.urljoin(BASE,url);extension=Path(urllib.parse.urlparse(url).path).suffix or '.jpg'
            local='/event-studio/furniture/photos/'+row['id']+'-gallery-'+str(n)+extension
            galleries.append(local);downloads.append((url,ROOT/'public'/local.lstrip('/')))
        items.append(dict(id='furniture-'+row['id'],productId=row['id'],name=row['name'],description=row['description'],category=row['category'],modelUrl='/event-studio/furniture/'+row['id']+'.glb',photoUrl=photo,sourcePhotoUrl=source_url,gallery=galleries,dimensions=dims,color=color_for(row),measurementStatus=status,sourceDimensions=row['name']+'\n'+row['description'],notes=notes,stock=row.get('stock'),modelKind=kind,shapeStatus='reconstructed',previewUrl='/event-studio/furniture/previews/'+row['id']+'.png'))
    registry={'schemaVersion':1,'units':'metres','axes':'Y-up; dimensions width,height,depth; floor-centre origin','sourceUrl':URL,'retrievedAt':raw['retrievedAt'],'items':items}
    (DATA/'furniture-assets.json').write_text(json.dumps(registry,ensure_ascii=False,indent=2),encoding='utf8')
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool: errors=[r for r in pool.map(download,downloads) if r]
    (DATA/'photo-download-report.json').write_text(json.dumps({'requested':len(downloads),'errors':errors},indent=2),encoding='utf8')
    from PIL import Image,ImageDraw,ImageFont,ImageOps
    font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',14)
    (ROOT/'output/event-studio').mkdir(parents=True,exist_ok=True)
    for start in range(0,len(items),25):
        page=Image.new('RGB',(1500,1500),'white');draw=ImageDraw.Draw(page)
        for offset,item in enumerate(items[start:start+25]):
            x=(offset%5)*300;y=(offset//5)*300
            path=ROOT/'public'/item['photoUrl'].lstrip('/')
            if path.exists():
                img=Image.open(path).convert('RGB');img.thumbnail((285,225));page.paste(img,(x+(300-img.width)//2,y+5))
            label=item['name'];label=re.sub(r'^ID \d+(?: ;\d+)? \w+ \[\d+\] ','',label)
            draw.text((x+8,y+233),str(start+offset)+': '+label[:37],font=font,fill='black')
            draw.text((x+8,y+253),item['modelKind'],font=font,fill='black')
            draw.text((x+8,y+273),str(item['dimensions'])+' '+item['measurementStatus'],font=font,fill='black')
        page.save(ROOT/'output/event-studio'/f'catalogue-contact-{start//25+1}.jpg',quality=93)
    print(json.dumps({'items':len(items),'categories':{k:sum(i['category']==k for i in items) for k in set(i['category'] for i in items)},'photoRequests':len(downloads),'errors':errors,'status':{k:sum(i['measurementStatus']==k for i in items) for k in ('catalogue','partial','estimated')}}))

if __name__=='__main__': main()
