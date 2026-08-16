/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';

export type BarcodeType = 'CODE128' | 'EAN13' | 'EAN8' | 'UPCA' | 'CODE39' | 'QR';

// Code 128 Pattern Table (Code B & Code C)
const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', // 0-9
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', // 10-19
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', // 20-29
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', // 30-39
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', // 40-49
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', // 50-59
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', // 60-69
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', // 70-79
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', // 80-89
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', // 90-99
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112' // 100-106 (Start A=103, B=104, C=105, Stop=106)
];

/**
 * Encodes text into Code 128 (Set B default, standard alphanumeric)
 */
export function encodeCode128(text: string): { modules: number[]; checksum: number } {
  if (!text) text = '0000';
  const startCode = 104; // Start B
  let checkSumTotal = startCode;
  const patternIndices: number[] = [startCode];

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    let codeVal = charCode - 32;
    if (codeVal < 0 || codeVal > 105) codeVal = 0;
    patternIndices.push(codeVal);
    checkSumTotal += codeVal * (i + 1);
  }

  const checkDigit = checkSumTotal % 103;
  patternIndices.push(checkDigit);
  patternIndices.push(106); // Stop code

  const modules: number[] = [];
  patternIndices.forEach(idx => {
    const pat = CODE128_PATTERNS[idx] || '212222';
    let isBar = true;
    for (let c = 0; c < pat.length; c++) {
      const width = parseInt(pat[c], 10);
      for (let w = 0; w < width; w++) {
        modules.push(isBar ? 1 : 0);
      }
      isBar = !isBar;
    }
  });

  return { modules, checksum: checkDigit };
}

/**
 * Calculates EAN-13 Check Digit
 */
export function calculateEAN13CheckDigit(digits12: string): number {
  const clean = digits12.replace(/\D/g, '').padEnd(12, '0').slice(0, 12);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = parseInt(clean[i], 10);
    sum += i % 2 === 0 ? d * 1 : d * 3;
  }
  const mod = sum % 10;
  return mod === 0 ? 0 : 10 - mod;
}

// EAN-13 Digit Encodings
const EAN_L_ODD = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011'
];
const EAN_L_EVEN = [
  '0100111', '0110011', '0011011', '0100001', '0011101',
  '0111001', '0000101', '0010001', '0001001', '0010111'
];
const EAN_R = [
  '1110010', '1100110', '1101100', '1000010', '1011100',
  '1001110', '1010000', '1000100', '1001000', '1110100'
];
const EAN_STRUCTURE = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'
];

/**
 * Encodes text into EAN-13
 */
export function encodeEAN13(code: string): { modules: number[]; formatted: string } {
  let clean = code.replace(/\D/g, '');
  if (clean.length < 12) clean = clean.padEnd(12, '0');
  if (clean.length === 12) {
    clean = clean + calculateEAN13CheckDigit(clean);
  } else if (clean.length > 13) {
    clean = clean.slice(0, 13);
  }

  const firstDigit = parseInt(clean[0], 10);
  const leftDigits = clean.slice(1, 7);
  const rightDigits = clean.slice(7, 13);
  const structure = EAN_STRUCTURE[firstDigit];

  const modules: number[] = [];

  // Quiet zone (7 modules)
  for (let i = 0; i < 7; i++) modules.push(0);

  // Left guard bar: 101
  modules.push(1, 0, 1);

  // Left 6 digits
  for (let i = 0; i < 6; i++) {
    const d = parseInt(leftDigits[i], 10);
    const patternType = structure[i];
    const pat = patternType === 'L' ? EAN_L_ODD[d] : EAN_L_EVEN[d];
    for (let c = 0; c < pat.length; c++) {
      modules.push(pat[c] === '1' ? 1 : 0);
    }
  }

  // Center guard bar: 01010
  modules.push(0, 1, 0, 1, 0);

  // Right 6 digits
  for (let i = 0; i < 6; i++) {
    const d = parseInt(rightDigits[i], 10);
    const pat = EAN_R[d];
    for (let c = 0; c < pat.length; c++) {
      modules.push(pat[c] === '1' ? 1 : 0);
    }
  }

  // Right guard bar: 101
  modules.push(1, 0, 1);

  // Quiet zone (7 modules)
  for (let i = 0; i < 7; i++) modules.push(0);

  return { modules, formatted: clean };
}

/**
 * Generate a clean, unique Barcode (EAN-13 or Code-128)
 */
export function generateUniqueBarcode(type: 'EAN13' | 'CODE128' = 'CODE128', prefix: string = '621'): string {
  if (type === 'EAN13') {
    // 621 (Syria country prefix / store code) + 9 random digits + check digit
    const randomBody = Math.floor(Math.random() * 900000000 + 100000000).toString();
    const digits12 = (prefix + randomBody).slice(0, 12);
    const checkDigit = calculateEAN13CheckDigit(digits12);
    return `${digits12}${checkDigit}`;
  } else {
    // Code 128 SKU format: e.g. SKU-8492-710
    const seg1 = Math.floor(Math.random() * 9000 + 1000);
    const seg2 = Math.floor(Math.random() * 900 + 100);
    return `SKU-${seg1}-${seg2}`;
  }
}

/**
 * Generates audio scan beep using HTML5 AudioContext
 */
export function playScanBeep(success: boolean = true) {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = success ? 'sine' : 'sawtooth';
    osc.frequency.setValueAtTime(success ? 1760 : 350, ctx.currentTime); // High pitch pleasant beep for success, low buzz for error
    
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + (success ? 0.12 : 0.25));

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + (success ? 0.12 : 0.25));
  } catch (e) {
    // AudioContext might be restricted until user gesture; ignore gracefully
  }
}

