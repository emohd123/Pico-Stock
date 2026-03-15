import json, urllib.request, urllib.error

SUPABASE_URL = 'https://wldurkxlzkqmcfadpybd.supabase.co'
SERVICE_KEY = 'sb_secret_Tjqhr6yYkLNzQW2ErR7ejg_N09DAAEX'

def patch(db_id, payload):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/products?id=eq.{db_id}',
        data=data, method='PATCH',
        headers={
            'apikey': SERVICE_KEY,
            'Authorization': f'Bearer {SERVICE_KEY}',
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
        }
    )
    try:
        urllib.request.urlopen(req)
        return True
    except Exception as e:
        print(f'  ERROR {db_id}: {e}')
        return False

def insert(payload):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        f'{SUPABASE_URL}/rest/v1/products',
        data=data, method='POST',
        headers={
            'apikey': SERVICE_KEY,
            'Authorization': f'Bearer {SERVICE_KEY}',
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        }
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except Exception as e:
        print(f'  ERROR inserting: {e}')
        return None

# db_id -> (name, description, price, stock)
UPDATES = {
    'PICO-FRN-U30GGE': ('ID 1451 FPVCCHRB [36] Stackable Chair Black H84*D44*W48cm', 'Molded PVC', 1, 36),
    'PICO-FRN-U30S25': ('ID 1534 FVCHIKEWHT [108] Stackable Chair White H83*D52*W47cm', 'PVC Seat & Backrest / Painted steel leg', 1, 108),
    'PICO-FRN-U30HV4': ('ID 4279 FPVCCHRR1 [83] Stackable Chair Red H80*D55*W47cm', 'Molded PVC', 1, 83),
    'PICO-FRN-U30CZ1': ('ID 4281 FPVCCHRW2 [17] Stackable Chair White H80*D55*W47cm', 'Molded PVC', 1, 17),
    'PICO-FRN-U301V9': ('ID 4282 FPVCCHRG [61] Stackable Chair Green H80*D55*W47cm', 'Molded PVC', 1, 61),
    'PICO-FRN-U30SCK': ('ID 1507 FSSOFABEIGE1 [10] Armchair Cream H75*D80*W80cm', 'Single-seat Sofa, PU Leather Cream / wooden gray base', 28, 10),
    'PICO-FRN-U30KH3': ('ID 4447 FVRCHRIKEA [20] Revolving Chair White H82*D63cm', 'Swivel Seat / metal base', 15, 20),
    'PICO-FRN-U30WEQ': ('ID 1514 FSSOFAGRY2 [16] Armchair Grey H78*D80*W93cm', 'Single-seat Sofa, fabric / chrome legs', 15, 16),
    'PICO-FRN-U30RS4': ('ID 1519 FSSSOFABLK1 [16] Armchair Black H68*D68*W83cm', 'Single-seat Sofa, leather / metal frame legs', 15, 16),
    'PICO-FRN-U30UBL': ('ID 4412 FSSOFADGREY [500] Armchair Dark Grey H73*D64*W64cm', 'Single-seat Sofa, PU Leather Dark w/ Light Grey / wooden legs', 12, 500),
    'PICO-FRN-U30DQ1': ('ID 1452 FPVCCHRGRY [29] Meeting Chair Grey H85*D45*W35cm', 'PVC Seat & Backrest with leather cushion / wooden legs', 6, 29),
    'PICO-FRN-U30P4D': ('ID 1456 FPVCCHRW2 [16] Meeting Chair White H80*D63*W63cm', 'PVC Visitor Chair / wooden legs', 6, 16),
    'PICO-FRN-U30I6H': ('ID 1384 FEXECHRB [26] Executive Chair Black H130*D67*W60cm', 'High back leather chair with castors / chrome base', 21, 26),
    'PICO-FRN-U30NS3': ('ID 5119 FSSOFABEIGE3 [10] Armchair Beige H88*D92*W97cm', 'Single-seat Sofa, Fabric / Wooden Legs', 25, 10),
    'PICO-FRN-U30SBA': ('ID 5120 FSSOFAWHT3 [4] Armchair White H72*D75*W78cm', 'Single-seat Sofa, Fabric Polyester Fiber', 20, 4),
    'PICO-FRN-U303G3': ('ID 4938 FSSOFABEIGE2 [4] Armchair Beige H75*D75cm', 'Single-seat Sofa, PU Leather / wooden black base', 20, 4),
    'PICO-FRN-U301EG': ('ID 5121 FSSOFABW [4] Armchair Black White H72*D75*W78cm', 'Single-seat Sofa, Fabric Polyester Fiber', 20, 4),
    'PICO-FRN-U3017T': ('ID 1373 ;1374 FBEANBAGSB1 [25] Bean Bag Black H70*D80cm', 'PU leather & polyester. Large (25 units) & Medium (19 units)', 5, 25),
    'PICO-FRN-U302PX': ('ID 1530 FVCHBLU1 [144] Stackable Chair Blue H79*D47*W51cm', 'Polypropylene Seat & Backrest / Chrome frame', 0.5, 144),
    'PICO-FRN-U30WA2': ('ID 1524 FVCHBLK1 [154] Stackable Chair Black H79*D47*W51cm', 'Polypropylene Seat & Backrest / Chrome frame', 0.5, 154),
    'PICO-FRN-U30OK0': ('ID 1454 FPVCCHRR [106] Stackable Chair Red H84*D44*W48cm', 'Molded PVC', 1, 106),
    'PICO-FRN-U30OEX': ('ID 4280 FPVCCHRO [32] Stackable Chair Orange H80*D55*W47cm', 'Molded PVC', 1, 32),
    'PICO-FRN-U309GB': ('ID 1455 FPVCCHRW1 [134] Stackable Chair White H84*D44*W48cm', 'Molded PVC', 1, 134),
    'PICO-FRN-U30NSK': ('ID 1436 FIKEMTBL [49] Meeting Table White H72*D75*W125cm', 'Rectangular table melamine top / steel legs', 12, 49),
    'PICO-FRN-U30OZK': ('ID 1419 FHGTBL [20] High Table Glass H105*D70cm', 'Chrome leg base', 18, 20),
    'PICO-FRN-U30KSO': ('ID 4675 FHSWHT05 [24] High Stool White H103*D40*W40cm', 'Swivel PVC seat & Backrest with leather cushion / Adjustable height / Chrome legs', 15, 24),
    'PICO-FRN-U303S9': ('ID 1440 FLSBLK01 [49] Low Stool Black H61*D30cm', 'Adjustable height / chrome base / casters', 5, 49),
    'PICO-FRN-U30XVZ': ('ID 1541 FVIPCHR1 [100] VIP Armchair Black H90*D50*W60cm', 'Black leather / Black silver wood frame', 25, 100),
    'PICO-FRN-U30ZLB': ('ID 5085 FVCHRGRY [13] Meeting Chair Dark Grey H91*D51cm', 'Leather / Wooden legs', 12, 13),
    'PICO-FRN-U30XHR': ('ID 1422 FHSBLK01 [36] High Stool Black H89*D39cm', 'Swivel leather cushion seat / chrome leg base', 12, 36),
    'PICO-FRN-U30JCV': ('ID 5014 FVCHWHT1 [9] Meeting Chair White H93*D60*W55cm', 'Leather / Chrome Frame', 10, 9),
    'PICO-FRN-U30PWL': ('ID 4405 FHGTBLA [6] High Table Glass H105*D60cm', 'Height adjustable chrome leg base', 18, 6),
    'PICO-FRN-U30M9T': ('ID 1406 FGCTBL4 [20] Low Table Glass H48*D57cm', 'Round glass coffee table / chrome leg / glass base', 10, 20),
    'PICO-FRN-U30W3H': ('ID 1417 FHBARTBL3 [73] High Table Black H90*D60cm', 'High table with black leather top. Height adjustable chrome leg base', 18, 73),
    'PICO-FRN-U30RO4': ('ID 1413 FGRTBL4 [80] Meeting Table Glass H70*D80cm', 'Round table with glass top, truss column leg with black metal base', 15, 80),
    'PICO-FRN-U30UJ5': ('ID 1494 FRWTBL [18] Meeting Table Cream H75*D60cm', 'Round table with granite top / painted steel leg base', 12, 18),
    'PICO-FRN-U30ZDG': ('ID 1405 FGCTBL3 [6] Low Table Glass H43*D60*W120cm', 'Rectangular glass coffee table / Chrome legs', 12, 6),
    'PICO-FRN-U30MGE': ('ID 4411 FIKEACTBL [77] Console Table Dark Brown H73*D60*W140cm', 'Rectangular wooden table / white metal legs', 12, 77),
    'PICO-FRN-U30Z8O': ('ID 4663 FGCTBL5 [8] Low Table Glass H49*D58cm', 'Square glass coffee table / Steel Legs', 12, 8),
    'PICO-FRN-U30KE7': ('ID 5081 FACTBL [55] Low Table Clear Acrylic H48*D57cm', 'Round acrylic coffee table / steel leg / base', 10, 55),
}

