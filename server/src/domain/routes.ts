export type Zone = 'UTTARA' | 'AIRPORT' | 'BANANI' | 'GULSHAN_1' | 'MOHAKHALI' | 'FARMGATE';

export const ALL_ZONES: Zone[] = ['UTTARA', 'AIRPORT', 'BANANI', 'GULSHAN_1', 'MOHAKHALI', 'FARMGATE'];

export const ROUTE_EDGES: Array<{ a: Zone; b: Zone; km: number }> = [
  { a: 'UTTARA',    b: 'AIRPORT',   km: 6 },
  { a: 'AIRPORT',   b: 'BANANI',    km: 5 },
  { a: 'BANANI',    b: 'GULSHAN_1', km: 2 },
  { a: 'BANANI',    b: 'MOHAKHALI', km: 4 },
  { a: 'GULSHAN_1', b: 'MOHAKHALI', km: 3 },
  { a: 'MOHAKHALI', b: 'FARMGATE',  km: 3 },
];

const adjacencyList: Map<Zone, Array<{ to: Zone; km: number }>> = new Map();

for (const zone of ALL_ZONES) {
  adjacencyList.set(zone, []);
}

for (const edge of ROUTE_EDGES) {
  adjacencyList.get(edge.a)?.push({ to: edge.b, km: edge.km });
  adjacencyList.get(edge.b)?.push({ to: edge.a, km: edge.km });
}

export function shortestDistanceKm(from: Zone, to: Zone): number {
  if (from === to) {
    return 0;
  }

  const distances: Map<Zone, number> = new Map();
  const visited: Set<Zone> = new Set();

  for (const zone of ALL_ZONES) {
    distances.set(zone, Infinity);
  }
  distances.set(from, 0);

  while (visited.size < ALL_ZONES.length) {
    let closestZone: Zone | null = null;
    let minDistance = Infinity;

    for (const [zone, dist] of distances.entries()) {
      if (!visited.has(zone) && dist < minDistance) {
        minDistance = dist;
        closestZone = zone;
      }
    }

    if (closestZone === null || minDistance === Infinity) {
      break;
    }

    if (closestZone === to) {
      return minDistance;
    }

    visited.add(closestZone);

    const neighbors = adjacencyList.get(closestZone) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor.to)) {
        const newDist = minDistance + neighbor.km;
        if (newDist < (distances.get(neighbor.to) ?? Infinity)) {
          distances.set(neighbor.to, newDist);
        }
      }
    }
  }

  const result = distances.get(to);
  if (result === undefined || result === Infinity) {
    throw new Error('UNREACHABLE_ZONE');
  }

  return result;
}
