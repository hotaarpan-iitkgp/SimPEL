import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, RotateCcw, Plus, Trash2, Sliders, Activity, HelpCircle, 
  Download, UploadCloud, SlidersHorizontal, Maximize2, CheckCircle, 
  ChevronLeft, ChevronRight, Check, Eye, Sun, Moon, Edit3, Pause, 
  BookOpen, Compass, Settings, AlertCircle, Sparkles
} from 'lucide-react';
import { Component, SolverConfig, SimulationResults } from './types';
import { CIRCUITS_TEMPLATES } from './templates';
import SchematicEditor from './components/SchematicEditor';
import SimulationPlayer from './components/SimulationPlayer';
import PlotlyChart from './components/PlotlyChart';
import { state, saveState } from './schematic/state';
import { draw } from './schematic/renderer';
import { updatePropertiesPanel } from './schematic/properties';
import { updateViewportTransform } from './schematic/utils';
import { getWireDomain } from './schematic/routing';
import { triggerImport, exportDualGraphJSON, exportJSON } from './schematic/actions';
import { CircuitSimulator } from './solver_ts';
import { AlternativeCircuitSimulator } from './solver_alt';

const localSimState = { cancelled: false, paused: false };

interface SubplotConfig {
  id: string;
  title: string;
  traces: string[];
}

