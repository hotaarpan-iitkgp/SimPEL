import { getDetailedComponentSVG } from './detailedLibrary';
import { state } from './state';
import { draw } from './renderer';
import { getTerminalCoords } from './routing';
import { completeWire } from './actions';
import { getComponentPins, parseTurnsList, discoverPortsJS, getTerminalNameFromCode } from './config';

// Return custom component SVG structures centered at (0, 0)
export function getComponentSVG(comp: any): string {
  const type = comp.type;
  const id = comp.id;
  const rotation = comp.rotation;

  // Try detailed component custom SVG fallback first
  const detailedSVG = getDetailedComponentSVG(comp);
  if (detailedSVG) return detailedSVG;

  let shape = '';
  switch (type) {
    case 'R': // Resistor
      shape = `<path class="comp-path" d="M 0,-40 L 0,-20 L -10,-15 L 10,-9 L -10,-3 L 10,3 L -10,9 L 10,15 L 0,20 L 0,40" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="miter" stroke-linecap="round"/>`;
      break;
    case 'L': // Inductor
      shape = `<path class="comp-path" d="M 0,-40 L 0,-20 C -12,-20 -12,-6.6 0,-6.6 C -12,-6.6 -12,6.6 0,6.6 C -12,6.6 -12,20 0,20 L 0,40" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      break;
    case 'C': // Capacitor
      shape = `<path class="comp-path" d="M 0,-40 L 0,-5 M -15,-5 L 15,-5 M -15,5 L 15,5 M 0,5 L 0,40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`;
      break;
    case 'S': // Ideal Switch
      shape = `
        <line class="comp-path" x1="0" y1="-40" x2="0" y2="-20" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        <circle class="comp-node" cx="0" cy="-20" r="3" fill="currentColor" />
        <circle class="comp-node" cx="0" cy="20" r="3" fill="currentColor" />
        <line class="comp-path" x1="0" y1="-20" x2="13" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        <line class="comp-path" x1="0" y1="20" x2="0" y2="40" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        <line class="comp-path" x1="-20" y1="0" x2="-6" y2="0" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      `;
      break;
    case 'D': // Diode
      shape = `
        <path class="comp-path" d="M 0,-40 L 0,-10 M -15,-10 L 15,-10 L 0,12 Z M -15,12 L 15,12 M 0,12 L 0,40" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="miter" stroke-linecap="round"/>
        <path class="comp-fill" d="M -15,-10 L 15,-10 L 0,12 Z" fill="currentColor" opacity="0.12"/>
      `;
      break;
    case 'V': // DC Voltage Source
      shape = `
        <circle cx="0" cy="0" r="16" class="comp-path" fill="none" stroke="currentColor" stroke-width="2" />
        <path class="comp-path" d="M 0,-40 L 0,-16 M 0,16 L 0,40" fill="none" stroke="currentColor" stroke-width="2"/>
        <path class="comp-path" d="M -3,-7 L 3,-7 M 0,-10 L 0,-4" stroke="currentColor" stroke-width="1.5"/>
        <path class="comp-path" d="M -3,7 L 3,7" stroke="currentColor" stroke-width="1.5"/>
      `;
      break;
    case 'I': // DC Current Source
      shape = `
        <circle cx="0" cy="0" r="16" class="comp-path" fill="none" stroke="currentColor" stroke-width="2" />
        <path class="comp-path" d="M 0,-40 L 0,-16 M 0,16 L 0,40" fill="none" stroke="currentColor" stroke-width="2"/>
        <path class="comp-path" d="M 0,-9 L 0,9 M -4,3 L 0,9 L 4,3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      `;
      break;
    case 'VM': // Voltmeter
      shape = `
        <circle cx="0" cy="0" r="16" class="comp-path" fill="none" stroke="currentColor" stroke-width="2" />
        <path class="comp-path" d="M 0,-40 L 0,-16 M 0,16 L 0,40 M 16,0 L 20,0 M 17,-3 L 20,0 L 17,3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <text x="0" y="5.5" font-family="Inter, sans-serif" font-size="15" font-weight="700" fill="currentColor" text-anchor="middle" stroke="none">V</text>
      `;
      break;
    case 'AM': // Ammeter
      shape = `
        <circle cx="0" cy="0" r="16" class="comp-path" fill="none" stroke="currentColor" stroke-width="2" />
        <path class="comp-path" d="M 0,-40 L 0,-16 M 0,16 L 0,40 M 16,0 L 20,0 M 17,-3 L 20,0 L 17,3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <text x="0" y="5.5" font-family="Inter, sans-serif" font-size="15" font-weight="700" fill="currentColor" text-anchor="middle" stroke="none">A</text>
      `;
      break;
    case 'GND': // Ground Reference
      shape = `
        <line x1="0" y1="-20" x2="0" y2="0" class="comp-path" stroke="currentColor" stroke-width="2" />
        <line x1="-12" y1="0" x2="12" y2="0" class="comp-path" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        <line x1="-8" y1="6" x2="8" y2="6" class="comp-path" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        <line x1="-4" y1="12" x2="4" y2="12" class="comp-path" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      `;
      break;
    case 'MOSFET': // MOSFET switch with antiparallel body diode
      shape = `
        <path class="comp-path" d="M 0,-40 L 0,-15 M 0,15 L 0,40" fill="none" stroke="currentColor" stroke-width="2" />
        <path class="comp-path" d="M -5,-15 L -5,15 M -5,0 L 0,0 M 0,-15 L 0,-10 M 0,15 L 0,10" fill="none" stroke="currentColor" stroke-width="2" />
        <path class="comp-path" d="M -10,-15 L -10,15 M -20,0 L -10,0 M -13,-3 L -10,0 L -13,3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        <path class="comp-path" d="M -5,0 L -1,2 M -5,0 L -1,-2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        <!-- Antiparallel body diode -->
        <path class="comp-path" d="M 0,-15 L 12,-15 L 12,-6 M 7,-6 L 17,-6 M 7,6 L 17,6 L 12,-6 Z M 12,6 L 12,15 L 0,15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="miter" stroke-linecap="round" />
        <path class="comp-fill" d="M 7,6 L 17,6 L 12,-6 Z" fill="currentColor" opacity="0.12"/>
      `;
      break;
    case 'vg-FET': { // Wireless MOSFET switch with internal signal listener
      const label = comp.parameters && comp.parameters.Gate_Signal_Label || "S1";
      shape = `
        <path class="comp-path" d="M 0,-40 L 0,-15 M 0,15 L 0,40" fill="none" stroke="currentColor" stroke-width="2" />
        <path class="comp-path" d="M -5,-15 L -5,15 M -5,0 L 0,0 M 0,-15 L 0,-10 M 0,15 L 0,10" fill="none" stroke="currentColor" stroke-width="2" />
        <path class="comp-path" d="M -10,-15 L -10,15 M -14,0 L -10,0 M -12,-3 L -10,0 L -12,3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        <path class="comp-path" d="M -5,0 L -1,2 M -5,0 L -1,-2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
        <!-- Antiparallel body diode -->
        <path class="comp-path" d="M 0,-15 L 12,-15 L 12,-6 M 7,-6 L 17,-6 M 7,6 L 17,6 L 12,-6 Z M 12,6 L 12,15 L 0,15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="miter" stroke-linecap="round" />
        <path class="comp-fill" d="M 7,6 L 17,6 L 12,-6 Z" fill="currentColor" opacity="0.12"/>
        <text x="-16" y="3" font-family="Inter, sans-serif" font-size="9" font-weight="700" fill="currentColor" text-anchor="end" stroke="none">${label}</text>
      `;
      break;
    }
    case 'AC_V': // AC Voltage Source
      shape = `
        <circle cx="0" cy="0" r="16" class="comp-path" fill="none" stroke="currentColor" stroke-width="2" />
        <path class="comp-path" d="M 0,-40 L 0,-16 M 0,16 L 0,40" fill="none" stroke="currentColor" stroke-width="2"/>
        <path class="comp-path" d="M -8,0 C -4,-8 0,-8 0,0 C 0,8 4,8 8,0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      `;
      break;
    case 'XFMR': { // Ideal Multi-Winding Transformer
      const pTurns = parseTurnsList(comp.parameters && comp.parameters.primary_turns);
      const sTurns = parseTurnsList(comp.parameters && comp.parameters.secondary_turns);
      const Np = pTurns.length;
      const Ns = sTurns.length;
      const spacing = 60;
      
      let paths = '';
      
      // Draw primary windings on the left
      for (let i = 0; i < Np; i++) {
        const yCenter = Math.round((i - (Np - 1) / 2) * spacing);
        paths += `
          <!-- Primary winding ${i+1} -->
          <path class="comp-path" d="M -20,${yCenter-20} L -8,${yCenter-20} C -2,${yCenter-20} -2,${yCenter-10} -8,${yCenter-10} C -2,${yCenter-10} -2,${yCenter} -8,${yCenter} C -2,${yCenter} -2,${yCenter+10} -8,${yCenter+10} C -2,${yCenter+10} -2,${yCenter+20} -8,${yCenter+20} L -20,${yCenter+20}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        `;
      }
      
      // Draw secondary windings on the right
      for (let j = 0; j < Ns; j++) {
        const yCenter = Math.round((j - (Ns - 1) / 2) * spacing);
        paths += `
          <!-- Secondary winding ${j+1} -->
          <path class="comp-path" d="M 20,${yCenter-20} L 8,${yCenter-20} C 2,${yCenter-20} 2,${yCenter-10} 8,${yCenter-10} C 2,${yCenter-10} 2,${yCenter} 8,${yCenter} C 2,${yCenter} 2,${yCenter+10} 8,${yCenter+10} C 2,${yCenter+10} 2,${yCenter+20} 8,${yCenter+20} L 20,${yCenter+20}" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        `;
      }
      
      // Draw core lines in the middle
      const yMinP = Math.round((- (Np - 1) / 2) * spacing) - 20;
      const yMaxP = Math.round(((Np - 1) / 2) * spacing) + 20;
      const yMinS = Math.round((- (Ns - 1) / 2) * spacing) - 20;
      const yMaxS = Math.round(((Ns - 1) / 2) * spacing) + 20;
      const yCoreMin = Math.min(yMinP, yMinS) - 5;
      const yCoreMax = Math.max(yMaxP, yMaxS) + 5;
      
      paths += `
        <!-- Core lines -->
        <line class="comp-path" x1="-2" y1="${yCoreMin}" x2="-2" y2="${yCoreMax}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        <line class="comp-path" x1="2" y1="${yCoreMin}" x2="2" y2="${yCoreMax}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      `;
      
      // Dynamic bounding box
      const halfHeight = Math.max(yMaxP, yMaxS) + 12;
      return `
        <rect class="comp-bounds" x="-22" y="${-halfHeight}" width="44" height="${halfHeight * 2}" rx="4" />
        ${paths}
        <g transform="translate(0, ${-halfHeight + 14}) rotate(${-rotation})">
          <text class="comp-label" x="0" y="4" text-anchor="middle" fill="currentColor">${id}</text>
        </g>
      `;
    }
    case 'CONST': // Constant
      shape = `
        <rect class="comp-path" x="-16" y="-16" width="32" height="32" rx="4" fill="none" stroke="currentColor" stroke-width="2" />
        <path class="comp-path" d="M 16,0 L 20,0 M 17,-3 L 20,0 L 17,3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        <text x="0" y="4" font-family="JetBrains Mono, monospace" font-size="9" font-weight="700" fill="currentColor" text-anchor="middle" stroke="none">CST</text>
      `;
      break;
    case 'KEY_TRIGGER': // Keyboard Key Trigger Block
      shape = `
        <rect class="comp-path" x="-20" y="-16" width="40" height="32" rx="4" fill="none" stroke="currentColor" stroke-width="2" />
        <path class="comp-path" d="M 20,0 L 24,0 M 21,-3 L 24,0 L 21,3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        <text x="0" y="4" font-family="JetBrains Mono, monospace" font-size="9" font-weight="700" fill="currentColor" text-anchor="middle" stroke="none">KEY</text>
      `;
      break;
    case 'GAIN': // Gain scalar multiplication
      shape = `
        <path class="comp-path" d="M -16,-18 L 16,0 L -16,18 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
        <path class="comp-path" d="M -20,0 L -16,0 M -19,-3 L -16,0 L -19,3 M 16,0 L 20,0 M 17,-3 L 20,0 L 17,3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        <text x="-4" y="3.5" font-family="JetBrains Mono, monospace" font-size="9" font-weight="700" fill="currentColor" text-anchor="middle" stroke="none">K</text>
      `;
      break;
    case 'PID': // PID Controller
      shape = `
        <rect class="comp-path" x="-16" y="-16" width="32" height="32" rx="4" fill="none" stroke="currentColor" stroke-width="2" />
        <path class="comp-path" d="M -20,0 L -16,0 M -19,-3 L -16,0 L -19,3 M 16,0 L 20,0 M 17,-3 L 20,0 L 17,3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        <text x="0" y="4" font-family="JetBrains Mono, monospace" font-size="9" font-weight="700" fill="currentColor" text-anchor="middle" stroke="none">PID</text>
      `;
      break;
    case 'SUM': // Summing Junction
      shape = `
        <circle cx="0" cy="0" r="14" class="comp-path" fill="none" stroke="currentColor" stroke-width="2" />
        <path class="comp-path" d="M -20,-20 L -10,-10 M -14,-10 L -10,-10 L -10,-14 M -20,20 L -10,10 M -14,10 L -10,10 L -10,14 M 14,0 L 20,0 M 17,-3 L 20,0 L 17,3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        <text x="-6" y="-4" font-family="Inter, sans-serif" font-size="9" font-weight="700" fill="currentColor" text-anchor="middle" stroke="none">+</text>
        <text x="-6" y="10" font-family="Inter, sans-serif" font-size="9" font-weight="700" fill="currentColor" text-anchor="middle" stroke="none">-</text>
      `;
      break;
    case 'PWM': // Pulse Width Modulator
      shape = `
        <rect class="comp-path" x="-16" y="-16" width="32" height="32" rx="4" fill="none" stroke="currentColor" stroke-width="2" />
        <path class="comp-path" d="M -20,0 L -16,0 M -19,-3 L -16,0 L -19,3 M 16,0 L 20,0 M 17,-3 L 20,0 L 17,3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        <path class="comp-path" d="M -10,6 L -10,-6 L 0,-6 L 0,6 L 10,6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="miter" stroke-linecap="round" />
      `;
      break;
    case 'PWM_MASTER': {
      const n = parseInt(comp.parameters && comp.parameters.num_carriers) || 3;
      let config: any[] = [];
      try {
        config = JSON.parse(comp.parameters && comp.parameters.config || '[]');
      } catch (_) {}
      const width = 60;
      const height = Math.max(60, n * 40);
      const halfW = width / 2;
      const halfH = height / 2;
      
      let svg = `
        <rect class="comp-path" x="-${halfW}" y="-${halfH}" width="${width}" height="${height}" rx="6" fill="#0f172a" stroke="currentColor" stroke-width="2" />
        <text x="0" y="-${halfH - 12}" font-family="Inter, sans-serif" font-size="7.5" font-weight="700" fill="currentColor" text-anchor="middle" stroke="none">PWM MASTER</text>
        <text x="0" y="-${halfH - 24}" font-family="JetBrains Mono, monospace" font-size="7" fill="#64748b" text-anchor="middle" stroke="none">fc=${comp.parameters.fc || '10k'}</text>
      `;

      const isCommon = (comp.parameters && comp.parameters.common_modulation) === 'true';

      if (isCommon) {
        svg += `<path class="comp-path" d="M -${halfW + 4},-${halfH - 15} L -${halfW},-${halfH - 15}" stroke="currentColor" stroke-width="2" />`;
        svg += `<text x="-${halfW - 4}" y="-${halfH - 12}" font-family="Inter, sans-serif" font-size="7" fill="#94a3b8" text-anchor="start" stroke="none">Mod</text>`;
      } else {
        for (let i = 1; i <= n; i++) {
          const yVal = -halfH + 15 + 40 * (i - 1);
          svg += `<path class="comp-path" d="M -${halfW + 4},${yVal} L -${halfW},${yVal}" stroke="currentColor" stroke-width="2" />`;
          svg += `<text x="-${halfW - 4}" y="${yVal + 3}" font-family="Inter, sans-serif" font-size="7" fill="#94a3b8" text-anchor="start" stroke="none">M${i}</text>`;
        }
      }

      for (let i = 2; i <= n; i++) {
        const cConf = config.find((c: any) => c.id === i);
        if (cConf && cConf.phase_source === 'external') {
          const yVal = -halfH + 30 + 40 * (i - 1);
          svg += `<path class="comp-path" d="M -${halfW + 4},${yVal} L -${halfW},${yVal}" stroke="currentColor" stroke-width="2" />`;
          svg += `<text x="-${halfW - 4}" y="${yVal + 3}" font-family="Inter, sans-serif" font-size="7" fill="#94a3b8" text-anchor="start" stroke="none">EP${i}</text>`;
        }
      }

      for (let i = 1; i <= n; i++) {
        const yDirect = -halfH + 15 + 40 * (i - 1);
        const yCompl = -halfH + 30 + 40 * (i - 1);
        
        svg += `<path class="comp-path" d="M ${halfW},${yDirect} L ${halfW + 4},${yDirect}" stroke="currentColor" stroke-width="2" />`;
        svg += `<text x="${halfW - 4}" y="${yDirect + 3}" font-family="Inter, sans-serif" font-size="7" fill="#38bdf8" text-anchor="end" stroke="none">D${i}</text>`;
        
        svg += `<path class="comp-path" d="M ${halfW},${yCompl} L ${halfW + 4},${yCompl}" stroke="currentColor" stroke-width="2" />`;
        svg += `<text x="${halfW - 4}" y="${yCompl + 3}" font-family="Inter, sans-serif" font-size="7" fill="#fb7185" text-anchor="end" stroke="none">C${i}</text>`;
      }

      shape = svg;
      break;
    }
    case 'TRI': {
      const extPhase = (comp.parameters && comp.parameters.phase_source) === 'external';
      const extFreq = (comp.parameters && comp.parameters.freq_source) === 'external';
      
      let svg = `
        <rect class="comp-path" x="-16" y="-16" width="32" height="32" rx="4" fill="none" stroke="currentColor" stroke-width="2" />
        <path class="comp-path" d="M 16,0 L 20,0 M 17,-3 L 20,0 L 17,3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        <path class="comp-path" d="M -10,6 L 0,-6 L 10,6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" />
      `;
      
      if (extPhase && extFreq) {
        svg += `
          <path class="comp-path" d="M -20,-10 L -16,-10 M -19,-13 L -16,-10 L -19,-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          <path class="comp-path" d="M -20,10 L -16,10 M -19,7 L -16,10 L -19,13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          <text x="-12" y="-7.5" font-family="Inter, sans-serif" font-size="5.5" font-weight="700" fill="#94a3b8" text-anchor="start" stroke="none">P</text>
          <text x="-12" y="12.5" font-family="Inter, sans-serif" font-size="5.5" font-weight="700" fill="#94a3b8" text-anchor="start" stroke="none">F</text>
        `;
      } else if (extPhase) {
        svg += `
          <path class="comp-path" d="M -20,0 L -16,0 M -19,-3 L -16,0 L -19,3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          <text x="-12" y="2.5" font-family="Inter, sans-serif" font-size="5.5" font-weight="700" fill="#94a3b8" text-anchor="start" stroke="none">P</text>
        `;
      } else if (extFreq) {
        svg += `
          <path class="comp-path" d="M -20,0 L -16,0 M -19,-3 L -16,0 L -19,3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          <text x="-12" y="2.5" font-family="Inter, sans-serif" font-size="5.5" font-weight="700" fill="#94a3b8" text-anchor="start" stroke="none">F</text>
        `;
      }
      
      shape = svg;
      break;
    }
    case 'COMP': // Comparator
      shape = `
        <path class="comp-path" d="M -16,-20 L 16,0 L -16,20 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
        <path class="comp-path" d="M -20,-20 L -16,-20 M -19,-23 L -16,-20 L -19,-17 M -20,20 L -16,20 M -19,17 L -16,20 L -19,23 M 16,0 L 20,0 M 17,-3 L 20,0 L 17,3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        <text x="-10" y="-9" font-family="Inter, sans-serif" font-size="8" font-weight="700" fill="currentColor" text-anchor="middle" stroke="none">+</text>
        <text x="-10" y="14" font-family="Inter, sans-serif" font-size="8" font-weight="700" fill="currentColor" text-anchor="middle" stroke="none">-</text>
      `;
      break;
    case 'AND': // Logic AND Gate
      shape = `
        <path class="comp-path" d="M -14,-18 L -4,-18 C 8,-18 14,-10 14,0 C 14,10 8,18 -4,18 L -14,18 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
        <path class="comp-path" d="M -20,-20 L -14,-20 M -17,-23 L -14,-20 L -17,-17 M -20,20 L -14,20 M -17,17 L -14,20 L -17,23 M 14,0 L 20,0 M 17,-3 L 20,0 L 17,3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        <text x="-2" y="3.5" font-family="JetBrains Mono, monospace" font-size="9" font-weight="700" fill="currentColor" text-anchor="middle" stroke="none">&amp;</text>
      `;
      break;
    case 'OR': // Logic OR Gate
      shape = `
        <path class="comp-path" d="M -14,-18 C -8,-12 -8,12 -14,18 C -2,18 8,12 14,0 C 8,-12 -2,-18 -14,-18 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
        <path class="comp-path" d="M -20,-20 L -11,-20 M -14,-23 L -11,-20 L -14,-17 M -20,20 L -11,20 M -14,17 L -11,20 L -14,23 M 14,0 L 20,0 M 17,-3 L 20,0 L 17,3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        <text x="-2" y="4" font-family="JetBrains Mono, monospace" font-size="9" font-weight="700" fill="currentColor" text-anchor="middle" stroke="none">|</text>
      `;
      break;
    case 'NOT': // Inverter
      shape = `
        <path class="comp-path" d="M -14,-15 L 6,0 L -14,15 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
        <circle cx="10" cy="0" r="3" class="comp-path" fill="none" stroke="currentColor" stroke-width="2" />
        <path class="comp-path" d="M -20,0 L -14,0 M -17,-3 L -14,0 L -17,3 M 13,0 L 20,0 M 17,-3 L 20,0 L 17,3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      `;
      break;
    case 'FCN': // Custom Function
      shape = `
        <rect class="comp-path" x="-16" y="-16" width="32" height="32" rx="4" fill="none" stroke="currentColor" stroke-width="2" />
        <path class="comp-path" d="M -20,0 L -16,0 M -19,-3 L -16,0 L -19,3 M 16,0 L 20,0 M 17,-3 L 20,0 L 17,3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        <text x="0" y="4" font-family="JetBrains Mono, monospace" font-size="9" font-weight="700" fill="currentColor" text-anchor="middle" stroke="none">f(u)</text>
      `;
      break;
    case 'PROD': // Product (multiply/divide)
      shape = `
        <circle cx="0" cy="0" r="14" class="comp-path" fill="none" stroke="currentColor" stroke-width="2" />
        <path class="comp-path" d="M -20,-20 L -10,-10 M -14,-10 L -10,-10 L -10,-14 M -20,20 L -10,10 M -14,10 L -10,10 L -10,14 M 14,0 L 20,0 M 17,-3 L 20,0 L 17,3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        <text x="-1.5" y="4" font-family="Inter, sans-serif" font-size="14" font-weight="700" fill="currentColor" text-anchor="middle" stroke="none">×</text>
      `;
      break;
    case 'PROBE': { // Unified Probe
      const target = comp.parameters && comp.parameters.target || "";
      const selected = (comp.parameters && comp.parameters.selected_signals || "").split(",").filter(Boolean);
      const numPins = selected.length;
      if (numPins === 0) {
        shape = `
          <rect class="comp-path" x="-20" y="-15" width="40" height="30" rx="4" fill="none" stroke="currentColor" stroke-width="2" />
          <text x="0" y="3" font-family="Inter, sans-serif" font-size="9" font-weight="700" fill="currentColor" text-anchor="middle" stroke="none">PROBE</text>
        `;
      } else {
        const height = Math.max(40, numPins * 30);
        const halfH = height / 2;
        const width = 60;
        const halfW = width / 2;
        let pinsSVG = '';
        for (let i = 0; i < numPins; i++) {
          let yOffset = 0;
          if (numPins > 1) {
            yOffset = -15 * (numPins - 1) + 30 * i;
          }
          pinsSVG += `
            <text x="${halfW - 5}" y="${yOffset + 3}" font-family="Inter, sans-serif" font-size="8" fill="currentColor" text-anchor="end" stroke="none">${selected[i]}</text>
          `;
        }
        shape = `
          <rect class="comp-path" x="-${halfW}" y="-${halfH}" width="${width}" height="${height}" rx="4" fill="none" stroke="currentColor" stroke-width="2" />
          <text x="0" y="4" font-family="Inter, sans-serif" font-size="9" font-weight="700" fill="currentColor" text-anchor="middle" stroke="none">${target || 'PROBE'}</text>
          ${pinsSVG}
        `;
      }
      break;
    }
    case 'SCOPE': { // Oscilloscope display screen
      const numChannels = parseInt(comp.parameters && comp.parameters.channels) || 2;
      const height = Math.max(32, numChannels * 20);
      const halfH = height / 2;
      const halfW = 16;
      
      let scopeLines = '';
      for (let i = 0; i < numChannels; i++) {
        let yOffset = 0;
        if (numChannels > 1) {
          yOffset = -10 * (numChannels - 1) + 20 * i;
        }
        const y = Math.round(yOffset);
        // Draw a small arrow pointing inside the block
        scopeLines += `
          <polygon class="comp-path" points="-${halfW},${y-3} -${halfW-4},${y} -${halfW},${y+3}" fill="currentColor" stroke="none" />
        `;
      }
      
      shape = `
        <rect class="comp-path" x="-${halfW}" y="-${halfH}" width="32" height="${height}" rx="4" fill="none" stroke="currentColor" stroke-width="2" />
        <path class="comp-path" d="M -8,-6 L -4,-6 L -4,6 L 4,6 L 4,-6 L 8,-6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="1 1" />
        ${scopeLines}
      `;
      break;
    }
    case 'MUX': { // Multiplexer
      const numInputs = parseInt(comp.parameters && comp.parameters.inputs) || 2;
      let muxLines = '';
      for (let i = 1; i <= numInputs; i++) {
        let yOffset = 0;
        if (numInputs > 1) {
          yOffset = -20 + (40 * (i - 1)) / (numInputs - 1);
        }
        const y = Math.round(yOffset);
        muxLines += `
          <path class="comp-path" d="M -20,${y} L -10,${y} M -13,${y-3} L -10,${y} L -13,${y+3}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        `;
      }
      muxLines += `
        <path class="comp-path" d="M 10,0 L 20,0 M 17,-3 L 20,0 L 17,3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      `;
      shape = `
        <polygon points="-10,-30 10,-20 10,20 -10,30" class="comp-path" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
        <text x="0" y="4.5" font-family="Inter, sans-serif" font-size="9" font-weight="700" fill="currentColor" text-anchor="middle" stroke="none">MUX</text>
        ${muxLines}
      `;
      break;
    }
    case 'DEMUX': { // Demultiplexer
      const numOutputs = parseInt(comp.parameters && comp.parameters.outputs) || 2;
      let demuxLines = '';
      for (let i = 1; i <= numOutputs; i++) {
        let yOffset = 0;
        if (numOutputs > 1) {
          yOffset = -20 + (40 * (i - 1)) / (numOutputs - 1);
        }
        const y = Math.round(yOffset);
        demuxLines += `
          <path class="comp-path" d="M 10,${y} L 20,${y} M 17,${y-3} L 20,${y} L 17,${y+3}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        `;
      }
      demuxLines += `
        <path class="comp-path" d="M -20,0 L -10,0 M -13,-3 L -10,0 L -13,3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
      `;
      shape = `
        <polygon points="-10,-20 10,-30 10,30 -10,20" class="comp-path" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
        <text x="0" y="4.5" font-family="Inter, sans-serif" font-size="9" font-weight="700" fill="currentColor" text-anchor="middle" stroke="none">DMUX</text>
        ${demuxLines}
      `;
      break;
    }
    case 'CSCRIPT': { // Custom Python Script Block
      const ports = discoverPortsJS(comp.parameters && comp.parameters.code);
      const inList = ports.inputs;
      const outList = ports.outputs;
      
      const Ni = inList.length;
      const No = outList.length;
      const spacing = 40;
      
      const halfHeight = Math.max(40, Math.round(Math.max(Ni, No) * spacing / 2) + 20);
      
      let maxInLen = 0;
      for (const p of inList) {
        if (p.length > maxInLen) maxInLen = p.length;
      }
      let maxOutLen = 0;
      for (const p of outList) {
        if (p.length > maxOutLen) maxOutLen = p.length;
      }
      const halfWidth = Math.max(50, Math.round((100 + maxInLen * 6 + maxOutLen * 6) / 2));
      
      let paths = '';
      
      // Draw input pins labels on the left
      for (let i = 0; i < Ni; i++) {
        const y = Ni > 1 ? Math.round((i - (Ni - 1) / 2) * spacing) : 0;
        paths += `
          <line class="comp-path" x1="-${halfWidth}" y1="${y}" x2="-${halfWidth - 5}" y2="${y}" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          <text x="-${halfWidth - 8}" y="${y + 3}" font-family="Inter, sans-serif" font-size="8" fill="currentColor" text-anchor="start" stroke="none" opacity="0.8">${inList[i]}</text>
        `;
        
        const mappings = comp.parameters && comp.parameters.input_mappings || {};
        const mappedProbe = mappings[inList[i]];
        if (mappedProbe) {
          const textW = Math.max(20, mappedProbe.length * 5);
          paths += `
            <g transform="translate(-${halfWidth + 8}, ${y})">
              <rect x="-${textW + 8}" y="-6" width="${textW + 6}" height="12" rx="3" fill="var(--color-bg-secondary, #020617)" stroke="#6366f1" stroke-width="1" opacity="0.9" />
              <text x="-4" y="3" font-family="JetBrains Mono, monospace" font-size="7" font-weight="700" fill="#818cf8" text-anchor="end" stroke="none">${mappedProbe}</text>
            </g>
          `;
        }
      }
      
      // Draw output pins labels on the right
      for (let j = 0; j < No; j++) {
        const y = No > 1 ? Math.round((j - (No - 1) / 2) * spacing) : 0;
        paths += `
          <line class="comp-path" x1="${halfWidth - 5}" y1="${y}" x2="${halfWidth}" y2="${y}" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          <text x="${halfWidth - 8}" y="${y + 3}" font-family="Inter, sans-serif" font-size="8" fill="currentColor" text-anchor="end" stroke="none" opacity="0.8">${outList[j]}</text>
        `;
      }
      
      // Decorative code lines inside
      paths += `
        <rect class="comp-path" x="-15" y="-15" width="30" height="30" rx="2" fill="none" stroke="currentColor" stroke-width="1.2" stroke-dasharray="2 2" opacity="0.25" />
        <g stroke="currentColor" stroke-width="1.8" stroke-linecap="round" opacity="0.5">
          <line x1="-8" y1="-5" x2="3" y2="-5" />
          <line x1="-8" y1="0" x2="8" y2="0" />
          <line x1="-8" y1="5" x2="-2" y2="5" />
        </g>
      `;
      
      // Custom shape with early return for dynamic height & width
      return `
        <rect class="comp-bounds" x="-${halfWidth + 2}" y="${-halfHeight}" width="${halfWidth * 2 + 4}" height="${halfHeight * 2}" rx="6" />
        <rect class="comp-path" x="-${halfWidth}" y="${-halfHeight}" width="${halfWidth * 2}" height="${halfHeight * 2}" rx="4" fill="none" stroke="currentColor" stroke-width="2" />
        <text x="0" y="${-halfHeight + 12}" font-family="JetBrains Mono, monospace" font-size="8" font-weight="700" fill="currentColor" text-anchor="middle" stroke="none">C++</text>
        ${paths}
        <g transform="translate(0, ${halfHeight + 14}) rotate(${-rotation})">
          <text class="comp-label" x="0" y="4" text-anchor="middle" fill="currentColor">${id}</text>
        </g>
      `;
    }
    case 'GEN_EBLOCK': {
      const n = parseInt(comp.parameters && comp.parameters.terminals) || 3;
      const spacing = 20;
      const halfHeight = Math.max(40, Math.round(n * spacing / 2) + 20);
      const halfWidth = 50;
      let paths = '';
      for (let i = 1; i <= n; i++) {
        const y = n > 1 ? Math.round((i - 1 - (n - 1) / 2) * spacing) : 0;
        const termName = getTerminalNameFromCode(comp.parameters && comp.parameters.code || "", i);
        paths += `
          <line class="comp-path" x1="-${halfWidth}" y1="${y}" x2="-${halfWidth - 5}" y2="${y}" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          <text x="-${halfWidth - 8}" y="${y + 3}" font-family="Inter, sans-serif" font-size="8" fill="currentColor" text-anchor="start" stroke="none" opacity="0.8">${termName}</text>
        `;
      }
      
      // Icon in the center: square with round edges and text "GEN BLOCK"
      paths += `
        <rect x="-22" y="-22" width="44" height="44" rx="6" class="comp-path" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity: 0.85;" />
        <text x="0" y="-4" font-family="Inter, sans-serif" font-size="8" font-weight="700" fill="currentColor" text-anchor="middle" stroke="none">GEN</text>
        <text x="0" y="8" font-family="Inter, sans-serif" font-size="8" font-weight="700" fill="currentColor" text-anchor="middle" stroke="none">BLOCK</text>
      `;
      
      return `
        <rect class="comp-bounds" x="-${halfWidth + 2}" y="${-halfHeight}" width="${halfWidth * 2 + 4}" height="${halfHeight * 2}" rx="6" />
        <rect class="comp-path" x="-${halfWidth}" y="${-halfHeight}" width="${halfWidth * 2}" height="${halfHeight * 2}" rx="4" fill="none" stroke="currentColor" stroke-width="2" />
        <text x="0" y="${-halfHeight + 12}" font-family="JetBrains Mono, monospace" font-size="8" font-weight="700" fill="currentColor" text-anchor="middle" stroke="none">GEN_EBLOCK</text>
        ${paths}
        <g transform="translate(0, ${halfHeight + 14}) rotate(${-rotation})">
          <text class="comp-label" x="0" y="4" text-anchor="middle" fill="currentColor">${id}</text>
        </g>
      `;
    }
  }
  
  return `
    <rect class="comp-bounds" x="-22" y="-42" width="44" height="84" rx="4" />
    ${shape}
    <g transform="translate(0, -28) rotate(${-rotation})">
      <text class="comp-label" x="0" y="4" text-anchor="middle" fill="currentColor">${id}</text>
    </g>
  `;
}

