import { state, saveState } from './state';
import { draw } from './renderer';
import { showToast, generateNextId, parseScientific } from './utils';
import { 
  getWireEndpointCoords, 
  getWireEndpointDir, 
  getWirePath, 
  getWireDomain, 
  getPinDomain,
  getComponentBounds,
  getEndpointDomain
} from './routing';
import { parseTurnsList, discoverPortsJS, DEFAULT_PARAMETERS, EXPORT_TYPE_NAMES, getComponentPins, discoverParamsFromCode } from './config';
import { updatePropertiesPanel } from './properties';
import { DETAILED_COMPONENTS, getDetailedComponentPins } from './detailedLibrary';

export function getControlOutputPins(comp: any): string[] {
  if (!comp) return [];
  const type = comp.type;
  
  if (type === 'CSCRIPT') {
    const code = comp.parameters?.code || '';
    return discoverPortsJS(code).outputs;
  }
  
  if (type === 'CLARKE') {
    return ['Alpha', 'Beta'];
  }
  if (type === 'PARK') {
    return ['d', 'q'];
  }
  if (type === 'INV_CLARKE') {
    return ['A', 'B', 'C'];
  }
  if (type === 'INV_PARK') {
    return ['Alpha', 'Beta'];
  }
  if (type === 'PROBE') {
    const pinsMap = getComponentPins(comp);
    return Object.keys(pinsMap);
  }
  
  const pinsMap = getComponentPins(comp);
  return Object.keys(pinsMap).filter(pinName => pinName.startsWith('Out'));
}

export function isControlOutputPin(compId: string, pinName: string): boolean {
  const comp = state.components.find((c: any) => c.id === compId);
  if (!comp) return false;
  if (getPinDomain(comp.type, pinName, comp) !== 'control') return false;
  
  const outputs = getControlOutputPins(comp);
  return outputs.includes(pinName);
}

export function isControlInputPin(compId: string, pinName: string): boolean {
  const comp = state.components.find((c: any) => c.id === compId);
  if (!comp) return false;
  if (getPinDomain(comp.type, pinName, comp) !== 'control') return false;
  
  const outputs = getControlOutputPins(comp);
  return !outputs.includes(pinName);
}

export function getConnectedControlPinsAndWires(startEp: any): { pins: Set<string>; wires: Set<string> } {
  const visitedPins = new Set<string>();
  const visitedWires = new Set<string>();
  
  const queue: any[] = [];
  
  if (startEp.type === 'pin') {
    queue.push({ type: 'pin', compId: startEp.compId, terminal: startEp.terminal });
  } else if (startEp.type === 'wire') {
    queue.push({ type: 'wire', wireId: startEp.wireId });
  }
  
  while (queue.length > 0) {
    const curr = queue.shift();
    if (!curr) continue;
    
    if (curr.type === 'pin') {
      const pinKey = `${curr.compId}.${curr.terminal}`;
      if (visitedPins.has(pinKey)) continue;
      visitedPins.add(pinKey);
      
      state.wires.forEach((w: any) => {
        if (getWireDomain(w) !== 'control') return;
        
        if (w.from.type === 'pin' && w.from.compId === curr.compId && w.from.terminal === curr.terminal) {
          queue.push({ type: 'wire', wireId: w.id });
        }
        if (w.to && w.to.type === 'pin' && w.to.compId === curr.compId && w.to.terminal === curr.terminal) {
          queue.push({ type: 'wire', wireId: w.id });
        }
      });
    } else if (curr.type === 'wire') {
      if (visitedWires.has(curr.wireId)) continue;
      visitedWires.add(curr.wireId);
      
      const wire = state.wires.find((w: any) => w.id === curr.wireId);
      if (!wire) continue;
      
      if (wire.from.type === 'pin') {
        queue.push({ type: 'pin', compId: wire.from.compId, terminal: wire.from.terminal });
      } else if (wire.from.type === 'wire') {
        queue.push({ type: 'wire', wireId: wire.from.wireId });
      }
      
      if (wire.to) {
        if (wire.to.type === 'pin') {
          queue.push({ type: 'pin', compId: wire.to.compId, terminal: wire.to.terminal });
        } else if (wire.to.type === 'wire') {
          queue.push({ type: 'wire', wireId: wire.to.wireId });
        }
      }
      
      state.wires.forEach((w: any) => {
        if (getWireDomain(w) !== 'control') return;
        
        if (w.from.type === 'wire' && w.from.wireId === curr.wireId) {
          queue.push({ type: 'wire', wireId: w.id });
        }
        if (w.to && w.to.type === 'wire' && w.to.wireId === curr.wireId) {
          queue.push({ type: 'wire', wireId: w.id });
        }
      });
    }
  }
  
  return { pins: visitedPins, wires: visitedWires };
}

export function normalizeControlWires(): void {
  const controlSources: string[] = [];
  state.components.forEach((comp: any) => {
    const outputs = getControlOutputPins(comp);
    outputs.forEach(pin => {
      controlSources.push(`${comp.id}.${pin}`);
    });
  });
  
  controlSources.forEach(sourcePinKey => {
    const [sourceCompId, sourceTerminal] = sourcePinKey.split('.');
    
    const queue: any[] = [];
    const visited = new Set<string>();
    
    queue.push({ type: 'pin', compId: sourceCompId, terminal: sourceTerminal, parent: null });
    
    while (queue.length > 0) {
      const curr = queue.shift();
      if (!curr) continue;
      
      const currKey = curr.type === 'pin' ? `pin:${curr.compId}.${curr.terminal}` : `wire:${curr.wireId}`;
      if (visited.has(currKey)) continue;
      visited.add(currKey);
      
      if (curr.type === 'pin') {
        state.wires.forEach((w: any) => {
          if (getWireDomain(w) !== 'control') return;
          
          const isFrom = w.from.type === 'pin' && w.from.compId === curr.compId && w.from.terminal === curr.terminal;
          const isTo = w.to && w.to.type === 'pin' && w.to.compId === curr.compId && w.to.terminal === curr.terminal;
          
          if (isFrom || isTo) {
            queue.push({
              type: 'wire',
              wireId: w.id,
              reachedFrom: { type: 'pin', compId: curr.compId, terminal: curr.terminal }
            });
          }
        });
      } else if (curr.type === 'wire') {
        const wire = state.wires.find((w: any) => w.id === curr.wireId);
        if (!wire) continue;
        
        const nearSide = curr.reachedFrom;
        let isOrientedCorrectly = false;
        
        if (nearSide.type === 'pin') {
          if (wire.from.type === 'pin' && wire.from.compId === nearSide.compId && wire.from.terminal === nearSide.terminal) {
            isOrientedCorrectly = true;
          }
        } else if (nearSide.type === 'wire') {
          if (wire.from.type === 'wire' && wire.from.wireId === nearSide.wireId) {
            isOrientedCorrectly = true;
          }
        }
        
        if (!isOrientedCorrectly) {
          const temp = wire.from;
          wire.from = wire.to;
          wire.to = temp;
          if (wire.manualPath) {
            wire.manualPath.reverse();
          }
        }
        
        if (wire.to) {
          if (wire.to.type === 'pin') {
            queue.push({
              type: 'pin',
              compId: wire.to.compId,
              terminal: wire.to.terminal,
              reachedFrom: { type: 'wire', wireId: wire.id }
            });
          } else if (wire.to.type === 'wire') {
            queue.push({
              type: 'wire',
              wireId: wire.to.wireId,
              reachedFrom: { type: 'wire', wireId: wire.id }
            });
          }
        }
        
        state.wires.forEach((w: any) => {
          if (w.id === wire.id) return;
          if (getWireDomain(w) !== 'control') return;
          
          const isFrom = w.from.type === 'wire' && w.from.wireId === wire.id;
          const isTo = w.to && w.to.type === 'wire' && w.to.wireId === wire.id;
          
          if (isFrom || isTo) {
            queue.push({
              type: 'wire',
              wireId: w.id,
              reachedFrom: { type: 'wire', wireId: wire.id }
            });
          }
        });
      }
    }
  });
}

// Complete drawing of current active wire onto target endpoint
export function completeWire(targetEndpoint: any): void {
  if (!state.activeWire) return;
  
  const fromEp = state.activeWire.from;
  const toEp = targetEndpoint;
  
  // Prevent self loop connection
  if (fromEp.type === 'pin' && toEp.type === 'pin' && fromEp.compId === toEp.compId && fromEp.terminal === toEp.terminal) {
    state.activeWire = null;
    return;
  }
  
  // 1. Domain verification
  const domainFrom = getEndpointDomain(fromEp);
  const domainTo = getEndpointDomain(toEp);
  
  if (domainFrom !== domainTo) {
    showToast(`Error: Cannot connect ${domainFrom} signals to ${domainTo} wires!`);
    state.activeWire = null;
    draw();
    return;
  }
  
  // 2. Control Net outport conflicts check
  if (domainFrom === 'control') {
    const netFrom = getConnectedControlPinsAndWires(fromEp);
    const netTo = getConnectedControlPinsAndWires(toEp);
    
    const outputPins = new Set<string>();
    
    netFrom.pins.forEach(pinKey => {
      const [cId, pinName] = pinKey.split('.');
      if (isControlOutputPin(cId, pinName)) {
        outputPins.add(pinKey);
      }
    });
    
    netTo.pins.forEach(pinKey => {
      const [cId, pinName] = pinKey.split('.');
      if (isControlOutputPin(cId, pinName)) {
        outputPins.add(pinKey);
      }
    });
    
    // Check direct endpoints
    if (fromEp.type === 'pin' && isControlOutputPin(fromEp.compId, fromEp.terminal)) {
      outputPins.add(`${fromEp.compId}.${fromEp.terminal}`);
    }
    if (toEp.type === 'pin' && isControlOutputPin(toEp.compId, toEp.terminal)) {
      outputPins.add(`${toEp.compId}.${toEp.terminal}`);
    }
    
    if (outputPins.size > 1) {
      showToast("Error: Cannot connect multiple signal outports together!");
      state.activeWire = null;
      draw();
      return;
    }
  }
  
  saveState();
  
  // Push finalized wire
  state.wires.push({
    id: generateNextId('W'),
    from: fromEp,
    to: toEp,
    manualPath: null
  });
  
  // 3. Normalize directions for control domain
  if (domainFrom === 'control') {
    normalizeControlWires();
  }
  
  state.activeWire = null;
  showToast('Wire path completed.');
}

