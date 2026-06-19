import { state, saveState } from './state';
import { 
  getWireEndpointCoords, 
  getWireEndpointDir, 
  getWireDomain, 
  getOrthogonalPath, 
  getTerminalCoords, 
  getEndpointDomain, 
  getRigidMovingWires,
  snapWireToWireEndpoints,
  getWirePath,
  getPreviewPathPoints,
  getPinDomain
} from './routing';
import { getComponentSVG, createTerminalOverlay } from './components';
import { pathToString, screenToCanvas, showToast, generateNextId } from './utils';
import { updatePropertiesPanel, openCodeEditorModal, openMaskValuesModal } from './properties';
import { completeWire, isControlInputPin, normalizeControlWires, getControlOutputPins, enterSubsystem } from './actions';
import { getComponentPins } from './config';

// Keep manual paths connected to moved elements and preserve orthogonality
export function updateManualWireEndpoints(): void {
  state.wires.forEach((wire: any) => {
    if (!wire.manualPath || wire.manualPath.length < 2) return;
    
    const n = wire.manualPath.length;
    const currentStart = getWireEndpointCoords(wire.from);
    const currentEnd = getWireEndpointCoords(wire.to);
    
    if (n === 2) {
      wire.manualPath[0] = currentStart;
      wire.manualPath[1] = currentEnd;
      return;
    }
    
    // Check start endpoint
    const oldStart = wire.manualPath[0];
    const dxStart = currentStart.x - oldStart.x;
    const dyStart = currentStart.y - oldStart.y;
    
    if (dxStart !== 0 || dyStart !== 0) {
      // Update start point
      wire.manualPath[0] = currentStart;
      // Adjust second point to maintain orthogonality
      const p1 = wire.manualPath[1];
      const isHorizontal = Math.abs(oldStart.y - p1.y) < 2;
      if (isHorizontal) {
        p1.y += dyStart;
      } else {
        p1.x += dxStart;
      }
    }
    
    // Check end endpoint
    const oldEnd = wire.manualPath[n - 1];
    const dxEnd = currentEnd.x - oldEnd.x;
    const dyEnd = currentEnd.y - oldEnd.y;
    
    if (dxEnd !== 0 || dyEnd !== 0) {
      // Update end point
      wire.manualPath[n - 1] = currentEnd;
      // Adjust second to last point to maintain orthogonality
      const pLast = wire.manualPath[n - 2];
      const isHorizontal = Math.abs(oldEnd.y - pLast.y) < 2;
      if (isHorizontal) {
        pLast.y += dyEnd;
      } else {
        pLast.x += dxEnd;
      }
    }
  });
}

// Update all wire paths and junction dots in DOM directly without full redraw
export function updateAllWirePathsInDOM(): void {
  snapWireToWireEndpoints();
  updateManualWireEndpoints();
  
  state.wires.forEach((wire: any) => {
    const pathPoints = getWirePath(wire);
    const pathStr = pathToString(pathPoints);
    const pathEl = document.querySelector(`.wire[data-id="${wire.id}"]`);
    if (pathEl) {
      pathEl.setAttribute('d', pathStr);
    }
  });
  
  // Update the junction dots
  const junctionsGroup = document.getElementById('junctions-group');
  if (junctionsGroup) {
    junctionsGroup.innerHTML = '';
    state.wires.forEach((wire: any) => {
      if (wire.from.type === 'wire') {
        drawJunctionDot(wire.from.x, wire.from.y);
      }
      if (wire.to.type === 'wire') {
        drawJunctionDot(wire.to.x, wire.to.y);
      }
    });
  }
}

