import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, RotateCcw, Plus, Trash2, Cpu, Settings, Activity, Zap, CheckCircle, 
  HelpCircle, Sliders, Layers, BarChart2, PlusCircle, Server, Code, FileText,
  SlidersHorizontal, ChevronRight, Check, Database, UploadCloud, X, ArrowUp, ArrowDown,
  LayoutGrid, Sparkles, RefreshCcw, FileCode, Edit3, Sun, Moon, Pause, StopCircle, Download
} from 'lucide-react';
import { Component, SolverConfig, SimulationResults } from './types';
import { CIRCUITS_TEMPLATES } from './templates';
import SchematicEditor from './components/SchematicEditor';
import SimulationPlayer from './components/SimulationPlayer';
import PlotlyChart from './components/PlotlyChart';
import Plotly from 'plotly.js-dist-min';
import { state } from './schematic/state';
import { getWireDomain } from './schematic/routing';
import { triggerImport, exportDualGraphJSON } from './schematic/actions';
import { CircuitSimulator } from './solver_ts';
import { AlternativeCircuitSimulator } from './solver_alt';
import { generateMNASpaceHTML } from './utils/mnaSolver';

const localSimState = { cancelled: false, paused: false };

export default function App() {
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



  const syncSubplotsToGlobalState = (newSubplots: any[]) => {
    state.plotConfiguration.plots = newSubplots.map(sp => ({
      title: sp.title,
      variables: sp.traces
    }));
    const ev = new CustomEvent('plotConfigUpdated', { detail: state.plotConfiguration });
    window.dispatchEvent(ev);
  };

  const [activeTab, setActiveTab] = useState<string>('schematic');

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
  const [openScopeTabs, setOpenScopeTabs] = useState<{ scopeId: string; name: string }[]>([]);
  const [scopeOverlayModes, setScopeOverlayModes] = useState<Record<string, boolean>>({});
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('voltaic-theme');
    return (saved === 'light' || saved === 'dark') ? saved : 'dark';
  });

  useEffect(() => {
    localStorage.setItem('voltaic-theme', theme);
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.add('light-mode');
      root.classList.remove('dark-mode');
    } else {
      root.classList.add('dark-mode');
      root.classList.remove('light-mode');
    }
    // Dispatch custom event to notify canvas renderer to redraw
    const event = new CustomEvent('themeChanged', { detail: theme });
    window.dispatchEvent(event);
  }, [theme]);

  // Hook to handle Scope double-clicks on the schematic canvas
  useEffect(() => {
    (window as any).onScopeDoubleClick = (scopeId: string) => {
      // Find the scope component in the state
      const compExists = state.components.some(c => c.id === scopeId);
      if (!compExists) return;

      setOpenScopeTabs(prev => {
        if (prev.some(t => t.scopeId === scopeId)) return prev;
        return [...prev, { scopeId, name: `${scopeId} Plotter` }];
      });
      setActiveTab(scopeId);
    };
    return () => {
      delete (window as any).onScopeDoubleClick;
    };
  }, []);

  // Sync open scope tabs with active components in schematic (remove deleted scopes)
  useEffect(() => {
    const checkInterval = setInterval(() => {
      setOpenScopeTabs(prev => {
        const next = prev.filter(tab => state.components.some(c => c.id === tab.scopeId));
        if (next.length !== prev.length) {
          if (activeTab !== 'schematic' && activeTab !== 'simulator' && !state.components.some(c => c.id === activeTab)) {
            setActiveTab('schematic');
          }
          return next;
        }
        return prev;
      });
    }, 500);
    return () => clearInterval(checkInterval);
  }, [activeTab]);

  // Keep raw netlist source code synchronized with visual schematic editor when switching to the simulator tab
  const prevActiveTabRef = useRef(activeTab);
  useEffect(() => {
    if (activeTab === 'simulator' && prevActiveTabRef.current !== 'simulator') {
      try {
        const isRegularMode = (state.simulationSettings.simulationMode || 'regular') === 'regular';
        const netlist = exportDualGraphJSON(isRegularMode); // respect selected mode
        const netlistStr = JSON.stringify(netlist, null, 2);
        setJsonText(netlistStr);
      } catch (err) {
        console.error("Auto netlist export error:", err);
      }
    }
    prevActiveTabRef.current = activeTab;
  }, [activeTab]);

  const closeScopeTab = (scopeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenScopeTabs(prev => {
      const next = prev.filter(t => t.scopeId !== scopeId);
      if (activeTab === scopeId) {
        setActiveTab('schematic');
      }
      return next;
    });
  };
  // Internals for actual API compatibility
  const [components, setComponents] = useState<Component[]>([]);
  const [solverConfig, setSolverConfig] = useState<SolverConfig>({
    stop_time: "0.01",
    step_size: "10u",
    solver: "euler",
    step_type: "fixed",
    solverMethod: "non-ideal"
  });

  const [isLoading, setIsLoading] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [serverStatus, setServerStatus] = useState<'compiling' | 'ready' | 'error'>('ready');
  const [simResults, setSimResults] = useState<SimulationResults | null>(null);
  const [isExtractionModalOpen, setIsExtractionModalOpen] = useState(false);
  const [extractionModeSource, setExtractionModeSource] = useState<'auto' | 'sim'>('auto');

  // Raw JSON Netlist configuration states
  const [jsonText, setJsonText] = useState<string>("");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [loadedFileName, setLoadedFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>("empty");
  const [isVisualFlowOpen, setIsVisualFlowOpen] = useState<boolean>(false);

  // Reconfigurable Plotting States
  interface SubplotConfig {
    id: string;
    title: string;
    traces: string[];
  }
  const [subplots, setSubplots] = useState<SubplotConfig[]>([
    { id: "sp_1", title: "Voltages Lane", traces: [] },
    { id: "sp_2", title: "Currents Lane", traces: [] }
  ]);
  const [isGlobalOverlay, setIsGlobalOverlay] = useState<boolean>(false);
  const [layoutMode, setLayoutMode] = useState<'stacked' | 'grid'>('stacked');
  const [fitStack, setFitStack] = useState<boolean>(false);
  const [syncXZoom, setSyncXZoom] = useState<boolean>(true);
  const [syncHover, setSyncHover] = useState<boolean>(true);
  const [isImPlotTheme, setIsImPlotTheme] = useState<boolean>(false);

  // Plot state boundaries (Synchronized or individual)
  const [globalZoomX, setGlobalZoomX] = useState<{ min: number; max: number } | null>(null);
  const [zoomRangesX, setZoomRangesX] = useState<Record<string, { min: number; max: number } | null>>({});
  const [zoomRangesY, setZoomRangesY] = useState<Record<string, { min: number; max: number } | null>>({});
  const [globalMeasureRange, setGlobalMeasureRange] = useState<{ start: number; end: number } | null>(null);
  const [measureRanges, setMeasureRanges] = useState<Record<string, { start: number; end: number } | null>>({});
  const [plotMode, setPlotMode] = useState<'hover' | 'zoom' | 'pan' | 'measure'>('hover');

  // Unified or Local Hover tracking
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoveredData, setHoveredData] = useState<{ time: number; values: Record<string, number> } | null>(null);
  const [hoverPosition, setHoveredPosition] = useState<{ x: number; y: number } | null>(null);

  // Mouse Drag Tracking States (for click-and-drag panning/zooming on the active plot index)
  const [isPlotMouseDown, setIsPlotMouseDown] = useState(false);
  const [activePlotMouseDownPos, setActivePlotMouseDownPos] = useState<{ 
    plotId: string; 
    x: number; 
    y: number; 
    time: number; 
    val: number 
  } | null>(null);
  const [activePlotMouseCurrentPos, setActivePlotMouseCurrentPos] = useState<{ 
    plotId: string; 
    x: number; 
    y: number; 
    time: number; 
    val: number 
  } | null>(null);
  const [dragStartRangeX, setDragStartRangeX] = useState<{ min: number; max: number } | null>(null);
  const [dragStartRangeY, setDragStartRangeY] = useState<{ min: number; max: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load default template on first boot
  useEffect(() => {
    loadTemplate("empty");
  }, []);

  // Listen to interactive plot configuration changes designed in schematic editor modal
  useEffect(() => {
    const handlePlotsUpdate = (e: any) => {
      const config = e.detail;
      if (config && Array.isArray(config.plots)) {
        const mapped = config.plots.map((p: any, idx: number) => ({
          id: `sp_${idx}`,
          title: p.title || `Plot ${idx + 1}`,
          traces: p.variables || []
        }));
        setSubplots(mapped);
      }
    };
    window.addEventListener('plotConfigUpdated', handlePlotsUpdate);
    return () => window.removeEventListener('plotConfigUpdated', handlePlotsUpdate);
  }, []);

  const runSchematicSimulation = async (exportedNetlist: string) => {
    setIsLoading(true);
    setServerStatus('compiling');
    
    const sessionId = 'session_' + Math.random().toString(36).substring(2, 9);
    setActiveSessionId(sessionId);
    setIsPaused(false);

    // Save raw netlist code to the text editor state
    setJsonText(exportedNetlist);
    parseAndSyncNetlist(exportedNetlist);

    try {
      const parsed = JSON.parse(exportedNetlist);

      // Validate GOTO and FROM blocks matching tag labels
      const physicalComps = Array.isArray(parsed.physical_stage) ? parsed.physical_stage : [];
      const controlComps = Array.isArray(parsed.control_loops) ? parsed.control_loops : [];
      const allComponents = [...physicalComps, ...controlComps];
      const fromBlocks = allComponents.filter((c: any) => c.type === 'FROM_SIG');
      const gotoBlocks = allComponents.filter((c: any) => c.type === 'GOTO_SIG');

      for (const fromComp of fromBlocks) {
        const fromTag = String(fromComp.parameters?.tag || 'A').trim().toLowerCase();
        const hasMatchingGoto = gotoBlocks.some((c: any) => String(c.parameters?.tag || 'A').trim().toLowerCase() === fromTag);
        if (!hasMatchingGoto) {
          throw new Error(`Signal From block has no matching Signal Goto block with the same tag label "${String(fromComp.parameters?.tag || 'A').trim()}".`);
        }
      }

      parsed.sessionId = sessionId;

      let results: SimulationResults;
      try {
        const response = await fetch('/api/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed)
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        results = await response.json();
      } catch (err: any) {
        console.warn("Express server simulation failed or unreachable. Running locally in browser...", err);
        
        localSimState.cancelled = false;
        localSimState.paused = false;
        
        const useIdealPwl = parsed.simulation_parameters?.solverMethod === 'ideal-pwl';
        const sim = useIdealPwl
          ? new AlternativeCircuitSimulator(
              parsed.physical_stage || [],
              parsed.control_loops || [],
              parsed.simulation_parameters || {}
            )
          : new CircuitSimulator(
              parsed.physical_stage || [],
              parsed.control_loops || [],
              parsed.simulation_parameters || {}
            );
        
        results = await sim.runAsync(
          () => localSimState.cancelled,
          () => localSimState.paused
        );
      }

      setSimResults(results);
      setServerStatus('ready');

      // Clear previous zoom boundaries
      setGlobalZoomX(null);
      setZoomRangesX({});
      setZoomRangesY({});
      setGlobalMeasureRange(null);
      setMeasureRanges({});

      // Retrieve discovered traces
      const available = extractAvailableTraces(results);
      
      // Auto-assign first few simulation traces if no custom plot channels have been registered yet
      const allSubplotTracesCount = subplots.reduce((acc, sp) => acc + sp.traces.length, 0);
      if (allSubplotTracesCount === 0 || subplots.length === 0) {
        const defaultTracesToRender = available.slice(0, 4);
        setSubplots([
          { id: "sp_1", title: "Waveform analysis", traces: defaultTracesToRender }
        ]);
      }

      // Automatically switch view to Simulator/Plots Tab!
      setActiveTab('simulator');

    } catch (e: any) {
      console.error(e);
      setServerStatus('error');
      alert(`Simulation failed. Ensure nodes are properly wired (ground reference node_0 is required for open circuits) and control channels match! Error details: ${e.message || e}`);
    } finally {
      setIsLoading(false);
      setActiveSessionId(null);
      setIsPaused(false);
    }
  };

  // Sync internal components array when standard jsonText changes
  const parseAndSyncNetlist = (text: string): boolean => {
    try {
      const json = JSON.parse(text);
      if (!json || typeof json !== 'object') {
        setJsonError("JSON root must be an object");
        return false;
      }
      
      const physical = Array.isArray(json.physical_stage) ? json.physical_stage : [];
      const control = Array.isArray(json.control_loops) ? json.control_loops : [];
      
      const guiComponents: Component[] = [];
      physical.forEach((c: any) => {
        guiComponents.push({
          id: c.id || `V_${Math.floor(100 + Math.random() * 900)}`,
          type: c.type || "Resistor",
          label: c.label || `${c.type} (${c.id})`,
          x: c.x || 150,
          y: c.y || 100,
          rotation: c.rotation || 0,
          nodes: c.nodes || [],
          parameters: c.parameters || {},
          channels: c.channels || {}
        });
      });

      control.forEach((c: any) => {
        guiComponents.push({
          id: c.id || `CTRL_${Math.floor(100 + Math.random() * 900)}`,
          type: c.type || "Constant",
          label: c.label || `${c.type} (${c.id})`,
          x: c.x || 150,
          y: c.y || 400,
          rotation: c.rotation || 0,
          nodes: [],
          parameters: c.parameters || {},
          channels: c.channels || {}
        });
      });

      setComponents(guiComponents);

      if (json.simulation_parameters) {
        setSolverConfig({
          stop_time: String(json.simulation_parameters.stop_time ?? "0.01"),
          step_size: String(json.simulation_parameters.step_size ?? "10u"),
          solver: (json.simulation_parameters.solver ?? "euler") as any,
          step_type: (json.simulation_parameters.step_type ?? "fixed") as any,
          solverMethod: (json.simulation_parameters.solverMethod ?? "non-ideal") as any
        });
      }
      
      setJsonError(null);
      return true;
    } catch (err: any) {
      setJsonError(err.message || "Invalid JSON format");
      return false;
    }
  };

  const loadTemplate = (key: string) => {
    if (key === "uploaded") return;
    setLoadedFileName(null);
    setGlobalZoomX(null);
    setZoomRangesX({});
    setZoomRangesY({});
    setGlobalMeasureRange(null);
    setMeasureRanges({});
    setSelectedTemplateKey(key);
    
    const template = CIRCUITS_TEMPLATES[key];
    if (template) {
      const netlistObj = {
        simulation_parameters: template.solverConfig,
        physical_stage: template.components.filter(c => c.nodes && c.nodes.length > 0),
        control_loops: template.components.filter(c => !c.nodes || c.nodes.length === 0)
      };
      const formattedJson = JSON.stringify(netlistObj, null, 2);
      setJsonText(formattedJson);
      parseAndSyncNetlist(formattedJson);
      setSimResults(null);
      setHoveredData(null);
      setHoverTime(null);
      
      // Setup beautiful initial subplots specifically customized for each template
      setupDefaultSubplots(key);

      // Map components and generate wires for Schematic Editor
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

      // Local helper to generate wires from template component connections
      const wires: any[] = [];
      let wireIdCounter = 1;
      const getNextWireId = () => `W_temp_${wireIdCounter++}`;

      // 1. Group electrical terminals by node name
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
              if (!electricalNodes[nodeName]) {
                electricalNodes[nodeName] = [];
              }
              electricalNodes[nodeName].push({ compId: comp.id, terminal: terminalName });
            }
          });
        }
      });

      // Connect electrical pins sharing same node name
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

      // 2. Group control terminals by channel name
      const controlChannels: Record<string, { compId: string; terminal: string }[]> = {};

      template.components.forEach((comp) => {
        if (comp.channels) {
          Object.keys(comp.channels).forEach((terminalName) => {
            const channelName = comp.channels[terminalName];
            if (!channelName) return;
            if (!controlChannels[channelName]) {
              controlChannels[channelName] = [];
            }
            controlChannels[channelName].push({ compId: comp.id, terminal: terminalName });
          });
        }
      });

      // Connect control pins sharing same channel name
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

      const layoutObj = {
        components: layoutComponents,
        wires: wires,
        simulationSettings: {
          stopTime: String(template.solverConfig.stop_time ?? "0.01"),
          stepSize: String(template.solverConfig.step_size ?? "10u"),
          solver: template.solverConfig.solver ?? "euler",
          stepType: template.solverConfig.step_type ?? "fixed"
        }
      };

      // Load layout into visual canvas and center/redraw
      triggerImport(JSON.stringify(layoutObj));
    }
  };

  const setupDefaultSubplots = (key: string) => {
    let defaultPlots: any[] = [];
    if (key === "buck_converter") {
      defaultPlots = [
        { id: "sp_1", title: "Output Voltage & Feedbacks (V)", traces: ["V_R_load", "V_ref_Out", "v_feedback"] },
        { id: "sp_2", title: "Power Stage Switching node (V) & Inductor (I)", traces: ["V_D1", "I_L1"] },
        { id: "sp_3", title: "PI Controller Loop Control effort (V)", traces: ["control_effort", "pwm_gate"] }
      ];
    } else if (key === "lc_resonance") {
      defaultPlots = [
        { id: "sp_1", title: "Capacitor Voltage (underdamped ringing)", traces: ["V_C1"] },
        { id: "sp_2", title: "Inductor Transient Current (I)", traces: ["I_L1"] }
      ];
    } else if (key === "ac_rectifier") {
      defaultPlots = [
        { id: "sp_1", title: "AC Line Input vs DC Smoothing Bank Voltage (V)", traces: ["V_V_ac", "V_C_reservoir"] },
        { id: "sp_2", title: "Load Consumption Current Draw (I)", traces: ["I_R_load"] }
      ];
    } else if (key === "h_bridge_inverter") {
      defaultPlots = [
        { id: "sp_1", title: "Filtered AC Lowpass Output Voltage & Current", traces: ["V_C_filter"] },
        { id: "sp_2", title: "Sinusoidal modulation reference vs PWM Triangle Carrier", traces: ["sine_mod", "triangle"] },
        { id: "sp_3", title: "Complementary MOSFET Gate Drives", traces: ["gate_q1", "gate_q2"] }
      ];
    } else {
      defaultPlots = [
        { id: "sp_1", title: "Main Waveform Analysis", traces: [] }
      ];
    }
    
    const mapped = defaultPlots.map(p => ({
      id: p.id,
      title: p.title,
      traces: p.traces
    }));
    setSubplots(mapped);

    state.plotConfiguration.plots = defaultPlots.map(p => ({
      title: p.title,
      variables: p.traces
    }));
  };

  const importNetlistJson = (json: any, fileName: string) => {
    try {
      if (!json || typeof json !== 'object') {
        throw new Error("Invalid JSON structure");
      }
      const formattedJson = JSON.stringify(json, null, 2);
      setJsonText(formattedJson);
      const ok = parseAndSyncNetlist(formattedJson);
      if (!ok) {
        throw new Error("Parsing of uploaded netlist format failed.");
      }
      
      setLoadedFileName(fileName);
      setSimResults(null);
      setHoveredData(null);
      setHoverTime(null);
      setGlobalZoomX(null);
      setZoomRangesX({});
      setZoomRangesY({});
      setGlobalMeasureRange(null);
      setMeasureRanges({});

      // Auto parse standard waveforms found in the JSON structures to setup standard layout
      const physical = Array.isArray(json.physical_stage) ? json.physical_stage : [];
      const control = Array.isArray(json.control_loops) ? json.control_loops : [];
      const tempTraces: string[] = [];
      
      physical.forEach((c: any) => {
        if (["R", "L", "C", "V", "AC_V", "I", "S", "D", "MOSFET", "vg-FET", "VM", "AM", "Resistor", "Inductor", "Capacitor", "VoltageSource", "ACVoltageSource", "CurrentSource", "Switch", "Diode", "Voltmeter", "Ammeter"].includes(c.type)) {
          tempTraces.push(`V_${c.id}`);
          tempTraces.push(`I_${c.id}`);
        }
      });
      control.forEach((c: any) => {
        if (c.channels) {
          Object.values(c.channels).forEach((ch: any) => {
            if (typeof ch === 'string') tempTraces.push(ch);
          });
        }
      });
      
      const uniqueTemp = Array.from(new Set(tempTraces)).slice(0, 5);
      setSubplots([
        { id: "sp_1", title: `Uploaded Profile: ${fileName}`, traces: uniqueTemp }
      ]);
    } catch (e: any) {
      alert(`Error loading JSON standard: ${e.message || e}`);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        importNetlistJson(parsed, file.name);
      } catch (err: any) {
        alert("Invalid JSON format");
      }
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.json')) {
      alert("Please upload a valid .json netlist configuration!");
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        importNetlistJson(parsed, file.name);
      } catch (err: any) {
        alert("Invalid JSON format in dropped file");
      }
    };
    reader.readAsText(file);
  };

  // Run solver on Express/C++ native backend
  const runCppSimulation = async () => {
    // Ensure latest text changes are parsed and aligned
    const ok = parseAndSyncNetlist(jsonText);
    if (!ok) {
      alert(`Simulation halted. Fix the active JSON Netlist errors before running:\n${jsonError}`);
      return;
    }

    // Validate GOTO and FROM blocks matching tag labels
    const fromBlocks = components.filter((c: any) => c.type === 'FROM_SIG');
    const gotoBlocks = components.filter((c: any) => c.type === 'GOTO_SIG');

    for (const fromComp of fromBlocks) {
      const fromTag = String(fromComp.parameters?.tag || 'A').trim().toLowerCase();
      const hasMatchingGoto = gotoBlocks.some((c: any) => String(c.parameters?.tag || 'A').trim().toLowerCase() === fromTag);
      if (!hasMatchingGoto) {
        alert(`Signal From block has no matching Signal Goto block with the same tag label "${String(fromComp.parameters?.tag || 'A').trim()}".`);
        return;
      }
    }

    setIsLoading(true);
    setServerStatus('compiling');
    
    const sessionId = 'session_' + Math.random().toString(36).substring(2, 9);
    setActiveSessionId(sessionId);
    setIsPaused(false);

    // Build direct payload compatible with C++ backend
    const currentParsedNetlist = JSON.parse(jsonText);
    const activePlotVars: string[] = [];
    subplots.forEach(sp => {
      if (Array.isArray(sp.traces)) {
        sp.traces.forEach(t => activePlotVars.push(t));
      }
    });

    // Automatically add all scope input channels to wanted variables so they are simulated and plotted
    state.components.forEach((c: any) => {
      if (c.type === 'SCOPE') {
        const numChannels = parseInt(c.parameters?.channels || "2") || 2;
        for (let i = 1; i <= numChannels; i++) {
          activePlotVars.push(`${c.id}.In${i}`);
        }
      }
    });

    const resolvedWanted: string[] = [];
    activePlotVars.forEach(v => {
      resolvedWanted.push(v);
      if (v.includes('.')) {
        const [compId, term] = v.split('.');
        if (compId && term && term !== 'Out' && !term.startsWith('Out')) {
          const incoming = resolveInputPinToSource(v);
          if (incoming && incoming !== v) {
            resolvedWanted.push(incoming);
          }
        }
      }
    });

    const netlistPayload = {
      sessionId: sessionId,
      simulation_parameters: {
        stop_time: currentParsedNetlist.simulation_parameters?.stop_time || solverConfig.stop_time,
        step_size: currentParsedNetlist.simulation_parameters?.step_size || solverConfig.step_size,
        solver: currentParsedNetlist.simulation_parameters?.solver || solverConfig.solver,
        step_type: currentParsedNetlist.simulation_parameters?.step_type || solverConfig.step_type,
        solverMethod: currentParsedNetlist.simulation_parameters?.solverMethod || solverConfig.solverMethod || 'non-ideal',
        wanted_variables: currentParsedNetlist.simulation_parameters?.wanted_variables || Array.from(new Set(resolvedWanted))
      },
      physical_stage: components.filter(c => c.nodes && c.nodes.length > 0),
      control_loops: components.filter(c => !c.nodes || c.nodes.length === 0)
    };

    try {
      let results: SimulationResults;
      try {
        const response = await fetch('/api/simulate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(netlistPayload)
        });

        if (!response.ok) {
          throw new Error(await response.text());
        }

        results = await response.json();
      } catch (err: any) {
        console.warn("Express server simulation failed or unreachable. Running locally in browser...", err);
        
        localSimState.cancelled = false;
        localSimState.paused = false;
        
        const useIdealPwl = netlistPayload.simulation_parameters?.solverMethod === 'ideal-pwl';
        const sim = useIdealPwl
          ? new AlternativeCircuitSimulator(
              netlistPayload.physical_stage || [],
              netlistPayload.control_loops || [],
              netlistPayload.simulation_parameters || {}
            )
          : new CircuitSimulator(
              netlistPayload.physical_stage || [],
              netlistPayload.control_loops || [],
              netlistPayload.simulation_parameters || {}
            );
        
        results = await sim.runAsync(
          () => localSimState.cancelled,
          () => localSimState.paused
        );
      }

      setSimResults(results);
      setServerStatus('ready');

      // Clear any previous zoom & pan states to reload view screen cleanly
      setGlobalZoomX(null);
      setZoomRangesX({});
      setZoomRangesY({});
      setGlobalMeasureRange(null);
      setMeasureRanges({});

      // Ensure that our subplots actually contain available traces in results
      const available = extractAvailableTraces(results);
      if (available.length > 0) {
        // If subplots are brand new, populate the first subplot with something automatically
        const allSubplotTracesCount = subplots.reduce((acc, sp) => acc + sp.traces.length, 0);
        if (allSubplotTracesCount === 0 && subplots.length > 0) {
          setSubplots(subplots.map((sp, idx) => 
            idx === 0 ? { ...sp, traces: [available[0]] } : sp
          ));
        }
      }

    } catch (e: any) {
      console.error(e);
      setServerStatus('error');
      alert(`Simulation failed. Ensure nodes are properly wired (ground node_0 is required for electrical nodes) and control loop channels match standard inputs/outputs! Error details: ${e.message || e}`);
    } finally {
      setIsLoading(false);
      setActiveSessionId(null);
      setIsPaused(false);
    }
  };

  const pauseResumeSimulation = async () => {
    if (!activeSessionId) return;
    try {
      const response = await fetch('/api/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId })
      });
      if (response.ok) {
        const data = await response.json();
        setIsPaused(data.paused);
      } else {
        throw new Error();
      }
    } catch (err) {
      console.warn("Failed to pause/resume via server, using local fallback");
      localSimState.paused = !localSimState.paused;
      setIsPaused(localSimState.paused);
    }
  };

  const terminateSimulation = async () => {
    if (!activeSessionId) return;
    try {
      await fetch('/api/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: activeSessionId })
      });
    } catch (err) {
      console.warn("Failed to terminate via server, using local fallback");
      localSimState.cancelled = true;
    }
  };

  const extractAvailableTraces = (results: SimulationResults | null): string[] => {
    if (!results) return [];
    const traces: string[] = [];

    const isWireOrSegment = (name: string): boolean => {
      if (name.includes('_seg')) return true;
      return /^([VI]_)?W\d+(\.|$|_)/i.test(name);
    };

    // Control Signals (like GAIN1.Out)
    Object.keys(results.signals).forEach(sig => {
      if (!isWireOrSegment(sig)) {
        traces.push(sig);
      }
    });

    // Custom plots (which include our V_R1, I_R1 differential component voltages and currents)
    Object.keys(results.custom_plots).forEach(plot => {
      if (!isWireOrSegment(plot)) {
        traces.push(plot);
      }
    });

    return Array.from(new Set(traces)).sort();
  };

  const prefixTraceWithSubsystem = (trace: string): string => {
    if (!trace || !trace.includes('.')) return trace;
    const currentPrefix = [...state.navigationStack.map((layer: any) => layer.subsystemId), state.currentSubsystemId].filter(Boolean).join('.');
    if (!currentPrefix) return trace;
    
    if (trace.startsWith(currentPrefix + '.')) return trace;
    return `${currentPrefix}.${trace}`;
  };

  const getTraceData = (trace: string): number[] => {
    if (!simResults) return [];
    
    const resolvedTrace = resolveInputPinToSource(trace);
    const prefixedTrace = prefixTraceWithSubsystem(resolvedTrace);

    if (simResults.custom_plots[prefixedTrace]) return simResults.custom_plots[prefixedTrace];
    if (simResults.signals[prefixedTrace]) return simResults.signals[prefixedTrace];
    
    if (prefixedTrace.endsWith('_V')) {
      const base = prefixedTrace.substring(0, prefixedTrace.length - 2);
      if (simResults.voltages[base]) return simResults.voltages[base];
      if (simResults.voltmeters[base]) return simResults.voltmeters[base];
    }
    if (prefixedTrace.endsWith('_I')) {
      const base = prefixedTrace.substring(0, prefixedTrace.length - 2);
      if (simResults.inductors[base]) return simResults.inductors[base];
      if (simResults.ammeters[base]) return simResults.ammeters[base];
    }

    if (simResults.custom_plots[resolvedTrace]) return simResults.custom_plots[resolvedTrace];
    if (simResults.signals[resolvedTrace]) return simResults.signals[resolvedTrace];
    
    if (resolvedTrace.endsWith('_V')) {
      const base = resolvedTrace.substring(0, resolvedTrace.length - 2);
      if (simResults.voltages[base]) return simResults.voltages[base];
      if (simResults.voltmeters[base]) return simResults.voltmeters[base];
    }
    if (resolvedTrace.endsWith('_I')) {
      const base = resolvedTrace.substring(0, resolvedTrace.length - 2);
      if (simResults.inductors[base]) return simResults.inductors[base];
      if (simResults.ammeters[base]) return simResults.ammeters[base];
    }

    if (simResults.custom_plots[trace]) return simResults.custom_plots[trace];
    if (simResults.signals[trace]) return simResults.signals[trace];

    return [];
  };

  const getTraceColor = (traceName: string, index?: number): string => {
    let idx = index;
    if (idx === undefined && simResults) {
      const available = extractAvailableTraces(simResults);
      const resolved = resolveInputPinToSource(traceName);
      idx = available.indexOf(resolved);
      if (idx === -1) idx = available.indexOf(traceName);
      if (idx === -1) idx = 0;
    } else if (idx === undefined) {
      idx = 0;
    }

    const darkColors = [
      '#38bdf8', // Sky Blue
      '#4ade80', // Emerald Green
      '#fbbf24', // Amber/Yellow
      '#c084fc', // Violet/Purple
      '#fb7185', // Rose/Pink
      '#fb923c', // Orange
      '#2dd4bf', // Teal
      '#818cf8', // Indigo
      '#a7f3d0', // Light Emerald
      '#fbcfe8', // Light Pink
    ];

    const lightColors = [
      '#0284c7', // Sky Blue (Darker)
      '#16a34a', // Green
      '#d97706', // Amber
      '#7c3aed', // Purple
      '#e11d48', // Rose/Red
      '#ea580c', // Orange
      '#0d9488', // Teal
      '#4f46e5', // Indigo
      '#047857', // Emerald
      '#be185d', // Pink
    ];

    const colors = theme === 'light' ? lightColors : darkColors;
    return colors[idx % colors.length];
  };

  const calculateRMS = (data: number[]): number => {
    if (!data || data.length === 0) return 0;
    const squares_sum = data.reduce((acc, v) => acc + v * v, 0);
    return Math.sqrt(squares_sum / data.length);
  };

  const resetAllPlotZoom = () => {
    setGlobalZoomX(null);
    setZoomRangesX({});
    setZoomRangesY({});
    setGlobalMeasureRange(null);
    setMeasureRanges({});
  };

  const getActiveSubplotsForExport = (): { id: string; title: string; traces: string[] }[] => {
    const isInsideScopeTab = activeTab !== 'schematic' && activeTab !== 'simulator';
    if (isInsideScopeTab) {
      const scopeComp = state.components.find(c => c.id === activeTab);
      if (!scopeComp) return [];
      const numChannels = parseInt(scopeComp.parameters?.channels) || 2;
      const channels: string[] = [];
      for (let i = 1; i <= numChannels; i++) {
        channels.push(`${activeTab}.In${i}`);
      }
      const isOverlay = scopeOverlayModes[activeTab] || false;
      if (isOverlay) {
        return [{
          id: `${activeTab}_overlay`,
          title: `Overlay View [CH 1 - CH ${numChannels}]`,
          traces: channels
        }];
      } else {
        return channels.map((chan, idx) => ({
          id: `${activeTab}_channel_${idx + 1}`,
          title: `${activeTab} Channel ${idx + 1} Input Signal`,
          traces: [chan]
        }));
      }
    } else {
      if (isGlobalOverlay) {
        return [{ id: "unified", title: "Consolidated Solver Outputs", traces: [] }];
      } else {
        return subplots;
      }
    }
  };

  const getPlottedTracesForSubplot = (subplot: { id: string; title: string; traces: string[] }): string[] => {
    const isInsideScopeTab = activeTab !== 'schematic' && activeTab !== 'simulator';
    const availableTraces = extractAvailableTraces(simResults);
    if (isGlobalOverlay && !isInsideScopeTab) {
      return availableTraces;
    }
    if (isInsideScopeTab) {
      return subplot.traces;
    }
    return subplot.traces.filter(t => availableTraces.includes(resolveInputPinToSource(t)));
  };

  const getPlottedTracesForExport = (): string[] => {
    if (!simResults) return [];
    const activeSubplots = getActiveSubplotsForExport();
    const tracesSet = new Set<string>();
    
    activeSubplots.forEach(sp => {
      const traces = getPlottedTracesForSubplot(sp);
      traces.forEach(t => {
        const data = getTraceData(t);
        if (data && data.length > 0) {
          tracesSet.add(t);
        }
      });
    });
    
    return Array.from(tracesSet);
  };

  const exportCombinedSVG = () => {
    if (!simResults) {
      alert("No simulation data available to export!");
      return;
    }

    try {
      const activeSubplots = getActiveSubplotsForExport();
      if (activeSubplots.length === 0) {
        alert("No subplots active to export!");
        return;
      }

      let totalHeight = 0;
      const spacing = 16;
      let combinedContent = "";
      let combinedDefs = "";
      let exportWidth = 800;
      
      let bgColor = "#020617";
      if (theme === 'light') {
        bgColor = "#ffffff";
      } else if (isImPlotTheme) {
        bgColor = "#141517";
      }
      
      const validResults: { subplot: typeof activeSubplots[0]; svgStr: string; height: number }[] = [];
      
      activeSubplots.forEach((sp) => {
        const chartEl = document.getElementById(`plotly-chart-${sp.id}`);
        if (!chartEl) {
          // SVG Fallback Mode
          const svgEl = document.getElementById(`plot-svg-${sp.id}`);
          if (svgEl) {
            const clone = svgEl.cloneNode(true) as SVGSVGElement;
            const defs = clone.querySelector('defs');
            if (defs) {
              combinedDefs += defs.innerHTML;
              defs.remove();
            }
            const viewBox = clone.getAttribute('viewBox');
            let h = 240;
            if (viewBox) {
              const parts = viewBox.split(' ');
              if (parts.length === 4) {
                h = parseFloat(parts[3]);
              }
            }
            const svgStr = `
<!-- Subplot: ${sp.title} (Fallback SVG) -->
<g transform="translate(0, ${totalHeight})">
  ${clone.innerHTML}
</g>`;
            validResults.push({ subplot: sp, svgStr, height: h });
            totalHeight += h + spacing;
          }
          return;
        }
        
        const w = chartEl.clientWidth || 800;
        const h = chartEl.clientHeight || 240;
        
        exportWidth = w;
        
        let svgs = Array.from(chartEl.querySelectorAll('svg.main-svg'));
        if (svgs.length === 0) {
          svgs = Array.from(chartEl.querySelectorAll('svg'));
        }
        
        let subplotContent = "";
        let subplotDefs = "";
        
        svgs.forEach((svg) => {
          const clone = svg.cloneNode(true) as SVGSVGElement;
          const defs = clone.querySelector('defs');
          if (defs) {
            subplotDefs += defs.innerHTML;
            defs.remove();
          }
          subplotContent += clone.innerHTML;
        });
        
        if (subplotContent) {
          const svgStr = `
<!-- Subplot: ${sp.title} (Plotly Live) -->
<g transform="translate(0, ${totalHeight})">
  ${subplotContent}
</g>`;
          if (subplotDefs) {
            combinedDefs += subplotDefs;
          }
          validResults.push({ subplot: sp, svgStr, height: h });
          totalHeight += h + spacing;
        }
      });
      
      if (validResults.length === 0) {
        alert("Could not locate the SVG elements of the plot subplots. Please make sure they are visible on screen.");
        return;
      }
      
      validResults.forEach((res) => {
        combinedContent += res.svgStr;
      });
      
      totalHeight = Math.max(50, totalHeight - spacing);
      
      const bgStyle = `
        <style>
          svg {
            background-color: ${bgColor};
          }
          text {
            font-family: monospace;
          }
          path {
            opacity: 0.95;
          }
        </style>
      `;
      
      const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${exportWidth} ${totalHeight}" width="${exportWidth}" height="${totalHeight}" style="background-color: ${bgColor}">
  <defs>
    ${bgStyle}
    ${combinedDefs}
  </defs>
  ${combinedContent}
</svg>`;
      
      const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const baseName = activeTab === 'simulator' ? 'waveform_solver' : `${activeTab}_scope`;
      a.download = `${baseName}_combined_plots.svg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Failed to export combined SVG", err);
      alert(`Failed to export combined SVG: ${err.message || err}`);
    }
  };

  const exportCombinedCSV = () => {
    if (!simResults || !simResults.time || simResults.time.length === 0) {
      alert("No simulation data available to export!");
      return;
    }
    try {
      const activeTraces = getPlottedTracesForExport();
      if (activeTraces.length === 0) {
        alert("No plotted variables found to export!");
        return;
      }
      
      const tData = simResults.time;
      const headers = ['Time', ...activeTraces.map(t => {
        if (t.includes('.')) {
          const parts = t.split('.');
          const resolved = resolveInputPinToSource(t);
          if (resolved !== t) {
            return `${t} (${resolved})`;
          }
          return parts[1];
        }
        return t;
      })];
      
      const rows: string[] = [];
      const traceArrays = activeTraces.map(trace => ({
        trace,
        arr: getTraceData(trace)
      }));
      
      for (let i = 0; i < tData.length; i++) {
        const row = [tData[i].toString()];
        traceArrays.forEach(({ arr }) => {
          row.push(arr[i] !== undefined && arr[i] !== null ? arr[i].toString() : '');
        });
        rows.push(row.join(','));
      }
      
      const csvContent = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const baseName = activeTab === 'simulator' ? 'waveform_solver' : `${activeTab}_scope`;
      a.download = `${baseName}_full_data.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error("Failed to export combined CSV", err);
      alert(`Failed to export combined CSV: ${err.message || err}`);
    }
  };

  const getSegmentStatsForTrace = (traceName: string, startT: number, endT: number) => {
    if (!simResults) return null;
    const tData = simResults.time;
    const traceData = getTraceData(traceName);
    if (tData.length === 0 || traceData.length === 0) return null;
    
    const tMin = Math.min(startT, endT);
    const tMax = Math.max(startT, endT);
    
    let sum = 0;
    let sumSq = 0;
    let count = 0;
    let minVal = Infinity;
    let maxVal = -Infinity;
    
    for (let i = 0; i < tData.length; i++) {
      const t = tData[i];
      if (t >= tMin && t <= tMax) {
        const val = traceData[i];
        sum += val;
        sumSq += val * val;
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
        count++;
      }
    }
    
    if (count === 0) return null;
    
    const average = sum / count;
    const rms = Math.sqrt(sumSq / count);
    const pk2pk = maxVal - minVal;
    
    let crossings = 0;
    for (let i = 1; i < tData.length; i++) {
      const tPrev = tData[i - 1];
      const tCurr = tData[i];
      if (tPrev >= tMin && tCurr <= tMax) {
        const vPrev = traceData[i - 1] - average;
        const vCurr = traceData[i] - average;
        if ((vPrev <= 0 && vCurr > 0) || (vPrev >= 0 && vCurr < 0)) {
          crossings++;
        }
      }
    }
    const duration = tMax - tMin;
    let estimatedFreq = 0;
    if (crossings >= 2 && duration > 0) {
      estimatedFreq = crossings / (2 * duration);
    }
    
    return {
      average,
      rms,
      min: minVal,
      max: maxVal,
      pk2pk,
      count,
      duration,
      frequency: estimatedFreq
    };
  };

  // Live Auto-formatting of custom JSON text editor
  const formatJsonTextCode = () => {
    try {
      const obj = JSON.parse(jsonText);
      setJsonText(JSON.stringify(obj, null, 2));
      setJsonError(null);
    } catch (e: any) {
      setJsonError(`Formatter: Failed to format. Reason: ${e.message}`);
    }
  };

  // Download raw netlist as JSON standard file
  const downloadNetlistFile = () => {
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(jsonText);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `${loadedFileName || selectedTemplateKey || 'custom_netlist'}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (e: any) {
      alert("Failed to export netlist string file.");
    }
  };

  // Copy raw active netlist source code to system clipboard
  const copyNetlistToClipboard = () => {
    navigator.clipboard.writeText(jsonText)
      .then(() => alert("Raw Netlist JSON copied to clipboard!"))
      .catch((err) => alert("Clipboard copying failed: " + err));
  };

  const getSimulatedSwitchCombinations = (netlistText: string): boolean[][] | undefined => {
    if (!simResults) return undefined;
    
    let stage: any = {};
    try {
      stage = JSON.parse(netlistText)?.physical_stage || {};
    } catch (e) {
      return undefined;
    }

    const switches: any[] = [];
    (stage.diodes || []).forEach((c: any) => {
      switches.push(c);
    });
    (stage.analog_switches || []).forEach((c: any) => {
      switches.push(c);
    });

    if (switches.length === 0) return [];

    const getGateSignalName = (compId: string, wires: any[], compType?: string): string => {
      if (compType === 'vg-FET') return `${compId}.G`;
      if (!wires) return "0.0";
      let rootWire = wires.find((w: any) => 
        w.to && w.to.type === 'pin' && w.to.compId === compId && w.to.terminal === 'G'
      );
      if (rootWire) {
        const backtrace = (endpoint: any): string => {
          if (!endpoint) return "0.0";
          if (endpoint.type === 'pin') return `${endpoint.compId}.${endpoint.terminal}`;
          if (endpoint.type === 'wire') {
            const parentWire = wires.find((w: any) => w.id === endpoint.wireId);
            if (!parentWire) return "0.0";
            return backtrace(parentWire.from);
          }
          return "0.0";
        };
        return backtrace(rootWire.from);
      }
      return "0.0";
    };

    const getPrefixedCompId = (compId: string): string => {
      const currentPrefix = [
        ...(state.navigationStack || []).map((layer: any) => layer.subsystemId),
        state.currentSubsystemId
      ].filter(Boolean).join('.');
      return currentPrefix && !compId.startsWith(currentPrefix + '.') 
        ? `${currentPrefix}.${compId}` 
        : compId;
    };

    const getSwitchOnAt = (compId: string, compType: string, stepIdx: number) => {
      const prefId = getPrefixedCompId(compId);
      const compObj = state.components?.find((c: any) => c.id === compId);
      const chan = compObj?.channels?.G || compObj?.channels?.Ctrl || compObj?.channels?.Switch;
      
      if (chan) {
        const prefChannel = getPrefixedCompId(chan);
        if (simResults.signals?.[prefChannel] !== undefined) {
          return (simResults.signals[prefChannel][stepIdx] ?? 0.0) > 0.5;
        }
      }

      const ctrlPlot = simResults.custom_plots?.[`Ctrl_${prefId}`] || simResults.custom_plots?.[`Ctrl_${compId}`];
      if (ctrlPlot) {
        return (ctrlPlot[stepIdx] ?? 0.0) > 0.5;
      }

      const gateSig = getGateSignalName(compId, state.wires, compType);
      if (gateSig && gateSig !== "0.0") {
        const prefGateSig = getPrefixedCompId(gateSig);
        if (simResults.signals?.[prefGateSig] !== undefined) {
          return (simResults.signals[prefGateSig][stepIdx] ?? 0.0) > 0.5;
        }
      }

      const iVal = (simResults.custom_plots?.[`I_${prefId}`]?.[stepIdx] || simResults.custom_plots?.[`I_${compId}`]?.[stepIdx]) ?? 0.0;
      return Math.abs(iVal) > 1e-3;
    };

    const uniqueStatesSet = new Set<string>();
    const uniqueStatesList: boolean[][] = [];
    const tData = simResults.time || [];

    for (let stepIdx = 0; stepIdx < tData.length; stepIdx++) {
      const stateArr = switches.map(sw => getSwitchOnAt(sw.id, sw.type || 'SW', stepIdx));
      const key = stateArr.map(s => s ? '1' : '0').join('');
      if (!uniqueStatesSet.has(key)) {
        uniqueStatesSet.add(key);
        uniqueStatesList.push(stateArr);
      }
    }

    return uniqueStatesList;
  };

  const handleMNAExtraction = () => {
    try {
      // Always use the simple/ideal netlist for MNA mode extraction to avoid parasitics/wires as resistors
      const idealNetlist = exportDualGraphJSON(true);
      const idealNetlistStr = JSON.stringify(idealNetlist);

      let customActiveSwitchStates: boolean[][] | undefined = undefined;
      if (extractionModeSource === 'sim' && simResults) {
        customActiveSwitchStates = getSimulatedSwitchCombinations(idealNetlistStr);
      }

      const html = generateMNASpaceHTML(idealNetlistStr, customActiveSwitchStates);
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setIsExtractionModalOpen(false);
    } catch (e: any) {
      alert(`Failed to extract MNA state-space:\n${e.message}`);
    }
  };

  // Reconfigurable Subplots Layout Operations
  const addSubplot = () => {
    const newId = `sp_${Math.floor(Date.now() + Math.random() * 1000)}`;
    const nextSubplots = [...subplots, { id: newId, title: "Custom Subplot Lane", traces: [] }];
    setSubplots(nextSubplots);
    syncSubplotsToGlobalState(nextSubplots);
  };

  const deleteSubplotById = (id: string) => {
    const nextSubplots = subplots.filter(sp => sp.id !== id);
    setSubplots(nextSubplots);
    syncSubplotsToGlobalState(nextSubplots);
  };

  const renameSubplot = (id: string, newTitle: string) => {
    const nextSubplots = subplots.map(sp => sp.id === id ? { ...sp, title: newTitle } : sp);
    setSubplots(nextSubplots);
    syncSubplotsToGlobalState(nextSubplots);
  };

  const moveSubplotOrder = (index: number, direction: 'up' | 'down') => {
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= subplots.length) return;
    const items = [...subplots];
    const target = items[index];
    items[index] = items[nextIndex];
    items[nextIndex] = target;
    setSubplots(items);
    syncSubplotsToGlobalState(items);
  };

  const toggleTraceSelection = (subplotId: string, trace: string) => {
    const nextSubplots = subplots.map(sp => {
      if (sp.id === subplotId) {
        const hasTrace = sp.traces.includes(trace);
        return {
          ...sp,
          traces: hasTrace ? sp.traces.filter(t => t !== trace) : [...sp.traces, trace]
        };
      }
      return sp;
    });
    setSubplots(nextSubplots);
    syncSubplotsToGlobalState(nextSubplots);
  };

  // Parser helper to summarize parsed components for visual representation
  const getParsedSchemaSummary = () => {
    try {
      const parsed = JSON.parse(jsonText);
      const physical = Array.isArray(parsed.physical_stage) ? parsed.physical_stage : [];
      const control = Array.isArray(parsed.control_loops) ? parsed.control_loops : [];
      const config = parsed.simulation_parameters || {};
      return { physical, control, config, valid: true };
    } catch {
      return { physical: [], control: [], config: {}, valid: false };
    }
  };

  const getTraceStatistics = (traceName: string) => {
    const data = getTraceData(traceName);
    if (data.length === 0) return null;

    let min = Infinity;
    let max = -Infinity;
    data.forEach(v => {
      if (v < min) min = v;
      if (v > max) max = v;
    });

    const pk2pk = max - min;
    const rms = calculateRMS(data);

    return { min, max, pk2pk, rms };
  };

  // Plot Render Logic (renders single high fidelity SVG plot canvas)
  const renderSinglePlot = (subplot: SubplotConfig, idx: number) => {
    if (!simResults) return null;
    const tData = simResults.time;
    if (tData.length === 0) return null;

    const isInsideScopeTab = activeTab !== 'schematic' && activeTab !== 'simulator';
    const availableTraces = extractAvailableTraces(simResults);
    // Filter traces assigned to this plot so we only draw actually simulated variables
    const activeTraces = (isGlobalOverlay && !isInsideScopeTab)
      ? availableTraces 
      : subplot.traces.filter(t => availableTraces.includes(resolveInputPinToSource(t)));

    const formatTraceLabel = (t: string) => {
      if (t.includes('.')) {
        const parts = t.split('.');
        const src = resolveInputPinToSource(t);
        if (src !== t) {
          return `${parts[1]} (${src})`;
        }
        return parts[1];
      }
      return t.replace('_', ' ');
    };

    const width = 800;
    let height = 240;
    if (layoutMode === 'grid') {
      height = 320;
    } else {
      if (fitStack) {
        const count = isInsideScopeTab 
          ? (state.components.find(c => c.id === activeTab) ? (parseInt(state.components.find(c => c.id === activeTab)?.parameters?.channels) || 2) : 2)
          : subplots.length;
        height = Math.max(110, Math.min(240, Math.floor(480 / (count || 1))));
      } else {
        height = 240;
      }
    }
    const padding = 55;

    const tMinBound = tData[0];
    const tMaxBound = tData[tData.length - 1];

    // Evaluate displays with Zoom states (synchronized or individual local)
    const displayXMin = syncXZoom 
      ? (globalZoomX !== null ? globalZoomX.min : tMinBound)
      : (zoomRangesX[subplot.id] !== null && zoomRangesX[subplot.id] !== undefined ? zoomRangesX[subplot.id]!.min : tMinBound);

    const displayXMax = syncXZoom 
      ? (globalZoomX !== null ? globalZoomX.max : tMaxBound)
      : (zoomRangesX[subplot.id] !== null && zoomRangesX[subplot.id] !== undefined ? zoomRangesX[subplot.id]!.max : tMaxBound);

    // Find local Y boundaries across all selected active traces (only inside visible X range)
    let yMinBound = Infinity;
    let yMaxBound = -Infinity;

    activeTraces.forEach(tr => {
      const d = getTraceData(tr);
      for (let i = 0; i < tData.length; i++) {
        const t = tData[i];
        if (t >= displayXMin && t <= displayXMax) {
          const v = d[i];
          if (v !== undefined && !isNaN(v)) {
            if (v < yMinBound) yMinBound = v;
            if (v > yMaxBound) yMaxBound = v;
          }
        }
      }
    });

    if (yMinBound === Infinity || yMaxBound === -Infinity) {
      // Fallback: search entire data
      activeTraces.forEach(tr => {
        const d = getTraceData(tr);
        d.forEach(v => {
          if (v !== undefined && !isNaN(v)) {
            if (v < yMinBound) yMinBound = v;
            if (v > yMaxBound) yMaxBound = v;
          }
        });
      });
    }

    if (yMinBound === Infinity || yMaxBound === -Infinity) {
      yMinBound = -1.0;
      yMaxBound = 1.0;
    } else if (yMinBound === yMaxBound) {
      yMinBound -= 1.0;
      yMaxBound += 1.0;
    } else {
      const range = yMaxBound - yMinBound;
      yMinBound -= range * 0.12;
      yMaxBound += range * 0.12;
    }

    const displayYMin = zoomRangesY[subplot.id] !== null && zoomRangesY[subplot.id] !== undefined 
      ? zoomRangesY[subplot.id]!.min 
      : yMinBound;

    const displayYMax = zoomRangesY[subplot.id] !== null && zoomRangesY[subplot.id] !== undefined 
      ? zoomRangesY[subplot.id]!.max 
      : yMaxBound;

    let isStacked = false;
    let stackLength = 0;
    
    if (isInsideScopeTab) {
      const scopeComp = state.components.find(c => c.id === activeTab);
      const numChannels = scopeComp ? (parseInt(scopeComp.parameters?.channels) || 2) : 2;
      const isOverlay = scopeOverlayModes[activeTab] || false;
      isStacked = !isOverlay && numChannels > 1;
      stackLength = numChannels;
    } else if (!isGlobalOverlay) {
      isStacked = layoutMode === 'stacked' && subplots.length > 1;
      stackLength = subplots.length;
    }

    let padLeft = 60;
    let padRight = 40;
    let padTop = 20;
    let padBottom = 35;

    if (isStacked) {
      const isFirst = idx === 0;
      const isLast = idx === stackLength - 1;
      padTop = isFirst ? 20 : 0;
      padBottom = isLast ? 35 : 0;
    }

    const scaleX = (width - padLeft - padRight) / (displayXMax - displayXMin || 1);
    const scaleY = (height - padTop - padBottom) / (displayYMax - displayYMin || 1);

    const getXCoords = (t: number) => padLeft + (t - displayXMin) * scaleX;
    const getYCoords = (y: number) => height - padBottom - (y - displayYMin) * scaleY;

    // AXIS TEXT FORMATTING
    const formatTimeVal = (t: number) => {
      const absDiff = displayXMax - displayXMin;
      if (absDiff < 2) {
        if (absDiff < 0.002) {
          return `${(t * 1000).toFixed(3)} ms`;
        }
        return `${(t * 1000).toFixed(2)} ms`;
      }
      return `${t.toFixed(4)} s`;
    };

    const formatYVal = (y: number) => {
      const absDiff = displayYMax - displayYMin;
      if (absDiff > 100) return y.toFixed(0);
      if (absDiff > 1) return y.toFixed(2);
      if (absDiff > 0.01) return y.toFixed(4);
      return y.toExponential(2);
    };

    const gridCols = 8;
    const gridRows = 5;
    const colStep = (displayXMax - displayXMin) / gridCols;
    const rowStep = (displayYMax - displayYMin) / gridRows;

    // Event routing handlers bound with local subplot configurations
    const onMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
      const svgRect = e.currentTarget.getBoundingClientRect();
      const mX = e.clientX - svgRect.left;
      const mY = e.clientY - svgRect.top;
      const svgMouseX = (mX / svgRect.width) * width;
      const svgMouseY = (mY / svgRect.height) * height;

      if (svgMouseX < padLeft || svgMouseX > width - padRight || svgMouseY < padTop || svgMouseY > height - padBottom) return;

      const fX = (svgMouseX - padLeft) / (width - padLeft - padRight);
      const clickedT = displayXMin + fX * (displayXMax - displayXMin);
      const fY = (height - padBottom - svgMouseY) / (height - padTop - padBottom);
      const clickedY = displayYMin + fY * (displayYMax - displayYMin);

      setIsPlotMouseDown(true);
      setActivePlotMouseDownPos({ plotId: subplot.id, x: svgMouseX, y: svgMouseY, time: clickedT, val: clickedY });
      setActivePlotMouseCurrentPos({ plotId: subplot.id, x: svgMouseX, y: svgMouseY, time: clickedT, val: clickedY });

      const currentRangeX = syncXZoom ? (globalZoomX || { min: tMinBound, max: tMaxBound }) : (zoomRangesX[subplot.id] || { min: tMinBound, max: tMaxBound });
      setDragStartRangeX(currentRangeX);
      setDragStartRangeY(zoomRangesY[subplot.id] || { min: yMinBound, max: yMaxBound });

      if (plotMode === 'measure') {
        if (syncXZoom) {
          setGlobalMeasureRange({ start: clickedT, end: clickedT });
        } else {
          setMeasureRanges({ ...measureRanges, [subplot.id]: { start: clickedT, end: clickedT } });
        }
      }
    };

    const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
      const svgRect = e.currentTarget.getBoundingClientRect();
      const mX = e.clientX - svgRect.left;
      const mY = e.clientY - svgRect.top;
      const svgMouseX = (mX / svgRect.width) * width;
      const svgMouseY = (mY / svgRect.height) * height;

      const cX = Math.min(Math.max(padLeft, svgMouseX), width - padRight);
      const cY = Math.min(Math.max(padTop, svgMouseY), height - padBottom);

      const fX = (cX - padLeft) / (width - padLeft - padRight);
      const currentT = displayXMin + fX * (displayXMax - displayXMin);
      const fY = (height - padBottom - cY) / (height - padTop - padBottom);
      const currentY = displayYMin + fY * (displayYMax - displayYMin);

      if (svgMouseX >= padLeft && svgMouseX <= width - padRight) {
        const idxSample = Math.min(Math.max(0, Math.floor(fX * tData.length)), tData.length - 1);
        const tVal = tData[idxSample];

        if (syncHover) {
          setHoverTime(tVal);
        } else {
          setHoverTime(tVal); // individual
        }

        const vals: Record<string, number> = {};
        activeTraces.forEach(tr => {
          vals[tr] = getTraceData(tr)[idxSample];
        });
        setHoveredData({ time: tVal, values: vals });
        setHoveredPosition({ x: mX, y: mY });
      } else {
        if (!isPlotMouseDown) {
          setHoverTime(null);
          setHoveredData(null);
          setHoveredPosition(null);
        }
      }

      if (!isPlotMouseDown || !activePlotMouseDownPos || activePlotMouseDownPos.plotId !== subplot.id) return;

      setActivePlotMouseCurrentPos({ plotId: subplot.id, x: cX, y: cY, time: currentT, val: currentY });

      if (plotMode === 'pan' && dragStartRangeX && dragStartRangeY) {
        const mouseDeltaX = svgMouseX - activePlotMouseDownPos.x;
        const mouseDeltaY = svgMouseY - activePlotMouseDownPos.y;

        const rx = dragStartRangeX.max - dragStartRangeX.min;
        const ry = dragStartRangeY.max - dragStartRangeY.min;

        const shiftT = -(mouseDeltaX / (width - padLeft - padRight)) * rx;
        const shiftY = (mouseDeltaY / (height - padTop - padBottom)) * ry;

        const nextX = { min: dragStartRangeX.min + shiftT, max: dragStartRangeX.max + shiftT };
        const nextY = { min: dragStartRangeY.min + shiftY, max: dragStartRangeY.max + shiftY };

        if (syncXZoom) {
          setGlobalZoomX(nextX);
        } else {
          setZoomRangesX({ ...zoomRangesX, [subplot.id]: nextX });
        }
        setZoomRangesY({ ...zoomRangesY, [subplot.id]: nextY });
      } else if (plotMode === 'measure') {
        if (syncXZoom) {
          setGlobalMeasureRange(prev => prev ? { ...prev, end: currentT } : { start: activePlotMouseDownPos.time, end: currentT });
        } else {
          const prevMeas = measureRanges[subplot.id];
          setMeasureRanges({
            ...measureRanges,
            [subplot.id]: prevMeas ? { ...prevMeas, end: currentT } : { start: activePlotMouseDownPos.time, end: currentT }
          });
        }
      }
    };

    const onMouseUp = (e: React.MouseEvent<SVGSVGElement>) => {
      if (!isPlotMouseDown) return;
      setIsPlotMouseDown(false);

      if (!activePlotMouseDownPos || !activePlotMouseCurrentPos || activePlotMouseDownPos.plotId !== subplot.id) {
        setActivePlotMouseDownPos(null);
        setActivePlotMouseCurrentPos(null);
        return;
      }

      if (plotMode === 'zoom') {
        const dx = Math.abs(activePlotMouseCurrentPos.x - activePlotMouseDownPos.x);
        const dy = Math.abs(activePlotMouseCurrentPos.y - activePlotMouseDownPos.y);

        const isXOnly = dx > 8 && (dy < 15 || dy / dx < 0.35);
        const isYOnly = dy > 8 && (dx < 15 || dx / dy < 0.35);

        if (isXOnly) {
          const minT = Math.min(activePlotMouseDownPos.time, activePlotMouseCurrentPos.time);
          const maxT = Math.max(activePlotMouseDownPos.time, activePlotMouseCurrentPos.time);
          if (syncXZoom) {
            setGlobalZoomX({ min: minT, max: maxT });
          } else {
            setZoomRangesX({ ...zoomRangesX, [subplot.id]: { min: minT, max: maxT } });
          }
        } else if (isYOnly) {
          const minY = Math.min(activePlotMouseDownPos.val, activePlotMouseCurrentPos.val);
          const maxY = Math.max(activePlotMouseDownPos.val, activePlotMouseCurrentPos.val);
          setZoomRangesY({ ...zoomRangesY, [subplot.id]: { min: minY, max: maxY } });
        } else if (dx > 4 && dy > 4) {
          const minT = Math.min(activePlotMouseDownPos.time, activePlotMouseCurrentPos.time);
          const maxT = Math.max(activePlotMouseDownPos.time, activePlotMouseCurrentPos.time);
          const minY = Math.min(activePlotMouseDownPos.val, activePlotMouseCurrentPos.val);
          const maxY = Math.max(activePlotMouseDownPos.val, activePlotMouseCurrentPos.val);

          if (syncXZoom) {
            setGlobalZoomX({ min: minT, max: maxT });
          } else {
            setZoomRangesX({ ...zoomRangesX, [subplot.id]: { min: minT, max: maxT } });
          }
          setZoomRangesY({ ...zoomRangesY, [subplot.id]: { min: minY, max: maxY } });
        } else {
          // Click zoom: zoom in by 0.8, shift-click zooms out by 1.25
          const factor = e.shiftKey ? 1.25 : 0.8;
          const clickT = activePlotMouseDownPos.time;
          const clickY = activePlotMouseDownPos.val;

          const newTMin = clickT - (clickT - displayXMin) * factor;
          const newTMax = clickT + (displayXMax - clickT) * factor;
          const newYMin = clickY - (clickY - displayYMin) * factor;
          const newYMax = clickY + (displayYMax - clickY) * factor;

          const nextX = { min: newTMin, max: newTMax };
          const nextY = { min: newYMin, max: newYMax };

          if (syncXZoom) {
            setGlobalZoomX(nextX);
          } else {
            setZoomRangesX({ ...zoomRangesX, [subplot.id]: nextX });
          }
          setZoomRangesY({ ...zoomRangesY, [subplot.id]: nextY });
        }
      }

      setActivePlotMouseDownPos(null);
      setActivePlotMouseCurrentPos(null);
    };

    const onWheelDOM = (e: WheelEvent) => {
      const zoomX = e.shiftKey;
      const zoomY = e.ctrlKey;
      if (!zoomX && !zoomY) {
        return; 
      }
      
      e.preventDefault();
      
      const svgRect = e.currentTarget
        ? (e.currentTarget as SVGSVGElement).getBoundingClientRect()
        : null;
      if (!svgRect) return;

      const mX = e.clientX - svgRect.left;
      const mY = e.clientY - svgRect.top;
      const svgMouseX = (mX / svgRect.width) * width;
      const svgMouseY = (mY / svgRect.height) * height;

      if (svgMouseX < padLeft || svgMouseX > width - padRight || svgMouseY < padTop || svgMouseY > height - padBottom) return;

      const fX = (svgMouseX - padLeft) / (width - padLeft - padRight);
      const mouseT = displayXMin + fX * (displayXMax - displayXMin);
      const fY = (height - padBottom - svgMouseY) / (height - padTop - padBottom);
      const mouseY = displayYMin + fY * (displayYMax - displayYMin);

      const factor = e.deltaY < 0 ? 0.85 : 1.15;

      if (zoomX) {
        const newTMin = mouseT - (mouseT - displayXMin) * factor;
        const newTMax = mouseT + (displayXMax - mouseT) * factor;
        const nextX = { min: newTMin, max: newTMax };
        if (syncXZoom) {
          setGlobalZoomX(nextX);
        } else {
          setZoomRangesX(prev => ({ ...prev, [subplot.id]: nextX }));
        }
      }
      if (zoomY) {
        const newYMin = mouseY - (mouseY - displayYMin) * factor;
        const newYMax = mouseY + (displayYMax - mouseY) * factor;
        const nextY = { min: newYMin, max: newYMax };
        setZoomRangesY(prev => ({ ...prev, [subplot.id]: nextY }));
      }
    };

    const resetLocalZoom = () => {
      if (syncXZoom) {
        setGlobalZoomX(null);
      } else {
        setZoomRangesX({ ...zoomRangesX, [subplot.id]: null });
      }
      setZoomRangesY({ ...zoomRangesY, [subplot.id]: null });
    };

    const isHoverActiveOnThisPlot = (plotMode === 'hover' && hoveredData && hoverPosition);
    const displayedMeasureRange = syncXZoom ? globalMeasureRange : measureRanges[subplot.id];
    // Themes elements
    let bgColor = "#020617";
    let lineGridColor = "#0f172a";
    let frameAxisColor = "#1e293b";
    let gridTickColor = "#475569";
    let selectionColorFill = "#38bdf822";
    let selectionBorderStroke = "#38bdf8";

    if (theme === 'light') {
      bgColor = "#ffffff";
      lineGridColor = "#e2e8f0";
      frameAxisColor = "#cbd5e1";
      gridTickColor = "#64748b";
      selectionColorFill = "#0284c715";
      selectionBorderStroke = "#0284c7";
    } else if (isImPlotTheme) {
      bgColor = "#141517";
      lineGridColor = "#252628";
      frameAxisColor = "#4e4f55";
      gridTickColor = "#9fa0ad";
      selectionColorFill = "#df9f2422";
      selectionBorderStroke = "#df9f24";
    }

    const renderSvgCanvas = () => (
      <div className={`relative overflow-hidden select-none transition-all ${
        isStacked 
        ? 'w-full h-full' 
        : `rounded-lg border ${theme === 'light' ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-950 border-slate-900'}`
      }`}>
        {activeTraces.length === 0 ? (
          <div 
            style={{ height }} 
            className="w-full flex flex-col items-center justify-center text-slate-500 bg-slate-950/20 border border-dashed border-slate-800 rounded-lg p-6"
          >
            <Activity className="h-7 w-7 text-slate-600 mb-2 animate-pulse" />
            <p className="text-[10px] font-semibold text-slate-400">Empty Subplot Lane</p>
            <p className="text-[9px] text-slate-500 mt-0.5">Toggle variable checkboxes below to render waveforms in this pane!</p>
          </div>
        ) : isPlotlyLoaded ? (
          <div id={`plotly-chart-${subplot.id}`} className="w-full h-auto">
            <PlotlyChart
              subplotId={subplot.id}
              traces={activeTraces}
              getTraceData={getTraceData}
              getTraceColor={(trace) => isImPlotTheme 
                ? ((trace.startsWith('V_') || trace.endsWith('_V')) ? '#eab308' : (trace.startsWith('I_') || trace.endsWith('_I')) ? '#ef4444' : '#10b981')
                : getTraceColor(trace)}
              tData={tData}
              displayXMin={displayXMin}
              displayXMax={displayXMax}
              height={height}
              theme={theme}
              simResults={simResults}
              onZoomX={(min, max) => {
                if (syncXZoom) {
                  if (min === null || max === null) {
                    setGlobalZoomX(null);
                  } else {
                    setGlobalZoomX({ min, max });
                  }
                } else {
                  if (min === null || max === null) {
                    setZoomRangesX({ ...zoomRangesX, [subplot.id]: null });
                  } else {
                    setZoomRangesX({ ...zoomRangesX, [subplot.id]: { min, max } });
                  }
                }
              }}
            />
          </div>
        ) : (
          <svg 
            id={`plot-svg-${subplot.id}`}
            viewBox={`0 0 ${width} ${height}`} 
            className="w-full h-auto"
            style={{ backgroundColor: bgColor }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            ref={el => {
              if (el) {
                const oldHandler = (el as any)._onWheelHandler;
                if (oldHandler) {
                  el.removeEventListener('wheel', oldHandler);
                }
                (el as any)._onWheelHandler = onWheelDOM;
                el.addEventListener('wheel', onWheelDOM, { passive: false });
              }
            }}
            onMouseLeave={() => {
              setHoveredData(null);
              setHoveredPosition(null);
              setHoverTime(null);
            }}
            onDoubleClick={resetLocalZoom}
          >
            <defs>
              <clipPath id={`viewport-clip-${subplot.id}`}>
                <rect x={padLeft} y={padTop} width={width - padLeft - padRight} height={height - padTop - padBottom} />
              </clipPath>
            </defs>

            {/* Grid lines X axes */}
            {Array.from({ length: gridCols + 1 }).map((_, i) => {
              const val = displayXMin + i * colStep;
              const x = getXCoords(val);
              return (
                <g key={`x-grid-${subplot.id}-${i}`}>
                  <line x1={x} y1={padTop} x2={x} y2={height - padBottom} stroke={lineGridColor} strokeWidth="1" strokeDasharray="3,4" />
                  {(!isStacked || idx === stackLength - 1) && (
                    <text x={x} y={height - padBottom + 14} fill={gridTickColor} fontSize="8" textAnchor="middle" fontFamily="monospace">
                      {formatTimeVal(val)}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Grid lines Y axes */}
            {Array.from({ length: gridRows + 1 }).map((_, i) => {
              const val = displayYMin + i * rowStep;
              const y = getYCoords(val);
              return (
                <g key={`y-grid-${subplot.id}-${i}`}>
                  <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke={lineGridColor} strokeWidth="1" strokeDasharray="3,4" />
                  <text x={padLeft - 8} y={y + 3.5} fill={gridTickColor} fontSize="8" textAnchor="end" fontFamily="monospace">
                    {formatYVal(val)}
                  </text>
                </g>
              );
            })}

            {/* Main boundaries */}
            <line x1={padLeft} y1={padTop} x2={padLeft} y2={height - padBottom} stroke={frameAxisColor} strokeWidth="1.2" />
            <line x1={width - padRight} y1={padTop} x2={width - padRight} y2={height - padBottom} stroke={frameAxisColor} strokeWidth="1.2" />
            
            {/* Top border (only for the first plot in the stack, or all plots if not stacked) */}
            {(!isStacked || idx === 0) && (
              <line x1={padLeft} y1={padTop} x2={width - padRight} y2={padTop} stroke={frameAxisColor} strokeWidth="1.2" />
            )}
            
            {/* Bottom border (always draw as the divider/bottom axis) */}
            <line x1={padLeft} y1={height - padBottom} x2={width - padRight} y2={height - padBottom} stroke={frameAxisColor} strokeWidth="1.2" />

            {/* Active Waveforms curves */}
            {activeTraces.map((trace) => {
              const signalDataPoints = getTraceData(trace);
              const color = isImPlotTheme 
                ? ((trace.startsWith('V_') || trace.endsWith('_V')) ? '#eab308' : (trace.startsWith('I_') || trace.endsWith('_I')) ? '#ef4444' : '#10b981')
                : getTraceColor(trace);
              
              let pathD = "";
              let startIdx = 0;
              let endIdx = tData.length - 1;
              for (let i = 0; i < tData.length; i++) {
                if (tData[i] >= displayXMin) {
                  startIdx = i;
                  break;
                }
              }
              for (let i = tData.length - 1; i >= 0; i--) {
                if (tData[i] <= displayXMax) {
                  endIdx = i;
                  break;
                }
              }
              
              const countVisible = endIdx - startIdx + 1;
              const stepCount = Math.min(countVisible, 800);
              const step = Math.max(1, Math.floor(countVisible / stepCount));
              
              let sampleIndex = 0;
              for (let i = startIdx; i <= endIdx; i += step) {
                const xPoint = getXCoords(tData[i]);
                const yPoint = getYCoords(signalDataPoints[i]);
                if (sampleIndex === 0) {
                  pathD = `M ${xPoint} ${yPoint}`;
                } else {
                  pathD += ` L ${xPoint} ${yPoint}`;
                }
                sampleIndex++;
              }

              return (
                <path
                  key={`trace-path-${subplot.id}-${trace}`}
                  d={pathD}
                  fill="none"
                  stroke={color}
                  strokeWidth={isImPlotTheme ? "2" : "1.8"}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  clipPath={`url(#viewport-clip-${subplot.id})`}
                  style={{ filter: isImPlotTheme ? 'none' : `drop-shadow(0 0 1px ${color}22)` }}
                />
              );
            })}

            {/* Dynamic Box-zoom overlay */}
            {plotMode === 'zoom' && isPlotMouseDown && activePlotMouseDownPos && activePlotMouseDownPos.plotId === subplot.id && activePlotMouseCurrentPos && (() => {
              const x1 = activePlotMouseDownPos.x;
              const x2 = activePlotMouseCurrentPos.x;
              const y1 = activePlotMouseDownPos.y;
              const y2 = activePlotMouseCurrentPos.y;
              const dx = Math.abs(x2 - x1);
              const dy = Math.abs(y2 - y1);
              
              const isXOnly = dx > 8 && (dy < 15 || dy / dx < 0.35);
              const isYOnly = dy > 8 && (dx < 15 || dx / dy < 0.35);
              
              let boxX = Math.min(x1, x2);
              let boxY = Math.min(y1, y2);
              let boxW = dx;
              let boxH = dy;
              
              if (isXOnly) {
                boxY = padTop;
                boxH = height - padTop - padBottom;
              } else if (isYOnly) {
                boxX = padLeft;
                boxW = width - padLeft - padRight;
              }
              
              return (
                <rect
                  x={boxX}
                  y={boxY}
                  width={boxW}
                  height={boxH}
                  fill={selectionColorFill}
                  stroke={selectionBorderStroke}
                  strokeWidth="1.2"
                  strokeDasharray="4,4"
                />
              );
            })()}

            {/* Cursors segments overlays */}
            {displayedMeasureRange && (
              <g clipPath={`url(#viewport-clip-${subplot.id})`}>
                <rect 
                  x={Math.min(getXCoords(displayedMeasureRange.start), getXCoords(displayedMeasureRange.end))} 
                  y={padTop} 
                  width={Math.abs(getXCoords(displayedMeasureRange.end) - getXCoords(displayedMeasureRange.start))} 
                  height={height - padTop - padBottom} 
                  fill={isImPlotTheme ? "#df9f2415" : "#eab30810"} 
                  stroke={isImPlotTheme ? "#df9f243a" : "#eab3082a"}
                  strokeWidth="1"
                />
                <line 
                  x1={getXCoords(displayedMeasureRange.start)} 
                  y1={padTop} 
                  x2={getXCoords(displayedMeasureRange.start)} 
                  y2={height - padBottom} 
                  stroke={isImPlotTheme ? "#f59e0b" : "#eab308"} 
                  strokeWidth="1.2" 
                  strokeDasharray="3,2" 
                />
                <line 
                  x1={getXCoords(displayedMeasureRange.end)} 
                  y1={padTop} 
                  x2={getXCoords(displayedMeasureRange.end)} 
                  y2={height - padBottom} 
                  stroke={isImPlotTheme ? "#f1c40f" : "#f59e0b"} 
                  strokeWidth="1.2" 
                  strokeDasharray="3,2" 
                />
              </g>
            )}

            {/* Segment Markers icons */}
            {displayedMeasureRange && (
              <>
                <g transform={`translate(${getXCoords(displayedMeasureRange.start)}, ${padTop - 4})`}>
                  <polygon points="-6,-10 6,-10 6,-2 -6,-2" fill={isImPlotTheme ? "#df9f24" : "#eab308"} />
                  <polygon points="-6,-2 6,-2 0,2" fill={isImPlotTheme ? "#df9f24" : "#eab308"} />
                  <text y="-4" fill="#000" fontSize="7" fontWeight="bold" textAnchor="middle" fontFamily="monospace">A</text>
                </g>
                <g transform={`translate(${getXCoords(displayedMeasureRange.end)}, ${padTop - 4})`}>
                  <polygon points="-6,-10 6,-10 6,-2 -6,-2" fill={isImPlotTheme ? "#eab308" : "#f59e0b"} />
                  <polygon points="-6,-2 6,-2 0,2" fill={isImPlotTheme ? "#eab308" : "#f59e0b"} />
                  <text y="-4" fill="#000" fontSize="7" fontWeight="bold" textAnchor="middle" fontFamily="monospace">B</text>
                </g>
              </>
            )}

            {/* Vertical line crosshair syncing times */}
            {plotMode === 'hover' && hoverTime !== null && hoverTime >= displayXMin && hoverTime <= displayXMax && (
              <line
                x1={getXCoords(hoverTime)}
                y1={padTop}
                x2={getXCoords(hoverTime)}
                y2={height - padBottom}
                stroke={isImPlotTheme ? "#ef444466" : "#64748b66"}
                strokeWidth="1"
                strokeDasharray="3,3"
              />
            )}
          </svg>
        )}

        {/* Hover cursors details tooltip */}
        {isHoverActiveOnThisPlot && (
          <div 
            className={`absolute z-10 pointer-events-none p-2.5 border rounded-lg backdrop-blur-md shadow-2xl text-[10px] font-mono flex flex-col gap-1 w-44 ${
              theme === 'light'
              ? 'bg-white/95 border-slate-200 text-slate-800 shadow-slate-300/40'
              : 'bg-slate-950/90 border-slate-900 text-slate-300'
            }`}
            style={{ 
              left: `${Math.min(hoverPosition.x + 15, width - 110)}px`, 
              top: `${Math.min(hoverPosition.y - 10, height - 90)}px`,
            }}
          >
            <div className={`font-semibold border-b pb-0.5 mb-1 flex justify-between ${
              theme === 'light' ? 'text-sky-655 border-slate-200' : 'text-sky-400 border-slate-900'
            }`}>
              <span>Time:</span> <span>{(hoveredData.time * 1000).toFixed(3)} ms</span>
            </div>
            {Object.entries(hoveredData.values).map(([trace, val]) => (
              <div key={trace} className="flex justify-between items-center gap-2">
                <span className="truncate max-w-[100px] text-slate-400" style={{ color: getTraceColor(trace) }}>{formatTraceLabel(trace)}:</span>
                <span className={`font-bold ${theme === 'light' ? 'text-slate-900' : 'text-slate-100'}`}>{(val as number).toFixed(4)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );

    if (isStacked) {
      return (
        <div 
          key={subplot.id} 
          className={`flex flex-row gap-0 relative transition-all ${
            idx === stackLength - 1 ? '' : (theme === 'light' ? 'border-b border-slate-200' : 'border-b border-slate-900')
          } ${
            theme === 'light' ? 'bg-white text-slate-800' : 'bg-slate-950 text-slate-200'
          }`}
        >
          {/* Left panel: Controls (width: w-60) */}
          <div className={`w-60 shrink-0 p-3 flex flex-col justify-start gap-3 border-r ${
            theme === 'light' ? 'border-slate-200 bg-slate-50/30' : 'border-slate-900 bg-slate-900/10'
          }`}>
            <div className="flex flex-col gap-2.5">
              {/* Lane Identifier & Title / Rename */}
              <div className="flex items-center gap-1.5 justify-between">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`text-[9px] font-mono font-bold border px-1.5 py-0.5 rounded shrink-0 ${
                    theme === 'light'
                    ? 'bg-slate-100 border-slate-200 text-slate-500'
                    : 'bg-slate-900/60 border-slate-800 text-slate-450'
                  }`}>{isInsideScopeTab ? "CH" : "LANE"} {idx + 1}</span>
                  
                  {isInsideScopeTab ? (
                    <span className="text-[11px] font-bold text-sky-400 truncate">{subplot.title}</span>
                  ) : (
                    <input 
                      type="text"
                      value={subplot.title}
                      onChange={(e) => renameSubplot(subplot.id, e.target.value)}
                      className={`text-[11px] font-bold bg-transparent outline-none border-b border-transparent pb-0.5 w-full transition-all truncate ${
                        theme === 'light'
                        ? 'text-slate-800 hover:border-slate-350 focus:border-sky-500 placeholder-slate-450'
                        : 'text-slate-250 hover:border-slate-800 focus:border-sky-500 placeholder-slate-650'
                      }`}
                      placeholder="Name lane..."
                    />
                  )}
                </div>

                {!isInsideScopeTab && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button 
                      onClick={() => moveSubplotOrder(idx, 'up')}
                      disabled={idx === 0}
                      className={`p-0.5 disabled:opacity-25 rounded transition-all cursor-pointer ${
                        theme === 'light' ? 'hover:bg-slate-200 text-slate-500' : 'text-slate-400 hover:bg-slate-850'
                      }`}
                      title="Move up"
                    >
                      <ArrowUp className="h-2.5 w-2.5" />
                    </button>
                    <button 
                      onClick={() => moveSubplotOrder(idx, 'down')}
                      disabled={idx === subplots.length - 1}
                      className={`p-0.5 disabled:opacity-25 rounded transition-all cursor-pointer ${
                        theme === 'light' ? 'hover:bg-slate-200 text-slate-500' : 'text-slate-400 hover:bg-slate-850'
                      }`}
                      title="Move down"
                    >
                      <ArrowDown className="h-2.5 w-2.5" />
                    </button>
                    {subplots.length > 1 && (
                      <button 
                        onClick={() => deleteSubplotById(subplot.id)}
                        className={`p-0.5 rounded transition-all cursor-pointer ${
                          theme === 'light' ? 'text-slate-450 hover:text-rose-500 hover:bg-slate-100' : 'text-slate-500 hover:text-rose-450 hover:bg-slate-855'
                        }`}
                        title="Delete"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Tool Selection for this plot */}
              <div className={`flex border rounded p-0.5 gap-0.5 text-[8.5px] font-semibold select-none transition-all ${
                theme === 'light'
                ? 'bg-slate-100/50 border-slate-200 shadow-sm'
                : 'bg-slate-950/80 border-slate-850'
              }`}>
                <button
                  onClick={() => setPlotMode('hover')}
                  className={`flex-1 text-center py-0.5 rounded cursor-pointer transition-all ${
                    plotMode === 'hover' 
                    ? (theme === 'light' ? 'bg-white text-sky-600 font-bold shadow-sm' : 'bg-sky-500/15 text-sky-400 font-bold border border-sky-500/20') 
                    : (theme === 'light' ? 'text-slate-500 hover:text-slate-800' : 'text-slate-500 hover:text-slate-350')
                  }`}
                  title="Probe mode"
                >
                  Probe
                </button>
                <button
                  onClick={() => setPlotMode('zoom')}
                  className={`flex-1 text-center py-0.5 rounded cursor-pointer transition-all ${
                    plotMode === 'zoom' 
                    ? (theme === 'light' ? 'bg-white text-indigo-600 font-bold shadow-sm' : 'bg-indigo-500/15 text-indigo-400 font-bold border border-indigo-500/30') 
                    : (theme === 'light' ? 'text-slate-500 hover:text-slate-800' : 'text-slate-500 hover:text-slate-355')
                  }`}
                  title="Zoom mode"
                >
                  Zoom
                </button>
                <button
                  onClick={() => setPlotMode('pan')}
                  className={`flex-1 text-center py-0.5 rounded cursor-pointer transition-all ${
                    plotMode === 'pan' 
                    ? (theme === 'light' ? 'bg-white text-emerald-600 font-bold shadow-sm' : 'bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/30') 
                    : (theme === 'light' ? 'text-slate-500 hover:text-slate-800' : 'text-slate-500 hover:text-slate-350')
                  }`}
                  title="Pan mode"
                >
                  Pan
                </button>
                <button
                  onClick={() => {
                    setPlotMode('measure');
                    if (!globalMeasureRange) {
                      const tData = simResults?.time || [0, 0.01];
                      setGlobalMeasureRange({ start: tData[0], end: tData[tData.length-1] });
                    }
                  }}
                  className={`flex-1 text-center py-0.5 rounded cursor-pointer transition-all ${
                    plotMode === 'measure' 
                    ? (theme === 'light' ? 'bg-white text-yellow-600 font-bold shadow-sm' : 'bg-yellow-500/15 text-yellow-500 font-bold border border-yellow-500/30') 
                    : (theme === 'light' ? 'text-slate-500 hover:text-slate-800' : 'text-slate-500 hover:text-slate-350')
                  }`}
                  title="Cursors mode"
                >
                  Cursors
                </button>
              </div>

              {/* Autofit Options */}
              <div className={`flex border rounded p-0.5 gap-0.5 text-[8.5px] font-semibold select-none transition-all ${
                theme === 'light'
                ? 'bg-slate-100/50 border-slate-200 shadow-sm'
                : 'bg-slate-950/80 border-slate-850'
              }`}>
                <button
                  onClick={() => {
                    if (syncXZoom) {
                      setGlobalZoomX(null);
                    } else {
                      setZoomRangesX({ ...zoomRangesX, [subplot.id]: null });
                    }
                  }}
                  className={`flex-1 text-center py-0.5 rounded cursor-pointer transition-all ${
                    theme === 'light' ? 'text-slate-655 hover:text-slate-900 hover:bg-white/60' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                  }`}
                >
                  Fit X
                </button>
                <button
                  onClick={() => {
                    setZoomRangesY({ ...zoomRangesY, [subplot.id]: null });
                  }}
                  className={`flex-1 text-center py-0.5 rounded cursor-pointer transition-all ${
                    theme === 'light' ? 'text-slate-655 hover:text-slate-900 hover:bg-white/60' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                  }`}
                >
                  Fit Y
                </button>
                <button
                  onClick={() => {
                    if (syncXZoom) {
                      setGlobalZoomX(null);
                    } else {
                      setZoomRangesX({ ...zoomRangesX, [subplot.id]: null });
                    }
                    setZoomRangesY({ ...zoomRangesY, [subplot.id]: null });
                  }}
                  className={`flex-1 text-center py-0.5 rounded cursor-pointer font-bold transition-all ${
                    theme === 'light' ? 'text-sky-600 hover:text-sky-700 hover:bg-white/60' : 'text-sky-400 hover:text-sky-300 hover:bg-slate-900/40'
                  }`}
                >
                  All
                </button>
              </div>
            </div>

            {/* Trace Selection and Statistics */}
            <div className="flex flex-col gap-2 overflow-y-auto max-h-[120px] pr-1 scrollbar-thin">
              {/* Statistics for measurement segment if active */}
              {displayedMeasureRange && activeTraces.length > 0 && (
                <div className={`p-1.5 rounded text-[8.5px] font-mono border ${
                  theme === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-slate-900/50 border-slate-850'
                }`}>
                  <div className={`font-bold border-b pb-0.5 mb-1 text-[8px] flex justify-between ${
                    theme === 'light' ? 'text-amber-700 border-slate-200' : 'text-amber-500 border-slate-855'
                  }`}>
                    <span>dt: {((displayedMeasureRange.end - displayedMeasureRange.start) * 1000).toFixed(3)} ms</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {activeTraces.slice(0, 3).map(tr => {
                      const stats = getSegmentStatsForTrace(tr, displayedMeasureRange.start, displayedMeasureRange.end);
                      if (!stats) return null;
                      return (
                        <div key={`seg-stat-${subplot.id}-${tr}`} className="flex justify-between items-center text-[7.5px]">
                          <span className="truncate max-w-[65px]" style={{ color: getTraceColor(tr) }}>{formatTraceLabel(tr)}:</span>
                          <span className="text-slate-400 shrink-0 font-bold">
                            avg:{stats.average.toFixed(2)} rms:{stats.rms.toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Trace Selection Chips */}
              {!isInsideScopeTab && (
                <div className="flex flex-col gap-1">
                  <span className="text-[8px] font-mono font-bold text-slate-500 uppercase tracking-wide">Signals:</span>
                  <div className="flex flex-wrap gap-1">
                    {availableTraces.map(trace => {
                      const isChecked = subplot.traces.includes(trace);
                      const color = getTraceColor(trace);
                      return (
                        <button
                          key={`filter-${subplot.id}-${trace}`}
                          onClick={() => toggleTraceSelection(subplot.id, trace)}
                          className={`px-1.5 py-0.5 rounded text-[8px] border font-semibold font-mono transition-all flex items-center gap-1 cursor-pointer ${
                            isChecked 
                            ? (theme === 'light' ? 'bg-slate-100 border-slate-350 text-slate-800' : 'bg-slate-900 border-slate-700 text-white') 
                            : (theme === 'light' ? 'border-slate-200 bg-slate-50/50 text-slate-500 hover:text-slate-700' : 'border-slate-950 bg-slate-950 text-slate-500 hover:text-slate-400')
                          }`}
                        >
                          <span className="h-1 w-1 rounded-full shrink-0" style={{ backgroundColor: color }} />
                          <span className="whitespace-nowrap">{trace.replace('_', ' ')}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right panel: SVG Canvas Grid */}
          <div className="flex-1 min-w-0 relative flex flex-col justify-center">
            {renderSvgCanvas()}
          </div>
        </div>
      );
    }

    return (
      <div key={subplot.id} className={`border rounded-xl p-4 flex flex-col gap-3 relative transition-all ${
        theme === 'light' 
        ? 'bg-white border-slate-200 text-slate-800 shadow-sm' 
        : 'bg-slate-950 border-slate-900 text-slate-200'
      }`}>
        {/* Layout Single Subplot Controls */}
        <div className={`flex flex-wrap items-center justify-between gap-3 p-2 rounded-lg border transition-all ${
          theme === 'light'
          ? 'bg-slate-50 border-slate-200'
          : 'bg-slate-900/30 border-slate-900'
        }`}>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className={`text-[10px] font-mono font-bold border px-1.5 py-0.5 rounded ${
              theme === 'light'
              ? 'bg-slate-100 border-slate-200 text-slate-500'
              : 'bg-slate-950 border-slate-900 text-slate-500'
            }`}>{isInsideScopeTab ? "CH" : "LANE"} {idx + 1}</span>
            {isInsideScopeTab ? (
              <span className="text-xs font-bold text-sky-400">{subplot.title}</span>
            ) : (
              <input 
                type="text"
                value={subplot.title}
                onChange={(e) => renameSubplot(subplot.id, e.target.value)}
                className={`text-xs font-bold bg-transparent outline-none border-b border-transparent pb-0.5 w-full sm:w-48 max-w-xs transition-all ${
                  theme === 'light'
                  ? 'text-slate-800 hover:border-slate-300 focus:border-sky-500 placeholder-slate-400'
                  : 'text-slate-200 hover:border-slate-800 focus:border-sky-500 placeholder-slate-600'
                }`}
                placeholder="Name this subplot..."
              />
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {/* Tool Selection for this plot */}
            <div className={`flex border rounded p-0.5 gap-0.5 text-[9px] font-semibold select-none transition-all ${
              theme === 'light'
              ? 'bg-slate-100 border-slate-200 shadow-sm'
              : 'bg-slate-950 border-slate-800'
            }`}>
              <button
                onClick={() => setPlotMode('hover')}
                className={`px-1.5 py-0.5 rounded cursor-pointer transition-all ${
                  plotMode === 'hover' 
                  ? (theme === 'light' ? 'bg-white text-sky-600 font-bold shadow-sm' : 'bg-sky-500/15 text-sky-400 font-bold border border-sky-500/20') 
                  : (theme === 'light' ? 'text-slate-500 hover:text-slate-800' : 'text-slate-500 hover:text-slate-300')
                }`}
                title="Probe mode"
              >
                Probe
              </button>
              <button
                onClick={() => setPlotMode('zoom')}
                className={`px-1.5 py-0.5 rounded cursor-pointer transition-all ${
                  plotMode === 'zoom' 
                  ? (theme === 'light' ? 'bg-white text-indigo-600 font-bold shadow-sm' : 'bg-indigo-500/15 text-indigo-400 font-bold border border-indigo-500/30') 
                  : (theme === 'light' ? 'text-slate-500 hover:text-slate-800' : 'text-slate-500 hover:text-slate-300')
                }`}
                title="Zoom mode"
              >
                Zoom
              </button>
              <button
                onClick={() => setPlotMode('pan')}
                className={`px-1.5 py-0.5 rounded cursor-pointer transition-all ${
                  plotMode === 'pan' 
                  ? (theme === 'light' ? 'bg-white text-emerald-600 font-bold shadow-sm' : 'bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/30') 
                  : (theme === 'light' ? 'text-slate-500 hover:text-slate-800' : 'text-slate-500 hover:text-slate-300')
                }`}
                title="Pan mode"
              >
                Pan
              </button>
              <button
                onClick={() => {
                  setPlotMode('measure');
                  if (!globalMeasureRange) {
                    const tData = simResults?.time || [0, 0.01];
                    setGlobalMeasureRange({ start: tData[0], end: tData[tData.length-1] });
                  }
                }}
                className={`px-1.5 py-0.5 rounded cursor-pointer transition-all ${
                  plotMode === 'measure' 
                  ? (theme === 'light' ? 'bg-white text-yellow-600 font-bold shadow-sm' : 'bg-yellow-500/15 text-yellow-550 font-bold border border-yellow-500/30') 
                  : (theme === 'light' ? 'text-slate-500 hover:text-slate-800' : 'text-slate-500 hover:text-slate-300')
                }`}
                title="Cursors mode"
              >
                Cursors
              </button>
            </div>

            {/* Autofit Options for this plot */}
            <div className={`flex border rounded p-0.5 gap-0.5 text-[9px] font-semibold select-none transition-all ${
              theme === 'light'
              ? 'bg-slate-100 border-slate-200 shadow-sm'
              : 'bg-slate-950 border-slate-800'
            }`}>
              <button
                onClick={() => {
                  if (syncXZoom) {
                    setGlobalZoomX(null);
                  } else {
                    setZoomRangesX({ ...zoomRangesX, [subplot.id]: null });
                  }
                }}
                className={`px-1.5 py-0.5 rounded cursor-pointer transition-all ${
                  theme === 'light' ? 'text-slate-600 hover:text-slate-900 hover:bg-white/60' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Fit X axis"
              >
                Fit X
              </button>
              <button
                onClick={() => {
                  setZoomRangesY({ ...zoomRangesY, [subplot.id]: null });
                }}
                className={`px-1.5 py-0.5 rounded cursor-pointer transition-all ${
                  theme === 'light' ? 'text-slate-600 hover:text-slate-900 hover:bg-white/60' : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Fit Y axis"
              >
                Fit Y
              </button>
              <button
                onClick={() => {
                  if (syncXZoom) {
                    setGlobalZoomX(null);
                  } else {
                    setZoomRangesX({ ...zoomRangesX, [subplot.id]: null });
                  }
                  setZoomRangesY({ ...zoomRangesY, [subplot.id]: null });
                }}
                className={`px-1.5 py-0.5 rounded cursor-pointer font-bold transition-all ${
                  theme === 'light' ? 'text-sky-600 hover:text-sky-700 hover:bg-white/60' : 'text-sky-400 hover:text-sky-300'
                }`}
                title="Fit X and Y axes"
              >
                Fit All
              </button>
            </div>

            {!isInsideScopeTab && (
              <>
                {/* Lane position shifts */}
                <div className={`flex rounded border p-0.5 items-center transition-all ${
                  theme === 'light'
                  ? 'bg-slate-100 border-slate-200'
                  : 'bg-slate-950 border-slate-850'
                }`}>
                  <button 
                    onClick={() => moveSubplotOrder(idx, 'up')}
                    disabled={idx === 0}
                    className={`p-1 disabled:opacity-30 rounded transition-all cursor-pointer ${
                      theme === 'light' ? 'hover:bg-slate-200 text-slate-500 hover:text-slate-800' : 'hover:text-white text-slate-400 hover:bg-slate-900'
                    }`}
                    title="Move lane up"
                  >
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button 
                    onClick={() => moveSubplotOrder(idx, 'down')}
                    disabled={idx === subplots.length - 1}
                    className={`p-1 disabled:opacity-30 rounded transition-all cursor-pointer ${
                      theme === 'light' ? 'hover:bg-slate-200 text-slate-500 hover:text-slate-800' : 'hover:text-white text-slate-400 hover:bg-slate-900'
                    }`}
                    title="Move lane down"
                  >
                    <ArrowDown className="h-3 w-3" />
                  </button>
                </div>

                {subplots.length > 1 && (
                  <button 
                    onClick={() => deleteSubplotById(subplot.id)}
                    className={`p-1 rounded transition-all cursor-pointer ${
                      theme === 'light' ? 'text-slate-400 hover:text-rose-500 hover:bg-slate-100' : 'text-slate-500 hover:text-rose-450 hover:bg-slate-900'
                    }`}
                    title="Delete lane"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Graphics Plot SVG view screen */}
        {renderSvgCanvas()}

        {/* Subplot trace toggles chips selection */}
        {!isInsideScopeTab && (
          <div className={`flex flex-col gap-1.5 mt-1 border-t pt-3 ${theme === 'light' ? 'border-slate-200' : 'border-slate-900'}`}>
            <span className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wide">💡 Add / Remove Signals in Plot {idx + 1}:</span>
            <div className="flex flex-wrap gap-2">
              {availableTraces.map(trace => {
                const isChecked = subplot.traces.includes(trace);
                const color = getTraceColor(trace);
                return (
                  <button
                    key={`filter-${subplot.id}-${trace}`}
                    onClick={() => toggleTraceSelection(subplot.id, trace)}
                    className={`px-2 py-1 rounded-full text-[10px] border font-bold font-mono transition-all flex items-center gap-1.5 cursor-pointer hover:scale-[1.02] active:scale-95 ${
                      isChecked 
                      ? (theme === 'light' ? 'bg-slate-100 border-slate-350 text-slate-800 shadow-sm' : 'bg-slate-900 border-slate-700 text-white shadow-md') 
                      : (theme === 'light' ? 'border-slate-200 bg-slate-50 text-slate-550 hover:text-slate-750 hover:border-slate-350' : 'border-slate-950 bg-slate-950 text-slate-600 hover:text-slate-400 hover:border-slate-900')
                    }`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
                    {trace.replace('_', ' ')}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Statistics for measurement segment if active */}
        {displayedMeasureRange && activeTraces.length > 0 && (
          <div className={`p-2 rounded-lg text-[10px] font-mono transition-all border ${
            theme === 'light'
            ? 'bg-slate-50/50 border-slate-200'
            : 'bg-slate-900/10 border-slate-900'
          }`}>
            <div className={`flex justify-between items-center text-[9px] font-bold border-b pb-1 mb-1.5 ${
              theme === 'light' ? 'text-amber-600 border-slate-205' : 'text-amber-500 border-slate-900'
            }`}>
              <span>📊 SELECTION SEGMENT STATS [A ↔ B]</span>
              <span>dt: {((displayedMeasureRange.end - displayedMeasureRange.start) * 1000).toFixed(4)} ms</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {activeTraces.map(tr => {
                const stats = getSegmentStatsForTrace(tr, displayedMeasureRange.start, displayedMeasureRange.end);
                if (!stats) return null;
                return (
                  <div key={`seg-stat-${subplot.id}-${tr}`} className={`p-1.5 rounded border flex justify-between gap-2 overflow-hidden text-[9px] ${
                    theme === 'light'
                    ? 'bg-white border-slate-200 text-slate-700'
                    : 'bg-slate-950/60 border-slate-900 text-slate-300'
                  }`}>
                    <span className="text-slate-400 truncate" style={{ color: getTraceColor(tr) }}>{formatTraceLabel(tr)}:</span>
                    <div className={`flex gap-2 font-bold ${theme === 'light' ? 'text-slate-700' : 'text-slate-300'}`}>
                      <span>avg:<strong className={theme === 'light' ? 'text-amber-700' : 'text-amber-550'}>{stats.average.toFixed(3)}</strong></span>
                      <span>rms:<strong className={theme === 'light' ? 'text-emerald-700' : 'text-emerald-450'}>{stats.rms.toFixed(3)}</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderScopePlotterView = (scopeId: string) => {
    const scopeComp = state.components.find(c => c.id === scopeId);
    if (!scopeComp) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-950 rounded-xl border border-slate-900 min-h-[400px]">
          <X className="h-8 w-8 text-rose-500 mb-2" />
          <p className="text-xs font-bold text-slate-400">Scope component '{scopeId}' not found in schematic.</p>
        </div>
      );
    }

    const numChannels = parseInt(scopeComp.parameters?.channels) || 2;
    const channels: string[] = [];
    for (let i = 1; i <= numChannels; i++) {
      channels.push(`${scopeId}.In${i}`);
    }

    const isOverlay = scopeOverlayModes[scopeId] || false;

    // Check if simulation results are available
    if (!simResults) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500 border border-dashed border-slate-900 rounded-xl bg-slate-950/45 p-8 min-h-[450px]">
          <Activity className="h-10 w-10 text-slate-800 animate-pulse mb-3" />
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Oscilloscope ready: {scopeId}</p>
          <p className="text-[10px] text-slate-500 mt-1 max-w-sm text-center leading-relaxed">
            Run the simulation from the schematic editor or the solver tab to view the live waveforms on this oscilloscope screen.
          </p>
        </div>
      );
    }

    // Calculate stats for each channel
    const channelsStats = channels.map((trace) => {
      const data = getTraceData(trace);
      const source = resolveInputPinToSource(trace);
      if (!data || data.length === 0) {
        return { trace, source, min: 0, max: 0, mean: 0, rms: 0, vpp: 0 };
      }
      const min = Math.min(...data);
      const max = Math.max(...data);
      const mean = data.reduce((a, b) => a + b, 0) / data.length;
      const rms = calculateRMS(data);
      return { trace, source, min, max, mean, rms, vpp: max - min };
    });

    return (
      <div className="flex-1 flex flex-col lg:flex-row gap-6 w-full">
        {/* Left Side: Scope Statistics & Information */}
        <section className={`w-full lg:w-[320px] shrink-0 flex flex-col gap-4 p-4 rounded-xl border transition-all ${
          theme === 'light' ? 'bg-white border-slate-200 shadow-sm text-slate-800' : 'bg-slate-950/20 border-slate-900 text-slate-100'
        }`}>
          <div className="text-xs font-bold text-emerald-500 flex items-center gap-1.5 border-b border-slate-900 pb-2 mb-1 uppercase">
            <Activity className="h-4.5 w-4.5" />
            <span>Oscilloscope Controls</span>
          </div>

          {/* Scope details */}
          <div className="flex flex-col gap-2.5">
            <div className="text-[11px] font-bold text-slate-450">Device configuration:</div>
            <div className={`p-3 rounded-lg border text-xxs font-mono flex flex-col gap-2 ${
              theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-slate-900/30 border-slate-900 text-slate-400'
            }`}>
              <div className="flex justify-between">
                <span>Scope Identifier:</span>
                <span className="text-sky-400 font-bold">{scopeId}</span>
              </div>
              <div className="flex justify-between">
                <span>Signal Channels:</span>
                <span className="text-emerald-400 font-bold">{numChannels} CH</span>
              </div>
            </div>
          </div>

          {/* Mode toggles */}
          <div className="flex flex-col gap-2">
            <div className="text-[11px] font-bold text-slate-450">Display Layout Mode:</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setScopeOverlayModes({ ...scopeOverlayModes, [scopeId]: false })}
                className={`py-1.5 text-[10px] rounded font-bold border transition-all cursor-pointer ${
                  !isOverlay
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : (theme === 'light' ? 'bg-white text-slate-600 border-slate-350 hover:bg-slate-50' : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-300')
                }`}
              >
                Stacked Channels
              </button>
              <button
                onClick={() => setScopeOverlayModes({ ...scopeOverlayModes, [scopeId]: true })}
                className={`py-1.5 text-[10px] rounded font-bold border transition-all cursor-pointer ${
                  isOverlay
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                    : (theme === 'light' ? 'bg-white text-slate-600 border-slate-350 hover:bg-slate-50' : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-300')
                }`}
              >
                Overlay Channels
              </button>
            </div>
          </div>

          {/* Statistics table */}
          <div className="flex flex-col gap-2.5 mt-2 flex-1 overflow-y-auto">
            <div className="text-[11px] font-bold text-slate-450 uppercase tracking-wider">Waveform Metrics (Full Run):</div>
            {channelsStats.map((stat, idx) => (
              <div key={stat.trace} className={`p-3 rounded-lg border flex flex-col gap-2 ${
                theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/35 border-slate-900/50'
              }`}>
                <div className="flex items-center justify-between border-b border-slate-850 pb-1 mb-1.5">
                  <span className="text-[10px] font-bold text-sky-400">CH {idx + 1} ({stat.trace.split('.')[1]})</span>
                  <span className="text-[9px] font-mono text-slate-500 truncate max-w-[120px]">{stat.source || "Floating"}</span>
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[9.5px] font-mono text-slate-400">
                  <div className="flex justify-between">
                    <span>Min:</span>
                    <span className="text-slate-350 font-bold">{stat.min.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Max:</span>
                    <span className="text-slate-350 font-bold">{stat.max.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Vpp:</span>
                    <span className="text-slate-355 font-bold">{stat.vpp.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Mean:</span>
                    <span className="text-slate-355 font-bold">{stat.mean.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between col-span-2 border-t border-slate-900/30 pt-1 mt-0.5">
                    <span>RMS value:</span>
                    <span className="text-emerald-400 font-bold">{stat.rms.toFixed(4)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Right Side: Reconfigurable scope waveform displays */}
        <section className={`flex-1 flex flex-col gap-4 p-4 rounded-xl min-w-0 border transition-all ${
          theme === 'light' ? 'bg-white border-slate-200 shadow-sm text-slate-800' : 'bg-slate-950/20 border-slate-900 text-slate-100'
        }`}>
          <div className="flex items-center justify-between border-b border-slate-900 pb-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase">
              <BarChart2 className="h-4.5 w-4.5 text-emerald-400 animate-pulse" />
              <span>🔬 {scopeId} Dedicated Oscilloscope screen</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-bold">
              <button
                onClick={resetAllPlotZoom}
                className={`px-3 py-1.5 rounded border transition-all cursor-pointer ${
                  theme === 'light'
                    ? 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
                    : 'bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-300'
                }`}
              >
                Fit Viewport Zoom
              </button>
              <button
                onClick={exportCombinedSVG}
                className={`px-3 py-1.5 rounded flex items-center gap-1.5 cursor-pointer transition-all border ${
                  theme === 'light'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                  : 'bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-400 border-emerald-400/20 hover:border-emerald-400/30'
                }`}
                title="Export oscilloscope screen channel plots as a combined SVG image"
              >
                <FileCode className="h-3.5 w-3.5" />
                Export SVG Plot
              </button>
              <button
                onClick={exportCombinedCSV}
                className={`px-3 py-1.5 rounded flex items-center gap-1.5 cursor-pointer transition-all border ${
                  theme === 'light'
                  ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                  : 'bg-amber-500/10 hover:bg-amber-500/15 text-amber-450 border-amber-400/20 hover:border-amber-400/30'
                }`}
                title="Export full simulation data for all scope channels in a single CSV file"
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV Data
              </button>
            </div>
          </div>

          <div className={isOverlay ? "flex-1 flex flex-col gap-5" : `flex-1 flex flex-col gap-0 border rounded-xl overflow-hidden shadow-md ${theme === 'light' ? 'border-slate-200 shadow-slate-100' : 'border-slate-900 shadow-slate-950/20'}`}>
            {isOverlay ? (
              // Overlay: render all channels in a single plot
              renderSinglePlot({
                id: `${scopeId}_overlay`,
                title: `Overlay View [CH 1 - CH ${numChannels}]`,
                traces: channels
              }, 0)
            ) : (
              // Stacked: render one subplot per channel
              channels.map((chan, idx) => (
                renderSinglePlot({
                  id: `${scopeId}_channel_${idx + 1}`,
                  title: `${scopeId} Channel ${idx + 1} Input Signal`,
                  traces: [chan]
                }, idx)
              ))
            )}
          </div>
        </section>
      </div>
    );
  };

  const parsedSchema = getParsedSchemaSummary();

  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-200 ${theme === 'light' ? 'light-mode bg-slate-50 text-slate-900' : 'bg-[#040711] text-slate-100'}`}>
      {/* Dynamic Ambient back-glow elements */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
      {/* Compact Combined Header & Tab Navigation Row */}
      <header className="bg-slate-950/80 border-b border-slate-900 sticky top-0 z-50 backdrop-blur-md">
        <div className="max-w-full mx-auto px-4 md:px-8 py-2.5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('schematic')}
              className={`h-9 px-4 text-xs font-bold font-sans rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'schematic'
                  ? 'bg-sky-500/10 text-sky-450 border border-sky-500/30'
                  : 'border border-transparent text-slate-400 hover:text-slate-250 hover:bg-slate-900/40'
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              <span>Diagram Schematic Editor</span>
            </button>
            <button
              onClick={() => setActiveTab('simulator')}
              className={`h-9 px-4 text-xs font-bold font-sans rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === 'simulator'
                  ? 'bg-sky-500/10 text-sky-450 border border-sky-500/30'
                  : 'border border-transparent text-slate-400 hover:text-slate-250 hover:bg-slate-900/40'
              }`}
            >
              <Activity className="h-4 w-4" />
              <span>Waveform Solver Plotter</span>
            </button>
            {openScopeTabs.map((tab) => (
              <div key={tab.scopeId} className="flex items-center relative group">
                <button
                  onClick={() => setActiveTab(tab.scopeId)}
                  className={`h-9 pl-4 pr-2.5 text-xs font-bold font-sans rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeTab === tab.scopeId
                      ? 'bg-emerald-500/10 text-emerald-450 border border-emerald-500/30'
                      : 'border border-transparent text-slate-400 hover:text-slate-250 hover:bg-slate-900/40'
                  }`}
                >
                  <Activity className="h-3.5 w-3.5 text-emerald-450" />
                  <span>{tab.name}</span>
                  <X 
                    className="h-3.5 w-3.5 hover:text-rose-500 transition-colors ml-1 p-0.5 rounded hover:bg-slate-900/60 font-bold"
                    onClick={(e) => closeScopeTab(tab.scopeId, e)}
                  />
                </button>
              </div>
            ))}
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            {/* Realtime API status */}
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 border border-slate-800 bg-slate-900/60 rounded-full text-xxs font-semibold">
              <span className={`h-2 w-2 rounded-full ${serverStatus === 'error' ? 'bg-rose-500' : 'bg-emerald-500 animate-ping'}`} />
              <span className="text-slate-400">
                {serverStatus === 'compiling' ? 'Compiling C++ Solver Core...' : 
                 serverStatus === 'error' ? 'C++ Solver: Compilation Error' : 'C++ Core: Optimized -O3 Ready'}
              </span>
            </div>

            <select 
              className="px-3 py-1.5 border border-slate-800 bg-slate-900 text-xs font-semibold rounded-lg text-slate-200 outline-none focus:border-sky-500 cursor-pointer transition-all"
              onChange={(e) => loadTemplate(e.target.value)}
              value={loadedFileName ? "uploaded" : selectedTemplateKey}
            >
              <option value="empty">-- Empty Workspace --</option>
              <option value="buck_converter">Template: Closed-Loop Buck Converter</option>
              <option value="lc_resonance">Template: LC Resonance Shock ringing</option>
              <option value="ac_rectifier">Template: AC to DC Rectifier & Filter</option>
              <option value="h_bridge_inverter">Template: MOSFET AC H-Bridge Inverter</option>
              {loadedFileName && (
                <option value="uploaded">Uploaded: {loadedFileName}</option>
              )}
            </select>

            <button 
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-1.5 border border-slate-800 hover:border-slate-700 bg-slate-900/60 hover:bg-slate-900 rounded-full text-slate-400 hover:text-slate-200 transition-all cursor-pointer shadow-md flex items-center justify-center hover:scale-[1.05] active:scale-95 duration-100"
              title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4 text-yellow-450 animate-spin-slow" /> : <Moon className="h-4 w-4 text-sky-500" />}
            </button>

            <button 
              onClick={() => setIsVisualFlowOpen(true)}
              className="px-4 py-1.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold rounded-lg text-xs flex items-center gap-2 shadow-xl shadow-emerald-500/5 active:scale-95 border border-emerald-400/20 cursor-pointer"
              title="Open Real-time Visual Flow & Subplot Analyzer Window"
            >
              <Play className="h-3.5 w-3.5 fill-current animate-pulse text-white" />
              <span>VISUAL FLOW WINDOW</span>
            </button>

            <button 
              onClick={runCppSimulation}
              disabled={isLoading}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 shadow-xl shadow-sky-500/5 cursor-pointer select-none transition-all ${
                isLoading 
                ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed' 
                : 'bg-gradient-to-r from-sky-500 to-sky-600 text-white font-bold hover:shadow-sky-500/10 active:scale-95 border border-sky-400/20'
              }`}
            >
              <Play className="h-4 w-4 fill-current" />
              {isLoading ? "RUNNING C++..." : "RUN SOLVER"}
            </button>

            {isLoading && activeSessionId && (
              <>
                <button
                  onClick={pauseResumeSimulation}
                  className="px-3 py-1.5 border border-yellow-500/30 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/25 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-md duration-100"
                  title={isPaused ? "Resume simulation" : "Pause simulation"}
                >
                  {isPaused ? <Play className="h-3.5 w-3.5 fill-current text-yellow-400" /> : <Pause className="h-3.5 w-3.5 fill-current text-yellow-400" />}
                  <span>{isPaused ? "RESUME" : "PAUSE"}</span>
                </button>
                <button
                  onClick={terminateSimulation}
                  className="px-3 py-1.5 border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/25 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-md duration-100"
                  title="Terminate simulation and plot current data"
                >
                  <StopCircle className="h-3.5 w-3.5 text-red-400" />
                  <span>TERMINATE & PLOT</span>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {activeTab === 'schematic' ? (
        <div className="max-w-full w-full mx-auto px-4 md:px-8 py-6 flex-1 flex flex-col min-h-[760px]">
          <SchematicEditor 
            onRunSimulation={runSchematicSimulation} 
            availableTraces={extractAvailableTraces(simResults)}
            isLoading={isLoading}
            isPaused={isPaused}
            onPauseResume={pauseResumeSimulation}
            onTerminate={terminateSimulation}
          />
        </div>
      ) : activeTab === 'simulator' ? (
        /* Main Workspace Frame */
        <main className="flex-1 max-w-full w-full mx-auto px-4 md:px-8 py-6 flex flex-col lg:flex-row gap-6">
        
        {/* Left Hand: Netlist Design Workstation */}
        <section className="w-full lg:w-[380px] shrink-0 flex flex-col gap-4">
          
          {/* File input drag drop uploader */}
          <div 
            id="drag-drop-zone"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border rounded-xl p-5 text-center flex flex-col items-center justify-center gap-2 transition-all cursor-pointer ${
              isDragging 
              ? 'border-sky-400 bg-sky-950/35 shadow-xl shadow-sky-500/5' 
              : 'border-slate-900 bg-slate-950/50 hover:border-sky-500/40 hover:shadow-lg hover:shadow-sky-500/5'
            }`}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept=".json" 
              className="hidden" 
            />
            {loadedFileName ? (
              <div className="flex flex-col items-center gap-1.5">
                <div className="h-8 w-8 flex items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow">
                  <Check className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-emerald-400">Custom Workspace Netlist Loaded</p>
                  <p className="text-[9px] font-mono text-slate-500 mt-0.5 truncate max-w-[200px]">{loadedFileName}</p>
                </div>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    loadTemplate("buck_converter");
                  }}
                  className="px-2 py-0.5 text-[9px] font-bold border border-slate-800 hover:border-rose-500 hover:text-rose-400 bg-slate-950 rounded flex items-center gap-1 mt-1 transition-all cursor-pointer text-slate-500"
                >
                  <X className="h-2.5 w-2.5" />
                  Reset to Template
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <div className="p-2 border border-slate-900 bg-slate-950 rounded-lg text-slate-400 shadow">
                  <UploadCloud className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-300">Upload standard JSON netlist file</p>
                  <p className="text-[9.5px] text-slate-500 mt-0.5 max-w-[250px] leading-relaxed">
                    Drag & drop or <span className="text-sky-400 underline font-semibold">browse files</span>. Live parsing active!
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Pretty Text Netlist editor */}
          <div className="border border-slate-900 rounded-xl bg-slate-950/40 backdrop-blur-md p-4 flex flex-col gap-3 relative shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-900 pb-2.5">
              <div className="flex items-center gap-2 text-xs text-sky-400 font-bold">
                <FileCode className="h-4 w-4" />
                <span>RAW NETLIST SOURCE CODE</span>
              </div>
              <div className="flex items-center gap-1.5 text-[9px] text-slate-500 font-bold font-mono">
                {jsonError ? (
                  <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-500 border border-rose-500/20">Syntax Error</span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">Valid Netlist</span>
                )}
              </div>
            </div>

            <div className="relative">
              <textarea 
                className={`w-full h-80 p-3 font-mono text-[10.5px] bg-slate-950 border rounded-xl outline-none leading-relaxed transition-all ${
                  jsonError ? 'border-rose-550/40 text-rose-350 focus:border-rose-500' : 'border-slate-900 text-sky-300/90 focus:border-sky-500'
                }`}
                spellCheck="false"
                value={jsonText}
                onChange={(e) => {
                  setJsonText(e.target.value);
                  parseAndSyncNetlist(e.target.value);
                }}
              />
              {jsonError && (
                <div className="absolute bottom-2 left-2 right-2 p-2 bg-rose-950/80 backdrop-blur border border-rose-900 rounded-lg text-[9px] font-mono text-rose-300 pointer-events-none shadow">
                  <strong>Parser Alert:</strong> {jsonError}
                </div>
              )}
            </div>

            {/* Editor Action keys */}
            <div className="grid grid-cols-2 gap-2 mt-0.5 text-[10px] font-bold">
              <button
                onClick={formatJsonTextCode}
                className="px-3 py-1.5 border border-slate-900 hover:border-slate-800 bg-slate-950 hover:bg-slate-900 transition-all rounded-lg text-slate-300 cursor-pointer text-center select-none"
                title="Prettify JSON indentation"
              >
                Format Indents
              </button>
              <button
                onClick={copyNetlistToClipboard}
                className="px-3 py-1.5 border border-slate-900 hover:border-slate-800 bg-slate-950 hover:bg-slate-900 transition-all rounded-lg text-slate-300 cursor-pointer text-center select-none"
                title="Copy standard netlist to system clipboard"
              >
                Copy Code
              </button>
              <button
                onClick={downloadNetlistFile}
                className="px-3 py-1.5 border border-slate-900 hover:border-slate-800 bg-slate-950 hover:bg-slate-900 transition-all rounded-lg text-slate-300 cursor-pointer text-center select-none"
                title="Download active content as a .json file standard"
              >
                Download Netlist
              </button>
              <button
                onClick={() => setIsExtractionModalOpen(true)}
                className="px-3 py-1.5 border border-slate-900 hover:border-emerald-500/40 bg-slate-950 hover:bg-emerald-950/20 text-emerald-455 hover:text-emerald-300 transition-all rounded-lg cursor-pointer text-center select-none font-bold"
                title="Extract MNA equations for all operating modes (Complete Model + Ideal Switch Modes)"
              >
                Extract MNA & Modes
              </button>
            </div>
          </div>

          {/* Active parsed netlist representation elements (Visual readout of code) */}
          <div className="border border-slate-900 rounded-xl bg-slate-950/40 backdrop-blur-md p-4 flex flex-col gap-3 shadow-sm">
            <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5 border-b border-slate-900 pb-2 mb-1">
              <Activity className="h-4 w-4 text-emerald-400" />
              <span>Netlist Audit Inspector</span>
            </div>

            {parsedSchema.valid ? (
              <div className="flex flex-col gap-3">
                <div>
                  <div className="text-slate-500 font-bold text-[9px] tracking-wider uppercase mb-1.5 flex items-center gap-1.5 border-b border-slate-950 pb-1">
                    <Database className="h-3 w-3 text-sky-400" />
                    <span>🔌 PHYSICAL ELECTRICAL STAGE ({parsedSchema.physical.length} components)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-h-[120px] overflow-y-auto pr-1">
                    {parsedSchema.physical.map((c: any) => (
                      <div key={c.id} className="p-1.5 border border-slate-900 bg-slate-950/60 rounded flex flex-col gap-0.5 text-[9.5px] leading-tight">
                        <span className="font-bold text-white truncate">{c.label || c.id}</span>
                        <div className="flex items-center justify-between text-[8.5px] text-slate-500 font-mono">
                          <span>{c.type}</span>
                          <span className="text-sky-400 italic font-medium">{c.parameters?.C || c.parameters?.L || c.parameters?.value || ""}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-slate-500 font-bold text-[9px] tracking-wider uppercase mb-1.5 flex items-center gap-1.5 border-b border-slate-950 pb-1">
                    <SlidersHorizontal className="h-3 w-3 text-emerald-400" />
                    <span>🎛️ CONTROL LOGIC STAGE ({parsedSchema.control.length} blocks)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-h-[120px] overflow-y-auto pr-1">
                    {parsedSchema.control.map((c: any) => (
                      <div key={c.id} className="p-1.5 border border-slate-900 bg-slate-950/60 rounded flex flex-col gap-0.5 text-[9.5px] leading-tight">
                        <span className="font-bold text-slate-200 truncate">{c.label || c.id}</span>
                        <div className="flex items-center justify-between text-[8.5px] text-slate-500 font-mono">
                          <span>{c.type}</span>
                          <span className="text-emerald-400">{c.parameters?.Kp ? `Kp=${c.parameters.Kp}` : (c.parameters?.frequency ? `${c.parameters.frequency}` : "")}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-2.5 bg-rose-500/5 border border-rose-500/10 text-rose-450 text-[9.5px] rounded-lg font-mono leading-relaxed select-none">
                ⚠️ Interactive schematic audit unavailable. Provide error-free JSON netlist formatting above to reload structural inspector!
              </div>
            )}
          </div>
        </section>

        {/* Right Hand: Reconfigurable Waves Analyzer Station */}
        {/* Right Hand: Reconfigurable Waves Analyzer Station */}
        <section className={`flex-1 flex flex-col gap-4 p-4 rounded-xl min-w-0 border transition-all ${
          theme === 'light'
          ? 'bg-white border-slate-200 shadow-sm text-slate-800'
          : 'bg-slate-950/20 border-slate-900 text-slate-105'
        }`}>
          
          {/* Header Controls for Multi plotting configurations */}
          <div className={`flex flex-col gap-3 pb-4 border-b ${theme === 'light' ? 'border-slate-200' : 'border-slate-900'}`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-bold">
                <BarChart2 className="h-4.5 w-4.5 text-sky-450" />
                <span className={theme === 'light' ? 'text-slate-850' : 'text-slate-200'}>SOLVER RECONFIGURABLE WAVEFORMS ANALYZER</span>
              </div>

              {simResults && (
                <div className="flex flex-wrap gap-2 text-[10px] font-bold">
                  <button
                    onClick={addSubplot}
                    className={`px-2.5 py-1 rounded flex items-center gap-1.5 cursor-pointer transition-all border ${
                      theme === 'light'
                      ? 'bg-sky-50 border-sky-200 text-sky-650 hover:bg-sky-100'
                      : 'bg-sky-500/10 hover:bg-sky-500/15 text-sky-400 border-sky-400/20 hover:border-sky-400/30'
                    }`}
                  >
                    <Plus className="h-3 w-3" />
                    Add Plot Lane
                  </button>
                  <button
                    onClick={resetAllPlotZoom}
                    className={`px-2.5 py-1 rounded flex items-center gap-1 transition-all border ${
                      theme === 'light'
                      ? 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
                    }`}
                  >
                    Fit All Channels
                  </button>
                  <button
                    onClick={exportCombinedSVG}
                    className={`px-2.5 py-1 rounded flex items-center gap-1.5 cursor-pointer transition-all border ${
                      theme === 'light'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                      : 'bg-emerald-500/10 hover:bg-emerald-500/15 text-emerald-400 border-emerald-450/20 hover:border-emerald-400/30'
                    }`}
                    title="Export all plotted subplots as a single combined SVG image"
                  >
                    <FileCode className="h-3 w-3" />
                    Export SVG Plot
                  </button>
                  <button
                    onClick={exportCombinedCSV}
                    className={`px-2.5 py-1 rounded flex items-center gap-1.5 cursor-pointer transition-all border ${
                      theme === 'light'
                      ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                      : 'bg-amber-500/10 hover:bg-amber-500/15 text-amber-450 border-amber-450/20 hover:border-amber-400/30'
                    }`}
                    title="Export full simulation data for all plotted signals in a single CSV file"
                  >
                    <Download className="h-3 w-3" />
                    Export CSV Data
                  </button>
                </div>
              )}
            </div>

            {/* Layout control flags */}
            <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 text-xxs font-semibold py-2 px-3 rounded-lg border transition-all ${
              theme === 'light'
              ? 'bg-slate-50 border-slate-200/60 text-slate-600'
              : 'bg-slate-900/40 border-slate-900/40 text-slate-400'
            }`}>
              <div className="flex items-center gap-1.5">
                <input 
                  type="checkbox" 
                  id="overlay-opt"
                  checked={isGlobalOverlay}
                  onChange={(e) => setIsGlobalOverlay(e.target.checked)}
                  className="rounded bg-slate-950 text-sky-500 border-slate-800 focus:ring-0 cursor-pointer h-3.5 w-3.5"
                />
                <label htmlFor="overlay-opt" className={`cursor-pointer select-none ${theme === 'light' ? 'text-slate-700 font-bold' : 'text-slate-200'}`}>Unified Overlay Mode</label>
              </div>

              <div className={`flex items-center gap-1.5 border-l pl-4 ${theme === 'light' ? 'border-slate-200' : 'border-slate-900'}`}>
                <input 
                  type="checkbox" 
                  id="sync-zoom"
                  disabled={isGlobalOverlay}
                  checked={syncXZoom}
                  onChange={(e) => {
                    setSyncXZoom(e.target.checked);
                    setGlobalZoomX(null);
                    setZoomRangesX({});
                  }}
                  className="rounded bg-slate-950 text-sky-500 border-slate-800 focus:ring-0 cursor-pointer h-3.5 w-3.5 disabled:opacity-35"
                />
                <label htmlFor="sync-zoom" className={`cursor-pointer select-none disabled:opacity-35 ${theme === 'light' ? 'text-slate-700 font-bold' : 'text-slate-200'}`}>Lock X-Axes Zoom</label>
              </div>

              <div className={`flex items-center gap-1.5 border-l pl-4 ${theme === 'light' ? 'border-slate-200' : 'border-slate-900'}`}>
                <input 
                  type="checkbox" 
                  id="sync-hover"
                  checked={syncHover}
                  onChange={(e) => setSyncHover(e.target.checked)}
                  className="rounded bg-slate-950 text-sky-500 border-slate-800 focus:ring-0 cursor-pointer h-3.5 w-3.5"
                />
                <label htmlFor="sync-hover" className={`cursor-pointer select-none ${theme === 'light' ? 'text-slate-700 font-bold' : 'text-slate-200'}`}>Unified Probe Crosshair</label>
              </div>

              <div className={`flex items-center gap-1.5 border-l pl-4 ${theme === 'light' ? 'border-slate-200' : 'border-slate-900'}`}>
                <span className="text-[10px] text-slate-500">Layout:</span>
                <button
                  onClick={() => setLayoutMode(layoutMode === 'stacked' ? 'grid' : 'stacked')}
                  className={`px-1.5 py-0.5 border text-[9px] rounded font-bold transition-all cursor-pointer ${
                    layoutMode === 'grid' 
                    ? 'bg-sky-500/10 text-sky-400 border-sky-400/30' 
                    : (theme === 'light' ? 'bg-white text-slate-600 border-slate-350 hover:bg-slate-50' : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-300')
                  }`}
                >
                  {layoutMode === 'grid' ? "Side-by-Side Grid" : "Stacked Lanes"}
                </button>
                {layoutMode === 'stacked' && (
                  <button
                    onClick={() => setFitStack(!fitStack)}
                    className={`px-1.5 py-0.5 border text-[9px] rounded font-bold transition-all cursor-pointer ${
                      fitStack 
                      ? 'bg-sky-500/10 text-sky-400 border-sky-400/30' 
                      : (theme === 'light' ? 'bg-white text-slate-600 border-slate-350 hover:bg-slate-50' : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-300')
                    }`}
                  >
                    {fitStack ? "Fit Stack: ON" : "Fit Stack: OFF"}
                  </button>
                )}
              </div>

              <div className={`flex items-center gap-1.5 border-l pl-4 ${theme === 'light' ? 'border-slate-200' : 'border-slate-900'}`}>
                <span className="text-[10px] text-slate-500">Theme:</span>
                <button
                  onClick={() => setIsImPlotTheme(!isImPlotTheme)}
                  className={`px-1.5 py-0.5 border text-[9px] rounded font-bold transition-all cursor-pointer ${
                    isImPlotTheme 
                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/30' 
                    : (theme === 'light' ? 'bg-white text-slate-600 border-slate-350 hover:bg-slate-50' : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-300')
                  }`}
                >
                  {isImPlotTheme ? "📟 Dear ImGui / ImPlot" : "Pro Slate Viewport"}
                </button>
              </div>

              <div className={`ml-auto flex border rounded p-0.5 gap-0.5 text-[9px] font-semibold select-none transition-all ${
                theme === 'light'
                ? 'bg-slate-100 border-slate-200'
                : 'bg-slate-950 border-slate-850'
              }`}>
                <button
                  onClick={() => setPlotMode('hover')}
                  className={`px-2 py-0.5 rounded cursor-pointer transition-all ${
                    plotMode === 'hover' 
                    ? (theme === 'light' ? 'bg-white text-sky-600 font-bold shadow-sm' : 'bg-sky-500/15 text-sky-400 font-bold border border-sky-500/20') 
                    : (theme === 'light' ? 'text-slate-500 hover:text-slate-800' : 'text-slate-500 hover:text-slate-300')
                  }`}
                >
                  Probe
                </button>
                <button
                  onClick={() => setPlotMode('zoom')}
                  className={`px-2 py-0.5 rounded cursor-pointer transition-all ${
                    plotMode === 'zoom' 
                    ? (theme === 'light' ? 'bg-white text-indigo-600 font-bold shadow-sm' : 'bg-indigo-500/15 text-indigo-400 font-bold border border-indigo-500/30') 
                    : (theme === 'light' ? 'text-slate-500 hover:text-slate-800' : 'text-slate-500 hover:text-slate-300')
                  }`}
                >
                  Box Zoom
                </button>
                <button
                  onClick={() => setPlotMode('pan')}
                  className={`px-2 py-0.5 rounded cursor-pointer transition-all ${
                    plotMode === 'pan' 
                    ? (theme === 'light' ? 'bg-white text-emerald-600 font-bold shadow-sm' : 'bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/30') 
                    : (theme === 'light' ? 'text-slate-500 hover:text-slate-800' : 'text-slate-500 hover:text-slate-300')
                  }`}
                >
                  Pan
                </button>
                <button
                  onClick={() => {
                    setPlotMode('measure');
                    if (!globalMeasureRange) {
                      const tData = simResults?.time || [0, 0.01];
                      setGlobalMeasureRange({ start: tData[0], end: tData[tData.length-1] });
                    }
                  }}
                  className={`px-2 py-0.5 rounded cursor-pointer transition-all ${
                    plotMode === 'measure' 
                    ? (theme === 'light' ? 'bg-white text-yellow-600 font-bold shadow-sm' : 'bg-yellow-500/15 text-yellow-500 font-bold border border-yellow-500/30') 
                    : (theme === 'light' ? 'text-slate-500 hover:text-slate-800' : 'text-slate-500 hover:text-slate-300')
                  }`}
                >
                  Cursors
                </button>
              </div>
            </div>
          </div>

          {/* Core subplots grid / lanes lists */}
          {!simResults ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 border border-dashed border-slate-900 rounded-xl bg-slate-950 p-8 min-h-[350px]">
              <Activity className="h-10 w-10 text-slate-800 animate-pulse mb-3" />
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Dynamic closed-loop Transient engine ready</p>
              <p className="text-[10px] text-slate-500 mt-1 max-w-sm text-center leading-relaxed">
                Configure your circuit nodes, PI controller dynamics, switches, or loads inside the Netlist editor and press <span className="text-sky-400 font-semibold uppercase">Run Solver</span> to display subsecond waveform results.
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-4">
              {isGlobalOverlay ? (
                // Display single consolidated merged graph
                renderSinglePlot({ id: "unified", title: "Consolidated Solver Outputs", traces: [] }, 0)
              ) : (
                // Display individual subplots list
                <div className={layoutMode === 'grid' ? "grid grid-cols-1 xl:grid-cols-2 gap-5" : (subplots.length > 1 ? `flex flex-col gap-0 border rounded-xl overflow-hidden shadow-md ${theme === 'light' ? 'border-slate-200 shadow-slate-100' : 'border-slate-900 shadow-slate-950/20'}` : "flex flex-col gap-5")}>
                  {subplots.map((sp, idx) => renderSinglePlot(sp, idx))}
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    ) : (
      /* Scope Plotter Workspace Frame */
      <main className="flex-1 max-w-full w-full mx-auto px-4 md:px-8 py-6 flex flex-col lg:flex-row gap-6">
        {renderScopePlotterView(activeTab)}
      </main>
    )}
    {isVisualFlowOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-lg select-none animate-fade-in">
          <div className={`w-screen h-screen overflow-hidden flex flex-col ${theme === 'light' ? 'bg-slate-50' : 'bg-[#050711]'}`}>
            {/* Modal Body: Renders the SimulationPlayer */}
            <div className={`flex-1 overflow-hidden p-4 flex flex-col ${theme === 'light' ? 'bg-slate-50' : 'bg-[#050711]'}`}>
              <SimulationPlayer 
                simResults={simResults} 
                jsonText={jsonText}
                onRunSimulation={runSchematicSimulation} 
                subplots={subplots}
                theme={theme}
                onClose={() => setIsVisualFlowOpen(false)}
              />
            </div>
          </div>
        </div>
      )}
      {isExtractionModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-fade-in select-none">
          <div className={`w-full max-w-sm rounded-2xl p-5 border flex flex-col gap-4 shadow-2xl ${theme === 'light' ? 'bg-white border-slate-200' : 'bg-[#050711] border-slate-900'}`}>
            <div className="flex items-center gap-2 border-b border-slate-900/40 pb-2.5">
              <Activity className="h-4 w-4 text-emerald-400" />
              <h3 className={`text-xs font-extrabold uppercase tracking-wider ${theme === 'light' ? 'text-slate-800' : 'text-slate-200'}`}>
                MNA Mode Extraction Options
              </h3>
            </div>
            
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                Select Modes Source
              </label>
              <select
                value={extractionModeSource}
                onChange={(e) => setExtractionModeSource(e.target.value as 'auto' | 'sim')}
                className={`w-full px-3 py-2 border rounded-xl text-xs font-semibold outline-none focus:border-emerald-500 cursor-pointer ${
                  theme === 'light' 
                    ? 'bg-slate-50 border-slate-200 text-slate-800' 
                    : 'bg-slate-950 border-slate-850 text-slate-250'
                }`}
              >
                <option value="auto">Auto permutations (Mathematical topology check)</option>
                <option value="sim" disabled={!simResults}>From Simulation Results (Only active switch cycles)</option>
              </select>
              {!simResults && (
                <span className="text-[9px] text-rose-500 font-bold leading-tight mt-1">
                  * Run simulation first to extract operating modes from the timeline data.
                </span>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 mt-2">
              <button
                onClick={() => setIsExtractionModalOpen(false)}
                className={`px-3.5 py-1.5 border rounded-lg text-xxs font-bold transition-all active:scale-95 cursor-pointer ${
                  theme === 'light' 
                    ? 'border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700' 
                    : 'border-slate-850 text-slate-400 hover:border-slate-800 hover:bg-slate-900/60 hover:text-slate-200'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleMNAExtraction}
                className="px-4 py-1.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white font-bold rounded-lg text-xxs flex items-center gap-1.5 shadow-xl shadow-emerald-500/5 active:scale-95 border border-emerald-400/20 cursor-pointer"
              >
                Proceed & Extract
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
