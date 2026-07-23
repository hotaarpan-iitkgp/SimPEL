import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Pause, RotateCcw, AlertCircle, Sparkles, SlidersHorizontal, 
  HelpCircle, ChevronLeft, Target, Award, Zap, ShieldAlert, CheckCircle, Flame, Activity,
  ZoomIn, ZoomOut, Sun, Moon, Columns, Rows
} from 'lucide-react';
import { state } from '../schematic/state';
import { exportDualGraphJSON, triggerImport } from '../schematic/actions';
import { CircuitSimulator } from '../solver_ts';
import { getComponentSVG } from '../schematic/components';
import { getWirePath, getWireDomain, getWireEndpointCoords } from '../schematic/routing';
import { pathToString } from '../schematic/utils';
import { CIRCUITS_TEMPLATES } from '../templates';
import { COMPONENT_PINS, getComponentPins } from '../schematic/config';

interface Point {
  tSim: number;
  signals: Record<string, number>;
  yRef: number;
  epsilon: number;
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
  return lastP;
};

const findNearestPhysicalPin = (wireId: string, end: 'from' | 'to', visited = new Set<string>()): { compId: string; terminal: string; wireEnd: 'from' | 'to' } | null => {
  if (visited.has(wireId)) return null;
  visited.add(wireId);

  const wire = state.wires.find((w: any) => w.id === wireId);
  if (!wire) return null;

  const endpoint = end === 'from' ? wire.from : wire.to;
  if (!endpoint) return null;

  if (endpoint.type === 'pin') {
    const compObj = state.components.find((c: any) => c.id === endpoint.compId);
    if (compObj) {
      // Check if it's a physical power-carrying component (not Voltmeter, and not a control block)
      const physicalTypes = ["Resistor", "R", "Inductor", "L", "Capacitor", "C", "Diode", "D", "MOSFET", "Switch", "S", "VoltageSource", "V", "ACVoltageSource", "AC_V"];
      if (physicalTypes.includes(compObj.type)) {
        return { compId: endpoint.compId, terminal: endpoint.terminal, wireEnd: end };
      }
    }
  } else if (endpoint.type === 'wire') {
    // If it connects to another wire, search that wire's both ends
    const resFrom = findNearestPhysicalPin(endpoint.wireId, 'from', visited);
    if (resFrom) return { compId: resFrom.compId, terminal: resFrom.terminal, wireEnd: end };
    const resTo = findNearestPhysicalPin(endpoint.wireId, 'to', visited);
    if (resTo) return { compId: resTo.compId, terminal: resTo.terminal, wireEnd: end };
  }

  // Also check if other wires connect TO this wire at the specified end
  for (const w of state.wires) {
    if (w.id === wireId) continue;
    if (w.to && w.to.type === 'wire' && w.to.wireId === wireId) {
      const res = findNearestPhysicalPin(w.id, 'from', visited);
      if (res) return { compId: res.compId, terminal: res.terminal, wireEnd: end };
    }
    if (w.from && w.from.type === 'wire' && w.from.wireId === wireId) {
      const res = findNearestPhysicalPin(w.id, 'to', visited);
      if (res) return { compId: res.compId, terminal: res.terminal, wireEnd: end };
    }
  }

  return null;
};

const getWireCurrent = (wireId: string, lastPt: any): number => {
  if (!lastPt || !lastPt.signals) return 0.0;
  
  // Try to find a physical pin on either the 'from' or 'to' end of this wire
  let conn = findNearestPhysicalPin(wireId, 'from');
  if (!conn) {
    conn = findNearestPhysicalPin(wireId, 'to');
  }
  
  if (conn) {
    const compId = conn.compId;
    const terminal = conn.terminal;
    const wireEnd = conn.wireEnd;

    // Determine pin polarity: positive pin vs negative pin
    const positivePins = ['A', '1', 'Anode', 'D', 'In', 'p', 'Plus'];
    const isPositivePin = positivePins.includes(terminal);

    const isWireEndTo = (wireEnd === 'to');
    const multiplier = (isPositivePin === isWireEndTo) ? 1.0 : -1.0;

    // Get the component's current
    let compCurrent = 0.0;
    if (lastPt.signals[`I_${compId}`] !== undefined) {
      compCurrent = lastPt.signals[`I_${compId}`];
    } else {
      const compObj = state.components.find((c: any) => c.id === compId);
      if (compObj && (compObj.type === 'Resistor' || compObj.type === 'R')) {
        const vVal = lastPt.signals[`V_${compId}`] ?? 0.0;
        const rVal = parseFloat(compObj.parameters?.value || compObj.parameters?.resistance || compObj.parameters?.r || "1.0") || 1.0;
        compCurrent = vVal / rVal;
      }
    }

    return compCurrent * multiplier;
  }

  return 0.0;
};


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


const getComponentSignals = (comp: any): { id: string; label: string; compId: string; type: 'voltage' | 'current' | 'control' }[] => {
  if (!comp) return [];
  const signals: { id: string; label: string; compId: string; type: 'voltage' | 'current' | 'control' }[] = [];
  
  if (comp.type === 'VM' || comp.type === 'Voltmeter') {
    signals.push({ id: `${comp.id}.Out`, label: `Voltage Output (${comp.id})`, compId: comp.id, type: 'voltage' });
  } else if (comp.type === 'AM' || comp.type === 'Ammeter') {
    signals.push({ id: `${comp.id}.Out`, label: `Current Output (${comp.id})`, compId: comp.id, type: 'current' });
  } else if (comp.type === 'PROBE') {
    const selected = (comp.parameters?.selected_signals || "").split(",").filter(Boolean);
    selected.forEach((sig: string) => {
      signals.push({ id: `${comp.id}.${sig}`, label: `Probe: ${sig}`, compId: comp.id, type: 'control' });
    });
  } else if (['R', 'L', 'C', 'S', 'D', 'MOSFET', 'Diode', 'Switch', 'Resistor', 'Inductor', 'Capacitor', 'X', 'M'].includes(comp.type)) {
    signals.push({ id: `V_${comp.id}`, label: `Voltage across ${comp.id}`, compId: comp.id, type: 'voltage' });
    signals.push({ id: `I_${comp.id}`, label: `Current through ${comp.id}`, compId: comp.id, type: 'current' });
  } else {
    // If it is a known control block, expose its standard terminal pins
    const pins = COMPONENT_PINS[comp.type];
    if (pins) {
      Object.keys(pins).forEach((pinName) => {
        signals.push({
          id: `${comp.id}.${pinName}`,
          label: `${pinName} of ${comp.id} (${comp.id}.${pinName})`,
          compId: comp.id,
          type: 'control'
        });
      });
    }

    if (comp.channels) {
      Object.entries(comp.channels).forEach(([term, chan]) => {
        if (chan && typeof chan === 'string') {
          const capitalizedTerm = term.charAt(0).toUpperCase() + term.slice(1);
          signals.push({ id: chan, label: `${capitalizedTerm} of ${comp.id} (${chan})`, compId: comp.id, type: 'control' });
        }
      });
    }
    if (comp.id) {
      signals.push({ id: comp.id, label: `Output of ${comp.id}`, compId: comp.id, type: 'control' });
    }
  }
  return signals;
};

