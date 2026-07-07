import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, Pause, Square, SkipBack, SkipForward, Sliders, 
  HelpCircle, ZoomIn, ZoomOut, RotateCcw, AlertCircle, Info, ChevronRight,
  Plus, Trash2, ChevronUp, ChevronDown, EyeOff, Layers, Eye, Maximize2, Minimize2,
  Download, FileCode, Activity, X
} from 'lucide-react';
import { state } from '../schematic/state';
import { getWirePath, getTerminalCoords, getPinDomain, getWireDomain, getWireEndpointCoords } from '../schematic/routing';
import { getComponentSVG } from '../schematic/components';
import { getComponentPins } from '../schematic/config';
import { exportDualGraphJSON } from '../schematic/actions';
import { MathVisualizer } from './MathVisualizer';
import { buildMNALatex, Component } from '../utils/mnaSolver';

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
function getGateSignalName(compId: string, wires: any[], compType?: string): string {
  if (compType === 'vg-FET') {
    return `${compId}.G`;
  }
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
  jsonText: string;
  onRunSimulation: (netlistJson: string) => void;
  subplots: Array<{ id: string; title: string; traces: string[] }>;
  theme?: 'light' | 'dark';
  onClose?: () => void;
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

const resolveInputPinToSource = (trace: string): string => {
  if (!trace.includes('.')) return trace;
  const [compId, terminal] = trace.split('.');
  if (!compId || !terminal) return trace;
  
  // If it is an output pin of a standard component (excluding FROM_SIG wireless block), it is already the source!
  const initialComp = state.components.find(c => c.id === compId);
  if (initialComp && initialComp.type !== 'FROM_SIG' && (terminal === 'Out' || terminal.startsWith('Out'))) {
    return trace;
  }
  
  if (initialComp && (initialComp.type === 'CSCRIPT' || initialComp.type === 'GEN_EBLOCK' || initialComp.type === 'PROBE')) return trace;
  
  const visitedPins = new Set<string>();
  const visitedWires = new Set<string>();
  const queue: any[] = [{ type: 'pin', compId, terminal }];
  
  while (queue.length > 0) {
    const curr = queue.shift();
    if (!curr) continue;
    
    if (curr.type === 'pin') {
      const pinKey = `${curr.compId}.${curr.terminal}`;
      if (visitedPins.has(pinKey)) continue;
      visitedPins.add(pinKey);
      
      const c = state.components.find(comp => comp.id === curr.compId);

      if (c && c.type === 'vg-FET') {
        const fromTag = String(c.parameters?.Gate_Signal_Label || 'S1').trim().toLowerCase();
        
        // Find subsystem prefix of the current vg-FET
        const compIdParts = c.id.split('.');
        const subsystemPrefix = compIdParts.slice(0, -1).join('.'); // Empty if at root
        
        // Find all GOTO_SIGs with matching tag
        const matchingGotos = state.components.filter((other: any) => 
          other.type === 'GOTO_SIG' && String(other.parameters?.tag || 'A').trim().toLowerCase() === fromTag
        );
        
        let matchingGoto = matchingGotos.find((other: any) => {
          const parts = other.id.split('.');
          const prefix = parts.slice(0, -1).join('.');
          return prefix === subsystemPrefix;
        });
        
        if (!matchingGoto) {
          matchingGoto = matchingGotos.find((other: any) => !other.id.includes('.'));
        }
        
        if (!matchingGoto && matchingGotos.length > 0) {
          matchingGoto = matchingGotos[0];
        }

        if (matchingGoto) {
          queue.push({ type: 'pin', compId: matchingGoto.id, terminal: 'In' });
          continue;
        }
      }

      // Wireless signal routing: if we hit a FROM_SIG, jump to the matching GOTO_SIG's input terminal
      if (c && c.type === 'FROM_SIG') {
        const fromTag = String(c.parameters?.tag || 'A').trim().toLowerCase();
        
        // Find subsystem prefix of the current FROM_SIG
        const compIdParts = c.id.split('.');
        const subsystemPrefix = compIdParts.slice(0, -1).join('.'); // Empty if at root
        
        // Find all GOTO_SIGs with matching tag
        const matchingGotos = state.components.filter((other: any) => 
          other.type === 'GOTO_SIG' && String(other.parameters?.tag || 'A').trim().toLowerCase() === fromTag
        );
        
        // Scoping rule:
        // 1. Try to find one in the EXACT same subsystem (same prefix)
        // 2. Try to find one at the root level (no prefix)
        // 3. Fallback to any matching one
        let matchingGoto = matchingGotos.find((other: any) => {
          const parts = other.id.split('.');
          const prefix = parts.slice(0, -1).join('.');
          return prefix === subsystemPrefix;
        });
        
        if (!matchingGoto) {
          matchingGoto = matchingGotos.find((other: any) => !other.id.includes('.'));
        }
        
        if (!matchingGoto && matchingGotos.length > 0) {
          matchingGoto = matchingGotos[0];
        }

        if (matchingGoto) {
          queue.push({ type: 'pin', compId: matchingGoto.id, terminal: 'In' });
          continue;
        }
      }
      
      // Check if this pin is a control source (output)
      if (curr.terminal === 'Out' || curr.terminal.startsWith('Out')) {
        if (c && c.type !== 'FROM_SIG') {
          if (curr.compId !== compId || curr.terminal !== terminal) {
            return pinKey;
          }
        }
      }
      
      if (c && (c.type === 'CSCRIPT' || c.type === 'GEN_EBLOCK' || c.type === 'PROBE')) {
        if (curr.compId !== compId || curr.terminal !== terminal) {
          return pinKey;
        }
      }
      
      // Find all wires connected to this pin (no getWireDomain check for extreme robustness)
      state.wires.forEach((w: any) => {
        if (w.from.type === 'pin' && w.from.compId === curr.compId && w.from.terminal === curr.terminal) {
          queue.push(w.to);
          queue.push({ type: 'wire_obj', wire: w });
        } else if (w.to && w.to.type === 'pin' && w.to.compId === curr.compId && w.to.terminal === curr.terminal) {
          queue.push(w.from);
          queue.push({ type: 'wire_obj', wire: w });
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
        if (otherW.from.type === 'wire' && otherW.from.wireId === w.id) {
          queue.push({ type: 'wire_obj', wire: otherW });
        } else if (otherW.to && otherW.to.type === 'wire' && otherW.to.wireId === w.id) {
          queue.push({ type: 'wire_obj', wire: otherW });
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
  
  return trace; // fallback to original trace if source not found
};
interface PlotlyChartComponentProps {
  subplotId: string;
  traces: string[];
  getFullTraceArray: (traceName: string) => number[];
  getStableTraceColor: (traceName: string) => string;
  tData: number[];
  vStart: number;
  vEnd: number;
  playTime: number;
  totalSimDuration: number;
  isLight: boolean;
  setPlayTime: (t: number) => void;
  setIsPlaying: (p: boolean) => void;
  simResults: any;
}

const PlotlyChartComponent: React.FC<PlotlyChartComponentProps> = ({
  subplotId,
  traces,
  getFullTraceArray,
  getStableTraceColor,
  tData,
  vStart,
  vEnd,
  playTime,
  totalSimDuration,
  isLight,
  setPlayTime,
  setIsPlaying,
  simResults
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const w = window as any;
    if (!w.Plotly || !containerRef.current) return;

    // Filter time range (zoom viewport)
    const xData: number[] = [];
    const traceValues: Record<string, number[]> = {};
    traces.forEach(t => { traceValues[t] = []; });

    for (let i = 0; i < tData.length; i++) {
      const t = tData[i];
      if (t >= vStart && t <= vEnd) {
        xData.push(t);
        traces.forEach(traceName => {
          const arr = getFullTraceArray(traceName);
          traceValues[traceName].push(arr[i] ?? 0.0);
        });
      }
    }

    const data = traces.map(traceName => ({
      x: xData,
      y: traceValues[traceName],
      name: traceName,
      type: 'scatter',
      mode: 'lines',
      line: {
        color: getStableTraceColor(traceName),
        width: 1.8
      },
      hoverinfo: 'x+y+name'
    }));

    // Theme coloring
    const gridColor = isLight ? '#e2e8f0' : '#1e293b';
    const textColor = isLight ? '#475569' : '#94a3b8';

    const layout = {
      margin: { t: 5, r: 15, b: 20, l: 45 },
      height: 95,
      autosize: true,
      paper_bgcolor: 'rgba(0,0,0,0)',
      plot_bgcolor: 'rgba(0,0,0,0)',
      showlegend: false,
      xaxis: {
        range: [vStart, vEnd],
        gridcolor: gridColor,
        zeroline: false,
        tickfont: { size: 8, color: textColor },
        showline: true,
        linecolor: gridColor
      },
      yaxis: {
        gridcolor: gridColor,
        zeroline: false,
        tickfont: { size: 8, color: textColor },
        showline: true,
        linecolor: gridColor
      },
      shapes: [
        // Playhead indicator vertical line
        {
          type: 'line',
          xref: 'x',
          yref: 'paper',
          x0: playTime,
          y0: 0,
          x1: playTime,
          y1: 1,
          line: {
            color: '#f43f5e',
            width: 1.5
          }
        }
      ]
    };

    const config = {
      displayModeBar: false,
      responsive: true
    };

    w.Plotly.react(containerRef.current, data, layout as any, config);

    // Event listener for click interaction
    const handlePlotlyClick = (eventData: any) => {
      if (eventData && eventData.points && eventData.points.length > 0) {
        const clickedX = eventData.points[0].x;
        setIsPlaying(false);
        setPlayTime(clickedX);
      }
    };

    const node = containerRef.current;
    if (node) {
      (node as any).on('plotly_click', handlePlotlyClick);
    }

    return () => {
      if (node) {
        (node as any).removeAllListeners?.('plotly_click');
      }
    };
  }, [traces, tData, vStart, vEnd, playTime, isLight, simResults]);

  return <div ref={containerRef} className="w-full h-[95px]" />;
};

export default function SimulationPlayer({ simResults, jsonText, onRunSimulation, subplots, theme, onClose }: SimulationPlayerProps) {
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

  // Load Plotly CDN script dynamically
  const [isPlotlyLoaded, setIsPlotlyLoaded] = useState(typeof window !== 'undefined' && !!(window as any).Plotly);

  useEffect(() => {
    const w = window as any;
    if (w.Plotly) {
      setIsPlotlyLoaded(true);
      return;
    }

    const checkInterval = setInterval(() => {
      if (w.Plotly) {
        setIsPlotlyLoaded(true);
        clearInterval(checkInterval);
      }
    }, 100);

    const existingScript = document.getElementById('plotly-cdn-script') || document.querySelector('script[src*="plotly"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => {
        setIsPlotlyLoaded(true);
        clearInterval(checkInterval);
      });
    } else {
      const script = document.createElement('script');
      script.id = 'plotly-cdn-script';
      script.src = '/plotly.min.js';
      script.async = true;
      script.onload = () => {
        setIsPlotlyLoaded(true);
        clearInterval(checkInterval);
      };
      document.head.appendChild(script);
    }

    return () => clearInterval(checkInterval);
  }, []);

  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [playTime, setPlayTime] = useState(0.0);
  const [speedMultiplier, setSpeedMultiplier] = useState(0.01); // 0.01x lowest start speed
  const [showWireOverlays, setShowWireOverlays] = useState(true);
  const [showFlowInspector, setShowFlowInspector] = useState(false);
  const [showModeInspector, setShowModeInspector] = useState(false);
  const [modeInspectorTab, setModeInspectorTab] = useState<'states' | 'equations'>('states');
  const [rightPanelTab, setRightPanelTab] = useState<'waveforms' | 'equations'>('waveforms');
  
  // MNA Equations View Toggle States
  const [showMatrix, setShowMatrix] = useState(true);
  const [showRawEqs, setShowRawEqs] = useState(true);
  const [showSimpEqs, setShowSimpEqs] = useState(true);

  // Sidebar Width and Pointer Drag Resizing
  const [rightSidebarWidth, setRightSidebarWidth] = useState(420);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const isResizingRef = useRef(false);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleResizePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    isResizingRef.current = true;
    document.addEventListener('pointermove', handleResizePointerMove);
    document.addEventListener('pointerup', handleResizePointerUp);
  };

  const handleResizePointerMove = (e: PointerEvent) => {
    if (!isResizingRef.current) return;
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = rect.right - e.clientX;
      setRightSidebarWidth(Math.max(280, Math.min(rect.width - 320, newWidth)));
    }
  };

  const handleResizePointerUp = () => {
    isResizingRef.current = false;
    document.removeEventListener('pointermove', handleResizePointerMove);
    document.removeEventListener('pointerup', handleResizePointerUp);
  };

  // Theme and customization states
  const [miniplotWidthUs, setMiniplotWidthUs] = useState(100);
  const [maxMiniplotWidthUs, setMaxMiniplotWidthUs] = useState(1000);
  const [maxSpeedMultiplier, setMaxSpeedMultiplier] = useState(0.2);
  const [showNumericalValues, setShowNumericalValues] = useState(false);
  const [isMathMode, setIsMathMode] = useState(false);
  const [activeMathPopovers, setActiveMathPopovers] = useState<string[]>([]);
  const [mathPopoverOffsets, setMathPopoverOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const [isSchematicFullScreen, setIsSchematicFullScreen] = useState(false);
  const [openPlotSettingsId, setOpenPlotSettingsId] = useState<string | null>(null);

  // Synced Zoom and Scroll Pan States
  const [timeZoom, setTimeZoom] = useState(1.0);
  const [previewPlotId, setPreviewPlotId] = useState<string | null>(null);
  const draggedTraceRef = useRef<{ name: string; label: string } | null>(null);

  const getLocalPrefixedCompId = (compId: string): string => {
    const currentPrefix = [
      ...(state.navigationStack || []).map((layer: any) => layer.subsystemId),
      state.currentSubsystemId
    ].filter(Boolean).join('.');
    return currentPrefix && !compId.startsWith(currentPrefix + '.') 
      ? `${currentPrefix}.${compId}` 
      : compId;
  };

  const getLocalGateSignalName = (compId: string, wires: any[], compType?: string): string => {
    if (compType === 'vg-FET') {
      return `${compId}.G`;
    }
    if (!wires) return "0.0";
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
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && !document.getElementById('mathjax-script')) {
      const script = document.createElement('script');
      script.id = 'mathjax-script';
      script.src = 'https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-svg.js';
      script.async = true;
      document.head.appendChild(script);
    }
  }, []);





  const addSubplotTraces = (subplotId: string, tracesToAdd: string[]) => {
    setLocalSubplots(prev => prev.map(sp => {
      if (sp.id === subplotId) {
        const newTraces = [...sp.traces];
        tracesToAdd.forEach(t => {
          if (!newTraces.includes(t)) {
            newTraces.push(t);
          }
        });
        return {
          ...sp,
          traces: newTraces
        };
      }
      return sp;
    }));
  };



  const isLight = theme === 'light';

  const exportPlotSVG = (subplot: { id: string; title: string; traces: string[] }) => {
    const svgEl = document.getElementById(`plot-svg-${subplot.id}`);
    if (!svgEl) {
      alert("Plot graphic not found!");
      return;
    }
    try {
      const serializer = new XMLSerializer();
      let svgStr = serializer.serializeToString(svgEl);
      
      // Ensure correct XML namespace
      if (!svgStr.includes('xmlns=')) {
        svgStr = svgStr.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      }
      
      // Embed self-contained styling based on the current mode
      const bgStyle = `
        <style>
          svg {
            background-color: ${isLight ? '#ffffff' : '#050711'};
          }
          text {
            fill: ${isLight ? '#475569' : '#94a3b8'};
          }
          line {
            stroke: ${isLight ? '#cbd5e1' : '#1e293b'};
          }
          path {
            opacity: 0.95;
          }
        </style>
      `;
      
      // Insert style tag directly after the opening <svg> tag to prevent breaking any namespaces or defs attributes
      const insertIndex = svgStr.indexOf('>') + 1;
      svgStr = svgStr.slice(0, insertIndex) + bgStyle + svgStr.slice(insertIndex);

      const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(subplot.title || 'plot').toLowerCase().replace(/\s+/g, '_')}.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Failed to export plot SVG", err);
      alert(`Failed to export plot SVG: ${err.message || err}`);
    }
  };

  const exportPlotCSV = (subplot: { id: string; title: string; traces: string[] }) => {
    if (!tData || tData.length === 0) {
      alert("No simulation data available to export!");
      return;
    }
    try {
      const headers = ['Time', ...subplot.traces];
      const rows = [];
      
      // Cache trace arrays upfront to avoid doing nested O(Time * Wires) graph traversals in loop
      const traceArrays = subplot.traces.map(trace => ({
        trace,
        arr: getFullTraceArray(trace)
      }));
      
      for (let i = 0; i < tData.length; i++) {
        const row = [tData[i].toString()];
        traceArrays.forEach(({ arr }) => {
          row.push(arr[i] !== undefined ? arr[i].toString() : '');
        });
        rows.push(row.join(','));
      }
      
      const csvContent = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(subplot.title || 'plot').toLowerCase().replace(/\s+/g, '_')}_data.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Failed to export plot CSV", err);
      alert(`Failed to export plot CSV: ${err.message || err}`);
    }
  };

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
    }
    setIsPlaying(!isPlaying);
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
      ['R', 'L', 'C', 'S', 'D', 'MOSFET', 'vg-FET', 'V', 'I', 'AC_V', 'XFMR', 'VM', 'AM'].includes(c.type)
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

    const electricalWires = state.wires.filter((w: any) => getWireDomain(w) === 'electrical');

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
      const isControlComp = getPinDomain(comp.type, "", comp) === 'control';
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
    const isControlWire = getWireDomain(wire) === 'control';

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
    if (e.button !== 0) return; // Only drag scopes with left-click
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

  const getComponentVoltageAtIndex = (compId: string, idx: number): number => {
    if (!simResults) return 0.0;
    const currentPrefix = [...state.navigationStack.map((layer: any) => layer.subsystemId), state.currentSubsystemId].filter(Boolean).join('.');
    const prefixCompId = currentPrefix && !compId.startsWith(currentPrefix + '.') ? `${currentPrefix}.${compId}` : compId;
    const kv = `V_${prefixCompId}`;
    if (simResults.custom_plots && simResults.custom_plots[kv]) {
      return simResults.custom_plots[kv][idx] ?? 0.0;
    }
    const kvOrig = `V_${compId}`;
    if (simResults.custom_plots && simResults.custom_plots[kvOrig]) {
      return simResults.custom_plots[kvOrig][idx] ?? 0.0;
    }
    return 0.0;
  };

  // Helper code to retrieve dynamic sampled waveform points
  const getScopeWaveformYVal = (scopeId: string, scope: any, targetIdx: number): number => {
    if (scope.type === 'component-voltage') {
      const compId = scope.componentId || scopeId;
      const currentPrefix = [...state.navigationStack.map((layer: any) => layer.subsystemId), state.currentSubsystemId].filter(Boolean).join('.');
      const prefixCompId = currentPrefix && !compId.startsWith(currentPrefix + '.') ? `${currentPrefix}.${compId}` : compId;
      const kv = `V_${prefixCompId}`;
      const kvOrig = `V_${compId}`;
      const hasDirectLog = simResults && simResults.custom_plots && (simResults.custom_plots[kv] || simResults.custom_plots[kvOrig]);
      
      if (hasDirectLog) {
        return getComponentVoltageAtIndex(compId, targetIdx);
      }
      
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
      if (comp.type?.toLowerCase() === 'mosfet' || comp.type === 'vg-FET') {
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
        const gateSig = getGateSignalName(comp.id, state.wires, comp.type);
        
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
      if (comp.type === 'MOSFET' || comp.type === 'vg-FET') {
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
      ['R', 'L', 'C', 'S', 'D', 'MOSFET', 'vg-FET', 'V', 'I', 'AC_V', 'XFMR', 'VM', 'AM'].includes(c.type)
    );

    physicalComponents.forEach((comp: any) => {
      const pinLabels = getComponentPins(comp);
      Object.keys(pinLabels).forEach(term => {
        uf.find(`${comp.id}.${term}`);
      });
    });

    const electricalWires = state.wires.filter((w: any) => getWireDomain(w) === 'electrical');

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
      if (comp.type === 'MOSFET' || comp.type === 'vg-FET') {
        const u = pinToNode[`${comp.id}.D`] || uf.find(`${comp.id}.D`);
        const v = pinToNode[`${comp.id}.S`] || uf.find(`${comp.id}.S`);
        return { u, v };
      }
      const electTerms = pinLabels.filter(term => getPinDomain(comp.type, term, comp) !== 'control');
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

  const visibleDuration = totalSimDuration / timeZoom;
  let vStart: number;
  let vEnd: number;
  if (timeZoom > 1.0) {
    vStart = playTime - visibleDuration / 2;
    vEnd = playTime + visibleDuration / 2;
  } else {
    vStart = tMin;
    vEnd = tMax;
  }

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

  const getSwitchOnAt = (compId: string, compType: string, stepIdx: number) => {
    if (!simResults) return false;
    const prefId = getLocalPrefixedCompId(compId);
    
    // 1. Check control channels
    const compObj = state.components.find(c => c.id === compId);
    const channelName = compObj?.channels?.G || compObj?.channels?.Ctrl || compObj?.channels?.Switch;
    if (channelName) {
      const prefChannel = getLocalPrefixedCompId(channelName);
      if (simResults.signals?.[prefChannel] !== undefined) {
        return (simResults.signals[prefChannel][stepIdx] ?? 0.0) > 0.5;
      }
      if (simResults.signals?.[channelName] !== undefined) {
        return (simResults.signals[channelName][stepIdx] ?? 0.0) > 0.5;
      }
    }

    // 2. Check solver custom plots
    const ctrlPlot = simResults.custom_plots?.[`Ctrl_${prefId}`] || simResults.custom_plots?.[`Ctrl_${compId}`];
    if (ctrlPlot) {
      return (ctrlPlot[stepIdx] ?? 0.0) > 0.5;
    }

    // 3. Check wired gate signal
    const gateSig = getLocalGateSignalName(compId, state.wires, compType);
    if (gateSig && gateSig !== "0.0") {
      const prefGateSig = getLocalPrefixedCompId(gateSig);
      if (simResults.signals?.[prefGateSig] !== undefined) {
        return (simResults.signals[prefGateSig][stepIdx] ?? 0.0) > 0.5;
      }
      if (simResults.signals?.[gateSig] !== undefined) {
        return (simResults.signals[gateSig][stepIdx] ?? 0.0) > 0.5;
      }
    }

    // 4. Fallback to current
    const iVal = (simResults.custom_plots?.[`I_${prefId}`]?.[stepIdx] || simResults.custom_plots?.[`I_${compId}`]?.[stepIdx]) ?? 0.0;
    return Math.abs(iVal) > 1e-3;
  };

  const detectedModes = useMemo(() => {
    if (!simResults || tData.length === 0) return [];
    
    const physicalSwitches = state.components.filter((c: any) =>
      ['MOSFET', 'vg-FET', 'Switch', 'S', 'D', 'Diode'].includes(c.type)
    );
    if (physicalSwitches.length === 0) return [];

    const uniqueStatesMap = new Map<string, Record<string, boolean>>();
    const stepSize = Math.max(1, Math.floor(tData.length / 500));
    
    for (let stepIdx = 0; stepIdx < tData.length; stepIdx += stepSize) {
      const stateRecord: Record<string, boolean> = {};
      physicalSwitches.forEach(sw => {
        stateRecord[sw.id] = getSwitchOnAt(sw.id, sw.type, stepIdx);
      });
      const key = physicalSwitches.map(sw => `${sw.id}:${stateRecord[sw.id] ? 'ON' : 'OFF'}`).join('|');
      if (!uniqueStatesMap.has(key)) {
        uniqueStatesMap.set(key, stateRecord);
      }
    }

    const currentRecord: Record<string, boolean> = {};
    physicalSwitches.forEach(sw => {
      currentRecord[sw.id] = getSwitchOnAt(sw.id, sw.type, currentStepIndex);
    });
    const currentKey = physicalSwitches.map(sw => `${sw.id}:${currentRecord[sw.id] ? 'ON' : 'OFF'}`).join('|');
    if (!uniqueStatesMap.has(currentKey)) {
      uniqueStatesMap.set(currentKey, currentRecord);
    }

    const sortedEntries = Array.from(uniqueStatesMap.entries()).sort();

    return sortedEntries.map(([key, stateRecord], idx) => {
      const labelList = Object.entries(stateRecord).map(([swId, isOn]) => `${swId}: ${isOn ? 'ON' : 'OFF'}`);
      return {
        id: `mode_${idx + 1}`,
        key,
        stateRecord,
        name: `Mode ${idx + 1}`,
        description: labelList.join(' | ')
      };
    });
  }, [simResults, tData, currentStepIndex]);

  const currentMode = useMemo(() => {
    if (detectedModes.length === 0) return null;
    
    const physicalSwitches = state.components.filter((c: any) =>
      ['MOSFET', 'vg-FET', 'Switch', 'S', 'D', 'Diode'].includes(c.type)
    );
    
    const currentRecord: Record<string, boolean> = {};
    physicalSwitches.forEach(sw => {
      currentRecord[sw.id] = getSwitchOnAt(sw.id, sw.type, currentStepIndex);
    });
    
    const currentKey = physicalSwitches.map(sw => `${sw.id}:${currentRecord[sw.id] ? 'ON' : 'OFF'}`).join('|');
    return detectedModes.find(m => m.key === currentKey) || null;
  }, [detectedModes, currentStepIndex]);

  const modeMnaResults = useMemo(() => {
    if (detectedModes.length === 0) return {};

    let data: any = {};
    try {
      data = exportDualGraphJSON(true) || {};
    } catch (e) {
      return {};
    }

    const stage = data.physical_stage || {};
    const isIdealMode = true;

    const fixedComps: Component[] = [];
    const switches: Component[] = [];

    // Extract component structures directly using netlist-based nodes
    (stage.resistors || []).forEach((c: any) => {
      fixedComps.push({ type: 'R', id: c.id, n1: c.nodes?.[0] || 'node_0', n2: c.nodes?.[1] || 'node_0', sym: c.id });
    });
    (stage.capacitors || []).forEach((c: any) => {
      fixedComps.push({ type: 'C', id: c.id, n1: c.nodes?.[0] || 'node_0', n2: c.nodes?.[1] || 'node_0', sym: c.id, esr: c.parameters?.esr });
    });
    (stage.inductors || []).forEach((c: any) => {
      fixedComps.push({ type: 'L', id: c.id, n1: c.nodes?.[0] || 'node_0', n2: c.nodes?.[1] || 'node_0', sym: c.id, esr: c.parameters?.esr });
    });
    (stage.v_sources || []).forEach((c: any) => {
      fixedComps.push({ type: 'V', id: c.id, n1: c.nodes?.[0] || 'node_0', n2: c.nodes?.[1] || 'node_0', sym: c.id });
    });
    (stage.i_sources || []).forEach((c: any) => {
      fixedComps.push({ type: 'I', id: c.id, n1: c.nodes?.[0] || 'node_0', n2: c.nodes?.[1] || 'node_0', sym: c.id });
    });
    (stage.transformers || []).forEach((c: any) => {
      const pWind = c.primary_windings?.[0] || c.primaryWindings?.[0];
      const sWind = c.secondary_windings?.[0] || c.secondaryWindings?.[0];
      if (pWind && sWind) {
        fixedComps.push({
          type: 'X', id: c.id, n1: "", n2: "",
          p1: pWind.nodes?.[0] || 'node_0',
          p2: pWind.nodes?.[1] || 'node_0',
          s1: sWind.nodes?.[0] || 'node_0',
          s2: sWind.nodes?.[1] || 'node_0'
        });
      }
    });
    (stage.diodes || []).forEach((c: any) => {
      switches.push({ type: 'SW', id: c.id, n1: c.nodes?.[0] || 'node_0', n2: c.nodes?.[1] || 'node_0' });
    });
    (stage.analog_switches || []).forEach((c: any) => {
      switches.push({ type: 'SW', id: c.id, n1: c.nodes?.[0] || 'node_0', n2: c.nodes?.[1] || 'node_0' });
    });

    const results: Record<string, any> = {};
    detectedModes.forEach(mode => {
      const activeSwitches = switches.filter(sw => mode.stateRecord[sw.id] === true);
      try {
        const mna = buildMNALatex(fixedComps, activeSwitches, switches, 'node_0', isIdealMode);
        results[mode.key] = mna;
      } catch (err) {
        // Fallback
      }
    });

    return results;
  }, [jsonText, detectedModes]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const w = window as any;
      if (w.MathJax && w.MathJax.typesetPromise) {
        setTimeout(() => {
          w.MathJax.typesetPromise().catch((e: any) => console.log(e));
        }, 150);
      }
    }
  }, [rightPanelTab, modeMnaResults]);

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
    
    const currentPrefix = [...state.navigationStack.map((layer: any) => layer.subsystemId), state.currentSubsystemId].filter(Boolean).join('.');
    const prefixCompId = currentPrefix && !compId.startsWith(currentPrefix + '.') ? `${currentPrefix}.${compId}` : compId;
    
    const ki = `I_${prefixCompId}`;
    if (simResults.custom_plots && simResults.custom_plots[ki]) {
      return simResults.custom_plots[ki][idx] ?? 0.0;
    }
    if (simResults.inductors && simResults.inductors[prefixCompId]) {
      return simResults.inductors[prefixCompId][idx] ?? 0.0;
    }
    if (simResults.ammeters && simResults.ammeters[prefixCompId]) {
      return simResults.ammeters[prefixCompId][idx] ?? 0.0;
    }
    
    // Fallback: original compId
    const kiOrig = `I_${compId}`;
    if (simResults.custom_plots && simResults.custom_plots[kiOrig]) {
      return simResults.custom_plots[kiOrig][idx] ?? 0.0;
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
    // Left-click (0), Middle-click (1), or Right-click (2) can trigger panning
    if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
    
    // If the click is on active scopes or components or wires or close/interactive elements, skip panning for left clicks
    // But for right-click (2) or middle-click (1), we ALWAYS pan
    if (e.button === 0) {
      const target = e.target as SVGElement | null;
      if (target) {
        const closestElement = target.closest('.cursor-pointer, .cursor-grab, .cursor-grabbing, .gate-pulse-visualizer');
        if (closestElement && e.currentTarget.contains(closestElement) && closestElement !== e.currentTarget) {
          // Log clicking interactive element, permit local component/wire event handlers
          lastPointerDownRef.current = { x: e.clientX, y: e.clientY };
          return;
        }
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

      // Detect if pointer is over the sidebar plots panel for drag-and-drop preview
      const sidebar = document.getElementById('sidebar-plots-panel');
      let isOverSidebar = false;
      if (sidebar) {
        const rect = sidebar.getBoundingClientRect();
        isOverSidebar = (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        );
      }

      if (isOverSidebar) {
        const currentScope = activeScopes[scopeId];
        if (currentScope && !previewPlotId) {
          const name = currentScope.traceName;
          const label = currentScope.label || scopeId;
          const alreadyExists = localSubplots.some(sp => sp.traces.includes(name));
          if (!alreadyExists) {
            const newId = `plot_preview_${Date.now()}`;
            setPreviewPlotId(newId);
            setLocalSubplots(prev => [
              ...prev,
              { id: newId, title: label, traces: [name] }
            ]);
          }
        }
      } else {
        if (previewPlotId) {
          setLocalSubplots(prev => prev.filter(sp => sp.id !== previewPlotId));
          setPreviewPlotId(null);
        }
      }

      return; // prevent canvas panning when dragging a scope
    }

    if (!isPanning) return;
    setPanX(e.clientX - panStart.x);
    setPanY(e.clientY - panStart.y);
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (draggedScopeIdRef.current) {
      const scopeId = draggedScopeIdRef.current;
      draggedScopeIdRef.current = null;

      // Detect if dropped over the sidebar plots panel
      const sidebar = document.getElementById('sidebar-plots-panel');
      let isOverSidebar = false;
      if (sidebar) {
        const rect = sidebar.getBoundingClientRect();
        isOverSidebar = (
          e.clientX >= rect.left &&
          e.clientX <= rect.right &&
          e.clientY >= rect.top &&
          e.clientY <= rect.bottom
        );
      }

      if (isOverSidebar && previewPlotId) {
        // Drop success: convert preview plot to a permanent plot lane
        const finalId = `sp_${Math.floor(Date.now() + Math.random() * 1000)}`;
        setLocalSubplots(prev => prev.map(sp => sp.id === previewPlotId ? { ...sp, id: finalId } : sp));
        
        // Remove the mini scope popup from the canvas
        setActiveScopes(prev => {
          const next = { ...prev };
          delete next[scopeId];
          return next;
        });
      } else {
        // Cancel: remove the preview plot lane if one was created
        if (previewPlotId) {
          setLocalSubplots(prev => prev.filter(sp => sp.id !== previewPlotId));
        }
      }
      setPreviewPlotId(null);
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
    const pinLabels = Object.keys(getComponentPins(comp)).filter(t => getPinDomain(comp.type, t, comp) !== 'control');
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

  const prefixTraceWithSubsystem = (trace: string): string => {
    if (!trace || !trace.includes('.')) return trace;
    const currentPrefix = [...state.navigationStack.map((layer: any) => layer.subsystemId), state.currentSubsystemId].filter(Boolean).join('.');
    if (!currentPrefix) return trace;
    
    if (trace.startsWith(currentPrefix + '.')) return trace;
    return `${currentPrefix}.${trace}`;
  };

  const getTraceDataAtTime = (traceName: string, targetIdx: number): number => {
    if (!simResults) return 0;
    const resolved = resolveInputPinToSource(traceName);
    const prefixed = prefixTraceWithSubsystem(resolved);
    
    if (simResults.custom_plots && simResults.custom_plots[prefixed]) return simResults.custom_plots[prefixed][targetIdx] ?? 0;
    if (simResults.signals && simResults.signals[prefixed]) return simResults.signals[prefixed][targetIdx] ?? 0;
    if (simResults.voltages && simResults.voltages[prefixed]) return simResults.voltages[prefixed][targetIdx] ?? 0;
    if (simResults.voltmeters && simResults.voltmeters[prefixed]) return simResults.voltmeters[prefixed][targetIdx] ?? 0;
    if (simResults.inductors && simResults.inductors[prefixed]) return simResults.inductors[prefixed][targetIdx] ?? 0;
    if (simResults.ammeters && simResults.ammeters[prefixed]) return simResults.ammeters[prefixed][targetIdx] ?? 0;

    // Fallback:
    if (simResults.custom_plots && simResults.custom_plots[resolved]) return simResults.custom_plots[resolved][targetIdx] ?? 0;
    if (simResults.signals && simResults.signals[resolved]) return simResults.signals[resolved][targetIdx] ?? 0;
    
    const nodeMatch = resolved;
    if (simResults.voltages && simResults.voltages[nodeMatch]) return simResults.voltages[nodeMatch][targetIdx] ?? 0;
    if (simResults.voltmeters && simResults.voltmeters[nodeMatch]) return simResults.voltmeters[nodeMatch][targetIdx] ?? 0;
    
    if (simResults.inductors && simResults.inductors[nodeMatch]) return simResults.inductors[nodeMatch][targetIdx] ?? 0;
    if (simResults.ammeters && simResults.ammeters[nodeMatch]) return simResults.ammeters[nodeMatch][targetIdx] ?? 0;
    
    return 0;
  };

  const getFullTraceArray = (traceName: string): number[] => {
    if (!simResults) return [];
    const resolved = resolveInputPinToSource(traceName);
    const prefixed = prefixTraceWithSubsystem(resolved);
    
    if (simResults.custom_plots && simResults.custom_plots[prefixed]) return simResults.custom_plots[prefixed];
    if (simResults.signals && simResults.signals[prefixed]) return simResults.signals[prefixed];
    if (simResults.voltages && simResults.voltages[prefixed]) return simResults.voltages[prefixed];
    if (simResults.voltmeters && simResults.voltmeters[prefixed]) return simResults.voltmeters[prefixed];
    if (simResults.inductors && simResults.inductors[prefixed]) return simResults.inductors[prefixed];
    if (simResults.ammeters && simResults.ammeters[prefixed]) return simResults.ammeters[prefixed];

    // Fallback:
    if (simResults.custom_plots && simResults.custom_plots[resolved]) return simResults.custom_plots[resolved];
    if (simResults.signals && simResults.signals[resolved]) return simResults.signals[resolved];
    if (simResults.voltages && simResults.voltages[resolved]) return simResults.voltages[resolved];
    if (simResults.voltmeters && simResults.voltmeters[resolved]) return simResults.voltmeters[resolved];
    if (simResults.inductors && simResults.inductors[resolved]) return simResults.inductors[resolved];
    if (simResults.ammeters && simResults.ammeters[resolved]) return simResults.ammeters[resolved];
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
      for (let i = 0; i < arr.length; i++) {
        const t = tData[i];
        if (t >= vStart && t <= vEnd) {
          const val = arr[i];
          if (val < yMin) yMin = val;
          if (val > yMax) yMax = val;
        }
      }
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
    const getX = (t: number) => paddingLeft + ((t - vStart) / (vEnd - vStart || 1)) * (width - paddingLeft - paddingRight);
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
      const targetT = vStart + ((vEnd - vStart) * fraction);
      setIsPlaying(false);
      setPlayTime(targetT);
    };

    const allTraces = Array.from(new Set(
      Object.keys(simResults?.custom_plots || {})
        .concat(Object.keys(simResults?.signals || {}))
    )).sort();

    const isSettingsOpen = openPlotSettingsId === subplot.id;

    return (
      <div 
        key={subplot.id} 
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const traceName = e.dataTransfer.getData("traceName");
          if (traceName) {
            addSubplotTraces(subplot.id, [traceName]);
            if (previewPlotId) {
              setLocalSubplots(prev => prev.filter(sp => sp.id !== previewPlotId));
              setPreviewPlotId(null);
            }
          }
        }}
        className={`relative border rounded-xl p-1.5 flex flex-col shadow-sm select-none transition-all ${isLight ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-900'}`}
      >
        
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
            onClick={() => exportPlotSVG(subplot)}
            className={`p-0.5 rounded transition-all cursor-pointer ${isLight ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'}`}
            title="Save Plot as SVG"
          >
            <FileCode className="h-3 w-3 text-sky-400" />
          </button>
          <button 
            onClick={() => exportPlotCSV(subplot)}
            className={`p-0.5 rounded transition-all cursor-pointer ${isLight ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'}`}
            title="Save Plot Data as CSV"
          >
            <Download className="h-3 w-3 text-emerald-450" />
          </button>
          <button 
            onClick={() => setOpenPlotSettingsId(isSettingsOpen ? null : subplot.id)}
            className={`p-0.5 rounded transition-all cursor-pointer ${isSettingsOpen ? 'bg-sky-50/20 text-sky-550' : (isLight ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900')}`}
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

        {/* Plot SVG Frame / Plotly Chart */}
        <div className="mt-5 relative w-full h-auto">
          {activeTraces.length === 0 ? (
            <div className={`h-[58px] border border-dashed flex flex-col items-center justify-center text-center text-[9px] rounded-lg ${isLight ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-slate-900 bg-slate-950/40 text-slate-600'}`}>
              <EyeOff className="h-3.5 w-3.5 mb-0.5" />
              <p className="font-bold">No active traces</p>
            </div>
          ) : isPlotlyLoaded ? (
            <PlotlyChartComponent
              subplotId={subplot.id}
              traces={activeTraces}
              getFullTraceArray={getFullTraceArray}
              getStableTraceColor={getStableTraceColor}
              tData={tData}
              vStart={vStart}
              vEnd={vEnd}
              playTime={playTime}
              totalSimDuration={totalSimDuration}
              isLight={isLight}
              setPlayTime={setPlayTime}
              setIsPlaying={setIsPlaying}
              simResults={simResults}
            />
          ) : (
            <svg 
              id={`plot-svg-${subplot.id}`}
              viewBox={`0 0 ${width} ${height}`} 
              className="w-full h-auto cursor-col-resize select-none"
              onClick={handlePlotInteraction}
              onMouseMove={(e) => {
                if (e.buttons === 1) handlePlotInteraction(e);
              }}
            >
              <defs>
                <clipPath id={`plot-clip-${subplot.id}`}>
                  <rect x={paddingLeft} y={paddingTop} width={width - paddingLeft - paddingRight} height={height - paddingTop - paddingBottom} />
                </clipPath>
              </defs>

              {/* Grid Lines */}
              {[0, 0.25, 0.5, 0.75, 1.0].map((step) => {
                const clockT = vStart + step * (vEnd - vStart);
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

              <g clipPath={`url(#plot-clip-${subplot.id})`}>
                {/* Plot Waveforms */}
                {activeTraces.map((trace) => {
                  const arr = getFullTraceArray(trace);
                  let pathStr = "";
                  const visibleCount = Math.max(10, Math.floor(tData.length / timeZoom));
                  const stepRate = Math.max(1, Math.floor(visibleCount / 500));
                  
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
                {playTime >= vStart && playTime <= vEnd && (
                  <>
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
                  </>
                )}
              </g>
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
      {/* Unified Window Header */}
      <div className={`border rounded-xl px-4 py-1.5 flex flex-col md:flex-row items-center justify-between gap-3 shadow-md select-none ${isLight ? 'bg-white border-slate-200' : 'bg-slate-950/60 border-slate-900'}`}>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <h2 className={`text-xs font-bold tracking-wider uppercase font-sans ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
            Visual Flow
          </h2>
        </div>

        <div className="flex items-center gap-3 flex-wrap md:flex-nowrap ml-auto">
          {/* Mini-Scope Slider */}
          <div className={`h-8 px-2.5 rounded-lg flex items-center gap-2 text-xs border ${isLight ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-950 border-slate-900 text-slate-350'}`}>
            <span className="font-bold text-[8.5px] uppercase font-sans tracking-tight text-slate-550 shrink-0">Mini-Scope:</span>
            <input 
              type="range"
              min="10"
              max={maxMiniplotWidthUs}
              step={Math.max(10, Math.floor(maxMiniplotWidthUs / 100))}
              value={miniplotWidthUs}
              onChange={(e) => setMiniplotWidthUs(Math.max(10, parseInt(e.target.value) || 100))}
              className="w-16 accent-sky-500 h-1 cursor-pointer bg-slate-900 rounded-full shrink-0"
            />
            <input 
              type="number"
              min="10"
              max={maxMiniplotWidthUs}
              step="10"
              value={miniplotWidthUs}
              onChange={(e) => setMiniplotWidthUs(Math.max(10, parseInt(e.target.value) || 100))}
              className={`w-12 h-5.5 text-center font-mono font-bold rounded border text-[9.5px] focus:outline-none ${isLight ? 'bg-white border-slate-200 text-slate-800 focus:border-slate-350' : 'bg-slate-900 border-slate-850 text-slate-100 focus:border-slate-700'} shrink-0`}
            />
            <span className="font-bold shrink-0 text-[10px]">µs</span>
            <div className="flex items-center gap-1 shrink-0 border-l pl-2 border-slate-200/20">
              <span className="text-[7.5px] text-slate-500 font-bold uppercase">Max:</span>
              <input 
                type="number"
                min="20"
                max="20000"
                step="50"
                value={maxMiniplotWidthUs}
                onChange={(e) => setMaxMiniplotWidthUs(Math.max(20, parseInt(e.target.value) || 1000))}
                className={`w-12 h-5 text-center font-mono text-[9px] font-bold rounded border focus:outline-none ${isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-850 text-slate-100'} shrink-0`}
              />
            </div>
          </div>

          {/* Digital Time Indicator Block */}
          <div className={`h-8 px-3 rounded-lg flex items-center gap-1.5 font-mono text-xs border ${isLight ? 'bg-slate-50 border-slate-200 text-sky-750' : 'bg-slate-950 border-slate-900 text-sky-450'}`}>
            <span className="text-slate-500 font-bold text-[8.5px] uppercase font-sans tracking-tight">Time:</span>
            <span className={`font-bold min-w-[55px] text-right ${isLight ? 'text-slate-850' : 'text-slate-100'}`}>
              {(playTime * 1000).toFixed(3)}
            </span>
            <span className={isLight ? 'text-sky-700 font-bold text-[10px]' : 'text-sky-500 font-bold text-[10px]'}>ms</span>
            <span className={isLight ? 'text-slate-300' : 'text-slate-800'}>/</span>
            <span className="text-slate-500 text-[10px]">{(tMax * 1000).toFixed(1)} ms</span>
          </div>

          {/* Close Window button */}
          {onClose && (
            <button
              onClick={onClose}
              className={`h-8 px-2.5 border rounded-lg text-[9.5px] font-bold transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 ${isLight ? 'border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-850 bg-white' : 'border-slate-850 hover:border-slate-800 hover:bg-slate-900/65 text-slate-400 hover:text-slate-100 bg-slate-950'}`}
              title="Close Visual Flow Window"
            >
              <X className="h-3.5 w-3.5" />
              <span>Close</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Sandbox Layout Area: Controls sidebar, Schematic overlay, and custom subplot lanes */}
      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0 w-full overflow-hidden">
        {/* Left Column: Interactive Legends & Visibility Toggles */}
        {!isSchematicFullScreen && (showFlowInspector || showModeInspector) && (
          <div className={`w-full lg:w-72 shrink-0 border p-4 rounded-2xl flex flex-col gap-4 shadow-xl select-none ${isLight ? 'bg-white border-slate-200' : 'bg-slate-950/85 border-slate-900'} max-h-[calc(100vh-175px)] overflow-y-auto`}>
            {showFlowInspector && (
              <div className="flex flex-col gap-4">
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
                <div className="flex flex-col gap-3.5 overflow-y-auto max-h-[350px] pr-1">
                  {/* Loop currents */}
                  <div className="flex flex-col gap-1.5">
                    <span className={`text-[9px] font-extrabold uppercase tracking-widest flex items-center gap-1 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${isLight ? 'bg-emerald-500' : 'bg-emerald-400'}`} />
                      Active Loop Currents
                    </span>

                    {loops.length === 0 ? (
                      <p className="text-[10px] text-slate-650 italic py-1 pl-2">No active currents detected</p>
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
                                    onChange={() => {}}
                                    className="h-3 w-3 rounded cursor-pointer text-sky-500"
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
                              <div className={`text-[8.5px] font-mono pl-5 pt-0.5 truncate max-w-full ${isLight ? 'text-slate-455' : 'text-slate-500'}`}>
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
                                <span className={`text-[10.5px] font-mono font-medium ${isLight ? 'text-slate-655' : 'text-slate-400'}`}>
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

            {showModeInspector && (
              <div className="flex flex-col gap-4">
                <div>
                  <div className="flex items-center gap-1.5 text-slate-200">
                    <Activity className={`h-4 w-4 ${isLight ? 'text-cyan-600' : 'text-cyan-400'}`} />
                    <h3 className={`text-xs font-bold uppercase tracking-wider ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>Mode Inspector</h3>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                    Identifies semiconductor state combinations occurring in the current simulation timeline.
                  </p>
                </div>

                <div className="flex flex-col gap-4">
                    {/* CURRENT ACTIVE MODE CARD */}
                    <div className={`p-3 rounded-xl border flex flex-col gap-2 ${
                      isLight 
                        ? 'bg-cyan-50/60 border-cyan-100 shadow-sm' 
                        : 'bg-cyan-950/15 border-cyan-950/40'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-extrabold uppercase tracking-wider text-cyan-500">Current Mode</span>
                        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                      </div>
                      {currentMode ? (
                        <div className="flex flex-col gap-1.5">
                          <h4 className={`text-xs font-extrabold ${isLight ? 'text-slate-850' : 'text-slate-200'}`}>
                            {currentMode.name}
                          </h4>
                          <div className="flex flex-col gap-1">
                            {Object.entries(currentMode.stateRecord).map(([swId, isOn]) => (
                              <div key={swId} className="flex items-center justify-between text-[10px]">
                                <span className="font-mono text-slate-550">{swId}</span>
                                <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-[8.5px] uppercase ${
                                  isOn 
                                    ? (isLight ? 'bg-emerald-100 text-emerald-800' : 'bg-emerald-500/15 text-emerald-300')
                                    : (isLight ? 'bg-rose-100 text-rose-800' : 'bg-rose-500/15 text-rose-300')
                                }`}>
                                  {isOn ? 'ON' : 'OFF'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-555 italic">No active semiconductors detected</span>
                      )}
                    </div>

                    {/* DETECTED MODES LIST */}
                    <div className="flex flex-col gap-2">
                      <span className={`text-[9px] font-extrabold uppercase tracking-widest flex items-center gap-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        Available Modes ({detectedModes.length})
                      </span>
                      
                      {detectedModes.length === 0 ? (
                        <p className="text-[10px] text-slate-550 italic py-1 pl-2">No active semiconductor combinations found</p>
                      ) : (
                        <div className="flex flex-col gap-2 overflow-y-auto max-h-[300px] pr-1">
                          {detectedModes.map((mode) => {
                            const isSelected = currentMode?.key === mode.key;
                            return (
                              <div
                                key={mode.id}
                                className={`p-2.5 rounded-lg border flex flex-col gap-1.5 transition-all ${
                                  isSelected
                                    ? (isLight ? 'bg-cyan-50/20 border-cyan-200/80 shadow-sm' : 'bg-cyan-950/10 border-cyan-900/40')
                                    : 'bg-transparent border-transparent opacity-70 hover:opacity-100'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className={`text-[10px] font-bold ${isSelected ? (isLight ? 'text-cyan-700' : 'text-cyan-400') : (isLight ? 'text-slate-700' : 'text-slate-350')}`}>
                                    {mode.name}
                                  </span>
                                  {isSelected && (
                                    <span className={`text-[8px] font-bold font-mono px-1 rounded uppercase ${isLight ? 'bg-cyan-100 text-cyan-800' : 'bg-cyan-950 text-cyan-300'}`}>
                                      Active
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                  {Object.entries(mode.stateRecord).map(([swId, isOn]) => (
                                    <span 
                                      key={swId} 
                                      className={`font-mono text-[8px] px-1 py-0.5 border rounded ${
                                        isOn 
                                          ? (isLight ? 'bg-emerald-50 text-emerald-700 border-emerald-150' : 'bg-emerald-950/20 text-emerald-450 border-emerald-900/30')
                                          : (isLight ? 'bg-rose-50/50 text-rose-700 border-rose-100' : 'bg-rose-950/15 text-rose-455 border-rose-900/20')
                                      }`}
                                    >
                                      {swId}: <b>{isOn ? 'ON' : 'OFF'}</b>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
              </div>
            )}
          </div>
        )}

        {/* Center Column: Schematic Canvas Section */}
        <div className={`border rounded-2xl overflow-hidden flex flex-col relative flex-1 h-[calc(100vh-175px)] ${isLight ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-900'}`}>
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

              {/* Checkbox for Pedagogical Math Mode */}
              <label className={`flex items-center gap-1.5 text-[9.5px] font-bold cursor-pointer select-none px-2 py-1 rounded border transition-all ${isMathMode ? (isLight ? 'text-cyan-700 border-cyan-300 bg-cyan-50' : 'text-cyan-400 border-cyan-800 bg-cyan-955/20') : (isLight ? 'text-slate-600 border-slate-200 bg-white hover:bg-slate-50' : 'text-slate-400 border-slate-800 bg-slate-900/45 hover:bg-slate-900/80')}`}>
                <input 
                  type="checkbox"
                  checked={isMathMode}
                  onChange={(e) => {
                    setIsMathMode(e.target.checked);
                    if (!e.target.checked) setActiveMathPopovers([]);
                  }}
                  className="h-3 w-3 rounded accent-cyan-500 cursor-pointer"
                />
                <span>Math Mode</span>
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
              onContextMenu={(e) => e.preventDefault()}
              onDragOver={(e) => {
                e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                const scopeId = e.dataTransfer.getData("scopeId");
                if (scopeId) {
                  const svgRect = e.currentTarget.getBoundingClientRect();
                  const clientX = e.clientX - svgRect.left;
                  const clientY = e.clientY - svgRect.top;
                  
                  // Convert client coordinates to schematic coordinates
                  const schematicMouseX = (clientX - panX) / zoom;
                  const schematicMouseY = (clientY - panY) / zoom;
                  
                  const dragOffsetX = parseFloat(e.dataTransfer.getData("dragOffsetX") || "31");
                  const dragOffsetY = parseFloat(e.dataTransfer.getData("dragOffsetY") || "16");
                  
                  const W = 62;
                  const H = 32;
                  const newX = schematicMouseX + (W / 2 - dragOffsetX) / zoom;
                  const newY = schematicMouseY + (H / 2 - dragOffsetY) / zoom;
                  
                  setActiveScopes(prev => ({
                    ...prev,
                    [scopeId]: {
                      ...prev[scopeId],
                      x: newX,
                      y: newY,
                      isCustomMoved: true
                    }
                  }));
                }
              }}
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
                  const isControl = getWireDomain(wire) === 'control';
                  
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
                  const isControl = getWireDomain(wire) === 'control';
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
                  const isControl = getWireDomain(wire) === 'control';
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
                        if (isMathMode) {
                          setActiveMathPopovers(prev => {
                            if (prev.includes(comp.id)) {
                              return prev.filter(x => x !== comp.id);
                            } else {
                              return [...prev, comp.id];
                            }
                          });
                        } else {
                          toggleComponentScope(comp);
                        }
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
                    <g 
                      key={`dynamic-scope-${scopeId}`} 
                      className="select-none pointer-events-auto"
                      draggable="true"
                      onDragStart={(e) => {
                        e.dataTransfer.setData("traceName", scope.traceName);
                        e.dataTransfer.setData("label", scope.label || scopeId);
                        e.dataTransfer.setData("scopeId", scopeId);
                        
                        // Calculate click offset relative to the rect bounding box
                        const rectElement = e.currentTarget.getBoundingClientRect();
                        const dragOffsetX = e.clientX - rectElement.left;
                        const dragOffsetY = e.clientY - rectElement.top;
                        e.dataTransfer.setData("dragOffsetX", String(dragOffsetX));
                        e.dataTransfer.setData("dragOffsetY", String(dragOffsetY));
                        
                        draggedTraceRef.current = { name: scope.traceName, label: scope.label || scopeId };
                      }}
                      onDragEnd={() => {
                        if (previewPlotId) {
                          setLocalSubplots(prev => prev.filter(sp => sp.id !== previewPlotId));
                          setPreviewPlotId(null);
                        }
                        draggedTraceRef.current = null;
                      }}
                    >
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

            {isMathMode && (
              <MathVisualizer
                components={state.components}
                wires={state.wires}
                simResults={simResults}
                currentStepIndex={currentStepIndex}
                panX={panX}
                panY={panY}
                zoom={zoom}
                activeMathPopovers={activeMathPopovers}
                onClosePopover={(compId) => {
                  setActiveMathPopovers(prev => prev.filter(id => id !== compId));
                }}
                popoverOffsets={mathPopoverOffsets}
                onDragPopover={(compId, offset) => {
                  setMathPopoverOffsets(prev => ({
                    ...prev,
                    [compId]: offset
                  }));
                }}
                theme={theme}
                pinToNode={pinToNode}
                modeMnaResult={currentMode ? modeMnaResults[currentMode.key] : undefined}
              />
            )}
          </div>
        </div>
        {/* Right Column: Tab Plots Subplots List (4 cols) */}
        {!isSchematicFullScreen && (
          <div 
            className="flex flex-col lg:flex-row items-stretch shrink-0 w-full lg:w-auto"
            onDragOver={(e) => {
              e.preventDefault();
            }}
            onDragEnter={(e) => {
              e.preventDefault();
              if (draggedTraceRef.current && !previewPlotId) {
                const { name, label } = draggedTraceRef.current;
                const alreadyExists = localSubplots.some(sp => sp.traces.includes(name));
                if (!alreadyExists) {
                  const newId = `plot_preview_${Date.now()}`;
                  setPreviewPlotId(newId);
                  setLocalSubplots(prev => [
                    ...prev,
                    { id: newId, title: label, traces: [name] }
                  ]);
                }
              }
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              const rect = e.currentTarget.getBoundingClientRect();
              const isOutside = (
                e.clientX < rect.left ||
                e.clientX > rect.right ||
                e.clientY < rect.top ||
                e.clientY > rect.bottom
              );
              if (isOutside && previewPlotId) {
                setLocalSubplots(prev => prev.filter(sp => sp.id !== previewPlotId));
                setPreviewPlotId(null);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (previewPlotId) {
                const finalId = `sp_${Math.floor(Date.now() + Math.random() * 1000)}`;
                setLocalSubplots(prev => prev.map(sp => sp.id === previewPlotId ? { ...sp, id: finalId } : sp));
              }
              setPreviewPlotId(null);
              draggedTraceRef.current = null;
            }}
          >

          {/* Draggable boundary resizing handle */}
          {!isSchematicFullScreen && (
            <div 
              onPointerDown={handleResizePointerDown}
              className={`hidden lg:flex w-2 cursor-col-resize self-stretch items-center justify-center transition-all bg-transparent hover:bg-sky-500/10 active:bg-sky-500/20 rounded group select-none relative z-10`}
            >
              <div className={`w-0.5 h-10 rounded bg-slate-300 dark:bg-slate-800 group-hover:bg-sky-505 transition-colors`} />
            </div>
          )}

          <div
            id="sidebar-plots-panel"
            style={isSchematicFullScreen ? { width: '0px', display: 'none' } : {
              width: windowWidth >= 1024 ? `${rightSidebarWidth}px` : '100%',
            }}
            className={`flex flex-col gap-3 overflow-y-auto max-h-[calc(100vh-175px)] border p-3 rounded-2xl shadow-inner ${isLight ? 'bg-slate-100/40 border-slate-200' : 'bg-slate-950/45 border-slate-900'} lg:shrink-0`}
          >
            {/* Tab selector bar */}
            <div className={`flex border-b text-[10px] font-bold shrink-0 ${isLight ? 'border-slate-200 bg-slate-100/50' : 'border-slate-900 bg-slate-950/20'} p-1 rounded-xl`}>
              <button
                onClick={() => setRightPanelTab('waveforms')}
                className={`flex-1 py-1.5 rounded-lg text-center transition-all cursor-pointer ${
                  rightPanelTab === 'waveforms'
                    ? (isLight ? 'bg-white text-slate-850 shadow-sm border border-slate-200' : 'bg-slate-900 text-slate-100 border border-slate-800')
                    : 'text-slate-500 hover:text-slate-400'
                }`}
              >
                Waveforms
              </button>
              <button
                onClick={() => setRightPanelTab('equations')}
                className={`flex-1 py-1.5 rounded-lg text-center transition-all cursor-pointer ${
                  rightPanelTab === 'equations'
                    ? (isLight ? 'bg-white text-slate-850 shadow-sm border border-slate-200' : 'bg-slate-900 text-slate-100 border border-slate-800')
                    : 'text-slate-500 hover:text-slate-400'
                }`}
              >
                MNA Equations
              </button>
            </div>

            {rightPanelTab === 'waveforms' ? (
              <div className="flex flex-col gap-3 flex-1">
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

                {/* Synced Zoom Controls */}
                <div className={`flex flex-col gap-1.5 border-b pb-2 px-1.5 ${isLight ? 'border-slate-200' : 'border-slate-900/60'}`}>
                  <div className="flex items-center justify-between text-[9px] font-bold text-slate-500">
                    <span className="uppercase tracking-tight">Time Zoom</span>
                    <span className="font-mono text-sky-500">{timeZoom.toFixed(1)}x</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input 
                      type="range"
                      min="1"
                      max="50"
                      step="0.5"
                      value={timeZoom}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setTimeZoom(val);
                      }}
                      className={`flex-1 h-1.5 rounded-full appearance-none cursor-pointer outline-none ${isLight ? 'bg-slate-200 accent-sky-500' : 'bg-slate-800 accent-sky-500'}`}
                    />
                    <button 
                      onClick={() => { setTimeZoom(1); }}
                      className={`px-1.5 py-0.5 text-[8px] font-bold rounded cursor-pointer ${isLight ? 'bg-slate-200 text-slate-600 hover:bg-slate-300' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'}`}
                    >
                      Reset
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-2 flex-1">
                  {localSubplots.map((sp, idx) => renderInteractiveSubplot(sp, idx))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 flex-1 min-h-0">
                {/* Global stylesheet overrides for equations scaling to dynamically fit column width keeping aspect ratio */}
                <style>{`
                  .mathjax-large-equations mjx-container {
                    margin: 0.35em 0 !important;
                    display: flex !important;
                    justify-content: center !important;
                    align-items: center !important;
                    width: 100% !important;
                    max-width: 100% !important;
                    overflow: hidden !important;
                  }
                  .mathjax-large-equations mjx-container[jax="SVG"] {
                    font-size: 1.45em !important;
                  }
                  .mathjax-large-equations mjx-container[jax="SVG"] svg {
                    width: auto !important;
                    max-width: 100% !important;
                    height: auto !important;
                  }
                `}</style>

                {/* Tactile Toggle Selector Bar */}
                {detectedModes.length > 0 && (
                  <div className={`p-1 border rounded-lg flex items-center justify-between gap-1 select-none shrink-0 ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/60 border-slate-900'}`}>
                    <button 
                      onClick={() => setShowMatrix(!showMatrix)}
                      className={`flex-1 py-1 rounded-md text-[9px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${showMatrix ? (isLight ? 'bg-sky-600 text-white shadow-sm' : 'bg-sky-500 text-white shadow-sm') : (isLight ? 'bg-transparent text-slate-500 hover:text-slate-700' : 'bg-transparent text-slate-400 hover:text-slate-200')}`}
                    >
                      Matrix
                    </button>
                    <button 
                      onClick={() => setShowRawEqs(!showRawEqs)}
                      className={`flex-1 py-1 rounded-md text-[9px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${showRawEqs ? (isLight ? 'bg-sky-600 text-white shadow-sm' : 'bg-sky-500 text-white shadow-sm') : (isLight ? 'bg-transparent text-slate-500 hover:text-slate-700' : 'bg-transparent text-slate-400 hover:text-slate-200')}`}
                    >
                      Raw Node
                    </button>
                    <button 
                      onClick={() => setShowSimpEqs(!showSimpEqs)}
                      className={`flex-1 py-1 rounded-md text-[9px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${showSimpEqs ? (isLight ? 'bg-emerald-600 text-white shadow-sm' : 'bg-emerald-500 text-white shadow-sm') : (isLight ? 'bg-transparent text-slate-500 hover:text-slate-700' : 'bg-transparent text-slate-400 hover:text-slate-200')}`}
                    >
                      Simplified
                    </button>
                  </div>
                )}

                <div className="flex-1 overflow-auto max-h-[calc(100vh-270px)] max-w-full select-text pr-1 flex flex-col gap-4">
                  {detectedModes.length === 0 ? (
                    <div className={`p-8 text-center rounded-xl border border-dashed ${isLight ? 'border-slate-200 text-slate-400 bg-white/50' : 'border-slate-800 text-slate-500 bg-slate-950/20'}`}>
                      <span className="text-xs font-semibold leading-relaxed">
                        * Run simulation first to resolve mode-based MNA state space equations.
                      </span>
                    </div>
                  ) : (
                    detectedModes.map((mode) => {
                      const isCurrent = currentMode?.key === mode.key;
                      const results = modeMnaResults[mode.key];
                      if (!results) return null;

                      return (
                        <div
                          key={`mna-pre-render-${mode.key}`}
                          className={isCurrent ? "flex flex-col gap-4" : "hidden"}
                        >
                          {/* Card 1: State-Space Matrix */}
                          {showMatrix && (
                            <div className={`p-4 rounded-xl border flex flex-col gap-3 shadow-sm ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
                              <h4 className={`text-[11px] font-extrabold uppercase tracking-wide ${isLight ? 'text-slate-700' : 'text-slate-305 font-bold'}`}>
                                State-Space Matrix
                              </h4>
                              <div className="py-1 px-1 flex justify-center text-center w-full mathjax-large-equations overflow-x-auto">
                                {`\\[ ${results.latexMatrix} \\]`}
                              </div>
                            </div>
                          )}

                          {/* Card 2: Separated Equations (Raw Node Voltages) */}
                          {showRawEqs && (
                            <div className={`p-4 rounded-xl border flex flex-col gap-3 shadow-sm ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
                              <h4 className={`text-[11px] font-extrabold uppercase tracking-wide ${isLight ? 'text-slate-700' : 'text-slate-305 font-bold'}`}>
                                Separated Equations (Raw Node Voltages)
                              </h4>
                              <div className="py-1 px-1 flex justify-center text-center w-full mathjax-large-equations overflow-x-auto">
                                {`\\[ ${results.latexSeparatedRaw} \\]`}
                              </div>
                            </div>
                          )}

                          {/* Card 3: Separated Equations (Simplified) */}
                          {showSimpEqs && (
                            <div className={`p-4 rounded-xl border flex flex-col gap-3 shadow-sm ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'}`}>
                              <h4 className={`text-[11px] font-bold uppercase tracking-wide text-emerald-600`}>
                                Separated Equations (Simplified)
                              </h4>
                              <div className="py-1 px-1 flex justify-center text-center w-full mathjax-large-equations overflow-x-auto">
                                {`\\[ ${results.latexSeparatedSimp} \\]`}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
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
              onClick={() => {
                setShowFlowInspector(!showFlowInspector);
                if (!showFlowInspector) {
                  setShowModeInspector(false);
                }
              }}
              className={`px-3 h-9 border rounded-lg text-xs font-sans font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                showFlowInspector 
                ? (isLight ? 'border-sky-400 bg-sky-50 text-sky-600 shadow-sm' : 'border-sky-505 bg-sky-955/20 text-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.15)]') 
                : (isLight ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50' : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white hover:border-slate-700')
              }`}
              title="Toggle sidebar Flow Inspector panel"
            >
              <Sliders className="h-3.5 w-3.5" />
              <span>Flow Inspector</span>
            </button>

            {/* Mode Inspector Toggle Panel control */}
            <button 
              onClick={() => {
                setShowModeInspector(!showModeInspector);
                if (!showModeInspector) {
                  setShowFlowInspector(false);
                }
              }}
              className={`px-3 h-9 border rounded-lg text-xs font-sans font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                showModeInspector 
                ? (isLight ? 'border-cyan-400 bg-cyan-50 text-cyan-600 shadow-sm' : 'border-cyan-500 bg-cyan-950/20 text-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.15)]') 
                : (isLight ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50' : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white hover:border-slate-700')
              }`}
              title="Toggle sidebar Mode Inspector panel"
            >
              <Activity className="h-3.5 w-3.5" />
              <span>Mode Inspector</span>
            </button>
          </div>

          {/* Speed slider block */}
          <div className={`flex items-center gap-2.5 block px-3 py-1 border rounded-xl max-w-md w-full shadow-inner ${isLight ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/50 border-slate-900'}`}>
            <Sliders className="h-3.5 w-3.5 text-slate-500 shrink-0" />
            <div className="flex-1 flex flex-col gap-0.5 min-w-[70px]">
              <div className="flex items-center justify-between text-[9px] font-bold text-slate-500">
                <span className="uppercase tracking-tight font-sans">Playback Rate</span>
                <span className="font-mono text-emerald-550 font-bold">{speedMultiplier.toFixed(3)}x</span>
              </div>
              <input 
                type="range"
                min="0.001"
                max={maxSpeedMultiplier}
                step={maxSpeedMultiplier / 100}
                value={speedMultiplier}
                onChange={(e) => setSpeedMultiplier(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 h-1 cursor-pointer bg-slate-900 rounded-full"
              />
            </div>
            <div className="flex items-center gap-1.5 shrink-0 border-l pl-2 border-slate-200/20">
              <span className="text-[8px] text-slate-500 font-bold uppercase">Max:</span>
              <input 
                type="number"
                min="0.01"
                max="10.0"
                step="0.01"
                value={maxSpeedMultiplier}
                onChange={(e) => {
                  const val = Math.max(0.01, parseFloat(e.target.value) || 0.2);
                  setMaxSpeedMultiplier(val);
                }}
                className={`w-10 h-6 text-center font-mono text-[10px] font-bold rounded border focus:outline-none ${isLight ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-800 text-slate-100'} shrink-0`}
              />
            </div>
          </div>
        </div>
      </div>


    </div>
  );
}
