// Conservative three-way scene merge. Transform arrays are indivisible: conflicting
// moves must be reviewed instead of silently combining coordinates from two edits.
export function canonicalLayoutValue(value) {
  if (Array.isArray(value)) return value.map(canonicalLayoutValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalLayoutValue(value[key])]));
  return value;
}
export const sameLayoutValue = (a, b) => JSON.stringify(canonicalLayoutValue(a)) === JSON.stringify(canonicalLayoutValue(b));
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const copy = value => value === undefined ? undefined : structuredClone(value);
const collections = new Set(['objects', 'zones', 'views', 'tour']);

export function mergeEventLayoutCandidate(baseline, candidate, current) {
  const conflicts = [];
  function merge(base, next, live, parts = []) {
    if (sameLayoutValue(base, next)) return copy(live);
    if (sameLayoutValue(base, live) || sameLayoutValue(next, live)) return copy(next);
    if (parts.length === 1 && collections.has(parts[0]) && [base, next, live].every(Array.isArray)) {
      const maps = [base, next, live].map(items => new Map(items.map(item => [item.id, item])));
      const ids = [...new Set([...live.map(item => item.id), ...next.map(item => item.id)])];
      return ids.map(id => merge(maps[0].get(id), maps[1].get(id), maps[2].get(id), [...parts, id])).filter(value => value !== undefined);
    }
    if ([base, next, live].every(plain)) {
      const keys = [...new Set([...Object.keys(base), ...Object.keys(next), ...Object.keys(live)])];
      return Object.fromEntries(keys.map(key => [key, merge(base[key], next[key], live[key], [...parts, key])]).filter(([, value]) => value !== undefined));
    }
    conflicts.push(`/${parts.map(part => String(part).replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}`);
    return copy(live);
  }
  return { scene: merge(baseline, candidate, current), conflicts };
}