const getAllAvailableSignals = (comps: any[]) => {
  const signals: { id: string; label: string; compId: string; type: 'voltage' | 'current' | 'control' }[] = [];
  comps.forEach((comp) => {
    const compSigs = getComponentSignals(comp);
    compSigs.forEach(s => signals.push(s));
  });
  const seen = new Set<string>();
  return signals.filter(s => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
};

const getColSpanStyle = (span: number, isLarge: boolean) => {
  if (!isLarge) return {};
  return { gridColumn: `span ${span} / span ${span}` };
};

const getColSpanClass = (span: number) => {
  const mapping: Record<number, string> = {
    2: 'lg:col-span-2',
    3: 'lg:col-span-3',
    4: 'lg:col-span-4',
    5: 'lg:col-span-5',
    6: 'lg:col-span-6',
    7: 'lg:col-span-7',
    8: 'lg:col-span-8',
    9: 'lg:col-span-9',
    10: 'lg:col-span-10'
  };
  return mapping[span] || 'lg:col-span-6';
};

export default function GamePlayer({ onBack }: { onBack?: () => void }) {
  // Game simulation state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [activeTemplateKey, setActiveTemplateKey] = useState<string>("buck_converter");
  const [dilationUs, setDilationUs] = useState(50000); // 1s human = 50000us simulation (alpha = 0.05)
  const dilationRate = dilationUs / 1000000.0;
  const [tolerance, setTolerance] = useState(0.5); // epsilon
  const [victory, setVictory] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [viewLayoutMode, setViewLayoutMode] = useState<'side-by-side' | 'stacked'>('side-by-side');
  const [hiddenSplitRatio, setHiddenSplitRatio] = useState<number>(6);
  const [isLargeScreen, setIsLargeScreen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
    if (typeof window !== 'undefined' && document.documentElement.classList.contains('light-mode')) return 'light';
    return 'dark';
  });
  const [schematicZoom, setSchematicZoom] = useState<number>(1.0);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light-mode');
      root.classList.remove('dark-mode');
    } else {
      root.classList.add('dark-mode');
      root.classList.remove('light-mode');
    }
  }, [theme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 640px)');
    const handleResize = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsLargeScreen(e.matches);
    };
    handleResize(mediaQuery);
    mediaQuery.addEventListener('change', handleResize);
    return () => mediaQuery.removeEventListener('change', handleResize);
  }, []);

  const wireOffsetsRef = useRef<Record<string, number>>({});
  const [frameCount, setFrameCount] = useState(0);

  // Component Selection and Signal Tabbing States
  const [selectedCompId, setSelectedCompId] = useState<string | null>(null);
  const [signalTab, setSignalTab] = useState<'component' | 'all'>('component');

  // Selector choices
  const [availableSensors, setAvailableSensors] = useState<string[]>([]);
  const [selectedSensor, setSelectedSensor] = useState<string>('');
  const [refType, setRefType] = useState<'sine' | 'square' | 'triangle' | 'step'>('sine');
  const [refFreq, setRefFreq] = useState(50); // Hz
  const [refAmp, setRefAmp] = useState(5.0);
  const [refOffset, setRefOffset] = useState(0.0);

  // States for subplots
  const [numSubplots, setNumSubplots] = useState(1);
  const [subplot2Signal, setSubplot2Signal] = useState<string>('');
  const [subplot3Signal, setSubplot3Signal] = useState<string>('');

  // NEW state variable: visible points for horizontal zoom
  const [visiblePoints, setVisiblePoints] = useState(400); // number of points to draw on oscilloscope

  // Sync state to refs for non-interruptive simulation loop
  const dilationRateRef = useRef(dilationRate);
  dilationRateRef.current = dilationRate;

  const toleranceRef = useRef(tolerance);
  toleranceRef.current = tolerance;

  const selectedSensorRef = useRef(selectedSensor);
  selectedSensorRef.current = selectedSensor;

  const numSubplotsRef = useRef(numSubplots);
  numSubplotsRef.current = numSubplots;

  const subplot2SignalRef = useRef(subplot2Signal);
  subplot2SignalRef.current = subplot2Signal;

  const subplot3SignalRef = useRef(subplot3Signal);
  subplot3SignalRef.current = subplot3Signal;

  const refTypeRef = useRef(refType);
  refTypeRef.current = refType;

  const refFreqRef = useRef(refFreq);
  refFreqRef.current = refFreq;

  const refAmpRef = useRef(refAmp);
  refAmpRef.current = refAmp;

  const refOffsetRef = useRef(refOffset);
  refOffsetRef.current = refOffset;

  const visiblePointsRef = useRef(visiblePoints);
  visiblePointsRef.current = visiblePoints;

  const [zoomMultiplier, setZoomMultiplier] = useState<number>(1);
  const zoomMultiplierRef = useRef(zoomMultiplier);
  zoomMultiplierRef.current = zoomMultiplier;

  const handleMultiplierChange = (newMult: number) => {
    const oldMult = zoomMultiplier;
    setZoomMultiplier(newMult);
    
    // Scale the current visiblePoints proportionally
    let newPoints = Math.round(visiblePoints * (newMult / oldMult));
    const minPoints = 50 * newMult;
    const maxPoints = 1500 * newMult;
    const step = 50 * newMult;
    
    // Snap to nearest step
    newPoints = Math.round(newPoints / step) * step;
    // Clamp
    if (newPoints < minPoints) newPoints = minPoints;
    if (newPoints > maxPoints) newPoints = maxPoints;
    
    setVisiblePoints(newPoints);
  };

  const handleThemeToggle = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
  };

  // State for viewport viewBox
  const [viewBox, setViewBox] = useState('-100 -100 800 600');
  const [viewBoxCoords, setViewBoxCoords] = useState({ minX: -100, minY: -100, width: 800, height: 600 });

  // Scaled effective viewBox for schematic zooming and pan offset
  const centerX = viewBoxCoords.minX + viewBoxCoords.width / 2 + panOffset.x;
  const centerY = viewBoxCoords.minY + viewBoxCoords.height / 2 + panOffset.y;
  const scaledWidth = viewBoxCoords.width / schematicZoom;
  const scaledHeight = viewBoxCoords.height / schematicZoom;
  const scaledMinX = centerX - scaledWidth / 2;
  const scaledMinY = centerY - scaledHeight / 2;
  const effectiveViewBox = `${scaledMinX} ${scaledMinY} ${scaledWidth} ${scaledHeight}`;

  // Update dynamic viewport viewBox based on current active schematic components
  const updateViewBox = () => {
    if (!state.components || state.components.length === 0) {
      setViewBox('-100 -100 800 600');
      setViewBoxCoords({ minX: -100, minY: -100, width: 800, height: 600 });
      return;
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    state.components.forEach((c: any) => {
      minX = Math.min(minX, c.x);
      maxX = Math.max(maxX, c.x);
      minY = Math.min(minY, c.y);
      maxY = Math.max(maxY, c.y);
    });

    // Add visual padding around the bounding box
    const padding = 120;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const width = Math.max(400, maxX - minX);
    const height = Math.max(300, maxY - minY);

    setViewBox(`${minX} ${minY} ${width} ${height}`);
    setViewBoxCoords({ minX, minY, width, height });
  };

  // Scoring / Metrics State
  const [activeStreak, setActiveStreak] = useState(0); // simulation seconds
  const [maxStreak, setMaxStreak] = useState(0); // simulation seconds
  const [switchToggles, setSwitchToggles] = useState(0);
  const [averageSwitchFreq, setAverageSwitchFreq] = useState(0); // toggles / sim_second
  const [rollingAccuracy, setRollingAccuracy] = useState(0); // percentage

  // Internal references
  const simRef = useRef<CircuitSimulator | null>(null);
  const simTimeRef = useRef(0.0);
  const animationFrameRef = useRef<number | null>(null);
  const accumulatedSimTimeRef = useRef(0.0);
  const lastFrameTimeRef = useRef<number>(0);
  const pointsHistoryRef = useRef<Point[]>([]);
  const switchTogglesCountRef = useRef(0);
  const activeKeysPressedRef = useRef<Record<string, boolean>>({});
  const toggleStatesRef = useRef<Record<string, boolean>>({}); // track toggle states for key_trigger components

  // Drawing refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Find all key triggers and bind physical listeners
  const [keyTriggers, setKeyTriggers] = useState<any[]>([]);

  const [updateTrigger, setUpdateTrigger] = useState(0);

  useEffect(() => {
    const handleStateChange = () => {
      setUpdateTrigger(prev => prev + 1);
    };
    window.addEventListener('appletStateChanged', handleStateChange);
    // Force immediate first calculation on mount
    updateViewBox();
    return () => {
      window.removeEventListener('appletStateChanged', handleStateChange);
    };
  }, []);

  // Find available sensors (Voltmeters, Ammeters, Probes, Voltages, Currents) in active schematic
  useEffect(() => {
    const allSignals = getAllAvailableSignals(state.components);
    const sensors = allSignals.map(s => s.id);
    
    setAvailableSensors(sensors);
    if (sensors.length > 0 && !selectedSensor) {
      setSelectedSensor(sensors[0]);
    }
    if (sensors.length > 1 && !subplot2Signal) {
      setSubplot2Signal(sensors[1]);
    } else if (sensors.length <= 1) {
      setSubplot2Signal('');
    }
    if (sensors.length > 2 && !subplot3Signal) {
      setSubplot3Signal(sensors[2]);
    } else if (sensors.length <= 2) {
      setSubplot3Signal('');
    }

    // Auto select first VM/AM or component if not set
    if (!selectedCompId && state.components.length > 0) {
      const firstVmAm = state.components.find((c: any) => c.type === 'VM' || c.type === 'AM' || c.type === 'Voltmeter' || c.type === 'Ammeter');
      const firstComp = firstVmAm || state.components[0];
      if (firstComp) {
        setSelectedCompId(firstComp.id);
      }
    }

    // Find and set key trigger blocks
    const triggers = state.components.filter((c: any) => c.type === 'KEY_TRIGGER');
    setKeyTriggers(triggers);

    // Default key trigger initial states
    triggers.forEach((trig: any) => {
      if (toggleStatesRef.current[trig.id] === undefined) {
        toggleStatesRef.current[trig.id] = false;
      }
    });

    // Recalculate dynamic viewBox coordinates
    updateViewBox();
  }, [updateTrigger, state.components]);

  // Handle keyboard inputs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isPlaying && !isPaused) {
        // Prevent default browser actions for bound keys
        const boundKeyMatch = keyTriggers.some((trig: any) => {
          const bound = trig.parameters?.key || 'Space';
          const matches = (bound === 'Space' && e.code === 'Space') ||
                          (bound.toLowerCase() === e.key.toLowerCase()) ||
                          (bound.toLowerCase() === e.code.toLowerCase());
          return matches;
        });

        if (boundKeyMatch) {
          e.preventDefault();
        }

        keyTriggers.forEach((trig: any) => {
          const bound = trig.parameters?.key || 'Space';
          const matches = (bound === 'Space' && e.code === 'Space') ||
                          (bound.toLowerCase() === e.key.toLowerCase()) ||
                          (bound.toLowerCase() === e.code.toLowerCase());
          
          if (matches) {
            const isToggle = trig.parameters?.toggle_mode === 'true';
            if (isToggle) {
              // Toggle on keydown edge only (ignore repeat keys)
              if (!activeKeysPressedRef.current[trig.id]) {
                toggleStatesRef.current[trig.id] = !toggleStatesRef.current[trig.id];
                switchTogglesCountRef.current += 1;
                setSwitchToggles(switchTogglesCountRef.current);
                
                // Set value into solver trigger states
                if (simRef.current) {
                  const val = toggleStatesRef.current[trig.id] 
                    ? parseFloat(trig.parameters?.active_value || '1.0')
                    : parseFloat(trig.parameters?.inactive_value || '0.0');
                  simRef.current.key_trigger_states[trig.id] = val;
                }
              }
            } else {
              // Momentary hold mode
              if (!activeKeysPressedRef.current[trig.id]) {
                switchTogglesCountRef.current += 1;
                setSwitchToggles(switchTogglesCountRef.current);
              }
              toggleStatesRef.current[trig.id] = true;
              if (simRef.current) {
                const val = parseFloat(trig.parameters?.active_value || '1.0');
                simRef.current.key_trigger_states[trig.id] = val;
              }
            }
            activeKeysPressedRef.current[trig.id] = true;
          }
        });
        
        // Force state refresh to update schematic overlays
        setKeyTriggers([...keyTriggers]);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keyTriggers.forEach((trig: any) => {
        const bound = trig.parameters?.key || 'Space';
        const matches = (bound === 'Space' && e.code === 'Space') ||
                        (bound.toLowerCase() === e.key.toLowerCase()) ||
                        (bound.toLowerCase() === e.code.toLowerCase());

        if (matches) {
          const isToggle = trig.parameters?.toggle_mode === 'true';
          if (!isToggle) {
            // Reset state for momentary mode
            toggleStatesRef.current[trig.id] = false;
            if (simRef.current) {
              const val = parseFloat(trig.parameters?.inactive_value || '0.0');
              simRef.current.key_trigger_states[trig.id] = val;
            }
          }
          activeKeysPressedRef.current[trig.id] = false;
        }
      });
      // Force state refresh to update schematic overlays
      setKeyTriggers([...keyTriggers]);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isPlaying, isPaused, keyTriggers]);

  // Calculate target reference waveform at simulation time t
  const evaluateReferenceSignal = (t: number): number => {
    const f = refFreqRef.current;
    const amp = refAmpRef.current;
    const offset = refOffsetRef.current;
    const currentRefType = refTypeRef.current;

    switch (currentRefType) {
      case 'sine':
        return offset + amp * Math.sin(2.0 * Math.PI * f * t);
      case 'square':
        return offset + amp * (Math.sin(2.0 * Math.PI * f * t) >= 0 ? 1.0 : -1.0);
      case 'triangle': {
        const t_period = (t * f) % 1.0;
        const val = t_period < 0.5 ? -1.0 + 4.0 * t_period : 3.0 - 4.0 * t_period;
        return offset + amp * val;
      }
      case 'step': {
        // Step signal that transitions every 1 / (2 * f) seconds
        const step_period = 1.0 / (2.0 * f);
        const cycle = Math.floor(t / step_period) % 2;
        return offset + (cycle === 0 ? amp : -amp);
      }
      default:
        return 0.0;
    }
  };

  // Click handler for badge triggers on the schematic
  const handleBadgeClick = (trigId: string) => {
    if (!isPlaying || isPaused) return;

    const trig = keyTriggers.find((t: any) => t.id === trigId);
    if (!trig) return;

    const isToggle = trig.parameters?.toggle_mode === 'true';
    if (isToggle) {
      toggleStatesRef.current[trigId] = !toggleStatesRef.current[trigId];
      switchTogglesCountRef.current += 1;
      setSwitchToggles(switchTogglesCountRef.current);
      if (simRef.current) {
        const val = toggleStatesRef.current[trigId]
          ? parseFloat(trig.parameters?.active_value || '1.0')
          : parseFloat(trig.parameters?.inactive_value || '0.0');
        simRef.current.key_trigger_states[trigId] = val;
      }
    } else {
      // Pulse momentary mode on badge tap
      switchTogglesCountRef.current += 1;
      setSwitchToggles(switchTogglesCountRef.current);
      toggleStatesRef.current[trigId] = true;
      if (simRef.current) {
        const activeVal = parseFloat(trig.parameters?.active_value || '1.0');
        simRef.current.key_trigger_states[trigId] = activeVal;
      }
      // Revert after 150ms to simulate a momentary pulse
      setTimeout(() => {
        toggleStatesRef.current[trigId] = false;
        if (simRef.current) {
          const inactiveVal = parseFloat(trig.parameters?.inactive_value || '0.0');
          simRef.current.key_trigger_states[trigId] = inactiveVal;
        }
        setKeyTriggers([...keyTriggers]);
      }, 150);
    }
    setKeyTriggers([...keyTriggers]);
  };

  // Load a circuit template into the global state and reset the game state
  const loadGameTemplate = (key: string) => {
    const template = CIRCUITS_TEMPLATES[key];
    if (!template) return;

    if (isPlaying) {
      stopGame();
    }

    const templateTypeToVisualType: Record<string, string> = {
      "VoltageSource": "V",
      "ACVoltageSource": "AC_V",
      "CurrentSource": "I",
      "Resistor": "R",
      "Inductor": "L",
      "Capacitor": "C",
      "Diode": "D",
      "Switch": "S",
      "MOSFET": "MOSFET",
      "Transformer": "XFMR",
      "Voltmeter": "VM",
      "Ammeter": "AM",
      "Constant": "CONST",
      "Gain": "GAIN",
      "PI_Controller": "PID",
      "SummingJunction": "SUM",
      "Triangle_Carrier": "TRI",
      "Comparator": "COMP",
      "NOT_Gate": "NOT",
      "NOT": "NOT"
    };

    const layoutComponents = template.components.map(c => {
      const visualType = templateTypeToVisualType[c.type] || c.type;
      return {
        id: c.id,
        type: visualType,
        x: c.x || 150,
        y: c.y || 100,
        rotation: c.rotation || 0,
        parameters: c.parameters || {},
        label: c.label || `${c.type} (${c.id})`
      };
    });

    let wires: any[] = [];
    if (template.wires && template.wires.length > 0) {
      wires = JSON.parse(JSON.stringify(template.wires));
    } else {
      let wireIdCounter = 1;
      const getNextWireId = () => `W_temp_${wireIdCounter++}`;

      const electricalNodes: Record<string, { compId: string; terminal: string }[]> = {};
      template.components.forEach((comp) => {
        const visualType = templateTypeToVisualType[comp.type] || comp.type;
        let pinNames: string[] = [];
        if (['R', 'L', 'C', 'S', 'D', 'V', 'I', 'VM', 'AM', 'AC_V'].includes(visualType)) {
          pinNames = ['A', 'B'];
        } else if (visualType === 'MOSFET') {
          pinNames = ['D', 'S'];
        } else if (['E_PORT', 'E_LABEL'].includes(visualType)) {
          pinNames = ['A'];
        } else if (visualType === 'GND') {
          pinNames = ['Gnd'];
        }
        
        if (comp.nodes && comp.nodes.length > 0) {
          comp.nodes.forEach((nodeName: string, idx: number) => {
            if (!nodeName) return;
            const terminalName = pinNames[idx];
            if (terminalName) {
              if (!electricalNodes[nodeName]) electricalNodes[nodeName] = [];
              electricalNodes[nodeName].push({ compId: comp.id, terminal: terminalName });
            }
          });
        }
      });

      Object.keys(electricalNodes).forEach((nodeName) => {
        const pins = electricalNodes[nodeName];
        if (pins.length > 1) {
          for (let i = 0; i < pins.length - 1; i++) {
            wires.push({
              id: getNextWireId(),
              from: { type: 'pin', compId: pins[i].compId, terminal: pins[i].terminal },
              to: { type: 'pin', compId: pins[i + 1].compId, terminal: pins[i + 1].terminal },
              manualPath: null
            });
          }
        }
      });

      const controlChannels: Record<string, { compId: string; terminal: string }[]> = {};
      template.components.forEach((comp) => {
        if (comp.channels) {
          Object.keys(comp.channels).forEach((terminalName) => {
            const channelName = comp.channels[terminalName];
            if (!channelName) return;
            if (!controlChannels[channelName]) controlChannels[channelName] = [];
            controlChannels[channelName].push({ compId: comp.id, terminal: terminalName });
          });
        }
      });

      Object.keys(controlChannels).forEach((channelName) => {
        const pins = controlChannels[channelName];
        if (pins.length > 1) {
          for (let i = 0; i < pins.length - 1; i++) {
            wires.push({
              id: getNextWireId(),
              from: { type: 'pin', compId: pins[i].compId, terminal: pins[i].terminal },
              to: { type: 'pin', compId: pins[i + 1].compId, terminal: pins[i + 1].terminal },
              manualPath: null
            });
          }
        }
      });
    }

    const layoutObj = {
      components: layoutComponents,
      wires: wires,
      simulationSettings: {
        stopTime: String(template.simulationSettings?.stopTime ?? template.simulationSettings?.stop_time ?? "0.01"),
        stepSize: String(template.simulationSettings?.stepSize ?? template.simulationSettings?.step_size ?? "10u"),
        solver: template.simulationSettings?.solver ?? "euler",
        stepType: template.simulationSettings?.stepType ?? template.simulationSettings?.step_type ?? "fixed"
      }
    };

    triggerImport(JSON.stringify(layoutObj));
    
    // Setup matching reference settings if specified
    if (key === 'buck_converter') {
      setRefType('sine');
      setRefFreq(50);
      setRefAmp(5.0);
      setRefOffset(0.0);
    } else if (key === 'lc_resonance') {
      setRefType('step');
      setRefFreq(25);
      setRefAmp(12.0);
      setRefOffset(0.0);
    } else if (key === 'ac_rectifier') {
      setRefType('sine');
      setRefFreq(60);
      setRefAmp(15.0);
      setRefOffset(0.0);
    } else if (key === 'h_bridge_inverter') {
      setRefType('triangle');
      setRefFreq(40);
      setRefAmp(10.0);
      setRefOffset(0.0);
    }

    setUpdateTrigger(prev => prev + 1);
  };

  // Auto-load template on mount or restore persisted schematic from editor
  useEffect(() => {
    const persisted = localStorage.getItem('circuitsim_persisted_schematic');
    if (persisted) {
      try {
        const layoutObj = JSON.parse(persisted);
        triggerImport(persisted);
        
        // Setup initial triggers based on imported schematic components
        const triggers = layoutObj.components?.filter((c: any) => c.type === 'KEY_TRIGGER') || [];
        setKeyTriggers(triggers);
        
        // Default key trigger initial states
        triggers.forEach((trig: any) => {
          if (toggleStatesRef.current[trig.id] === undefined) {
            toggleStatesRef.current[trig.id] = false;
          }
        });
        
        // Extract active template key if stored
        const persistedTemplateKey = localStorage.getItem('circuitsim_persisted_template_key');
        if (persistedTemplateKey) {
          setActiveTemplateKey(persistedTemplateKey);
        } else {
          setActiveTemplateKey('custom');
        }
        
        setUpdateTrigger(prev => prev + 1);
        updateViewBox();
        return; // Success, skip loading default template
      } catch (err) {
        console.error("Failed to restore persisted schematic in Game Mode:", err);
      }
    }

    if (!state.components || state.components.length === 0) {
      loadGameTemplate('buck_converter');
    }
  }, []);

  // Start the time-dilated interactive game
  const startGame = () => {
    try {
      // Export current schematic as netlist JSON
      const netlistObj = exportDualGraphJSON(true);
      const simulator = new CircuitSimulator(
        netlistObj.physical_stage || [],
        netlistObj.control_loops || [],
        netlistObj.simulation_parameters || {}
      );

      // Initialize the simulator
      simulator.initializeNetwork();
      
      // Inject key trigger initial states
      simulator.key_trigger_states = {};
      keyTriggers.forEach((trig: any) => {
        const inactiveVal = parseFloat(trig.parameters?.inactive_value || '0.0');
        simulator.key_trigger_states[trig.id] = inactiveVal;
        toggleStatesRef.current[trig.id] = false;
        activeKeysPressedRef.current[trig.id] = false;
      });

      simRef.current = simulator;
      simTimeRef.current = 0.0;
      accumulatedSimTimeRef.current = 0.0;
      pointsHistoryRef.current = [];
      switchTogglesCountRef.current = 0;
      
      setActiveStreak(0);
      setSwitchToggles(0);
      setAverageSwitchFreq(0);
      setRollingAccuracy(0);
      setVictory(false);
      setIsPlaying(true);
      setIsPaused(false);
      lastFrameTimeRef.current = performance.now();
    } catch (e: any) {
      alert(`Could not construct game simulator. Make sure circuit has a ground (GND) reference! Error: ${e.message || e}`);
    }
  };

  // Stop / reset the game
  const stopGame = () => {
    setIsPlaying(false);
    setIsPaused(false);
    simRef.current = null;
    pointsHistoryRef.current = [];
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setActiveStreak(0);
    setSwitchToggles(0);
    setAverageSwitchFreq(0);
    setRollingAccuracy(0);
    setVictory(false);
  };

  // Toggle pausing the game loop
  const togglePause = () => {
    if (!isPlaying) return;
    setIsPaused(!isPaused);
    lastFrameTimeRef.current = performance.now();
  };

  // Real-time animation loop
  useEffect(() => {
    if (!isPlaying || isPaused || !simRef.current) return;

    const sim = simRef.current;
    const h = sim.sim_params.h || 1e-5; // Solver step size

    const gameLoop = (timestamp: number) => {
      if (!lastFrameTimeRef.current) lastFrameTimeRef.current = timestamp;
      const dtHuman = (timestamp - lastFrameTimeRef.current) / 1000.0; // human elapsed seconds
      lastFrameTimeRef.current = timestamp;

      // Limit dtHuman to avoid huge jumps on tab resume/lag
      const clampedDtHuman = Math.min(0.1, dtHuman);

      // Scale simulation time to advance in this human frame
      const currentDilationRate = dilationRateRef.current;
      const dtSimTarget = clampedDtHuman * currentDilationRate;
      accumulatedSimTimeRef.current += dtSimTarget;

      // Clamp backlog to prevent getting stuck at ultra-high speed after a lag spike
      const maxBacklog = Math.max(100 * h, 3 * dtSimTarget);
      if (accumulatedSimTimeRef.current > maxBacklog) {
        accumulatedSimTimeRef.current = maxBacklog;
      }

      let stepsRun = 0;
      let lastSignals: Record<string, number> = {};
      let currentT = simTimeRef.current;

      const currentSelectedSensor = selectedSensorRef.current;
      const currentTolerance = toleranceRef.current;

      // Run sub-stepping loop
      while (accumulatedSimTimeRef.current >= h && stepsRun < 250) {
        try {
          const step = sim.takeStep(currentT, sim.w, h, sim.sim_params.solver, sim.control_states, sim.sw_states);
          sim.w = step.w_new;
          sim.control_states = step.ctrl_new;
          sim.sw_states = step.sw_new;
          for (const k of Object.keys(sim.custom_blocks)) {
            if (step.ctrl_new[k]) sim.custom_blocks[k].state = step.ctrl_new[k];
          }
          
          lastSignals = sim.evaluateControls(currentT + h, sim.w, sim.control_states, h, sim.sw_states, false, false, true);
          currentT += h;
          accumulatedSimTimeRef.current -= h;
          stepsRun++;

          // Construct a comprehensive stepValues dictionary with ALL available signals
          const stepValues: Record<string, number> = {};

          // 1. Control block outputs
          Object.entries(lastSignals).forEach(([k, v]) => {
            stepValues[k] = v;
          });

          // 1.5. Map control block input pins to their connected source signals
          if (Array.isArray(sim.control_loops)) {
            sim.control_loops.forEach((b) => {
              if (b.channels) {
                Object.entries(b.channels).forEach(([pinName, sourceSignal]) => {
                  if (sourceSignal && typeof sourceSignal === 'string') {
                    if (stepValues[sourceSignal] !== undefined) {
                      stepValues[`${b.id}.${pinName}`] = stepValues[sourceSignal];
                    }
                  }
                });
              }
            });
          }

          // 2. Voltmeters
          sim.voltmeters.forEach((vm) => {
            const n1 = vm.nodes[0] ?? "node_0", n2 = vm.nodes[1] ?? "node_0";
            const i1 = (n1 !== "node_0") ? sim.node_to_idx[n1] : -1;
            const i2 = (n2 !== "node_0") ? sim.node_to_idx[n2] : -1;
            const val = ((i1 !== undefined && i1 >= 0) ? sim.w[i1] : 0.0) - ((i2 !== undefined && i2 >= 0) ? sim.w[i2] : 0.0);
            stepValues[`${vm.id}.Out`] = val;
            stepValues[vm.id] = val;
          });

          // 3. Ammeters
          sim.voltage_sources.forEach((comp) => {
            if (comp.type === "Ammeter") {
              const idx = sim.V_to_idx[comp.id];
              const val = (idx !== undefined && idx >= 0) ? sim.w[idx] : 0.0;
              stepValues[`${comp.id}.Out`] = val;
              stepValues[comp.id] = val;
            }
          });

          // 4. Physical stage component voltages and currents calculated directly
          sim.physical_stage.forEach((comp) => {
            let vVal = 0.0;
            if (comp.nodes && comp.nodes.length >= 2) {
              const n1 = comp.nodes[0] ?? "node_0", n2 = comp.nodes[1] ?? "node_0";
              const i1 = (n1 !== "node_0") ? sim.node_to_idx[n1] : -1;
              const i2 = (n2 !== "node_0") ? sim.node_to_idx[n2] : -1;
              vVal = ((i1 !== undefined && i1 >= 0) ? sim.w[i1] : 0.0) - ((i2 !== undefined && i2 >= 0) ? sim.w[i2] : 0.0);
            }
            stepValues[`V_${comp.id}`] = vVal;

            let iVal = 0.0;
            if (comp.type === "Inductor" || comp.type === "L") {
              const idx = sim.L_to_idx[comp.id];
              iVal = (idx !== undefined && idx >= 0) ? sim.w[idx] : 0.0;
            } else if (comp.type === "VoltageSource" || comp.type === "V" || comp.type === "AC_V" || comp.type === "ACVoltageSource") {
              const idx = sim.V_to_idx[comp.id];
              iVal = (idx !== undefined && idx >= 0) ? sim.w[idx] : 0.0;
            } else if (["Switch", "Diode", "MOSFET", "vg-FET", "S", "D", "IGBT", "IGBT_DIODE", "IGCT", "GTO", "THYRISTOR", "JFET", "BJT"].includes(comp.type)) {
              const ron = parseFloat(comp.parameters?.Ron ?? "1e-3") || 1e-3;
              const roff = parseFloat(comp.parameters?.Roff ?? "1e6") || 1e6;
              const state = sim.sw_states[comp.id] ?? "OFF";
              if ((comp.type === "Diode" || comp.type === "D") && state === "ON") {
                const vd_drop = parseFloat(comp.parameters?.Vd ?? "0.7") || 0.7;
                iVal = (vVal - vd_drop) / ron;
              } else {
                iVal = vVal / (state === "ON" ? ron : roff);
              }
            } else if (comp.type === "Resistor" || comp.type === "R") {
              let rVal = parseFloat(comp.parameters?.value || "1.0");
              if (isNaN(rVal) || rVal < 1e-6) rVal = 1.0;
              iVal = vVal / rVal;
            } else if (comp.type === "Capacitor" || comp.type === "C") {
              if (sim.cap_history && sim.cap_history[comp.id]) {
                const hist = sim.cap_history[comp.id];
                const dt_step = hist.dt_prev || h;
                const cVal = parseFloat(comp.parameters?.C || "100u") || 100e-6;
                iVal = cVal * (vVal - hist.v_prev) / dt_step;
              }
            } else if (comp.type === "CurrentSource" || comp.type === "I") {
              iVal = parseFloat(comp.parameters?.value || "1.0") || 1.0;
            }
            stepValues[`I_${comp.id}`] = iVal;
          });

          // Update capacitor history
          sim.capacitors.forEach((c) => {
            const n1 = c.nodes[0] ?? "node_0", n2 = c.nodes[1] ?? "node_0";
            const i1 = (n1 !== "node_0") ? sim.node_to_idx[n1] : -1;
            const i2 = (n2 !== "node_0") ? sim.node_to_idx[n2] : -1;
            const v = ((i1 !== undefined && i1 >= 0) ? sim.w[i1] : 0.0) - ((i2 !== undefined && i2 >= 0) ? sim.w[i2] : 0.0);
            if (sim.cap_history && sim.cap_history[c.id]) {
              sim.cap_history[c.id].v_prev_prev = sim.cap_history[c.id].v_prev;
              sim.cap_history[c.id].v_prev = v;
              sim.cap_history[c.id].dt_prev = h;
            }
          });

          // Inject live key trigger values into stepValues so they update dynamically in plots
          if (sim.key_trigger_states) {
            Object.entries(sim.key_trigger_states).forEach(([k, v]) => {
              stepValues[k] = v as number;
            });
          }

          // Scoring and accuracy metrics for each step
          const yRef = evaluateReferenceSignal(currentT);

          // Push to historical buffer with complete signals dictionary
          pointsHistoryRef.current.push({
            tSim: currentT,
            signals: stepValues,
            yRef,
            epsilon: currentTolerance
          });

          // Limit points history dynamically based on zoom multiplier (to keep UI responsive)
          const maxPoints = 1500 * zoomMultiplierRef.current;
          if (pointsHistoryRef.current.length > maxPoints) {
            pointsHistoryRef.current.shift();
          }
        } catch (e) {
          console.error("Solver sub-stepping crash: ", e);
          break;
        }
      }

      simTimeRef.current = currentT;

      // Calculate final metrics after sub-steps completed
      if (pointsHistoryRef.current.length > 0) {
        // Last visiblePoints steps or at least 600 for rolling accuracy
        const recentCount = Math.max(600, visiblePointsRef.current);
        const recentPoints = pointsHistoryRef.current.slice(-recentCount);
        const matchedCount = recentPoints.filter(p => {
          const yMeas = p.signals?.[currentSelectedSensor] ?? (p as any).yMeas ?? 0.0;
          return Math.abs(yMeas - p.yRef) <= p.epsilon;
        }).length;
        const accuracy = (matchedCount / recentPoints.length) * 100;
        setRollingAccuracy(Math.round(accuracy));

        // Evaluate continuous streak (in simulation time seconds)
        // If the very last point was a match, increment streak, else reset
        const lastPt = pointsHistoryRef.current[pointsHistoryRef.current.length - 1];
        const lastYMeas = lastPt.signals?.[currentSelectedSensor] ?? (lastPt as any).yMeas ?? 0.0;
        if (Math.abs(lastYMeas - lastPt.yRef) <= lastPt.epsilon) {
          setActiveStreak(prev => {
            const nextStreak = prev + stepsRun * h;
            // 10 second simulation streak is a glorious VICTORY!
            if (nextStreak >= 10.0 && !victory) {
              setVictory(true);
              setIsPaused(true);
            }
            return nextStreak;
          });
        } else {
          setActiveStreak(0);
        }

        setMaxStreak(prev => Math.max(prev, activeStreak));

        // Calculate Average switching frequency
        if (currentT > 0) {
          const avgFreq = switchTogglesCountRef.current / currentT;
          setAverageSwitchFreq(Math.round(avgFreq * 10) / 10);
        }
      }

      // Update wire scrolling offsets based on latest simulated currents
      const lastPt = pointsHistoryRef.current[pointsHistoryRef.current.length - 1];
      if (lastPt && lastPt.signals) {
        state.wires.forEach((wire: any) => {
          const segs = getSegmentsForWire(wire, state.wires);
          if (segs.length === 0) {
            const wireVal = getWireCurrent(wire.id, lastPt);
            if (Math.abs(wireVal) > 1e-3) {
              const velocity = 65.0 * Math.sign(wireVal) * Math.min(2.5, Math.pow(Math.abs(wireVal) * 10, 0.4));
              const oldOffset = wireOffsetsRef.current[`direct_wire_${wire.id}`] || 0.0;
              wireOffsetsRef.current[`direct_wire_${wire.id}`] = oldOffset + velocity * clampedDtHuman;
            }
          } else {
            segs.forEach(seg => {
              const wireVal = getWireCurrent(seg.segmentId, lastPt) || getWireCurrent(wire.id, lastPt);
              if (Math.abs(wireVal) > 1e-3) {
                const velocity = 65.0 * Math.sign(wireVal) * Math.min(2.5, Math.pow(Math.abs(wireVal) * 10, 0.4));
                const oldOffset = wireOffsetsRef.current[`direct_wire_${seg.segmentId}`] || 0.0;
                wireOffsetsRef.current[`direct_wire_${seg.segmentId}`] = oldOffset + velocity * clampedDtHuman;
              }
            });
          }
        });

        // Update physical components internal scrolling offsets
        state.components.forEach((comp: any) => {
          const isPhysical = ["Resistor", "R", "Inductor", "L", "Capacitor", "C", "Diode", "D", "MOSFET", "Switch", "S", "VoltageSource", "V", "ACVoltageSource", "AC_V"].includes(comp.type);
          if (isPhysical) {
            let compCurrent = 0.0;
            if (lastPt.signals[`I_${comp.id}`] !== undefined) {
              compCurrent = lastPt.signals[`I_${comp.id}`];
            } else if (comp.type === 'Resistor' || comp.type === 'R') {
              const vVal = lastPt.signals[`V_${comp.id}`] ?? 0.0;
              const rVal = parseFloat(comp.parameters?.value || comp.parameters?.resistance || comp.parameters?.r || "1.0") || 1.0;
              compCurrent = vVal / rVal;
            }

            if (Math.abs(compCurrent) > 1e-3) {
              const velocity = 65.0 * Math.sign(compCurrent) * Math.min(2.5, Math.pow(Math.abs(compCurrent) * 10, 0.4));
              const oldOffset = wireOffsetsRef.current[`comp_internal_${comp.id}`] || 0.0;
              wireOffsetsRef.current[`comp_internal_${comp.id}`] = oldOffset + velocity * clampedDtHuman;
            }
          }
        });
      }

      setFrameCount(c => c + 1);

      // Re-draw real-time scrolling oscilloscope
      drawOscilloscope();

      animationFrameRef.current = requestAnimationFrame(gameLoop);
    };

    animationFrameRef.current = requestAnimationFrame(gameLoop);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, isPaused, victory]);

  // Real-time canvas drawing function
  const drawOscilloscope = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear with canvas grid background based on theme
    ctx.fillStyle = theme === 'light' ? '#f8fafc' : '#0b0f19';
    ctx.fillRect(0, 0, width, height);

    const numSubs = numSubplotsRef.current;
    // Set aside 16px at the bottom of the canvas for the x-axis time numbers
    const subHeight = (height - 16) / numSubs;

    // Draw coordinate grids for each subplot
    ctx.strokeStyle = theme === 'light' ? '#e2e8f0' : '#111e33';
    ctx.lineWidth = 1;
    const cols = 10;
    const rowsPerSub = 4;

    for (let s = 0; s < numSubs; s++) {
      const yStart = s * subHeight;
      const yEnd = (s + 1) * subHeight;

      // Draw grid cols
      for (let i = 1; i < cols; i++) {
        const x = (width / cols) * i;
        ctx.beginPath();
        ctx.moveTo(x, yStart);
        ctx.lineTo(x, yEnd);
        ctx.stroke();
      }

      // Draw grid rows for this subplot
      for (let j = 1; j < rowsPerSub; j++) {
        const y = yStart + (subHeight / rowsPerSub) * j;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw horizontal dividing line between subplots
      if (s > 0) {
        ctx.strokeStyle = theme === 'light' ? '#cbd5e1' : '#1e293b';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, yStart);
        ctx.lineTo(width, yStart);
        ctx.stroke();
        // reset line width and color
        ctx.strokeStyle = theme === 'light' ? '#e2e8f0' : '#111e33';
        ctx.lineWidth = 1;
      }
    }

    // Horizontal zoom - slice points history from the end
    const visibleCount = visiblePointsRef.current;
    const pts = pointsHistoryRef.current.slice(-visibleCount);

    if (pts.length < 2) {
      // Draw idle standby graphics
      ctx.fillStyle = theme === 'light' ? '#0284c7' : '#38bdf8';
      ctx.font = '13px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('OSCILLOSCOPE STANDBY - START GAME TO ENERGIZE', width / 2, height / 2);
      return;
    }

    // Now loop and plot each subplot
    for (let sIdx = 0; sIdx < numSubs; sIdx++) {
      const yStart = sIdx * subHeight;
      const yEnd = (sIdx + 1) * subHeight;

      // Identify the signal ID for this subplot
      const currentSensor = selectedSensorRef.current;
      const sigId = sIdx === 0 
        ? currentSensor 
        : (sIdx === 1 ? subplot2SignalRef.current : subplot3SignalRef.current);

      if (!sigId) {
        // Draw empty subplot standby message
        ctx.fillStyle = theme === 'light' ? '#475569' : '#64748b';
        ctx.font = '11px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`Subplot ${sIdx + 1}: No Signal Selected`, width / 2, yStart + subHeight / 2);
        continue;
      }

      // Auto-scale Y values
      let yMax = -Infinity;
      let yMin = Infinity;

      pts.forEach(p => {
        const yVal = p.signals?.[sigId] ?? 0.0;
        if (sIdx === 0) {
          // Main tracking signal: also factor in target reference limits
          const maxVal = Math.max(yVal, p.yRef + p.epsilon);
          const minVal = Math.min(yVal, p.yRef - p.epsilon);
          if (maxVal > yMax) yMax = maxVal;
          if (minVal < yMin) yMin = minVal;
        } else {
          if (yVal > yMax) yMax = yVal;
          if (yVal < yMin) yMin = yVal;
        }
      });

      // Handle flat / constant signals
      if (yMax === yMin) {
        yMax += 1.0;
        yMin -= 1.0;
      }

      // Add margins so wave doesn't touch subplot boundary
      const padding = Math.max(0.01, (yMax - yMin) * 0.15);
      yMax += padding;
      yMin -= padding;
      const yRange = yMax - yMin;

      const toYPixel = (val: number) => {
        return yEnd - ((val - yMin) / yRange) * subHeight;
      };

      // If subplot 0: Draw tolerance band and reference target wave
      if (sIdx === 0) {
        // 1. Draw Translucent Tolerance Band
        ctx.fillStyle = theme === 'light' ? 'rgba(16, 185, 129, 0.18)' : 'rgba(16, 185, 129, 0.12)';
        ctx.beginPath();
        pts.forEach((p, idx) => {
          const x = (idx / (pts.length - 1)) * width;
          const yTop = toYPixel(p.yRef + p.epsilon);
          if (idx === 0) {
            ctx.moveTo(x, yTop);
          } else {
            ctx.lineTo(x, yTop);
          }
        });
        for (let idx = pts.length - 1; idx >= 0; idx--) {
          const x = (idx / (pts.length - 1)) * width;
          const yBot = toYPixel(pts[idx].yRef - pts[idx].epsilon);
          ctx.lineTo(x, yBot);
        }
        ctx.closePath();
        ctx.fill();

        // 2. Draw Reference Target Waveform (dotted emerald line)
        ctx.strokeStyle = theme === 'light' ? '#059669' : '#10b981';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        pts.forEach((p, idx) => {
          const x = (idx / (pts.length - 1)) * width;
          const y = toYPixel(p.yRef);
          if (idx === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });
        ctx.stroke();
        ctx.setLineDash([]); // clear dash
      }

      // 3. Draw Actual Measured Response
      ctx.strokeStyle = sIdx === 0 
        ? (theme === 'light' ? '#d97706' : '#f59e0b') 
        : (sIdx === 1 ? (theme === 'light' ? '#0284c7' : '#38bdf8') : (theme === 'light' ? '#c026d3' : '#ec4899'));
      ctx.lineWidth = sIdx === 0 ? 2.5 : 2.0;
      
      // Glow effect for main signal in dark mode
      if (sIdx === 0 && theme === 'dark') {
        ctx.shadowColor = '#d97706';
        ctx.shadowBlur = 4;
      }

      ctx.beginPath();
      pts.forEach((p, idx) => {
        const x = (idx / (pts.length - 1)) * width;
        const yVal = p.signals?.[sigId] ?? 0.0;
        const y = toYPixel(yVal);
        if (idx === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();
      ctx.shadowBlur = 0; // reset shadow

      // 4. Draw scales and labels (Y-axis numbers along the grid rows)
      ctx.font = '8px JetBrains Mono, monospace';
      for (let j = 0; j <= rowsPerSub; j++) {
        const y = yStart + (subHeight / rowsPerSub) * j;
        const val = yMax - (j / rowsPerSub) * yRange;
        ctx.fillStyle = theme === 'light' ? '#334155' : 'rgba(148, 163, 184, 0.8)';
        ctx.textAlign = 'left';
        ctx.fillText(val.toFixed(2), 6, y + (j === 0 ? 9 : (j === rowsPerSub ? -3 : 3)));
      }

      // Legend indicators
      ctx.textAlign = 'right';
      if (sIdx === 0) {
        ctx.fillStyle = theme === 'light' ? '#059669' : '#10b981';
        ctx.fillText('● TARGET REF', width - 8, yStart + 12);
        ctx.fillStyle = theme === 'light' ? '#d97706' : '#f59e0b';
        ctx.fillText(`● MEASURED (${sigId})`, width - 8, yStart + 24);
      } else {
        ctx.fillStyle = sIdx === 1 ? (theme === 'light' ? '#0284c7' : '#38bdf8') : (theme === 'light' ? '#c026d3' : '#ec4899');
        ctx.fillText(`● SUBPLOT: ${sigId}`, width - 8, yStart + 12);
      }
    }

    // 5. Draw bottom X-axis time numbers (time calibration)
    const tStart = pts[0].tSim;
    const tEnd = pts[pts.length - 1].tSim;
    const tRange = tEnd - tStart;
    ctx.fillStyle = theme === 'light' ? '#334155' : '#64748b';
    ctx.font = '8px JetBrains Mono, monospace';
    for (let i = 0; i <= cols; i++) {
      const x = (width / cols) * i;
      const tVal = tStart + (i / cols) * tRange;
      ctx.textAlign = i === 0 ? 'left' : (i === cols ? 'right' : 'center');
      let label = '';
      if (tEnd < 0.1) {
        label = `${(tVal * 1000).toFixed(2)} ms`;
      } else {
        label = `${tVal.toFixed(4)} s`;
      }
      ctx.fillText(label, x + (i === 0 ? 6 : (i === cols ? -6 : 0)), height - 4);
    }
  };

  // Trigger redraw of the oscilloscope when viewing preferences change (e.g., zoom, sensor)
  useEffect(() => {
    drawOscilloscope();
  }, [visiblePoints, zoomMultiplier, selectedSensor, numSubplots, subplot2Signal, subplot3Signal, tolerance, refType, refFreq, refAmp, refOffset, updateTrigger, theme]);

  return (
    <div className={`min-h-screen ${theme === 'light' ? 'bg-slate-100 text-slate-900' : 'bg-[#090d16] text-[#e2e8f0]'} font-sans antialiased transition-colors duration-200`}>
      {/* Decorative Top Accent Glow */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-amber-500 to-sky-500 shadow-lg shadow-emerald-500/20" />

      {/* Header Panel */}
      <header className={`border-b ${theme === 'light' ? 'bg-white/95 border-slate-200 text-slate-900 shadow-sm' : 'bg-[#0d1527]/90 border-[#1e293b] text-white'} px-6 py-4 backdrop-blur-sm`}>
        <div className="w-full max-w-none px-2 lg:px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={onBack}
              className={`flex items-center justify-center p-2 rounded-lg ${
                theme === 'light' 
                  ? 'bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-700' 
                  : 'bg-[#142038] hover:bg-[#1a2d52] border border-[#1e293b] text-gray-400'
              } transition-all`}
              title="Return to Creator Mode"
              id="back_to_creator"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">GAME ENGINE</span>
                <span className={`text-xs ${theme === 'light' ? 'text-amber-600' : 'text-amber-400'} font-mono font-bold`}>ALPHA SPEED DILATION</span>
              </div>
              <h1 className={`text-xl font-bold tracking-tight ${theme === 'light' ? 'text-slate-900' : 'text-white'} font-sans mt-0.5`}>Interactive Switch Trigger Challenge</h1>
            </div>
          </div>

          {/* Challenge Template & Core Level Actions */}
          <div className="flex items-center gap-4">
            {/* Template Select Dropdown */}
            <div className="flex flex-col gap-0.5">
              <span className={`text-[9px] font-mono font-bold ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'} uppercase tracking-wider`}>CHALLENGE TEMPLATE</span>
              <select
                value={activeTemplateKey}
                onChange={(e) => {
                  const key = e.target.value;
                  setActiveTemplateKey(key);
                  loadGameTemplate(key);
                }}
                className={`${
                  theme === 'light'
                    ? 'bg-slate-100 border-slate-300 text-slate-900 hover:border-sky-500'
                    : 'bg-[#142038] border-[#3b82f6]/30 text-white hover:border-sky-400/50'
                } rounded-lg text-xs font-mono px-3 py-2 outline-none cursor-pointer transition-all focus:border-sky-500`}
              >
                {activeTemplateKey === 'custom' && (
                  <option value="custom">Custom Circuit (from Editor)</option>
                )}
                {Object.keys(CIRCUITS_TEMPLATES).filter(key => key !== 'empty').map(key => (
                  <option key={key} value={key}>
                    {CIRCUITS_TEMPLATES[key].name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              {/* Theme Toggle Button */}
              <button
                type="button"
                onClick={handleThemeToggle}
                className={`p-2.5 rounded-lg border text-xs font-semibold transition-all active:scale-95 cursor-pointer ${
                  theme === 'light'
                    ? 'bg-amber-500/10 text-amber-600 border-amber-500/30 hover:bg-amber-500/20'
                    : 'bg-[#142038] text-amber-400 border-[#1e293b] hover:border-amber-400/50'
                }`}
                title={`Switch to ${theme === 'light' ? 'Dark' : 'Light'} Mode`}
                id="game_theme_toggle_btn"
              >
                {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </button>

              <button
                type="button"
                onClick={() => {
                  const nextVal = !showSidebar;
                  setShowSidebar(nextVal);
                  if (!nextVal) {
                    setHiddenSplitRatio(6);
                  }
                }}
                className={`flex items-center gap-2 px-3.5 py-2.5 rounded-lg border text-xs font-semibold font-mono transition-all active:scale-95 cursor-pointer ${
                  showSidebar 
                    ? 'bg-sky-500/15 text-sky-500 border-sky-500/30 hover:bg-sky-500/25' 
                    : (theme === 'light' ? 'bg-slate-100 text-slate-700 border-slate-300 hover:text-slate-900' : 'bg-[#142038] text-gray-400 border-[#1e293b] hover:text-white')
                }`}
                title="Toggle Adjustments Sidebar"
                id="toggle_sidebar_btn"
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span>{showSidebar ? 'Hide Controls' : 'Show Controls'}</span>
              </button>

              {/* Layout Configuration Toggle Button */}
              <button
                onClick={() => setViewLayoutMode(prev => prev === 'side-by-side' ? 'stacked' : 'side-by-side')}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-semibold font-mono transition-all active:scale-95 cursor-pointer ${
                  viewLayoutMode === 'side-by-side'
                    ? (theme === 'light' ? 'bg-sky-50 text-sky-700 border-sky-300 hover:bg-sky-100' : 'bg-sky-500/15 text-sky-400 border-sky-500/30 hover:bg-sky-500/25')
                    : (theme === 'light' ? 'bg-indigo-50 text-indigo-700 border-indigo-300 hover:bg-indigo-100' : 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/25')
                }`}
                title="Toggle between Side-by-Side and Stacked Layout Configurations"
                id="toggle_layout_config_btn"
              >
                {viewLayoutMode === 'side-by-side' ? (
                  <>
                    <Columns className="h-4 w-4 text-sky-500" />
                    <span>Side-by-Side Layout</span>
                  </>
                ) : (
                  <>
                    <Rows className="h-4 w-4 text-indigo-500" />
                    <span>Stacked Layout</span>
                  </>
                )}
              </button>

              {!showSidebar && (
                <div className={`flex items-center gap-2 ${theme === 'light' ? 'bg-white border-slate-200' : 'bg-[#111827]/80 border-[#1e293b]'} border rounded-lg px-2.5 py-1.5 shadow-md`}>
                  <span className={`text-[10px] font-mono ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'} uppercase font-bold tracking-wider`}>Split:</span>
                  <div className="flex items-center gap-1">
                    {[
                      { label: "Wide Scope", val: 8 },
                      { label: "Equal", val: 6 },
                      { label: "Wide Circuit", val: 4 }
                    ].map((opt) => (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => setHiddenSplitRatio(opt.val)}
                        className={`px-2 py-1 rounded text-[10px] font-mono font-bold transition-all cursor-pointer ${
                          hiddenSplitRatio === opt.val
                            ? 'bg-sky-500 text-white shadow-sm'
                            : (theme === 'light' ? 'bg-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100' : 'bg-transparent text-gray-400 hover:text-white hover:bg-[#1a2e48]')
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <div className={`h-4 w-[1px] ${theme === 'light' ? 'bg-slate-300' : 'bg-gray-800'} mx-1`} />
                  <input
                    type="range"
                    min={2}
                    max={10}
                    step={1}
                    value={hiddenSplitRatio}
                    onChange={(e) => setHiddenSplitRatio(parseInt(e.target.value))}
                    className={`w-20 accent-sky-500 ${theme === 'light' ? 'bg-slate-200' : 'bg-[#1e293b]'} cursor-pointer h-1.5 rounded-lg`}
                    title={`Oscilloscope width: ${Math.round((hiddenSplitRatio / 12) * 100)}%`}
                  />
                  <span className="text-[10px] font-mono font-semibold text-sky-500 w-8 text-right">
                    {hiddenSplitRatio}:{12 - hiddenSplitRatio}
                  </span>
                </div>
              )}

              {!isPlaying ? (
                <button 
                  onClick={startGame}
                  className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-semibold px-5 py-2.5 rounded-lg shadow-md hover:shadow-emerald-500/20 transition-all active:scale-95"
                  id="start_game_btn"
                >
                  <Play className="h-4 w-4" /> Start Challenge
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button 
                    onClick={togglePause}
                    className={`flex items-center gap-2 ${
                      theme === 'light' 
                        ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300' 
                        : 'bg-[#1a2e48] hover:bg-[#254166] text-[#e2e8f0] border-[#3b82f6]/30'
                    } font-semibold px-4 py-2.5 rounded-lg border transition-all active:scale-95`}
                    id="pause_game_btn"
                  >
                    <Pause className="h-4 w-4" /> {isPaused ? 'Resume' : 'Pause'}
                  </button>
                  <button 
                    onClick={stopGame}
                    className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold px-4 py-2.5 rounded-lg shadow-md transition-all active:scale-95"
                    id="stop_game_btn"
                  >
                    <RotateCcw className="h-4 w-4" /> Reset
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="w-full max-w-none px-4 lg:px-8 py-6 space-y-6">
        
        {/* Real-time Scoring Bento Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          
          <div className={`${theme === 'light' ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#111827]/70 border-[#1e293b]'} border rounded-xl p-4 flex flex-col justify-between hover:border-sky-500/40 transition-all`}>
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>Match Accuracy</span>
              <Target className="h-4 w-4 text-sky-500" />
            </div>
            <div className="mt-2">
              <span className={`text-3xl font-extrabold font-mono ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>{rollingAccuracy}%</span>
              <p className={`text-[10px] ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'} mt-1`}>Rolling match rate</p>
            </div>
          </div>

          <div className={`${theme === 'light' ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#111827]/70 border-[#1e293b]'} border rounded-xl p-4 flex flex-col justify-between hover:border-emerald-500/40 transition-all`}>
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>Current Streak</span>
              <Flame className="h-4 w-4 text-emerald-500 animate-pulse" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className={`text-3xl font-extrabold font-mono ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>{activeStreak.toFixed(2)}</span>
              <span className={`text-xs ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'} font-mono`}>sec</span>
            </div>
            <p className={`text-[10px] ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'} mt-1`}>Need 10.00s simulation time</p>
          </div>

          <div className={`${theme === 'light' ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#111827]/70 border-[#1e293b]'} border rounded-xl p-4 flex flex-col justify-between hover:border-amber-500/40 transition-all`}>
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>Max Streak</span>
              <Award className="h-4 w-4 text-amber-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className={`text-3xl font-extrabold font-mono ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>{maxStreak.toFixed(2)}</span>
              <span className={`text-xs ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'} font-mono`}>sec</span>
            </div>
            <p className={`text-[10px] ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'} mt-1`}>Best continuous track time</p>
          </div>

          <div className={`${theme === 'light' ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#111827]/70 border-[#1e293b]'} border rounded-xl p-4 flex flex-col justify-between hover:border-purple-500/40 transition-all`}>
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>Switch Toggles</span>
              <Zap className="h-4 w-4 text-purple-500" />
            </div>
            <div className="mt-2">
              <span className={`text-3xl font-extrabold font-mono ${theme === 'light' ? 'text-slate-900' : 'text-white'}`}>{switchToggles}</span>
              <p className={`text-[10px] ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'} mt-1`}>Total human keystrokes</p>
            </div>
          </div>

          <div className={`${theme === 'light' ? 'bg-white border-slate-200 shadow-sm' : 'bg-[#111827]/70 border-[#1e293b]'} border rounded-xl p-4 col-span-2 lg:col-span-1 flex flex-col justify-between hover:border-pink-500/40 transition-all`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Switching Freq</span>
              <SlidersHorizontal className="h-4 w-4 text-pink-400" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-extrabold font-mono text-white">{averageSwitchFreq}</span>
              <span className="text-xs text-gray-400 font-mono">Hz</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">Average toggle rate</p>
          </div>

        </div>

        {/* Primary Simulation Area */}
        <div className={viewLayoutMode === 'side-by-side' ? "flex flex-row gap-6 w-full min-w-0 items-start overflow-x-auto pb-2" : "flex flex-col gap-6 w-full min-w-0"}>
          
          {/* Column 1: Oscilloscope Plot */}
          <div className={viewLayoutMode === 'side-by-side' ? "flex-1 min-w-[320px] space-y-6" : "w-full space-y-6"}>
            
            {/* Real-time Canvas Scope */}
            <div className={`${theme === 'light' ? 'bg-white border-slate-200 shadow-md' : 'bg-[#0b0f19] border-[#1e293b]'} border rounded-xl overflow-hidden shadow-xl`}>
              <div className={`${theme === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-[#111827]/95 border-[#1e293b]'} px-4 py-3 flex items-center justify-between border-b`}>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
                  <span className={`text-xs font-bold ${theme === 'light' ? 'text-slate-800' : 'text-gray-300'} uppercase tracking-wider`}>REAL-TIME SCROLLING OSCILLOSCOPE</span>
                </div>
                <div className={`text-xs ${theme === 'light' ? 'text-slate-600' : 'text-gray-400'} font-mono`}>
                  Sim Time: <span className={`${theme === 'light' ? 'text-slate-900' : 'text-white'} font-bold`}>{simTimeRef.current.toFixed(4)}s</span>
                </div>
              </div>
              <div className="p-1">
                <canvas 
                  ref={canvasRef} 
                  width={680} 
                  height={numSubplots === 1 ? 480 : (numSubplots === 2 ? 580 : 660)} 
                  style={{ height: numSubplots === 1 ? 480 : (numSubplots === 2 ? 580 : 660) }}
                  className={`w-full ${theme === 'light' ? 'bg-slate-50' : 'bg-[#0b0f19]'} block rounded-lg transition-all`}
                />
              </div>

              {/* Interactive Signals Selector Bar */}
              <div className={`${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-[#0e1626] border-[#1e293b]'} border-t p-3 space-y-3`}>
                {/* Mode Selector Tabs */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] font-bold ${theme === 'light' ? 'text-slate-600' : 'text-gray-400'} uppercase tracking-wider font-mono`}>PLOTTING SIGNAL:</span>
                    <span className="text-xs font-mono font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                      {selectedSensor}
                    </span>
                  </div>
                  
                  {/* Tabs: Selected Comp Signals vs All Signals */}
                  <div className={`flex items-center gap-1.5 ${theme === 'light' ? 'bg-slate-200 border-slate-300' : 'bg-[#111c30] border-[#1e293b]'} p-0.5 rounded-lg border`}>
                    <button
                      type="button"
                      onClick={() => setSignalTab('component')}
                      className={`px-2 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                        signalTab === 'component'
                          ? 'bg-amber-500 text-black shadow'
                          : (theme === 'light' ? 'text-slate-700 hover:text-slate-900' : 'text-gray-400 hover:text-white')
                      }`}
                    >
                      Selected Component
                    </button>
                    <button
                      type="button"
                      onClick={() => setSignalTab('all')}
                      className={`px-2 py-1 rounded text-[10px] font-bold transition-all cursor-pointer ${
                        signalTab === 'all'
                          ? 'bg-amber-500 text-black shadow'
                          : (theme === 'light' ? 'text-slate-700 hover:text-slate-900' : 'text-gray-400 hover:text-white')
                      }`}
                    >
                      All Signals
                    </button>
                  </div>
                </div>

                {/* Signals Badges List */}
                <div className={`${theme === 'light' ? 'bg-white border-slate-200' : 'bg-[#0b0f19]/80 border-[#1e293b]'} border p-2.5 rounded-lg max-h-[120px] overflow-y-auto custom-scrollbar`}>
                  {/* Selected Component Header if on component tab */}
                  {signalTab === 'component' && (
                    <div className={`flex items-center justify-between mb-2 pb-1 border-b ${theme === 'light' ? 'border-slate-200' : 'border-[#1e293b]/50'}`}>
                      <div className={`text-[10px] ${theme === 'light' ? 'text-slate-600' : 'text-gray-400'} font-mono`}>
                        Showing signals for:{' '}
                        <span className={`font-bold ${theme === 'light' ? 'bg-slate-200 text-slate-900' : 'bg-slate-800 text-white'} px-1.5 py-0.5 rounded`}>
                          {selectedCompId || '(Click any schematic component below!)'}
                        </span>
                      </div>
                      {selectedCompId && (
                        <button
                          type="button"
                          onClick={() => setSelectedCompId(null)}
                          className="text-[9px] text-red-500 hover:text-red-600 font-mono underline"
                        >
                          Clear Selection
                        </button>
                      )}
                    </div>
                  )}

                  {/* List of Signals */}
                  <div className="flex flex-wrap gap-1.5">
                    {(() => {
                      const compObj = state.components.find((c: any) => c.id === selectedCompId);
                      const displayedSignals = signalTab === 'component' 
                        ? getComponentSignals(compObj)
                        : getAllAvailableSignals(state.components);

                      if (displayedSignals.length === 0) {
                        return (
                          <span className={`text-[10px] ${theme === 'light' ? 'text-slate-500' : 'text-gray-500'} italic font-mono p-1`}>
                            {signalTab === 'component' 
                              ? 'Click any component on the schematic to view its voltages, currents or control outputs!' 
                              : 'No active simulation signals detected.'}
                          </span>
                        );
                      }

                      return displayedSignals.map((sig) => {
                        const isPlotted = selectedSensor === sig.id;
                        let typeColor = 'text-blue-500 border-blue-500/20 bg-blue-500/5';
                        if (sig.type === 'voltage') typeColor = 'text-amber-500 border-amber-500/20 bg-amber-500/5';
                        if (sig.type === 'current') typeColor = 'text-pink-500 border-pink-500/20 bg-pink-500/5';

                        return (
                          <button
                            key={sig.id}
                            type="button"
                            onClick={() => {
                              setSelectedSensor(sig.id);
                              if (sig.compId) {
                                  setSelectedCompId(sig.compId);
                              }
                            }}
                            className={`px-2 py-1 rounded border text-[10px] font-mono transition-all flex items-center gap-1 cursor-pointer hover:scale-[1.02] ${
                              isPlotted
                                ? 'bg-amber-500 text-black border-amber-400 font-bold shadow-md shadow-amber-500/10 animate-pulse'
                                : (theme === 'light' ? 'text-slate-800 bg-slate-100 border-slate-300 hover:border-slate-500' : 'text-gray-300 bg-[#111d33] border-[#1e293b] hover:border-gray-500')
                            }`}
                          >
                            <span className={`text-[8px] font-bold uppercase tracking-wider ${isPlotted ? 'text-black' : typeColor}`}>
                              {sig.type === 'voltage' ? '⚡ V' : sig.type === 'current' ? '📈 I' : '⚙️ S'}
                            </span>
                            <span>{sig.id}</span>
                          </button>
                        );
                      });
                    })()}
                  </div>
                </div>

                {/* Manual Trigger Overrides Block */}
                {(() => {
                  const selectedCompTriggers = selectedCompId
                    ? keyTriggers.filter((t: any) => t.id === selectedCompId || (t.parameters?.controlled_switch === selectedCompId))
                    : keyTriggers;

                  if (selectedCompTriggers.length === 0) return null;

                  return (
                    <div className="bg-[#142035]/80 border border-emerald-500/20 p-2.5 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-bold text-emerald-400 font-mono uppercase tracking-wider flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                          MANUAL TRIGGER BLOCK CONTROL: {selectedCompTriggers[0].id}
                        </span>
                        <p className="text-[10px] text-gray-400">
                          Manually toggle or press triggers here instead of using the physical keyboard.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {selectedCompTriggers.map((trig: any) => {
                          const isActive = toggleStatesRef.current[trig.id] === true;
                          const keyChar = trig.parameters?.key || 'Space';
                          const isToggle = trig.parameters?.toggle_mode === 'true';

                          return (
                            <div key={trig.id} className="flex items-center gap-1.5">
                              {isToggle ? (
                                <button
                                  type="button"
                                  onClick={() => handleBadgeClick(trig.id)}
                                  className={`px-4 py-1.5 rounded-lg font-mono text-xs font-bold border transition-all cursor-pointer shadow active:scale-95 flex items-center gap-1.5 ${
                                    isActive
                                      ? 'bg-emerald-500 text-black border-emerald-400 hover:bg-emerald-400 shadow-emerald-500/20 animate-pulse'
                                      : 'bg-[#182640] text-gray-400 border-slate-700 hover:text-white hover:border-slate-500'
                                  }`}
                                >
                                  <span>{trig.id} ({keyChar})</span>
                                  <span>{isActive ? 'ON' : 'OFF'}</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onMouseDown={() => {
                                    if (!isPlaying || isPaused) return;
                                    switchTogglesCountRef.current += 1;
                                    setSwitchToggles(switchTogglesCountRef.current);
                                    toggleStatesRef.current[trig.id] = true;
                                    if (simRef.current) {
                                      const activeVal = parseFloat(trig.parameters?.active_value || '1.0');
                                      simRef.current.key_trigger_states[trig.id] = activeVal;
                                    }
                                    setKeyTriggers([...keyTriggers]);
                                  }}
                                  onMouseUp={() => {
                                    if (!isPlaying || isPaused) return;
                                    toggleStatesRef.current[trig.id] = false;
                                    if (simRef.current) {
                                      const inactiveVal = parseFloat(trig.parameters?.inactive_value || '0.0');
                                      simRef.current.key_trigger_states[trig.id] = inactiveVal;
                                    }
                                    setKeyTriggers([...keyTriggers]);
                                  }}
                                  onMouseLeave={() => {
                                    if (toggleStatesRef.current[trig.id]) {
                                      toggleStatesRef.current[trig.id] = false;
                                      if (simRef.current) {
                                        const inactiveVal = parseFloat(trig.parameters?.inactive_value || '0.0');
                                        simRef.current.key_trigger_states[trig.id] = inactiveVal;
                                      }
                                      setKeyTriggers([...keyTriggers]);
                                    }
                                  }}
                                  className={`px-4 py-1.5 rounded-lg font-mono text-xs font-bold border transition-all cursor-pointer shadow active:scale-95 ${
                                    isActive
                                      ? 'bg-emerald-500 text-black border-emerald-400 shadow-lg animate-pulse'
                                      : 'bg-[#182640] text-gray-400 border-slate-700 hover:text-white hover:border-slate-500'
                                  }`}
                                >
                                  {trig.id} ({keyChar}): HOLD ON
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Column 2: Live Circuit Current Flow & Triggers Interface */}
          <div className={viewLayoutMode === 'side-by-side' ? "flex-1 min-w-[320px] space-y-6" : "w-full space-y-6"}>

            {/* Schematic Canvas Overlays */}
            <div className={`${theme === 'light' ? 'bg-white border-slate-200 shadow-md' : 'bg-[#111827]/70 border-[#1e293b]'} border rounded-xl p-5 relative overflow-hidden flex flex-col justify-between shadow-xl`}>
              
              <div className={`border-b ${theme === 'light' ? 'border-slate-200' : 'border-[#1e293b]'} pb-3 mb-4 flex flex-wrap items-center justify-between gap-3`}>
                <div className="min-w-[200px] flex-1">
                  <h3 className={`text-sm font-bold ${theme === 'light' ? 'text-slate-900' : 'text-white'} flex items-center gap-2 whitespace-nowrap`}>
                    <Activity className="h-4 w-4 text-emerald-500 shrink-0" />
                    <span>LIVE CIRCUITS TRIGGERS INTERFACE</span>
                  </h3>
                  <p className={`text-[11px] ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'} mt-0.5 leading-snug`}>
                    Click glowing badges directly on key components, use schematic zoom controls, or press physical keys.
                  </p>
                </div>

                {/* Schematic Zoom Toolbar */}
                <div className={`flex items-center gap-1.5 ${theme === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-[#142038] border-[#1e293b]'} border rounded-lg p-1 shrink-0`}>
                  <span className={`text-[10px] font-mono font-bold ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'} px-1.5 uppercase`}>Zoom:</span>
                  
                  <button
                    type="button"
                    onClick={() => setSchematicZoom((z) => Math.max(0.4, Math.min(3.5, z - 0.15)))}
                    className={`p-1 rounded ${theme === 'light' ? 'hover:bg-slate-200 text-slate-700' : 'hover:bg-[#1a2d52] text-gray-300'} transition-all`}
                    title="Zoom Out Schematic"
                    id="schematic_zoom_out_btn"
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSchematicZoom(1.0);
                      setPanOffset({ x: 0, y: 0 });
                    }}
                    className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded ${
                      schematicZoom === 1.0 && panOffset.x === 0 && panOffset.y === 0
                        ? 'bg-sky-500 text-white' 
                        : (theme === 'light' ? 'bg-slate-200 text-slate-800 hover:bg-slate-300' : 'bg-[#1e293b] text-gray-300 hover:bg-slate-800')
                    } transition-all`}
                    title="Reset Zoom to 100%"
                    id="schematic_zoom_reset_btn"
                  >
                    {Math.round(schematicZoom * 100)}%
                  </button>

                  <button
                    type="button"
                    onClick={() => setSchematicZoom((z) => Math.max(0.4, Math.min(3.5, z + 0.15)))}
                    className={`p-1 rounded ${theme === 'light' ? 'hover:bg-slate-200 text-slate-700' : 'hover:bg-[#1a2d52] text-gray-300'} transition-all`}
                    title="Zoom In Schematic"
                    id="schematic_zoom_in_btn"
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </button>

                  <div className={`h-4 w-[1px] ${theme === 'light' ? 'bg-slate-300' : 'bg-slate-700'} mx-0.5 hidden xl:block`} />

                  <div className="hidden xl:flex items-center gap-1">
                    {[0.75, 1.0, 1.25, 1.5, 2.0, 2.5].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setSchematicZoom(preset);
                          if (preset === 1.0) setPanOffset({ x: 0, y: 0 });
                        }}
                        className={`px-1.5 py-0.5 text-[9px] font-mono font-bold rounded transition-all ${
                          schematicZoom === preset
                            ? 'bg-sky-500 text-white'
                            : (theme === 'light' ? 'text-slate-600 hover:bg-slate-200' : 'text-gray-400 hover:bg-[#1e293b]')
                        }`}
                      >
                        {preset}x
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Read-Only Schematic Overlay Viewport */}
              <div 
                className={`relative min-h-[540px] h-[580px] ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-[#0b0f19] border-[#1e293b]'} border rounded-lg overflow-hidden p-4 flex items-center justify-center select-none ${isPanning ? 'cursor-grabbing' : (schematicZoom > 1.0 ? 'cursor-grab' : 'cursor-default')}`}
                onWheel={(e) => {
                  e.preventDefault();
                  const delta = e.deltaY < 0 ? 0.15 : -0.15;
                  setSchematicZoom((z) => Math.max(0.4, Math.min(3.5, parseFloat((z + delta).toFixed(2)))));
                }}
                onMouseDown={(e) => {
                  if (e.button === 0) {
                    setIsPanning(true);
                    setPanStart({ x: e.clientX, y: e.clientY });
                  }
                }}
                onMouseMove={(e) => {
                  if (isPanning) {
                    const dx = e.clientX - panStart.x;
                    const dy = e.clientY - panStart.y;
                    setPanStart({ x: e.clientX, y: e.clientY });
                    const scaleFactor = scaledWidth / 500;
                    setPanOffset((prev) => ({
                      x: prev.x - dx * scaleFactor,
                      y: prev.y - dy * scaleFactor
                    }));
                  }
                }}
                onMouseUp={() => setIsPanning(false)}
                onMouseLeave={() => setIsPanning(false)}
                onTouchStart={(e) => {
                  if (e.touches.length === 1) {
                    setIsPanning(true);
                    setPanStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
                  }
                }}
                onTouchMove={(e) => {
                  if (isPanning && e.touches.length === 1) {
                    const dx = e.touches[0].clientX - panStart.x;
                    const dy = e.touches[0].clientY - panStart.y;
                    setPanStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
                    const scaleFactor = scaledWidth / 500;
                    setPanOffset((prev) => ({
                      x: prev.x - dx * scaleFactor,
                      y: prev.y - dy * scaleFactor
                    }));
                  }
                }}
                onTouchEnd={() => setIsPanning(false)}
              >
                
                {/* SVG Render viewport */}
                <svg 
                  className="absolute inset-0 w-full h-full"
                  viewBox={effectiveViewBox}
                  style={{ pointerEvents: 'auto' }}
                >
                  <defs>
                    <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill={theme === 'light' ? '#64748b' : '#475569'} />
                    </marker>
                  </defs>

                  <style>{`
                    @keyframes currentFlow {
                      from {
                        stroke-dashoffset: 20;
                      }
                      to {
                        stroke-dashoffset: 0;
                      }
                    }
                    .current-flow-path {
                      stroke-dasharray: 4, 8;
                      animation: currentFlow 0.8s linear infinite;
                    }
                  `}</style>

                  {/* 1. Draw Wires */}
                  {state.wires.map((wire: any) => {
                    const pathPts = getWirePath(wire);
                    const pathStr = pathToString(pathPts);
                    const isControl = getWireDomain(wire) === 'control';

                    // Draw dynamic high-fidelity current flow dots driven by the simulation values
                    const flowDots: React.ReactNode[] = [];
                    const lastPt = pointsHistoryRef.current[pointsHistoryRef.current.length - 1];

                    if (!isControl && isPlaying && !isPaused) {
                      const segs = getSegmentsForWire(wire, state.wires);
                      if (segs.length === 0) {
                        const wireVal = getWireCurrent(wire.id, lastPt);
                        if (Math.abs(wireVal) >= 1e-3) {
                          const totalLength = pathPts.reduce((acc, p, i) => {
                            if (i === 0) return 0;
                            const prev = pathPts[i - 1];
                            return acc + Math.hypot(p.x - prev.x, p.y - prev.y);
                          }, 0);
                          if (totalLength > 0) {
                            const spacing = 32;
                            const numDots = Math.max(1, Math.floor(totalLength / spacing));
                            const currentOffset = wireOffsetsRef.current[`direct_wire_${wire.id}`] || 0.0;
                            for (let dIdx = 0; dIdx < numDots; dIdx++) {
                              let d = (dIdx * spacing + currentOffset) % totalLength;
                              if (d < 0) d += totalLength;
                              const pt = getPointAtLengthWithOffset(pathPts, d, 0);
                              if (pt) {
                                flowDots.push(
                                  <circle
                                    key={`wire-dot-${wire.id}-${dIdx}`}
                                    cx={pt.x}
                                    cy={pt.y}
                                    r="3.5"
                                    fill="#10b981"
                                    className="pointer-events-none animate-pulse"
                                    style={{
                                      filter: "drop-shadow(0px 0px 3px rgba(16,185,129,0.9))",
                                      opacity: 0.95
                                    }}
                                  />
                                );
                              }
                            }
                          }
                        }
                      } else {
                        segs.forEach((seg, sIdx) => {
                          const wireVal = getWireCurrent(seg.segmentId, lastPt) || getWireCurrent(wire.id, lastPt);
                          if (Math.abs(wireVal) >= 1e-3) {
                            const pathPoints = seg.path;
                            const totalLength = pathPoints.reduce((acc, p, i) => {
                              if (i === 0) return 0;
                              const prev = pathPoints[i - 1];
                              return acc + Math.hypot(p.x - prev.x, p.y - prev.y);
                            }, 0);
                            if (totalLength > 0) {
                              const spacing = 32;
                              const numDots = Math.max(1, Math.floor(totalLength / spacing));
                              const currentOffset = wireOffsetsRef.current[`direct_wire_${seg.segmentId}`] || wireOffsetsRef.current[`direct_wire_${wire.id}`] || 0.0;
                              for (let dIdx = 0; dIdx < numDots; dIdx++) {
                                let d = (dIdx * spacing + currentOffset) % totalLength;
                                if (d < 0) d += totalLength;
                                const pt = getPointAtLengthWithOffset(pathPoints, d, 0);
                                if (pt) {
                                  flowDots.push(
                                    <circle
                                      key={`wire-dot-${seg.segmentId}-${sIdx}-${dIdx}`}
                                      cx={pt.x}
                                      cy={pt.y}
                                      r="3.5"
                                      fill="#10b981"
                                      className="pointer-events-none animate-pulse"
                                      style={{
                                        filter: "drop-shadow(0px 0px 3px rgba(16,185,129,0.9))",
                                        opacity: 0.95
                                      }}
                                    />
                                  );
                                }
                              }
                            }
                          }
                        });
                      }
                    }

                    return (
                      <g key={wire.id}>
                        <path 
                          d={pathStr}
                          fill="none"
                          stroke={isControl ? '#10b981' : (theme === 'light' ? '#334155' : '#475569')}
                          strokeWidth={isControl ? 1.5 : 2}
                          opacity={0.85}
                        />
                        {flowDots}
                      </g>
                    );
                  })}

                  {/* 2. Draw Components */}
                  {state.components.map((comp: any) => {
                    const rawSVG = getComponentSVG(comp);
                    const isSelected = selectedCompId === comp.id;

                    const lastPt = pointsHistoryRef.current[pointsHistoryRef.current.length - 1];
                    let compCurrent = 0.0;
                    if (isPlaying && !isPaused && lastPt && lastPt.signals) {
                      if (lastPt.signals[`I_${comp.id}`] !== undefined) {
                        compCurrent = lastPt.signals[`I_${comp.id}`];
                      } else if (comp.type === 'Resistor' || comp.type === 'R') {
                        const vVal = lastPt.signals[`V_${comp.id}`] ?? 0.0;
                        const rVal = parseFloat(comp.parameters?.value || comp.parameters?.resistance || comp.parameters?.r || "1.0") || 1.0;
                        compCurrent = vVal / rVal;
                      }
                    }

                    const internalPath = getComponentInternalPath(comp);
                    const internalFlowDots: React.ReactNode[] = [];
                    if (internalPath && Math.abs(compCurrent) > 1e-3) {
                      const { p1, p2 } = internalPath;
                      const dx = p2.x - p1.x;
                      const dy = p2.y - p1.y;
                      const totalLength = Math.sqrt(dx * dx + dy * dy);
                      
                      if (totalLength > 0) {
                        const spacing = 18;
                        const numDots = Math.max(1, Math.floor(totalLength / spacing));
                        const currentOffset = wireOffsetsRef.current[`comp_internal_${comp.id}`] || 0.0;
                        const dotColor = "#10b981";

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
                              key={`comp-dot-${comp.id}-${dIdx}`}
                              cx={pt.x}
                              cy={pt.y}
                              r="3.5"
                              fill={dotColor}
                              className="pointer-events-none animate-pulse"
                              style={{
                                filter: "drop-shadow(0px 0px 3px rgba(16,185,129,0.9))",
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
                        style={{ cursor: 'pointer' }}
                        color={theme === 'light' ? '#1e293b' : '#e2e8f0'}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCompId(comp.id);
                          setSignalTab('component');
                          const compSigs = getComponentSignals(comp);
                          if (compSigs.length > 0) {
                            setSelectedSensor(compSigs[0].id);
                          }
                        }}
                      >
                        {/* Invisible bounding hitbox for easy component selection clicks */}
                        <rect
                          x={-36}
                          y={-36}
                          width={72}
                          height={72}
                          fill="rgba(0,0,0,0.001)"
                          className="cursor-pointer"
                        />
                        {/* Selected highlight focus circle / rotating dash border */}
                        {isSelected && (
                          <rect
                            x={-32}
                            y={-32}
                            width={64}
                            height={64}
                            fill="rgba(59, 130, 246, 0.08)"
                            stroke="#3b82f6"
                            strokeWidth={2}
                            strokeDasharray="4,3"
                            rx={8}
                            className="animate-[spin_12s_linear_infinite]"
                          />
                        )}
                        <g dangerouslySetInnerHTML={{ __html: rawSVG }} />
                        {internalFlowDots}
                        
                        {/* Clear component text label overlay */}
                        <text
                          x={0}
                          y={-24}
                          textAnchor="middle"
                          className={`text-[9px] font-mono font-black select-none ${
                            isSelected 
                              ? 'fill-sky-500 font-extrabold' 
                              : (theme === 'light' ? 'fill-slate-800 font-bold' : 'fill-gray-400')
                          }`}
                        >
                          {comp.id}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {/* 3. HTML Absolute-Overlay Badges for KEY_TRIGGER blocks */}
                <div className="absolute inset-0 pointer-events-none">
                  {keyTriggers.map((trig: any) => {
                    const isActive = toggleStatesRef.current[trig.id] === true;
                    const keyChar = trig.parameters?.key || 'Space';
                    const activeVal = trig.parameters?.active_value || '1.0';
                    const isToggle = trig.parameters?.toggle_mode === 'true';

                    // Convert standard canvas-editor coordinates to relative percentage placements with zoom factor
                    const pctX = ((trig.x - scaledMinX) / scaledWidth) * 100;
                    const pctY = ((trig.y - scaledMinY) / scaledHeight) * 100;

                    return (
                      <div 
                        key={trig.id}
                        className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto"
                        style={{ left: `${pctX}%`, top: `${pctY}%` }}
                      >
                        <button
                          onClick={() => handleBadgeClick(trig.id)}
                          className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-md text-[10px] font-mono font-bold border transition-all shadow-md active:scale-95 ${
                            isActive 
                              ? 'bg-emerald-500 text-white border-emerald-400 shadow-emerald-500/50 animate-pulse'
                              : (theme === 'light' ? 'bg-white text-slate-800 border-slate-300 hover:border-slate-500' : 'bg-slate-800 text-gray-400 border-slate-700 hover:border-slate-500')
                          }`}
                        >
                          <span className="text-[8px] opacity-80 uppercase">{trig.id}</span>
                          <span className="font-extrabold">[{keyChar}]</span>
                          <span className="text-[7px] bg-black/40 text-white px-1 rounded">
                            {isActive ? `ON (${activeVal})` : 'OFF'}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>         </div>

              {/* Bound Keys Display List */}
              <div className={`mt-4 ${theme === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-[#0d1321] border-[#1e293b]'} rounded-lg p-3 border`}>
                <span className={`text-[10px] font-bold ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'} uppercase tracking-widest`}>ACTIVE BOUND CONTROLLER KEYS</span>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {keyTriggers.map((trig: any) => (
                    <div key={trig.id} className={`flex items-center gap-2 justify-between ${theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-900 border-slate-800'} px-2 py-1 rounded border`}>
                      <span className="text-xs font-mono font-semibold text-sky-500">{trig.id}</span>
                      <kbd className={`px-1.5 py-0.5 ${theme === 'light' ? 'bg-slate-100 border-slate-300 text-slate-800' : 'bg-slate-800 border-slate-700 text-white'} border rounded text-[10px] font-mono font-bold shadow-inner`}>
                        {trig.parameters?.key || 'Space'}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>

            </div>

          {/* Column 3: Challenge, Subplots, and Solver Adjustments Sidebar */}
          {showSidebar && (
            <div className={viewLayoutMode === 'side-by-side' ? "w-72 shrink-0 space-y-6" : "w-full space-y-6"}>
            
            {/* Challenge Selection Card */}
            <div className={`${theme === 'light' ? 'bg-white border-slate-200 shadow-md' : 'bg-[#111827]/80 border-[#1e293b]'} border rounded-xl p-4 space-y-3 shadow-lg`}>
              <div className={`flex items-center gap-2.5 border-b ${theme === 'light' ? 'border-slate-200' : 'border-[#1e293b]'} pb-2`}>
                <SlidersHorizontal className="h-4.5 w-4.5 text-amber-500" />
                <div>
                  <span className="text-[9px] font-bold text-amber-500 tracking-wider uppercase font-mono block">Circuit Challenge</span>
                  <h2 className={`text-xs font-bold ${theme === 'light' ? 'text-slate-900' : 'text-white'} uppercase tracking-tight`}>Active Simulation Template</h2>
                </div>
              </div>
              <div className="space-y-1.5">
                <select
                  value={activeTemplateKey}
                  onChange={(e) => {
                    const key = e.target.value;
                    setActiveTemplateKey(key);
                    loadGameTemplate(key);
                  }}
                  className={`w-full ${theme === 'light' ? 'bg-slate-100 border-slate-300 text-slate-900' : 'bg-[#1c2a42] border-[#3b82f6]/30 text-white'} border rounded-lg text-xs font-mono px-3 py-2 outline-none focus:border-sky-500 cursor-pointer`}
                >
                  {activeTemplateKey === 'custom' && (
                    <option value="custom">Custom Circuit (from Editor)</option>
                  )}
                  {Object.keys(CIRCUITS_TEMPLATES).filter(key => key !== 'empty').map(key => (
                    <option key={key} value={key}>
                      {CIRCUITS_TEMPLATES[key].name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Subplots Selection Config */}
            <div className={`${theme === 'light' ? 'bg-white border-slate-200 shadow-md' : 'bg-[#111827]/80 border-[#1e293b]'} border rounded-xl p-4 space-y-3 shadow-lg`}>
              <div className={`flex items-center justify-between border-b ${theme === 'light' ? 'border-slate-200' : 'border-[#1e293b]'} pb-2`}>
                <h3 className={`text-xs font-bold ${theme === 'light' ? 'text-slate-900' : 'text-white'} tracking-wider uppercase font-mono`}>Scope Subplot Config</h3>
                <span className="px-2 py-0.5 text-[9px] font-mono rounded bg-blue-500/10 text-blue-500 border border-blue-500/20">DYNAMIC</span>
              </div>
              
              <div className="space-y-2">
                <label className={`text-xs font-mono ${theme === 'light' ? 'text-slate-600' : 'text-gray-400'} font-bold block`}>Number of Subplots:</label>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setNumSubplots(n)}
                      className={`py-1 rounded border text-xs font-bold font-mono transition-all cursor-pointer ${
                        numSubplots === n
                          ? 'bg-blue-500 text-white border-blue-400 shadow-md shadow-blue-500/10'
                          : (theme === 'light' ? 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200' : 'bg-[#142038] border-[#1e293b] text-gray-400 hover:text-white')
                      }`}
                    >
                      {n} {n === 1 ? 'Plot' : 'Plots'}
                    </button>
                  ))}
                </div>
              </div>

              {numSubplots >= 2 && (
                <div className={`space-y-1.5 pt-2 border-t ${theme === 'light' ? 'border-slate-200' : 'border-[#1e293b]/40'}`}>
                  <label className={`text-[10px] font-mono ${theme === 'light' ? 'text-slate-600' : 'text-gray-400'} block font-bold`}>Subplot 2 Signal:</label>
                  <select
                    value={subplot2Signal}
                    onChange={(e) => setSubplot2Signal(e.target.value)}
                    className={`w-full ${theme === 'light' ? 'bg-slate-100 border-slate-300 text-slate-900' : 'bg-[#1c2a42] border-[#3b82f6]/30 text-white'} border rounded-lg text-xs font-mono px-2.5 py-1.5 outline-none focus:border-sky-500`}
                  >
                    <option value="">-- Select Signal --</option>
                    {availableSensors.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              )}

              {numSubplots >= 3 && (
                <div className={`space-y-1.5 pt-2 border-t ${theme === 'light' ? 'border-slate-200' : 'border-[#1e293b]/40'}`}>
                  <label className={`text-[10px] font-mono ${theme === 'light' ? 'text-slate-600' : 'text-gray-400'} block font-bold`}>Subplot 3 Signal:</label>
                  <select
                    value={subplot3Signal}
                    onChange={(e) => setSubplot3Signal(e.target.value)}
                    className={`w-full ${theme === 'light' ? 'bg-slate-100 border-slate-300 text-slate-900' : 'bg-[#1c2a42] border-[#3b82f6]/30 text-white'} border rounded-lg text-xs font-mono px-2.5 py-1.5 outline-none focus:border-sky-500`}
                  >
                    <option value="">-- Select Signal --</option>
                    {availableSensors.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Config & Control Panel */}
            <div className={`${theme === 'light' ? 'bg-white border-slate-200 shadow-md' : 'bg-[#111827]/80 border-[#1e293b]'} border rounded-xl p-4 space-y-4 shadow-lg`}>
              <h3 className={`text-xs font-bold ${theme === 'light' ? 'text-slate-900 border-slate-200' : 'text-white border-[#1e293b]'} border-b pb-2 uppercase tracking-wider font-mono`}>CHALLENGE & SOLVER ADJUSTMENTS</h3>
              
              <div className="space-y-3">
                
                {/* Dilation Speed Manual Input & Presets */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-mono">
                    <span className={`${theme === 'light' ? 'text-slate-600' : 'text-gray-400'} font-bold`}>Dilation Rate:</span>
                    <span className="text-sky-500 font-bold">{(dilationRate * 100).toFixed(2)}% real-time</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={`text-[10px] ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'} font-mono`}>1s human =</span>
                    <input 
                      type="number"
                      min="1"
                      max="1000000"
                      value={dilationUs}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0;
                        setDilationUs(Math.max(1, Math.min(1000000, val)));
                      }}
                      className={`w-24 ${theme === 'light' ? 'bg-slate-100 border-slate-300 text-slate-900' : 'bg-[#142038] border-[#3b82f6]/30 text-white'} border rounded px-2 py-1 text-xs font-mono text-right outline-none focus:border-sky-500`}
                    />
                    <span className="text-xs text-sky-500 font-mono">µs sim</span>
                  </div>
                  <div className="flex flex-wrap gap-1 pt-1.5">
                    {[10, 100, 1000, 10000, 50000, 100000].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setDilationUs(preset)}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-mono border transition-all cursor-pointer ${
                          dilationUs === preset
                            ? 'bg-sky-500/20 text-sky-500 border-sky-400 font-bold'
                            : (theme === 'light' ? 'bg-slate-100 text-slate-600 border-slate-200 hover:text-slate-900' : 'bg-[#142038] text-gray-400 border-transparent hover:text-white')
                        }`}
                      >
                        {preset >= 1000 ? `${preset / 1000}ms` : `${preset}µs`}
                      </button>
                    ))}
                  </div>
                  <p className={`text-[9px] ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>
                    Defines the time-dilation mapping in microseconds.
                  </p>
                </div>

                {/* Target Tolerance Width Slider */}
                <div className={`space-y-1.5 pt-2 border-t ${theme === 'light' ? 'border-slate-200' : 'border-[#1e293b]/40'}`}>
                  <div className="flex justify-between text-xs font-mono">
                    <span className={`${theme === 'light' ? 'text-slate-600' : 'text-gray-400'} font-bold`}>Tolerance Envelope (ε):</span>
                    <span className="text-emerald-500 font-bold">±{tolerance.toFixed(2)}</span>
                  </div>
                  <input 
                    type="range"
                    min="0.05"
                    max="3.00"
                    step="0.05"
                    value={tolerance}
                    onChange={(e) => setTolerance(parseFloat(e.target.value))}
                    className={`w-full accent-emerald-500 ${theme === 'light' ? 'bg-slate-200' : 'bg-[#1e293b]'} cursor-pointer`}
                  />
                  <p className={`text-[9px] ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>
                    Set control bounds tolerance. Smaller requires faster and tighter switching.
                  </p>
                </div>

                {/* Horizontal Zoom / Window Size */}
                <div className={`space-y-1.5 pt-2 border-t ${theme === 'light' ? 'border-slate-200' : 'border-[#1e293b]/40'}`}>
                  <div className="flex justify-between text-xs font-mono">
                    <span className={`${theme === 'light' ? 'text-slate-600' : 'text-gray-400'} font-bold`}>Horizontal Zoom:</span>
                    <span className="text-sky-500 font-bold">{visiblePoints.toLocaleString()} pts</span>
                  </div>
                  <input 
                    type="range"
                    min={50 * zoomMultiplier}
                    max={1500 * zoomMultiplier}
                    step={50 * zoomMultiplier}
                    value={visiblePoints}
                    onChange={(e) => setVisiblePoints(parseInt(e.target.value))}
                    className={`w-full accent-sky-500 ${theme === 'light' ? 'bg-slate-200' : 'bg-[#1e293b]'} cursor-pointer`}
                  />
                  <div className="space-y-1 pt-0.5">
                    <span className={`text-[10px] ${theme === 'light' ? 'text-slate-500' : 'text-gray-500'} font-mono font-bold uppercase tracking-wider block`}>Scale Order of Magnitude:</span>
                    <div className="grid grid-cols-4 gap-1">
                      {[
                        { label: '1x', mult: 1, range: '50-1.5k' },
                        { label: '10x', mult: 10, range: '500-15k' },
                        { label: '100x', mult: 100, range: '5k-150k' },
                        { label: '1000x', mult: 1000, range: '50k-1.5M' },
                      ].map((item) => (
                        <button
                          key={item.mult}
                          type="button"
                          onClick={() => handleMultiplierChange(item.mult)}
                          className={`px-1 py-1 rounded text-[10px] font-mono border transition-all cursor-pointer flex flex-col items-center justify-center ${
                            zoomMultiplier === item.mult
                              ? 'bg-sky-500/20 text-sky-500 border-sky-400 font-bold'
                              : (theme === 'light' ? 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200' : 'bg-[#142038] text-gray-400 border-slate-700 hover:text-white hover:border-gray-500')
                          }`}
                        >
                          <span className="font-bold">{item.label}</span>
                          <span className="text-[8px] opacity-75">{item.range}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className={`text-[9px] ${theme === 'light' ? 'text-slate-500' : 'text-gray-400'}`}>
                    Controls the visible time-window width of the rolling waveform grid.
                  </p>
                </div>

              </div>

              <div className={`space-y-3 pt-2 border-t ${theme === 'light' ? 'border-slate-200' : 'border-[#1e293b]/40'}`}>
                
                {/* Select Measured Variable */}
                <div className="space-y-1.5">
                  <label className={`text-xs font-mono ${theme === 'light' ? 'text-slate-600' : 'text-gray-400'} font-bold`}>Measured Sensor Signal (y_meas):</label>
                  <select 
                    value={selectedSensor}
                    onChange={(e) => setSelectedSensor(e.target.value)}
                    className={`w-full ${theme === 'light' ? 'bg-slate-100 border-slate-300 text-slate-900' : 'bg-[#1c2a42] border-[#3b82f6]/30 text-white'} border rounded-lg text-xs font-mono px-3 py-2 outline-none focus:border-sky-500`}
                  >
                    {availableSensors.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                {/* Target Reference Generator Selection */}
                <div className="space-y-1.5">
                  <label className={`text-xs font-mono ${theme === 'light' ? 'text-slate-600' : 'text-gray-400'} font-bold`}>Reference Target Waveform (y_ref):</label>
                  <select 
                    value={refType}
                    onChange={(e: any) => setRefType(e.target.value)}
                    className={`w-full ${theme === 'light' ? 'bg-slate-100 border-slate-300 text-slate-900' : 'bg-[#1c2a42] border-[#3b82f6]/30 text-white'} border rounded-lg text-xs font-mono px-3 py-2 outline-none focus:border-sky-500`}
                  >
                    <option value="sine">Sinusoidal Wave (50Hz)</option>
                    <option value="square">Square Wave Sequence</option>
                    <option value="triangle">Triangular Carrier Reference</option>
                    <option value="step">Step Change Profile</option>
                  </select>
                </div>

              </div>

              <div className={`grid grid-cols-3 gap-2 pt-2 border-t ${theme === 'light' ? 'border-slate-200' : 'border-[#1e293b]/40'}`}>
                <div className="space-y-1">
                  <span className={`text-[9px] font-mono ${theme === 'light' ? 'text-slate-600' : 'text-gray-400'} block font-bold`}>FREQ (Hz)</span>
                  <input 
                    type="number"
                    value={refFreq}
                    onChange={(e) => setRefFreq(Math.max(1, parseInt(e.target.value) || 10))}
                    className={`w-full ${theme === 'light' ? 'bg-slate-100 border-slate-300 text-slate-900' : 'bg-[#1c2a42] border-[#3b82f6]/20 text-white'} border rounded-lg text-xs font-mono px-2 py-1 outline-none`}
                  />
                </div>
                <div className="space-y-1">
                  <span className={`text-[9px] font-mono ${theme === 'light' ? 'text-slate-600' : 'text-gray-400'} block font-bold`}>REF AMP</span>
                  <input 
                    type="number"
                    step="0.1"
                    value={refAmp}
                    onChange={(e) => setRefAmp(Math.max(0.1, parseFloat(e.target.value) || 1.0))}
                    className={`w-full ${theme === 'light' ? 'bg-slate-100 border-slate-300 text-slate-900' : 'bg-[#1c2a42] border-[#3b82f6]/20 text-white'} border rounded-lg text-xs font-mono px-2 py-1 outline-none`}
                  />
                </div>
                <div className="space-y-1">
                  <span className={`text-[9px] font-mono ${theme === 'light' ? 'text-slate-600' : 'text-gray-400'} block font-bold`}>REF BIAS</span>
                  <input 
                    type="number"
                    step="0.1"
                    value={refOffset}
                    onChange={(e) => setRefOffset(parseFloat(e.target.value) || 0.0)}
                    className="w-full bg-[#1c2a42] border border-[#3b82f6]/20 rounded-lg text-xs font-mono text-white px-2 py-1 outline-none"
                  />
                </div>
              </div>

            </div>

          </div>
          )}

        </div>

      </main>

      {/* Victory Celebration Modal */}
      {victory && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-[#111c30] border-2 border-emerald-500/50 rounded-2xl p-8 max-w-md w-full text-center relative overflow-hidden shadow-2xl shadow-emerald-500/20">
            {/* Top decorative accent */}
            <div className="absolute top-0 inset-x-0 h-1.5 bg-emerald-500" />
            
            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/40">
              <Sparkles className="h-8 w-8 text-emerald-400 animate-spin" />
            </div>

            <h2 className="text-2xl font-bold tracking-tight text-white font-sans">Human Controller Victory!</h2>
            <p className="text-sm text-gray-300 mt-2">
              Outstanding work! You successfully regulated the measured quantity <strong>{selectedSensor}</strong> within the target $\pm{tolerance}$ band continuous tracking streak of 10 seconds.
            </p>

            <div className="my-6 bg-slate-900/80 rounded-xl p-4 border border-slate-800 text-left space-y-2 font-mono text-xs">
              <div className="flex justify-between">
                <span className="text-gray-400">Rolling Accuracy:</span>
                <span className="text-emerald-400 font-bold">{rollingAccuracy}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Total Key Toggles:</span>
                <span className="text-purple-400 font-bold">{switchToggles}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Switching Frequency:</span>
                <span className="text-pink-400 font-bold">{averageSwitchFreq} Hz</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={startGame}
                className="flex-1 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold py-2.5 rounded-lg shadow-lg active:scale-95 transition-all text-xs"
              >
                Play Again
              </button>
              <button
                onClick={stopGame}
                className="flex-1 bg-slate-800 hover:bg-slate-700 text-gray-300 font-bold py-2.5 rounded-lg active:scale-95 transition-all text-xs border border-slate-700"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
