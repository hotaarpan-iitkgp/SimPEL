import { state, saveState } from './state';
import { generateNextId, showToast } from './utils';
import { draw } from './renderer';
import { updatePropertiesPanel } from './properties';
import { getWireDomain } from './routing';

export function createSubsystemFromSelection(): void {
  const selectedCompIds = new Set<string>(state.selectedComponentIds);
  const selectedWireIds = new Set<string>(state.selectedWireIds);

  if (selectedCompIds.size === 0) {
    showToast('Select components to create a subsystem.');
    return;
  }

  saveState();

  // 1. Identify selected & unselected components
  const selectedComps = state.components.filter((c: any) => selectedCompIds.has(c.id));
  const unselectedComps = state.components.filter((c: any) => !selectedCompIds.has(c.id));
  const unselectedCompIds = new Set<string>(unselectedComps.map((c: any) => c.id));

  // 2. Calculate selection bounding box and center (cx, cy)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  selectedComps.forEach((c: any) => {
    if (c.x < minX) minX = c.x;
    if (c.x > maxX) maxX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.y > maxY) maxY = c.y;
  });

  const cx = Math.round(((minX + maxX) / 2) / 20) * 20;
  const cy = Math.round(((minY + maxY) / 2) / 20) * 20;

  // 3. Classify wires as internal vs crossing
  const internalWires: any[] = [];
  const externalWires: any[] = [];
  const crossingConnections: any[] = [];

  const isEndpointInSelection = (ep: any): boolean => {
    if (!ep) return false;
    if (ep.type === 'pin') return selectedCompIds.has(ep.compId);
    if (ep.type === 'wire') return selectedWireIds.has(ep.wireId);
    return false;
  };

  state.wires.forEach((w: any) => {
    const fromIn = isEndpointInSelection(w.from);
    const toIn = w.to ? isEndpointInSelection(w.to) : false;

    if (fromIn && toIn) {
      // Internal wire: both ends inside selection
      internalWires.push(JSON.parse(JSON.stringify(w)));
    } else if (!fromIn && !toIn) {
      // External wire: both ends outside selection
      externalWires.push(JSON.parse(JSON.stringify(w)));
    } else {
      // Crossing wire: one end inside, one end outside
      crossingConnections.push(JSON.parse(JSON.stringify(w)));
    }
  });

  // Internal components for the new subsystem (deep copy)
  const internalComponents: any[] = JSON.parse(JSON.stringify(selectedComps));

  // Ports to be instantiated inside sub_schematic
  let inportCount = 0;
  let outportCount = 0;
  let eportCount = 0;

  // Map crossing connections to create appropriate INPORT, OUTPORT, or E_PORT blocks
  crossingConnections.forEach((w: any) => {
    const domain = getWireDomain(w);
    const fromIn = isEndpointInSelection(w.from);

    if (domain === 'control') {
      if (!fromIn) {
        // Signal originates OUTSIDE and enters INSIDE -> INPORT
        inportCount++;
        const portId = `In${inportCount}`;
        const internalY = (inportCount - 1) * 40 - 40;

        // Add INPORT component inside sub_schematic
        internalComponents.push({
          id: portId,
          type: 'INPORT',
          x: -180,
          y: internalY,
          rotation: 0,
          parameters: {}
        });

        // Internal wire: INPORT.Out -> internal component's input pin
        const internalDestEp = {
          type: w.to.type,
          compId: w.to.compId,
          terminal: w.to.terminal,
          wireId: w.to.wireId,
          x: w.to.x,
          y: w.to.y
        };

        internalWires.push({
          id: generateNextId('W', internalWires.map((iw: any) => iw.id)),
          from: { type: 'pin', compId: portId, terminal: 'Out' },
          to: internalDestEp,
          manualPath: null
        });

        // External wire: external source -> newSubsystem.InX
        externalWires.push({
          id: w.id,
          from: w.from,
          to: { type: 'pin', compId: '__SUBSYS_ID__', terminal: portId },
          manualPath: w.manualPath
        });

      } else {
        // Signal originates INSIDE and exits OUTSIDE -> OUTPORT
        outportCount++;
        const portId = `Out${outportCount}`;
        const internalY = (outportCount - 1) * 40 - 40;

        // Add OUTPORT component inside sub_schematic
        internalComponents.push({
          id: portId,
          type: 'OUTPORT',
          x: 180,
          y: internalY,
          rotation: 0,
          parameters: {}
        });

        // Internal wire: internal component's output pin -> OUTPORT.In
        const internalSrcEp = {
          type: w.from.type,
          compId: w.from.compId,
          terminal: w.from.terminal,
          wireId: w.from.wireId,
          x: w.from.x,
          y: w.from.y
        };

        internalWires.push({
          id: generateNextId('W', internalWires.map((iw: any) => iw.id)),
          from: internalSrcEp,
          to: { type: 'pin', compId: portId, terminal: 'In' },
          manualPath: null
        });

        // External wire: newSubsystem.OutX -> external destination
        externalWires.push({
          id: w.id,
          from: { type: 'pin', compId: '__SUBSYS_ID__', terminal: portId },
          to: w.to,
          manualPath: w.manualPath
        });
      }
    } else {
      // Electrical domain -> E_PORT
      eportCount++;
      const portId = `EP${eportCount}`;
      const internalX = (eportCount - 1) * 60 - 60;

      // Add E_PORT component inside sub_schematic
      internalComponents.push({
        id: portId,
        type: 'E_PORT',
        x: internalX,
        y: 180,
        rotation: 0,
        parameters: {}
      });

      if (fromIn) {
        // Internal pin is from, external is to
        const internalEp = {
          type: w.from.type,
          compId: w.from.compId,
          terminal: w.from.terminal,
          wireId: w.from.wireId,
          x: w.from.x,
          y: w.from.y
        };

        internalWires.push({
          id: generateNextId('W', internalWires.map((iw: any) => iw.id)),
          from: internalEp,
          to: { type: 'pin', compId: portId, terminal: 'A' },
          manualPath: null
        });

        if (w.to) {
          externalWires.push({
            id: w.id,
            from: { type: 'pin', compId: '__SUBSYS_ID__', terminal: portId },
            to: w.to,
            manualPath: w.manualPath
          });
        }
      } else {
        // External pin is from, internal is to
        const internalEp = {
          type: w.to.type,
          compId: w.to.compId,
          terminal: w.to.terminal,
          wireId: w.to.wireId,
          x: w.to.x,
          y: w.to.y
        };

        internalWires.push({
          id: generateNextId('W', internalWires.map((iw: any) => iw.id)),
          from: { type: 'pin', compId: portId, terminal: 'A' },
          to: internalEp,
          manualPath: null
        });

        externalWires.push({
          id: w.id,
          from: w.from,
          to: { type: 'pin', compId: '__SUBSYS_ID__', terminal: portId },
          manualPath: w.manualPath
        });
      }
    }
  });

  // 4. Shift coordinates of internal components and manual wire paths by (-cx, -cy)
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

  // 5. Generate new SUBSYSTEM component block ID and assign to external wires
  const subsysId = generateNextId('Subsystem', state.components.map((c: any) => c.id));

  externalWires.forEach((w: any) => {
    if (w.from && w.from.compId === '__SUBSYS_ID__') w.from.compId = subsysId;
    if (w.to && w.to.compId === '__SUBSYS_ID__') w.to.compId = subsysId;
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

  // 6. Update current level state: remove selected components, add SUBSYSTEM, replace wires
  state.components = state.components.filter((c: any) => !selectedCompIds.has(c.id));
  state.components.push(newSubsystemComp);
  state.wires = externalWires;

  // 7. Clear old selection and select the newly created Subsystem
  state.selectedComponentIds = [subsysId];
  state.selectedWireIds = [];

  draw();
  updatePropertiesPanel();
  showToast(`Created subsystem ${subsysId}.`);
}
