import { findAisle, locationPoint, type ItemLocation, type Point, type StoreLayout } from './layout';

/**
 * In-store route planning.
 *
 * Walking distances follow the physical layout: inside one aisle you walk
 * straight along it; to change aisles you must leave through the front or
 * the back cross-aisle (whichever is shorter). The visiting order is solved
 * as a fixed-endpoint travelling-salesman problem (entrance -> stops -> exit)
 * using nearest-neighbour and S-shape seeds, each improved with 2-opt.
 */

export interface RoutablePoint extends Point {
  aisle?: number;
}

export interface RouteRequestItem<T> {
  location: ItemLocation | null | undefined;
  payload: T;
}

export interface RouteStop<T> {
  /** 1-based position in the walk */
  index: number;
  location: ItemLocation;
  point: Point;
  items: T[];
  /** metres walked from the previous stop (or the start) */
  distanceFromPrevious: number;
}

export interface RoutePlan<T> {
  stops: RouteStop<T>[];
  /** items that have no mapped location in this store */
  unlocated: T[];
  /** metres, including the walk to the exit */
  totalDistance: number;
  estimatedMinutes: number;
  /** polyline through corridors and aisles, start to end */
  path: Point[];
}

export interface RouteOptions {
  start?: Point;
  end?: Point;
  /** metres per minute while pushing a cart */
  walkingSpeed?: number;
  /** minutes spent picking at each stop */
  pickMinutes?: number;
}

const DEFAULT_WALKING_SPEED = 50;
const DEFAULT_PICK_MINUTES = 0.4;

export function walkingDistance(layout: StoreLayout, a: RoutablePoint, b: RoutablePoint): number {
  if (a.aisle !== undefined && a.aisle === b.aisle) return Math.abs(a.y - b.y);
  const dx = Math.abs(a.x - b.x);
  const viaFront = Math.abs(a.y - layout.frontY) + dx + Math.abs(b.y - layout.frontY);
  const viaBack = Math.abs(a.y - layout.backY) + dx + Math.abs(b.y - layout.backY);
  return Math.min(viaFront, viaBack);
}

/** Waypoints for drawing the walk from a to b. */
export function walkingPath(layout: StoreLayout, a: RoutablePoint, b: RoutablePoint): Point[] {
  if (a.aisle !== undefined && a.aisle === b.aisle) return [strip(a), strip(b)];
  const dx = Math.abs(a.x - b.x);
  const viaFront = Math.abs(a.y - layout.frontY) + dx + Math.abs(b.y - layout.frontY);
  const viaBack = Math.abs(a.y - layout.backY) + dx + Math.abs(b.y - layout.backY);
  const corridorY = viaFront <= viaBack ? layout.frontY : layout.backY;
  return [strip(a), { x: a.x, y: corridorY }, { x: b.x, y: corridorY }, strip(b)];
}

export function planRoute<T>(
  layout: StoreLayout,
  items: RouteRequestItem<T>[],
  options: RouteOptions = {},
): RoutePlan<T> {
  const start: RoutablePoint = options.start ?? layout.entrance;
  const end: RoutablePoint = options.end ?? layout.exit;
  const speed = options.walkingSpeed ?? DEFAULT_WALKING_SPEED;
  const pickMinutes = options.pickMinutes ?? DEFAULT_PICK_MINUTES;

  // Group items that are picked at the same spot into a single stop.
  const groups = new Map<string, { location: ItemLocation; point: RoutablePoint; items: T[] }>();
  const unlocated: T[] = [];
  for (const item of items) {
    const location = item.location;
    const point = location ? locationPoint(layout, location) : null;
    if (!location || !point) {
      unlocated.push(item.payload);
      continue;
    }
    const aisle = findAisle(layout, location.aisle)!;
    const row = Math.min(Math.max(1, Math.round(location.row)), aisle.rows);
    const key = `${location.aisle}:${row}`;
    const group = groups.get(key);
    if (group) {
      group.items.push(item.payload);
    } else {
      groups.set(key, {
        location: { ...location, row, aisleLabel: location.aisleLabel ?? aisle.label },
        point: { ...point, aisle: location.aisle },
        items: [item.payload],
      });
    }
  }

  const visits = [...groups.values()];
  const nodes: RoutablePoint[] = [start, ...visits.map((v) => v.point), end];
  const n = nodes.length;
  const dist: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => walkingDistance(layout, nodes[i]!, nodes[j]!)),
  );

  let order: number[];
  if (visits.length <= 1) {
    order = visits.map((_, i) => i + 1);
  } else {
    const candidates = [nearestNeighbourOrder(dist, visits.length), sShapeOrder(layout, nodes, visits.length, start)].map(
      (seed) => twoOpt(seed, dist),
    );
    order = candidates.reduce((best, candidate) =>
      tourLength(candidate, dist) < tourLength(best, dist) ? candidate : best,
    );
  }

  const stops: RouteStop<T>[] = [];
  const path: Point[] = [strip(start)];
  let previous = 0;
  let total = 0;
  order.forEach((nodeIndex, position) => {
    const visit = visits[nodeIndex - 1]!;
    const leg = dist[previous]![nodeIndex]!;
    total += leg;
    appendPath(path, walkingPath(layout, nodes[previous]!, nodes[nodeIndex]!));
    stops.push({
      index: position + 1,
      location: visit.location,
      point: strip(visit.point),
      items: visit.items,
      distanceFromPrevious: round(leg),
    });
    previous = nodeIndex;
  });
  total += dist[previous]![n - 1]!;
  appendPath(path, walkingPath(layout, nodes[previous]!, nodes[n - 1]!));

  return {
    stops,
    unlocated,
    totalDistance: round(total),
    estimatedMinutes: Math.max(1, Math.round(total / speed + stops.length * pickMinutes)),
    path,
  };
}

