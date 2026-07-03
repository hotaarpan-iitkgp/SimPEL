import { state } from './state';

// Generate IDs for components
export function generateNextId(type: string, excludeIds: string[] = []): string {
  const prefix = type === 'vg-FET' ? 'vgFET' : type;
  let count = 1;
  while (
    state.components.some((c: any) => c.id === `${prefix}${count}`) || 
    state.wires.some((w: any) => w.id === `${prefix}${count}`) || 
    excludeIds.includes(`${prefix}${count}`)
  ) {
    count++;
  }
  return `${prefix}${count}`;
}

// Convert Screen coordinates to Canvas space
export function screenToCanvas(clientX: number, clientY: number): { x: number; y: number } {
  const svg = document.getElementById('canvas-svg');
  if (!svg) return { x: 0, y: 0 };
  const rect = svg.getBoundingClientRect();
  const x = (clientX - rect.left - state.panX) / state.zoom;
  const y = (clientY - rect.top - state.panY) / state.zoom;
  return { x, y };
}

// Update zoom and pan transforms
export function updateViewportTransform(): void {
  const viewport = document.getElementById('viewport');
  const zoomDisplay = document.getElementById('zoom-display');
  if (viewport) {
    viewport.setAttribute('transform', `translate(${state.panX}, ${state.panY}) scale(${state.zoom})`);
  }
  if (zoomDisplay) {
    zoomDisplay.textContent = `Zoom: ${Math.round(state.zoom * 100)}%`;
  }
}

// Convert point array to SVG string command
export function pathToString(pts: Array<{ x: number; y: number }>): string {
  return pts.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
}

// Custom UI Toast Alerts
export function showToast(msg: string): void {
  const toast: any = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  
  // Reset timeout
  clearTimeout(toast.timeoutId);
  toast.timeoutId = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Convert engineering shorthand prefixes or scientific strings to double-precision floats
export function parseScientific(valStr: string | number): number {
  if (typeof valStr !== 'string') {
    const parsed = parseFloat(valStr as any);
    return isNaN(parsed) ? 0.0 : parsed;
  }
  
  valStr = valStr.trim();
  if (valStr === '') return 0.0;

  // Strip trailing units like ohm, v, a, hz, f, h, w, etc. case-insensitively
  valStr = valStr.replace(/\s*(?:ohms?|ohm|Ω|hz|hertz|v(?:olts?)?|a(?:mps?)?|f(?:arads?)?|h(?:enrys?)?|w(?:atts?))\s*$/i, '');

  // Support simple division (e.g. "1/10000" or "1/10k")
  if (valStr.includes('/')) {
    const parts = valStr.split('/');
    if (parts.length === 2) {
      const num = parseScientific(parts[0]);
      const den = parseScientific(parts[1]);
      return den !== 0.0 ? num / den : 0.0;
    }
  }
  
  // Regex to check standard float/scientific notation (like 1e-3, 4.5e6)
  if (/^[+-]?\d*\.?\d+[eE][+-]?\d+$/.test(valStr)) {
    const val = parseFloat(valStr);
    return isNaN(val) ? 0.0 : val;
  }
  
  // Map of standard engineering SI prefixes
  const prefixes: Record<string, number> = {
    'p': 1e-12,
    'n': 1e-9,
    'u': 1e-6,
    'm': 1e-3,
    'k': 1e3,
    'M': 1e6,
    'G': 1e9
  };
  
  const lastChar = valStr.slice(-1);
  if (lastChar in prefixes) {
    const numPart = parseFloat(valStr.slice(0, -1).trim());
    if (!isNaN(numPart)) {
      return numPart * prefixes[lastChar];
    }
  }
  
  const val = parseFloat(valStr);
  return isNaN(val) ? 0.0 : val;
}

export function getNextGateSignalLabel(baseLabel: string, existingComps: any[]): string {
  const parseLabel = (label: string): { base: string; num: number | null } => {
    const match = label.match(/^(.*?)([0-9]+)$/);
    if (match) {
      return { base: match[1], num: parseInt(match[2], 10) };
    }
    return { base: label, num: null };
  };

  const { base } = parseLabel(baseLabel);
  const takenNums = new Set<number>();

  existingComps.forEach((c: any) => {
    if (c.type === 'vg-FET') {
      const label = c.parameters?.Gate_Signal_Label || 'S1';
      const parsed = parseLabel(label);
      if (parsed.base === base && parsed.num !== null) {
        takenNums.add(parsed.num);
      }
    }
  });

  let nextNum = 1;
  while (takenNums.has(nextNum)) {
    nextNum++;
  }
  return `${base}${nextNum}`;
}