print(f'Updating {len(UPDATES)} products in Supabase...')
ok = 0
for db_id, (name, desc, price, stock) in UPDATES.items():
    payload = {'name': name, 'description': desc, 'price': price, 'stock': stock, 'in_stock': stock > 0}
    if patch(db_id, payload):
        ok += 1
        print(f'  OK {db_id}: {name[:52]}')
print(f'\nUpdated: {ok}/{len(UPDATES)}')

NEW_PRODUCTS = [
    {'name': 'ID 1435 FHSWHT04 [17] High Stool White H85*D35*W45cm',
     'description': 'Swivel leather cushion seat, adjustable height / chrome leg base',
     'category': 'furniture', 'price': 15, 'currency': 'BHD',
     'image': '/products/table.svg', 'in_stock': True, 'featured': False, 'stock': 17},
    {'name': 'ID 1439 FLEDPCHR [15] Bench LED White H75*D60*W150cm',
     'description': 'LED bench with white metal frame, multi-colour / RGB light',
     'category': 'furniture', 'price': 30, 'currency': 'BHD',
     'image': '/products/table.svg', 'in_stock': True, 'featured': False, 'stock': 15},
    {'name': 'ID 1548 FWSTBL [76] Meeting Table White H75*D90*W90cm',
     'description': 'Square wooden table / wood',
     'category': 'furniture', 'price': 10, 'currency': 'BHD',
     'image': '/products/table.svg', 'in_stock': True, 'featured': False, 'stock': 76},
]

print(f'\nAdding {len(NEW_PRODUCTS)} new products...')
for p in NEW_PRODUCTS:
    result = insert(p)
    status = 'ADDED' if result else 'FAILED'
    print(f'  {status}: {p["name"][:52]}')

print('\nDone!')
