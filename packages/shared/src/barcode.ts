import qrcode from 'qrcode-generator';

/**
 * Renderer-agnostic barcode encoders. Both return plain data that the web
 * (SVG) and mobile (react-native-svg) apps draw identically.
 */

// Code 128 bar/space widths for symbol values 0..106 (106 = stop).
const CODE128_PATTERNS = [
  '212222',
  '222122',
  '222221',
  '121223',
  '121322',
  '131222',
  '122213',
  '122312',
  '132212',
  '221213',
  '221312',
  '231212',
  '112232',
  '122132',
  '122231',
  '113222',
  '123122',
  '123221',
  '223211',
  '221132',
  '221231',
  '213212',
  '223112',
  '312131',
  '311222',
  '321122',
  '321221',
  '312212',
  '322112',
  '322211',
  '212123',
  '212321',
  '232121',
  '111323',
  '131123',
  '131321',
  '112313',
  '132113',
  '132311',
  '211313',
  '231113',
  '231311',
  '112133',
  '112331',
  '132131',
  '113123',
  '113321',
  '133121',
  '313121',
  '211331',
  '231131',
  '213113',
  '213311',
  '213131',
  '311123',
  '311321',
  '331121',
  '312113',
  '312311',
  '332111',
  '314111',
  '221411',
  '431111',
  '111224',
  '111422',
  '121124',
  '121421',
  '141122',
  '141221',
  '112214',
  '112412',
  '122114',
  '122411',
  '142112',
  '142211',
  '241211',
  '221114',
  '413111',
  '241112',
  '134111',
  '111242',
  '121142',
  '121241',
  '114212',
  '124112',
  '124211',
  '411212',
  '421112',
  '421211',
  '212141',
  '214121',
  '412121',
  '111143',
  '111341',
  '131141',
  '114113',
  '114311',
  '411113',
  '411311',
  '113141',
  '114131',
  '311141',
  '411131',
  '211412',
  '211214',
  '211232',
  '2331112',
];

const START_B = 104;
const STOP = 106;

/**
 * Encodes printable ASCII with Code 128 set B.
 * Returns a string of modules: "1" = bar, "0" = space (no quiet zone).
 */
export function encodeCode128(text: string): string {
  const values: number[] = [];
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code < 32 || code > 127) throw new Error(`Code 128B cannot encode character "${char}"`);
    values.push(code - 32);
  }
  let checksum = START_B;
  values.forEach((value, index) => {
    checksum += value * (index + 1);
  });
  const symbols = [START_B, ...values, checksum % 103, STOP];
  let modules = '';
  for (const symbol of symbols) {
    const widths = CODE128_PATTERNS[symbol]!;
    for (let i = 0; i < widths.length; i++) {
      modules += (i % 2 === 0 ? '1' : '0').repeat(Number(widths[i]));
    }
  }
  return modules;
}

/** Bars as [startModule, widthInModules] pairs, convenient for drawing rectangles. */
export function code128Bars(text: string): { bars: [number, number][]; modules: number } {
  const modules = encodeCode128(text);
  const bars: [number, number][] = [];
  let i = 0;
  while (i < modules.length) {
    if (modules[i] === '1') {
      let j = i;
      while (j < modules.length && modules[j] === '1') j++;
      bars.push([i, j - i]);
      i = j;
    } else {
      i++;
    }
  }
  return { bars, modules: modules.length };
}

export type QrErrorCorrection = 'L' | 'M' | 'Q' | 'H';

/** QR code as a square boolean matrix (true = dark module), quiet zone excluded. */
export function qrMatrix(text: string, errorCorrection: QrErrorCorrection = 'M'): boolean[][] {
  const qr = qrcode(0, errorCorrection);
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => qr.isDark(row, col)));
}

/** Compact SVG path ("M x y h1v1h-1z ...") for a QR matrix, one unit per module. */
export function qrSvgPath(matrix: boolean[][], offset = 0): string {
  let path = '';
  matrix.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x]) {
        let run = 1;
        while (x + run < row.length && row[x + run]) run++;
        path += `M${x + offset} ${y + offset}h${run}v1h-${run}z`;
        x += run;
      } else {
        x++;
      }
    }
  });
  return path;
}