// Undo previous action
export function undo(): void {
  if (state.undoStack.length === 0) return;
  const prev = state.undoStack.pop();
  try {
    const parsed = JSON.parse(prev);
    state.components = parsed.components || [];
    state.wires = parsed.wires || [];
    if (parsed.plotConfiguration) state.plotConfiguration = parsed.plotConfiguration;
    if (parsed.simulationSettings) state.simulationSettings = parsed.simulationSettings;
    
    state.selectedComponentIds = [];
    state.selectedWireIds = [];
    state.activeWire = null;
    
    draw();
    updatePropertiesPanel();
    showToast('Undo successful.');
  } catch (err) {
    showToast('Failed to undo.');
  }
}

// Copy Selected elements to Clipboard
export function copySelected(): void {
  if (state.selectedComponentIds.length === 0) {
    showToast('Nothing selected to copy.');
    return;
  }
  
  const compMap: Record<string, any> = {};
  const copiedComps = state.selectedComponentIds.map((id: string) => {
    const c = state.components.find((x: any) => x.id === id);
    compMap[id] = true;
    return JSON.parse(JSON.stringify(c));
  });
  
  // Copy wires connected exclusively between selected components
  const copiedWires: any[] = [];
  state.wires.forEach((wire: any) => {
    let fromConnectsSelected = false;
    let toConnectsSelected = false;
    
    if (wire.from.type === 'pin' && compMap[wire.from.compId]) fromConnectsSelected = true;
    if (wire.to && wire.to.type === 'pin' && compMap[wire.to.compId]) toConnectsSelected = true;
    
    if (fromConnectsSelected && toConnectsSelected) {
      copiedWires.push(JSON.parse(JSON.stringify(wire)));
    }
  });
  
  state.copypasteClipboard = {
    components: copiedComps,
    wires: copiedWires
  };
  showToast(`Copied ${copiedComps.length} components.`);
}

// Paste Elements from Clipboard
export function pasteSelected(): void {
  if (!state.copypasteClipboard) {
    showToast('Clipboard empty.');
    return;
  }
  
  saveState();
  const clipboard = JSON.parse(JSON.stringify(state.copypasteClipboard));
  const idMap: Record<string, string> = {};
  const newComps: any[] = [];
  
  // Insert duplicated components with offset mapping
  clipboard.components.forEach((c: any) => {
    const oldId = c.id;
    const newId = generateNextId(c.type, newComps.map(x => x.id));
    idMap[oldId] = newId;
    
    c.id = newId;
    c.x += 60; // Paste displacement offset
    c.y += 60;
    
    state.components.push(c);
    newComps.push(c);
  });
  
  // Insert duplicated wires with re-mapped terminals
  clipboard.wires.forEach((w: any) => {
    w.id = generateNextId('W', state.wires.map((x: any) => x.id));
    
    if (w.from.type === 'pin') {
      w.from.compId = idMap[w.from.compId];
    }
    if (w.to && w.to.type === 'pin') {
      w.to.compId = idMap[w.to.compId];
    }
    
    if (w.manualPath) {
      w.manualPath.forEach((pt: any) => {
        pt.x += 60;
        pt.y += 60;
      });
    }
    
    state.wires.push(w);
  });
  
  state.selectedComponentIds = newComps.map((c: any) => c.id);
  state.selectedWireIds = [];
  draw();
  updatePropertiesPanel();
  showToast(`Pasted ${newComps.length} components.`);
}

// Rotate Selected Components
export function rotateSelected(): void {
  if (state.selectedComponentIds.length === 0) return;
  saveState();
  
  state.selectedComponentIds.forEach((id: string) => {
    const comp = state.components.find((c: any) => c.id === id);
    if (comp) {
      comp.rotation = (comp.rotation + 90) % 360;
    }
  });
  
  draw();
  showToast('Rotated selection 90°.');
}

// Delete Selected components and connected wires
export function deleteSelected(): void {
  if (state.selectedComponentIds.length === 0 && state.selectedWireIds.length === 0) return;
  saveState();
  
  const originalCompsCount = state.components.length;
  const originalWiresCount = state.wires.length;
  
  if (state.selectedComponentIds.length > 0) {
    const toDelete = new Set(state.selectedComponentIds);
    state.components = state.components.filter((c: any) => !toDelete.has(c.id));
    
    // Prune connected dangling wires
    state.wires = state.wires.filter((w: any) => {
      if (w.from.type === 'pin' && toDelete.has(w.from.compId)) return false;
      if (w.to && w.to.type === 'pin' && toDelete.has(w.to.compId)) return false;
      return true;
    });
    
    state.selectedComponentIds = [];
  }
  
  if (state.selectedWireIds.length > 0) {
    const toDeleteWires = new Set(state.selectedWireIds);
    state.wires = state.wires.filter((w: any) => !toDeleteWires.has(w.id));
    
    // Prune joint-point dependencies
    state.wires = state.wires.filter((w: any) => {
      if (w.from.type === 'wire' && toDeleteWires.has(w.from.wireId)) return false;
      if (w.to && w.to.type === 'wire' && toDeleteWires.has(w.to.wireId)) return false;
      return true;
    });
    
    state.selectedWireIds = [];
  }
  
  draw();
  updatePropertiesPanel();
  showToast('Deleted items.');
}

// Clear Workspace Canvas completely
export function clearWorkspace(): void {
  if (state.components.length === 0 && state.wires.length === 0) return;
  if (!confirm('Are you sure you want to clear the canvas?')) return;
  
  saveState();
  state.components = [];
  state.wires = [];
  state.selectedComponentIds = [];
  state.selectedWireIds = [];
  state.activeWire = null;
  
  draw();
  updatePropertiesPanel();
  showToast('Workspace cleared.');
}

// Export raw JSON visualization model
export function exportJSON(): string {
  const payload = {
    components: state.components,
    wires: state.wires,
    plotConfiguration: state.plotConfiguration,
    simulationSettings: state.simulationSettings
  };
  return JSON.stringify(payload, null, 2);
}

// Import raw JSON layouts model
export function triggerImport(jsonStr: string): void {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed) return;
    
    saveState();
    state.components = parsed.components || [];
    state.wires = parsed.wires || [];
    if (parsed.plotConfiguration) state.plotConfiguration = parsed.plotConfiguration;
    if (parsed.simulationSettings) state.simulationSettings = parsed.simulationSettings;
    
    state.selectedComponentIds = [];
    state.selectedWireIds = [];
    state.activeWire = null;
    
    // Normalize directions for control domain
    normalizeControlWires();
    
    // Auto center canvas viewport around imported content
    centerViewportOnContents();
    draw();
    updatePropertiesPanel();
    showToast('Import successful.');
  } catch (err) {
    showToast('Failed to parse JSON file.');
  }
}

function centerViewportOnContents() {
  if (state.components.length === 0) return;
  
  let xSum = 0;
  let ySum = 0;
  state.components.forEach((c: any) => {
    xSum += c.x;
    ySum += c.y;
  });
  
  const svg = document.getElementById('canvas-svg');
  if (svg) {
    const rect = svg.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    
    const ax = xSum / state.components.length;
    const ay = ySum / state.components.length;
    
    state.zoom = 1.0;
    state.panX = cx - ax;
    state.panY = cy - ay;
  }
}

// Union-Find / Disjoint-Set Data Structure for electrical net extraction
class UnionFind {
  parent: Record<string, string> = {};
  
  find(i: string): string {
    if (!this.parent[i]) {
      this.parent[i] = i;
      return i;
    }
    let root = i;
    while (this.parent[root] !== root) {
      root = this.parent[root];
    }
    // Path compression
    let curr = i;
    while (curr !== root) {
      let nxt = this.parent[curr];
      this.parent[curr] = root;
      curr = nxt;
    }
    return root;
  }
  
  union(i: string, j: string): void {
    const rootI = this.find(i);
    const rootJ = this.find(j);
    if (rootI !== rootJ) {
      this.parent[rootI] = rootJ;
    }
  }
}

const getTapPointsOnWire = (wireId: string, wires: any[]) => {
  const points: { x: number; y: number }[] = [];
  wires.forEach(w => {
    if (w.from && w.from.type === 'wire' && w.from.wireId === wireId) {
      points.push({ x: w.from.x, y: w.from.y });
    }
    if (w.to && w.to.type === 'wire' && w.to.wireId === wireId) {
      points.push({ x: w.to.x, y: w.to.y });
    }
  });
  return points;
};

const insertTapPointsAndSplit = (path: { x: number; y: number }[], taps: { x: number; y: number }[]): { x: number; y: number }[][] => {
  let augmented = [...path];
  
  for (const tap of taps) {
    let alreadyExists = false;
    for (const p of augmented) {
      if (Math.hypot(p.x - tap.x, p.y - tap.y) < 3) {
        alreadyExists = true;
        break;
      }
    }
    if (alreadyExists) continue;
    
    for (let i = 0; i < augmented.length - 1; i++) {
      const p1 = augmented[i];
      const p2 = augmented[i + 1];
      
      const minX = Math.min(p1.x, p2.x);
      const maxX = Math.max(p1.x, p2.x);
      const minY = Math.min(p1.y, p2.y);
      const maxY = Math.max(p1.y, p2.y);
      
      const isCollinear = Math.abs((p2.y - p1.y) * (tap.x - p1.x) - (p2.x - p1.x) * (tap.y - p1.y)) < 10;
      if (isCollinear && tap.x >= minX - 2 && tap.x <= maxX + 2 && tap.y >= minY - 2 && tap.y <= maxY + 2) {
        augmented.splice(i + 1, 0, tap);
        break;
      }
    }
  }
  
  const subPaths: { x: number; y: number }[][] = [];
  let currentSubPath: { x: number; y: number }[] = [augmented[0]];
  
  for (let i = 1; i < augmented.length; i++) {
    const p = augmented[i];
    currentSubPath.push(p);
    
    const isTap = taps.some(t => Math.hypot(t.x - p.x, t.y - p.y) < 3);
    if (isTap) {
      subPaths.push(currentSubPath);
      currentSubPath = [p];
    }
  }
  if (currentSubPath.length > 1) {
    subPaths.push(currentSubPath);
  }
  
  return subPaths;
};