// Create Terminal handles overlays
export function createTerminalOverlay(compId: string, terminalName: string, cx: number, cy: number, isConnected: boolean): SVGGElement {
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('class', `terminal-handle ${isConnected ? 'connected' : ''}`);
  g.setAttribute('data-comp', compId);
  g.setAttribute('data-terminal', terminalName);
  
  // Invisible sensor circle for easier click/hover
  const sensor = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  sensor.setAttribute('cx', String(cx));
  sensor.setAttribute('cy', String(cy));
  sensor.setAttribute('r', '12');
  sensor.setAttribute('fill', 'transparent');
  sensor.setAttribute('class', 'terminal-sensor');
  
  // Visible small terminal dot
  const visual = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  visual.setAttribute('cx', String(cx));
  visual.setAttribute('cy', String(cy));
  
  // Decide terminal visual radius based on connection, selection and wire-routing state
  const isSelected = state.selectedComponentIds.includes(compId);
  const isDrawing = state.activeWire !== null;
  const radius = (isConnected && !isSelected && !isDrawing) ? '1.5' : '4.5';
  visual.setAttribute('r', radius);
  
  visual.setAttribute('class', 'terminal-visual');
  
  g.appendChild(sensor);
  g.appendChild(visual);
  
  // Wire drawing start logic
  g.addEventListener('pointerdown', (e: any) => {
    if (state.appletMode === 'student') return;
    e.stopPropagation();
    const comp = state.components.find((c: any) => c.id === compId);
    if (!comp) return;
    
    if (!state.activeWire) {
      const p1 = getTerminalCoords(comp, terminalName);
      state.activeWire = {
        from: { type: 'pin', compId, terminal: terminalName },
        target: p1,
        isDragMode: true
      };
    } else {
      completeWire({ type: 'pin', compId, terminal: terminalName });
    }
    draw();
  });
  
  // Wire drawing complete via dragging release
  g.addEventListener('pointerup', (e: any) => {
    if (state.appletMode === 'student') return;
    e.stopPropagation();
    if (state.activeWire && state.activeWire.isDragMode) {
      if (state.activeWire.from.type !== 'pin' || state.activeWire.from.compId !== compId || state.activeWire.from.terminal !== terminalName) {
        completeWire({ type: 'pin', compId, terminal: terminalName });
      } else {
        // Releasing on same pin switches it to click-to-connect mode
        state.activeWire.isDragMode = false;
      }
    }
  });
  
  return g;
}
