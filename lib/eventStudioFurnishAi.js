// Furnishing options for one tent. Claude reads the brief and chooses the arrangements and the
// catalogue pieces; lib/eventStudioFurnish.js sets them out on the floor and checks every piece.
// Without a key, or when the model does not answer in time, the built-in planner offers the options.
// Either way the tent keeps its size, only Pico Stock catalogue items are used, and stock is respected.
import Anthropic from '@anthropic-ai/sdk';
import {
  MOTIFS, describe, furnitureRole, tableShape, tableCapacity, seatsOf, layoutPlan, auditLayout, plannerPlans,
  pickProduct, polygonArea, entranceEdge,
} from './eventStudioFurnish.js';
import { tentFootprint } from './eventStudioLayout.js';
import { EventLayoutError } from './eventLayoutSchema.js';

const MODEL = () => process.env.EVENT_STUDIO_AI_MODEL || 'claude-opus-5-5';
const TIMEOUT_MS = 45000;

// A slot may take a piece of its own role or a close substitute.
const ROLE_FITS = {
  sofa: ['sofa', 'ottoman'], armchair: ['armchair', 'pouffe'], chair: ['chair', 'armchair', 'office-chair'],
  'coffee-table': ['coffee-table', 'side-table', 'ottoman'], table: ['table'], 'high-table': ['high-table'], 'high-stool': ['high-stool'],
  decor: ['decor', 'lamp'], lamp: ['lamp'], 'side-table': ['side-table'], console: ['console', 'table'], 'office-chair': ['office-chair', 'chair'],
  bar: ['bar'], pouffe: ['pouffe', 'ottoman'],
};

const finite = value => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 100000;

/** Only what the layout needs crosses the wire, and all of it is checked. */
export function validateFurnishRequest(body) {
  const tent = body?.tent;
  if (!tent || tent.kind !== 'tent' || !Array.isArray(tent.dimensions) || tent.dimensions.length !== 3 || !tent.dimensions.every(v => finite(v) && v > 0))
    throw new EventLayoutError('Choose a tent to furnish');
  if (tent.points !== undefined && !(Array.isArray(tent.points) && tent.points.length >= 3 && tent.points.length <= 200 && tent.points.every(p => Array.isArray(p) && p.length === 2 && p.every(finite))))
    throw new EventLayoutError('The tent outline is not valid');
  const kept = (Array.isArray(body.kept) ? body.kept : []).slice(0, 600)
    .filter(k => k && ['x', 'z', 'width', 'depth', 'angle'].every(key => finite(k[key])))
    .map(({ x, z, width, depth, angle }) => ({ x, z, width, depth, angle }));
  const usage = {};
  for (const [id, n] of Object.entries(body.usage && typeof body.usage === 'object' ? body.usage : {}).slice(0, 2000))
    if (id.length <= 120 && Number.isInteger(n) && n >= 0 && n < 100000) usage[id] = n;
  return {
    tent: {
      id: String(tent.id || 'tent').slice(0, 120), name: String(tent.name || 'Tent').slice(0, 120), kind: 'tent',
      position: [0, 0, 0], rotation: [0, 0, 0], dimensions: [...tent.dimensions],
      roofType: typeof tent.roofType === 'string' ? tent.roofType.slice(0, 24) : undefined,
      ...(tent.points ? { points: tent.points.map(p => [...p]) } : {}),
    },
    brief: String(body.brief ?? '').replace(/\s+/g, ' ').trim().slice(0, 600),
    kept, usage,
  };
}

const stockLeft = (asset, usage) => { const stock = Number(asset.stock); return Number.isFinite(stock) ? Math.max(0, stock - (usage[String(asset.productId)] || 0)) : null; };

