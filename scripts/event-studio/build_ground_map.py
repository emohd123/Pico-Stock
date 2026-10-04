"""Ground cover around and under the event, from satellite imagery.

Samples Esri World Imagery on the plan's own grid (through site.georeference) and classifies each
half-metre cell as turf, sand, water or paving. The output is a derived classification, not imagery:
a colour map the studio drapes over the ground, plus the cleaned class mask for inspection.

    python scripts/event-studio/build_ground_map.py            # writes public/event-studio/rbc-ground.png

Tiles are cached under output/event-studio/ground-tiles.
"""
import io, json, math, os, sys, urllib.request
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SEED = os.path.join(ROOT, 'private', 'event-studio', 'rbc', 'site-seed.json')
OUT = os.path.join(ROOT, 'public', 'event-studio', 'rbc-ground.png')
CACHE = os.path.join(ROOT, 'output', 'event-studio', 'ground-tiles')
BOUNDS = {'minX': -560.0, 'maxX': 560.0, 'minZ': -420.0, 'maxZ': 420.0}
CELL = 0.5          # metres per output pixel
ZOOM = 18           # about 0.54 m per pixel at this latitude
PALETTE = {         # what the studio draws for each class; detail is added in the shader
    'turf': (104, 142, 70), 'sand': (214, 196, 158), 'water': (66, 104, 106), 'paving': (152, 150, 142),
}

def georeference():
    site = json.load(open(SEED, encoding='utf8'))['site']
    g = site['georeference']
    bearing = math.radians(g['planXBearingDegrees']); sx, sz = g['metresOnGroundPerPlanMetre']['x'], g['metresOnGroundPerPlanMetre']['z']
    lat0 = g['origin']['lat']
    mlat = 111132.92 - 559.82 * math.cos(math.radians(2 * lat0)) + 1.175 * math.cos(math.radians(4 * lat0))
    mlon = 111412.84 * math.cos(math.radians(lat0)) - 93.5 * math.cos(math.radians(3 * lat0))
    # plan +X points `bearing` east of north; plan +Z is a right angle further round, towards east
    x_axis = (math.cos(bearing) * sx, math.sin(bearing) * sx)
    z_axis = (-math.sin(bearing) * sz, math.cos(bearing) * sz)
    def to_latlon(X, Z):
        north = X * x_axis[0] + Z * z_axis[0]; east = X * x_axis[1] + Z * z_axis[1]
        return lat0 + north / mlat, g['origin']['lon'] + east / mlon
    return to_latlon

def tile(z, x, y):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f'{z}_{x}_{y}.jpg')
    if not os.path.exists(path):
        url = f'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
        data = urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'PicoStock-EventStudio/1.0'}), timeout=60).read()
        open(path, 'wb').write(data)
    return np.asarray(Image.open(path).convert('RGB'), dtype=np.float32)

