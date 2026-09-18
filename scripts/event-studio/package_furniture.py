"""Package verified furniture assets and source/reference material for handoff."""
from pathlib import Path
import json, shutil, zipfile
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[2]
DATA=ROOT/'private/event-studio/rbc'
PUBLIC=ROOT/'public/event-studio/furniture'
OUTPUT=ROOT/'output/event-studio'

def main():
    registry=json.loads((DATA/'furniture-assets.json').read_text(encoding='utf8'))
    verification=json.loads((DATA/'furniture-verification.json').read_text(encoding='utf8'))
    assert verification['count']==99 and verification['passed']==99,'All 99 models must pass dimension and origin verification first.'
    items=registry['items'];font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',14)
    for photo in (PUBLIC/'photos').iterdir():
        if photo.is_file():
            with Image.open(photo) as source_image:source_image.verify()
    for start in range(0,len(items),25):
        page=Image.new('RGB',(1500,1600),'#f0eeea');draw=ImageDraw.Draw(page)
        for offset,item in enumerate(items[start:start+25]):
            x=(offset%5)*300;y=(offset//5)*320
            image=Image.open(PUBLIC/'previews'/(item['productId']+'.png')).convert('RGB');image.thumbnail((292,255));page.paste(image,(x+(300-image.width)//2,y))
            label=item['name'];label=label[label.find(']')+2:] if ']' in label else label
            for n,line in enumerate([label[:34],label[34:68] if len(label)>34 else '',str(item['dimensions'])+' m / '+item['measurementStatus']]):draw.text((x+9,y+258+n*18),line,font=font,fill='#292d2c')
        page.save(OUTPUT/f'furniture-models-{start//25+1}.jpg',quality=92)
    readme='''ROYAL BAHRAIN CONCOURS 2026 — FURNITURE ASSET LIBRARY

Contents
99 product-linked 3D models: 78 furniture products and 21 accessories.
158 original catalogue and gallery photographs, plus 99 rendered model previews.
Editable furniture-library.blend with separately named components per product.
The GLB folder contains optimized browser assets in metres and Y-up coordinates.
Each GLB is centred on the floor in X/Z with the bottom at Y=0. Source Blender
geometry is Z-up. Registry dimensions are [width,height,depth] in metres.

Accuracy and provenance
41 items carry all three source dimensions; 9 have partial source dimensions;
49 use explicitly estimated dimensions. Every shape is a reconstruction from
photographs, not manufacturer CAD. Partial and estimated measurements must be
confirmed before fabrication or final furniture planning. Original catalogue
wording, dimensions, photo links and reported stock remain in the registry.
Some catalogue main photographs visibly conflict with item names or colours;
these records carry a discrepancy note and follow the written identity.
Stock is a catalogue snapshot, not a booking or availability guarantee.

Editing in Blender
Open furniture-library.blend. Products are arranged on a 4 m library grid.
Find a collection by its stable furniture-<productId> identifier. Each root
has source and measurement properties. Move or scale the root to place the
whole product; select child parts to change geometry or materials. Collection
assets may be appended into another .blend. Models have no external textures.
The library retains object parts; GLBs combine parts sharing materials to
reduce browser draw calls. Direct edits to one format do not automatically
change the other. Rerun the provided generation/export script when appropriate.

Verification
Three.js GLTFLoader loaded all 99 exports and checked their bounds against the
registry with a 1 mm tolerance, Y-up orientation, floor-centred origins and
presence of catalogue photos. The included verification report records the
actual dimensions and mesh/triangle counts per product. Rendered contact sheets
are supplied for visual review; photo-real manufacturer detail is not claimed.
'''
    (OUTPUT/'FURNITURE-README.txt').write_text(readme,encoding='utf8')
    zip_path=DATA/'furniture-library.zip'
    with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
        archive.write(OUTPUT/'furniture-library.blend','furniture-library.blend')
        archive.write(OUTPUT/'FURNITURE-README.txt','README.txt')
        for name in ['furniture-assets.json','catalogue.json','furniture-build-report.json','furniture-verification.json','furniture-native-verification.json','furniture-color-review.json','furniture-surface-review.json','photo-download-report.json']:
            archive.write(DATA/name,'private/event-studio/rbc/'+name)
        for folder in [PUBLIC]:
            for path in folder.rglob('*'):
                if path.is_file():archive.write(path,'public/event-studio/furniture/'+path.relative_to(PUBLIC).as_posix())
        for path in (ROOT/'scripts/event-studio').glob('*furniture*'):
            if path.is_file():archive.write(path,'scripts/event-studio/'+path.name)
        archive.write(ROOT/'scripts/event-studio/fetch_catalogue.py','scripts/event-studio/fetch_catalogue.py')
        for path in OUTPUT.glob('furniture-models-*.jpg'):archive.write(path,'review/'+path.name)
        for path in OUTPUT.glob('catalogue-contact-*.jpg'):archive.write(path,'review/'+path.name)
    shutil.copy2(OUTPUT/'furniture-library.blend',DATA/'furniture-library.blend')
    print(json.dumps({'archive':str(zip_path),'archiveBytes':zip_path.stat().st_size,'blendBytes':(DATA/'furniture-library.blend').stat().st_size,'products':len(items),'previews':len(list((PUBLIC/'previews').glob('*.png')))}))

if __name__=='__main__':main()