/** What fits, measured, so the model asks for counts the floor can take. */
function capacities({ tent, assets, kept, usage }) {
  const pick = role => pickProduct(role, assets, { usage })?.productId;
  const trial = (motif, products, extra = {}) => {
    const result = layoutPlan({ tent, plan: { zones: [{ motif, count: 60, products, ...extra }] }, assets, kept, usage: {} });
    return result.arrangements[0]?.placed || 0;
  };
  const roundTable = pickProduct('table', assets, { usage, filter: a => tableShape(a) === 'round' }), longTable = pickProduct('table', assets, { usage, filter: a => tableShape(a) === 'oblong' });
  const area = polygonArea(tentFootprint(tent));
  // How many fit on their own, and so roughly how much of this floor each one takes, aisles included.
  const budget = (count, what) => count ? `${count} ${what} fit on their own, about ${Math.round(area / count)} m² each on this floor` : `no ${what} fit`;
  return {
    'lounge sets (sofa, coffee table, two armchairs)': budget(trial('lounge', { sofa: pick('sofa'), 'coffee-table': pick('coffee-table'), armchair: pick('armchair') }), 'lounge sets'),
    'dining rounds': roundTable ? `${budget(trial('dining-round', { table: roundTable.productId, chair: pick('chair') }), 'rounds')} (${describe(roundTable)}, ${tableCapacity(roundTable)} seats each)` : 'no round tables in stock',
    'long dining tables': longTable ? `${budget(trial('dining-long', { table: longTable.productId, chair: pick('chair') }), 'tables')} (${describe(longTable)}, ${tableCapacity(longTable)} seats each)` : 'no long tables in stock',
    'cocktail tables with three stools': budget(trial('cocktail', { 'high-table': pick('high-table'), 'high-stool': pick('high-stool') }, { seats: 3 }), 'tables'),
    'theatre rows': `${trial('theatre', { chair: pick('chair') }, { seats: 400 })} chairs at most`,
    'majlis along the walls': `${trial('majlis', { sofa: pick('sofa') }, { seats: 400 })} wall seats at most, leaving the middle free`,
  };
}

function catalogueLines(assets, usage) {
  return assets.filter(a => !['cushion', 'accessory', 'other', 'umbrella-table', 'lounge-set'].includes(furnitureRole(a))).map(a => {
    const [w, h, d] = a.dimensions.map(v => +Number(v).toFixed(2)), role = furnitureRole(a), left = stockLeft(a, usage);
    const table = ['table', 'high-table'].includes(role) ? `, ${tableShape(a)}, seats ${tableCapacity(a)}` : '';
    return `${a.productId} | ${describe(a)} | ${role}${table} | ${w} × ${d} m, ${h} m high | ${seatsOf(a) ? `seats ${seatsOf(a)} | ` : ''}${left === null ? 'stock not listed' : `${left} in stock`}`;
  }).join('\n');
}

const SYSTEM = `You plan furniture for tents at the Royal Bahrain Concours 2026, an outdoor classic-car event at the Royal Golf Club, Bahrain, for Pico International, who rent the furniture.
You are given one tent, a brief, the approved Pico Stock catalogue with what is left in stock, and measured capacities for this floor.
Propose three distinct layouts that each answer the brief. A layout engine sets out your arrangements on the floor, keeps aisles and the entrance clear, and drops any arrangement that will not fit, so ask for realistic counts and stay within the measured capacities and the stock left.
Rules:
- Use only product ids from the catalogue, in a slot whose role matches the item's role.
- Never resize the tent. Do not ask for more seats than the brief needs; a little spare room is better than a crowded floor.
- Keep pieces within one layout consistent in style and colour (for example gold and ivory, or black and white).
- Reception desks go by the entrance; a bar goes against the back wall. In a small exhibitor booth keep the front open for visitors.
- In the Gulf a majlis seats guests along the walls facing in, with low tables in front; offer it when it suits the brief.
- Budget the floor: each arrangement needs the floor space listed, aisles included, and arrangements in one layout share the usable floor. Measured capacities are for one kind of arrangement on its own.
- Titles are at most 40 characters. Summaries are one or two plain sentences on the feel and how guests use the space, without marketing language and without numbers: the studio shows the seats and pieces it measures from the finished layout.`;

