import { describe, expect, it } from 'vitest';
import { generateLayout, locationPoint, shelfBlocks, type ItemLocation } from '../src/layout';
import { planRoute, walkingDistance } from '../src/routing';

const layout = generateLayout({
  aisles: ['Produce', 'Dairy', 'Bakery', 'Snacks', 'Beverages', 'Household'].map((label) => ({ label })),
});

function loc(aisle: number, row: number, shelf = 2): ItemLocation {
  return { aisle, row, shelf };
}

function bruteForce(locations: ItemLocation[]): number {
  const points = locations.map((l) => ({ ...locationPoint(layout, l)!, aisle: l.aisle }));
  let best = Infinity;
  const permute = (rest: typeof points, current: typeof points) => {
    if (rest.length === 0) {
      let total = 0;
      let prev: { x: number; y: number; aisle?: number } = layout.entrance;
      for (const p of current) {
        total += walkingDistance(layout, prev, p);
        prev = p;
      }
      total += walkingDistance(layout, prev, layout.exit);
      best = Math.min(best, total);
      return;
    }
    rest.forEach((p, i) => permute([...rest.slice(0, i), ...rest.slice(i + 1)], [...current, p]));
  };
  permute(points, []);
  return best;
}

describe('store layout', () => {
  it('numbers aisles left to right with rows counted from the front', () => {
    expect(layout.aisles.map((a) => a.number)).toEqual([1, 2, 3, 4, 5, 6]);
    const xs = layout.aisles.map((a) => a.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    const front = locationPoint(layout, loc(2, 1))!;
    const back = locationPoint(layout, loc(2, 6))!;
    expect(front.y).toBeGreaterThan(back.y);
    expect(front.y).toBeLessThan(layout.frontY);
    expect(back.y).toBeGreaterThan(layout.backY);
  });

  it('draws one shelf block between and beside every walkway', () => {
    expect(shelfBlocks(layout)).toHaveLength(layout.aisles.length + 1);
  });
});

describe('walking distance', () => {
  it('walks straight inside an aisle', () => {
    const a = { ...locationPoint(layout, loc(3, 1))!, aisle: 3 };
    const b = { ...locationPoint(layout, loc(3, 5))!, aisle: 3 };
    expect(walkingDistance(layout, a, b)).toBeCloseTo(Math.abs(a.y - b.y));
  });

  it('changes aisles through the nearer cross-aisle', () => {
    const nearBackA = { ...locationPoint(layout, loc(1, 6))!, aisle: 1 };
    const nearBackB = { ...locationPoint(layout, loc(4, 6))!, aisle: 4 };
    const viaBack =
      Math.abs(nearBackA.y - layout.backY) + Math.abs(nearBackA.x - nearBackB.x) + Math.abs(nearBackB.y - layout.backY);
    expect(walkingDistance(layout, nearBackA, nearBackB)).toBeCloseTo(viaBack);
    expect(walkingDistance(layout, nearBackA, nearBackB)).toBe(walkingDistance(layout, nearBackB, nearBackA));
  });
});

describe('route planning', () => {
  it('groups items at the same spot and reports unmapped items', () => {
    const plan = planRoute(layout, [
      { location: loc(2, 3), payload: 'milk' },
      { location: loc(2, 3, 4), payload: 'curd' },
      { location: null, payload: 'mystery' },
      { location: loc(5, 2), payload: 'cola' },
    ]);
    expect(plan.stops).toHaveLength(2);
    expect(plan.stops.flatMap((s) => s.items).sort()).toEqual(['cola', 'curd', 'milk']);
    expect(plan.unlocated).toEqual(['mystery']);
    expect(plan.path[0]).toEqual(layout.entrance);
    expect(plan.path[plan.path.length - 1]).toEqual(layout.exit);
    expect(plan.stops.map((s) => s.index)).toEqual([1, 2]);
  });

  it('handles an empty list by walking from the entrance to the exit', () => {
    const plan = planRoute(layout, []);
    expect(plan.stops).toHaveLength(0);
    expect(plan.totalDistance).toBeCloseTo(walkingDistance(layout, layout.entrance, layout.exit), 1);
  });

  it('is never longer than visiting items in list order', () => {
    const locations = [loc(1, 2), loc(6, 5), loc(2, 6), loc(5, 1), loc(3, 3), loc(4, 4)];
    const plan = planRoute(
      layout,
      locations.map((location, i) => ({ location, payload: i })),
    );
    let naive = 0;
    let prev: { x: number; y: number; aisle?: number } = layout.entrance;
    for (const l of locations) {
      const p = { ...locationPoint(layout, l)!, aisle: l.aisle };
      naive += walkingDistance(layout, prev, p);
      prev = p;
    }
    naive += walkingDistance(layout, prev, layout.exit);
    expect(plan.totalDistance).toBeLessThanOrEqual(naive + 0.1);
  });

  it('finds (near-)optimal walks on random shopping lists', () => {
    let seed = 42;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    for (let trial = 0; trial < 25; trial++) {
      const locations = Array.from({ length: 6 }, () => loc(1 + Math.floor(random() * 6), 1 + Math.floor(random() * 6)));
      const unique = [...new Map(locations.map((l) => [`${l.aisle}:${l.row}`, l])).values()];
      const plan = planRoute(
        layout,
        unique.map((location, i) => ({ location, payload: i })),
      );
      const optimum = bruteForce(unique);
      expect(plan.totalDistance).toBeLessThanOrEqual(optimum * 1.05 + 0.1);
    }
  });

  it('estimates shopping time from distance and number of stops', () => {
    const plan = planRoute(layout, [{ location: loc(3, 3), payload: 'x' }]);
    expect(plan.estimatedMinutes).toBeGreaterThanOrEqual(1);
  });
});