// CRITICAL EXPORTER: Converts the schematic spatial representation into structured Dual-Graph simulation Netlist
export function exportDualGraphJSON(fastMode: boolean = false): any {
  // Commit current sub-schematic edits to parent/root
  commitCurrentSchematicState();

  // Get root schematic
  const root = getRootSchematic();

  // Compile / flatten the hierarchical netlist
  const flat = compileHierarchicalNetlist(root.components, root.wires);

  // Swap state components/wires with flat ones temporarily
  const originalComponents = state.components;
  const originalWires = state.wires;
  state.components = flat.components;
  state.wires = flat.wires;

  try {
    // 0. GOTO and FROM blocks matching tag labels validation
    const fromBlocks = state.components.filter((c: any) => c.type === 'FROM_SIG');
    const gotoBlocks = state.components.filter((c: any) => c.type === 'GOTO_SIG');

    for (const fromComp of fromBlocks) {
      const fromTag = String(fromComp.parameters?.tag || 'A').trim().toLowerCase();
      const hasMatchingGoto = gotoBlocks.some((c: any) => String(c.parameters?.tag || 'A').trim().toLowerCase() === fromTag);
      if (!hasMatchingGoto) {
        throw new Error(`Signal From block has no matching Signal Goto block with the same tag label "${String(fromComp.parameters?.tag || 'A').trim()}".`);
      }
    }

    const uf = new UnionFind();
  
  // 1. Map all physical power-stage component pins to unique strings
  const physicalComponents = state.components.filter((c: any) => {
    const isBasicPhys = ['R', 'L', 'C', 'S', 'D', 'MOSFET', 'V', 'I', 'AC_V', 'XFMR', 'VM', 'AM'].includes(c.type);
    const isDetailedPhys = DETAILED_COMPONENTS.some(dc => dc.type === c.type && dc.category === 'electrical');
    return isBasicPhys || isDetailedPhys;
  });
  
  physicalComponents.forEach((comp: any) => {
    const pinMap = getComponentPins(comp);
    Object.keys(pinMap).forEach(term => {
      // Check if this terminal is control-loop domain
      if (getPinDomain(comp.type, term, comp) === 'control') return;
      
      const pinKey = `${comp.id}.${term}`;
      uf.find(pinKey); // Initializes node
    });
  });

  // 1.5. Map all GND component pins to unique strings in Union-Find
  state.components.filter((c: any) => c.type === 'GND').forEach((comp: any) => {
    uf.find(`${comp.id}.Gnd`);
  });
  
  // Union all E_LABEL pins with matching tag names
  const eLabels = state.components.filter((c: any) => c.type === 'E_LABEL');
  const labelsByName: Record<string, string[]> = {};
  eLabels.forEach((comp: any) => {
    const tagName = (comp.parameters?.label || 'A').trim();
    if (!labelsByName[tagName]) labelsByName[tagName] = [];
    labelsByName[tagName].push(comp.id);
  });
  
  Object.keys(labelsByName).forEach(name => {
    const ids = labelsByName[name];
    if (ids.length > 1) {
      const firstPinA = `${ids[0]}.A`;
      for (let i = 1; i < ids.length; i++) {
        uf.union(firstPinA, `${ids[i]}.A`);
      }
    }
  });
  
  // Union terminal A and B for label/port feedthrough transparency
  // (no longer needed as labels have only one terminal A)
  // eLabels.forEach((comp: any) => {
  //   uf.union(`${comp.id}.A`, `${comp.id}.B`);
  // });
  
  state.components.filter((c: any) => c.type === 'E_PORT').forEach((comp: any) => {
    const parts = comp.id.split('.');
    if (parts.length > 1) {
      const portName = parts.pop()!;
      const parentSubsysId = parts.join('.');
      uf.union(`${parentSubsysId}.${portName}`, `${comp.id}.A`);
    }
  });

  // Union LINE_3PH phases to simulate them as wire segments
  state.components.filter((c: any) => c.type === 'LINE_3PH').forEach((comp: any) => {
    uf.union(`${comp.id}.A`, `${comp.id}.a`);
    uf.union(`${comp.id}.B`, `${comp.id}.b`);
    uf.union(`${comp.id}.C`, `${comp.id}.c`);
  });
  
  // 2. Disjoint Union-Find wire paths routing to connect endpoints
  const electricalWires = state.wires.filter((w: any) => getWireDomain(w) === 'electrical');
  
  const wireSegments: Record<string, {
    segmentId: string;
    path: { x: number; y: number }[];
    fromKey: string;
    toKey: string;
  }[]> = {};

  if (fastMode) {
    electricalWires.forEach((wire: any) => {
      // Union wire ID with from endpoint
      if (wire.from.type === 'pin') {
        const pinKey = `${wire.from.compId}.${wire.from.terminal}`;
        uf.union(wire.id, pinKey);
      } else if (wire.from.type === 'wire') {
        uf.union(wire.id, wire.from.wireId);
      }
      
      // Union wire ID with to endpoint
      if (wire.to) {
        if (wire.to.type === 'pin') {
          const pinKey = `${wire.to.compId}.${wire.to.terminal}`;
          uf.union(wire.id, pinKey);
        } else if (wire.to.type === 'wire') {
          uf.union(wire.id, wire.to.wireId);
        }
      }
    });
  } else {
    // Phase A: Split tapped wires into discrete sub-segments
    electricalWires.forEach((wire: any) => {
      const origPath = getWirePath(wire);
      const taps = getTapPointsOnWire(wire.id, electricalWires);
      
      const pStartCoords = getWireEndpointCoords(wire.from);
      const pEndCoords = getWireEndpointCoords(wire.to);
      const filteredTaps = taps.filter(t => 
        Math.hypot(t.x - pStartCoords.x, t.y - pStartCoords.y) > 5 &&
        Math.hypot(t.x - pEndCoords.x, t.y - pEndCoords.y) > 5
      );

      const subPaths = insertTapPointsAndSplit(origPath, filteredTaps);
      const segs = subPaths.map((subPath, j) => {
        const segmentId = `${wire.id}_seg${j}`;
        const fromKey = (j === 0) ? `W_from_${wire.id}` : `W_junc_${Math.round(subPath[0].x)}_${Math.round(subPath[0].y)}`;
        const toKey = (j === subPaths.length - 1) ? `W_to_${wire.id}` : `W_junc_${Math.round(subPath[subPath.length - 1].x)}_${Math.round(subPath[subPath.length - 1].y)}`;
        return { segmentId, path: subPath, fromKey, toKey };
      });
      wireSegments[wire.id] = segs;
    });

    // Phase B: Disjoint Union-Find using Segment endpoints
    const endpointCoords: Record<string, { x: number; y: number }> = {};
    electricalWires.forEach((wire: any) => {
      const pStartKey = `W_from_${wire.id}`;
      const pEndKey = `W_to_${wire.id}`;
      
      const pStartCoords = getWireEndpointCoords(wire.from);
      const pEndCoords = getWireEndpointCoords(wire.to);
      
      endpointCoords[pStartKey] = pStartCoords;
      endpointCoords[pEndKey] = pEndCoords;
      
      uf.find(pStartKey);
      uf.find(pEndKey);

      const segs = wireSegments[wire.id] || [];
      segs.forEach(seg => {
        endpointCoords[seg.fromKey] = seg.path[0];
        endpointCoords[seg.toKey] = seg.path[seg.path.length - 1];
        uf.find(seg.fromKey);
        uf.find(seg.toKey);
      });
      
      if (wire.from.type === 'pin') {
        const pinKey = `${wire.from.compId}.${wire.from.terminal}`;
        uf.union(pStartKey, pinKey);
      } else if (wire.from.type === 'wire') {
        const juncKey = `W_junc_${Math.round(pStartCoords.x)}_${Math.round(pStartCoords.y)}`;
        uf.union(pStartKey, juncKey);
      }

      if (wire.to && wire.to.type === 'pin') {
        const pinKey = `${wire.to.compId}.${wire.to.terminal}`;
        uf.union(pEndKey, pinKey);
      } else if (wire.to && wire.to.type === 'wire') {
        const juncKey = `W_junc_${Math.round(pEndCoords.x)}_${Math.round(pEndCoords.y)}`;
        uf.union(pEndKey, juncKey);
      }
    });
  }
  
  // 3. Resolve Node grouping indices mapping
  const partitions: Record<string, string[]> = {};
  Object.keys(uf.parent).forEach(key => {
    if (fastMode) {
      // Group only component pins, skip wire ID key strings
      if (key.includes('.')) {
        const root = uf.find(key);
        if (!partitions[root]) partitions[root] = [];
        partitions[root].push(key);
      }
    } else {
      // Group component pins AND segment keys
      if (key.includes('.') || key.startsWith('W_from_') || key.startsWith('W_to_') || key.startsWith('W_junc_')) {
        const root = uf.find(key);
        if (!partitions[root]) partitions[root] = [];
        partitions[root].push(key);
      }
    }
  });
  
  // 4. Default ground discovery: Ground defaults to GND components, VM negative terminal, AM terminal, or a common low node
  const groundRoots = new Set<string>();
  
  // Search if ground (GND) components are present to lock node_0 onto the ground node
  const gnds = state.components.filter((c: any) => c.type === 'GND');
  gnds.forEach((comp: any) => {
    const pinKey = `${comp.id}.Gnd`;
    if (uf.parent[pinKey]) {
      groundRoots.add(uf.find(pinKey));
    }
  });

  // Fallback to negative terminal of first voltage source if no GND component exists
  if (groundRoots.size === 0) {
    const vsources = state.components.filter((c: any) => ['V', 'AC_V'].includes(c.type));
    if (vsources.length > 0) {
      const firstV = vsources[0];
      const negPinKey = `${firstV.id}.B`;
      if (uf.parent[negPinKey]) {
        groundRoots.add(uf.find(negPinKey));
      }
    }
  }
  
  // Map partitions roots to node indexes
  const rootToNodeIndex: Record<string, string> = {};
  let nodeCount = 1;
  
  Object.keys(partitions).forEach(root => {
    if (groundRoots.has(root)) {
      rootToNodeIndex[root] = "node_0";
    } else {
      rootToNodeIndex[root] = `node_${nodeCount++}`;
    }
  });
  
  // Ensure "node_0" is allocated even if no groundRoot exists
  const hasNode0 = Object.values(rootToNodeIndex).includes("node_0");
  if (!hasNode0) {
    const roots = Object.keys(partitions);
    if (roots.length > 0) {
      rootToNodeIndex[roots[0]] = "node_0";
    }
  }
  
  // Build component pin maps binding
  const pinToNodeMap: Record<string, string> = {};
  Object.keys(partitions).forEach(root => {
    const nodeName = rootToNodeIndex[root];
    partitions[root].forEach(pin => {
      pinToNodeMap[pin] = nodeName;
    });
  });
  
  // Helper to safely resolve nodes indices for components mapping
  const resolveNodes = (id: string, count: number, labels: string[]): string[] => {
    const nodes: string[] = [];
    for (let i = 0; i < count; i++) {
      const pinKey = `${id}.${labels[i]}`;
      nodes.push(pinToNodeMap[pinKey] || "node_0");
    }
    return nodes;
  };
  
  // Core structured netlist payloads
  const physical_stage: any = {
    resistors: [],
    inductors: [],
    capacitors: [],
    voltage_sources: [],
    current_sources: [],
    switches: [],
    diodes: [],
    analog_switches: [], // e.g. MOSFETs
    transformers: [],
    voltmeters: [],
    ammeters: [],
    custom_eblocks: []
  };
  
  const control_loops: any = {
    constants: [],
    gains: [],
    pi_controllers: [],
    pid_controllers: [],
    summing_junctions: [],
    pwm_generators: [],
    triangle_carriers: [],
    comparators: [],
    logic_gates: [],
    product_blocks: [],
    custom_functions: [],
    custom_scripts: [],
    signals_routing: [],
    plls: [],
    probes: []
  };
  
  // Parse parameters fields cleanly
  const paramsVals = (comp: any): Record<string, any> => {
    const res: Record<string, any> = {};
    if (comp.parameters) {
      Object.keys(comp.parameters).forEach(k => {
        if (k === 'code') return;
        const val = comp.parameters[k];
        if (typeof val === 'string') {
          const trimmed = val.trim();
          const isNumeric = /^[+-]?\d*\.?\d+(?:[eE][+-]?\d+)?\s*[pnuumkMG]?$/.test(trimmed) || trimmed === '0';
          if (isNumeric) {
            res[k] = parseScientific(val);
          } else {
            res[k] = val;
          }
        } else {
          res[k] = val;
        }
      });
    }
    return res;
  };
  
  // 5. Populate Physical Components Stage
  state.components.forEach((comp: any) => {
    const p = paramsVals(comp);
    
    switch (comp.type) {
      case 'R':
      case 'PWL_R':
      case 'E_ALGEBRAIC':
        physical_stage.resistors.push({
          id: comp.id,
          nodes: resolveNodes(comp.id, 2, ['A', 'B']),
          value: p.value || 10.0,
          esr: p.esr || 0.0,
          src_type: 'static'
        });
        break;
      case 'VAR_R':
        physical_stage.resistors.push({
          id: comp.id,
          nodes: resolveNodes(comp.id, 2, ['A', 'B']),
          value: p.value || 10.0,
          esr: p.esr || 0.0,
          control_signal: getIncomingControlTerminal(comp.id, 'Ctrl'),
          src_type: 'variable'
        });
        break;
      case 'L':
      case 'VAR_L':
      case 'SAT_L':
        physical_stage.inductors.push({
          id: comp.id,
          nodes: resolveNodes(comp.id, 2, ['A', 'B']),
          L: p.L || 0.01,
          esr: p.esr || 0.0,
          iL0: p.iL0 || 0.0
        });
        break;
      case 'C':
      case 'VAR_C':
      case 'SAT_C':
        physical_stage.capacitors.push({
          id: comp.id,
          nodes: resolveNodes(comp.id, 2, ['A', 'B']),
          C: p.C || 1e-4,
          esr: p.esr || 0.0,
          vC0: p.vC0 || 0.0
        });
        break;
      case 'V':
        physical_stage.voltage_sources.push({
          id: comp.id,
          nodes: resolveNodes(comp.id, 2, ['A', 'B']),
          value: p.value !== undefined ? p.value : 24.0,
          src_type: 'dc'
        });
        break;
      case 'CTRL_V':
        physical_stage.voltage_sources.push({
          id: comp.id,
          nodes: resolveNodes(comp.id, 2, ['A', 'B']),
          value: p.value !== undefined ? p.value : 1.0,
          control_signal: getIncomingControlTerminal(comp.id, 'Ctrl'),
          src_type: 'controlled'
        });
        break;
      case 'AC_V':
        physical_stage.voltage_sources.push({
          id: comp.id,
          nodes: resolveNodes(comp.id, 2, ['A', 'B']),
          amplitude: p.amplitude || 12.0,
          frequency: p.frequency || 50.0,
          phase: p.phase || 0.0,
          type: 'ac'
        });
        break;
      case 'V_3PH': {
        const connection = (comp.parameters?.connection || 'Y').trim();
        const amp = p.amplitude || 24.0;
        const freq = p.frequency || 50.0;
        const phase = p.phase || 0.0;
        
        const nodeA = pinToNodeMap[`${comp.id}.A`] || "node_0";
        const nodeB = pinToNodeMap[`${comp.id}.B`] || "node_0";
        const nodeC = pinToNodeMap[`${comp.id}.C`] || "node_0";
        
        if (connection === 'Delta') {
          physical_stage.voltage_sources.push({
            id: `${comp.id}_AB`,
            nodes: [nodeA, nodeB],
            amplitude: amp,
            frequency: freq,
            phase: phase,
            type: 'ac'
          });
          physical_stage.voltage_sources.push({
            id: `${comp.id}_BC`,
            nodes: [nodeB, nodeC],
            amplitude: amp,
            frequency: freq,
            phase: phase - 120.0,
            type: 'ac'
          });
          physical_stage.voltage_sources.push({
            id: `${comp.id}_CA`,
            nodes: [nodeC, nodeA],
            amplitude: amp,
            frequency: freq,
            phase: phase + 120.0,
            type: 'ac'
          });
        } else {
          const neutralNode = `${comp.id}_N`;
          physical_stage.voltage_sources.push({
            id: `${comp.id}_A`,
            nodes: [nodeA, neutralNode],
            amplitude: amp,
            frequency: freq,
            phase: phase,
            type: 'ac'
          });
          physical_stage.voltage_sources.push({
            id: `${comp.id}_B`,
            nodes: [nodeB, neutralNode],
            amplitude: amp,
            frequency: freq,
            phase: phase - 120.0,
            type: 'ac'
          });
          physical_stage.voltage_sources.push({
            id: `${comp.id}_C`,
            nodes: [nodeC, neutralNode],
            amplitude: amp,
            frequency: freq,
            phase: phase + 120.0,
            type: 'ac'
          });
        }
        break;
      }
      case 'I':
        physical_stage.current_sources.push({
          id: comp.id,
          nodes: resolveNodes(comp.id, 2, ['A', 'B']),
          value: p.value !== undefined ? p.value : 1.0,
          src_type: 'dc'
        });
        break;
      case 'AC_I':
        physical_stage.current_sources.push({
          id: comp.id,
          nodes: resolveNodes(comp.id, 2, ['A', 'B']),
          amplitude: p.amplitude !== undefined ? p.amplitude : 1.0,
          frequency: p.frequency !== undefined ? p.frequency : 50.0,
          phase: p.phase !== undefined ? p.phase : 0.0,
          src_type: 'ac'
        });
        break;
      case 'CTRL_I':
        physical_stage.current_sources.push({
          id: comp.id,
          nodes: resolveNodes(comp.id, 2, ['A', 'B']),
          value: p.value !== undefined ? p.value : 1.0,
          control_signal: getIncomingControlTerminal(comp.id, 'Ctrl'),
          src_type: 'controlled'
        });
        break;
      case 'I_3PH': {
        const connection = (comp.parameters?.connection || 'Y').trim();
        const amp = p.amplitude || 1.0;
        
        const nodeA = pinToNodeMap[`${comp.id}.A`] || "node_0";
        const nodeB = pinToNodeMap[`${comp.id}.B`] || "node_0";
        const nodeC = pinToNodeMap[`${comp.id}.C`] || "node_0";
        
        if (connection === 'Delta') {
          physical_stage.current_sources.push({
            id: `${comp.id}_AB`,
            nodes: [nodeA, nodeB],
            value: amp
          });
          physical_stage.current_sources.push({
            id: `${comp.id}_BC`,
            nodes: [nodeB, nodeC],
            value: amp
          });
          physical_stage.current_sources.push({
            id: `${comp.id}_CA`,
            nodes: [nodeC, nodeA],
            value: amp
          });
        } else {
          const neutralNode = `${comp.id}_N`;
          physical_stage.current_sources.push({
            id: `${comp.id}_A`,
            nodes: [nodeA, neutralNode],
            value: amp
          });
          physical_stage.current_sources.push({
            id: `${comp.id}_B`,
            nodes: [nodeB, neutralNode],
            value: amp
          });
          physical_stage.current_sources.push({
            id: `${comp.id}_C`,
            nodes: [nodeC, neutralNode],
            value: amp
          });
        }
        break;
      }
      case 'S':
      case 'BREAKER':
      case 'SR_SWITCH':
        physical_stage.switches.push({
          id: comp.id,
          nodes: resolveNodes(comp.id, 2, ['A', 'B']),
          Ron: p.Ron || 1e-3,
          Roff: p.Roff || 1e6,
          initial_state: false,
          control_signal: getIncomingControlTerminal(comp.id, 'Ctrl')
        });
        break;
      case 'DBL_SWITCH':
      case 'MAN_SWITCH':
        physical_stage.switches.push({
          id: comp.id,
          nodes: resolveNodes(comp.id, 2, ['Common', 'A']),
          Ron: p.Ron || 1e-3,
          Roff: p.Roff || 1e6,
          initial_state: false,
          control_signal: getIncomingControlTerminal(comp.id, 'Ctrl')
        });
        break;
      case 'MAN_DBL_SWITCH':
      case 'MAN_TRPL_SWITCH':
      case 'TRPL_SWITCH':
        physical_stage.switches.push({
          id: comp.id,
          nodes: resolveNodes(comp.id, 2, ['A1', 'A2']),
          Ron: p.Ron || 1e-3,
          Roff: p.Roff || 1e6,
          initial_state: false,
          control_signal: getIncomingControlTerminal(comp.id, 'Ctrl')
        });
        break;
      case 'D':
        physical_stage.diodes.push({
          id: comp.id,
          nodes: resolveNodes(comp.id, 2, ['A', 'B']),
          Vd: p.Vd || 0.7,
          Ron: p.Ron || 1e-3,
          Roff: p.Roff || 1e6
        });
        break;
      case 'MOSFET':
      case 'MOSFET_DIODE':
      case 'IGBT':
      case 'IGBT_DIODE':
      case 'IGCT':
      case 'GTO':
      case 'THYRISTOR':
      case 'JFET':
      case 'BJT': {
        const isBJT = comp.type === 'BJT';
        const termD = isBJT ? 'C' : 'D';
        const termS = isBJT ? 'E' : 'S';
        const termG = isBJT ? 'B' : 'G';
        physical_stage.analog_switches.push({
          id: comp.id,
          nodes: resolveNodes(comp.id, 2, [termD, termS]),
          control_node: `${comp.id}.${termG}`,
          control_signal: getIncomingControlTerminal(comp.id, termG),
          Ron: p.Ron || 0.01,
          Roff: p.Roff || 1e6
        });
        break;
      }
      case 'XFMR': {
        const Np = parseTurnsList(comp.parameters && comp.parameters.primary_turns).length;
        const Ns = parseTurnsList(comp.parameters && comp.parameters.secondary_turns).length;
        
        const pWindings: any[] = [];
        for (let i = 1; i <= Np; i++) {
          pWindings.push({
            nodes: resolveNodes(comp.id, 2, [`P${i}A`, `P${i}B`]),
            turns: parseTurnsList(comp.parameters && comp.parameters.primary_turns)[i - 1]
          });
        }
        const sWindings: any[] = [];
        for (let j = 1; j <= Ns; j++) {
          sWindings.push({
            nodes: resolveNodes(comp.id, 2, [`S${j}A`, `S${j}B`]),
            turns: parseTurnsList(comp.parameters && comp.parameters.secondary_turns)[j - 1]
          });
        }
        
        physical_stage.transformers.push({
          id: comp.id,
          primary_windings: pWindings,
          secondary_windings: sWindings,
          core_permeability: p.permeability || 2000.0
        });
        break;
      }
      case 'IDEAL_XFMR':
      case 'XFMR_2W':
      case 'SAT_XFMR':
      case 'MUTUAL_2W': {
        const pTurns = parseTurnsList(comp.parameters?.primary_turns || "100")[0] || 100;
        const sTurns = parseTurnsList(comp.parameters?.secondary_turns || "100")[0] || 100;
        
        physical_stage.transformers.push({
          id: comp.id,
          primary_windings: [{
            nodes: [pinToNodeMap[`${comp.id}.P1`] || "node_0", pinToNodeMap[`${comp.id}.P2`] || "node_0"],
            turns: pTurns
          }],
          secondary_windings: [{
            nodes: [pinToNodeMap[`${comp.id}.S1`] || "node_0", pinToNodeMap[`${comp.id}.S2`] || "node_0"],
            turns: sTurns
          }],
          core_permeability: p.permeability || 2000.0
        });
        break;
      }
      case 'XFMR_3W':
      case 'MUTUAL_3W': {
        const pTurns = parseTurnsList(comp.parameters?.primary_turns || "100")[0] || 100;
        const sTurns1 = parseTurnsList(comp.parameters?.secondary_turns || "100")[0] || 100;
        const sTurns2 = parseTurnsList(comp.parameters?.secondary_turns || "100")[1] || 100;
        
        physical_stage.transformers.push({
          id: comp.id,
          primary_windings: [{
            nodes: [pinToNodeMap[`${comp.id}.P1`] || "node_0", pinToNodeMap[`${comp.id}.P2`] || "node_0"],
            turns: pTurns
          }],
          secondary_windings: [
            {
              nodes: [pinToNodeMap[`${comp.id}.S1_1`] || "node_0", pinToNodeMap[`${comp.id}.S1_2`] || "node_0"],
              turns: sTurns1
            },
            {
              nodes: [pinToNodeMap[`${comp.id}.S2_1`] || "node_0", pinToNodeMap[`${comp.id}.S2_2`] || "node_0"],
              turns: sTurns2
            }
          ],
          core_permeability: p.permeability || 2000.0
        });
        break;
      }
      case 'XFMR_3PH_2W': {
        physical_stage.transformers.push({
          id: comp.id,
          primary_windings: [{
            nodes: [pinToNodeMap[`${comp.id}.A`] || "node_0", pinToNodeMap[`${comp.id}.B`] || "node_0"],
            turns: 100
          }],
          secondary_windings: [{
            nodes: [pinToNodeMap[`${comp.id}.a`] || "node_0", pinToNodeMap[`${comp.id}.b`] || "node_0"],
            turns: 100
          }],
          core_permeability: p.permeability || 2000.0
        });
        break;
      }
      case 'XFMR_3PH_3W': {
        physical_stage.transformers.push({
          id: comp.id,
          primary_windings: [{
            nodes: [pinToNodeMap[`${comp.id}.A`] || "node_0", pinToNodeMap[`${comp.id}.B`] || "node_0"],
            turns: 100
          }],
          secondary_windings: [
            {
              nodes: [pinToNodeMap[`${comp.id}.a`] || "node_0", pinToNodeMap[`${comp.id}.b`] || "node_0"],
              turns: 100
            },
            {
              nodes: [pinToNodeMap[`${comp.id}.a3`] || "node_0", pinToNodeMap[`${comp.id}.b3`] || "node_0"],
              turns: 100
            }
          ],
          core_permeability: p.permeability || 2000.0
        });
        break;
      }
      case 'VM':
        physical_stage.voltmeters.push({
          id: comp.id,
          nodes: resolveNodes(comp.id, 2, ['A', 'B']),
          signal: `${comp.id}.Out`
        });
        break;
      case 'VM_3PH':
        physical_stage.voltmeters.push({
          id: comp.id,
          nodes: [pinToNodeMap[`${comp.id}.A`] || "node_0", pinToNodeMap[`${comp.id}.B`] || "node_0"],
          signal: `${comp.id}.Out`
        });
        break;
      case 'AM':
        physical_stage.ammeters.push({
          id: comp.id,
          nodes: resolveNodes(comp.id, 2, ['A', 'B']),
          signal: `${comp.id}.Out`
        });
        break;
      case 'AM_3PH':
        physical_stage.ammeters.push({
          id: comp.id,
          nodes: [pinToNodeMap[`${comp.id}.A`] || "node_0", pinToNodeMap[`${comp.id}.B`] || "node_0"],
          signal: `${comp.id}.Out`
        });
        break;
      case 'OPAMP':
      case 'E_COMP':
        physical_stage.voltage_sources.push({
          id: comp.id,
          nodes: [pinToNodeMap[`${comp.id}.Out`] || "node_0", "node_0"],
          plus_node: pinToNodeMap[`${comp.id}.Plus`] || "node_0",
          minus_node: pinToNodeMap[`${comp.id}.Minus`] || "node_0",
          gain: p.gain !== undefined ? p.gain : 1e5,
          value: p.value !== undefined ? p.value : 12.0,
          src_type: comp.type.toLowerCase()
        });
        break;
      case 'IC_LM7805':
        physical_stage.voltage_sources.push({
          id: comp.id,
          nodes: [pinToNodeMap[`${comp.id}.OUT`] || "node_0", pinToNodeMap[`${comp.id}.GND`] || "node_0"],
          value: 5.0,
          src_type: 'dc'
        });
        break;
      case 'IC_LM317':
        physical_stage.voltage_sources.push({
          id: comp.id,
          nodes: [pinToNodeMap[`${comp.id}.OUT`] || "node_0", pinToNodeMap[`${comp.id}.ADJ`] || "node_0"],
          value: 1.25,
          src_type: 'dc'
        });
        break;
      case 'IC_PC817':
        physical_stage.diodes.push({
          id: `${comp.id}_LED`,
          nodes: [pinToNodeMap[`${comp.id}.Anode`] || "node_0", pinToNodeMap[`${comp.id}.Cathode`] || "node_0"],
          Vd: 1.2,
          Ron: 1.0,
          Roff: 1e6
        });
        physical_stage.resistors.push({
          id: `${comp.id}_TR`,
          nodes: [pinToNodeMap[`${comp.id}.Collector`] || "node_0", pinToNodeMap[`${comp.id}.Emitter`] || "node_0"],
          value: 100.0,
          esr: 0.0
        });
        break;
      case 'IC_555':
      case 'IC_7400':
      case 'IC_7408':
      case 'IC_7432':
      case 'IC_7404': {
        const pinNames = getDetailedComponentPins(comp.type);
        const keys = Object.keys(pinNames || {});
        const node1 = pinToNodeMap[`${comp.id}.${keys[0]}`] || "node_0";
        const node2 = pinToNodeMap[`${comp.id}.${keys[1]}`] || "node_0";
        physical_stage.resistors.push({
          id: comp.id,
          nodes: [node1, node2],
          value: 1e3,
          esr: 0.0
        });
        break;
      }
      case 'GEN_EBLOCK': {
        const n = parseInt(comp.parameters && comp.parameters.terminals) || 3;
        const terminalLabels = Array.from({ length: n }, (_, i) => `T${i + 1}`);
        const resolvedNodes = resolveNodes(comp.id, n, terminalLabels);
        const codeParams: Record<string, string> = {};
        if (comp.parameters && comp.parameters.code) {
          const parsed = discoverParamsFromCode(comp.parameters.code);
          parsed.forEach(p => {
            codeParams[p.name] = p.value;
          });
        }
        physical_stage.custom_eblocks.push({
          id: comp.id,
          nodes: resolvedNodes,
          code: comp.parameters && comp.parameters.code ? comp.parameters.code : "",
          timestep: comp.parameters.timestep || "0",
          plot_inputs: comp.parameters.plot_inputs || "true",
          plot_outputs: comp.parameters.plot_outputs || "true",
          plot_custom_vars: comp.parameters.plot_custom_vars || "",
          terminals: String(n),
          ...codeParams
        });
        break;
      }
      default: {
        const isDetailedElect = DETAILED_COMPONENTS.some(dc => dc.type === comp.type && dc.category === 'electrical');
        if (isDetailedElect && comp.type !== 'E_PORT' && comp.type !== 'E_LABEL') {
          physical_stage.resistors.push({
            id: comp.id,
            nodes: resolveNodes(comp.id, 2, ['A', 'B']),
            value: p.value || 0.1,
            esr: 0.0
          });
        }
        break;
      }
    }
  });
  
  // 5.5. Export wires as resistors if Detailed (non-fastMode)
  if (!fastMode) {
    electricalWires.forEach((wire: any) => {
      const segs = wireSegments[wire.id] || [];
      if (segs.length === 0) {
        const fromNode = pinToNodeMap[`W_from_${wire.id}`] || "node_0";
        const toNode = pinToNodeMap[`W_to_${wire.id}`] || "node_0";
        physical_stage.resistors.push({
          id: wire.id,
          nodes: [fromNode, toNode],
          value: 1e-4
        });
      } else {
        segs.forEach(seg => {
          const fromNode = pinToNodeMap[seg.fromKey] || "node_0";
          const toNode = pinToNodeMap[seg.toKey] || "node_0";
          physical_stage.resistors.push({
            id: seg.segmentId,
            nodes: [fromNode, toNode],
            value: 1e-4
          });
        });
      }
    });
  }
  
  // 6. Populate Control Loops Stage
  state.components.forEach((comp: any) => {
    const p = paramsVals(comp);
    
    switch (comp.type) {
      case 'CONST':
      case 'STEP':
      case 'RAMP':
      case 'CLOCK':
      case 'SINE_WAVE':
      case 'PULSE_GEN':
      case 'TRI_GEN':
      case 'RANDOM_NUM':
      case 'WHITE_NOISE':
        control_loops.constants.push({
          ...p,
          id: comp.id,
          output: `${comp.id}.Out`,
          value: p.value || 1.0,
          original_type: comp.type
        });
        break;
      case 'GAIN':
      case 'OFFSET':
      case 'SIGNUM':
      case 'DATATYPE_CONV':
      case 'INIT_COND':
      case 'SATURATION':
      case 'DEAD_ZONE':
      case 'RATE_LIMITER':
      case 'RELAY':
      case 'ABS':
      case 'SIGN':
      case 'TRIG_FCN':
      case 'MATH_FCN':
      case 'INTEGRATOR':
      case 'DERIVATIVE':
      case 'ROUND':
      case 'LUT_1D':
      case 'TRANSFER_FCN':
      case 'STATE_SPACE':
      case 'DELAY':
      case 'TRANSPORT_DELAY':
      case 'TURN_ON_DELAY':
      case 'MEMORY_BLOCK':
      case 'QUANTIZER':
      case 'HIT_CROSSING':
      case 'DISCRETE_INT':
      case 'DISCRETE_TF':
      case 'DISCRETE_SS':
      case 'ZOH':
      case 'UNIT_DELAY':
      case 'DISCRETE_MEAN':
      case 'DISCRETE_PID':
      case 'COMPARE_TO_CONSTANT':
      case 'MONOFLOP':
      case 'MONOSTABLE':
        control_loops.gains.push({
          ...p,
          id: comp.id,
          input: getIncomingControlTerminal(comp.id, 'In'),
          output: `${comp.id}.Out`,
          K: p.gain || p.K || 1.0,
          original_type: comp.type
        });
        break;
      case 'PERIODIC_IMP_AVG':
        control_loops.gains.push({
          ...p,
          id: comp.id,
          input: getIncomingControlTerminal(comp.id, 'In'),
          control_signal: getIncomingControlTerminal(comp.id, 'Trig'),
          output: `${comp.id}.Out`,
          original_type: comp.type
        });
        break;
      case 'FOURIER_TRANS':
        control_loops.gains.push({
          ...p,
          id: comp.id,
          input: getIncomingControlTerminal(comp.id, 'In'),
          output_mag: `${comp.id}.Mag`,
          output_phase: `${comp.id}.Phase`,
          original_type: comp.type
        });
        break;
      case 'D_FLIP_FLOP':
        control_loops.gains.push({
          ...p,
          id: comp.id,
          input_d: getIncomingControlTerminal(comp.id, 'D'),
          control_signal: getIncomingControlTerminal(comp.id, 'Clk'),
          output_q: `${comp.id}.Q`,
          output_qbar: `${comp.id}.Q_bar`,
          original_type: comp.type
        });
        break;
      case 'JK_FLIP_FLOP':
        control_loops.gains.push({
          ...p,
          id: comp.id,
          input_j: getIncomingControlTerminal(comp.id, 'J'),
          input_k: getIncomingControlTerminal(comp.id, 'K'),
          control_signal: getIncomingControlTerminal(comp.id, 'Clk'),
          output_q: `${comp.id}.Q`,
          output_qbar: `${comp.id}.Q_bar`,
          original_type: comp.type
        });
        break;
      case 'SIGNAL_SWITCH':
        control_loops.gains.push({
          ...p,
          id: comp.id,
          input1: getIncomingControlTerminal(comp.id, 'In1'),
          control_signal: getIncomingControlTerminal(comp.id, 'Ctrl'),
          input2: getIncomingControlTerminal(comp.id, 'In2'),
          output: `${comp.id}.Out`,
          original_type: comp.type
        });
        break;
      case 'MANUAL_SWITCH':
        control_loops.gains.push({
          ...p,
          id: comp.id,
          input1: getIncomingControlTerminal(comp.id, 'In1'),
          input2: getIncomingControlTerminal(comp.id, 'In2'),
          output: `${comp.id}.Out`,
          original_type: comp.type
        });
        break;
      case 'MULTIPORT_SWITCH': {
        const numInputs = parseInt(p.inputs) || 3;
        const inputsArray: (string | null)[] = [];
        for (let i = 1; i <= numInputs; i++) {
          inputsArray.push(getIncomingControlTerminal(comp.id, `In${i}`));
        }
        control_loops.gains.push({
          ...p,
          id: comp.id,
          control_signal: getIncomingControlTerminal(comp.id, 'Ctrl'),
          inputs: inputsArray,
          output: `${comp.id}.Out`,
          original_type: comp.type
        });
        break;
      }
      case 'PID':
        control_loops.pi_controllers.push({
          id: comp.id,
          input: getIncomingControlTerminal(comp.id, 'In'),
          output: `${comp.id}.Out`,
          Kp: p.Kp || 1.0,
          Ki: p.Ki || 0.0,
          Kd: p.Kd || 0.0
        });
        break;
      case 'CONT_PID':
        control_loops.pid_controllers.push({
          ...p,
          id: comp.id,
          input: getIncomingControlTerminal(comp.id, 'In'),
          output: `${comp.id}.Out`,
          original_type: comp.type
        });
        break;
      case 'PLL_1PH':
        control_loops.plls.push({
          ...p,
          id: comp.id,
          input: getIncomingControlTerminal(comp.id, 'In'),
          output_theta: `${comp.id}.Theta`,
          output_freq: `${comp.id}.Freq`,
          output_cos: `${comp.id}.Cos`,
          output_sin: `${comp.id}.Sin`,
          original_type: comp.type
        });
        break;
      case 'PLL_3PH':
        control_loops.plls.push({
          ...p,
          id: comp.id,
          inputs: [
            getIncomingControlTerminal(comp.id, 'Va'),
            getIncomingControlTerminal(comp.id, 'Vb'),
            getIncomingControlTerminal(comp.id, 'Vc')
          ],
          output_theta: `${comp.id}.Theta`,
          output_freq: `${comp.id}.Freq`,
          output_cos: `${comp.id}.Cos`,
          output_sin: `${comp.id}.Sin`,
          original_type: comp.type
        });
        break;
      case 'SUM':
      case 'SUBTRACT':
        control_loops.summing_junctions.push({
          id: comp.id,
          inputs: [
            getIncomingControlTerminal(comp.id, 'A'),
            getIncomingControlTerminal(comp.id, 'B')
          ],
          signs: comp.parameters?.signs ? comp.parameters.signs : (comp.type === 'SUBTRACT' ? '+-' : '++'),
          output: `${comp.id}.Out`
        });
        break;
      case 'SUM_ROUND':
      case 'SUM_RECT': {
        const numInputs = parseInt(comp.parameters?.inputs) || 2;
        const inputs: string[] = [];
        for (let i = 1; i <= numInputs; i++) {
          inputs.push(getIncomingControlTerminal(comp.id, `In${i}`));
        }
        const hasCtrlWire = comp.type === 'SUM_RECT' && state.wires.some((w: any) => 
          getWireDomain(w) === 'control' && (
            (w.from.type === 'pin' && w.from.compId === comp.id && w.from.terminal === 'Ctrl') ||
            (w.to && w.to.type === 'pin' && w.to.compId === comp.id && w.to.terminal === 'Ctrl')
          )
        );
        control_loops.summing_junctions.push({
          id: comp.id,
          inputs: inputs,
          signs: comp.parameters?.signs ? comp.parameters.signs : '+'.repeat(numInputs),
          output: `${comp.id}.Out`,
          control_signal: hasCtrlWire ? getIncomingControlTerminal(comp.id, 'Ctrl') : undefined
        });
        break;
      }
      case 'PWM':
        control_loops.pwm_generators.push({
          id: comp.id,
          input: getIncomingControlTerminal(comp.id, 'In'),
          output: `${comp.id}.Out`,
          frequency: p.frequency || 10000.0,
          min: p.min || 0.0,
          max: p.max || 1.0
        });
        break;
      case 'TRI':
        control_loops.triangle_carriers.push({
          id: comp.id,
          output: `${comp.id}.Out`,
          frequency: p.frequency || 10000.0,
          min: p.min || 0.0,
          max: p.max || 1.0
        });
        break;
      case 'COMP':
        control_loops.comparators.push({
          id: comp.id,
          inputs: [
            getIncomingControlTerminal(comp.id, 'Plus'),
            getIncomingControlTerminal(comp.id, 'Minus')
          ],
          output: `${comp.id}.Out`,
          hysteresis: p.hysteresis || 0.0
        });
        break;
      case 'AND':
      case 'OR':
      case 'NOT':
        control_loops.logic_gates.push({
          id: comp.id,
          inputs: comp.type === 'NOT' ? [getIncomingControlTerminal(comp.id, 'In')] : [getIncomingControlTerminal(comp.id, 'A'), getIncomingControlTerminal(comp.id, 'B')],
          type: comp.type.toLowerCase(),
          output: `${comp.id}.Out`
        });
        break;
      case 'FCN':
        control_loops.custom_functions.push({
          id: comp.id,
          input: getIncomingControlTerminal(comp.id, 'In'),
          output: `${comp.id}.Out`,
          expr: comp.parameters && comp.parameters.expr ? comp.parameters.expr : "u[0] * 2"
        });
        break;
      case 'PROD':
      case 'MIN_MAX':
      case 'LOGIC_OP':
      case 'LUT_2D':
      case 'RELATIONAL_OPERATOR':
        control_loops.product_blocks.push({
          ...p,
          id: comp.id,
          inputs: [
            getIncomingControlTerminal(comp.id, 'In1'),
            getIncomingControlTerminal(comp.id, 'In2')
          ],
          output: `${comp.id}.Out`,
          original_type: comp.type
        });
        break;
      case 'PRODUCT_RECT': {
        const numInputs = parseInt(comp.parameters?.inputs) || 2;
        const inputs: string[] = [];
        for (let i = 1; i <= numInputs; i++) {
          inputs.push(getIncomingControlTerminal(comp.id, `In${i}`));
        }
        const hasCtrlWire = state.wires.some((w: any) => 
          getWireDomain(w) === 'control' && (
            (w.from.type === 'pin' && w.from.compId === comp.id && w.from.terminal === 'Ctrl') ||
            (w.to && w.to.type === 'pin' && w.to.compId === comp.id && w.to.terminal === 'Ctrl')
          )
        );
        control_loops.product_blocks.push({
          ...p,
          id: comp.id,
          inputs: inputs,
          output: `${comp.id}.Out`,
          original_type: comp.type,
          control_signal: hasCtrlWire ? getIncomingControlTerminal(comp.id, 'Ctrl') : undefined
        });
        break;
      }
      case 'DIVIDE':
        control_loops.product_blocks.push({
          ...p,
          id: comp.id,
          inputs: [
            getIncomingControlTerminal(comp.id, 'Num'),
            getIncomingControlTerminal(comp.id, 'Den')
          ],
          output: `${comp.id}.Out`,
          original_type: comp.type
        });
        break;
      case 'CSCRIPT': {
        const ports = discoverPortsJS(comp.parameters && comp.parameters.code);
        const ins: string[] = [];
        ports.inputs.forEach(pIn => {
          ins.push(getIncomingControlTerminal(comp.id, pIn));
        });
        const outs = ports.outputs.map(pOut => `${comp.id}.${pOut}`);
        
        control_loops.custom_scripts.push({
          id: comp.id,
          inputs: ins,
          outputs: outs,
          code: comp.parameters && comp.parameters.code ? comp.parameters.code : "",
          timestep: comp.parameters.timestep || "0",
          plot_inputs: comp.parameters.plot_inputs || "true",
          plot_outputs: comp.parameters.plot_outputs || "true",
          plot_custom_vars: comp.parameters.plot_custom_vars || ""
        });
        break;
      }
      case 'MUX': {
        const numInputs = parseInt(comp.parameters && comp.parameters.inputs) || 2;
        const ins: string[] = [];
        for (let i = 1; i <= numInputs; i++) {
          ins.push(getIncomingControlTerminal(comp.id, `In${i}`));
        }
        control_loops.signals_routing.push({
          id: comp.id,
          type: 'mux',
          inputs: ins,
          output: `${comp.id}.Out`
        });
        break;
      }
      case 'DEMUX': {
        const numOutputs = parseInt(comp.parameters && comp.parameters.outputs) || 2;
        const outs: string[] = [];
        for (let i = 1; i <= numOutputs; i++) {
          outs.push(`${comp.id}.Out${i}`);
        }
        control_loops.signals_routing.push({
          id: comp.id,
          type: 'demux',
          input: getIncomingControlTerminal(comp.id, 'In'),
          outputs: outs
        });
        break;
      }
      case 'PROBE':
        control_loops.probes.push({
          id: comp.id,
          target: comp.parameters?.target || "",
          selected_signals: comp.parameters?.selected_signals || ""
        });
        break;
      default:
        // Untouched control blocks are explicitly identified but kept untouched / ignored by the transient solver
        break;
    }
  });
  
  // 7. Standard Simulation Solver Configuration Parameters
  const wanted_variables: string[] = [];
  if (state.plotConfiguration && Array.isArray(state.plotConfiguration.plots)) {
    state.plotConfiguration.plots.forEach((p: any) => {
      if (Array.isArray(p.variables)) {
        p.variables.forEach((v: string) => {
          if (v) wanted_variables.push(v);
        });
      }
    });
  }
  // Automatically add all scope input channels to wanted variables so they are simulated and plotted
  state.components.forEach((c: any) => {
    if (c.type === 'SCOPE') {
      const numChannels = parseInt(c.parameters?.channels) || 2;
      for (let i = 1; i <= numChannels; i++) {
        wanted_variables.push(`${c.id}.In${i}`);
      }
    }
  });

  const resolvedWanted: string[] = [];
  wanted_variables.forEach(v => {
    resolvedWanted.push(v);
    if (v.includes('.')) {
      const [compId, term] = v.split('.');
      if (compId && term && term !== 'Out' && !term.startsWith('Out')) {
        const incoming = getIncomingControlTerminal(compId, term);
        if (incoming && incoming !== '0.0') {
          resolvedWanted.push(incoming);
        }
      }
    }
  });

  const simulation_parameters: any = {
    stop_time: parseScientific(state.simulationSettings.stopTime || "0.05"),
    step_size: parseScientific(state.simulationSettings.stepSize || "1e-5"),
    solver: state.simulationSettings.solver || "euler",
    step_type: state.simulationSettings.stepType || "fixed",
    wanted_variables: Array.from(new Set(resolvedWanted))
  };
  
  // 8. Visual scopes / probes variables overlay setup
  const probes: any[] = [];
  state.components.forEach((c: any) => {
    if (c.type === 'PROBE') {
      const targetStr = (c.parameters.target || '').trim();
      if (targetStr) {
        probes.push({
          id: c.id,
          target: targetStr
        });
      }
    } else if (c.type === 'SCOPE') {
      const numChannels = parseInt(c.parameters.channels) || 2;
      const inTraces: string[] = [];
      for (let i = 1; i <= numChannels; i++) {
        inTraces.push(getIncomingControlTerminal(c.id, `In${i}`));
      }
      probes.push({
        id: c.id,
        channels_inputs: inTraces
      });
    }
  });
    return {
      physical_stage,
      control_loops,
      simulation_parameters,
      probes
    };
  } finally {
    state.components = originalComponents;
    state.wires = originalWires;
  }
}

