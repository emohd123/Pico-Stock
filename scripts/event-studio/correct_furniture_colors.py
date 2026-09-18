"""Correct PBR body colours without changing tested GLB geometry or mesh indices."""
from pathlib import Path
import json,struct,sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from fetch_catalogue import color_for

ROOT=Path(__file__).resolve().parents[2];DATA=ROOT/'private/event-studio/rbc'

def linear(hexcode):
    rgb=[int(hexcode.lstrip('#')[n:n+2],16)/255 for n in (0,2,4)]
    return [c/12.92 if c<.04045 else ((c+.055)/1.055)**2.4 for c in rgb]+[1]

def main():
    registry=json.loads((DATA/'furniture-assets.json').read_text(encoding='utf8'))
    source=json.loads((DATA/'catalogue.json').read_text(encoding='utf8'));raw={str(i['id']):i for i in source['items']}
    review=DATA/'furniture-color-review.json';previous=json.loads(review.read_text(encoding='utf8')) if review.exists() else {'changes':[]};changes={i['productId']:i for i in previous['changes']}
    for item in registry['items']:
        expected=color_for(raw[item['productId']]);old=item['color'];item['color']=expected
        path=ROOT/'public'/item['modelUrl'].lstrip('/');data=path.read_bytes();magic,version,length=struct.unpack_from('<III',data,0);jsonlen,ctype=struct.unpack_from('<II',data,12);doc=json.loads(data[20:20+jsonlen]);changed=False
        for material in doc.get('materials',[]):
            if material.get('name','').startswith('Body '):
                material['name']='Body '+expected;material.setdefault('pbrMetallicRoughness',{})['baseColorFactor']=linear(expected);changed=True
                if item['productId']=='wh-small-classic-vase':
                    material['name']='Cut crystal';material['pbrMetallicRoughness']['baseColorFactor']=linear('#cbdedb');material['pbrMetallicRoughness']['roughnessFactor']=.14;material.setdefault('extensions',{})['KHR_materials_transmission']={'transmissionFactor':.63};material['extensions']['KHR_materials_ior']={'ior':1.46}
                    doc['extensionsUsed']=list(set(doc.get('extensionsUsed',[]))|{'KHR_materials_transmission','KHR_materials_ior'})
        if changed:
            content=json.dumps(doc,separators=(',',':'),ensure_ascii=False).encode('utf8');content+=b' '*((-len(content))%4)
            tail=data[20+jsonlen:];output=struct.pack('<III',magic,version,20+len(content)+len(tail))+struct.pack('<II',len(content),ctype)+content+tail;path.write_bytes(output)
        if old!=expected:
            first=changes.get(item['productId'],{}).get('from',old)
            changes[item['productId']]={'productId':item['productId'],'name':item['name'],'from':first,'to':expected}
    (DATA/'furniture-assets.json').write_text(json.dumps(registry,indent=2,ensure_ascii=False),encoding='utf8')
    (DATA/'furniture-color-review.json').write_text(json.dumps({'changes':list(changes.values()),'intendedBodyColors':{i['productId']:i['color'] for i in registry['items']}},indent=2),encoding='utf8')
    print(json.dumps({'reviewedProducts':len(registry['items']),'colorCorrections':len(changes)}))

if __name__=='__main__':main()