export default function StudentApp() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('voltaic-theme');
    return (saved === 'light' || saved === 'dark') ? saved : 'dark';
  });

  // Keep theme synced with document elements
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
    const event = new CustomEvent('themeChanged', { detail: theme });
    window.dispatchEvent(event);
  }, [theme]);

  // Set the appletMode to 'student' when mounting, and clean up or redraw
  useEffect(() => {
    state.appletMode = 'student';
    saveState();
    window.dispatchEvent(new CustomEvent('appletStateChanged'));
    draw();
  }, []);

  const resolveInputPinToSource = (trace: string): string => {
    if (!trace.includes('.')) return trace;
    const [compId, terminal] = trace.split('.');
    if (!compId || !terminal) return trace;
    
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
          const compIdParts = c.id.split('.');
          const subsystemPrefix = compIdParts.slice(0, -1).join('.');
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
        
        if (c && c.type === 'FROM_SIG') {
          const fromTag = String(c.parameters?.tag || 'A').trim().toLowerCase();
          const compIdParts = c.id.split('.');
          const subsystemPrefix = compIdParts.slice(0, -1).join('.');
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
        
        queue.push(w.from);
        if (w.to) queue.push(w.to);
        
        state.wires.forEach((otherW: any) => {
          if (otherW.from.type === 'wire' && otherW.from.wireId === w.id) {
            queue.push({ type: 'wire_obj', wire: otherW });
          } else if (otherW.to && otherW.to.type === 'wire' && otherW.to.wireId === w.id) {
            queue.push({ type: 'wire_obj', wire: otherW });
          }
        });
        
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
    
    return trace;
  };

  const [isLoading, setIsLoading] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [serverStatus, setServerStatus] = useState<'compiling' | 'ready' | 'error'>('ready');
  const [simResults, setSimResults] = useState<SimulationResults | null>(null);
  const [isVisualFlowOpen, setIsVisualFlowOpen] = useState<boolean>(false);
  const [jsonText, setJsonText] = useState<string>("");

  // Layout and view states
  const [showControlPanel, setShowControlPanel] = useState(true);
  const [showPlotterOptions, setShowPlotterOptions] = useState(true);
  const [schematicRatio, setSchematicRatio] = useState(45);
  const [isResizing, setIsResizing] = useState(false);
  const [selectedTemplateKey, setSelectedTemplateKey] = useState<string>("buck_converter");
  const containerRef = useRef<HTMLDivElement>(null);

  const [appletUpdateCount, setAppletUpdateCount] = useState(0);
  const dynamicRangesRef = useRef<Record<string, { min: number; max: number; step: number }>>({});

  const [subplots, setSubplots] = useState<SubplotConfig[]>([
    { id: "sp_1", title: "Waveform analysis", traces: [] }
  ]);
  const [hiddenTraces, setHiddenTraces] = useState<Record<string, string[]>>({});

  const toggleTraceVisibility = (subplotId: string, traceName: string) => {
    setHiddenTraces(prev => {
      const list = prev[subplotId] || [];
      const updated = list.includes(traceName)
        ? list.filter(t => t !== traceName)
        : [...list, traceName];
      return { ...prev, [subplotId]: updated };
    });
  };
  const [plotMode, setPlotMode] = useState<'hover' | 'zoom' | 'pan' | 'measure'>('hover');
  const [globalZoomX, setGlobalZoomX] = useState<{ min: number; max: number } | null>(null);
  const [zoomRangesX, setZoomRangesX] = useState<Record<string, { min: number; max: number } | null>>({});
  const [zoomRangesY, setZoomRangesY] = useState<Record<string, { min: number; max: number } | null>>({});
  const [globalMeasureRange, setGlobalMeasureRange] = useState<{ start: number; end: number } | null>(null);
  const [measureRanges, setMeasureRanges] = useState<Record<string, { start: number; end: number } | null>>({});

  const [syncXZoom, setSyncXZoom] = useState<boolean>(true);
  const [isImPlotTheme, setIsImPlotTheme] = useState<boolean>(false);
  const [isGlobalOverlay, setIsGlobalOverlay] = useState<boolean>(false);
  const [layoutMode, setLayoutMode] = useState<'stacked' | 'grid'>('stacked');
  const [fitStack, setFitStack] = useState<boolean>(false);

  // Trigger applet updates and auto-focus control sidebar
  useEffect(() => {
    const handler = () => {
      setAppletUpdateCount(prev => prev + 1);
      const selectedIds = state.selectedComponentIds || [];
      
      const newRanges: Record<string, { min: number; max: number; step: number }> = {};
      selectedIds.forEach((compId: string) => {
        Object.keys(dynamicRangesRef.current).forEach(key => {
          if (key.startsWith(`${compId}.`)) {
            newRanges[key] = dynamicRangesRef.current[key];
          }
        });
      });
      dynamicRangesRef.current = newRanges;

      if (selectedIds.length > 0) {
        const selectedComps = state.components.filter((c: any) => selectedIds.includes(c.id));
        const hasTunableParams = selectedComps.some((c: any) => {
          const isMaskedSubsystem = c.type === 'SUBSYSTEM' && c.mask && c.mask.parameters && c.mask.parameters.length > 0;
          if (isMaskedSubsystem) return true;
          if (c.parameters) {
            const keys = Object.keys(c.parameters).filter(key => {
              if ([
                'code', 'terminals', 'signs', 'operators', 'input_mappings', 'selected_signals', 
                'target', 'config', 'plot_disabled_pins', 'plot_custom_vars', 'signs_positions',
                'operators_positions', 'num_carriers', 'common_modulation', 'anti_windup', 'limit_output',
                'phase_source', 'freq_source', 'gate_signal_source'
              ].includes(key)) return false;
              if (/plot/i.test(key)) return false;
              return true;
            });
            if (c.type === 'CSCRIPT') return false;
            if (c.type === 'GEN_EBLOCK') return keys.includes('timestep');
            return keys.length > 0;
          }
          return false;
        });
        if (hasTunableParams) {
          setShowControlPanel(true);
        }
      }
    };
    window.addEventListener('appletStateChanged', handler);
    return () => window.removeEventListener('appletStateChanged', handler);
  }, []);

  // Trigger resize events to fit Plotly
  useEffect(() => {
    window.dispatchEvent(new Event('resize'));
    const t1 = setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
    const t2 = setTimeout(() => window.dispatchEvent(new Event('resize')), 150);
    const t3 = setTimeout(() => window.dispatchEvent(new Event('resize')), 300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [showPlotterOptions, showControlPanel, schematicRatio, subplots.length]);

  // Resizing layout panes
  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const leftOffset = showControlPanel ? 240 : 0;
      const remainingWidth = containerRect.width - leftOffset;
      if (remainingWidth <= 0) return;
      
      const mouseXInRemaining = e.clientX - containerRect.left - leftOffset;
      const ratio = (mouseXInRemaining / remainingWidth) * 100;
      const clampedRatio = Math.max(15, Math.min(85, ratio));
      setSchematicRatio(clampedRatio);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, showControlPanel]);

  // Load default template or persisted schematic on mount
  useEffect(() => {
    const persisted = localStorage.getItem('circuitsim_persisted_schematic');
    const persistedTemplateKey = localStorage.getItem('circuitsim_persisted_template_key');
    if (persisted) {
      try {
        const layoutObj = JSON.parse(persisted);
        triggerImport(persisted);
        if (persistedTemplateKey) {
          setSelectedTemplateKey(persistedTemplateKey);
        }
        if (layoutObj.plotConfiguration && Array.isArray(layoutObj.plotConfiguration.plots)) {
          const mapped = layoutObj.plotConfiguration.plots.map((p: any, idx: number) => ({
            id: p.id || `sp_${idx + 1}`,
            title: p.title || `Plot ${idx + 1}`,
            traces: p.variables || p.traces || []
          }));
          setSubplots(mapped);
        }
        try {
          const isRegularMode = (layoutObj.simulationSettings?.simulationMode || 'regular') === 'regular';
          const netlist = exportDualGraphJSON(isRegularMode);
          const netlistStr = JSON.stringify(netlist, null, 2);
          setJsonText(netlistStr);
        } catch (err) {
          console.error("Failed to compile netlist for persisted schematic in StudentApp:", err);
        }
      } catch (err) {
        console.error("Failed to load persisted schematic in StudentApp:", err);
        loadTemplate("buck_converter");
      }
    } else {
      loadTemplate("buck_converter");
    }
  }, []);

  const parseMetricValue = (str: string): { value: number; prefix: string } => {
    if (!str) return { value: 0, prefix: '' };
    str = String(str).trim();
    const prefixChars = ['G', 'M', 'k', 'm', 'u', 'n', 'p'];
    for (const p of prefixChars) {
      if (str.endsWith(p)) {
        const numPart = str.substring(0, str.length - p.length).trim();
        const parsedNum = parseFloat(numPart);
        if (!isNaN(parsedNum)) {
          return { value: parsedNum, prefix: p };
        }
      }
    }
    const parsedNum = parseFloat(str);
    if (!isNaN(parsedNum)) {
      return { value: parsedNum, prefix: '' };
    }
    return { value: 0, prefix: '' };
  };

  const calculateStableRange = (val: number) => {
    const absVal = Math.abs(val);
    if (absVal === 0) {
      return { min: -10, max: 10, step: 0.1 };
    }
    if (val > 0) {
      const min = Number((val * 0.1).toFixed(4));
      const max = Number((val * 10).toFixed(4));
      const step = Number((val * 0.1).toFixed(4)) || 0.1;
      return { min, max, step };
    } else {
      const min = Number((val * 10).toFixed(4));
      const max = Number((val * 0.1).toFixed(4));
      const step = Number((absVal * 0.1).toFixed(4)) || 0.1;
      return { min, max, step };
    }
  };

  const handleAppletSliderChange = (sliderId: string, newValue: number, newPrefix?: string) => {
    const slider = state.appletSliders?.find((s: any) => s.id === sliderId);
    if (!slider) return;

    let prefix = newPrefix;
    if (prefix === undefined) {
      const comp = state.components.find((c: any) => c.id === slider.compId);
      const raw = comp?.parameters?.[slider.paramName] ?? String(slider.value);
      prefix = parseMetricValue(raw).prefix;
    }

    slider.value = newValue;

    const comp = state.components.find((c: any) => c.id === slider.compId);
    if (comp) {
      if (!comp.parameters) comp.parameters = {};
      comp.parameters[slider.paramName] = String(newValue) + prefix;
    }

    saveState();
    window.dispatchEvent(new CustomEvent('appletStateChanged'));
  };

  const addAppletSlider = (compId: string, paramName: string, label?: string) => {
    if (!state.appletSliders) state.appletSliders = [];
    
    const exists = state.appletSliders.some((s: any) => s.compId === compId && s.paramName === paramName);
    if (exists) {
      setShowControlPanel(true);
      return;
    }
    
    const comp = state.components.find((c: any) => c.id === compId);
    if (!comp) return;
    
    let rawVal = comp.parameters?.[paramName];
    if (rawVal === undefined) rawVal = "10";
    
    const { value: parsedVal, prefix } = parseMetricValue(String(rawVal));
    const range = calculateStableRange(parsedVal);
    
    const newSlider = {
      id: "slider_" + Math.random().toString(36).substring(2, 9),
      compId,
      paramName,
      label: label || `${compId} ${paramName.replace(/_/g, " ")}`,
      min: range.min,
      max: range.max,
      step: range.step || 0.1,
      value: parsedVal
    };
    
    state.appletSliders.push(newSlider);
    saveState();
    setShowControlPanel(true);
    window.dispatchEvent(new CustomEvent('appletStateChanged'));
  };

  const handleDirectParamChange = (compId: string, paramName: string, newValue: number, prefix: string) => {
    const comp = state.components.find((c: any) => c.id === compId);
    if (comp) {
      if (!comp.parameters) comp.parameters = {};
      comp.parameters[paramName] = String(newValue) + prefix;
      saveState();
      window.dispatchEvent(new CustomEvent('appletStateChanged'));
    }
  };

  const extractAvailableTraces = (results: SimulationResults | null): string[] => {
    if (!results) return [];
    const traces: string[] = [];
    const isWireOrSegment = (name: string): boolean => {
      if (name.includes('_seg')) return true;
      return /^([VI]_)?W\d+(\.|$|_)/i.test(name);
    };

    Object.keys(results.signals).forEach(sig => {
      if (!isWireOrSegment(sig)) traces.push(sig);
    });

    Object.keys(results.custom_plots).forEach(plot => {
      if (!isWireOrSegment(plot)) traces.push(plot);
    });

    return Array.from(new Set(traces)).sort();
  };

  const belongsToSelected = (trace: string, compIds: string[]): boolean => {
    if (compIds.length === 0) return false;
    const t = trace.toLowerCase();
    return compIds.some(compId => {
      const c = compId.toLowerCase();
      if (t === c) return true;
      if (t === `v_${c}` || t === `i_${c}`) return true;
      if (t.startsWith(`${c}.`) || t.startsWith(`${c}_`)) return true;
      if (t.startsWith(`v_${c}.`) || t.startsWith(`i_${c}.`) || t.startsWith(`v_${c}_`) || t.startsWith(`i_${c}_`)) return true;
      if (t.endsWith(`_${c}`) || t.endsWith(`.${c}`) || t.endsWith(` ${c}`)) return true;
      if (t.includes(`_${c}_`) || t.includes(`.${c}.`) || t.includes(` ${c} `) || t.includes(`_${c}.`) || t.includes(`.${c}_`)) return true;
      return false;
    });
  };

  const getTraceMeta = (trace: string) => {
    const ut = trace.toUpperCase();
    if (ut.startsWith('V_') || ut.endsWith('_V') || ut.includes('VOLT') || ut.startsWith('V_REF') || ut === 'V_FEEDBACK') {
      return { icon: "⚡", label: "Voltage" };
    } else if (ut.startsWith('I_') || ut.endsWith('_I') || ut.includes('CURR')) {
      return { icon: "📈", label: "Current" };
    } else {
      return { icon: "⚙️", label: "Signal" };
    }
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
      '#38bdf8', '#4ade80', '#fbbf24', '#c084fc', '#fb7185', 
      '#fb923c', '#2dd4bf', '#818cf8', '#a7f3d0', '#fbcfe8'
    ];
    const lightColors = [
      '#0284c7', '#16a34a', '#d97706', '#7c3aed', '#e11d48',
      '#ea580c', '#0d9488', '#4f46e5', '#047857', '#be185d'
    ];

    const colors = theme === 'light' ? lightColors : darkColors;
    return colors[idx % colors.length];
  };

  const getTraceData = (trace: string): number[] => {
    if (!simResults) return [];
    const resolvedTrace = resolveInputPinToSource(trace);
    
    // We try looking for the exact trace first
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

    // Try fallback without prefix
    if (simResults.custom_plots[trace]) return simResults.custom_plots[trace];
    if (simResults.signals[trace]) return simResults.signals[trace];

    return [];
  };

  const handleRunAppletSimulation = () => {
    try {
      const isRegularMode = (state.simulationSettings.simulationMode || 'regular') === 'regular';
      const netlistObj = exportDualGraphJSON(isRegularMode);

      // Resolve wanted variables based on subplots and scopes
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

      if (!netlistObj.simulation_parameters) {
        netlistObj.simulation_parameters = {};
      }
      netlistObj.simulation_parameters.wanted_variables = Array.from(new Set(resolvedWanted));

      const netlistStr = JSON.stringify(netlistObj, null, 2);
      runSchematicSimulation(netlistStr);
    } catch (err: any) {
      alert(`Netlist compiling failure: ${err.message || err}`);
    }
  };

  const runSchematicSimulation = async (exportedNetlist: string) => {
    setIsLoading(true);
    setServerStatus('compiling');
    
    const sessionId = 'session_' + Math.random().toString(36).substring(2, 9);
    setActiveSessionId(sessionId);
    setIsPaused(false);

    try {
      const parsed = JSON.parse(exportedNetlist);
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
        console.warn("Express server simulation failed, compiling in browser...", err);
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

      setGlobalZoomX(null);
      setZoomRangesX({});
      setZoomRangesY({});
      setGlobalMeasureRange(null);
      setMeasureRanges({});

      const available = extractAvailableTraces(results);
      const allSubplotTracesCount = subplots.reduce((acc, sp) => acc + sp.traces.length, 0);
      if (allSubplotTracesCount === 0 || subplots.length === 0) {
        const defaultTracesToRender = available.slice(0, 4);
        setSubplots([
          { id: "sp_1", title: "Waveform analysis", traces: defaultTracesToRender }
        ]);
      }
    } catch (e: any) {
      console.error(e);
      setServerStatus('error');
      alert(`Simulation failed. Ensure nodes are properly wired (ground reference node_0 is required) and control channels match! Error details: ${e.message || e}`);
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
      console.warn("Using local fallback for pause/resume");
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
      console.warn("Using local fallback for termination");
      localSimState.cancelled = true;
    }
  };

  const addSubplot = () => {
    const id = `sp_${Math.random().toString(36).substring(2, 9)}`;
    const newSubplot = { id, title: `Subplot lane ${subplots.length + 1}`, traces: [] };
    setSubplots([...subplots, newSubplot]);
  };

  const removeSubplot = (id: string) => {
    setSubplots(subplots.filter(s => s.id !== id));
  };

  const resetAllPlotZoom = () => {
    setGlobalZoomX(null);
    setZoomRangesX({});
    setZoomRangesY({});
    setGlobalMeasureRange(null);
    setMeasureRanges({});
  };

  const loadTemplate = (key: string) => {
    setSelectedTemplateKey(key);
    setGlobalZoomX(null);
    setZoomRangesX({});
    setZoomRangesY({});
    setGlobalMeasureRange(null);
    setMeasureRanges({});

    const template = CIRCUITS_TEMPLATES[key];
    if (template) {
      // 1. Build layout object
      const layoutObj = {
        components: template.components || [],
        wires: template.wires || [],
        plotConfiguration: template.plotConfiguration || { plots: [] },
        simulationSettings: template.simulationSettings || {
          stopTime: "0.01",
          stepSize: "10u",
          solver: "euler",
          stepType: "fixed"
        }
      };

      // 2. Import into canvas state
      triggerImport(JSON.stringify(layoutObj));

      // 3. Compile layout to netlist format for the simulation player
      try {
        const isRegularMode = (layoutObj.simulationSettings.simulationMode || 'regular') === 'regular';
        const netlist = exportDualGraphJSON(isRegularMode);
        const netlistStr = JSON.stringify(netlist, null, 2);
        setJsonText(netlistStr);
      } catch (err) {
        console.error("Failed to export compiled netlist for template:", err);
      }

      setSimResults(null);
      
      // 4. Setup subplots
      setupDefaultSubplots(key);
    }
  };

  const setupDefaultSubplots = (key: string) => {
    let defaultPlots: any[] = [];
    const template = CIRCUITS_TEMPLATES[key];
    if (template && template.plotConfiguration && Array.isArray(template.plotConfiguration.plots)) {
      defaultPlots = template.plotConfiguration.plots;
    } else {
      defaultPlots = [
        { id: "sp_1", title: "Main Waveform Analysis", traces: [] }
      ];
    }
    
    const mapped = defaultPlots.map((p, idx) => ({
      id: p.id || `sp_${idx + 1}`,
      title: p.title || `Plot ${idx + 1}`,
      traces: p.variables || p.traces || []
    }));
    setSubplots(mapped);

    state.plotConfiguration.plots = mapped.map(p => ({
      title: p.title,
      variables: p.traces
    }));
  };

  // Save Student Workspace
  const saveStudentWorkspace = () => {
    try {
      const workspaceData = {
        type: "student_workspace_save",
        appletTitle: state.appletTitle || "Interactive Lab Experiment",
        appletDescription: state.appletDescription || "",
        appletSliders: state.appletSliders || [],
        components: state.components,
        wires: state.wires,
        subplots: subplots,
        layout: {
          showControlPanel,
          showPlotterOptions,
          schematicRatio
        },
        simResults: simResults
      };
      
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(workspaceData, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `student_workspace_${selectedTemplateKey}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      
      showToast("Workspace configuration saved successfully!");
    } catch (e: any) {
      alert("Failed to export workspace JSON: " + e.message);
    }
  };

  // Open Student Workspace
  const openStudentWorkspaceFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const workspaceData = JSON.parse(text);
        
        if (workspaceData.type !== 'student_workspace_save') {
          alert("Invalid workspace file! Please select a valid student mode workspace JSON file.");
          return;
        }
        
        if (workspaceData.appletSliders) state.appletSliders = workspaceData.appletSliders;
        if (workspaceData.components) state.components = workspaceData.components;
        if (workspaceData.wires) state.wires = workspaceData.wires;
        if (workspaceData.subplots) setSubplots(workspaceData.subplots);
        
        if (workspaceData.layout) {
          if (workspaceData.layout.showControlPanel !== undefined) setShowControlPanel(workspaceData.layout.showControlPanel);
          if (workspaceData.layout.showPlotterOptions !== undefined) setShowPlotterOptions(workspaceData.layout.showPlotterOptions);
          if (workspaceData.layout.schematicRatio !== undefined) setSchematicRatio(workspaceData.layout.schematicRatio);
        }
        
        if (workspaceData.simResults) {
          setSimResults(workspaceData.simResults);
        } else {
          setSimResults(null);
        }
        
        draw();
        updatePropertiesPanel();
        saveState();
        window.dispatchEvent(new CustomEvent('appletStateChanged'));
        showToast("Student workspace loaded successfully!");
      } catch (err: any) {
        alert("Failed to parse workspace JSON: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const showToast = (msg: string) => {
    const toast = document.getElementById('toast');
    if (toast) {
      toast.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }
  };

  const renderSinglePlot = (subplot: SubplotConfig, idx: number) => {
    if (!simResults) return null;
    const tData = simResults.time;
    if (tData.length === 0) return null;

    const availableTraces = extractAvailableTraces(simResults);
    const activeTraces = isGlobalOverlay
      ? availableTraces 
      : subplot.traces.filter(t => availableTraces.includes(resolveInputPinToSource(t)));

    const visibleTraces = activeTraces.filter(t => !hiddenTraces[subplot.id]?.includes(t));

    const width = 800;
    let height = 240;
    if (layoutMode === 'grid') {
      height = 320;
    } else if (fitStack) {
      height = Math.max(110, Math.min(240, Math.floor(480 / (subplots.length || 1))));
    }

    const tMinBound = tData[0];
    const tMaxBound = tData[tData.length - 1];

    const displayXMin = syncXZoom 
      ? (globalZoomX !== null ? globalZoomX.min : tMinBound)
      : (zoomRangesX[subplot.id] !== null && zoomRangesX[subplot.id] !== undefined ? zoomRangesX[subplot.id]!.min : tMinBound);

    const displayXMax = syncXZoom 
      ? (globalZoomX !== null ? globalZoomX.max : tMaxBound)
      : (zoomRangesX[subplot.id] !== null && zoomRangesX[subplot.id] !== undefined ? zoomRangesX[subplot.id]!.max : tMaxBound);

    const displayYMin = zoomRangesY[subplot.id] !== null && zoomRangesY[subplot.id] !== undefined 
      ? zoomRangesY[subplot.id]!.min 
      : undefined;

    const displayYMax = zoomRangesY[subplot.id] !== null && zoomRangesY[subplot.id] !== undefined 
      ? zoomRangesY[subplot.id]!.max 
      : undefined;

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
          const traceName = e.dataTransfer.getData("traceName") || e.dataTransfer.getData("text/plain");
          if (traceName) {
            // Add trace to subplot
            setSubplots(prev => prev.map(sp => {
              if (sp.id === subplot.id) {
                if (sp.traces.includes(traceName)) return sp;
                return { ...sp, traces: [...sp.traces, traceName] };
              }
              return sp;
            }));
            showToast(`Added ${traceName.replace('_', ' ')} to plot!`);
          }
        }}
        className={`relative overflow-hidden select-none transition-all rounded-xl border p-3 ${
          theme === 'light' ? 'bg-white border-slate-200 shadow-sm shadow-slate-100' : 'bg-slate-950/80 border-slate-900 shadow-inner'
        }`}
      >
        <div className="flex items-center justify-between mb-1.5 px-1 select-none gap-2">
          <span className={`text-[10px] font-mono font-extrabold uppercase tracking-wide flex items-center gap-1.5 shrink-0 ${
            theme === 'light' ? 'text-slate-700' : 'text-slate-350'
          }`}>
            <span className="text-sky-500">📈</span>
            {subplot.title}
          </span>

          {/* Subplot variable names interactive legends */}
          <div className="flex-1 flex flex-wrap items-center justify-end gap-1.5 px-2 select-none overflow-hidden">
            {activeTraces.map(trace => {
              const label = trace.includes('.') ? trace.split('.')[1] : trace.replace('_', ' ');
              const isHidden = hiddenTraces[subplot.id]?.includes(trace);
              const color = isImPlotTheme 
                ? ((trace.startsWith('V_') || trace.endsWith('_V')) ? '#eab308' : (trace.startsWith('I_') || trace.endsWith('_I')) ? '#ef4444' : '#10b981')
                : getTraceColor(trace);
              
              return (
                <button
                  key={trace}
                  onClick={() => toggleTraceVisibility(subplot.id, trace)}
                  className={`px-1.5 py-0.5 rounded text-[8px] font-bold font-mono transition-all flex items-center gap-1 cursor-pointer border ${
                    isHidden
                      ? 'bg-slate-500/10 text-slate-500 border-slate-500/20 line-through opacity-50 hover:opacity-75'
                      : 'hover:scale-[1.02] hover:bg-slate-500/5'
                  }`}
                  style={{
                    borderColor: isHidden ? undefined : `${color}25`,
                    backgroundColor: isHidden ? undefined : `${color}05`,
                    color: isHidden ? undefined : color
                  }}
                  title={isHidden ? `Click to show ${label}` : `Click to hide ${label}`}
                >
                  <span 
                    className="w-1.5 h-1.5 rounded-full" 
                    style={{ backgroundColor: isHidden ? '#64748b' : color }}
                  />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => removeSubplot(subplot.id)}
              className="p-1 rounded hover:bg-rose-550/10 text-slate-500 hover:text-rose-500 transition-colors cursor-pointer"
              title="Remove Plot Lane"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>

        {activeTraces.length === 0 ? (
          <div 
            style={{ height }} 
            className={`w-full flex flex-col items-center justify-center border border-dashed rounded-lg p-6 ${
              theme === 'light' ? 'border-slate-200 bg-slate-50' : 'border-slate-900 bg-slate-950/35'
            }`}
          >
            <Activity className="h-6 w-6 text-slate-500/80 mb-2 animate-pulse" />
            <p className="text-[10px] font-bold text-slate-400">Empty Plot Panel Lane</p>
            <p className="text-[8.5px] text-slate-500 mt-0.5 text-center max-w-[200px]">Drag any signal badge from the header panel above and drop it directly here to begin graphing.</p>
          </div>
        ) : (
          <PlotlyChart
            subplotId={subplot.id}
            traces={visibleTraces}
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
                  setZoomRangesX(prev => ({ ...prev, [subplot.id]: null }));
                } else {
                  setZoomRangesX(prev => ({ ...prev, [subplot.id]: { min, max } }));
                }
              }
            }}
          />
        )}
      </div>
    );
  };

  const selectedIds = state.selectedComponentIds || [];
  const selectedComps = state.components.filter((c: any) => selectedIds.includes(c.id));
  const availableTraces = simResults ? extractAvailableTraces(simResults) : [];
  const filteredTraces = availableTraces.filter(trace => belongsToSelected(trace, selectedIds));

  return (
    <div className={`min-h-screen w-full flex flex-col overflow-hidden font-sans ${
      theme === 'light' ? 'bg-slate-50 text-slate-900' : 'bg-[#050711] text-slate-100'
    }`}>
      {/* Dynamic Toast Element */}
      <div id="toast" className="fixed bottom-6 right-6 z-[1000] px-4 py-2.5 bg-emerald-600 border border-emerald-500 text-white font-bold text-xs rounded-xl shadow-2xl transition-all duration-300 transform translate-y-12 opacity-0 pointer-events-none" />

      {/* Modern Student Lab Header */}
      <header className={`border-b px-4 py-3 md:px-6 flex flex-col md:flex-row md:items-center justify-between gap-3 select-none ${
        theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-950/80 border-slate-900 backdrop-blur-md'
      }`}>
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-sky-500 flex items-center justify-center text-white shadow-md shadow-emerald-500/10">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xs font-black uppercase tracking-widest text-emerald-500">SimPEL Student Portal</h1>
              <span className="px-1.5 py-0.2 rounded font-mono text-[8px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 uppercase animate-pulse">Lab Experiment</span>
            </div>
            <p className={`text-[10px] font-medium leading-none mt-0.5 ${
              theme === 'light' ? 'text-slate-500' : 'text-slate-400'
            }`}>High-Fidelity Interactive RLC Simulation Suite</p>
          </div>
        </div>

        {/* Experiment selector */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-bold text-slate-400">SELECT EXPERIMENT:</span>
          <select
            value={selectedTemplateKey}
            onChange={(e) => loadTemplate(e.target.value)}
            className={`text-xs font-bold rounded-lg px-3 py-1.5 border cursor-pointer font-sans transition-all ${
              theme === 'light'
                ? 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                : 'bg-slate-900 border-slate-800 text-slate-200 hover:bg-slate-850'
            }`}
          >
            {Object.keys(CIRCUITS_TEMPLATES).filter(k => k !== 'empty').map(key => (
              <option key={key} value={key}>
                {CIRCUITS_TEMPLATES[key].name}
              </option>
            ))}
          </select>
        </div>

        {/* Action controllers */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setTheme(theme === 'light' ? 'dark' : 'light');
            }}
            className={`p-2 rounded-lg border transition-colors cursor-pointer ${
              theme === 'light'
                ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:bg-slate-850'
            }`}
            title="Toggle theme"
          >
            {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>

          <button
            onClick={() => {
              try {
                localStorage.setItem('circuitsim_persisted_schematic', exportJSON());
                localStorage.setItem('circuitsim_persisted_template_key', selectedTemplateKey);
              } catch (err) {
                console.error("Failed to save layout before mode change:", err);
              }
              window.location.search = '?mode=creator';
            }}
            className={`px-3 py-1.5 rounded-lg border text-xs font-bold font-sans transition-all flex items-center gap-1.5 cursor-pointer shadow-sm ${
              theme === 'light'
                ? 'bg-sky-50 border-sky-100 text-sky-700 hover:bg-sky-100'
                : 'bg-sky-500/10 border-sky-500/20 text-sky-400 hover:bg-sky-500/20'
            }`}
          >
            <Edit3 className="h-3.5 w-3.5" />
            <span>Open Creator App</span>
          </button>
        </div>
      </header>

      {/* Main Student Console Workspace */}
      <div className="flex-1 w-full max-w-full px-4 py-3 flex flex-col min-h-0 overflow-hidden">
        
        {/* Full Width Top board: Draggable signals discovery row */}
        <div className={`border rounded-2xl p-4 flex flex-col justify-between gap-3 mb-4 shadow-xl select-none shrink-0 ${
          theme === 'light' ? 'bg-white border-slate-200 shadow-slate-100/40' : 'bg-slate-950/60 border-slate-900 shadow-black/20'
        }`}>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between border-b pb-1.5 mb-2 select-none" style={{ borderColor: theme === 'light' ? '#e2e8f0' : '#0f172a' }}>
                <div className="flex items-center gap-1.5 text-[10px] font-mono font-black text-sky-500 uppercase tracking-widest">
                  <span>📊</span>
                  <span>
                    {selectedIds.length > 0 
                      ? `SIGNALS FOR SELECTED: ${selectedIds.join(', ')}` 
                      : "COMPONENT INTERACTIVE SIGNALS"
                    }
                  </span>
                </div>
                {filteredTraces.length > 0 && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border font-mono ${
                    theme === 'light' ? 'border-sky-200 text-sky-700 bg-sky-50' : 'border-sky-500/20 text-sky-400 bg-sky-500/5'
                  }`}>
                    {filteredTraces.length} discoverable signals
                  </span>
                )}
              </div>
              
              {!simResults ? (
                <div className="flex items-center justify-center py-2 min-h-[40px]">
                  <span className="text-[10px] text-slate-400 italic select-none">Run the simulation experiment below to populate signals!</span>
                </div>
              ) : selectedIds.length === 0 ? (
                <div className="flex items-center justify-center py-2 gap-1.5 min-h-[40px]">
                  <HelpCircle className="h-3.5 w-3.5 text-sky-500 animate-bounce" />
                  <span className="text-[10px] text-sky-500/95 font-black select-none text-center">
                    Select any component on the schematic diagram below to discover its simulation signals. Then, drag them onto the plotter lanes!
                  </span>
                </div>
              ) : filteredTraces.length === 0 ? (
                <div className="flex items-center justify-center py-2 min-h-[40px]">
                  <span className="text-[10px] text-slate-400 italic select-none">No output waveforms detected for {selectedIds.join(', ')}.</span>
                </div>
              ) : (
                <div className="overflow-y-auto flex flex-wrap gap-1.5 content-start py-0.5 max-h-[90px] scrollbar-thin">
                  {filteredTraces.map(trace => {
                    const color = getTraceColor(trace);
                    const meta = getTraceMeta(trace);
                    return (
                      <div
                        key={`header-trace-${trace}`}
                        draggable={true}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", trace);
                          e.dataTransfer.setData("traceName", trace);
                        }}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 border rounded-lg text-[10px] font-mono font-bold cursor-grab active:cursor-grabbing hover:scale-[1.02] active:scale-95 transition-all shadow-sm shrink-0 ${
                          theme === 'light'
                            ? 'bg-white hover:bg-slate-100 border-slate-250 text-slate-700'
                            : 'bg-slate-950 hover:bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300'
                        }`}
                        title={`Drag ${trace} onto any Plot Panel Lane`}
                      >
                        <span className="text-[10px] select-none" title={meta.label}>{meta.icon}</span>
                        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="truncate max-w-[130px]">{trace.replace('_', ' ')}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Run Button Panel */}
            <div className="flex flex-col items-end gap-2 shrink-0 self-center">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    try {
                      const netlistObj = exportDualGraphJSON(true);
                      setJsonText(JSON.stringify(netlistObj, null, 2));
                      setIsVisualFlowOpen(true);
                    } catch (err: any) {
                      alert(`Netlist compiling failure: ${err.message || err}`);
                    }
                  }}
                  className="px-4 py-2 bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md active:scale-95 border border-sky-400/20 cursor-pointer transition-all duration-150"
                  title="Open Real-time Visual Flow & Subplot Analyzer Window"
                >
                  <Play className="h-3.5 w-3.5 fill-current animate-pulse text-white" />
                  <span>VISUAL FLOW WINDOW</span>
                </button>

                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <span className="px-3.5 py-1.5 border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 rounded-xl text-xs font-bold flex items-center gap-1.5 animate-pulse">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                      SIMULATING...
                    </span>
                    <button
                      onClick={pauseResumeSimulation}
                      className="px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-xl text-xs font-bold hover:bg-yellow-500/20 transition-all cursor-pointer"
                    >
                      {isPaused ? "RESUME" : "PAUSE"}
                    </button>
                    <button
                      onClick={terminateSimulation}
                      className="px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-xs font-bold hover:bg-rose-500/20 transition-all cursor-pointer"
                    >
                      TERMINATE
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleRunAppletSimulation}
                    className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-650 hover:from-emerald-600 hover:to-emerald-700 text-white font-black rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/10 hover:scale-[1.01] active:scale-95 duration-150 transition-all cursor-pointer uppercase tracking-wider animate-pulse"
                  >
                    <Play className="h-4 w-4 fill-current text-white" />
                    <span>Run Simulation Experiment</span>
                  </button>
                )}
              </div>

              {/* Save/Load Workspace Controllers */}
              <div className="flex items-center gap-2 mt-1">
                <input 
                  type="file"
                  id="student-workspace-input"
                  onChange={openStudentWorkspaceFile}
                  accept=".json"
                  className="hidden"
                />
                
                <div className={`flex items-center gap-1 rounded-lg p-0.5 border ${
                  theme === 'light' ? 'bg-slate-100 border-slate-200' : 'bg-slate-900/40 border-slate-900'
                }`}>
                  <button
                    onClick={saveStudentWorkspace}
                    className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all cursor-pointer flex items-center gap-1 border ${
                      theme === 'light'
                        ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200/50'
                        : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                    }`}
                    title="Export Student Workspace JSON Configuration"
                  >
                    <Download className="h-2.5 w-2.5" />
                    <span>Save Lab</span>
                  </button>
                  <button
                    onClick={() => document.getElementById('student-workspace-input')?.click()}
                    className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all cursor-pointer flex items-center gap-1 border ${
                      theme === 'light'
                        ? 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200/50'
                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20'
                    }`}
                    title="Import Student Workspace JSON Configuration"
                  >
                    <UploadCloud className="h-2.5 w-2.5" />
                    <span>Open Lab</span>
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShowControlPanel(prev => !prev)}
                    className={`px-2 py-1 text-[9px] font-bold border rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                      showControlPanel 
                        ? (theme === 'light' ? 'bg-sky-50 text-sky-600 border-sky-200' : 'bg-sky-500/10 text-sky-400 border-sky-500/30') 
                        : (theme === 'light' ? 'bg-slate-100 text-slate-600' : 'bg-slate-900 text-slate-400')
                    }`}
                  >
                    <Sliders className="h-2.5 w-2.5" />
                    <span>Controls</span>
                  </button>
                  
                  <button
                    onClick={() => setShowPlotterOptions(prev => !prev)}
                    className={`px-2 py-1 text-[9px] font-bold border rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                      showPlotterOptions 
                        ? (theme === 'light' ? 'bg-sky-50 text-sky-600 border-sky-200' : 'bg-sky-500/10 text-sky-400 border-sky-500/30') 
                        : (theme === 'light' ? 'bg-slate-100 text-slate-600' : 'bg-slate-900 text-slate-400')
                    }`}
                  >
                    <SlidersHorizontal className="h-2.5 w-2.5" />
                    <span>Plotter Options</span>
                  </button>
                </div>

                <button
                  onClick={addSubplot}
                  className={`px-2.5 py-1 text-[9px] font-bold border rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
                    theme === 'light'
                      ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200/50'
                      : 'bg-slate-900 hover:bg-slate-850 text-emerald-400 border border-slate-850'
                  }`}
                >
                  <Plus className="h-2.5 w-2.5" />
                  <span>Add Lane</span>
                </button>

              </div>

            </div>

          </div>
        </div>

        {/* Dynamic Sliders, Schematic View, and Plotting Board splits */}
        <div ref={containerRef} className="flex-1 flex flex-col xl:flex-row gap-3 min-h-0 overflow-hidden relative">
          
          {/* ZONE 1: LAB CONTROL SLIDERS PANEL */}
          {showControlPanel && (
            <div 
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }}
              onDrop={(e) => {
                e.preventDefault();
                try {
                  const dataStr = e.dataTransfer.getData("application/json");
                  if (dataStr) {
                    const data = JSON.parse(dataStr);
                    if (data && data.type === "control-parameter") {
                      addAppletSlider(data.compId, data.paramName, data.label);
                    }
                  }
                } catch (err) {
                  console.error("Drop error", err);
                }
              }}
              className={`w-full xl:w-60 shrink-0 border rounded-2xl p-3 flex flex-col min-h-[250px] xl:min-h-0 overflow-y-auto shadow-lg transition-all duration-200 ${
                theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-950/45 border-slate-900'
              }`}
            >
              <div className={`flex items-center gap-2 mb-3 border-b pb-2 shrink-0 select-none ${
                theme === 'light' ? 'border-slate-200' : 'border-slate-900'
              }`}>
                <Sliders className="h-3.5 w-3.5 text-amber-500" />
                <h3 className={`font-mono text-[10px] font-bold uppercase tracking-wider flex-1 ${
                  theme === 'light' ? 'text-slate-700' : 'text-slate-350'
                }`}>LAB CONTROL PANEL</h3>
                <span className="text-[7px] font-mono font-bold bg-amber-500/10 text-amber-500 px-1 py-0.5 rounded border border-amber-500/20 uppercase">TUNER</span>
              </div>
              
              <div className="flex-1 flex flex-col gap-3">
                {(() => {
                  const configuredSliders = state.appletSliders || [];
                  const getControlParametersForComponent = (comp: any): any[] => {
                    if (!comp) return [];
                    const params: any[] = [];
                    const isMaskedSubsystem = comp.type === 'SUBSYSTEM' && comp.mask && comp.mask.parameters && comp.mask.parameters.length > 0;
                    if (isMaskedSubsystem) {
                      comp.mask.parameters.forEach((param: any) => {
                        const rawVal = comp.parameters[param.name] !== undefined ? comp.parameters[param.name] : param.value;
                        const refKey = `${comp.id}.${param.name}`;
                        if (!dynamicRangesRef.current[refKey]) {
                          const { value: parsedVal } = parseMetricValue(String(rawVal));
                          dynamicRangesRef.current[refKey] = calculateStableRange(parsedVal);
                        }
                        const cachedRange = dynamicRangesRef.current[refKey];
                        params.push({
                          id: `dyn_${comp.id}_${param.name}`,
                          compId: comp.id,
                          paramName: param.name,
                          label: param.label || `${comp.id} ${param.name}`,
                          min: cachedRange.min,
                          max: cachedRange.max,
                          step: cachedRange.step,
                          value: rawVal,
                          isDynamic: true
                        });
                      });
                    } else if (comp.parameters) {
                      Object.keys(comp.parameters).forEach(key => {
                        if ([
                          'code', 'terminals', 'signs', 'operators', 'input_mappings', 'selected_signals', 
                          'target', 'config', 'plot_disabled_pins', 'plot_custom_vars', 'signs_positions',
                          'operators_positions', 'num_carriers', 'common_modulation', 'anti_windup', 'limit_output',
                          'phase_source', 'freq_source', 'gate_signal_source'
                        ].includes(key)) return;
                        if (/plot/i.test(key)) return;
                        if (comp.type === 'CSCRIPT') return;
                        if (comp.type === 'GEN_EBLOCK' && !['timestep'].includes(key)) return;
                        
                        const rawVal = comp.parameters[key];
                        const refKey = `${comp.id}.${key}`;
                        if (!dynamicRangesRef.current[refKey]) {
                          const { value: parsedVal } = parseMetricValue(String(rawVal));
                          dynamicRangesRef.current[refKey] = calculateStableRange(parsedVal);
                        }
                        const cachedRange = dynamicRangesRef.current[refKey];

                        params.push({
                          id: `dyn_${comp.id}_${key}`,
                          compId: comp.id,
                          paramName: key,
                          label: `${comp.id} ${key.replace(/_/g, ' ')}`,
                          min: cachedRange.min,
                          max: cachedRange.max,
                          step: cachedRange.step,
                          value: rawVal,
                          isDynamic: true
                        });
                      });
                    }
                    return params;
                  };

                  const dynamicSliders = selectedComps.flatMap(c => getControlParametersForComponent(c))
                    .filter(ds => !configuredSliders.some((s: any) => s.compId === ds.compId && s.paramName === ds.paramName));

                  const allSliders = [...configuredSliders, ...dynamicSliders];

                  if (allSliders.length === 0) {
                    return (
                      <div className={`p-4 border border-dashed text-center rounded-xl leading-relaxed text-[10px] flex flex-col items-center justify-center gap-2 my-auto ${
                        theme === 'light' ? 'border-amber-300 text-slate-500 bg-amber-50/20' : 'border-amber-500/20 text-slate-400 bg-amber-500/5'
                      }`}>
                        <span className="text-xl animate-bounce">🎛️</span>
                        <p className="font-bold text-slate-750 dark:text-slate-350">No Tunable Parameters Selected</p>
                        <p className="text-[9px]">Click on any component (Resistor, Cap, Inductor, Switch, Constant) in the schematic to view its tunable parameters here!</p>
                      </div>
                    );
                  }

                  return allSliders.map((slider: any) => {
                    const comp = state.components.find((c: any) => c.id === slider.compId);
                    const rawValue = comp?.parameters?.[slider.paramName] ?? String(slider.value);
                    const { value: parsedVal, prefix: currentPrefix } = parseMetricValue(rawValue);

                    return (
                      <div 
                        key={slider.id} 
                        className={`p-2 border rounded-xl flex flex-col gap-1 shadow-sm transition-all ${
                          slider.isDynamic
                            ? (theme === 'light' ? 'bg-amber-50/30 border-amber-200' : 'bg-amber-500/5 border-amber-500/20')
                            : (theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-950/80 border-slate-900')
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-mono select-none">
                          <span 
                            className={`text-[10px] font-bold truncate max-w-[100px] shrink-0 ${
                              theme === 'light' ? 'text-slate-800' : 'text-slate-350'
                            }`} 
                            title={slider.label}
                          >
                            {slider.label}
                          </span>
                          {slider.isDynamic && (
                            <span className="text-[7px] font-mono font-bold bg-amber-500/10 text-amber-500 px-1 py-0.2 rounded border border-amber-500/15">
                              ACTIVE
                            </span>
                          )}
                          <div className="flex items-center gap-1 ml-auto shrink-0">
                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${
                              theme === 'light' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-emerald-400 bg-slate-950/90 border-slate-900'
                            }`}>
                              {parsedVal}
                            </span>
                            <select
                              value={currentPrefix}
                              onChange={(e) => {
                                if (slider.isDynamic) {
                                  handleDirectParamChange(slider.compId, slider.paramName, parsedVal, e.target.value);
                                } else {
                                  handleAppletSliderChange(slider.id, parsedVal, e.target.value);
                                }
                              }}
                              className={`text-[8.5px] font-mono font-bold rounded px-1 py-0.5 border cursor-pointer ${
                                theme === 'light'
                                  ? 'bg-slate-50 border-slate-300 text-slate-700'
                                  : 'bg-slate-900 border-slate-800 text-slate-350'
                              }`}
                            >
                              <option value="">-</option>
                              <option value="G">G</option>
                              <option value="M">M</option>
                              <option value="k">k</option>
                              <option value="m">m</option>
                              <option value="u">u</option>
                              <option value="n">n</option>
                              <option value="p">p</option>
                            </select>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <span className="text-[8.5px] font-mono select-none text-slate-500">{slider.min ?? 0}</span>
                          <input
                            type="range"
                            min={slider.min ?? 0}
                            max={slider.max ?? 100}
                            step={slider.step ?? 0.1}
                            value={parsedVal}
                            onChange={(e) => {
                              if (slider.isDynamic) {
                                handleDirectParamChange(slider.compId, slider.paramName, parseFloat(e.target.value), currentPrefix);
                              } else {
                                handleAppletSliderChange(slider.id, parseFloat(e.target.value), currentPrefix);
                              }
                            }}
                            className={`flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-sky-500 ${
                              theme === 'light' ? 'bg-slate-200' : 'bg-slate-900'
                            }`}
                          />
                          <span className="text-[8.5px] font-mono select-none text-slate-500">{slider.max ?? 100}</span>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Divider */}
              <div className={`my-4 border-t ${theme === 'light' ? 'border-slate-200' : 'border-slate-900'}`} />

              {/* SIMULATION PARAMETERS PANEL */}
              <div className="flex items-center gap-2 mb-3 pb-1 shrink-0 select-none">
                <Settings className="h-3.5 w-3.5 text-sky-500" />
                <h3 className={`font-mono text-[10px] font-bold uppercase tracking-wider flex-1 ${
                  theme === 'light' ? 'text-slate-700' : 'text-slate-350'
                }`}>SIMULATION SETTINGS</h3>
              </div>

              <div className="flex flex-col gap-3.5 mb-2">
                {/* Stop Time */}
                <div className="flex flex-col gap-1">
                  <span className={`text-[9.5px] font-mono font-bold select-none ${
                    theme === 'light' ? 'text-slate-650' : 'text-slate-400'
                  }`}>Stop Time (s)</span>
                  <input
                    type="text"
                    value={state.simulationSettings.stopTime || "0.05"}
                    onChange={(e) => {
                      state.simulationSettings.stopTime = e.target.value;
                      saveState();
                      setAppletUpdateCount(prev => prev + 1);
                    }}
                    className={`text-[10px] font-mono rounded px-2 py-1.5 border w-full ${
                      theme === 'light'
                        ? 'bg-slate-50 border-slate-300 text-slate-805 hover:bg-slate-100/50 focus:bg-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none'
                        : 'bg-slate-950/90 border-slate-900 text-slate-150 hover:bg-slate-900/40 focus:bg-slate-950 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none'
                    }`}
                  />
                </div>

                {/* Step Size */}
                <div className="flex flex-col gap-1">
                  <span className={`text-[9.5px] font-mono font-bold select-none ${
                    theme === 'light' ? 'text-slate-650' : 'text-slate-400'
                  }`}>Step Size (s)</span>
                  <input
                    type="text"
                    value={state.simulationSettings.stepSize || "10u"}
                    onChange={(e) => {
                      state.simulationSettings.stepSize = e.target.value;
                      saveState();
                      setAppletUpdateCount(prev => prev + 1);
                    }}
                    className={`text-[10px] font-mono rounded px-2 py-1.5 border w-full ${
                      theme === 'light'
                        ? 'bg-slate-50 border-slate-300 text-slate-850 hover:bg-slate-100/50 focus:bg-white focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none'
                        : 'bg-slate-950/90 border-slate-900 text-slate-150 hover:bg-slate-900/40 focus:bg-slate-950 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none'
                    }`}
                  />
                </div>

                {/* Solver Method */}
                <div className="flex flex-col gap-1">
                  <span className={`text-[9.5px] font-mono font-bold select-none ${
                    theme === 'light' ? 'text-slate-650' : 'text-slate-400'
                  }`}>Solver Method</span>
                  <select
                    value={state.simulationSettings.solverMethod || "non-ideal"}
                    onChange={(e) => {
                      state.simulationSettings.solverMethod = e.target.value as any;
                      saveState();
                      setAppletUpdateCount(prev => prev + 1);
                    }}
                    className={`text-[10px] font-mono rounded px-2 py-1.5 border w-full cursor-pointer outline-none ${
                      theme === 'light'
                        ? 'bg-slate-50 border-slate-300 text-slate-800 focus:border-sky-500'
                        : 'bg-slate-950/90 border-slate-900 text-slate-150 focus:border-sky-500'
                    }`}
                  >
                    <option value="non-ideal">Non-Ideal Transient</option>
                    <option value="ideal-pwl">Ideal PWL Solver</option>
                  </select>
                </div>

                {/* Step Type */}
                <div className="flex flex-col gap-1">
                  <span className={`text-[9.5px] font-mono font-bold select-none ${
                    theme === 'light' ? 'text-slate-650' : 'text-slate-400'
                  }`}>Step Type</span>
                  <select
                    value={state.simulationSettings.stepType || "fixed"}
                    onChange={(e) => {
                      state.simulationSettings.stepType = e.target.value as any;
                      saveState();
                      setAppletUpdateCount(prev => prev + 1);
                    }}
                    className={`text-[10px] font-mono rounded px-2 py-1.5 border w-full cursor-pointer outline-none ${
                      theme === 'light'
                        ? 'bg-slate-50 border-slate-300 text-slate-800 focus:border-sky-500'
                        : 'bg-slate-950/90 border-slate-900 text-slate-150 focus:border-sky-500'
                    }`}
                  >
                    <option value="fixed">Fixed Timestep</option>
                    <option value="variable">Variable Timestep</option>
                  </select>
                </div>

                {/* Integration Solver */}
                <div className="flex flex-col gap-1">
                  <span className={`text-[9.5px] font-mono font-bold select-none ${
                    theme === 'light' ? 'text-slate-650' : 'text-slate-400'
                  }`}>Integration Solver</span>
                  <select
                    value={state.simulationSettings.solver || "euler"}
                    onChange={(e) => {
                      state.simulationSettings.solver = e.target.value as any;
                      saveState();
                      setAppletUpdateCount(prev => prev + 1);
                    }}
                    className={`text-[10px] font-mono rounded px-2 py-1.5 border w-full cursor-pointer outline-none ${
                      theme === 'light'
                        ? 'bg-slate-50 border-slate-300 text-slate-800 focus:border-sky-500'
                        : 'bg-slate-950/90 border-slate-900 text-slate-150 focus:border-sky-500'
                    }`}
                  >
                    <option value="euler">Euler</option>
                    <option value="rk45">Runge-Kutta 4/5 (RK45)</option>
                    <option value="radau">Radau (Implicit)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* ZONE 2: CENTER PANE - READ-ONLY SCHEMATIC VIEWER */}
          <div 
            className={`w-full xl:w-auto rounded-2xl flex flex-col overflow-hidden shadow-lg relative min-h-[350px] xl:min-h-0 border ${
              theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-950/20 border-slate-900'
            }`}
            style={{ flex: `1 1 ${schematicRatio}%` }}
          >
            <div className={`absolute top-4 left-4 z-20 flex items-center gap-2 backdrop-blur px-3 py-1.5 border rounded-full font-mono text-[9px] font-bold select-none shadow-md ${
              theme === 'light' ? 'bg-white/95 border-slate-200 text-slate-600' : 'bg-slate-950/80 border-slate-900 text-slate-400'
            }`}>
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
              <span>LAB DIAGRAM MONITOR (LOCKED)</span>
            </div>

            <button
              onClick={() => {
                const currentComps = state.components.filter((c: any) => {
                  if (state.currentSubsystemId) return c.subsystem === state.currentSubsystemId;
                  return !c.subsystem;
                });

                const svg = document.getElementById('canvas-svg');
                if (!svg) return;
                const rect = svg.getBoundingClientRect();
                const viewWidth = rect.width || 800;
                const viewHeight = rect.height || 500;

                if (currentComps.length === 0) {
                  state.zoom = 1.0;
                  state.panX = 50;
                  state.panY = 50;
                  updateViewportTransform();
                  draw();
                  return;
                }

                let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                currentComps.forEach((c: any) => {
                  const cx = Number(c.x) || 0;
                  const cy = Number(c.y) || 0;
                  const hw = 45;
                  const hh = 45;
                  if (cx - hw < minX) minX = cx - hw;
                  if (cx + hw > maxX) maxX = cx + hw;
                  if (cy - hh < minY) minY = cy - hh;
                  if (cy + hh > maxY) maxY = cy + hh;
                });

                const boxWidth = maxX - minX;
                const boxHeight = maxY - minY;
                const paddingFactor = 0.85;
                const zoomX = (viewWidth * paddingFactor) / (boxWidth || 1);
                const zoomY = (viewHeight * paddingFactor) / (boxHeight || 1);
                
                let nextZoom = Math.min(zoomX, zoomY);
                nextZoom = Math.max(0.15, Math.min(2.0, nextZoom));

                const boxCenterX = minX + boxWidth / 2;
                const boxCenterY = minY + boxHeight / 2;

                const nextPanX = viewWidth / 2 - boxCenterX * nextZoom;
                const nextPanY = viewHeight / 2 - boxCenterY * nextZoom;

                state.zoom = nextZoom;
                state.panX = nextPanX;
                state.panY = nextPanY;

                updateViewportTransform();
                draw();
              }}
              className={`absolute top-4 right-4 z-20 flex items-center gap-1 active:scale-95 transition-all px-2.5 py-1.5 rounded-lg text-[9px] font-bold font-mono shadow-md cursor-pointer select-none pointer-events-auto border ${
                theme === 'light'
                  ? 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-800'
                  : 'bg-slate-950/85 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              <Maximize2 className="h-3 w-3 text-sky-400" />
              <span>FIT EXPERIMENT</span>
            </button>
            
            <div className="flex-1 flex flex-col min-h-0">
              <SchematicEditor 
                onRunSimulation={runSchematicSimulation} 
                availableTraces={extractAvailableTraces(simResults)}
                isLoading={isLoading}
                isPaused={isPaused}
                onPauseResume={pauseResumeSimulation}
                onTerminate={terminateSimulation}
              />
            </div>
          </div>

          {/* Draggable splitter */}
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizing(true);
            }}
            className={`hidden xl:flex w-1 hover:w-1.5 hover:bg-sky-500/10 cursor-col-resize transition-all duration-150 self-stretch items-center justify-center group z-30 ${
              isResizing ? 'bg-sky-500/20 w-1.5' : (theme === 'light' ? 'bg-slate-200' : 'bg-slate-900')
            }`}
          >
            <div className={`w-0.5 h-12 rounded-full ${isResizing ? 'bg-sky-400' : 'bg-slate-700 group-hover:bg-sky-400'}`} />
          </div>

          {/* ZONE 3: RIGHT PANE - WAVEFORM PLOTS */}
          <div 
            className={`w-full xl:w-auto border rounded-2xl p-4 flex flex-col overflow-y-auto shadow-lg min-h-[350px] xl:min-h-0 ${
              theme === 'light' ? 'bg-white border-slate-200' : 'bg-slate-950/45 border-slate-900 shadow-inner'
            }`}
            style={{ flex: `1 1 ${100 - schematicRatio}%` }}
          >
            <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 border-b pb-2 shrink-0 select-none ${
              theme === 'light' ? 'border-slate-200' : 'border-slate-900'
            }`}>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-400" />
                <h3 className={`font-mono text-[10px] font-bold uppercase tracking-wider ${
                  theme === 'light' ? 'text-slate-600' : 'text-slate-350'
                }`}>WAVEFORMS OUTPUT PLOTS</h3>
              </div>
              {simResults && (
                <button
                  onClick={resetAllPlotZoom}
                  className={`px-2 py-0.5 text-[9px] font-bold border rounded transition-all cursor-pointer ${
                    theme === 'light'
                      ? 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
                  }`}
                >
                  Fit Zoom Ranges
                </button>
              )}
            </div>

            {/* Plot Options Toolbar */}
            {showPlotterOptions && simResults && (
              <div className={`flex flex-wrap items-center justify-between gap-2 mb-3 p-2 border rounded-xl shrink-0 text-[9px] ${
                theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-slate-950/40 border-slate-900'
              }`}>
                {/* Mode Selectors */}
                <div className="flex items-center gap-1 border rounded p-0.5 bg-slate-950/20 border-slate-800/40 shrink-0">
                  <button
                    onClick={() => setPlotMode('hover')}
                    className={`px-2 py-1 rounded text-center cursor-pointer transition-all ${
                      plotMode === 'hover' ? 'bg-sky-500/15 text-sky-400 font-bold border border-sky-500/20' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Probe Cursor
                  </button>
                  <button
                    onClick={() => setPlotMode('zoom')}
                    className={`px-2 py-1 rounded text-center cursor-pointer transition-all ${
                      plotMode === 'zoom' ? 'bg-indigo-500/15 text-indigo-400 font-bold border border-indigo-500/20' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Box Zoom
                  </button>
                  <button
                    onClick={() => setPlotMode('pan')}
                    className={`px-2 py-1 rounded text-center cursor-pointer transition-all ${
                      plotMode === 'pan' ? 'bg-emerald-500/15 text-emerald-400 font-bold border border-emerald-500/20' : 'text-slate-400 hover:text-slate-200'
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
                    className={`px-2 py-1 rounded text-center cursor-pointer transition-all ${
                      plotMode === 'measure' ? 'bg-yellow-500/15 text-yellow-500 font-bold border border-yellow-500/20' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Ruler Measure
                  </button>
                </div>

                {/* Additional Settings */}
                <div className="flex items-center gap-3 select-none">
                  <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-400">
                    <input 
                      type="checkbox"
                      checked={syncXZoom}
                      onChange={(e) => setSyncXZoom(e.target.checked)}
                      className="rounded accent-sky-500 h-3 w-3"
                    />
                    <span>Sync X-Zoom</span>
                  </label>

                  <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-400">
                    <input 
                      type="checkbox"
                      checked={isImPlotTheme}
                      onChange={(e) => setIsImPlotTheme(e.target.checked)}
                      className="rounded accent-sky-500 h-3 w-3"
                    />
                    <span>Oscilloscope skin</span>
                  </label>

                  <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-400">
                    <input 
                      type="checkbox"
                      checked={isGlobalOverlay}
                      onChange={(e) => setIsGlobalOverlay(e.target.checked)}
                      className="rounded accent-sky-500 h-3 w-3"
                    />
                    <span>Consolidate view</span>
                  </label>
                </div>
              </div>
            )}

            {/* Core Plots Container */}
            <div className="flex-1 flex flex-col min-h-0 gap-3">
              {!simResults ? (
                <div className={`flex-1 flex flex-col items-center justify-center border border-dashed rounded-xl p-6 min-h-[250px] ${
                  theme === 'light' ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-slate-900 bg-slate-950/30 text-slate-500'
                }`}>
                  <Activity className="h-8 w-8 text-slate-600 animate-pulse mb-3" />
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide text-center">Waveform Solver Engine Ready</p>
                  <p className="text-[9px] text-slate-500 mt-1 max-w-xs text-center leading-relaxed">
                    Tune the control parameters inside the left sidebar panel, then hit the green <span className="text-emerald-400 font-bold uppercase">Run Simulation Experiment</span> button to graph outputs.
                  </p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col gap-3">
                  {subplots.map((sp, idx) => renderSinglePlot(sp, idx))}
                </div>
              )}
            </div>

          </div>

        </div>

      </div>
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
    </div>
  );
}