// Find source control endpoint mapping for wire routing connection using bidirectional net tracing
function getIncomingControlTerminal(compId: string, destTerminalName: string): string {
  const visitedPins = new Set<string>();
  const visitedWires = new Set<string>();
  const queue: any[] = [{ type: 'pin', compId, terminal: destTerminalName }];
  
  while (queue.length > 0) {
    const curr = queue.shift();
    if (!curr) continue;
    
    if (curr.type === 'pin') {
      const pinKey = `${curr.compId}.${curr.terminal}`;
      if (visitedPins.has(pinKey)) continue;
      visitedPins.add(pinKey);
      
      // Port boundary bypass: if we hit an INPORT, jump to the external subsystem boundary pin
      const comp = state.components.find((c: any) => c.id === curr.compId);
      
      // Wireless signal routing: if we hit a FROM_SIG, jump to the matching GOTO_SIG's input terminal
      if (comp && comp.type === 'FROM_SIG') {
        const fromTag = String(comp.parameters?.tag || 'A').trim().toLowerCase();
        
        // Find subsystem prefix of the current FROM_SIG
        const compIdParts = comp.id.split('.');
        const subsystemPrefix = compIdParts.slice(0, -1).join('.'); // Empty if at root
        
        // Find all GOTO_SIGs with matching tag
        const matchingGotos = state.components.filter((c: any) => 
          c.type === 'GOTO_SIG' && String(c.parameters?.tag || 'A').trim().toLowerCase() === fromTag
        );
        
        // Scoping rule:
        // 1. Try to find one in the EXACT same subsystem (same prefix)
        // 2. Try to find one at the root level (no prefix)
        // 3. Fallback to any matching one
        let matchingGoto = matchingGotos.find((c: any) => {
          const parts = c.id.split('.');
          const prefix = parts.slice(0, -1).join('.');
          return prefix === subsystemPrefix;
        });
        
        if (!matchingGoto) {
          matchingGoto = matchingGotos.find((c: any) => !c.id.includes('.'));
        }
        
        if (!matchingGoto && matchingGotos.length > 0) {
          matchingGoto = matchingGotos[0];
        }

        if (matchingGoto) {
          queue.push({ type: 'pin', compId: matchingGoto.id, terminal: 'In' });
          continue;
        }
      }
      
      if (comp && comp.type === 'INPORT') {
        const parts = curr.compId.split('.');
        if (parts.length > 1) {
          const portName = parts.pop()!;
          const parentSubsysId = parts.join('.');
          queue.push({ type: 'pin', compId: parentSubsysId, terminal: portName });
          continue;
        }
      }
      
      // Port boundary bypass: if we hit a SUBSYSTEM boundary pin that corresponds
      // to an OUTPORT inside it, jump to the internal OUTPORT block's In terminal.
      // For INPORT-mapped boundary pins, skip this bypass and let wire scanning
      // find the incoming root-level wires instead.
      if (comp && comp.type === 'SUBSYSTEM') {
        const subComps = (comp.sub_schematic?.components || []) as any[];
        const internalComp = subComps.find((c: any) => c.id === curr.terminal);
        if (internalComp && internalComp.type === 'OUTPORT') {
          // Jump to the internal OUTPORT's input terminal (inside the subsystem)
          queue.push({ type: 'pin', compId: `${curr.compId}.${curr.terminal}`, terminal: 'In' });
          continue;
        }
        // For INPORT-mapped terminals: fall through to wire scanning to find
        // the root-level wire that feeds signal into this subsystem boundary pin.
      }
      
      // Check if this pin is a control source (output)
      if (isControlOutputPin(curr.compId, curr.terminal)) {
        if (curr.compId !== compId || curr.terminal !== destTerminalName) {
          return pinKey;
        }
      }
      
      // Find all wires connected to this pin
      state.wires.forEach((w: any) => {
        if (getWireDomain(w) === 'control') {
          if (w.from.type === 'pin' && w.from.compId === curr.compId && w.from.terminal === curr.terminal) {
            queue.push(w.to);
            queue.push({ type: 'wire_obj', wire: w });
          } else if (w.to && w.to.type === 'pin' && w.to.compId === curr.compId && w.to.terminal === curr.terminal) {
            queue.push(w.from);
            queue.push({ type: 'wire_obj', wire: w });
          }
        }
      });
    } else if (curr.type === 'wire_obj') {
      const w = curr.wire;
      if (visitedWires.has(w.id)) continue;
      visitedWires.add(w.id);
      
      // Enqueue both endpoints
      queue.push(w.from);
      if (w.to) queue.push(w.to);
      
      // Find other wires that branch off this wire or this wire branches off of
      state.wires.forEach((otherW: any) => {
        if (getWireDomain(otherW) === 'control') {
          if (otherW.from.type === 'wire' && otherW.from.wireId === w.id) {
            queue.push({ type: 'wire_obj', wire: otherW });
          } else if (otherW.to && otherW.to.type === 'wire' && otherW.to.wireId === w.id) {
            queue.push({ type: 'wire_obj', wire: otherW });
          }
        }
      });
      
      // If this wire's endpoints join other wires
      if (w.from.type === 'wire') {
        const parentW = state.wires.find((pw: any) => pw.id === w.from.wireId);
        if (parentW) queue.push({ type: 'wire_obj', wire: parentW });
      }
      if (w.to && w.to.type === 'wire') {
        const parentW = state.wires.find((pw: any) => pw.id === w.to.wireId);
        if (parentW) queue.push({ type: 'wire_obj', wire: parentW });
      }
    } else if (curr.type === 'wire') {
      const w = state.wires.find((pw: any) => pw.id === curr.wireId);
      if (w) queue.push({ type: 'wire_obj', wire: w });
    }
  }
  
  return "0.0"; // default zero constant fallback
}