const TOOL = {
  name: 'propose_layouts',
  description: 'Return three furnishing layouts for the tent.',
  input_schema: {
    type: 'object',
    properties: {
      options: {
        type: 'array', minItems: 1, maxItems: 3,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'At most 40 characters.' },
            summary: { type: 'string', description: 'One or two plain sentences.' },
            zones: {
              type: 'array', minItems: 1, maxItems: 6,
              items: {
                type: 'object',
                properties: {
                  motif: { type: 'string', enum: Object.keys(MOTIFS) },
                  count: { type: 'integer', minimum: 1, maximum: 60, description: 'How many of this arrangement. For majlis and theatre use seats instead.' },
                  seats: { type: 'integer', minimum: 0, maximum: 400, description: 'Seats per table for dining and meeting arrangements, stools per cocktail table, or total seats for majlis and theatre.' },
                  products: { type: 'object', description: 'Role to product id, using the roles listed for the motif.', additionalProperties: { type: 'string' } },
                },
                required: ['motif', 'products'],
              },
            },
          },
          required: ['title', 'summary', 'zones'],
        },
      },
    },
    required: ['options'],
  },
};

/** Keep only what the catalogue and the motifs allow; mend a slot with the best stocked match. */
export function sanitisePlans(raw, assets, usage) {
  const byId = new Map(assets.map(a => [String(a.productId), a]));
  const plans = [];
  for (const option of Array.isArray(raw) ? raw.slice(0, 3) : []) {
    const zones = [];
    for (const zone of Array.isArray(option?.zones) ? option.zones.slice(0, 6) : []) {
      const motif = MOTIFS[zone?.motif];
      if (!motif) continue;
      const products = {};
      for (const role of motif.roles) {
        const id = zone.products?.[role], asset = id === undefined ? null : byId.get(String(id));
        if (asset && (ROLE_FITS[role] || [role]).includes(furnitureRole(asset))) products[role] = String(asset.productId);
        else if (id !== undefined) { const mend = pickProduct(role, assets, { usage }); if (mend) products[role] = String(mend.productId); }
      }
      if (!Object.keys(products).length) continue;
      zones.push({
        motif: zone.motif, products,
        ...(Number.isInteger(zone.count) ? { count: Math.max(1, Math.min(60, zone.count)) } : {}),
        ...(Number.isInteger(zone.seats) ? { seats: Math.max(0, Math.min(400, zone.seats)) } : {}),
      });
    }
    if (zones.length) plans.push({ title: String(option.title || 'Layout').slice(0, 60), summary: String(option.summary || '').slice(0, 300), zones });
  }
  return plans;
}

async function claudePlans({ tent, brief, assets, kept, usage }) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: TIMEOUT_MS, maxRetries: 1 });
  const footprint = tentFootprint(tent), xs = footprint.map(p => p[0]), zs = footprint.map(p => p[1]);
  const shape = footprint.length === 6 ? 'six-sided pavilion' : footprint.length === 4 ? 'rectangle' : `${footprint.length}-sided outline`;
  const facts = {
    tent: tent.name, shape, width: +(Math.max(...xs) - Math.min(...xs)).toFixed(2), depth: +(Math.max(...zs) - Math.min(...zs)).toFixed(2),
    floorArea: +polygonArea(footprint).toFixed(1), entrance: `the front wall, ${entranceEdge(footprint).length.toFixed(1)} m wide`,
    keptFurniture: kept.length ? `${kept.length} pieces stay where they are` : 'none: the tent is furnished from empty',
    measuredCapacity: capacities({ tent, assets, kept, usage }),
  };
  const motifs = Object.entries(MOTIFS).map(([id, m]) => `${id}: ${m.label}; roles ${m.roles.join(', ')}`).join('\n');
  const message = await client.messages.create({
    model: MODEL(), max_tokens: 4000, system: `${SYSTEM}\nAnswer by calling the propose_layouts tool once.`, tools: [TOOL], tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: `Brief: ${brief || '(none given: suggest the three most useful layouts for this tent)'}\n\nTent: ${JSON.stringify(facts)}\n\nArrangements (motif: label; roles it is built from, first roles essential):\n${motifs}\n\nCatalogue (product id | item | role | size | seats | stock left):\n${catalogueLines(assets, usage)}` }],
  });
  const call = message.content?.find(block => block.type === 'tool_use' && block.name === TOOL.name);
  if (process.env.EVENT_STUDIO_AI_DEBUG) console.error('Furnishing AI reply:', JSON.stringify(message.content).slice(0, 4000));
  if (call) return sanitisePlans(call.input?.options, assets, usage);
  // A model that answers in prose instead still usually includes the JSON.
  const text = message.content?.filter(block => block.type === 'text').map(block => block.text).join('\n') || '';
  const json = text.match(/\{[\s\S]*\}/);
  try { return sanitisePlans(JSON.parse(json?.[0] || '{}').options, assets, usage); } catch { return []; }
}

