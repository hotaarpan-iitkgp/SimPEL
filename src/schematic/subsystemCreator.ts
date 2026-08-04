import { state, saveState } from './state';
import { generateNextId, showToast } from './utils';
import { draw } from './renderer';
import { updatePropertiesPanel } from './properties';
import { getPinDomain } from './routing';
import { getComponentPins } from './config';
import { isControlOutputPin } from './actions';

class DisjointSet {
  parent: Map<string, string> = new Map();

  find(i: string): string {
    if (!this.parent.has(i)) this.parent.set(i, i);
    if (this.parent.get(i) === i) return i;
    const root = this.find(this.parent.get(i)!);
    this.parent.set(i, root);
    return root;
  }

  union(i: string, j: string): void {
    const rootI = this.find(i);
    const rootJ = this.find(j);
    if (rootI !== rootJ) {
      this.parent.set(rootI, rootJ);
    }
  }
}

interface PinRef {
  compId: string;
  terminal: string;
}

// Recursively trace wire endpoint to get all associated component pins
function getEndpointPins(ep: any, wires: any[], visitedWires = new Set<string>()): PinRef[] {
  if (!ep) return [];
  if (ep.type === 'pin') {
    return [{ compId: ep.compId, terminal: ep.terminal }];
  }
  if (ep.type === 'wire' && ep.wireId) {
    if (visitedWires.has(ep.wireId)) return [];
    visitedWires.add(ep.wireId);

    const targetWire = wires.find((w: any) => w.id === ep.wireId);
    if (!targetWire) return [];

    const pins: PinRef[] = [];
    pins.push(...getEndpointPins(targetWire.from, wires, visitedWires));
    if (targetWire.to) {
      pins.push(...getEndpointPins(targetWire.to, wires, visitedWires));
    }
    return pins;
  }
  return [];
}