// Subsystem navigation and hierarchy management
export function commitCurrentSchematicState() {
  let currentComps = [...state.components];
  let currentWires = [...state.wires];
  let currentId = state.currentSubsystemId;

  for (let i = state.navigationStack.length - 1; i >= 0; i--) {
    const layer = state.navigationStack[i];
    const subsys = layer.components.find((c: any) => c.id === currentId);
    if (subsys && subsys.type === 'SUBSYSTEM') {
      subsys.sub_schematic = {
        components: currentComps,
        wires: currentWires
      };
    }
    currentComps = layer.components;
    currentWires = layer.wires;
    currentId = layer.subsystemId;
  }
}

export function getRootSchematic(): { components: any[]; wires: any[] } {
  commitCurrentSchematicState();
  if (state.navigationStack && state.navigationStack.length > 0) {
    return {
      components: state.navigationStack[0].components,
      wires: state.navigationStack[0].wires
    };
  }
  return {
    components: state.components,
    wires: state.wires
  };
}

export function enterSubsystem(subsystemId: string) {
  const comp = state.components.find((c: any) => c.id === subsystemId);
  if (!comp || comp.type !== 'SUBSYSTEM') return;

  // Save current layer state to navigation stack
  state.navigationStack.push({
    subsystemId: state.currentSubsystemId,
    subsystemName: state.currentSubsystemId || 'Main',
    components: [...state.components],
    wires: [...state.wires]
  });

  // Switch canvas workspace to the subsystem's sub-schematic
  state.currentSubsystemId = comp.id;
  if (!comp.sub_schematic) {
    comp.sub_schematic = { components: [], wires: [] };
  }
  state.components = comp.sub_schematic.components || [];
  state.wires = comp.sub_schematic.wires || [];

  // Clear selections
  state.selectedComponentIds = [];
  state.selectedWireIds = [];

  draw();
  updatePropertiesPanel();
  window.dispatchEvent(new CustomEvent('schematicNavigationChanged'));
}

