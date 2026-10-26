/**
 * Store floor-plan model.
 *
 * Coordinates are in metres, with the origin in the top-left corner of the
 * floor plan (SVG convention: y grows downwards). The entrance side of the
 * store is at the bottom. Aisles are vertical walkways that connect a
 * "front" cross-aisle (near the entrance) with a "back" cross-aisle.
 *
 * Shoppers are told item locations as "Aisle 4 · Row 2 · Shelf 3":
 *  - aisle: the walkway number shown on the hanging sign
 *  - row:   the bay/section along the aisle, counted from the front (1-based)
 *  - shelf: the shelf level inside that bay, counted from the floor (1-based)
 */

export interface Point {
  x: number;
  y: number;
}

export interface AisleDef {
  number: number;
  label: string;
  /** x of the walkway centre line */
  x: number;
  /** y where the walkway meets the front cross-aisle */
  yStart: number;
  /** y where the walkway meets the back cross-aisle */
  yEnd: number;
  rows: number;
  shelves: number;
}

export type LayoutZoneKind = 'ENTRANCE' | 'EXIT' | 'PICKUP' | 'FRESH' | 'SERVICE' | 'OTHER';

export interface LayoutZone {
  id: string;
  label: string;
  kind: LayoutZoneKind;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StoreLayout {
  width: number;
  height: number;
  /** y of the front cross-aisle centre line */
  frontY: number;
  /** y of the back cross-aisle centre line */
  backY: number;
  entrance: Point;
  exit: Point;
  aisles: AisleDef[];
  zones: LayoutZone[];
}

export interface ItemLocation {
  aisle: number;
  row: number;
  shelf: number;
  aisleLabel?: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GenerateLayoutOptions {
  aisles: { label: string }[];
  rows?: number;
  shelves?: number;
  /** distance between neighbouring walkway centre lines */
  spacing?: number;
  /** length of each aisle walkway */
  aisleLength?: number;
}

const WALKWAY_WIDTH = 1.6;

/**
 * Builds a conventional supermarket floor plan: parallel aisles with a front
 * and a back cross-aisle, the entrance bottom-right and the exit gates
 * bottom-left.
 */
export function generateLayout(options: GenerateLayoutOptions): StoreLayout {
  const rows = options.rows ?? 6;
  const shelves = options.shelves ?? 5;
  const spacing = options.spacing ?? 4;
  const aisleLength = options.aisleLength ?? 18;
  const sideMargin = 4;
  const backCorridor = 3;
  const frontCorridor = 7;
  const count = Math.max(1, options.aisles.length);

  const width = sideMargin * 2 + spacing * (count - 1) + spacing;
  const backY = backCorridor / 2 + 0.5;
  const yEnd = backY + 1.5;
  const yStart = yEnd + aisleLength;
  const frontY = yStart + 1.5;
  const height = yStart + frontCorridor;

  const firstX = sideMargin + spacing / 2;
  const aisles: AisleDef[] = options.aisles.map((aisle, index) => ({
    number: index + 1,
    label: aisle.label,
    x: round(firstX + index * spacing),
    yStart: round(yStart),
    yEnd: round(yEnd),
    rows,
    shelves,
  }));

  const entrance = { x: round(width - 3), y: round(height - 1.2) };
  const exit = { x: 3, y: round(height - 1.2) };

  const zones: LayoutZone[] = [
    { id: 'entrance', label: 'Entrance', kind: 'ENTRANCE', x: round(width - 6), y: round(height - 2.4), width: 5, height: 2.4 },
    { id: 'exit', label: 'Exit gates', kind: 'EXIT', x: 1, y: round(height - 2.4), width: 5, height: 2.4 },
    {
      id: 'pickup',
      label: 'Pickup counter',
      kind: 'PICKUP',
      x: round(width / 2 - 3),
      y: round(height - 2.4),
      width: 6,
      height: 2.4,
    },
  ];

  return { width: round(width), height: round(height), frontY: round(frontY), backY: round(backY), entrance, exit, aisles, zones };
}

export function findAisle(layout: StoreLayout, aisleNumber: number): AisleDef | undefined {
  return layout.aisles.find((aisle) => aisle.number === aisleNumber);
}

/** Point on the walkway where an item at (aisle, row) is picked. */
export function locationPoint(layout: StoreLayout, location: Pick<ItemLocation, 'aisle' | 'row'>): Point | null {
  const aisle = findAisle(layout, location.aisle);
  if (!aisle) return null;
  const row = Math.min(Math.max(1, Math.round(location.row)), aisle.rows);
  const step = (aisle.yEnd - aisle.yStart) / aisle.rows;
  return { x: aisle.x, y: round(aisle.yStart + (row - 0.5) * step) };
}

/** Shelf units (gondolas) between and beside the walkways, for drawing. */
export function shelfBlocks(layout: StoreLayout): Rect[] {
  const aisles = [...layout.aisles].sort((a, b) => a.x - b.x);
  if (aisles.length === 0) return [];
  const top = Math.min(...aisles.map((a) => Math.min(a.yStart, a.yEnd)));
  const bottom = Math.max(...aisles.map((a) => Math.max(a.yStart, a.yEnd)));
  const spacing = aisles.length > 1 ? aisles[1]!.x - aisles[0]!.x : 4;
  const blockWidth = Math.max(0.6, spacing - WALKWAY_WIDTH);
  const centres: number[] = [aisles[0]!.x - spacing / 2];
  for (let i = 0; i < aisles.length - 1; i++) centres.push((aisles[i]!.x + aisles[i + 1]!.x) / 2);
  centres.push(aisles[aisles.length - 1]!.x + spacing / 2);
  return centres.map((cx) => ({
    x: round(cx - blockWidth / 2),
    y: round(top),
    width: round(blockWidth),
    height: round(bottom - top),
  }));
}

export function describeLocation(location: ItemLocation | null | undefined, options?: { withLabel?: boolean }): string {
  if (!location) return 'Location not mapped';
  const base = `Aisle ${location.aisle} · Row ${location.row} · Shelf ${location.shelf}`;
  return options?.withLabel && location.aisleLabel ? `${base} (${location.aisleLabel})` : base;
}

export function shortLocation(location: ItemLocation | null | undefined): string {
  if (!location) return '—';
  return `A${location.aisle} · R${location.row}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
