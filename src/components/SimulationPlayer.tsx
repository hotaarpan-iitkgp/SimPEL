import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, Pause, Square, SkipBack, SkipForward, Sliders, 
  HelpCircle, ZoomIn, ZoomOut, RotateCcw, AlertCircle, Info, ChevronRight,
  Plus, Trash2, ChevronUp, ChevronDown, EyeOff, Layers, Eye, Maximize2, Minimize2
} from 'lucide-react';
import { state } from '../schematic/state';
import { getWirePath, getTerminalCoords, getPinDomain, getWireDomain, getWireEndpointCoords } from '../schematic/routing';
import { getComponentSVG } from '../schematic/components';
import { getComponentPins } from '../schematic/config';
import { exportDualGraphJSON } from '../schematic/actions';

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

// Helper: Get all segment data for a wire
function getSegmentsForWire(wire: any, allWires: any[]): { segmentId: string; path: { x: number; y: number }[] }[] {
  const origPath = getWirePath(wire);
  const electricalWires = allWires.filter((w: any) => getWireDomain(w) === 'electrical');
  const taps = getTapPointsOnWire(wire.id, electricalWires);
  
  const pStartCoords = getWireEndpointCoords(wire.from);
  const pEndCoords = getWireEndpointCoords(wire.to);
  const filteredTaps = taps.filter(t => 
    Math.hypot(t.x - pStartCoords.x, t.y - pStartCoords.y) > 5 &&
    Math.hypot(t.x - pEndCoords.x, t.y - pEndCoords.y) > 5
  );

  const subPaths = insertTapPointsAndSplit(origPath, filteredTaps);
  return subPaths.map((subPath, j) => {
    const segmentId = `${wire.id}_seg${j}`;
    return { segmentId, path: subPath };
  });
}

// Helper code to resolve the controller terminal that connects to a MOSFET's Gate terminal
function getGateSignalName(compId: string, wires: any[]): string {
  if (!wires) return "0.0";
  // Try finding where G is the 'to' of a wire
  let rootWire = wires.find((w: any) => 
    w.to && w.to.type === 'pin' && w.to.compId === compId && w.to.terminal === 'G'
  );
  if (rootWire) {
    const backtrace = (endpoint: any): string => {
      if (!endpoint) return "0.0";
      if (endpoint.type === 'pin') {
        return `${endpoint.compId}.${endpoint.terminal}`;
      } else if (endpoint.type === 'wire') {
        const parentWire = wires.find((w: any) => w.id === endpoint.wireId);
        if (!parentWire) return "0.0";
        return backtrace(parentWire.from);
      }
      return "0.0";
    };
    return backtrace(rootWire.from);
  }

  // Try finding where G is the 'from' of a wire (in case wire was drawn backwards in schematic editor)
  rootWire = wires.find((w: any) => 
    w.from && w.from.type === 'pin' && w.from.compId === compId && w.from.terminal === 'G'
  );
  if (rootWire) {
    const backtrace = (endpoint: any): string => {
      if (!endpoint) return "0.0";
      if (endpoint.type === 'pin') {
        return `${endpoint.compId}.${endpoint.terminal}`;
      } else if (endpoint.type === 'wire') {
        const parentWire = wires.find((w: any) => w.id === endpoint.wireId);
        if (!parentWire) return "0.0";
        return backtrace(parentWire.to);
      }
      return "0.0";
    };
    return backtrace(rootWire.to);
  }

  return "0.0";
}

interface SimulationPlayerProps {
  simResults: any;
  onRunSimulation: (netlistJson: string) => void;
  subplots: Array<{ id: string; title: string; traces: string[] }>;
  theme?: 'light' | 'dark';
}

const getWirePathMidpoint = (pathPoints: Array<{ x: number; y: number }>) => {
  if (!pathPoints || pathPoints.length === 0) return { x: 0, y: 0, angle: 0 };
  if (pathPoints.length === 1) return { x: pathPoints[0].x, y: pathPoints[0].y, angle: 0 };
  
  // Calculate total length
  let totalLength = 0;
  const segmentLengths = [];
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const p1 = pathPoints[i];
    const p2 = pathPoints[i + 1];
    const d = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    segmentLengths.push(d);
    totalLength += d;
  }
  
  // Find point at totalLength / 2
  const targetLength = totalLength / 2;
  let currentLength = 0;
  for (let i = 0; i < segmentLengths.length; i++) {
    if (currentLength + segmentLengths[i] >= targetLength) {
      const remain = targetLength - currentLength;
      const ratio = remain / segmentLengths[i];
      const p1 = pathPoints[i];
      const p2 = pathPoints[i + 1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const angle = Math.atan2(dy, dx);
      return {
        x: p1.x + dx * ratio,
        y: p1.y + dy * ratio,
        angle: angle
      };
    }
    currentLength += segmentLengths[i];
  }
  const last = pathPoints[pathPoints.length - 1];
  return { x: last.x, y: last.y, angle: 0 };
};

