// Workspace State Management for Schematic Editor
export const state: any = {
  components: [],
  wires: [],
  navigationStack: [],
  currentSubsystemId: null,
  
  // Selection sets
  selectedComponentIds: [],
  selectedWireIds: [],
  
  // Copy-Paste Clipboard
  copypasteClipboard: null,
  
  // Undo Stack for Ctrl+Z tracking
  undoStack: [],
  
  // Latest cursor tracking in canvas coordinates
  lastMousePos: { x: 0, y: 0 },
  
  // Viewport Panning / Zooming offsets
  panX: 100,
  panY: 100,
  zoom: 1.0,
  
  // Box Marquee Selection coordinates
  isBoxSelecting: false,
  boxSelectStart: { x: 0, y: 0 },
  boxSelectEnd: { x: 0, y: 0 },
  
  // Pointer Drag state
  draggingComponent: null,
  draggingWireSegment: null,
  draggedComponentsStart: [],
  draggedWiresStart: [],
  rigidMovingWireIds: [],
  draggedWireEndpointsStart: [],
  dragStartMouse: { x: 0, y: 0 },
  dragOffset: { x: 0, y: 0 },
  isPanning: false,
  panStart: { x: 0, y: 0 },
  
  // Wire connection drawing state
  activeWire: null,

  // Custom multi-figure plot configuration
  plotConfiguration: { plots: [] },

  simulationSettings: {
    stopTime: "0.05",
    stepSize: "1e-5",
    stepType: "fixed", // "fixed" | "variable"
    solver: "euler",    // "euler" | "rk45" | "radau"
    simulationMode: "regular", // "regular" | "current_flow"
    solverMethod: "non-ideal" // "non-ideal" | "ideal-pwl"
  }
};

// Push current layout to undo stack
export function saveState() {
  if (state.undoStack.length >= 50) {
    state.undoStack.shift();
  }
  state.undoStack.push(JSON.stringify({
    components: state.components,
    wires: state.wires,
    plotConfiguration: state.plotConfiguration,
    simulationSettings: state.simulationSettings
  }));
}