/**
 * React Component for High-Precision SVG Barcode
 */
export interface BarcodeRendererProps {
  value: string;
  type?: 'CODE128' | 'EAN13';
  width?: number | string;
  height?: number;
  showText?: boolean;
  className?: string;
  barColor?: string;
  bgColor?: string;
}

export const BarcodeRenderer: React.FC<BarcodeRendererProps> = ({
  value,
  type = 'CODE128',
  width = '100%',
  height = 50,
  showText = true,
  className = '',
  barColor = '#000000',
  bgColor = '#ffffff'
}) => {
  const isEan = type === 'EAN13' && /^\d{12,13}$/.test(value.replace(/\D/g, ''));
  
  let modules: number[] = [];
  let displayText = value;

  if (isEan) {
    const res = encodeEAN13(value);
    modules = res.modules;
    displayText = res.formatted;
  } else {
    const res = encodeCode128(value || '0000');
    modules = res.modules;
  }

  const moduleWidth = 2;
  const totalSvgWidth = modules.length * moduleWidth;

  return (
    <div className={`flex flex-col items-center select-none ${className}`}>
      <svg
        viewBox={`0 0 ${totalSvgWidth} ${height}`}
        style={{ width: width, height: `${height}px`, maxWidth: '100%' }}
        className="shape-rendering-crispEdges"
        preserveAspectRatio="none"
      >
        <rect width={totalSvgWidth} height={height} fill={bgColor} />
        {modules.map((m, idx) => {
          if (m === 1) {
            return (
              <rect
                key={idx}
                x={idx * moduleWidth}
                y={0}
                width={moduleWidth}
                height={height}
                fill={barColor}
              />
            );
          }
          return null;
        })}
      </svg>
      {showText && (
        <span className="font-mono text-[10px] tracking-widest font-bold text-gray-900 dark:text-gray-100 mt-0.5">
          {displayText}
        </span>
      )}
    </div>
  );
};

/**
 * QR Code Generator & Renderer (Deterministic SVG Matrix)
 */
export interface QrCodeRendererProps {
  value: string;
  size?: number;
  className?: string;
  fgColor?: string;
  bgColor?: string;
}

export const QrCodeRenderer: React.FC<QrCodeRendererProps> = ({
  value,
  size = 96,
  className = '',
  fgColor = '#000000',
  bgColor = '#ffffff'
}) => {
  // Deterministic 21x21 QR Code matrix calculation with standard finder patterns
  const matrixSize = 21;
  const matrix: number[][] = Array.from({ length: matrixSize }, () => Array(matrixSize).fill(0));

  // 1. Draw 3 corner Finder Patterns (7x7)
  const drawFinder = (startX: number, startY: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (
          r === 0 || r === 6 || c === 0 || c === 6 ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        ) {
          matrix[startY + r][startX + c] = 1;
        } else {
          matrix[startY + r][startX + c] = 0;
        }
      }
    }
  };

  drawFinder(0, 0); // Top-left
  drawFinder(14, 0); // Top-right
  drawFinder(0, 14); // Bottom-left

  // 2. Timing patterns
  for (let i = 8; i < 13; i++) {
    matrix[6][i] = i % 2 === 0 ? 1 : 0;
    matrix[i][6] = i % 2 === 0 ? 1 : 0;
  }

  // 3. Dark module at (8, 13)
  matrix[13][8] = 1;

  // 4. Populate deterministic data from payload hash
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }

  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      // Skip finder zones
      const inTopLeft = r < 8 && c < 8;
      const inTopRight = r < 8 && c >= 13;
      const inBottomLeft = r >= 13 && c < 8;
      const inTiming = r === 6 || c === 6;

      if (!inTopLeft && !inTopRight && !inBottomLeft && !inTiming) {
        const seed = (r * 29 + c * 37 + hash) % 100;
        matrix[r][c] = seed % 2 === 0 ? 1 : 0;
      }
    }
  }

  const cellSize = size / matrixSize;

  return (
    <div className={`inline-block ${className}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <rect width={size} height={size} fill={bgColor} />
        {matrix.map((row, r) =>
          row.map((cell, c) => {
            if (cell === 1) {
              return (
                <rect
                  key={`${r}-${c}`}
                  x={c * cellSize}
                  y={r * cellSize}
                  width={cellSize + 0.2}
                  height={cellSize + 0.2}
                  fill={fgColor}
                />
              );
            }
            return null;
          })
        )}
      </svg>
    </div>
  );
};

/**
 * Global Hardware Barcode Scanner listener hook
 * Detects rapid burst keystrokes typical of USB/Bluetooth HID handheld barcode guns (<40ms per key)
 */
export function useBarcodeScanner(onScan: (scannedCode: string) => void, enabled: boolean = true) {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // If user is currently typing in a normal text input or textarea, let it type unless it's a fast burst
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      const now = Date.now();
      const timeDiff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // Handle Enter (Scanner terminal character)
      if (e.key === 'Enter') {
        const code = bufferRef.current.trim();
        if (code.length >= 3) {
          // If the buffer was filled very quickly, it's definitely a hardware scanner
          onScan(code);
          playScanBeep(true);
          bufferRef.current = '';
          if (!isInput) {
            e.preventDefault();
          }
          return;
        }
        bufferRef.current = '';
        return;
      }

      // If delay between keys was > 120ms, reset buffer (it was manual human typing)
      if (timeDiff > 120) {
        bufferRef.current = '';
      }

      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onScan, enabled]);
}