/** Small or awkward floors still get something useful. */
function fallbackPlans({ tent, assets, usage }) {
  const pick = (role, filter) => pickProduct(role, assets, { usage, filter })?.productId;
  return [
    { title: 'Counter and stool', summary: 'A desk to greet visitors, with a chair behind it.', zones: [{ motif: 'reception', products: { console: pick('console'), 'office-chair': pick('office-chair') } }] },
    { title: 'High table', summary: 'A high table with two stools, leaving the floor open.', zones: [{ motif: 'cocktail', count: 1, seats: 2, products: { 'high-table': pick('high-table'), 'high-stool': pick('high-stool') } }] },
    { title: 'Bench seating', summary: 'A bench or short sofa along the back wall.', zones: [{ motif: 'majlis', seats: 3, products: { sofa: pick('sofa', a => a.dimensions[0] <= Math.max(1.5, tent.dimensions[0] - 1)) } }] },
  ];
}

const signature = result => result.placements.map(p => `${p.productId}@${Math.round(p.x * 2)},${Math.round(p.z * 2)}`).sort().join('|');

export async function furnishTent({ tent, brief = '', assets, kept = [], usage = {}, useModel = true }) {
  let claude = [], notice = null;
  if (useModel && process.env.ANTHROPIC_API_KEY) {
    // One retry when a reply has nothing usable in it, as long as there is time left in the request.
    const started = Date.now();
    for (let attempt = 0; attempt < 2 && !claude.length && !notice; attempt += 1) {
      if (attempt && Date.now() - started > 20000) break;
      try { claude = (await claudePlans({ tent, brief, assets, kept, usage })).map(plan => ({ ...plan, source: 'claude' })); }
      catch (error) {
        console.error('Furnishing AI:', error?.status || '', error?.message || error);
        notice = 'The AI planner could not be reached just now, so these layouts come from the built-in planner.';
      }
    }
    if (!claude.length && !notice) notice = 'The AI planner returned nothing usable, so these layouts come from the built-in planner.';
  }
  const candidates = [...claude, ...plannerPlans({ brief, tent, assets, usage }).map(plan => ({ ...plan, source: 'planner' })), ...fallbackPlans({ tent, assets, usage }).map(plan => ({ ...plan, source: 'planner' }))];
  // Lay every candidate out once. A layout in which an arrangement found no room at all is only
  // offered when there are not three complete ones, so a "lounge" never arrives as a lone desk.
  const laid = candidates.map(plan => ({ plan, result: layoutPlan({ tent, plan, assets, kept, usage }) }))
    .filter(({ result }) => result.placements.length && !auditLayout({ tent, placements: result.placements, assets, kept }).length);
  const complete = ({ result }) => result.arrangements.every(a => a.placed > 0);
  const options = [], seen = new Set();
  for (const { plan, result } of [...laid.filter(complete), ...laid.filter(entry => !complete(entry))]) {
    if (options.length >= 3) break;
    const key = signature(result);
    if (seen.has(key)) continue;
    seen.add(key);
    options.push({ id: `option-${options.length + 1}`, title: plan.title, summary: plan.summary, source: plan.source, zones: plan.zones, ...result });
  }
  return { options, source: options.some(o => o.source === 'claude') ? 'claude' : 'planner', model: claude.length ? MODEL() : null, notice };
}
