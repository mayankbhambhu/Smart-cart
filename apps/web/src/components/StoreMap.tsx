import { locationPoint, shelfBlocks, type ItemLocation, type Point, type RoutePlan, type StoreLayout } from '@smartcart/shared';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

export interface StoreMapProps<T> {
  layout: StoreLayout;
  plan?: RoutePlan<T> | null;
  /** 0-based index of the stop the shopper is walking to. */
  activeStop?: number;
  /** Stops already picked (rendered grey with a tick). */
  doneStops?: Set<number>;
  /** Pin for a searched item ("where is the peanut butter?"). */
  highlight?: ItemLocation | null;
  onStopClick?: (index: number) => void;
  className?: string;
}

const zoneColors: Record<string, { fill: string; stroke: string; text: string }> = {
  ENTRANCE: { fill: '#dcfce7', stroke: '#16a34a', text: '#166534' },
  EXIT: { fill: '#e0e7ff', stroke: '#4f46e5', text: '#3730a3' },
  PICKUP: { fill: '#fef3c7', stroke: '#d97706', text: '#92400e' },
};

/**
 * Floor plan of the store with the optimised walking route. Coordinates are
 * metres (the SVG viewBox is the floor plan), so it scales to any size.
 */
export function StoreMap<T>({ layout, plan, activeStop = 0, doneStops, highlight, onStopClick, className }: StoreMapProps<T>) {
  const blocks = useMemo(() => shelfBlocks(layout), [layout]);
  const pathD = useMemo(() => (plan ? toPath(plan.path) : null), [plan]);
  const highlightPoint = highlight ? locationPoint(layout, highlight) : null;
  const entranceZone = layout.zones.find((z) => z.kind === 'ENTRANCE');
  const startY = entranceZone ? entranceZone.y : layout.entrance.y;
  const pad = 1;

  return (
    <svg
      viewBox={`${-pad} ${-pad} ${layout.width + pad * 2} ${layout.height + pad * 2}`}
      className={cn('h-auto w-full select-none', className)}
      role="img"
      aria-label="Store map with your shopping route"
    >
      <defs>
        <filter id="map-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="0.15" stdDeviation="0.2" floodOpacity="0.25" />
        </filter>
      </defs>
      <rect x={0} y={0} width={layout.width} height={layout.height} rx={1.2} fill="#f8fafc" stroke="#cbd5e1" strokeWidth={0.15} />

      {blocks.map((block, i) => (
        <rect
          key={i}
          x={block.x}
          y={block.y}
          width={block.width}
          height={block.height}
          rx={0.35}
          fill="#e2e8f0"
          stroke="#cbd5e1"
          strokeWidth={0.08}
        />
      ))}

      {layout.aisles.map((aisle) => (
        <g key={aisle.number}>
          {Array.from({ length: aisle.rows }, (_, r) => {
            const y = aisle.yStart + (r + 0.5) * ((aisle.yEnd - aisle.yStart) / aisle.rows);
            return <line key={r} x1={aisle.x - 0.35} x2={aisle.x + 0.35} y1={y} y2={y} stroke="#cbd5e1" strokeWidth={0.08} />;
          })}
          <circle cx={aisle.x} cy={aisle.yEnd - 0.9} r={0.75} fill="#0f172a" />
          <text x={aisle.x} y={aisle.yEnd - 0.62} textAnchor="middle" fontSize={0.8} fontWeight={700} fill="#fff">
            {aisle.number}
          </text>
          <text
            x={aisle.x}
            y={(aisle.yStart + aisle.yEnd) / 2}
            textAnchor="middle"
            fontSize={0.62}
            fill="#94a3b8"
            transform={`rotate(-90 ${aisle.x} ${(aisle.yStart + aisle.yEnd) / 2})`}
          >
            {aisle.label}
          </text>
        </g>
      ))}

      {layout.zones.map((zone) => {
        const colors = zoneColors[zone.kind] ?? { fill: '#f1f5f9', stroke: '#94a3b8', text: '#334155' };
        return (
          <g key={zone.id}>
            <rect
              x={zone.x}
              y={zone.y}
              width={zone.width}
              height={zone.height}
              rx={0.4}
              fill={colors.fill}
              stroke={colors.stroke}
              strokeWidth={0.1}
            />
            <text
              x={zone.x + zone.width / 2}
              y={zone.y + zone.height / 2 + 0.3}
              textAnchor="middle"
              fontSize={0.8}
              fontWeight={700}
              fill={colors.text}
            >
              {zone.label}
            </text>
          </g>
        );
      })}

      {pathD && (
        <>
          <path d={pathD} fill="none" stroke="#a7f3d0" strokeWidth={0.7} strokeLinecap="round" strokeLinejoin="round" />
          <path
            d={pathD}
            fill="none"
            stroke="#0a8f45"
            strokeWidth={0.32}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="route-line"
          />
        </>
      )}

      {plan?.stops.map((stop, i) => {
        const done = doneStops?.has(i);
        const active = !done && i === activeStop;
        return (
          <g
            key={`${stop.location.aisle}-${stop.location.row}`}
            onClick={() => onStopClick?.(i)}
            className={onStopClick ? 'cursor-pointer' : undefined}
          >
            {active && (
              <circle cx={stop.point.x} cy={stop.point.y} r={1.5} fill="#0a8f45" opacity={0.25}>
                <animate attributeName="r" values="0.9;1.8;0.9" dur="1.6s" repeatCount="indefinite" />
              </circle>
            )}
            <circle
              cx={stop.point.x}
              cy={stop.point.y}
              r={active ? 0.95 : 0.75}
              fill={done ? '#94a3b8' : active ? '#0a8f45' : '#fff'}
              stroke={done ? '#64748b' : '#0a8f45'}
              strokeWidth={0.18}
              filter="url(#map-shadow)"
            />
            <text
              x={stop.point.x}
              y={stop.point.y + 0.3}
              textAnchor="middle"
              fontSize={active ? 0.85 : 0.75}
              fontWeight={800}
              fill={done || active ? '#fff' : '#0a8f45'}
            >
              {done ? '✓' : stop.index}
            </text>
          </g>
        );
      })}

      {highlightPoint && (
        <g>
          <path
            d={`M ${highlightPoint.x} ${highlightPoint.y} l -0.9 -1.6 a 1 1 0 1 1 1.8 0 z`}
            fill="#e11d48"
            stroke="#fff"
            strokeWidth={0.12}
            filter="url(#map-shadow)"
          />
          <circle cx={highlightPoint.x} cy={highlightPoint.y - 1.95} r={0.35} fill="#fff" />
        </g>
      )}

      <g>
        {/* Sits on the edge of the entrance zone so it does not cover the zone's label. */}
        <circle cx={layout.entrance.x} cy={startY} r={0.55} fill="#16a34a" stroke="#fff" strokeWidth={0.12} />
        <text x={layout.entrance.x} y={startY - 0.85} textAnchor="middle" fontSize={0.7} fontWeight={700} fill="#166534">
          Start
        </text>
      </g>
    </svg>
  );
}

function toPath(points: Point[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}