export default function SimulationPlayer({ simResults, onRunSimulation, subplots, theme }: SimulationPlayerProps) {
  // Check if current simulation results have high-fidelity segmented wire tracks
  const isFidelitySimActive = useMemo(() => {
    if (!simResults) return false;
    
    const electricalWires = state.wires.filter((w: any) => getWireDomain(w) === 'electrical');
    let hasSegments = false;
    
    for (const wire of electricalWires) {
      const segs = getSegmentsForWire(wire, state.wires);
      if (segs.length > 0) {
        hasSegments = true;
        // Check if at least one segment's current trace exists in simResults
        const firstSegId = segs[0].segmentId;
        const traceKey = `I_${firstSegId}`;
        const hasCustom = simResults.custom_plots && simResults.custom_plots[traceKey] !== undefined;
        const hasSig = simResults.signals && simResults.signals[traceKey] !== undefined;
        if (hasCustom || hasSig) {
          return true;
        }
      }
    }
    
    // If the schematic has NO tapped wire T-junctions, then even fast simulation is high-fidelity
    return !hasSegments;
  }, [simResults, state.wires]);

  // Run detailed high-fidelity simulation
  const runFidelitySim = () => {
    try {
      const netlist = exportDualGraphJSON(false); // Detailed high-fidelity mode!
      const netlistStr = JSON.stringify(netlist, null, 2);
      onRunSimulation(netlistStr);
    } catch (err: any) {
      alert(`Netlist compiling failure: ${err.message || err}`);
    }
  };

  // Trigger dynamic fast solver network run by default
  const triggerRun = () => {
    try {
      const netlist = exportDualGraphJSON(true); // fast mode by default!
      const netlistStr = JSON.stringify(netlist, null, 2);
      onRunSimulation(netlistStr);
    } catch (err: any) {
      alert(`Netlist compiling failure: ${err.message || err}`);
    }
  };

  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [playTime, setPlayTime] = useState(0.0);
  const [speedMultiplier, setSpeedMultiplier] = useState(1.0); // 1.0x plays in 5s
  const [showWireOverlays, setShowWireOverlays] = useState(true);
  const [showFlowInspector, setShowFlowInspector] = useState(false);

  // Theme and customization states
  const [miniplotWidthUs, setMiniplotWidthUs] = useState(100);
  const [showNumericalValues, setShowNumericalValues] = useState(false);
  const [isSchematicFullScreen, setIsSchematicFullScreen] = useState(false);
  const [openPlotSettingsId, setOpenPlotSettingsId] = useState<string | null>(null);

  const isLight = theme === 'light';

  // Theme-specific styles & Tailwind classes
  const styles = {
    bgMain: isLight ? 'bg-slate-50 text-slate-800' : 'bg-slate-950 text-slate-100',
    bgCard: isLight ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-950 border-slate-900 shadow-md',
    bgPanel: isLight ? 'bg-slate-100/80 border-slate-200' : 'bg-slate-950/45 border-slate-900',
    bgInput: isLight ? 'bg-white border-slate-200 focus:border-slate-400 text-slate-850' : 'bg-transparent border-transparent hover:bg-slate-900/50 focus:bg-slate-900/80 focus:border-slate-800 text-slate-200',
    bgToolbar: isLight ? 'bg-slate-100 border-slate-200' : 'bg-slate-950/80 border-slate-900',
    textMuted: isLight ? 'text-slate-500' : 'text-slate-400',
    textLabel: isLight ? 'text-slate-600' : 'text-slate-500',
    textTitle: isLight ? 'text-slate-800' : 'text-slate-200',
    textMain: isLight ? 'text-slate-800' : 'text-slate-100',
    border: isLight ? 'border-slate-200' : 'border-slate-900',
    borderMuted: isLight ? 'border-slate-100' : 'border-slate-950',
    svgBg: isLight ? '#f8fafc' : '#050711',
    svgGrid: isLight ? '#cbd5e1' : '#1e293b',
    svgText: isLight ? '#475569' : '#94a3b8',
    svgBorder: isLight ? '#cbd5e1' : '#334155',
    plotBg: isLight ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-900',
    badgeBg: isLight ? 'bg-slate-100 text-slate-700' : 'bg-slate-900 text-slate-400',
    badgeBorder: isLight ? 'border-slate-200' : 'border-slate-800',
    buttonActive: isLight ? 'bg-sky-100 text-sky-700 border-sky-300' : 'bg-slate-950 text-slate-100 border-sky-500',
    buttonInactive: isLight ? 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50' : 'bg-slate-900/10 text-slate-500 border-transparent hover:bg-slate-900/40 hover:text-slate-400',
  };

  // Play/Pause handler that compiles high-fidelity flows on play
  const handlePlayPause = () => {
    if (!isFidelitySimActive) {
      runFidelitySim();
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  // Auto-play of high-fidelity solver results on load
  const lastResultsRef = useRef<any>(null);
  useEffect(() => {
    if (simResults && simResults !== lastResultsRef.current) {
      if (isFidelitySimActive && lastResultsRef.current) {
        setIsPlaying(true);
      }
      lastResultsRef.current = simResults;
    }
  }, [simResults, isFidelitySimActive]);

  // Schematic View State
  const [panX, setPanX] = useState(state.panX || 120);
  const [panY, setPanY] = useState(state.panY || 120);
  const [zoom, setZoom] = useState(state.zoom || 0.95);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // Refs for animation loop
  const requestRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const wireOffsetsRef = useRef<Record<string, number>>({});
  const containerRef = useRef<HTMLDivElement>(null);

  // Stable Trace Coloring Function
  const getStableTraceColor = (trace: string): string => {
    const allTraces = Array.from(new Set(
      Object.keys(simResults?.custom_plots || {})
        .concat(Object.keys(simResults?.signals || {}))
    )).sort();
    const idx = allTraces.indexOf(trace);
    if (idx === -1) return '#10b981'; // emerald fallback
    
    const PALETTE = [
      '#38bdf8', // sky-blue (neon)
      '#10b981', // emerald
      '#fb923c', // orange-amber
      '#ec4899', // pink (neon)
      '#a855f7', // purple (violet)
      '#ef4444', // ruby red
      '#14b8a6', // teal
      '#eab308', // gold yellow
      '#22c55e', // green
      '#f43f5e', // rose
    ];
    return PALETTE[idx % PALETTE.length];
  };

  // Helper to format values
  const formatCurrentValue = (val: number): string => {
    const abs = Math.abs(val);
    if (abs < 1e-6) return "0.0 A";
    if (abs < 1e-3) return `${(val * 1e6).toFixed(1)} µA`;
    if (abs < 1.0) return `${(val * 1000).toFixed(1)} mA`;
    return `${val.toFixed(2)} A`;
  };

  // Draggable mini-scopes state for waveforms on components & signal lines (wires)
  const [activeScopes, setActiveScopes] = useState<Record<string, {
    x: number,
    y: number,
    type: string, // 'gate-pulse' | 'component' | 'component-voltage' | 'wire-control' | 'wire-voltage'
    traceName: string,
    label: string,
    componentId?: string,
    wireId?: string,
    isCustomMoved?: boolean
  }>>({});

  const draggedScopeIdRef = useRef<string | null>(null);
  const dragOffsetRef = useRef<{ x: number, y: number }>({ x: 0, y: 0 });
  const lastPointerDownRef = useRef<{ x: number, y: number } | null>(null);
  const loadedStateRef = useRef<string>("");

  // Resolving physical terminal pins to their electrical simulation node names (node_0, node_1, node_2, etc.)
  const getResolvedNodeNamesMap = useMemo(() => {
    if (!state.components || !state.wires) return {};

    class LocalUnionFind {
      parent: Record<string, string> = {};
      find(i: string): string {
        if (!this.parent[i]) {
          this.parent[i] = i;
        }
        let root = i;
        while (root !== this.parent[root]) {
          root = this.parent[root];
        }
        let curr = i;
        while (curr !== root) {
          const nxt = this.parent[curr];
          this.parent[curr] = root;
          curr = nxt;
        }
        return root;
      }
      union(i: string, j: string) {
        const rootI = this.find(i);
        const rootJ = this.find(j);
        if (rootI !== rootJ) {
          this.parent[rootI] = rootJ;
        }
      }
    }

    const uf = new LocalUnionFind();
    const endpointCoords: Record<string, { x: number; y: number }> = {};

    const physicalComponents = state.components.filter((c: any) => 
      ['R', 'L', 'C', 'S', 'D', 'MOSFET', 'V', 'I', 'AC_V', 'XFMR', 'VM', 'AM'].includes(c.type)
    );

    physicalComponents.forEach((comp: any) => {
      const pinMap = getComponentPins(comp);
      Object.keys(pinMap).forEach(term => {
        const key = `${comp.id}.${term}`;
        uf.find(key);
        
        const pinOffset = pinMap[term];
        const rot = comp.rotation || 0;
        const rad = (rot * Math.PI) / 180;
        const rx = pinOffset.x * Math.cos(rad) - pinOffset.y * Math.sin(rad);
        const ry = pinOffset.x * Math.sin(rad) + pinOffset.y * Math.cos(rad);
        endpointCoords[key] = { x: comp.x + rx, y: comp.y + ry };
      });
    });

    const getWireEndpointCoords = (ep: any) => {
      if (ep.type === 'pin') {
        const comp = state.components.find((c: any) => c.id === ep.compId);
        if (comp) {
          const pMap = getComponentPins(comp);
          const pOffset = pMap[ep.terminal] || { x: 0, y: 0 };
          const rot = comp.rotation || 0;
          const rad = (rot * Math.PI) / 180;
          const rx = pOffset.x * Math.cos(rad) - pOffset.y * Math.sin(rad);
          const ry = pOffset.x * Math.sin(rad) + pOffset.y * Math.cos(rad);
          return { x: comp.x + rx, y: comp.y + ry };
        }
      }
      return { x: ep.x || 0, y: ep.y || 0 };
    };

    const electricalWires = state.wires.filter((w: any) => {
      const isControlVal = (w.from && w.from.type === 'pin' && state.components.find((c: any) => c.id === w.from.compId)?.type === 'CONST') || 
                           (w.to && w.to.type === 'pin' && state.components.find((c: any) => c.id === w.to.compId)?.type === 'CONST');
      return !isControlVal;
    });

    const fastMode = !isFidelitySimActive;

    electricalWires.forEach((wire: any) => {
      const pStartCoords = getWireEndpointCoords(wire.from);
      const pEndCoords = getWireEndpointCoords(wire.to);
      
      const pStartKey = `W_from_${wire.id}`;
      const pEndKey = `W_to_${wire.id}`;
      
      endpointCoords[pStartKey] = pStartCoords;
      endpointCoords[pEndKey] = pEndCoords;
      
      if (wire.from && wire.from.type === 'pin') {
        const pinKey = `${wire.from.compId}.${wire.from.terminal}`;
        uf.union(pStartKey, pinKey);
      } else if (wire.from && wire.from.type === 'wire') {
        if (fastMode) {
          const targetId = wire.from.wireId;
          const targetWire = electricalWires.find((w: any) => w.id === targetId);
          if (targetWire) {
            const targetStartCoords = getWireEndpointCoords(targetWire.from);
            const targetEndCoords = getWireEndpointCoords(targetWire.to);
            const dStart = Math.hypot(pStartCoords.x - targetStartCoords.x, pStartCoords.y - targetStartCoords.y);
            const dEnd = Math.hypot(pStartCoords.x - targetEndCoords.x, pStartCoords.y - targetEndCoords.y);
            if (dStart < dEnd) {
              uf.union(pStartKey, `W_from_${targetId}`);
            } else {
              uf.union(pStartKey, `W_to_${targetId}`);
            }
          }
        } else {
          const juncKey = `W_junc_${Math.round(pStartCoords.x)}_${Math.round(pStartCoords.y)}`;
          uf.union(pStartKey, juncKey);
        }
      }

      if (wire.to && wire.to.type === 'pin') {
        const pinKey = `${wire.to.compId}.${wire.to.terminal}`;
        uf.union(pEndKey, pinKey);
      } else if (wire.to && wire.to.type === 'wire') {
        if (fastMode) {
          const targetId = wire.to.wireId;
          const targetWire = electricalWires.find((w: any) => w.id === targetId);
          if (targetWire) {
            const targetStartCoords = getWireEndpointCoords(targetWire.from);
            const targetEndCoords = getWireEndpointCoords(targetWire.to);
            const dStart = Math.hypot(pEndCoords.x - targetStartCoords.x, pEndCoords.y - targetStartCoords.y);
            const dEnd = Math.hypot(pEndCoords.x - targetEndCoords.x, pEndCoords.y - targetEndCoords.y);
            if (dStart < dEnd) {
              uf.union(pEndKey, `W_from_${targetId}`);
            } else {
              uf.union(pEndKey, `W_to_${targetId}`);
            }
          }
        } else {
          const juncKey = `W_junc_${Math.round(pEndCoords.x)}_${Math.round(pEndCoords.y)}`;
          uf.union(pEndKey, juncKey);
        }
      }
    });

    const endpointKeys = Object.keys(endpointCoords);
    for (let i = 0; i < endpointKeys.length; i++) {
      const key1 = endpointKeys[i];
      const c1 = endpointCoords[key1];
      for (let j = i + 1; j < endpointKeys.length; j++) {
        const key2 = endpointKeys[j];
        const c2 = endpointCoords[key2];
        if (Math.abs(c1.x - c2.x) < 2 && Math.abs(c1.y - c2.y) < 2) {
          uf.union(key1, key2);
        }
      }
    }

    const partitions: Record<string, string[]> = {};
    Object.keys(uf.parent).forEach(pin => {
      const root = uf.find(pin);
      if (!partitions[root]) partitions[root] = [];
      partitions[root].push(pin);
    });

    let groundRoot: string | null = null;
    const vsources = state.components.filter((c: any) => ['V', 'AC_V'].includes(c.type));
    if (vsources.length > 0) {
      const firstV = vsources[0];
      const negPinKey = `${firstV.id}.B`;
      if (uf.parent[negPinKey]) {
        groundRoot = uf.find(negPinKey);
      }
    }

    const rootToNodeIndex: Record<string, string> = {};
    let nodeCount = 1;
    Object.keys(partitions).forEach(root => {
      if (root === groundRoot) {
        rootToNodeIndex[root] = "node_0";
      } else {
        rootToNodeIndex[root] = `node_${nodeCount++}`;
      }
    });

    if (groundRoot === null || !rootToNodeIndex[groundRoot]) {
      const roots = Object.keys(partitions);
      if (roots.length > 0) {
        rootToNodeIndex[roots[0]] = "node_0";
      }
    }

    const pinToNodeMap: Record<string, string> = {};
    Object.keys(partitions).forEach(root => {
      const nodeName = rootToNodeIndex[root];
      partitions[root].forEach(pin => {
        pinToNodeMap[pin] = nodeName;
      });
    });

    return pinToNodeMap;
  }, [state, isFidelitySimActive]);

  // Backtrace control signal source terminals (e.g. COMP1.Out, TRI1.Out, CONST1.Out)
  const getWireSignalName = (wire: any, wires: any[]): string => {
    const backtrace = (endpoint: any): string | null => {
      if (!endpoint) return null;
      if (endpoint.type === 'pin') {
        return `${endpoint.compId}.${endpoint.terminal}`;
      } else if (endpoint.type === 'wire') {
        const parentWire = wires.find(w => w.id === endpoint.wireId);
        if (parentWire) {
          return backtrace(parentWire.from) || backtrace(parentWire.to);
        }
      }
      return null;
    };
    return backtrace(wire.from) || backtrace(wire.to) || "0.0";
  };

  // Toggle dynamic scope for any component (clicks in schematic viewport)
  const toggleComponentScope = (comp: any) => {
    const scopeId = comp.id;
    setActiveScopes(prev => {
      const isControlComp = ['CONST', 'GAIN', 'PID', 'SUM', 'PWM', 'TRI', 'COMP', 'AND', 'OR', 'NOT', 'FCN', 'PROD', 'CSCRIPT', 'MUX', 'DEMUX'].includes(comp.type);
      const next = { ...prev };

      if (isControlComp) {
        if (next[scopeId]) {
          delete next[scopeId];
        } else {
          next[scopeId] = {
            x: comp.x,
            y: comp.y - 65,
            type: "component",
            traceName: `${comp.id}.Out`,
            label: `${comp.id} Out`,
            componentId: comp.id
          };
        }
        return next;
      }

      // Electrical component 3-step toggle cycle:
      // None -> component-voltage -> component-current -> None
      if (!next[scopeId]) {
        // Step 1: Create Voltage Scope
        next[scopeId] = {
          x: comp.x,
          y: comp.y - 65,
          type: "component-voltage",
          traceName: `V_${comp.id}`,
          label: `V(${comp.id})`,
          componentId: comp.id
        };
      } else if (next[scopeId].type === "component-voltage") {
        // Step 2: Switch to Current Scope
        next[scopeId] = {
          x: next[scopeId].x, // preserve current drag position if moved!
          y: next[scopeId].y,
          isCustomMoved: next[scopeId].isCustomMoved,
          type: "component-current",
          traceName: `I_${comp.id}`,
          label: `I(${comp.id})`,
          componentId: comp.id
        };
      } else {
        // Step 3: Remove Scope
        delete next[scopeId];
      }

      return next;
    });
  };

  // Toggle dynamic scope for any wire/signal-line (clicks in schematic viewport)
  const toggleWireScope = (wire: any) => {
    const isControlWire = (wire.from && wire.from.type === 'pin' && state.components.find((c: any) => c.id === wire.from.compId)?.type === 'CONST') || 
                          (wire.to && wire.to.type === 'pin' && state.components.find((c: any) => c.id === wire.to.compId)?.type === 'CONST') ||
                          ['CONST', 'GAIN', 'PID', 'SUM', 'PWM', 'TRI', 'COMP', 'AND', 'OR', 'NOT', 'FCN', 'PROD', 'CSCRIPT', 'MUX', 'DEMUX', 'SCOPE'].includes(
                            state.components.find((c: any) => c.id === (wire.from?.compId || wire.to?.compId))?.type
                          );

    const scopeId = `wire_${wire.id}`;
    setActiveScopes(prev => {
      if (prev[scopeId]) {
        const next = { ...prev };
        delete next[scopeId];
        return next;
      } else {
        const pathPoints = getWirePath(wire);
        let mid = { x: 100, y: 100 };
        if (pathPoints && pathPoints.length > 0) {
          mid = getWirePathMidpoint(pathPoints);
        }

        let traceName = "";
        let defaultLabel = "";
        let type = "wire-voltage";

        if (isControlWire) {
          traceName = getWireSignalName(wire, state.wires) || "0.0";
          defaultLabel = traceName;
          type = "wire-control";
        } else {
          let resolvedNode = "node_0";
          if (wire.from && wire.from.type === 'pin') {
            resolvedNode = getResolvedNodeNamesMap[`${wire.from.compId}.${wire.from.terminal}`] || "node_0";
          } else if (wire.to && wire.to.type === 'pin') {
            resolvedNode = getResolvedNodeNamesMap[`${wire.to.compId}.${wire.to.terminal}`] || "node_0";
          }
          traceName = resolvedNode;
          defaultLabel = `V(${resolvedNode})`;
          type = "wire-voltage";
        }

        return {
          ...prev,
          [scopeId]: {
            x: mid.x,
            y: mid.y - 45,
            type: type,
            traceName: traceName,
            label: defaultLabel,
            wireId: wire.id
          }
        };
      }
    });
  };

  const handleCloseScope = (scopeId: string) => {
    setActiveScopes(prev => {
      const next = { ...prev };
      delete next[scopeId];
      return next;
    });
  };

  // Helper code to initialize or update dragging of scope elements
  const handleScopePointerDown = (scopeId: string, e: React.PointerEvent) => {
    e.stopPropagation();
    draggedScopeIdRef.current = scopeId;
    const currentScope = activeScopes[scopeId];
    if (currentScope) {
      const schematicMouseX = (e.clientX - panX) / zoom;
      const schematicMouseY = (e.clientY - panY) / zoom;
      dragOffsetRef.current = {
        x: schematicMouseX - currentScope.x,
        y: schematicMouseY - currentScope.y
      };
      // Prevent browser default behaviors
      if (e.target && ('setPointerCapture' in e.target)) {
        try {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        } catch (err) {}
      }
    }
  };

  // Helper code to resolve the anchor coordinate of the connector line
  const getScopeAnchor = (scopeId: string, scope: any): { x: number, y: number } => {
    if (scopeId.startsWith('gate_')) {
      const compId = scopeId.replace('gate_', '');
      const comp = state.components.find((c: any) => c.id === compId);
      if (comp) {
        const rot = comp.rotation || 0;
        const rad = (rot * Math.PI) / 180;
        const px = -20;
        const py = 0;
        const rx = px * Math.cos(rad) - py * Math.sin(rad);
        const ry = px * Math.sin(rad) + py * Math.cos(rad);
        return { x: comp.x + rx, y: comp.y + ry };
      }
    }
    if (scopeId.startsWith('wire_') || scope.wireId) {
      const wId = scope.wireId || scopeId.replace('wire_', '');
      const wire = state.wires.find((w: any) => w.id === wId);
      if (wire) {
        const pts = getWirePath(wire);
        if (pts && pts.length > 0) {
          return getWirePathMidpoint(pts);
        }
      }
    }
    const compId = scope.componentId || scopeId;
    const comp = state.components.find((c: any) => c.id === compId);
    if (comp) {
      return { x: comp.x, y: comp.y };
    }
    return { x: scope.x, y: scope.y };
  };

  // Helper code to retrieve dynamic sampled waveform points
  const getScopeWaveformYVal = (scopeId: string, scope: any, targetIdx: number): number => {
    if (scope.type === 'component-voltage') {
      const compId = scope.componentId || scopeId;
      const nodeA = getResolvedNodeNamesMap[`${compId}.A`] || getResolvedNodeNamesMap[`${compId}.D`] || getResolvedNodeNamesMap[`${compId}.P1A`] || getResolvedNodeNamesMap[`${compId}.Plus`] || "";
      const nodeB = getResolvedNodeNamesMap[`${compId}.B`] || getResolvedNodeNamesMap[`${compId}.S`] || getResolvedNodeNamesMap[`${compId}.P1B`] || getResolvedNodeNamesMap[`${compId}.Minus`] || "";
      
      const valA = getTraceDataAtTime(nodeA, targetIdx);
      const valB = getTraceDataAtTime(nodeB, targetIdx);
      return valA - valB;
    }
    if (scope.type === 'component-current') {
      const compId = scope.componentId || scopeId;
      return getComponentCurrentAtIndex(compId, targetIdx);
    }
    return getTraceDataAtTime(scope.traceName, targetIdx);
  };

  // Auto-initialize default MOSFET gates scope
  useEffect(() => {
    if (!state.components) return;
    const finger = JSON.stringify(state.components.map((c: any) => ({ id: c.id, type: c.type, x: c.x, y: c.y })));
    if (finger === loadedStateRef.current) return;
    loadedStateRef.current = finger;

    const initialScopes: Record<string, any> = {};
    state.components.forEach((comp: any) => {
      if (comp.type?.toLowerCase() === 'mosfet') {
        const scopeId = `gate_${comp.id}`;
        
        const rot = comp.rotation || 0;
        const rad = (rot * Math.PI) / 180;
        const px = -20;
        const py = 0;
        const rx = px * Math.cos(rad) - py * Math.sin(rad);
        const ry = px * Math.sin(rad) + py * Math.cos(rad);
        const globalGateX = comp.x + rx;
        const globalGateY = comp.y + ry;
        
        const nx = -1 * Math.cos(rot);
        const ny = -1 * Math.sin(rot);
        
        const boxCenterX = globalGateX - 50;
        const boxCenterY = globalGateY - 30;
        const gateSig = getGateSignalName(comp.id, state.wires);
        
        initialScopes[scopeId] = {
          x: boxCenterX,
          y: boxCenterY,
          type: 'gate-pulse',
          traceName: gateSig,
          label: comp.id,
          componentId: comp.id
        };
      }
    });
    setActiveScopes(initialScopes);
  }, [state.components]);

  // Helper to see if a component can show internal flow path
  const getComponentInternalPath = (comp: any): { p1: { x: number, y: number }, p2: { x: number, y: number } } | null => {
    try {
      const pinMap = getComponentPins(comp);
      if (!pinMap) return null;
      if (['R', 'L', 'C', 'V', 'AC_V', 'I', 'S', 'D', 'VM', 'AM'].includes(comp.type)) {
        const p1Local = pinMap['A'] || { x: 0, y: -40 };
        const p2Local = pinMap['B'] || { x: 0, y: 40 };
        return { p1: { x: p1Local.x, y: p1Local.y }, p2: { x: p2Local.x, y: p2Local.y } };
      }
      if (comp.type === 'MOSFET') {
        const p1Local = pinMap['D'] || { x: 0, y: -40 };
        const p2Local = pinMap['S'] || { x: 0, y: 40 };
        return { p1: { x: p1Local.x, y: p1Local.y }, p2: { x: p2Local.x, y: p2Local.y } };
      }
    } catch (e) {
      // safe fallback
    }
    return null;
  };

  // State: Trace display toggles (checklist / legends)
  const [visibleTraces, setVisibleTraces] = useState<Record<string, boolean>>({});

  // Loop analysis memo
  const loopAnalysis = React.useMemo(() => {
    class LocalUnionFind {
      parent: Record<string, string> = {};
      find(i: string): string {
        if (this.parent[i] === undefined) {
          this.parent[i] = i;
          return i;
        }
        let root = i;
        while (root !== this.parent[root]) {
          root = this.parent[root];
        }
        let curr = i;
        while (curr !== root) {
          const nxt = this.parent[curr];
          this.parent[curr] = root;
          curr = nxt;
        }
        return root;
      }
      union(i: string, j: string) {
        const rootI = this.find(i);
        const rootJ = this.find(j);
        if (rootI !== rootJ) {
          this.parent[rootI] = rootJ;
        }
      }
    }

    const uf = new LocalUnionFind();
    const physicalComponents = state.components.filter((c: any) => 
      ['R', 'L', 'C', 'S', 'D', 'MOSFET', 'V', 'I', 'AC_V', 'XFMR', 'VM', 'AM'].includes(c.type)
    );

    physicalComponents.forEach((comp: any) => {
      const pinLabels = getComponentPins(comp);
      Object.keys(pinLabels).forEach(term => {
        uf.find(`${comp.id}.${term}`);
      });
    });

    const electricalWires = state.wires.filter((w: any) => {
      const isControlVal = (w.from && w.from.type === 'pin' && state.components.find((c: any) => c.id === w.from.compId)?.type === 'CONST') || 
                           (w.to && w.to.type === 'pin' && state.components.find((c: any) => c.id === w.to.compId)?.type === 'CONST');
      return !isControlVal;
    });

    electricalWires.forEach((wire: any) => {
      const getEndpointKey = (ep: any, id: string, side: 'from' | 'to') => {
        if (ep.type === 'pin') return `${ep.compId}.${ep.terminal}`;
        if (ep.type === 'wire') return `coord_${Math.round(ep.x)}_${Math.round(ep.y)}`;
        return `${id}.${side}`;
      };
      if (wire.from && wire.to) {
        const key1 = getEndpointKey(wire.from, wire.id, 'from');
        const key2 = getEndpointKey(wire.to, wire.id, 'to');
        uf.union(key1, key2);
      }
    });

    const pinToNode: Record<string, string> = {};
    physicalComponents.forEach((comp: any) => {
      const pinLabels = getComponentPins(comp);
      Object.keys(pinLabels).forEach(term => {
        const key = `${comp.id}.${term}`;
        pinToNode[key] = uf.find(key);
      });
    });

    const getComponentNodes = (comp: any): { u: string, v: string } | null => {
      const pinLabels = Object.keys(getComponentPins(comp));
      if (comp.type === 'MOSFET') {
        const u = pinToNode[`${comp.id}.D`] || uf.find(`${comp.id}.D`);
        const v = pinToNode[`${comp.id}.S`] || uf.find(`${comp.id}.S`);
        return { u, v };
      }
      const electTerms = pinLabels.filter(term => getPinDomain(comp.type, term) !== 'control');
      if (electTerms.length >= 2) {
        const u = pinToNode[`${comp.id}.${electTerms[0]}`] || uf.find(`${comp.id}.${electTerms[0]}`);
        const v = pinToNode[`${comp.id}.${electTerms[1]}`] || uf.find(`${comp.id}.${electTerms[1]}`);
        return { u, v };
      }
      return null;
    };

    const nodesSet = new Set<string>();
    const edges: Array<{ id: string, u: string, v: string, comp: any }> = [];
    physicalComponents.forEach((comp: any) => {
      const conn = getComponentNodes(comp);
      if (conn) {
        nodesSet.add(conn.u);
        nodesSet.add(conn.v);
        edges.push({ id: comp.id, u: conn.u, v: conn.v, comp });
      }
    });

    const forestUF = new LocalUnionFind();
    const forestEdges = new Set<string>();
    const chords: Array<{ id: string, u: string, v: string, comp: any }> = [];

    edges.forEach(edge => {
      if (edge.u === edge.v) {
        chords.push(edge);
      } else {
        const rU = forestUF.find(edge.u);
        const rV = forestUF.find(edge.v);
        if (rU !== rV) {
          forestUF.union(edge.u, edge.v);
          forestEdges.add(edge.id);
        } else {
          chords.push(edge);
        }
      }
    });

    const findSpanningPath = (start: string, target: string): Array<{ compId: string, node: string, nextNode: string }> | null => {
      const visited = new Set<string>();
      const dfs = (curr: string, path: Array<{ compId: string, node: string, nextNode: string }>): Array<{ compId: string, node: string, nextNode: string }> | null => {
        if (curr === target) return path;
        visited.add(curr);
        for (const edge of edges) {
          if (!forestEdges.has(edge.id)) continue;
          if (edge.u === curr && !visited.has(edge.v)) {
            const res = dfs(edge.v, [...path, { compId: edge.id, node: curr, nextNode: edge.v }]);
            if (res) return res;
          }
          if (edge.v === curr && !visited.has(edge.u)) {
            const res = dfs(edge.u, [...path, { compId: edge.id, node: curr, nextNode: edge.u }]);
            if (res) return res;
          }
        }
        return null;
      };
      return dfs(start, []);
    };

    const loopsItems: Array<{
      id: string;
      color: string;
      chordCompId: string;
      title: string;
      traceKey: string;
      segments: Array<{ compId: string, node: string, nextNode: string }>;
    }> = [];

    const LOOP_PALETTE = [
      '#10b981', // emerald
      '#38bdf8', // sky-blue
      '#fb923c', // orange-amber
      '#ec4899', // pink
      '#a855f7', // purple
      '#34d399', // emerald light
      '#60a5fa', // blue light
      '#f472b6', // pink light
    ];

    chords.forEach((chord, idx) => {
      const path = findSpanningPath(chord.v, chord.u);
      if (path !== null) {
        const segments = [
          { compId: chord.id, node: chord.u, nextNode: chord.v },
          ...path
        ];
        const loopCompNames = segments.map(s => s.compId);
        const title = `Loop (${loopCompNames.join(' → ')})`;
        const color = LOOP_PALETTE[idx % LOOP_PALETTE.length];

        loopsItems.push({
          id: `loop_${chord.id}`,
          color,
          chordCompId: chord.id,
          title,
          traceKey: `I_${chord.id}`,
          segments
        });
      }
    });

    return { loops: loopsItems, pinToNode, uf };
  }, [simResults, state.components, state.wires]);

  const loops = loopAnalysis.loops;
  const pinToNode = loopAnalysis.pinToNode;

  useEffect(() => {
    if (simResults) {
      const traces = Object.keys(simResults.custom_plots || {})
        .concat(Object.keys(simResults.signals || {}));
      
      const initial: Record<string, boolean> = {};
      traces.forEach(t => {
        initial[t] = visibleTraces[t] !== undefined ? visibleTraces[t] : true;
      });
      loops.forEach(l => {
        initial[l.id] = visibleTraces[l.id] !== undefined ? visibleTraces[l.id] : true;
      });
      setVisibleTraces(initial);
    }
  }, [simResults, loops]);

  // State: Subplots local configurations (custom edits on-screen!)
  const [localSubplots, setLocalSubplots] = useState<any[]>([]);

  useEffect(() => {
    if (subplots && subplots.length > 0) {
      setLocalSubplots(subplots);
    }
  }, [subplots]);

  const addSubplot = () => {
    const newId = `sp_${Math.floor(Date.now() + Math.random() * 1000)}`;
    setLocalSubplots([...localSubplots, { id: newId, title: "Custom Subplot Lane", traces: [] }]);
  };

  const deleteSubplot = (id: string) => {
    setLocalSubplots(localSubplots.filter(sp => sp.id !== id));
  };

  const renameSubplot = (id: string, newTitle: string) => {
    setLocalSubplots(localSubplots.map(sp => sp.id === id ? { ...sp, title: newTitle } : sp));
  };

  const moveSubplot = (index: number, direction: 'up' | 'down') => {
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= localSubplots.length) return;
    const items = [...localSubplots];
    const target = items[index];
    items[index] = items[nextIndex];
    items[nextIndex] = target;
    setLocalSubplots(items);
  };

  const toggleSubplotTrace = (subplotId: string, trace: string) => {
    setLocalSubplots(localSubplots.map(sp => {
      if (sp.id === subplotId) {
        const hasTrace = sp.traces.includes(trace);
        return {
          ...sp,
          traces: hasTrace 
            ? sp.traces.filter(t => t !== trace) 
            : [...sp.traces, trace]
        };
      }
      return sp;
    }));
  };

  // Parse time boundaries
  const tData = simResults?.time || [];
  const tMin = tData.length > 0 ? tData[0] : 0.0;
  const tMax = tData.length > 0 ? tData[tData.length - 1] : 0.01;
  const totalSimDuration = tMax - tMin;

  // Find the closest index in simulation array for a given playTime
  const getClosestTimeIndex = (timeVal: number): number => {
    if (tData.length === 0) return 0;
    if (timeVal <= tMin) return 0;
    if (timeVal >= tMax) return tData.length - 1;
    
    // Binary search for speed
    let low = 0;
    let high = tData.length - 1;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      if (tData[mid] === timeVal) return mid;
      if (tData[mid] < timeVal) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    // Return closest of low or high
    const dLow = Math.abs((tData[low] ?? tMax) - timeVal);
    const dHigh = Math.abs((tData[high] ?? tMin) - timeVal);
    return dLow < dHigh ? low : high;
  };

  const currentStepIndex = getClosestTimeIndex(playTime);

  // Helper: Find connected component terminal for a wire to extract its flowing current
  const findConnectedPin = (wireId: string, visited = new Set<string>()): { compId: string, terminal: string, wireEnd: 'from' | 'to' } | null => {
    if (visited.has(wireId)) return null;
    visited.add(wireId);
    
    const wire = state.wires.find((w: any) => w.id === wireId);
    if (!wire) return null;
    
    // Direct pin connections:
    if (wire.from && wire.from.type === 'pin') {
      return { compId: wire.from.compId, terminal: wire.from.terminal, wireEnd: 'from' };
    }
    if (wire.to && wire.to.type === 'pin') {
      return { compId: wire.to.compId, terminal: wire.to.terminal, wireEnd: 'to' };
    }
    
    // Connected to other wire terminals:
    if (wire.from && wire.from.type === 'wire') {
      const res = findConnectedPin(wire.from.wireId, visited);
      if (res) return { compId: res.compId, terminal: res.terminal, wireEnd: 'from' };
    }
    if (wire.to && wire.to.type === 'wire') {
      const res = findConnectedPin(wire.to.wireId, visited);
      if (res) return { compId: res.compId, terminal: res.terminal, wireEnd: 'to' };
    }
    
    // Check wires connecting TO this wire
    for (const w of state.wires) {
      if (w.from && w.from.type === 'wire' && w.from.wireId === wireId) {
        const res = findConnectedPin(w.id, visited);
        if (res) return { compId: res.compId, terminal: res.terminal, wireEnd: 'from' };
      }
      if (w.to && w.to.type === 'wire' && w.to.wireId === wireId) {
        const res = findConnectedPin(w.id, visited);
        if (res) return { compId: res.compId, terminal: res.terminal, wireEnd: 'to' };
      }
    }
    
    return null;
  };

  // Helper: Retrieve components current value at the active timestep
  const getComponentCurrentAtIndex = (compId: string, idx: number): number => {
    if (!simResults) return 0.0;
    
    const ki = `I_${compId}`;
    if (simResults.custom_plots && simResults.custom_plots[ki]) {
      return simResults.custom_plots[ki][idx] ?? 0.0;
    }
    if (simResults.inductors && simResults.inductors[compId]) {
      return simResults.inductors[compId][idx] ?? 0.0;
    }
    if (simResults.ammeters && simResults.ammeters[compId]) {
      return simResults.ammeters[compId][idx] ?? 0.0;
    }
    return 0.0;
  };

  // Main playback animation tick handler
  const animate = (timeMs: number) => {
    if (lastTimeRef.current !== null && isPlaying && simResults) {
      const dtReal = (timeMs - lastTimeRef.current) / 1000.0;
      
      // Calculate virtual elapsed time (1.0x plays full duration in 5 seconds)
      const baseDuration = 5.0; // 5s for full sweep at 1x
      const virtualSpeed = (totalSimDuration / baseDuration) * speedMultiplier;
      const dtVirtual = dtReal * virtualSpeed;
      
      setPlayTime((prev) => {
        let next = prev + dtVirtual;
        if (next >= tMax) {
          next = tMin; // loop back seamlessly
        }
        return next;
      });

      // Update flow dot coordinates scrolling offsets
      const stepIdx = getClosestTimeIndex(playTime);

      // 1. Update direct wire segment scrolling offsets
      state.wires.forEach((wire: any) => {
        const segs = getSegmentsForWire(wire, state.wires);
        if (segs.length === 0) {
          const wireVal = getComponentCurrentAtIndex(wire.id, stepIdx);
          if (Math.abs(wireVal) > 1e-3) {
            // Velocity is driven by simulated current amplitude and direction
            const velocity = 65.0 * Math.sign(wireVal) * Math.min(2.5, Math.pow(Math.abs(wireVal) * 10, 0.4));
            const oldOffset = wireOffsetsRef.current[`direct_wire_${wire.id}`] || 0.0;
            wireOffsetsRef.current[`direct_wire_${wire.id}`] = oldOffset + velocity * dtReal;
          }
        } else {
          segs.forEach(seg => {
            const wireVal = getComponentCurrentAtIndex(seg.segmentId, stepIdx) || getComponentCurrentAtIndex(wire.id, stepIdx);
            if (Math.abs(wireVal) > 1e-3) {
              // Velocity is driven by simulated current amplitude and direction
              const velocity = 65.0 * Math.sign(wireVal) * Math.min(2.5, Math.pow(Math.abs(wireVal) * 10, 0.4));
              const oldOffset = wireOffsetsRef.current[`direct_wire_${seg.segmentId}`] || 0.0;
              wireOffsetsRef.current[`direct_wire_${seg.segmentId}`] = oldOffset + velocity * dtReal;
            }
          });
        }
      });

      // 2. Update component internal flow scrolling offsets
      state.components.forEach((comp: any) => {
        const compVal = getComponentCurrentAtIndex(comp.id, stepIdx);
        if (Math.abs(compVal) > 1e-3) {
          // Velocity is driven by simulated current amplitude and direction
          const velocity = 65.0 * Math.sign(compVal) * Math.min(2.5, Math.pow(Math.abs(compVal) * 10, 0.4));
          const oldOffset = wireOffsetsRef.current[`internal_flow_${comp.id}`] || 0.0;
          wireOffsetsRef.current[`internal_flow_${comp.id}`] = oldOffset + velocity * dtReal;
        }
      });
    }
    
    lastTimeRef.current = timeMs;
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(animate);
    }
  };

  // Re-sync loop when matches change playing states
  useEffect(() => {
    if (isPlaying) {
      lastTimeRef.current = null;
      requestRef.current = requestAnimationFrame(animate);
    } else {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, playTime, speedMultiplier, simResults]);

  // Viewport Drag-drop navigation controls
  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    
    // If the click is on active scopes or components or wires or close/interactive elements, skip panning
    const target = e.target as SVGElement | null;
    if (target) {
      const closestElement = target.closest('.cursor-pointer, .cursor-grab, .cursor-grabbing, .gate-pulse-visualizer');
      if (closestElement && e.currentTarget.contains(closestElement) && closestElement !== e.currentTarget) {
        // Log clicking interactive element, permit local component/wire event handlers
        lastPointerDownRef.current = { x: e.clientX, y: e.clientY };
        return;
      }
    }

    setIsPanning(true);
    setPanStart({ x: e.clientX - panX, y: e.clientY - panY });
    lastPointerDownRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (draggedScopeIdRef.current) {
      const scopeId = draggedScopeIdRef.current;
      const schematicMouseX = (e.clientX - panX) / zoom;
      const schematicMouseY = (e.clientY - panY) / zoom;
      const newX = schematicMouseX - dragOffsetRef.current.x;
      const newY = schematicMouseY - dragOffsetRef.current.y;
      
      setActiveScopes(prev => ({
        ...prev,
        [scopeId]: {
          ...prev[scopeId],
          x: newX,
          y: newY,
          isCustomMoved: true
        }
      }));
      return; // prevent canvas panning when dragging a scope
    }

    if (!isPanning) return;
    setPanX(e.clientX - panStart.x);
    setPanY(e.clientY - panStart.y);
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (draggedScopeIdRef.current) {
      draggedScopeIdRef.current = null;
    }
    setIsPanning(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const zoomFactor = 1.08;
    let newZoom = zoom;
    if (e.deltaY < 0) {
      newZoom = Math.min(3.5, zoom * zoomFactor);
    } else {
      newZoom = Math.max(0.4, zoom / zoomFactor);
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const schematicX = (mouseX - panX) / zoom;
    const schematicY = (mouseY - panY) / zoom;

    const newPanX = mouseX - schematicX * newZoom;
    const newPanY = mouseY - schematicY * newZoom;

    setZoom(newZoom);
    setPanX(newPanX);
    setPanY(newPanY);
  };

  const resetViewPosition = () => {
    setPanX(120);
    setPanY(120);
    setZoom(0.95);
  };

  // Timeline scrub tracker
  const handleScrubChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsPlaying(false);
    const pct = parseFloat(e.target.value);
    const targetT = tMin + (totalSimDuration * pct);
    setPlayTime(targetT);
  };

  // Trigger fine stepping back/forward
  const stepFrame = (dir: 'back' | 'forward') => {
    setIsPlaying(false);
    const size = tData.length;
    if (size === 0) return;
    
    let nextIdx = currentStepIndex;
    if (dir === 'back') {
      nextIdx = Math.max(0, currentStepIndex - Math.max(1, Math.floor(size * 0.005)));
    } else {
      nextIdx = Math.min(size - 1, currentStepIndex + Math.max(1, Math.floor(size * 0.005)));
    }
    setPlayTime(tData[nextIdx]);
  };

  // Trace distance tracking helper for circle wire dots positioning
  const getPointAtLength = (pathPoints: Array<{ x: number, y: number }>, distance: number): { x: number, y: number } | null => {
    if (pathPoints.length === 0) return null;
    let remaining = distance;
    for (let i = 0; i < pathPoints.length - 1; i++) {
      const p1 = pathPoints[i];
      const p2 = pathPoints[i + 1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (remaining <= len) {
        const ratio = len > 0 ? remaining / len : 0;
        return {
          x: p1.x + dx * ratio,
          y: p1.y + dy * ratio
        };
      }
      remaining -= len;
    }
    return pathPoints[pathPoints.length - 1];
  };

  const getPointAtLengthWithOffset = (pathPoints: Array<{ x: number, y: number }>, distance: number, offsetDist: number): { x: number, y: number } | null => {
    if (pathPoints.length === 0) return null;
    let remaining = distance;
    for (let i = 0; i < pathPoints.length - 1; i++) {
      const p1 = pathPoints[i];
      const p2 = pathPoints[i + 1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (remaining <= len) {
        const ratio = len > 0 ? remaining / len : 0;
        const nx = -dy / (len > 0 ? len : 1);
        const ny = dx / (len > 0 ? len : 1);
        return {
          x: p1.x + dx * ratio + nx * offsetDist,
          y: p1.y + dy * ratio + ny * offsetDist
        };
      }
      remaining -= len;
    }
    const lastIdx = pathPoints.length - 1;
    const lastP = pathPoints[lastIdx];
    const prevP = pathPoints[lastIdx - 1] || lastP;
    const dx = lastP.x - prevP.x;
    const dy = lastP.y - prevP.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = -dy / (len > 0 ? len : 1);
    const ny = dx / (len > 0 ? len : 1);
    return {
      x: lastP.x + nx * offsetDist,
      y: lastP.y + ny * offsetDist
    };
  };

  const isTraversedPositive = (compId: string, fromNode: string, toNode: string): boolean => {
    const comp = state.components.find((c: any) => c.id === compId);
    if (!comp) return true;
    const pinLabels = Object.keys(getComponentPins(comp)).filter(t => getPinDomain(comp.type, t) !== 'control');
    if (pinLabels.length < 2) return true;
    const p1 = pinLabels[0];
    const n1 = pinToNode[`${compId}.${p1}`];
    const n2 = pinToNode[`${compId}.${pinLabels[1]}`];
    if (fromNode === n1 && toNode === n2) {
      return true;
    }
    return false;
  };

  // Grid / Subplot Rendering Parameters mapping helper
  const getTraceColor = (trace: string, idx: number): string => {
    const list = [
      '#10b981', // emerald
      '#eab308', // gold
      '#ef4444', // ruby red
      '#38bdf8', // sky-blue
      '#a855f7', // purple
      '#f97316', // orange
      '#06b6d4', // cyan
      '#ec4899', // pink
    ];
    return list[idx % list.length];
  };

  const getTraceDataAtTime = (traceName: string, targetIdx: number): number => {
    if (!simResults) return 0;
    if (simResults.custom_plots && simResults.custom_plots[traceName]) return simResults.custom_plots[traceName][targetIdx] ?? 0;
    if (simResults.signals && simResults.signals[traceName]) return simResults.signals[traceName][targetIdx] ?? 0;
    
    // Try node voltages:
    const nodeMatch = traceName;
    if (simResults.voltages && simResults.voltages[nodeMatch]) return simResults.voltages[nodeMatch][targetIdx] ?? 0;
    if (simResults.voltmeters && simResults.voltmeters[nodeMatch]) return simResults.voltmeters[nodeMatch][targetIdx] ?? 0;
    
    // Try currents:
    if (simResults.inductors && simResults.inductors[nodeMatch]) return simResults.inductors[nodeMatch][targetIdx] ?? 0;
    if (simResults.ammeters && simResults.ammeters[nodeMatch]) return simResults.ammeters[nodeMatch][targetIdx] ?? 0;
    
    return 0;
  };

  // Helper: Retrieve full trace array
  const getFullTraceArray = (traceName: string): number[] => {
    if (!simResults) return [];
    if (simResults.custom_plots && simResults.custom_plots[traceName]) return simResults.custom_plots[traceName];
    if (simResults.signals && simResults.signals[traceName]) return simResults.signals[traceName];
    if (simResults.voltages && simResults.voltages[traceName]) return simResults.voltages[traceName];
    if (simResults.voltmeters && simResults.voltmeters[traceName]) return simResults.voltmeters[traceName];
    if (simResults.inductors && simResults.inductors[traceName]) return simResults.inductors[traceName];
    if (simResults.ammeters && simResults.ammeters[traceName]) return simResults.ammeters[traceName];
    return [];
  };

  // Draw stacked subplots
  const renderInteractiveSubplot = (subplot: { id: string; title: string; traces: string[] }, spIdx: number) => {
    const width = 640;
    const height = 95;
    const paddingLeft = 55;
    const paddingRight = 20;
    const paddingTop = 10;
    const paddingBottom = 15;

    // Filter by both existence in values AND active global checklist visibility state!
    const activeTraces = subplot.traces.filter(t => getFullTraceArray(t).length > 0 && (visibleTraces[t] !== false));

    // Determine Y bounds
    let yMin = Infinity;
    let yMax = -Infinity;
    activeTraces.forEach((trace) => {
      const arr = getFullTraceArray(trace);
      arr.forEach((val) => {
        if (val < yMin) yMin = val;
        if (val > yMax) yMax = val;
      });
    });

    if (yMin === Infinity || yMax === -Infinity) {
      yMin = -1.0;
      yMax = 1.0;
    } else if (yMin === yMax) {
      yMin -= 1.0;
      yMax += 1.0;
    } else {
      const pad = (yMax - yMin) * 0.1;
      yMin -= pad;
      yMax += pad;
    }

    // Coordinate converters
    const getX = (t: number) => paddingLeft + ((t - tMin) / totalSimDuration) * (width - paddingLeft - paddingRight);
    const getY = (val: number) => height - paddingBottom - ((val - yMin) / (yMax - yMin || 1)) * (height - paddingTop - paddingBottom);

    // Formatter helpers
    const formatXVal = (t: number) => {
      if (totalSimDuration < 0.002) return `${(t * 1e6).toFixed(0)} µs`;
      if (totalSimDuration < 2) return `${(t * 1000).toFixed(1)} ms`;
      return `${t.toFixed(3)} s`;
    };

    const formatYVal = (v: number) => {
      const absSize = Math.abs(yMax - yMin);
      if (absSize > 100) return v.toFixed(0);
      if (absSize > 1) return v.toFixed(1);
      if (absSize > 0.01) return v.toFixed(3);
      return v.toExponential(1);
    };

    const handlePlotInteraction = (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const plotWidth = rect.width;
      const innerWidth = plotWidth * ((width - paddingLeft - paddingRight) / width);
      const startOffset = plotWidth * (paddingLeft / width);
      const cleanX = Math.max(0, Math.min(innerWidth, clickX - startOffset));
      const fraction = cleanX / innerWidth;
      const targetT = tMin + (totalSimDuration * fraction);
      setIsPlaying(false);
      setPlayTime(targetT);
    };

    const allTraces = Array.from(new Set(
      Object.keys(simResults?.custom_plots || {})
        .concat(Object.keys(simResults?.signals || {}))
    )).sort();

    const isSettingsOpen = openPlotSettingsId === subplot.id;

    return (
      <div key={subplot.id} className={`relative border rounded-xl p-1.5 flex flex-col shadow-sm select-none transition-all ${isLight ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-900'}`}>
        
        {/* Absolute Live Numerical Values - Top Left */}
        {activeTraces.length > 0 && (
          <div className="absolute top-1.5 left-[58px] flex items-center gap-2 flex-wrap pointer-events-none z-10 select-none">
            {activeTraces.map((trace) => {
              const activeVal = getTraceDataAtTime(trace, currentStepIndex);
              const color = getStableTraceColor(trace);
              return (
                <div key={trace} className="flex items-center gap-1 text-[8.5px] font-mono leading-none">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                  <span className={isLight ? 'text-slate-500 font-medium' : 'text-slate-500 font-medium'}>{trace}:</span>
                  <span className={`font-bold ${isLight ? 'text-slate-905' : 'text-slate-100'}`}>
                    {activeVal.toFixed(activeVal > 100 ? 0 : activeVal > 1 ? 2 : 4)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Absolute Actions Toolbar - Top Right */}
        <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 z-10">
          <button 
            onClick={() => moveSubplot(spIdx, 'up')}
            disabled={spIdx === 0}
            className={`p-0.5 rounded transition-all cursor-pointer disabled:opacity-20 disabled:pointer-events-none ${isLight ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'}`}
            title="Move Plot Up"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button 
            onClick={() => moveSubplot(spIdx, 'down')}
            disabled={spIdx === localSubplots.length - 1}
            className={`p-0.5 rounded transition-all cursor-pointer disabled:opacity-20 disabled:pointer-events-none ${isLight ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'}`}
            title="Move Plot Down"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
          <button 
            onClick={() => setOpenPlotSettingsId(isSettingsOpen ? null : subplot.id)}
            className={`p-0.5 rounded transition-all cursor-pointer ${isSettingsOpen ? 'bg-sky-500/20 text-sky-500' : (isLight ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900')}`}
            title="Select Traces & Rename"
          >
            <Plus className="h-3 w-3" />
          </button>
          <button 
            onClick={() => deleteSubplot(subplot.id)}
            disabled={localSubplots.length <= 1}
            className={`p-0.5 rounded transition-all cursor-pointer disabled:opacity-20 disabled:pointer-events-none ${isLight ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50' : 'text-slate-500 hover:text-rose-400 hover:bg-rose-950/20'}`}
            title="Remove Lane"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>

        {/* Floating Variable Selector Popover */}
        {isSettingsOpen && (
          <div className={`absolute right-1.5 top-7 z-30 shadow-xl rounded-xl border p-2.5 min-w-[200px] flex flex-col gap-1.5 ${isLight ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
            <div className={`text-[8.5px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Lane Config</div>
            <input 
              type="text"
              value={subplot.title}
              onChange={(e) => renameSubplot(subplot.id, e.target.value)}
              className={`w-full text-[10px] font-bold p-1 rounded border outline-none ${isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'}`}
              placeholder="Plot title..."
            />
            <div className={`text-[8.5px] font-bold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Select Traces</div>
            <div className="flex flex-col gap-0.5 max-h-[110px] overflow-y-auto pr-1">
              {allTraces.map((trace) => {
                const active = subplot.traces.includes(trace);
                const color = getStableTraceColor(trace);
                const isGloballyVisible = visibleTraces[trace] !== false;
                
                return (
                  <label 
                    key={trace} 
                    className={`flex items-center gap-1.5 text-[9px] font-mono font-bold cursor-pointer p-0.5 rounded transition-all hover:bg-slate-500/10 ${active ? (isLight ? 'text-slate-800' : 'text-slate-100') : 'text-slate-500'}`}
                    style={{ color: active ? color : undefined, opacity: isGloballyVisible ? 1.0 : 0.4 }}
                  >
                    <input 
                      type="checkbox"
                      checked={active}
                      onChange={() => toggleSubplotTrace(subplot.id, trace)}
                      className="h-3.5 w-3.5 rounded accent-sky-500 cursor-pointer"
                    />
                    <span className="truncate">{trace}</span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Plot SVG Frame */}
        <div className="mt-5 relative w-full h-auto">
          {activeTraces.length === 0 ? (
            <div className={`h-[58px] border border-dashed flex flex-col items-center justify-center text-center text-[9px] rounded-lg ${isLight ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-slate-900 bg-slate-950/40 text-slate-600'}`}>
              <EyeOff className="h-3.5 w-3.5 mb-0.5" />
              <p className="font-bold">No active traces</p>
            </div>
          ) : (
            <svg 
              viewBox={`0 0 ${width} ${height}`} 
              className="w-full h-auto cursor-col-resize select-none"
              onClick={handlePlotInteraction}
              onMouseMove={(e) => {
                if (e.buttons === 1) handlePlotInteraction(e);
              }}
            >
              {/* Grid Lines */}
              {[0, 0.25, 0.5, 0.75, 1.0].map((step) => {
                const clockT = tMin + step * totalSimDuration;
                const gx = getX(clockT);
                return (
                  <g key={`sp-xGrid-${step}`}>
                    <line x1={gx} y1={paddingTop} x2={gx} y2={height - paddingBottom} stroke={isLight ? '#cbd5e1' : '#1e293b'} strokeWidth="0.8" strokeDasharray="3,3" opacity={isLight ? '0.6' : '1.0'} />
                    {step % 0.5 === 0 && (
                      <text x={gx} y={height - 4} fill={isLight ? '#64748b' : '#475569'} fontSize="7" textAnchor="middle" fontFamily="monospace">
                        {formatXVal(clockT)}
                      </text>
                    )}
                  </g>
                );
              })}

              {[0, 0.25, 0.5, 0.75, 1.0].map((step) => {
                const stepV = yMin + step * (yMax - yMin);
                const gy = getY(stepV);
                return (
                  <g key={`sp-yGrid-${step}`}>
                    <line x1={paddingLeft} y1={gy} x2={width - paddingRight} y2={gy} stroke={isLight ? '#cbd5e1' : '#1e293b'} strokeWidth="0.8" strokeDasharray="3,3" opacity={isLight ? '0.6' : '1.0'} />
                    <text x={paddingLeft - 4} y={gy + 2} fill={isLight ? '#64748b' : '#475569'} fontSize="7.2" textAnchor="end" fontFamily="monospace">
                      {formatYVal(stepV)}
                    </text>
                  </g>
                );
              })}

              {/* Boundary Borders */}
              <line x1={paddingLeft} y1={paddingTop} x2={paddingLeft} y2={height - paddingBottom} stroke={isLight ? '#cbd5e1' : '#334155'} strokeWidth="1" />
              <line x1={paddingLeft} y1={height - paddingBottom} x2={width - paddingRight} y2={height - paddingBottom} stroke={isLight ? '#cbd5e1' : '#334155'} strokeWidth="1" />

              {/* Plot Waveforms */}
              {activeTraces.map((trace) => {
                const arr = getFullTraceArray(trace);
                let pathStr = "";
                const stepRate = Math.max(1, Math.floor(arr.length / 500));
                
                for (let i = 0; i < arr.length; i += stepRate) {
                  const px = getX(tData[i]);
                  const py = getY(arr[i]);
                  if (i === 0) {
                    pathStr += `M ${px} ${py}`;
                  } else {
                    pathStr += ` L ${px} ${py}`;
                  }
                }
                if (arr.length > 0 && (arr.length - 1) % stepRate !== 0) {
                  const px = getX(tData[arr.length - 1]);
                  const py = getY(arr[arr.length - 1]);
                  pathStr += ` L ${px} ${py}`;
                }

                return (
                  <path 
                    key={trace}
                    d={pathStr}
                    fill="none"
                    stroke={getStableTraceColor(trace)}
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.9"
                  />
                );
              })}

              {/* Glowing playhead */}
              <line 
                x1={getX(playTime)} 
                y1={paddingTop} 
                x2={getX(playTime)} 
                y2={height - paddingBottom} 
                stroke="#f43f5e" 
                strokeWidth="1.5" 
              />
              <circle 
                cx={getX(playTime)} 
                cy={paddingTop} 
                r="3" 
                fill="#f43f5e" 
              />
            </svg>
          )}
        </div>
      </div>
    );
  };

  // Empty state if no results are active
  if (!simResults || tData.length === 0) {
    return (
      <div className={`flex-1 flex flex-col items-center justify-center p-12 border rounded-2xl min-h-[500px] ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-900'}`}>
        <div className={`h-14 w-14 border rounded-2xl flex items-center justify-center mb-5 animate-pulse shadow-md ${isLight ? 'bg-sky-50 text-sky-600 border-sky-200' : 'bg-sky-500/5 text-sky-400 border-sky-500/10'}`}>
          <Sliders className="h-6 w-6" />
        </div>
        <h3 className={`text-sm font-bold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>No Simulation Workspace Present</h3>
        <p className={`text-[11px] text-center max-w-[420px] mt-2 mb-6 leading-relaxed ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>
          The player requires active waveforms from solver memory. Go to the schematic diagram editor tab first, design your network, and tap "Solve Network" to prepare interactive flows!
        </p>
        <button 
          onClick={triggerRun}
          className="px-4 py-2 text-xs font-bold bg-sky-600 hover:bg-sky-500 text-sky-50 border border-sky-400/20 rounded-lg shadow-xl shadow-sky-600/10 transition-all flex items-center gap-1.5 cursor-pointer"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Run Solver Now
        </button>
      </div>
    );
  }

  // Active Sandbox Sandbox Panel
  const allTracesForSidebar = Array.from(new Set(
    Object.keys(simResults?.custom_plots || {})
      .concat(Object.keys(simResults?.signals || {}))
  )).sort();

  const loopCurrentTraces = allTracesForSidebar.filter(t => t.startsWith('I_') || t.startsWith('I('));
  const nonCurrentTraces = allTracesForSidebar.filter(t => !t.startsWith('I_') && !t.startsWith('I('));

  return (
    <div ref={containerRef} className={`flex-1 flex flex-col gap-4 ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
      {/* Simulation Info Dashboard */}
      <div className={`border rounded-2xl px-5 py-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl select-none ${isLight ? 'bg-white border-slate-200' : 'bg-slate-950/60 border-slate-900'}`}>
        <div className="flex items-center gap-3">
          <div className={`h-9 w-9 border rounded-xl flex items-center justify-center font-bold ${isLight ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'}`}>
            ⚡
          </div>
          <div>
            <h4 className={`text-xs font-bold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>Interactive Circuit Flow Sandbox</h4>
            <div className="flex items-center flex-wrap gap-1.5 mt-1 text-[10.5px]">
              <span className={isLight ? 'text-slate-500' : 'text-slate-500'}>Active Solver:</span>
              <span className={`font-mono font-bold px-1 border rounded uppercase ${isLight ? 'text-sky-700 bg-sky-50 border-sky-200' : 'text-sky-400 bg-sky-950/40 border-sky-950'}`}>
                {state.simulationSettings?.solver || 'euler'}
              </span>
              <span className="text-slate-700 font-bold">|</span>
              <span className={isLight ? 'text-slate-500' : 'text-slate-500'}>Timesteps:</span>
              <span className={`font-mono font-bold px-1 rounded ${isLight ? 'text-slate-700 bg-slate-100' : 'text-slate-300 bg-slate-900'}`}>{tData.length} pts</span>
              
              <span className="text-slate-700 font-bold">|</span>
              <span className={isLight ? 'text-slate-500' : 'text-slate-500'}>Simulation Mode:</span>
              <div className={`flex items-center p-0.5 rounded-lg border gap-1 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/60 border-slate-800/80'}`}>
                <button
                  onClick={triggerRun}
                  className={`px-2 py-0.5 rounded text-[9.5px] font-bold font-sans transition-all cursor-pointer flex items-center gap-1 ${
                    !isFidelitySimActive 
                      ? (isLight ? 'bg-amber-100 text-amber-800 border border-amber-205 shadow-sm' : 'bg-amber-500/15 text-amber-300 border border-amber-500/30 shadow-sm') 
                      : (isLight ? 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/50 border border-transparent' : 'text-slate-400 hover:text-white hover:bg-slate-800/40 border border-transparent')
                  }`}
                  title="Run fast unsegmented simulation (plots and waveform calculation only)"
                >
                  {!isFidelitySimActive && <span className="h-1 w-1 rounded-full bg-amber-400" />}
                  Fast (Plots)
                </button>
                <button
                  onClick={runFidelitySim}
                  className={`px-2 py-0.5 rounded text-[9.5px] font-bold font-sans transition-all cursor-pointer flex items-center gap-1 ${
                    isFidelitySimActive 
                      ? (isLight ? 'bg-emerald-100 text-emerald-800 border border-emerald-250' : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30') 
                      : (isLight ? 'text-slate-500 hover:text-slate-800 hover:bg-slate-100/50 border border-transparent' : 'text-slate-400 hover:text-white hover:bg-slate-800/40 border border-transparent')
                  }`}
                  title="Run high-fidelity math splitting for real-time current flow animations"
                >
                  {isFidelitySimActive && <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />}
                  Detailed (Flows)
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap md:flex-nowrap">
          {/* Miniplot Window Setting */}
          <div className={`h-10 px-4 rounded-xl flex items-center gap-2 shadow text-xs border ${isLight ? 'bg-white border-slate-200 text-slate-700' : 'bg-slate-950 border-slate-900 text-slate-350'}`}>
            <span className="font-bold text-[9.5px] uppercase font-sans tracking-tight text-slate-500">Mini-Scope:</span>
            <input 
              type="number"
              min="10"
              max="10000"
              step="10"
              value={miniplotWidthUs}
              onChange={(e) => setMiniplotWidthUs(Math.max(10, parseInt(e.target.value) || 100))}
              className={`w-16 h-7 px-1.5 text-center font-mono font-bold rounded border text-[11px] focus:outline-none ${isLight ? 'bg-slate-50 border-slate-200 text-slate-800 focus:border-slate-350' : 'bg-slate-900 border-slate-800 text-slate-100 focus:border-slate-700'}`}
            />
            <span className="font-bold">µs</span>
          </div>

          {/* Digital Time Indicator Block */}
          <div className={`h-10 px-4 rounded-xl flex items-center gap-2 shadow font-mono text-xs border ${isLight ? 'bg-white border-slate-200 text-sky-750' : 'bg-slate-950 border-slate-900 text-sky-450 border-r border-sky-500/10'}`}>
            <span className="text-slate-500 font-bold text-[9.5px] uppercase font-sans tracking-tight">Time:</span>
            <span className={`font-bold min-w-[70px] text-right ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
              {(playTime * 1000).toFixed(4)}
            </span>
            <span className={isLight ? 'text-sky-700 font-bold' : 'text-sky-500 font-bold'}>ms</span>
            <span className={isLight ? 'text-slate-300' : 'text-slate-800'}>/</span>
            <span className="text-slate-500">{(tMax * 1000).toFixed(1)} ms</span>
          </div>
        </div>
      </div>

      {/* Main Sandbox Layout Area: Controls sidebar, Schematic overlay, and custom subplot lanes */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1">
        
        {/* Left Column: Interactive Legends & Visibility Toggles (3 cols) */}
        {!isSchematicFullScreen && showFlowInspector && (
          <div className={`lg:col-span-3 border p-4 rounded-2xl flex flex-col gap-4 shadow-xl select-none ${isLight ? 'bg-white border-slate-200' : 'bg-slate-950/85 border-slate-900'}`}>
            <div>
              <div className="flex items-center gap-1.5 text-slate-200">
                <Sliders className={`h-4 w-4 ${isLight ? 'text-sky-600' : 'text-sky-400'}`} />
                <h3 className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>Flow Inspector</h3>
              </div>
              <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                Toggle specific loops or signals below to instantly show/hide current overlay flows and wave lanes.
              </p>
            </div>

            {/* Master Display Controls */}
            <div className={`flex flex-col gap-2 p-2 px-2.5 rounded-xl border ${isLight ? 'bg-slate-50 border-slate-200/60' : 'bg-slate-900/30 border-slate-900/70'}`}>
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>Overlay Master</span>
                <button 
                  onClick={() => {
                    const anyOn = loops.some(l => visibleTraces[l.id] !== false);
                    const updated: Record<string, boolean> = { ...visibleTraces };
                    loops.forEach(l => {
                      updated[l.id] = !anyOn;
                    });
                    setVisibleTraces(updated);
                  }}
                  className={`px-2 py-0.5 border text-[9px] font-extrabold rounded transition-all cursor-pointer ${isLight ? 'bg-white border-slate-200 hover:bg-slate-50 text-slate-655 hover:text-slate-900 shadow-sm' : 'bg-slate-950 border-slate-850 hover:bg-slate-900 text-slate-300 hover:text-white'}`}
                >
                  {loops.some(l => visibleTraces[l.id] !== false) ? "Mute All" : "Unmute All"}
                </button>
              </div>
            </div>

            {/* Traces Toggles List */}
            <div className="flex-1 flex flex-col gap-3.5 overflow-y-auto max-h-[350px] pr-1">
              {/* Loop currents */}
              <div className="flex flex-col gap-1.5">
                <span className={`text-[9px] font-extrabold uppercase tracking-widest flex items-center gap-1 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${isLight ? 'bg-emerald-500' : 'bg-emerald-400'}`} />
                  Active Loop Currents
                </span>

                {loops.length === 0 ? (
                  <p className="text-[10px] text-slate-600 italic py-1 pl-2">No active currents detected</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {loops.map((loop, idx) => {
                      const isVisible = visibleTraces[loop.id] !== false;
                      const color = loop.color;
                      const chordVal = getTraceDataAtTime(loop.traceKey, currentStepIndex);
                      
                      return (
                        <div 
                          key={loop.id}
                          onClick={() => {
                            setVisibleTraces(prev => ({ ...prev, [loop.id]: !isVisible }));
                          }}
                          className={`flex flex-col p-2 rounded-lg border transition-all cursor-pointer ${
                            isVisible 
                              ? (isLight ? 'bg-sky-50/60 border-sky-100 shadow-sm' : 'bg-slate-900/25 border-slate-900/60 hover:bg-slate-900/45') 
                              : 'bg-transparent border-transparent opacity-60 hover:bg-slate-500/5 hover:opacity-90'
                          }`}
                        >
                          <div className="flex items-center justify-between min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <input 
                                type="checkbox"
                                checked={isVisible}
                                onChange={() => {}} // click is handled on parent wrapper
                                className="h-3 w-3 rounded accent-sky-500 cursor-pointer text-sky-500"
                                style={{ accentColor: color }}
                              />
                              <span 
                                className="text-[10px] font-bold truncate tracking-tight uppercase"
                                style={{ color: isVisible ? color : '#64748b' }}
                              >
                                Loop {idx + 1}
                              </span>
                            </div>
                            
                            <div className="text-right shrink-0">
                              <span className={`text-[10.5px] font-mono font-bold ${isLight ? 'text-slate-700' : 'text-slate-350'}`}>
                                {formatCurrentValue(chordVal)}
                              </span>
                            </div>
                          </div>
                          <div className={`text-[8.5px] font-mono pl-5 pt-0.5 truncate max-w-full ${isLight ? 'text-slate-450' : 'text-slate-500'}`}>
                            {loop.segments.map(s => s.compId).join(' → ')}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Other voltages/controls */}
              {nonCurrentTraces.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className={`text-[9px] font-extrabold uppercase tracking-widest flex items-center gap-1 ${isLight ? 'text-sky-655' : 'text-sky-400'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${isLight ? 'bg-sky-500' : 'bg-sky-450'}`} />
                    Voltages & Controls
                  </span>
                  <div className="flex flex-col gap-1">
                    {nonCurrentTraces.map((trace) => {
                      const isVisible = visibleTraces[trace] !== false;
                      const color = getStableTraceColor(trace);
                      const val = getTraceDataAtTime(trace, currentStepIndex);
                      
                      return (
                        <div 
                          key={trace}
                          onClick={() => {
                            setVisibleTraces(prev => ({ ...prev, [trace]: !isVisible }));
                          }}
                          className={`flex items-center justify-between p-2 rounded-lg border transition-all cursor-pointer ${
                            isVisible 
                              ? (isLight ? 'bg-slate-100 border-slate-205/65 hover:bg-slate-100/90' : 'bg-slate-900/25 border-slate-900/60 hover:bg-slate-900/45') 
                              : 'bg-transparent border-transparent opacity-60 hover:bg-slate-500/5 hover:opacity-90'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <input 
                              type="checkbox"
                              checked={isVisible}
                              onChange={() => {}} 
                              className="h-3 w-3 rounded cursor-pointer"
                              style={{ accentColor: color }}
                            />
                            <span 
                              className="text-[10px] font-mono font-bold truncate"
                              style={{ color: isVisible ? color : (isLight ? '#475569' : '#64748b') }}
                            >
                              {trace}
                            </span>
                          </div>
                          
                          <div className="text-right shrink-0">
                            <span className={`text-[10.5px] font-mono font-medium ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                              {val.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Center Column: Schematic Canvas Section */}
        <div className={`border rounded-2xl overflow-hidden flex flex-col relative ${isSchematicFullScreen ? 'lg:col-span-12 h-[650px]' : (showFlowInspector ? 'lg:col-span-5 h-[500px]' : 'lg:col-span-8 h-[500px]')} ${isLight ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-900'}`}>
          {/* Header toolbar */}
          <div className={`px-4 py-2 border-b flex items-center justify-between select-none z-10 ${isLight ? 'border-slate-200 bg-slate-100' : 'border-slate-900 bg-slate-950/40'}`}>
            <span className={`text-[10.5px] font-bold flex items-center gap-1 ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>
              🎨 Circuit Schematic (Flow Overlay)
            </span>
            <div className="flex items-center gap-2">
              {/* Checkbox for Numerical Values */}
              <label className={`flex items-center gap-1.5 text-[9.5px] font-bold cursor-pointer select-none px-2 py-1 rounded border transition-all ${isLight ? 'text-slate-600 border-slate-200 bg-white hover:bg-slate-50' : 'text-slate-400 border-slate-800 bg-slate-900/45 hover:bg-slate-900/80'}`}>
                <input 
                  type="checkbox"
                  checked={showNumericalValues}
                  onChange={(e) => setShowNumericalValues(e.target.checked)}
                  className="h-3 w-3 rounded accent-sky-500 cursor-pointer"
                />
                <span>Show Values</span>
              </label>

              <button 
                onClick={() => setZoom(prev => Math.min(3.5, prev * 1.15))}
                className={`p-1 rounded transition-all cursor-pointer ${isLight ? 'hover:text-slate-900 text-slate-500 hover:bg-slate-200' : 'hover:text-white text-slate-400 hover:bg-slate-900'}`}
                title="Zoom In"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button 
                onClick={() => setZoom(prev => Math.max(0.4, prev / 1.15))}
                className={`p-1 rounded transition-all cursor-pointer ${isLight ? 'hover:text-slate-900 text-slate-500 hover:bg-slate-200' : 'hover:text-white text-slate-400 hover:bg-slate-900'}`}
                title="Zoom Out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <button 
                onClick={resetViewPosition}
                className={`p-1 rounded transition-all cursor-pointer ${isLight ? 'hover:text-slate-900 text-slate-500 hover:bg-slate-200' : 'hover:text-white text-slate-400 hover:bg-slate-900'}`}
                title="Reset View"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button 
                onClick={() => setIsSchematicFullScreen(!isSchematicFullScreen)}
                className={`p-1 rounded transition-all cursor-pointer ${isLight ? 'hover:text-slate-900 text-slate-500 hover:bg-slate-200' : 'hover:text-white text-slate-400 hover:bg-slate-900'}`}
                title={isSchematicFullScreen ? "Minimize Schematic" : "Maximize Schematic"}
              >
                {isSchematicFullScreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>

          <div className="absolute top-12 left-3 z-10 select-none pointer-events-none">
            <div className={`px-2 py-1 backdrop-blur rounded border text-[8.5px] flex items-center gap-1 ${isLight ? 'bg-white/90 border-slate-200 text-slate-500 shadow-sm' : 'bg-slate-900/90 border-slate-800 text-slate-400'}`}>
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping inline-block" />
              <span>Current rate proportional to flow dots density and speed</span>
            </div>
          </div>

          {/* SVG canvas */}
          <div className="flex-1 overflow-hidden relative cursor-grab active:cursor-grabbing">
            <svg
              className="w-full h-full select-none outline-none"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onWheel={handleWheel}
              style={{ backgroundColor: styles.svgBg }}
            >
              {/* Grid backdrop */}
              <defs>
                <pattern id="sandbox-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke={isLight ? '#0284c7' : '#22d3ee'} strokeWidth="0.8" opacity={isLight ? '0.08' : '0.04'} />
                  <circle cx="20" cy="20" r="1" fill={isLight ? '#000000' : '#ffffff'} opacity={isLight ? '0.08' : '0.05'} />
                </pattern>
                
                {/* Visual Neonglow filter */}
                <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3.2" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              
              <rect width="100%" height="100%" fill={styles.svgBg} />
              <rect width="100%" height="100%" fill="url(#sandbox-grid)" />
              
              {/* Scaled transform viewport group */}
              <g transform={`translate(${panX}, ${panY}) scale(${zoom})`}>
                
                {/* Wires */}
                {state.wires.map((wire: any, wIdx: number) => {
                  const pathPoints = getWirePath(wire);
                  const pathStr = pathPoints ? pathPoints.map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ') : "";
                  const isControl = (wire.from && wire.from.type === 'pin' && state.components.find((c: any) => c.id === wire.from.compId)?.type === 'CONST') || (wire.to && wire.to.type === 'pin' && state.components.find((c: any) => c.id === wire.to.compId)?.type === 'CONST');
                  
                  return (
                    <g key={`wire-interactive-g-${wire.id}-${wIdx}`}>
                      <path 
                        key={`wire-path-${wire.id}-${wIdx}`}
                        d={pathStr}
                        fill="none" 
                        stroke={isControl ? '#38bdf8' : (isLight ? '#94a3b8' : '#334155')} 
                        strokeWidth={isControl ? '1.5' : '2.2'} 
                        opacity={isControl ? '0.7' : '0.9'}
                        strokeDasharray={isControl ? '3,3' : undefined}
                      />
                      {/* Wide interactive overlay with custom soft hover selection cue */}
                      <path
                        d={pathStr}
                        fill="none"
                        stroke="transparent"
                        strokeWidth="11"
                        className="cursor-pointer hover:stroke-sky-400/15 active:stroke-sky-400/30 transition-all pointer-events-auto"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (lastPointerDownRef.current) {
                            const dx = e.clientX - lastPointerDownRef.current.x;
                            const dy = e.clientY - lastPointerDownRef.current.y;
                            if (Math.hypot(dx, dy) > 5) return; // ignore viewport panning
                          }
                          toggleWireScope(wire);
                        }}
                      />
                    </g>
                  );
                })}
                                 {/* Dynamic Direct-Wire Flow Dots overlay */}
                {state.wires.map((wire: any, wIndex: number) => {
                  const isControl = (wire.from && wire.from.type === 'pin' && state.components.find((c: any) => c.id === wire.from.compId)?.type === 'CONST') || 
                                    (wire.to && wire.to.type === 'pin' && state.components.find((c: any) => c.id === wire.to.compId)?.type === 'CONST');
                  if (isControl) return null;

                  const segs = getSegmentsForWire(wire, state.wires);

                  const segmentDots = segs.map((seg, sIdx) => {
                    const wireVal = getComponentCurrentAtIndex(seg.segmentId, currentStepIndex) || getComponentCurrentAtIndex(wire.id, currentStepIndex);
                    if (Math.abs(wireVal) < 1e-3) return null;

                    const pathPoints = seg.path;
                    if (!pathPoints || pathPoints.length === 0) return null;

                    let totalLength = 0;
                    for (let i = 0; i < pathPoints.length - 1; i++) {
                      const p1 = pathPoints[i];
                      const p2 = pathPoints[i + 1];
                      totalLength += Math.hypot(p2.x - p1.x, p2.y - p1.y);
                    }

                    if (totalLength <= 0) return null;

                    const spacing = 32;
                    const numDots = Math.max(1, Math.floor(totalLength / spacing));
                    const currentOffset = wireOffsetsRef.current[`direct_wire_${seg.segmentId}`] || wireOffsetsRef.current[`direct_wire_${wire.id}`] || 0.0;

                    const dotColor = getStableTraceColor(`I_${wire.id}`);

                    const wireDots = [];
                    for (let dIdx = 0; dIdx < numDots; dIdx++) {
                      let d = (dIdx * spacing + currentOffset) % totalLength;
                      if (d < 0) d += totalLength;

                      const pt = getPointAtLengthWithOffset(pathPoints, d, 0);
                      if (pt) {
                        wireDots.push(
                          <circle
                            key={`direct-dot-${seg.segmentId}-${wIndex}-${sIdx}-${dIdx}`}
                            cx={pt.x}
                            cy={pt.y}
                            r="4.2"
                            fill={dotColor}
                            className="pointer-events-none"
                            style={{
                              filter: "url(#neon-glow)",
                              opacity: 0.95
                            }}
                          />
                        );
                      }
                    }

                    return <g key={`dots-direct-wire-seg-${seg.segmentId}`}>{wireDots}</g>;
                  });

                  return <g key={`dots-direct-wire-${wire.id}`}>{segmentDots}</g>;
                })}

                {/* Direct-Wire Current Direction and Magnitude Overlay */}
                {showWireOverlays && state.wires.map((wire: any, wIdx: number) => {
                  const isControl = (wire.from && wire.from.type === 'pin' && state.components.find((c: any) => c.id === wire.from.compId)?.type === 'CONST') || 
                                    (wire.to && wire.to.type === 'pin' && state.components.find((c: any) => c.id === wire.to.compId)?.type === 'CONST');
                  if (isControl) return null;

                  const segs = getSegmentsForWire(wire, state.wires);

                  const segmentOverlays = segs.map((seg, sIdx) => {
                    const wireVal = getComponentCurrentAtIndex(seg.segmentId, currentStepIndex) || getComponentCurrentAtIndex(wire.id, currentStepIndex);
                    if (Math.abs(wireVal) < 1e-6) return null; // threshold 1uA

                    const pathPoints = seg.path;
                    if (!pathPoints || pathPoints.length === 0) return null;

                    const mid = getWirePathMidpoint(pathPoints);
                    const displayVal = Math.abs(wireVal);
                    let formatted = "";
                    if (displayVal >= 1.0) {
                      formatted = `${displayVal.toFixed(2)} A`;
                    } else if (displayVal >= 1e-3) {
                      formatted = `${(displayVal * 1000).toFixed(1)} mA`;
                    } else {
                      formatted = `${(displayVal * 1e6).toFixed(0)} µA`;
                    }

                    let textAngle = (mid.angle * 180) / Math.PI;
                    if (textAngle > 90 || textAngle < -90) {
                      textAngle += 180;
                    }

                    const labelOffset = -12;
                    const labelX = mid.x + labelOffset * Math.sin(mid.angle);
                    const labelY = mid.y - labelOffset * Math.cos(mid.angle);

                    const arrowAngle = (mid.angle * 180) / Math.PI + (wireVal >= 0 ? 0 : 180);

                    return (
                      <g key={`wire-overlay-seg-${seg.segmentId}-${wIdx}`} className="pointer-events-none select-none">
                        <g transform={`translate(${mid.x}, ${mid.y}) rotate(${arrowAngle})`}>
                          <polygon 
                            points="-5,-4 3,0 -5,4" 
                            fill="#10b981" 
                            stroke={isLight ? '#f8fafc' : '#050711'}
                            strokeWidth="0.8"
                            style={{ filter: "drop-shadow(0px 0px 3px rgba(16,185,129,0.5))" }}
                          />
                        </g>

                        {showNumericalValues && (
                          <g transform={`translate(${labelX}, ${labelY}) rotate(${textAngle})`}>
                            <rect
                              x="-28"
                              y="-7"
                              width="56"
                              height="14"
                              rx="3"
                              fill={isLight ? '#ffffff' : '#090d1f'}
                              stroke={isLight ? '#cbd5e1' : '#1e293b'}
                              strokeWidth="1"
                              opacity="0.9"
                            />
                            <text
                              x="0"
                              y="2.5"
                              fill={isLight ? '#0f172a' : '#f8fafc'}
                              fontSize="7.5"
                              fontFamily="sans-serif"
                              fontWeight="600"
                              textAnchor="middle"
                            >
                              {formatted}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  });

                  return <g key={`overlays-direct-wire-${wire.id}`}>{segmentOverlays}</g>;
                })}

                {/* Draw Junction Dots */}
                {state.wires.map((wire: any, wIdx: number) => {
                  const elements: React.ReactElement[] = [];
                  if (wire.from && wire.from.type === 'wire') {
                    elements.push(
                      <circle key={`${wire.id}-junc-from-${wIdx}`} cx={wire.from.x} cy={wire.from.y} r="3" fill={isLight ? '#94a3b8' : '#334155'} stroke={isLight ? '#f8fafc' : '#050711'} strokeWidth="1" />
                    );
                  }
                  if (wire.to && wire.to.type === 'wire') {
                    elements.push(
                      <circle key={`${wire.id}-junc-to-${wIdx}`} cx={wire.to.x} cy={wire.to.y} r="3" fill={isLight ? '#94a3b8' : '#334155'} stroke={isLight ? '#f8fafc' : '#050711'} strokeWidth="1" />
                    );
                  }
                  return elements.length > 0 ? <g key={`junc-g-${wire.id}-${wIdx}`}>{elements}</g> : null;
                })}

                {/* Components Rendering */}
                {state.components.map((comp: any) => {
                  const pinLabels = Object.keys(getComponentPins(comp));
                  
                  // Render internal component flow dots 
                  const internalPath = getComponentInternalPath(comp);
                  const stepIdx = currentStepIndex;
                  const innerCurrent = getComponentCurrentAtIndex(comp.id, stepIdx);

                  const compTraceCandidates = [
                    `I_${comp.id}`,
                    `I(${comp.id})`,
                    comp.id
                  ];
                  const matchedCompTrace = allTracesForSidebar.find(t => 
                    compTraceCandidates.includes(t) || 
                    t.toLowerCase().includes(comp.id.toLowerCase())
                  );
                  const traceKeyForComp = matchedCompTrace || `I_${comp.id}`;
                  const isGloballyVisible = visibleTraces[traceKeyForComp] !== false;

                  let internalFlowDots: React.ReactElement[] = [];

                  if (isGloballyVisible && internalPath && Math.abs(innerCurrent) > 1e-3) {
                    const { p1, p2 } = internalPath;
                    const dx = p2.x - p1.x;
                    const dy = p2.y - p1.y;
                    const totalLength = Math.sqrt(dx * dx + dy * dy);
                    
                    if (totalLength > 0) {
                      const spacing = 18;
                      const numDots = Math.max(1, Math.floor(totalLength / spacing));
                      const currentOffset = wireOffsetsRef.current[`internal_flow_${comp.id}`] || 0.0;
                      const dotColor = getStableTraceColor(traceKeyForComp);

                      for (let dIdx = 0; dIdx < numDots; dIdx++) {
                        let d = (dIdx * spacing + currentOffset) % totalLength;
                        if (d < 0) d += totalLength;
                        
                        const ratio = d / totalLength;
                        const pt = {
                          x: p1.x + dx * ratio,
                          y: p1.y + dy * ratio
                        };

                        internalFlowDots.push(
                          <circle
                            key={`${comp.id}-internal-dot-${dIdx}`}
                            cx={pt.x}
                            cy={pt.y}
                            r="4.2"
                            fill={dotColor}
                            className="pointer-events-none"
                            style={{
                              filter: "url(#neon-glow)",
                              opacity: 0.95
                            }}
                          />
                        );
                      }
                    }
                  }

                  return (
                    <g 
                      key={comp.id}
                      transform={`translate(${comp.x}, ${comp.y}) rotate(${comp.rotation || 0})`}
                      className={`cursor-pointer hover:brightness-125 hover:opacity-90 active:scale-98 transition-all pointer-events-auto ${isLight ? 'text-slate-900' : 'text-slate-100'}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (lastPointerDownRef.current) {
                          const dx = e.clientX - lastPointerDownRef.current.x;
                          const dy = e.clientY - lastPointerDownRef.current.y;
                          if (Math.hypot(dx, dy) > 5) return; // it was a viewport pan drag, ignore click
                        }
                        toggleComponentScope(comp);
                      }}
                    >
                      {/* Inner HTML representation generated by rendering subsystem */}
                      <g dangerouslySetInnerHTML={{ __html: getComponentSVG(comp) }} />
                      
                      {/* Render internal component flow dots layer */}
                      {internalFlowDots.length > 0 && <g>{internalFlowDots}</g>}

                      {/* Component Label Id */}
                      <text
                        x="0"
                        y="-44"
                        fill={isLight ? '#475569' : '#94a3b8'}
                        fontSize="9.5"
                        fontWeight="700"
                        textAnchor="middle"
                        fontFamily="monospace"
                        className="pointer-events-none select-none"
                        style={{ fillOpacity: 0.75 }}
                        transform={comp.rotation === 90 ? `rotate(-90)` : comp.rotation === 180 ? `rotate(-180)` : comp.rotation === 270 ? `rotate(-270)` : undefined}
                      >
                        {comp.id}
                      </text>
                    </g>
                  );
                })}

                {/* Unified Draggable Waveform Mini-Scopes block */}
                {Object.entries(activeScopes).map(([scopeId, scopeRaw]) => {
                  const scope = scopeRaw as any;
                  const anchor = getScopeAnchor(scopeId, scope);
                  const W = 62;
                  const H = 32;
                  const rectX = scope.x - W / 2;
                  const rectY = scope.y - H / 2;
                  
                  const switchingPeriod = miniplotWidthUs * 1e-6;
                  
                  const numSamples = 40;
                  const points: { x: number; y: number }[] = [];
                  let localMin = Infinity;
                  let localMax = -Infinity;
                  const windowData: { t: number; y: number }[] = [];
                  
                  for (let sIdx = 0; sIdx <= numSamples; sIdx++) {
                    const tSample = (playTime - switchingPeriod / 2) + (sIdx / numSamples) * switchingPeriod;
                    const closestIdx = getClosestTimeIndex(tSample);
                    const yVal = getScopeWaveformYVal(scopeId, scope, closestIdx);
                    windowData.push({ t: tSample, y: yVal });
                    if (yVal < localMin) localMin = yVal;
                    if (yVal > localMax) localMax = yVal;
                  }
                  
                  if (localMax - localMin < 1e-4) {
                    const val = localMin !== Infinity ? localMin : 0;
                    if (Math.abs(val) > 0.5) {
                      localMin = val - Math.abs(val) * 0.2;
                      localMax = val + Math.abs(val) * 0.2;
                    } else {
                      localMin = val - 0.5;
                      localMax = val + 0.5;
                    }
                  } else {
                    const spread = localMax - localMin;
                    localMin -= spread * 0.1;
                    localMax += spread * 0.1;
                  }
                  
                  windowData.forEach((pt, sIdx) => {
                    const pctX = sIdx / numSamples;
                    const pctY = (pt.y - localMin) / (localMax - localMin);
                    const posX = rectX + pctX * W;
                    const posY = rectY + H - pctY * H;
                    points.push({ x: posX, y: posY });
                  });
                  
                  let pathD = "";
                  if (points.length > 0) {
                    pathD = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)} ` + 
                            points.slice(1).map(p => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
                  }
                  
                  const midIdx = Math.floor(numSamples / 2);
                  const midPt = points[midIdx];
                  const currentMiddleVal = getScopeWaveformYVal(scopeId, scope, currentStepIndex);
                  
                  const threshold = (localMax + localMin) / 2;
                  const isHigh = currentMiddleVal > threshold;
                  
                  // Waveform stroke & theme color depending on properties
                  let colorTheme = "#60a5fa"; // sky-blue
                  if (scope.type === 'gate-pulse') {
                    colorTheme = isHigh ? "#34d399" : "#60a5fa";
                  } else if (scope.type === 'component-voltage' || scope.type === 'wire-voltage') {
                    colorTheme = "#fb923c"; // glowing amber voltage
                  } else if (scope.type === 'component-current') {
                    colorTheme = "#10b981"; // shining emerald current
                  } else {
                    colorTheme = "#e879f9"; // glowing violet signals
                  }

                  // Numeric display value
                  let formattedVal = "";
                  if (scope.type === 'component-voltage' || scope.type === 'wire-voltage') {
                    if (Math.abs(currentMiddleVal) >= 1.0) {
                      formattedVal = `${currentMiddleVal.toFixed(1)}V`;
                    } else {
                      formattedVal = `${(currentMiddleVal * 1000).toFixed(0)}mV`;
                    }
                  } else if (scope.type === 'component-current') {
                    const abs = Math.abs(currentMiddleVal);
                    if (abs >= 1.0) {
                      formattedVal = `${currentMiddleVal.toFixed(2)}A`;
                    } else if (abs >= 1e-3) {
                      formattedVal = `${(currentMiddleVal * 1000).toFixed(1)}mA`;
                    } else {
                      formattedVal = `${(currentMiddleVal * 1e6).toFixed(1)}µA`;
                    }
                  } else {
                    if (Math.abs(currentMiddleVal) >= 1e-3) {
                      formattedVal = currentMiddleVal.toFixed(2);
                    } else {
                      formattedVal = "0";
                    }
                  }

                  return (
                    <g key={`dynamic-scope-${scopeId}`} className="select-none pointer-events-none">
                      {/* Connector Line back to anchor source point */}
                      <line
                        x1={anchor.x}
                        y1={anchor.y}
                        x2={scope.x}
                        y2={scope.y}
                        stroke={colorTheme}
                        strokeWidth="1"
                        strokeDasharray="2,2"
                        strokeOpacity="0.5"
                      />
                      
                      {/* Anchor feedback highlight circles */}
                      <circle
                        cx={anchor.x}
                        cy={anchor.y}
                        r="3"
                        fill={colorTheme}
                        fillOpacity="0.3"
                        stroke={colorTheme}
                        strokeWidth="0.8"
                      />

                      {/* Main Graggable Panel BG */}
                      <rect
                        x={rectX}
                        y={rectY}
                        width={W}
                        height={H}
                        rx={5}
                        fill={isLight ? '#ffffff' : '#030712'}
                        fillOpacity={isLight ? 0.95 : 0.88}
                        stroke={colorTheme}
                        strokeWidth="1.1"
                        strokeOpacity={isLight ? 0.6 : 0.25}
                        className="cursor-grab active:cursor-grabbing pointer-events-auto"
                        onPointerDown={(e) => handleScopePointerDown(scopeId, e)}
                        style={{ filter: isLight ? "drop-shadow(0 2px 4px rgba(0,0,0,0.1))" : "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}
                      />
                      
                      {/* Center Playhead Time Tracker Line */}
                      <line
                        x1={rectX + W / 2}
                        y1={rectY}
                        x2={rectX + W / 2}
                        y2={rectY + H}
                        stroke={isLight ? '#475569' : '#ffffff'}
                        strokeOpacity="0.3"
                        strokeWidth="0.8"
                        strokeDasharray="1,1"
                      />
                      
                      {/* Waveform Line path */}
                      {pathD && (
                        <path
                          d={pathD}
                          fill="none"
                          stroke={colorTheme}
                          strokeWidth="1.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      )}
                      
                      {/* Running Dot on the waveform line */}
                      {midPt && (
                        <circle
                          cx={rectX + W / 2}
                          cy={midPt.y}
                          r="2.5"
                          fill={colorTheme}
                          style={{ filter: `drop-shadow(0 0 3px ${colorTheme})` }}
                        />
                      )}
                      
                      {/* Scope Title/Label */}
                      <text
                        x={rectX + 4}
                        y={rectY + 8}
                        fill={isLight ? '#475569' : '#94a3b8'}
                        fontSize="7"
                        fontWeight="700"
                        fontFamily="monospace"
                        className="pointer-events-none select-none"
                      >
                        {scope.label}
                      </text>

                      {/* Dynamic State value label (e.g. value, ON/OFF) */}
                      <text
                        x={rectX + 4}
                        y={rectY + H - 3}
                        fill={colorTheme}
                        fontSize="7"
                        fontWeight="900"
                        fontFamily="monospace"
                        className="pointer-events-none select-none"
                      >
                        {scope.type === 'gate-pulse' ? (isHigh ? "ON" : "OFF") : formattedVal}
                      </text>

                      {/* Tiny interactive close X button inside the scope */}
                      <g 
                        transform={`translate(${rectX + W - 7}, ${rectY + 7})`}
                        className="cursor-pointer pointer-events-auto group"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCloseScope(scopeId);
                        }}
                      >
                        <circle
                          r="5.5"
                          fill={isLight ? '#f1f5f9' : '#1e293b'}
                          fillOpacity={isLight ? 0.9 : 0.4}
                          onPointerDown={(ev) => ev.stopPropagation()}
                          stroke={isLight ? '#cbd5e1' : '#334155'}
                          strokeWidth="0.8"
                        />
                        <path
                          d="M -2.2 -2.2 L 2.2 2.2 M 2.2 -2.2 L -2.2 2.2"
                          stroke={isLight ? '#475569' : '#94a3b8'}
                          strokeWidth="1"
                          strokeLinecap="round"
                        />
                      </g>
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
        </div>
        {/* Right Column: Tab Plots Subplots List (4 cols) */}
        {!isSchematicFullScreen && (
          <div className={`lg:col-span-4 flex flex-col gap-3 overflow-y-auto max-h-[500px] border p-3 rounded-2xl shadow-inner ${isLight ? 'bg-slate-100/40 border-slate-200' : 'bg-slate-950/45 border-slate-900'}`}>
            <div className={`flex items-center justify-between px-1.5 select-none shrink-0 border-b pb-1.5 ${isLight ? 'border-slate-200' : 'border-slate-900/60'}`}>
              <span className={`text-[10px] font-bold flex items-center gap-1.5 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
                <Layers className="h-3.5 w-3.5 text-sky-500" />
                Waveform Lanes ({localSubplots.length})
              </span>
              <button 
                onClick={addSubplot}
                className={`px-2 py-1 text-[9px] font-extrabold uppercase rounded-lg shadow transition-all flex items-center gap-1 cursor-pointer border ${isLight ? 'bg-sky-50 hover:bg-sky-100 text-sky-700 border-sky-200' : 'bg-sky-950/65 hover:bg-sky-900/80 text-sky-400 border-sky-800/40'}`}
              >
                <Plus className="h-3 w-3" /> Add Lane
              </button>
            </div>

            <div className="flex flex-col gap-2 flex-1">
              {localSubplots.map((sp, idx) => renderInteractiveSubplot(sp, idx))}
            </div>
          </div>
        )}
      </div>

      {/* Playback Control Rig Panel */}
      <div className={`border rounded-2xl p-5 flex flex-col gap-4 shadow-xl select-none sticky bottom-0 z-20 backdrop-blur-md ${isLight ? 'bg-white/95 border-slate-200' : 'bg-slate-950/80 border-slate-900'}`}>
        
        {/* Progress Timeline Slider Bar */}
        <div className="flex items-center gap-3 w-full">
          <span className="text-[9.5px] font-bold text-slate-500 font-mono">0.0ms</span>
          <div className="flex-1 relative group mt-0.5">
            <div className="absolute inset-y-0 left-0 bg-rose-500/10 pointer-events-none rounded-full h-2 my-auto" style={{ width: `${((playTime - tMin) / totalSimDuration) * 100}%` }} />
            <input 
              type="range"
              min="0"
              max="1"
              step="0.0001"
              value={totalSimDuration > 0 ? (playTime - tMin) / totalSimDuration : 0}
              onChange={handleScrubChange}
              className={`w-full h-2 rounded-full appearance-none border cursor-pointer outline-none ${isLight ? 'bg-slate-100 border-slate-200 accent-rose-500 focus:accent-rose-600' : 'bg-slate-900 border-slate-800 accent-rose-500 focus:accent-rose-400'}`}
            />
          </div>
          <span className="text-[9.5px] font-bold text-slate-500 font-mono">{(tMax * 1000).toFixed(1)}ms</span>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Quick Step Buttons Rig */}
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                setIsPlaying(false);
                setPlayTime(tMin);
              }}
              className={`h-9 w-9 border rounded-lg transition-all cursor-pointer flex items-center justify-center p-0 ${isLight ? 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-800' : 'border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-white'}`}
              title="Reset to 0.0ms"
            >
              <SkipBack className="h-4 w-4" />
            </button>
            <button 
              onClick={() => stepFrame('back')}
              className={`px-2.5 h-9 border rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer flex items-center gap-1 ${isLight ? 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-800' : 'border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-white'}`}
              title="Step frame back (50us)"
            >
              <span>-50µs</span>
            </button>
            
            {/* Play Pause Button */}
            <button 
              onClick={handlePlayPause}
              className={`h-10 px-5 rounded-xl font-bold font-sans text-xs flex items-center justify-center gap-2 cursor-pointer shadow-lg select-none transition-all ${
                isPlaying 
                ? 'bg-rose-600 hover:bg-rose-500 text-rose-50 border border-rose-400/20 shadow-rose-600/10' 
                : 'bg-emerald-600 hover:bg-emerald-500 text-emerald-50 border border-emerald-400/20 shadow-emerald-600/10'
              }`}
            >
              {isPlaying ? (
                <>
                  <Pause className="h-4 w-4 fill-rose-100/10" strokeWidth="2.5" />
                  <span>Pause Waveforms</span>
                </>
              ) : !isFidelitySimActive ? (
                <>
                  <Play className="h-4 w-4 fill-emerald-100/10" strokeWidth="2.5" />
                  <span>Play & Animate Flow</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-emerald-100/10" strokeWidth="2.5" />
                  <span>Play Waveforms</span>
                </>
              )}
            </button>

            <button 
              onClick={() => stepFrame('forward')}
              className={`px-2.5 h-9 border rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer flex items-center gap-1 ${isLight ? 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-800' : 'border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-white'}`}
              title="Step frame forward (50us)"
            >
              <span>+50µs</span>
            </button>

            <button 
              onClick={() => {
                setIsPlaying(false);
                setPlayTime(tMax);
              }}
              className={`h-9 w-9 border rounded-lg transition-all cursor-pointer flex items-center justify-center p-0 ${isLight ? 'border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-800' : 'border-slate-800 bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-white'}`}
              title="Jump to End"
            >
              <SkipForward className="h-4 w-4" />
            </button>

            {/* Wire Info Toggle Badge Overlay control */}
            <button 
              onClick={() => setShowWireOverlays(!showWireOverlays)}
              className={`px-3 h-9 border rounded-lg text-xs font-sans font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                showWireOverlays 
                ? (isLight ? 'border-emerald-400 bg-emerald-50 text-emerald-600 shadow-sm' : 'border-emerald-500 bg-emerald-950/20 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.15)]') 
                : (isLight ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50' : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white hover:border-slate-700')
              }`}
              title="Toggle current direction badges and arrows overlay on wires"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Wire Info</span>
            </button>

            {/* Flow Inspector Toggle Panel control */}
            <button 
              onClick={() => setShowFlowInspector(!showFlowInspector)}
              className={`px-3 h-9 border rounded-lg text-xs font-sans font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                showFlowInspector 
                ? (isLight ? 'border-sky-400 bg-sky-50 text-sky-600 shadow-sm' : 'border-sky-505 bg-sky-950/20 text-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.15)]') 
                : (isLight ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50' : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white hover:border-slate-700')
              }`}
              title="Toggle sidebar Flow Inspector panel"
            >
              <Sliders className="h-3.5 w-3.5" />
              <span>Flow Inspector</span>
            </button>
          </div>

          {/* Speed slider block */}
          <div className={`flex items-center gap-3 block px-4 py-1.5 border rounded-xl max-w-xs w-full shadow-inner ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/50 border-slate-900'}`}>
            <Sliders className="h-3.5 w-3.5 text-slate-500 shrink-0" />
            <div className="flex-1 flex flex-col gap-0.5 min-w-[70px]">
              <div className="flex items-center justify-between text-[9px] font-bold text-slate-500">
                <span className="uppercase tracking-tight font-sans">Playback Rate</span>
                <span className="font-mono text-emerald-550 font-bold">{speedMultiplier}x</span>
              </div>
              <input 
                type="range"
                min="0.05"
                max="2.00"
                step="0.05"
                value={speedMultiplier}
                onChange={(e) => setSpeedMultiplier(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 h-1 cursor-pointer bg-slate-900 rounded-full"
              />
            </div>
            <div className={`text-[9.5px] font-bold font-sans min-w-[50px] text-right ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              {speedMultiplier < 0.25 ? 'Slo-Mo' : speedMultiplier < 0.75 ? 'Slow' : speedMultiplier <= 1.1 ? 'Normal' : 'Fast'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