def sample(to_latlon):
    xs = np.arange(BOUNDS['minX'] + CELL / 2, BOUNDS['maxX'], CELL)
    zs = np.arange(BOUNDS['minZ'] + CELL / 2, BOUNDS['maxZ'], CELL)
    X, Z = np.meshgrid(xs, zs)  # rows follow +Z, columns follow +X
    lat, lon = np.vectorize(to_latlon)(X, Z)
    n = 2 ** ZOOM
    gx = (lon + 180) / 360 * n * 256
    gy = (1 - np.log(np.tan(np.radians(lat)) + 1 / np.cos(np.radians(lat))) / math.pi) / 2 * n * 256
    tx0, tx1, ty0, ty1 = int(gx.min() // 256), int(gx.max() // 256), int(gy.min() // 256), int(gy.max() // 256)
    mosaic = np.zeros(((ty1 - ty0 + 1) * 256, (tx1 - tx0 + 1) * 256, 3), np.float32)
    for ty in range(ty0, ty1 + 1):
        for tx in range(tx0, tx1 + 1):
            mosaic[(ty - ty0) * 256:(ty - ty0 + 1) * 256, (tx - tx0) * 256:(tx - tx0 + 1) * 256] = tile(ZOOM, tx, ty)
    u, v = gx - tx0 * 256 - .5, gy - ty0 * 256 - .5
    return np.stack([ndimage.map_coordinates(mosaic[..., c], [v, u], order=1, mode='nearest') for c in range(3)], -1)

def classify(rgb):
    # Measured on this imagery: irrigated turf is dark and strongly green (luminance 30-65, green
    # 15-25 above red and blue); the lakes are darker still (about 16); desert sand is bright and warm
    # (red 40 above blue); asphalt is a cooler mid grey (red about 20 above blue).
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    smooth = lambda a, s=1.2: ndimage.gaussian_filter(a, s)
    lum_s = smooth(rgb.mean(-1))
    green_s = smooth(g - np.maximum(r, b))
    warm_s = smooth(r - b)
    water = smooth(rgb.mean(-1), 2.5) < 24
    labels, count = ndimage.label(water)
    sizes = ndimage.sum(water, labels, range(1, count + 1))
    water = np.isin(labels, 1 + np.flatnonzero(sizes >= 300 / CELL ** 2))   # lakes, not shadows
    turf = (green_s > 7) & (lum_s < 150) & ~water
    paving = (lum_s > 85) & (lum_s < 190) & (green_s < 4) & (warm_s < 27) & ~water & ~turf
    classes = np.full(lum_s.shape, 'sand', dtype=object)
    classes[paving] = 'paving'; classes[turf] = 'turf'; classes[water] = 'water'
    # Tidy up speckle: majority filter on each class mask.
    order = ['sand', 'paving', 'turf', 'water']
    stack = np.stack([ndimage.uniform_filter((classes == name).astype(np.float32), 5) for name in order])
    return np.array(order, dtype=object)[stack.argmax(0)]

OSM_CACHE = os.path.join(ROOT, 'output', 'event-studio', 'osm-context.json')
CONTEXT = os.path.join(ROOT, 'public', 'event-studio', 'rbc-context.json')
ROAD_WIDTH = {'primary': 14, 'secondary': 11, 'tertiary': 10, 'tertiary_link': 7, 'residential': 7, 'unclassified': 6, 'service': 4.5, 'living_street': 6, 'footway': 2.2, 'path': 2.4, 'cycleway': 2.2, 'track': 3}

def osm(to_latlon):
    """Roads, lakes and buildings from OpenStreetMap (ODbL), cached after the first fetch."""
    if not os.path.exists(OSM_CACHE):
        corners = [to_latlon(x, z) for x in (BOUNDS['minX'], BOUNDS['maxX']) for z in (BOUNDS['minZ'], BOUNDS['maxZ'])]
        s, w, n, e = min(c[0] for c in corners), min(c[1] for c in corners), max(c[0] for c in corners), max(c[1] for c in corners)
        box = f'{s},{w},{n},{e}'
        query = f'[out:json][timeout:60];(way["building"]({box});way["highway"]({box});way["natural"="water"]({box});way["golf"="water_hazard"]({box}););out geom;'
        import urllib.parse
        data = urllib.request.urlopen(urllib.request.Request('https://overpass-api.de/api/interpreter', data=urllib.parse.urlencode({'data': query}).encode(), headers={'User-Agent': 'PicoStock-EventStudio/1.0'}), timeout=120).read()
        open(OSM_CACHE, 'wb').write(data)
    return json.load(open(OSM_CACHE, encoding='utf8'))['elements']

def plan_coordinates(to_latlon):
    """The inverse of to_latlon, solved once: (lat, lon) to plan (X, Z)."""
    lat0, lon0 = to_latlon(0, 0)
    ax, az = to_latlon(1, 0), to_latlon(0, 1)
    m = np.array([[ax[0] - lat0, az[0] - lat0], [ax[1] - lon0, az[1] - lon0]])
    inverse = np.linalg.inv(m)
    return lambda lat, lon: tuple(inverse @ np.array([lat - lat0, lon - lon0]))

def paint_osm(classes, elements, to_plan):
    import cv2
    grid = lambda points: np.array([[(x - BOUNDS['minX']) / CELL, (z - BOUNDS['minZ']) / CELL] for x, z in points], np.int32)
    water = np.zeros(classes.shape, np.uint8); paving = np.zeros(classes.shape, np.uint8)
    for element in elements:
        tags, geometry = element.get('tags', {}), element.get('geometry') or []
        points = [to_plan(p['lat'], p['lon']) for p in geometry]
        if len(points) < 2: continue
        if tags.get('natural') == 'water' or tags.get('golf') == 'water_hazard':
            cv2.fillPoly(water, [grid(points)], 1)
        elif tags.get('highway') in ROAD_WIDTH:
            cv2.polylines(paving, [grid(points)], False, 1, max(1, int(round(ROAD_WIDTH[tags['highway']] / CELL))), lineType=cv2.LINE_AA)
    classes[paving > 0] = 'paving'
    classes[water > 0] = 'water'
    return classes

MS_TILE = os.path.join(ROOT, 'output', 'event-studio', 'msbuildings', '123022113.csv.gz')
MS_LIST = 'https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv'

def microsoft_footprints(to_latlon):
    """Microsoft Global ML Building Footprints (ODbL) for Bahrain tile 123022113, which holds the venue."""
    import gzip
    if not os.path.exists(MS_TILE):
        os.makedirs(os.path.dirname(MS_TILE), exist_ok=True)
        listing = urllib.request.urlopen(MS_LIST, timeout=120).read().decode('utf8').splitlines()
        url = next(line.split(',')[2] for line in listing if line.startswith('Bahrain,123022113,'))
        open(MS_TILE, 'wb').write(urllib.request.urlopen(url, timeout=300).read())
    corners = [to_latlon(x, z) for x in (BOUNDS['minX'], BOUNDS['maxX']) for z in (BOUNDS['minZ'], BOUNDS['maxZ'])]
    s, w, n, e = min(c[0] for c in corners), min(c[1] for c in corners), max(c[0] for c in corners), max(c[1] for c in corners)
    rings = []
    with gzip.open(MS_TILE, 'rt', encoding='utf8') as handle:
        for line in handle:
            ring = json.loads(line)['geometry']['coordinates'][0]
            lats = [p[1] for p in ring]; lons = [p[0] for p in ring]
            if max(lats) < s or min(lats) > n or max(lons) < w or min(lons) > e: continue
            rings.append([(p[1], p[0]) for p in ring])
    return rings

def buildings(elements, to_plan, seed, to_latlon):
    """Building footprints around the event, in plan metres, skipping any the plan already draws.
    Microsoft's footprints come first; OpenStreetMap adds the ones they miss."""
    from shapely.geometry import Polygon
    # Where the event plan draws a structure, the plan is the authority: a mapped building under a tent
    # is the same place drawn twice, or something the event replaces. Rectangular tents count too.
    drawn = []
    for o in seed['objects']:
        if o['kind'] not in ('building', 'tent', 'stage'): continue
        c, s = math.cos(o['rotation'][1]), math.sin(o['rotation'][1])
        w, d = o['dimensions'][0], o['dimensions'][2]
        if o.get('points'):
            xs = [p[0] for p in o['points']]; zs = [p[1] for p in o['points']]
            sx = w / ((max(xs) - min(xs)) or w); sz = d / ((max(zs) - min(zs)) or d)
            local = [(px * sx, pz * sz) for px, pz in o['points']]
        else:
            local = [(-w / 2, -d / 2), (w / 2, -d / 2), (w / 2, d / 2), (-w / 2, d / 2)]
        pts = [(o['position'][0] + px * c + pz * s, o['position'][2] - px * s + pz * c) for px, pz in local]
        if len(pts) >= 3: drawn.append(Polygon(pts).buffer(.5))
    from shapely.ops import unary_union
    planned = unary_union([d for d in drawn if d.is_valid and not d.is_empty])
    out, kept = [], []
    def add(shape, height, kind, source):
        if shape.is_empty or shape.area < 12 or shape.geom_type != 'Polygon': return
        if shape.intersection(planned).area > .15 * shape.area: return
        if any(shape.intersection(d).area > .3 * shape.area for d in kept): return
        ring = list(shape.simplify(.15).exterior.coords)[:-1]
        if len(ring) < 3: return
        kept.append(shape)
        out.append({'points': [[round(x, 2), round(z, 2)] for x, z in ring], 'height': round(height, 1), 'kind': kind, 'source': source})
    # Heights are not mapped. Villas here are two storeys with a parapet; a long narrow roof is a
    # shelter such as the driving-range bays.
    def estimated_height(shape):
        rect = shape.minimum_rotated_rectangle.exterior.coords
        sides = sorted(math.dist(rect[i], rect[i + 1]) for i in range(2))
        return (4.2, 'canopy') if sides[0] < 7 and sides[1] > 22 else (7.5, 'building')
    for ring in microsoft_footprints(to_latlon):
        shape = Polygon([to_plan(lat, lon) for lat, lon in ring]).buffer(0)
        if not shape.is_empty: add(shape, *estimated_height(shape), 'microsoft')
    for element in elements:
        tags = element.get('tags', {})
        if 'building' not in tags or not element.get('geometry'): continue
        pts = [to_plan(p['lat'], p['lon']) for p in element['geometry']]
        if len(pts) < 4: continue
        shape = Polygon(pts).buffer(0)
        levels = tags.get('building:levels')
        height = float(tags['height']) if tags.get('height', '').replace('.', '', 1).isdigit() else (float(levels) * 3.4 + 1 if levels and levels.isdigit() else (3.6 if tags['building'] == 'roof' else 7.5))
        add(shape, height, 'canopy' if tags['building'] == 'roof' else 'building', 'osm')
    return out

def main():
    to_latlon = georeference()
    rgb = sample(to_latlon)
    classes = classify(rgb)
    elements = osm(to_latlon)
    to_plan = plan_coordinates(to_latlon)
    classes = paint_osm(classes, elements, to_plan)
    seed = json.load(open(SEED, encoding='utf8'))
    context = {
        'bounds': BOUNDS, 'cell': CELL, 'ground': '/event-studio/rbc-ground.png',
        'buildings': buildings(elements, to_plan, seed, to_latlon),
        'sources': [
            'Ground cover classified from Esri World Imagery (turf, sand, water, paving), half-metre cells',
            'Building footprints from Microsoft Global ML Building Footprints, ODbL',
            'Roads, lakes and further buildings (c) OpenStreetMap contributors, ODbL',
        ],
        'notes': 'Surroundings for orientation and views. Footprints are mapped; heights are not, so houses are drawn 7.5 m high and long open shelters 4.2 m.',
    }
    json.dump(context, open(CONTEXT, 'w', encoding='utf8'), separators=(',', ':'))
    colour = np.zeros(classes.shape + (3,), np.float32)
    for name, value in PALETTE.items():
        mask = ndimage.gaussian_filter((classes == name).astype(np.float32), .8)
        colour += mask[..., None] * np.array(value, np.float32)
    image = Image.fromarray(np.clip(colour, 0, 255).astype(np.uint8))
    image.save(OUT, optimize=True)
    shares = {name: round(float((classes == name).mean()) * 100, 1) for name in PALETTE}
    print(json.dumps({'output': os.path.relpath(OUT, ROOT), 'pixels': list(image.size), 'cell': CELL, 'percent': shares, 'buildings': len(context['buildings'])}))
    if '--preview' in sys.argv:
        Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)).save(os.path.join(ROOT, 'output', 'event-studio', 'ground-imagery-preview.jpg'), quality=80)

if __name__ == '__main__':
    main()