/** Visiting order (indices 1..count into the node list) by repeatedly walking to the closest stop. */
function nearestNeighbourOrder(dist: number[][], count: number): number[] {
  const remaining = new Set(Array.from({ length: count }, (_, i) => i + 1));
  const order: number[] = [];
  let current = 0;
  while (remaining.size > 0) {
    let best = -1;
    let bestDistance = Infinity;
    for (const candidate of remaining) {
      const d = dist[current]![candidate]!;
      if (d < bestDistance) {
        bestDistance = d;
        best = candidate;
      }
    }
    order.push(best);
    remaining.delete(best);
    current = best;
  }
  return order;
}

/** Classic serpentine walk: aisle by aisle away from the start, alternating direction. */
function sShapeOrder(layout: StoreLayout, nodes: RoutablePoint[], count: number, start: Point): number[] {
  const indices = Array.from({ length: count }, (_, i) => i + 1);
  const leftToRight = Math.abs(start.x - minX(layout)) <= Math.abs(start.x - maxX(layout));
  const byAisle = new Map<number, number[]>();
  for (const index of indices) {
    const aisle = nodes[index]!.aisle ?? -1;
    byAisle.set(aisle, [...(byAisle.get(aisle) ?? []), index]);
  }
  const aisleOrder = [...byAisle.keys()].sort((a, b) => {
    const ax = findAisle(layout, a)?.x ?? 0;
    const bx = findAisle(layout, b)?.x ?? 0;
    return leftToRight ? ax - bx : bx - ax;
  });
  const order: number[] = [];
  aisleOrder.forEach((aisle, position) => {
    const goingBack = position % 2 === 0; // first aisle: walk from the front towards the back
    const stops = byAisle.get(aisle)!.sort((a, b) =>
      goingBack ? nodes[b]!.y - nodes[a]!.y : nodes[a]!.y - nodes[b]!.y,
    );
    order.push(...stops);
  });
  return order;
}

/** 2-opt improvement with the start (node 0) and end (last node) fixed. */
function twoOpt(initial: number[], dist: number[][]): number[] {
  const end = dist.length - 1;
  const tour = [0, ...initial, end];
  let improved = true;
  let passes = 0;
  while (improved && passes < 100) {
    improved = false;
    passes++;
    for (let i = 1; i < tour.length - 2; i++) {
      for (let k = i + 1; k < tour.length - 1; k++) {
        const a = tour[i - 1]!;
        const b = tour[i]!;
        const c = tour[k]!;
        const d = tour[k + 1]!;
        const delta = dist[a]![c]! + dist[b]![d]! - dist[a]![b]! - dist[c]![d]!;
        if (delta < -1e-9) {
          reverse(tour, i, k);
          improved = true;
        }
      }
    }
  }
  return tour.slice(1, -1);
}

function tourLength(order: number[], dist: number[][]): number {
  const end = dist.length - 1;
  let total = 0;
  let previous = 0;
  for (const node of order) {
    total += dist[previous]![node]!;
    previous = node;
  }
  return total + dist[previous]![end]!;
}

function reverse(values: number[], from: number, to: number): void {
  while (from < to) {
    const tmp = values[from]!;
    values[from] = values[to]!;
    values[to] = tmp;
    from++;
    to--;
  }
}

function appendPath(path: Point[], segment: Point[]): void {
  for (const point of segment) {
    const last = path[path.length - 1];
    if (!last || last.x !== point.x || last.y !== point.y) path.push(point);
  }
}

function minX(layout: StoreLayout): number {
  return Math.min(...layout.aisles.map((a) => a.x));
}

function maxX(layout: StoreLayout): number {
  return Math.max(...layout.aisles.map((a) => a.x));
}

function strip(point: Point): Point {
  return { x: point.x, y: point.y };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