// Render Selected Wire Handles
export function updateHandlesInDOM(wire: any, pathPoints: Array<{ x: number; y: number }>): void {
  const handlesGroup = document.getElementById('handles-group');
  if (!handlesGroup) return;
  handlesGroup.innerHTML = '';
  
  const L = pathPoints.length;
  const svg = document.getElementById('canvas-svg');
  
  // 1. Draggable Segment Handles: allowed only on intermediate segments (1 <= i <= L-3)
  for (let i = 1; i <= L - 3; i++) {
    const pA = pathPoints[i];
    const pB = pathPoints[i + 1];
    
    const isHorizontal = Math.abs(pA.y - pB.y) < 2;
    
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(pA.x));
    line.setAttribute('y1', String(pA.y));
    line.setAttribute('x2', String(pB.x));
    line.setAttribute('y2', String(pB.y));
    line.setAttribute('class', 'wire-segment-drag-handle');
    line.setAttribute('cursor', isHorizontal ? 'ns-resize' : 'ew-resize');
    
    line.addEventListener('pointerdown', (e: any) => {
      if (e.button !== 0) return; // Ignore right/middle click so it bubbles up to SVG for panning
      e.stopPropagation();
      try {
        if (svg) svg.setPointerCapture(e.pointerId);
      } catch (err) {
        // Safe fallback
      }
      if (!wire.manualPath) {
        wire.manualPath = JSON.parse(JSON.stringify(pathPoints));
      }
      state.draggingWireSegment = {
        wireId: wire.id,
        index1: i,
        index2: i + 1,
        direction: isHorizontal ? 'Y' : 'X',
        handleEl: e.target
      };
    });
    
    handlesGroup.appendChild(line);
  }
  
  // 2. Midpoint splitting handles (+ sign) for ALL segments (0 <= i <= L-2)
  for (let i = 0; i <= L - 2; i++) {
    const pA = pathPoints[i];
    const pB = pathPoints[i + 1];
    const midX = (pA.x + pB.x) / 2;
    const midY = (pA.y + pB.y) / 2;
    
    if (Math.abs(pA.x - pB.x) < 15 && Math.abs(pA.y - pB.y) < 15) continue;
    
    const isHorizontal = Math.abs(pA.y - pB.y) < 2;
    
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'wire-midpoint-handle');
    g.setAttribute('style', 'cursor: cell;');
    
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(midX));
    circle.setAttribute('cy', String(midY));
    circle.setAttribute('r', '4.5');
    circle.setAttribute('style', 'fill: #06b6d4; stroke: #ffffff; stroke-width: 1; fill-opacity: 0.85;');
    
    const cross = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    cross.setAttribute('d', `M ${midX - 2.5} ${midY} L ${midX + 2.5} ${midY} M ${midX} ${midY - 2.5} L ${midX} ${midY + 2.5}`);
    cross.setAttribute('style', 'stroke: #ffffff; stroke-width: 1; pointer-events: none;');
    
    g.appendChild(circle);
    g.appendChild(cross);
    
    g.addEventListener('pointerdown', (e: any) => {
      if (e.button !== 0) return; // Ignore right/middle click so it bubbles up to SVG for panning
      e.stopPropagation();
      try {
        if (svg) svg.setPointerCapture(e.pointerId);
      } catch (err) {
        // Safe fallback
      }
      const currentComputed = JSON.parse(JSON.stringify(pathPoints));
      if (!wire.manualPath) {
        wire.manualPath = currentComputed;
      }
      
      if (isHorizontal) {
        const C1 = { x: midX, y: pA.y };
        const C2 = { x: midX, y: pA.y };
        const C3 = { x: pB.x, y: pA.y };
        wire.manualPath.splice(i + 1, 0, C1, C2, C3);
        
        state.draggingWireSegment = {
          wireId: wire.id,
          index1: i + 2,
          index2: i + 3,
          direction: 'Y'
        };
      } else {
        const C1 = { x: pA.x, y: midY };
        const C2 = { x: pA.x, y: midY };
        const C3 = { x: pA.x, y: pB.y };
        wire.manualPath.splice(i + 1, 0, C1, C2, C3);
        
        state.draggingWireSegment = {
          wireId: wire.id,
          index1: i + 2,
          index2: i + 3,
          direction: 'X'
        };
      }
      draw();
    });
    
    handlesGroup.appendChild(g);
  }
}

