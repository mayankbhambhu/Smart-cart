import { code128Bars, qrMatrix, qrSvgPath } from '@smartcart/shared';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';

/** QR code rendered as crisp SVG (no canvas, prints well, scales to any size). */
export function QRCode({ value, size = 220, className, label }: { value: string; size?: number; className?: string; label?: string }) {
  const { path, count } = useMemo(() => {
    const matrix = qrMatrix(value, 'M');
    return { path: qrSvgPath(matrix, 4), count: matrix.length + 8 };
  }, [value]);
  return (
    <svg
      role="img"
      aria-label={label ?? 'QR code'}
      viewBox={`0 0 ${count} ${count}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={cn('rounded-xl bg-white', className)}
    >
      <rect width={count} height={count} fill="#fff" />
      <path d={path} fill="#0f172a" />
    </svg>
  );
}

/** Code 128 barcode for 1D gate scanners. */
export function Barcode({
  value,
  height = 64,
  className,
  showText = true,
}: {
  value: string;
  height?: number;
  className?: string;
  showText?: boolean;
}) {
  const { bars, modules } = useMemo(() => code128Bars(value), [value]);
  const quiet = 10;
  const width = modules + quiet * 2;
  return (
    <svg
      role="img"
      aria-label={`Barcode ${value}`}
      viewBox={`0 0 ${width} ${height + (showText ? 14 : 0)}`}
      preserveAspectRatio="none"
      className={cn('w-full bg-white', className)}
      shapeRendering="crispEdges"
    >
      <rect width={width} height={height + 14} fill="#fff" />
      {bars.map(([start, w]) => (
        <rect key={start} x={start + quiet} y={0} width={w} height={height} fill="#0f172a" />
      ))}
      {showText && (
        <text
          x={width / 2}
          y={height + 11}
          textAnchor="middle"
          fontSize="9"
          fontFamily="ui-monospace, monospace"
          fill="#334155"
          letterSpacing="1.5"
        >
          {value}
        </text>
      )}
    </svg>
  );
}
