import { locationPoint, shelfBlocks, type ItemLocation, type Point, type RoutePlan, type StoreLayout } from '@smartcart/shared';
import { useMemo } from 'react';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

const zoneColors: Record<string, { fill: string; stroke: string; text: string }> = {
  ENTRANCE: { fill: '#dcfce7', stroke: '#16a34a', text: '#166534' },
  EXIT: { fill: '#e0e7ff', stroke: '#4f46e5', text: '#3730a3' },
  PICKUP: { fill: '#fef3c7', stroke: '#d97706', text: '#92400e' },
};

/**
 * The store floor plan (coordinates in metres) with the walking route through
 * the aisles. Same drawing as the web app, rendered with react-native-svg.
 */
export function StoreMap<T>({
  layout,
  plan,
  highlight,
  width,
}: {
  layout: StoreLayout;
  plan?: RoutePlan<T> | null;
  highlight?: ItemLocation | null;
  width: number;
}) {
  const blocks = useMemo(() => shelfBlocks(layout), [layout]);
  const pathD = useMemo(() => (plan ? toPath(plan.path) : null), [plan]);
  const pin = highlight ? locationPoint(layout, highlight) : null;
  const pad = 1;
  const vbW = layout.width + pad * 2;
  const vbH = layout.height + pad * 2;
  const entranceZone = layout.zones.find((z) => z.kind === 'ENTRANCE');
  const startY = entranceZone ? entranceZone.y : layout.entrance.y;

  return (
    <Svg width={width} height={(width * vbH) / vbW} viewBox={`${-pad} ${-pad} ${vbW} ${vbH}`}>
      <Rect x={0} y={0} width={layout.width} height={layout.height} rx={1.2} fill="#f8fafc" stroke="#cbd5e1" strokeWidth={0.15} />
      {blocks.map((b, i) => (
        <Rect key={i} x={b.x} y={b.y} width={b.width} height={b.height} rx={0.35} fill="#e2e8f0" />
      ))}
      {layout.aisles.map((aisle) => (
        <G key={aisle.number}>
          <Circle cx={aisle.x} cy={aisle.yEnd - 0.9} r={0.75} fill="#0f172a" />
          <SvgText x={aisle.x} y={aisle.yEnd - 0.62} fontSize={0.8} fontWeight="700" fill="#fff" textAnchor="middle">
            {aisle.number}
          </SvgText>
        </G>
      ))}
      {layout.zones.map((zone) => {
        const c = zoneColors[zone.kind] ?? { fill: '#f1f5f9', stroke: '#94a3b8', text: '#334155' };
        return (
          <G key={zone.id}>
            <Rect
              x={zone.x}
              y={zone.y}
              width={zone.width}
              height={zone.height}
              rx={0.4}
              fill={c.fill}
              stroke={c.stroke}
              strokeWidth={0.1}
            />
            <SvgText
              x={zone.x + zone.width / 2}
              y={zone.y + zone.height / 2 + 0.3}
              fontSize={0.8}
              fontWeight="700"
              fill={c.text}
              textAnchor="middle"
            >
              {zone.label}
            </SvgText>
          </G>
        );
      })}
      {pathD && (
        <>
          <Path d={pathD} fill="none" stroke="#a7f3d0" strokeWidth={0.7} strokeLinecap="round" strokeLinejoin="round" />
          <Path
            d={pathD}
            fill="none"
            stroke="#0a8f45"
            strokeWidth={0.32}
            strokeDasharray="0.9 0.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      )}
      {plan?.stops.map((stop, i) => (
        <G key={`${stop.location.aisle}-${stop.location.row}`}>
          <Circle
            cx={stop.point.x}
            cy={stop.point.y}
            r={i === 0 ? 0.95 : 0.75}
            fill={i === 0 ? '#0a8f45' : '#fff'}
            stroke="#0a8f45"
            strokeWidth={0.18}
          />
          <SvgText
            x={stop.point.x}
            y={stop.point.y + 0.3}
            fontSize={0.8}
            fontWeight="800"
            fill={i === 0 ? '#fff' : '#0a8f45'}
            textAnchor="middle"
          >
            {stop.index}
          </SvgText>
        </G>
      ))}
      {pin && (
        <G>
          <Path d={`M ${pin.x} ${pin.y} l -0.9 -1.6 a 1 1 0 1 1 1.8 0 z`} fill="#e11d48" stroke="#fff" strokeWidth={0.12} />
          <Circle cx={pin.x} cy={pin.y - 1.95} r={0.35} fill="#fff" />
        </G>
      )}
      <Circle cx={layout.entrance.x} cy={startY} r={0.55} fill="#16a34a" stroke="#fff" strokeWidth={0.12} />
    </Svg>
  );
}

function toPath(points: Point[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}
