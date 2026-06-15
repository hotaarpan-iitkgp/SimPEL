import { state, saveState } from './state';
import { screenToCanvas, updateViewportTransform, pathToString } from './utils';
import { draw, updateAllWirePathsInDOM } from './renderer';
import { 
  resolveRoutingSnap, 
  getWireEndpointCoords, 
  getWireEndpointDir, 
  simplifyPath, 
  rectIntersectsSegment,
  getOrthogonalPath,
  getPreviewPathPoints,
  getComponentBounds
} from './routing';
import { 
  completeWire, 
  copySelected, 
  pasteSelected, 
  rotateSelected, 
  deleteSelected, 
  clearWorkspace, 
  undo 
} from './actions';
import { updatePropertiesPanel } from './properties';
import { openPlotConfig } from './plotConfig';
import { openSimSettings } from './simSettings';

let isSpacePressed = false;
let pointerListeners: any = {};

export function getIsSpacePressed() {
  return isSpacePressed;
}

// Bind all interactive cursor inputs, wheel scaling and key listeners to the SVG canvas
export function initInteractions(svg: SVGSVGElement): () => void {
  // Sync the DOM transform with the current zoom/pan state immediately
  updateViewportTransform();
  
  // Clean up any stale listeners first to avoid double-binding on tab switches
  const cleanup = () => {
    svg.removeEventListener('pointerdown', handlePointerDown);
    svg.removeEventListener('pointermove', handlePointerMove);
    svg.removeEventListener('pointerup', handlePointerUp);
    svg.removeEventListener('wheel', handleWheel);
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
  };
  
  // 1. Pointer Down event
  const handlePointerDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('.terminal-handle') || (e.target as HTMLElement).closest('.wire-segment-drag-handle') || (e.target as HTMLElement).closest('.wire-midpoint-handle')) {
      return; // Handled by terminal overlay and handle listeners directly
    }
    
    e.preventDefault();
    const mousePos = screenToCanvas(e.clientX, e.clientY);
    state.lastMousePos = mousePos;
    
    // Middle click OR spacebar press triggers workspace panning
    if (e.button === 1 || isSpacePressed || e.shiftKey && e.button === 0) {
      state.isPanning = true;
      state.panStart = { x: e.clientX, y: e.clientY };
      svg.style.cursor = 'grabbing';
      return;
    }
    
    // Left click on canvas background
    if (e.button === 0) {
      if (state.activeWire) {
        // Wire drawing is active: click adds intermediate routing corner point
        const snap = resolveRoutingSnap(mousePos);
        if (snap) {
          completeWire(snap);
          draw();
        } else {
          // Add grid-aligned corner point
          if (!state.activeWire.intermediatePoints) {
            state.activeWire.intermediatePoints = [];
          }
          const snapX = Math.round(mousePos.x / 20) * 20;
          const snapY = Math.round(mousePos.y / 20) * 20;
          state.activeWire.intermediatePoints.push({ x: snapX, y: snapY });
          state.activeWire.target = { x: snapX, y: snapY };
          draw();
        }
      } else {
        // Clear previous selections and start box marquee selection
        state.selectedComponentIds = [];
        state.selectedWireIds = [];
        updatePropertiesPanel();
        
        state.isBoxSelecting = true;
        state.boxSelectStart = mousePos;
        state.boxSelectEnd = mousePos;
        
        // Render box marquee directly in DOM
        const box = document.getElementById('box-select-marquee');
        if (box) {
          box.setAttribute('x', String(Math.min(state.boxSelectStart.x, state.boxSelectEnd.x)));
          box.setAttribute('y', String(Math.min(state.boxSelectStart.y, state.boxSelectEnd.y)));
          box.setAttribute('width', '0');
          box.setAttribute('height', '0');
          box.setAttribute('display', 'block');
        }
        draw();
      }
    }
  };
  
  // 2. Pointer Move event
  const handlePointerMove = (e: PointerEvent) => {
    const mousePos = screenToCanvas(e.clientX, e.clientY);
    
    // Update bottom grid coordinates reader display
    const labelX = document.getElementById('footer-coord-x');
    const labelY = document.getElementById('footer-coord-y');
    if (labelX && labelY) {
      labelX.textContent = `X: ${Math.round(mousePos.x)}`;
      labelY.textContent = `Y: ${Math.round(mousePos.y)}`;
    }
    
    // A. Viewport Panning
    if (state.isPanning) {
      const dx = e.clientX - state.panStart.x;
      const dy = e.clientY - state.panStart.y;
      state.panX += dx;
      state.panY += dy;
      state.panStart = { x: e.clientX, y: e.clientY };
      updateViewportTransform();
      return;
    }
    
    // B. Interactive Component box-dragging
    if (state.draggingComponent) {
      const dx = mousePos.x - state.dragStartMouse.x;
      const dy = mousePos.y - state.dragStartMouse.y;
      
      const gridSnapX = Math.round(dx / 20) * 20;
      const gridSnapY = Math.round(dy / 20) * 20;
      
      // Drag components
      state.draggedComponentsStart.forEach((item: any) => {
        const comp = state.components.find((x: any) => x.id === item.id);
        if (comp) {
          comp.x = item.x + gridSnapX;
          comp.y = item.y + gridSnapY;
        }
      });
      
      // Rigidly move matching wires and their manual corners
      state.draggedWiresStart.forEach((item: any) => {
        const wire = state.wires.find((w: any) => w.id === item.id);
        if (!wire) return;
        
        if (item.hasManualPath) {
          wire.manualPath = item.initialPath.map((pt: any) => ({
            x: pt.x + gridSnapX,
            y: pt.y + gridSnapY
          }));
        }
      });
      
      // Update DOM components translate transforms directly
      state.selectedComponentIds.forEach((id: string) => {
        const comp = state.components.find((x: any) => x.id === id);
        const compEl = document.querySelector(`.component[data-id="${id}"]`);
        if (comp && compEl) {
          compEl.setAttribute('transform', `translate(${comp.x}, ${comp.y}) rotate(${comp.rotation})`);
        }
      });
      
      updateAllWirePathsInDOM();
      return;
    }
    
    // C. Interactive manual wire segment dragging
    if (state.draggingWireSegment) {
      const wire = state.wires.find((w: any) => w.id === state.draggingWireSegment.wireId);
      if (wire && wire.manualPath) {
        const idx1 = state.draggingWireSegment.index1;
        const idx2 = state.draggingWireSegment.index2;
        
        const snapVal = Math.round((state.draggingWireSegment.direction === 'X' ? mousePos.x : mousePos.y) / 20) * 20;
        
        if (state.draggingWireSegment.direction === 'X') {
          wire.manualPath[idx1].x = snapVal;
          if (wire.manualPath[idx2]) wire.manualPath[idx2].x = snapVal;
        } else {
          wire.manualPath[idx1].y = snapVal;
          if (wire.manualPath[idx2]) wire.manualPath[idx2].y = snapVal;
        }
        
        // Collinear simplify check on drag releasing
        updateAllWirePathsInDOM();
        
        // Re-draw handles overlay
        const pathPoints = simplifyPath(wire.manualPath);
        const L = pathPoints.length;
        if (L > 0) {
          const handlesGroup = document.getElementById('handles-group');
          if (handlesGroup) {
            handlesGroup.innerHTML = '';
            // Temporary re-draw dragging line segment to follow cursor
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            const pt1 = pathPoints[Math.min(idx1, L - 1)];
            const pt2 = pathPoints[Math.min(idx2, L - 1)];
            if (pt1 && pt2) {
              line.setAttribute('x1', String(pt1.x));
              line.setAttribute('y1', String(pt1.y));
              line.setAttribute('x2', String(pt2.x));
              line.setAttribute('y2', String(pt2.y));
              line.setAttribute('class', 'wire-segment-drag-handle active');
              line.setAttribute('cursor', state.draggingWireSegment.direction === 'Y' ? 'ns-resize' : 'ew-resize');
              handlesGroup.appendChild(line);
            }
          }
        }
      }
      return;
    }
    
    // D. Selection visual marquee sizing
    if (state.isBoxSelecting) {
      state.boxSelectEnd = mousePos;
      const box = document.getElementById('box-select-marquee');
      if (box) {
        const x = Math.min(state.boxSelectStart.x, state.boxSelectEnd.x);
        const y = Math.min(state.boxSelectStart.y, state.boxSelectEnd.y);
        const w = Math.abs(state.boxSelectStart.x - state.boxSelectEnd.x);
        const h = Math.abs(state.boxSelectStart.y - state.boxSelectEnd.y);
        
        box.setAttribute('x', String(x));
        box.setAttribute('y', String(y));
        box.setAttribute('width', String(w));
        box.setAttribute('height', String(h));
      }
      return;
    }
    
    // E. Drawing Active connection wire preview
    if (state.activeWire) {
      const snap = resolveRoutingSnap(mousePos);
      if (snap) {
        state.activeWire.target = { x: snap.x, y: snap.y };
      } else {
        // Grid level aligned tracking
        state.activeWire.target = {
          x: Math.round(mousePos.x / 20) * 20,
          y: Math.round(mousePos.y / 20) * 20
        };
      }
      
      const previewWireEl = document.getElementById('preview-wire');
      if (previewWireEl) {
        const pathPoints = getPreviewPathPoints(state.activeWire);
        previewWireEl.setAttribute('d', pathToString(pathPoints));
      }
    }
  };
  
  // 3. Pointer Up event
  const handlePointerUp = (e: PointerEvent) => {
    
    // Finish viewport panning
    if (state.isPanning) {
      state.isPanning = false;
      svg.style.cursor = 'default';
      return;
    }
    
    // Finish components dragging
    if (state.draggingComponent) {
      saveState();
      
      // Clean collinear double vertices from wire paths
      state.wires.forEach((wire: any) => {
        if (wire.manualPath) {
          wire.manualPath = simplifyPath(wire.manualPath);
          if (wire.manualPath.length < 3) {
            wire.manualPath = null;
          }
        }
      });
      
      state.draggingComponent = null;
      draw();
      return;
    }
    
    // Finish manuals wire corners dragging
    if (state.draggingWireSegment) {
      saveState();
      const wire = state.wires.find((w: any) => w.id === state.draggingWireSegment.wireId);
      if (wire && wire.manualPath) {
        wire.manualPath = simplifyPath(wire.manualPath);
        if (wire.manualPath.length < 3) {
          wire.manualPath = null;
        }
      }
      state.draggingWireSegment = null;
      draw();
      return;
    }
    
    // Finish selection marquee calculations in Canvas space
    if (state.isBoxSelecting) {
      state.isBoxSelecting = false;
      const box = document.getElementById('box-select-marquee');
      if (box) box.setAttribute('display', 'none');
      
      const xMin = Math.min(state.boxSelectStart.x, state.boxSelectEnd.x);
      const xMax = Math.max(state.boxSelectStart.x, state.boxSelectEnd.x);
      const yMin = Math.min(state.boxSelectStart.y, state.boxSelectEnd.y);
      const yMax = Math.max(state.boxSelectStart.y, state.boxSelectEnd.y);
      
      const w = xMax - xMin;
      const h = yMax - yMin;
      
      if (w > 3 && h > 3) {
        // Find all components fully inside marquee box bounds
        const selComps: string[] = [];
        state.components.forEach((comp: any) => {
          const b = getComponentBounds(comp);
          if (b.xMin >= xMin && b.xMax <= xMax && b.yMin >= yMin && b.yMax <= yMax) {
            selComps.push(comp.id);
          }
        });
        
        // Find all wires with path segments intersecting marquee box bounds
        const selWires: string[] = [];
        state.wires.forEach((wire: any) => {
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
          
          // Let intersecting segment select it
          let intersects = false;
          for (let i = 0; i < pathPoints.length - 1; i++) {
            if (rectIntersectsSegment(xMin, yMin, xMax, yMax, pathPoints[i], pathPoints[i + 1])) {
              intersects = true;
              break;
            }
          }
          if (intersects) {
            selWires.push(wire.id);
          }
        });
        
        state.selectedComponentIds = selComps;
        state.selectedWireIds = selWires;
        updatePropertiesPanel();
      }
      draw();
    }
  };
  
  // 4. Mouse Scroll Zooming handler
  const handleWheel = (e: WheelEvent) => {
    e.preventDefault();
    
    if (e.ctrlKey || e.shiftKey) {
      const zoomIntensity = 0.12;
      
      // Read cursor position in screen space
      const svgRect = svg.getBoundingClientRect();
      const mouseX = e.clientX - svgRect.left;
      const mouseY = e.clientY - svgRect.top;
      
      // Backtrace canvas coordinate before scaling
      const canvasX = (mouseX - state.panX) / state.zoom;
      const canvasY = (mouseY - state.panY) / state.zoom;
      
      // Scale zoom factors with clamps (0.15x min to 4.0x max)
      const factor = e.deltaY < 0 ? 1 + zoomIntensity : 1 - zoomIntensity;
      const newZoom = Math.min(4.0, Math.max(0.15, state.zoom * factor));
      
      // Shift panning offsets to align pointer cursor after zooming (intuitive centering)
      state.panX = mouseX - canvasX * newZoom;
      state.panY = mouseY - canvasY * newZoom;
      state.zoom = newZoom;
    } else {
      // Panning/scrolling when no modifier key is pressed
      const panSpeed = 0.85;
      state.panX -= e.deltaX * panSpeed;
      state.panY -= e.deltaY * panSpeed;
    }
    
    updateViewportTransform();
  };
  
  // 5. Global Hotkeys listener
  const handleKeyDown = (e: KeyboardEvent) => {
    if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA' || document.activeElement?.tagName === 'SELECT') {
      return; // Do not trigger hotkeys inside property panel inputs or python editor
    }
    
    const key = e.key.toLowerCase();
    
    if (e.key === ' ') {
      isSpacePressed = true;
      svg.style.cursor = 'grab';
    }
    
    // Escape: cancel active wire drawing loop
    if (e.key === 'Escape' && state.activeWire) {
      state.activeWire = null;
      draw();
    }
    
    // Delete: delete selections
    if (e.key === 'Delete' || e.key === 'Backspace') {
      deleteSelected();
    }
    
    // 'r' or 'R': Rotate Selection
    if (key === 'r') {
      rotateSelected();
    }
    
    // Ctrl + C: Copy
    if (e.ctrlKey && key === 'c') {
      e.preventDefault();
      copySelected();
    }
    
    // Ctrl + V: Paste
    if (e.ctrlKey && key === 'v') {
      e.preventDefault();
      pasteSelected();
    }
    
    // Ctrl + Z: Undo
    if (e.ctrlKey && key === 'z') {
      e.preventDefault();
      undo();
    }
    
    // Ctrl + Q: Clear workspace
    if (e.ctrlKey && key === 'q') {
      e.preventDefault();
      clearWorkspace();
    }
    
    // Ctrl + S (or S / s): open Simulation settings
    if (key === 's' && !e.ctrlKey) {
      openSimSettings();
    }
    
    // Ctrl + E (or E / e): open Plot configurations
    if (key === 'e') {
      openPlotConfig();
    }
  };
  
  const handleKeyUp = (e: KeyboardEvent) => {
    if (e.key === ' ') {
      isSpacePressed = false;
      svg.style.cursor = 'default';
    }
  };
  
  // Bind events to the SVG canvas
  svg.addEventListener('pointerdown', handlePointerDown);
  svg.addEventListener('pointermove', handlePointerMove);
  svg.addEventListener('pointerup', handlePointerUp);
  svg.addEventListener('wheel', handleWheel);
  
  // Bind global shortcut keys
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  
  return cleanup; // Return unmount cleanup triggers
}