// Redraw Entire Canvas Items
export function draw(): void {
  const componentsGroup = document.getElementById('components-group');
  const wiresGroup = document.getElementById('wires-group');
  const junctionsGroup = document.getElementById('junctions-group');
  const handlesGroup = document.getElementById('handles-group');
  
  if (!componentsGroup || !wiresGroup || !handlesGroup) return;
  
  componentsGroup.innerHTML = '';
  wiresGroup.innerHTML = '';
  if (junctionsGroup) junctionsGroup.innerHTML = '';
  handlesGroup.innerHTML = '';
  
  // Keep manual paths connected to moved elements
  snapWireToWireEndpoints();
  updateManualWireEndpoints();
  
  // Render Wires
  state.wires.forEach((wire: any) => {
    const pathPoints = getWirePath(wire);
    const pathStr = pathToString(pathPoints);
    
    const domain = getWireDomain(wire);
    const isControl = (domain === 'control');
    
    const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathEl.setAttribute('d', pathStr);
    pathEl.setAttribute('class', `wire ${isControl ? 'control-net' : ''} ${state.selectedWireIds.includes(wire.id) ? 'selected' : ''}`);
    pathEl.setAttribute('data-id', wire.id);
    if (isControl) {
      const hasArrowAtStart = (wire.from.type === 'pin' && isControlInputPin(wire.from.compId, wire.from.terminal));
      const hasArrowAtEnd = (wire.to && (wire.to.type === 'wire' || (wire.to.type === 'pin' && isControlInputPin(wire.to.compId, wire.to.terminal))));
      
      if (hasArrowAtStart) {
        pathEl.setAttribute('marker-start', 'url(#control-arrow)');
      }
      if (hasArrowAtEnd) {
        pathEl.setAttribute('marker-end', 'url(#control-arrow)');
      }
    }
    
    // Wire select / Click-to-connect-wire event listener
    pathEl.addEventListener('pointerdown', (e: any) => {
      if (e.button !== 0) return; // Ignore right/middle click so it bubbles up to SVG for panning
      if (state.activeWire) {
        return; // Let it bubble up to canvas-svg
      }
      e.stopPropagation();
      
      const mousePos = screenToCanvas(e.clientX, e.clientY);
      const snapX = Math.round(mousePos.x / 20) * 20;
      const snapY = Math.round(mousePos.y / 20) * 20;
      
      if (state.activeWire) {
        // Finish active wire onto this wire!
        completeWire({ type: 'wire', wireId: wire.id, x: snapX, y: snapY });
      } else {
        // Select wire
        if (e.shiftKey) {
          if (state.selectedWireIds.includes(wire.id)) {
            state.selectedWireIds = state.selectedWireIds.filter((id: string) => id !== wire.id);
          } else {
            state.selectedWireIds.push(wire.id);
          }
        } else {
          state.selectedWireIds = [wire.id];
          state.selectedComponentIds = [];
        }
        draw();
        updatePropertiesPanel();
      }
    });
    
    wiresGroup.appendChild(pathEl);
  });
  
  // Draw T-Junction visual connection dots
  state.wires.forEach((wire: any) => {
    if (wire.from.type === 'wire') {
      drawJunctionDot(wire.from.x, wire.from.y);
    }
    if (wire.to.type === 'wire') {
      drawJunctionDot(wire.to.x, wire.to.y);
    }
  });
  
  // Render Selected Wire Draggable Segments & Midpoints Splitting handles
  if (state.selectedWireIds.length === 1 && state.selectedComponentIds.length === 0) {
    const wire = state.wires.find((w: any) => w.id === state.selectedWireIds[0]);
    if (wire) {
      const p1 = getWireEndpointCoords(wire.from);
      const dir1 = getWireEndpointDir(wire.from);
      const p2 = getWireEndpointCoords(wire.to);
      const dir2 = getWireEndpointDir(wire.to);
      
      let pathPoints = [];
      if (wire.manualPath) {
        pathPoints = wire.manualPath;
      } else {
        pathPoints = getOrthogonalPath(p1, dir1, p2, dir2);
      }
      
      updateHandlesInDOM(wire, pathPoints);
    }
  }
  
  // Render Components
  state.components.forEach((comp: any) => {
    const isSelected = state.selectedComponentIds.includes(comp.id);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', `component ${isSelected ? 'selected' : ''}`);
    g.setAttribute('data-id', comp.id);
    g.setAttribute('transform', `translate(${comp.x}, ${comp.y}) rotate(${comp.rotation})`);
    
    // Component Body SVG
    g.innerHTML = getComponentSVG(comp);
    
    // Terminals overlays
    const pinMap = getComponentPins(comp);
    Object.keys(pinMap).forEach(terminalName => {
      const pin = pinMap[terminalName];
      const isConnected = state.wires.some((w: any) => 
        (w.from.type === 'pin' && w.from.compId === comp.id && w.from.terminal === terminalName) ||
        (w.to.type === 'pin' && w.to.compId === comp.id && w.to.terminal === terminalName)
      );
      const termOverlay = createTerminalOverlay(comp.id, terminalName, pin.x, pin.y, isConnected);
      g.appendChild(termOverlay);
    });
    
    // Double click to look inside subsystem, or open mask parameters values modal if masked
    g.addEventListener('dblclick', (e: any) => {
      e.stopPropagation();
      e.preventDefault();
      if (comp.type === 'SUBSYSTEM') {
        const hasMask = comp.mask && comp.mask.parameters && comp.mask.parameters.length > 0;
        if (hasMask) {
          openMaskValuesModal(comp);
        } else {
          enterSubsystem(comp.id);
        }
      }
    });
    
    // Dragging & Selecting component handler
    g.addEventListener('pointerdown', (e: any) => {
      if (e.button !== 0) return; // Ignore right/middle click so it bubbles up to SVG for panning
      if (e.target.classList.contains('terminal-visual') || e.target.parentElement.classList.contains('terminal-handle')) return;
      if (state.activeWire) {
        return; // Bubble event up to canvas-svg for snap/corner point placement
      }

      // Auto-routing when Ctrl is pressed and other components are already selected
      if (e.ctrlKey && state.selectedComponentIds.length > 0 && !state.selectedComponentIds.includes(comp.id)) {
        e.stopPropagation();
        e.preventDefault();
        
        const selectedComps = state.selectedComponentIds
          .map((id: string) => state.components.find((c: any) => c.id === id))
          .filter((c: any) => c && c.id !== comp.id);

        if (selectedComps.length === 0) return;

        saveState();
        let connectedAny = false;
        let controlRoutedCount = 0;
        let electricalRoutedCount = 0;

        // Helper to check if a pin is already connected
        const isPinConnected = (compId: string, pinName: string) => {
          return state.wires.some((w: any) => 
            (w.from.type === 'pin' && w.from.compId === compId && w.from.terminal === pinName) ||
            (w.to && w.to.type === 'pin' && w.to.compId === compId && w.to.terminal === pinName)
          );
        };

        const pinsMap = getComponentPins(comp);
        const targetAllPins = Object.keys(pinsMap);
        
        // Target control inputs
        const targetControlInputs = targetAllPins.filter(pinName => isControlInputPin(comp.id, pinName));
        // Target electrical pins
        const targetElectricalPins = targetAllPins.filter(pinName => getPinDomain(comp.type, pinName) === 'electrical');

        const locallyConnectedPins = new Set<string>();

        selectedComps.forEach((c: any) => {
          const cPinsMap = getComponentPins(c);
          const cAllPins = Object.keys(cPinsMap);
          const cElectricalPins = cAllPins.filter(pinName => getPinDomain(c.type, pinName) === 'electrical');

          // Decide domain: if both c and target have electrical pins, route electrical wire
          if (cElectricalPins.length > 0 && targetElectricalPins.length > 0) {
            const srcPinsUnconnected = cElectricalPins.filter(p => !isPinConnected(c.id, p));
            const srcCandidates = srcPinsUnconnected.length > 0 ? srcPinsUnconnected : cElectricalPins;

            const tgtPinsUnconnected = targetElectricalPins.filter(p => !isPinConnected(comp.id, p) && !locallyConnectedPins.has(p));
            const tgtCandidates = tgtPinsUnconnected.length > 0 ? tgtPinsUnconnected : targetElectricalPins;

            let bestSrcPin = srcCandidates[0];
            let bestTgtPin = tgtCandidates[0];
            let minDistance = Infinity;

            srcCandidates.forEach(s => {
              const coordS = getTerminalCoords(c, s);
              tgtCandidates.forEach(t => {
                const coordT = getTerminalCoords(comp, t);
                const dist = Math.hypot(coordS.x - coordT.x, coordS.y - coordT.y);
                if (dist < minDistance) {
                  minDistance = dist;
                  bestSrcPin = s;
                  bestTgtPin = t;
                }
              });
            });

            if (bestSrcPin && bestTgtPin) {
              state.wires.push({
                id: generateNextId('W', state.wires.map((w: any) => w.id)),
                from: { type: 'pin', compId: c.id, terminal: bestSrcPin },
                to: { type: 'pin', compId: comp.id, terminal: bestTgtPin },
                manualPath: null
              });
              locallyConnectedPins.add(bestTgtPin);
              connectedAny = true;
              electricalRoutedCount++;
            }
          } else {
            // Control Connection fallback
            const outputs = getControlOutputPins(c);
            if (outputs.length > 0 && targetControlInputs.length > 0) {
              const srcPin = outputs[0];
              const tgtPinsUnconnected = targetControlInputs.filter(p => !isPinConnected(comp.id, p) && !locallyConnectedPins.has(p));
              const tgtPin = tgtPinsUnconnected.length > 0 ? tgtPinsUnconnected[0] : targetControlInputs[0];

              if (tgtPin) {
                state.wires.push({
                  id: generateNextId('W', state.wires.map((w: any) => w.id)),
                  from: { type: 'pin', compId: c.id, terminal: srcPin },
                  to: { type: 'pin', compId: comp.id, terminal: tgtPin },
                  manualPath: null
                });
                locallyConnectedPins.add(tgtPin);
                connectedAny = true;
                controlRoutedCount++;
              }
            }
          }
        });

        if (connectedAny) {
          normalizeControlWires();
          
          // Selection chaining: select only the clicked target component
          state.selectedComponentIds = [comp.id];
          state.selectedWireIds = [];
          
          draw();
          updatePropertiesPanel();
          
          const msgParts = [];
          if (electricalRoutedCount > 0) msgParts.push(`${electricalRoutedCount} electrical wire(s)`);
          if (controlRoutedCount > 0) msgParts.push(`${controlRoutedCount} control signal(s)`);
          showToast(`Auto-routed ${msgParts.join(' and ')} to ${comp.id}.`);
        } else {
          showToast(`No compatible pins found to route between selected component(s) and ${comp.id}.`);
        }
        return;
      }
      
      // Manual double-click detection for CSCRIPT or SCOPE blocks
      const now = Date.now();
      if (['CSCRIPT', 'GEN_EBLOCK'].includes(comp.type) && comp.lastClickTime && (now - comp.lastClickTime < 300)) {
        e.stopPropagation();
        e.preventDefault();
        comp.lastClickTime = 0;
        openCodeEditorModal(comp);
        return;
      }
      if (comp.type === 'SCOPE' && comp.lastClickTime && (now - comp.lastClickTime < 300)) {
        e.stopPropagation();
        e.preventDefault();
        comp.lastClickTime = 0;
        if ((window as any).onScopeDoubleClick) {
          (window as any).onScopeDoubleClick(comp.id);
        }
        return;
      }
      if (comp.type === 'MANUAL_SWITCH' && comp.lastClickTime && (now - comp.lastClickTime < 300)) {
        e.stopPropagation();
        e.preventDefault();
        comp.lastClickTime = 0;
        const currentState = comp.parameters.state || 'Input 1';
        comp.parameters.state = (currentState === 'Input 1') ? 'Input 2' : 'Input 1';
        saveState();
        draw();
        updatePropertiesPanel();
        showToast(`Toggled switch ${comp.id} to ${comp.parameters.state}`);
        return;
      }
      comp.lastClickTime = now;

      e.stopPropagation();
      const svg = document.getElementById('canvas-svg');
      try {
        if (svg) svg.setPointerCapture(e.pointerId);
      } catch (err) {
        // Safe fallback
      }
      
      if (e.shiftKey) {
        if (state.selectedComponentIds.includes(comp.id)) {
          state.selectedComponentIds = state.selectedComponentIds.filter((id: string) => id !== comp.id);
        } else {
          state.selectedComponentIds.push(comp.id);
        }
      } else {
        if (!state.selectedComponentIds.includes(comp.id)) {
          state.selectedComponentIds = [comp.id];
          state.selectedWireIds = [];
        }
      }
      
      // Initialize dragging for all selected components and rigid wires
      state.draggingComponent = comp;
      state.dragStartMouse = screenToCanvas(e.clientX, e.clientY);
      state.draggedComponentsStart = state.selectedComponentIds.map((id: string) => {
        const c = state.components.find((x: any) => x.id === id);
        return { id, x: c.x, y: c.y };
      });
      
      state.rigidMovingWireIds = getRigidMovingWires();
      state.draggedWiresStart = state.rigidMovingWireIds.map((id: string) => {
        const wire = state.wires.find((w: any) => w.id === id);
        
        let pathPoints = [];
        if (wire.manualPath) {
          pathPoints = JSON.parse(JSON.stringify(wire.manualPath));
        } else {
          const p1 = getWireEndpointCoords(wire.from);
          const dir1 = getWireEndpointDir(wire.from);
          const p2 = getWireEndpointCoords(wire.to);
          const dir2 = getWireEndpointDir(wire.to);
          pathPoints = getOrthogonalPath(p1, dir1, p2, dir2);
        }
        
        return {
          id: id,
          initialPath: pathPoints,
          hasManualPath: !!wire.manualPath,
          initialFrom: { ...wire.from },
          initialTo: { ...wire.to }
        };
      });
      
      state.draggedWireEndpointsStart = state.wires.map((w: any) => ({
        id: w.id,
        from: { ...w.from },
        to: { ...w.to }
      }));
      
      draw();
      updatePropertiesPanel();
    });
    
    componentsGroup.appendChild(g);
  });
  
  // Render Preview Wire
  const previewWireEl = document.getElementById('preview-wire');
  if (previewWireEl) {
    if (state.activeWire) {
      const pathPoints = getPreviewPathPoints(state.activeWire);
      const pathStr = pathToString(pathPoints);
      
      // Set dynamic preview styling based on layer domain
      const domain = getEndpointDomain(state.activeWire.from);
      if (domain === 'control') {
        previewWireEl.setAttribute('stroke', 'var(--canvas-wire-control)');
        previewWireEl.setAttribute('stroke-width', '1.5');
      } else {
        previewWireEl.setAttribute('stroke', 'var(--canvas-wire-power)');
        previewWireEl.setAttribute('stroke-width', '2.0');
      }
      
      previewWireEl.setAttribute('d', pathStr);
      previewWireEl.setAttribute('display', 'block');
    } else {
      previewWireEl.setAttribute('display', 'none');
    }
  }
  
  // Enable/Disable undo toolbar button
  const btnUndo = document.getElementById('btn-undo');
  if (btnUndo) {
    if (state.undoStack.length === 0) {
      btnUndo.setAttribute('disabled', 'true');
      btnUndo.style.opacity = '0.5';
      btnUndo.style.cursor = 'not-allowed';
    } else {
      btnUndo.removeAttribute('disabled');
      btnUndo.style.opacity = '1';
      btnUndo.style.cursor = 'pointer';
    }
  }

  // Update displays
  updateFooterInfo();
}

// Draw solid junction dot at coordinate x, y
export function drawJunctionDot(x: number, y: number): void {
  const junctionsGroup = document.getElementById('junctions-group');
  if (!junctionsGroup) return;
  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  dot.setAttribute('cx', String(x));
  dot.setAttribute('cy', String(y));
  dot.setAttribute('r', '4');
  dot.setAttribute('class', 'junction-dot');
  dot.setAttribute('style', 'pointer-events: none;');
  junctionsGroup.appendChild(dot);
}

// Update bottom status bar information
export function updateFooterInfo(): void {
  const selectionDisplay = document.getElementById('selection-display');
  if (!selectionDisplay) return;
  if (state.selectedComponentIds.length > 0) {
    selectionDisplay.textContent = `Selection: ${state.selectedComponentIds.length} components`;
  } else if (state.selectedWireIds.length > 0) {
    selectionDisplay.textContent = `Selection: ${state.selectedWireIds.length} wires`;
  } else {
    selectionDisplay.textContent = `Selection: None`;
  }
}
