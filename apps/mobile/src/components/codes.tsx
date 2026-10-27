import { code128Bars, qrMatrix, qrSvgPath } from '@smartcart/shared';
import { useMemo } from 'react';
import Svg, { Path, Rect, Text as SvgText } from 'react-native-svg';

/** QR code drawn as one SVG path (crisp at any size, no image decoding). */
export function QRCode({ value, size = 240 }: { value: string; size?: number }) {
  const { path, count } = useMemo(() => {
    const matrix = qrMatrix(value, 'M');
    return { path: qrSvgPath(matrix, 4), count: matrix.length + 8 };
  }, [value]);
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${count} ${count}`}>
      <Rect width={count} height={count} fill="#fff" />
      <Path d={path} fill="#0f172a" />
    </Svg>
  );
}

/** Code 128 barcode for 1D exit-gate scanners. */
export function Barcode({ value, width = 300, height = 80 }: { value: string; width?: number; height?: number }) {
  const { bars, modules } = useMemo(() => code128Bars(value), [value]);
  const quiet = 10;
  const total = modules + quiet * 2;
  return (
    <Svg width={width} height={height + 16} viewBox={`0 0 ${total} ${height + 16}`} preserveAspectRatio="none">
      <Rect width={total} height={height + 16} fill="#fff" />
      {bars.map(([start, w]) => (
        <Rect key={start} x={start + quiet} y={0} width={w} height={height} fill="#0f172a" />
      ))}
      <SvgText x={total / 2} y={height + 12} fontSize={9} textAnchor="middle" fill="#334155" letterSpacing={1.5}>
        {value}
      </SvgText>
    </Svg>
  );
}