export function createSubsystemFromSelection(): void {
  const selectedCompIds = new Set<string>(state.selectedComponentIds);
  if (selectedCompIds.size === 0) {
    showToast('Select components to create a subsystem.');
    return;
  }

  saveState();

  const selectedComps = state.components.filter((c: any) => selectedCompIds.has(c.id));
  
  // 1. Calculate selection bounding box and center (cx, cy)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  selectedComps.forEach((c: any) => {
    if (c.x < minX) minX = c.x;
    if (c.x > maxX) maxX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.y > maxY) maxY = c.y;
  });

  const cx = Math.round(((minX + maxX) / 2) / 20) * 20;
  const cy = Math.round(((minY + maxY) / 2) / 20) * 20;

  // 2. Build Union-Find network of all component pins in the schematic
  const ds = new DisjointSet();
  const pinKey = (p: PinRef) => `${p.compId}.${p.terminal}`;

  // Register all pins of all components in Union-Find
  state.components.forEach((c: any) => {
    const pinsMap = state.components.find((comp: any) => comp.id === c.id);
  });

  state.wires.forEach((w: any) => {
    const fromPins = getEndpointPins(w.from, state.wires);
    const toPins = w.to ? getEndpointPins(w.to, state.wires) : [];

    // Union all pins connected by this wire
    const allConnected = [...fromPins, ...toPins];
    for (let i = 1; i < allConnected.length; i++) {
      ds.union(pinKey(allConnected[0]), pinKey(allConnected[i]));
    }
  });

  // 3. Group all schematic pins by Net root representative
  const netMap = new Map<string, { insidePins: PinRef[]; outsidePins: PinRef[] }>();

  state.components.forEach((c: any) => {
    const isSelected = selectedCompIds.has(c.id);
    const pinsList = Object.keys(getComponentPins(c));
    pinsList.forEach(term => {
      const p = { compId: c.id, terminal: term };
      const root = ds.find(pinKey(p));
      if (!netMap.has(root)) {
        netMap.set(root, { insidePins: [], outsidePins: [] });
      }
      const entry = netMap.get(root)!;
      if (isSelected) {
        entry.insidePins.push(p);
      } else {
        entry.outsidePins.push(p);
      }
    });
  });

  // Internal components for the new subsystem (deep copy)
  const internalComponents: any[] = JSON.parse(JSON.stringify(selectedComps));
  const internalWires: any[] = [];
  const externalWires: any[] = [];

  // Categorize wires:
  // If a wire connects two inside endpoints -> internalWire
  // If a wire connects two outside endpoints -> externalWire
  state.wires.forEach((w: any) => {
    const fromPins = getEndpointPins(w.from, state.wires);
    const toPins = w.to ? getEndpointPins(w.to, state.wires) : [];
    
    const fromIn = fromPins.length > 0 && fromPins.every(p => selectedCompIds.has(p.compId));
    const toIn = toPins.length > 0 && toPins.every(p => selectedCompIds.has(p.compId));

    if (fromIn && toIn) {
      internalWires.push(JSON.parse(JSON.stringify(w)));
    } else if (!fromIn && !toIn && fromPins.length > 0 && toPins.length > 0) {
      const fromOut = fromPins.every(p => !selectedCompIds.has(p.compId));
      const toOut = toPins.every(p => !selectedCompIds.has(p.compId));
      if (fromOut && toOut) {
        externalWires.push(JSON.parse(JSON.stringify(w)));
      }
    }
  });

  // 4. Process Crossing Nets and create INPORT, OUTPORT, or E_PORT blocks
  let inportCount = 0;
  let outportCount = 0;
  let eportCount = 0;

  const subsysId = generateNextId('Subsystem', state.components.map((c: any) => c.id));

  netMap.forEach(({ insidePins, outsidePins }) => {
    if (insidePins.length === 0 || outsidePins.length === 0) {
      return; // Fully internal or fully external Net
    }

    // Crossing Net! Determine domain
    let isControl = false;
    [...insidePins, ...outsidePins].forEach(p => {
      const comp = state.components.find((c: any) => c.id === p.compId);
      if (comp && getPinDomain(comp.type, p.terminal, comp) === 'control') {
        isControl = true;
      }
    });

    if (isControl) {
      // Control Domain: check if source output pin is INSIDE or OUTSIDE
      const hasInsideSource = insidePins.some(p => isControlOutputPin(p.compId, p.terminal));

      if (hasInsideSource) {
        // Signal originates INSIDE -> OUTPORT
        outportCount++;
        const portId = `Out${outportCount}`;
        const internalY = (outportCount - 1) * 30 - 30;

        internalComponents.push({
          id: portId,
          type: 'OUTPORT',
          x: 180,
          y: internalY,
          rotation: 0,
          parameters: {}
        });

        // Inside wire: inside output pin -> OUTPORT.In
        const insideSrc = insidePins.find(p => isControlOutputPin(p.compId, p.terminal)) || insidePins[0];
        internalWires.push({
          id: generateNextId('W', internalWires.map((iw: any) => iw.id)),
          from: { type: 'pin', compId: insideSrc.compId, terminal: insideSrc.terminal },
          to: { type: 'pin', compId: portId, terminal: 'In' },
          manualPath: null
        });

        // External wires: Subsystem1.OutX -> outside destination pins
        outsidePins.forEach(outP => {
          externalWires.push({
            id: generateNextId('W', externalWires.map((ew: any) => ew.id)),
            from: { type: 'pin', compId: subsysId, terminal: portId },
            to: { type: 'pin', compId: outP.compId, terminal: outP.terminal },
            manualPath: null
          });
        });

      } else {
        // Signal originates OUTSIDE -> INPORT
        inportCount++;
        const portId = `In${inportCount}`;
        const internalY = (inportCount - 1) * 30 - 30;

        internalComponents.push({
          id: portId,
          type: 'INPORT',
          x: -180,
          y: internalY,
          rotation: 0,
          parameters: {}
        });

        // Inside wires: INPORT.Out -> inside destination pins
        insidePins.forEach(inP => {
          internalWires.push({
            id: generateNextId('W', internalWires.map((iw: any) => iw.id)),
            from: { type: 'pin', compId: portId, terminal: 'Out' },
            to: { type: 'pin', compId: inP.compId, terminal: inP.terminal },
            manualPath: null
          });
        });

        // External wire: outside source pin -> Subsystem1.InX
        const outsideSrc = outsidePins.find(p => isControlOutputPin(p.compId, p.terminal)) || outsidePins[0];
        externalWires.push({
          id: generateNextId('W', externalWires.map((ew: any) => ew.id)),
          from: { type: 'pin', compId: outsideSrc.compId, terminal: outsideSrc.terminal },
          to: { type: 'pin', compId: subsysId, terminal: portId },
          manualPath: null
        });
      }
    } else {
      // Electrical Domain -> E_PORT
      eportCount++;
      const portId = `EP${eportCount}`;
      const internalX = (eportCount - 1) * 60 - 60;

      internalComponents.push({
        id: portId,
        type: 'E_PORT',
        x: internalX,
        y: 180,
        rotation: 0,
        parameters: {}
      });

      // Inside wires: inside pins -> E_PORT.A
      insidePins.forEach(inP => {
        internalWires.push({
          id: generateNextId('W', internalWires.map((iw: any) => iw.id)),
          from: { type: 'pin', compId: inP.compId, terminal: inP.terminal },
          to: { type: 'pin', compId: portId, terminal: 'A' },
          manualPath: null
        });
      });

      // External wires: Subsystem1.EPX -> outside pins
      outsidePins.forEach(outP => {
        externalWires.push({
          id: generateNextId('W', externalWires.map((ew: any) => ew.id)),
          from: { type: 'pin', compId: subsysId, terminal: portId },
          to: { type: 'pin', compId: outP.compId, terminal: outP.terminal },
          manualPath: null
        });
      });
    }
  });

  // 5. Shift coordinates of internal components and manual wire paths by (-cx, -cy)
  internalComponents.forEach((c: any) => {
    if (selectedCompIds.has(c.id)) {
      c.x = Math.round((c.x - cx) / 10) * 10;
      c.y = Math.round((c.y - cy) / 10) * 10;
    }
  });

  internalWires.forEach((w: any) => {
    if (w.manualPath && Array.isArray(w.manualPath)) {
      w.manualPath.forEach((pt: any) => {
        pt.x = Math.round((pt.x - cx) / 10) * 10;
        pt.y = Math.round((pt.y - cy) / 10) * 10;
      });
    }
  });

  const newSubsystemComp = {
    id: subsysId,
    type: 'SUBSYSTEM',
    x: cx,
    y: cy,
    rotation: 0,
    parameters: {},
    sub_schematic: {
      components: internalComponents,
      wires: internalWires
    }
  };

  // 6. Update current level state
  state.components = state.components.filter((c: any) => !selectedCompIds.has(c.id));
  state.components.push(newSubsystemComp);
  state.wires = externalWires;

  // 7. Clear selection and select new Subsystem
  state.selectedComponentIds = [subsysId];
  state.selectedWireIds = [];

  draw();
  updatePropertiesPanel();
  showToast(`Created subsystem ${subsysId}.`);
}