export function exitSubsystem() {
  if (state.navigationStack.length === 0) return;

  // Commit current sub-schematic edits to the hierarchy first
  commitCurrentSchematicState();

  const parentLayer = state.navigationStack.pop()!;

  // Restore parent layer canvas state
  state.currentSubsystemId = parentLayer.subsystemId;
  state.components = parentLayer.components;
  state.wires = parentLayer.wires;

  // Clear selections
  state.selectedComponentIds = [];
  state.selectedWireIds = [];

  draw();
  updatePropertiesPanel();
  window.dispatchEvent(new CustomEvent('schematicNavigationChanged'));
}

export function navigateToLevel(levelIndex: number) {
  if (levelIndex === state.navigationStack.length - 1) return;
  while (state.navigationStack.length > levelIndex + 1) {
    exitSubsystem();
  }
}

export function compileHierarchicalNetlist(
  rootComponents: any[],
  rootWires: any[]
): { components: any[]; wires: any[] } {
  const flatComponents: any[] = [];
  const flatWires: any[] = [];

  function evaluateExpression(expr: any, scope: Record<string, number>): number {
    if (typeof expr !== 'string') return Number(expr) || 0;
    const trimmed = expr.trim();
    if (trimmed === '') return 0;
    
    // First check: if there are no scope variables referenced and no operators, we can directly parse
    const hasScopeVar = Object.keys(scope).some(varName => trimmed.includes(varName));
    const hasOperators = /[\+\-\*\(]/.test(trimmed); // exclude / as parseScientific handles division
    if (!hasScopeVar && !hasOperators) {
      return parseScientific(trimmed);
    }
    
    let evalStr = trimmed;
    const varNames = Object.keys(scope).sort((a, b) => b.length - a.length);
    varNames.forEach(varName => {
      const escapedVar = varName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedVar}\\b`, 'g');
      evalStr = evalStr.replace(regex, String(scope[varName]));
    });

    // Strip trailing units like ohm, v, a, hz, f, h, w, etc. case-insensitively
    evalStr = evalStr.replace(/\b(ohms?|ohm|Ω|hz|hertz|v(?:olts?)?|a(?:mps?)?|f(?:arads?)?|h(?:enrys?)?|w(?:atts?))\b/gi, '');

    // Replace any engineering notation suffixes (p, n, u, m, k, M, G) in the expression with standard scientific e notation
    const prefixes: Record<string, string> = {
      'p': 'e-12',
      'n': 'e-9',
      'u': 'e-6',
      'm': 'e-3',
      'k': 'e3',
      'M': 'e6',
      'G': 'e9'
    };
    evalStr = evalStr.replace(/\b(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*([pnuumkMG])\b/g, (match, num, pref) => {
      return `${num}${prefixes[pref]}`;
    });

    try {
      return Function(`"use strict"; return (${evalStr})`)();
    } catch {
      return 0.0;
    }
  }

  function processLayer(
    comps: any[],
    wires: any[],
    parentScope: Record<string, number>,
    prefix: string
  ) {
    comps.forEach(comp => {
      const prefixedId = prefix ? `${prefix}.${comp.id}` : comp.id;

      if (comp.type === 'SUBSYSTEM') {
        const localScope: Record<string, number> = { ...parentScope };
        if (comp.parameters) {
          Object.keys(comp.parameters).forEach(k => {
            const rawVal = comp.parameters[k];
            const resolvedVal = evaluateExpression(rawVal, parentScope);
            localScope[k] = resolvedVal;
          });
        }

        const subSchematic = comp.sub_schematic || { components: [], wires: [] };
        processLayer(
          subSchematic.components || [],
          subSchematic.wires || [],
          localScope,
          prefixedId
        );
        // Add a ghost SUBSYSTEM entry so that control signal tracers
        // (getIncomingControlTerminal) can find this subsystem boundary
        // and correctly jump through INPORT/OUTPORT port bypasses.
        flatComponents.push({
          id: prefixedId,
          type: 'SUBSYSTEM',
          x: comp.x,
          y: comp.y,
          parameters: {},
          sub_schematic: subSchematic
        });
      } else {
        const resolvedParameters: Record<string, any> = {};
        if (comp.parameters) {
          Object.keys(comp.parameters).forEach(k => {
            const val = comp.parameters[k];
            const stringKeys = [
              'tag', 'label', 'code', 'plot_custom_vars', 'method', 'operator', 
              'signs', 'edge', 'trigger_edge', 'datatype', 'retriggerable', 'type',
              'target', 'selected_signals'
            ];
            const isStringParam = stringKeys.includes(k) || k.startsWith('plot_') || k.startsWith('trigger_');
            
            if (typeof val === 'string' && val.trim() !== '' && !isStringParam) {
              const hasDigits = /\d/.test(val);
              const hasScopeVar = Object.keys(parentScope).some(varName => new RegExp('\\b' + varName + '\\b').test(val));
              if (hasDigits || hasScopeVar) {
                const resolved = evaluateExpression(val, parentScope);
                resolvedParameters[k] = String(resolved);
              } else {
                resolvedParameters[k] = val;
              }
            } else {
              resolvedParameters[k] = val;
            }
          });
        }

        flatComponents.push({
          ...comp,
          id: prefixedId,
          parameters: resolvedParameters
        });
      }
    });

    wires.forEach(w => {
      const newWire = {
        ...w,
        id: prefix ? `${prefix}.${w.id}` : w.id,
        from: {
          ...w.from,
          compId: prefix ? `${prefix}.${w.from.compId}` : w.from.compId
        },
        to: w.to ? {
          ...w.to,
          compId: prefix ? `${prefix}.${w.to.compId}` : w.to.compId
        } : undefined
      };
      flatWires.push(newWire);
    });
  }

  processLayer(rootComponents, rootWires, {}, "");
  return { components: flatComponents, wires: flatWires };
}

