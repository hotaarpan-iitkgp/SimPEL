import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, RotateCcw, Settings, Sliders, ChevronDown, ChevronRight, 
  Trash2, RotateCw, PlusCircle, ArrowUpRight, Code, Sparkles, BarChart3,
  Undo2, FileJson, Upload, FolderInput, LogOut, CheckCircle2, AlertTriangle, Info,
  Pause, StopCircle, Search, X, Zap, Link, Maximize2
} from 'lucide-react';
import { state, saveState } from '../schematic/state';
import { draw, updateAllWirePathsInDOM } from '../schematic/renderer';
import { initInteractions } from '../schematic/interaction';
import { updatePropertiesPanel } from '../schematic/properties';
import { generateNextId, showToast, getNextGateSignalLabel, updateViewportTransform } from '../schematic/utils';
import { DEFAULT_PARAMETERS, getComponentPins, discoverPortsJS } from '../schematic/config';
import { openSimSettings, saveSimSettings, closeSimSettings } from '../schematic/simSettings';
import { openPlotConfig, savePlotConfig, closePlotConfig, setAvailableVariables } from '../schematic/plotConfig';
import { exportDualGraphJSON, triggerImport, exportJSON, clearWorkspace, undo, navigateToLevel } from '../schematic/actions';
import { DETAILED_COMPONENTS } from '../schematic/detailedLibrary';
import { exportCurrentSubsystemSVG, exportFullSchematicZIP } from '../schematic/svgExporter';
import { getTerminalCoords, getTerminalDir } from '../schematic/routing';

interface SchematicEditorProps {
  onRunSimulation: (netlistJson: string) => void;
  availableTraces: string[];
  isLoading?: boolean;
  isPaused?: boolean;
  onPauseResume?: () => void;
  onTerminate?: () => void;
}

export default function SchematicEditor({ 
  onRunSimulation, 
  availableTraces,
  isLoading = false,
  isPaused = false,
  onPauseResume,
  onTerminate
}: SchematicEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  
  const [showDetailedLibrary, setShowDetailedLibrary] = useState(false);
  const [showSignalRouterPanel, setShowSignalRouterPanel] = useState(false);
  const [showInputRouterPanel, setShowInputRouterPanel] = useState(false);
  const [activeCScriptForRouting, setActiveCScriptForRouting] = useState<any | null>(null);
  const [activeCScriptForInputRouting, setActiveCScriptForInputRouting] = useState<any | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [selectedProbe, setSelectedProbe] = useState<string | null>(null);
  const [routerRefreshTrigger, setRouterRefreshTrigger] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [detailedAccordion, setDetailedAccordion] = useState<Record<string, boolean>>({
    general: false,
    control: false,
    electrical: false
  });
  
  const [subcatAccordion, setSubcatAccordion] = useState<Record<string, boolean>>({});

  const toggleDetailedAccordion = (section: string) => {
    setDetailedAccordion(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const toggleSubcatAccordion = (subcatKey: string) => {
    setSubcatAccordion(prev => ({
      ...prev,
      [subcatKey]: !prev[subcatKey]
    }));
  };

  const renderDetailedCategory = (cat: 'general' | 'control' | 'electrical') => {
    const catComps = DETAILED_COMPONENTS.filter(c => c.category === cat);
    const subcats = Array.from(new Set(catComps.map(c => c.subcategory)));
    
    return subcats.map(subcat => {
      const subcatComps = catComps.filter(c => c.subcategory === subcat);
      const subcatKey = `${cat}-${subcat}`;
      const isSubcatOpen = !!subcatAccordion[subcatKey];
      
      const badgeBg = cat === 'general' 
        ? 'border-sky-500/20 text-sky-400 bg-sky-500/5' 
        : (cat === 'control' ? 'border-emerald-500/20 text-emerald-400 bg-emerald-500/5' : 'border-amber-500/20 text-amber-450 bg-amber-500/5');

      return (
        <div key={subcatKey} className="flex flex-col gap-1 border-b border-slate-900/40 last:border-b-0 pb-2">
          <button
            onClick={() => toggleSubcatAccordion(subcatKey)}
            className="w-full py-2 px-1 text-[9px] font-bold font-sans uppercase tracking-wider text-slate-400 hover:text-slate-200 cursor-pointer flex items-center justify-between"
          >
            <div className="flex items-center gap-1.5">
              {isSubcatOpen ? <ChevronDown className="h-3 w-3 text-slate-500" /> : <ChevronRight className="h-3 w-3 text-slate-500" />}
              <span>{subcat}</span>
            </div>
            <span className={`text-[8px] px-1 py-0.2 rounded border font-mono ${badgeBg}`}>
              {subcatComps.length}
            </span>
          </button>
          
          {isSubcatOpen && (
            <div className="grid grid-cols-2 gap-1.5 p-1 animate-fade-in">
              {subcatComps.map(item => (
                <button
                  key={`palette-detailed-${item.type}`}
                  onClick={() => handleAddComponent(item.type)}
                  className="p-2 border border-slate-900 hover:border-sky-500/30 bg-slate-950 hover:bg-slate-900 text-left rounded-lg text-[11px] font-sans transition-all cursor-pointer group hover:scale-[1.01]"
                  title={item.desc}
                >
                  <div className="font-bold text-slate-350 group-hover:text-white truncate" title={item.label}>{item.label}</div>
                  <div className="text-[9px] text-slate-600 mt-0.5 font-mono">[{item.type}]</div>
                </button>
              ))}
            </div>
          )}
        </div>
      );
    });
  };

  const [activeAccordion, setActiveAccordion] = useState<Record<string, boolean>>({
    power: true,
    control: true,
    probes: true
  });

  const toggleAccordion = (section: string) => {
    setActiveAccordion(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Sync available traces into the plot config drawer of the schematic
  useEffect(() => {
    setAvailableVariables(availableTraces);
  }, [availableTraces]);

  const [navigationPath, setNavigationPath] = useState<string[]>([]);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleExportCurrentSVG = () => {
    try {
      exportCurrentSubsystemSVG();
      showToast("Current subsystem schematic SVG exported.");
    } catch (err: any) {
      showToast(`Failed to export SVG: ${err.message || err}`);
    }
  };

  const handleExportFullZIP = async () => {
    try {
      await exportFullSchematicZIP();
      showToast("Full hierarchical schematic archive (ZIP) exported.");
    } catch (err: any) {
      showToast(`Failed to export ZIP: ${err.message || err}`);
    }
  };

  useEffect(() => {
    const handleNavChange = () => {
      const path = state.navigationStack.map((layer: any) => layer.subsystemId || 'Main');
      if (state.currentSubsystemId) {
        path.push(state.currentSubsystemId);
      }
      setNavigationPath(path);
    };

    window.addEventListener('schematicNavigationChanged', handleNavChange);
    return () => {
      window.removeEventListener('schematicNavigationChanged', handleNavChange);
    };
  }, []);

  // Mount Interactions
  useEffect(() => {
    if (svgRef.current) {
      const cleanListeners = initInteractions(svgRef.current);
      
      // Load initial properties panel view and paint canvas bounds
      draw();
      updatePropertiesPanel();
      
      // Dynamic listener to bridge plot configurations saves to parent
      const handlePlotConfigSave = (e: any) => {
        // Can be captured if parent needs plots re-creation immediately
      };
      window.addEventListener('plotConfigUpdated', handlePlotConfigSave);

      const handleThemeChange = () => {
        draw();
      };
      window.addEventListener('themeChanged', handleThemeChange);

      return () => {
        cleanListeners();
        window.removeEventListener('plotConfigUpdated', handlePlotConfigSave);
        window.removeEventListener('themeChanged', handleThemeChange);
      };
    }
  }, []);

  useEffect(() => {
    const handleOpenRouter = (e: any) => {
      const compId = e.detail.compId;
      const comp = state.components.find((c: any) => c.id === compId);
      if (comp) {
        setActiveCScriptForRouting(comp);
        setShowSignalRouterPanel(true);
      }
    };
    const handleOpenInputRouter = (e: any) => {
      const compId = e.detail.compId;
      const comp = state.components.find((c: any) => c.id === compId);
      if (comp) {
        setActiveCScriptForInputRouting(comp);
        setShowInputRouterPanel(true);
      }
    };
    window.addEventListener('openSignalRouter', handleOpenRouter);
    window.addEventListener('openInputRouter', handleOpenInputRouter);
    return () => {
      window.removeEventListener('openSignalRouter', handleOpenRouter);
      window.removeEventListener('openInputRouter', handleOpenInputRouter);
    };
  }, []);

  useEffect(() => {
    (window as any).refreshSignalRouterPanel = () => {
      setRouterRefreshTrigger(prev => prev + 1);
    };
    return () => {
      delete (window as any).refreshSignalRouterPanel;
    };
  }, []);

  const activeCompExists = activeCScriptForRouting
    ? state.components.some((c: any) => c.id === activeCScriptForRouting.id)
    : false;

  const activeInputCompExists = activeCScriptForInputRouting
    ? state.components.some((c: any) => c.id === activeCScriptForInputRouting.id)
    : false;

  useEffect(() => {
    if (activeCScriptForRouting && !activeCompExists) {
      setShowSignalRouterPanel(false);
      setActiveCScriptForRouting(null);
    }
  }, [activeCScriptForRouting, activeCompExists]);

  useEffect(() => {
    if (activeCScriptForInputRouting && !activeInputCompExists) {
      setShowInputRouterPanel(false);
      setActiveCScriptForInputRouting(null);
    }
  }, [activeCScriptForInputRouting, activeInputCompExists]);

  const handleMapSignal = (outputVar: string, tag: string) => {
    if (!activeCScriptForRouting) return;
    
    saveState();
    
    if (!activeCScriptForRouting.parameters) {
      activeCScriptForRouting.parameters = {};
    }
    if (!activeCScriptForRouting.parameters.goto_mappings) {
      activeCScriptForRouting.parameters.goto_mappings = {};
    }
    
    const existingGotoId = activeCScriptForRouting.parameters.goto_mappings[outputVar];
    let gotoComp = state.components.find((c: any) => c.id === existingGotoId);
    
    if (gotoComp) {
      gotoComp.parameters.tag = tag;
      showToast(`Updated mapping for ${outputVar} to tag ${tag}`);
    } else {
      const gotoId = generateNextId('GOTO_SIG');
      
      const pinCoords = getTerminalCoords(activeCScriptForRouting, outputVar);
      const pinDir = getTerminalDir(activeCScriptForRouting, outputVar);
      
      let candidateX = pinCoords.x + pinDir.x * 60;
      let candidateY = pinCoords.y + pinDir.y * 60;
      
      let collision = true;
      let shiftCount = 0;
      while (collision && shiftCount < 10) {
        collision = false;
        for (const other of state.components) {
          const dx = Math.abs(other.x - candidateX);
          const dy = Math.abs(other.y - candidateY);
          if (dx < 60 && dy < 40) {
            collision = true;
            break;
          }
        }
        if (collision) {
          candidateX += pinDir.x * 40;
          candidateY += pinDir.y * 40;
          shiftCount++;
        }
      }
      
      candidateX = Math.round(candidateX / 20) * 20;
      candidateY = Math.round(candidateY / 20) * 20;
      
      state.components.push({
        id: gotoId,
        type: 'GOTO_SIG',
        x: candidateX,
        y: candidateY,
        rotation: activeCScriptForRouting.rotation,
        parameters: { tag }
      });
      
      activeCScriptForRouting.parameters.goto_mappings[outputVar] = gotoId;
      
      state.wires = state.wires.filter((w: any) => {
        const isCscriptPort = w.from.compId === activeCScriptForRouting.id && w.from.terminal === outputVar;
        return !isCscriptPort;
      });
      
      state.wires.push({
        id: generateNextId('W'),
        from: { type: 'pin', compId: activeCScriptForRouting.id, terminal: outputVar },
        to: { type: 'pin', compId: gotoId, terminal: 'In' },
        manualPath: null
      });
      
      showToast(`Mapped ${outputVar} to wireless tag ${tag}`);
    }
    
    draw();
    updatePropertiesPanel();
    setRouterRefreshTrigger(prev => prev + 1);
  };

  const handleUnmapSignal = (outputVar: string) => {
    if (!activeCScriptForRouting || !activeCScriptForRouting.parameters.goto_mappings) return;
    
    saveState();
    
    const gotoId = activeCScriptForRouting.parameters.goto_mappings[outputVar];
    delete activeCScriptForRouting.parameters.goto_mappings[outputVar];
    
    if (gotoId) {
      state.components = state.components.filter((c: any) => c.id !== gotoId);
      
      state.wires = state.wires.filter((w: any) => {
        if (w.from.compId === gotoId || (w.to && w.to.compId === gotoId)) return false;
        if (w.from.compId === activeCScriptForRouting.id && w.from.terminal === outputVar) return false;
        return true;
      });
      
      showToast(`Removed routing for ${outputVar}`);
    }
    
    draw();
    updatePropertiesPanel();
    setRouterRefreshTrigger(prev => prev + 1);
  };

  const handleAutoRouteFromBlockLabels = () => {
    if (!activeCScriptForRouting) return;
    
    const allFromLabels = new Set<string>();
    state.components.forEach((c: any) => {
      if (c.type === 'FROM_SIG') {
        const tag = (c.parameters?.tag || 'A').trim();
        if (tag) allFromLabels.add(tag);
      } else if (c.type === 'vg-FET') {
        const tag = (c.parameters?.Gate_Signal_Label || 'S1').trim();
        if (tag) allFromLabels.add(tag);
      }
    });
    
    const allGotoLabels = new Set<string>();
    state.components.forEach((c: any) => {
      if (c.type === 'GOTO_SIG') {
        const tag = (c.parameters?.tag || 'A').trim();
        if (tag) allGotoLabels.add(tag);
      }
    });
    
    const unassignedLabels = Array.from(allFromLabels)
      .filter(label => !allGotoLabels.has(label))
      .sort();
      
    if (unassignedLabels.length === 0) {
      showToast("No unassigned From-block or vg-FET tags found on canvas.");
      return;
    }
    
    const outputs = discoverPortsJS(activeCScriptForRouting.parameters?.code || '').outputs;
    
    if (!activeCScriptForRouting.parameters.goto_mappings) {
      activeCScriptForRouting.parameters.goto_mappings = {};
    }
    
    const mappings = activeCScriptForRouting.parameters.goto_mappings;
    const unassignedOutputs = outputs.filter(outVar => {
      const gotoId = mappings[outVar];
      return !gotoId || !state.components.some((c: any) => c.id === gotoId);
    });
    
    if (unassignedOutputs.length === 0) {
      showToast("All C-Script output variables are already mapped.");
      return;
    }
    
    let mapCount = 0;
    const limit = Math.min(unassignedOutputs.length, unassignedLabels.length);
    
    for (let i = 0; i < limit; i++) {
      const outVar = unassignedOutputs[i];
      const label = unassignedLabels[i];
      handleMapSignal(outVar, label);
      mapCount++;
    }
    
    if (mapCount > 0) {
      showToast(`Auto-routed ${mapCount} control signals successfully!`);
    }
  };

  const cscriptOutputs = activeCScriptForRouting
    ? discoverPortsJS(activeCScriptForRouting.parameters?.code || '').outputs
    : [];

  const cscriptInputs = activeCScriptForInputRouting
    ? discoverPortsJS(activeCScriptForInputRouting.parameters?.code || '').inputs
    : [];

  const activeProbes = (() => {
    const probes = new Set<string>();
    if (state.plotConfiguration && Array.isArray(state.plotConfiguration.plots)) {
      state.plotConfiguration.plots.forEach((p: any) => {
        if (Array.isArray(p.variables)) {
          p.variables.forEach((v: string) => {
            if (v && (!activeCScriptForInputRouting || !v.startsWith(activeCScriptForInputRouting.id + '.'))) {
              probes.add(v);
            }
          });
        }
      });
    }
    return Array.from(probes).sort();
  })();

  useEffect(() => {
    if (showInputRouterPanel && activeCScriptForInputRouting && activeCScriptForInputRouting.parameters?.input_mappings) {
      const mappings = activeCScriptForInputRouting.parameters.input_mappings;
      let changed = false;
      Object.keys(mappings).forEach(u => {
        const target = mappings[u];
        if (target && !activeProbes.includes(target)) {
          delete mappings[u];
          changed = true;
        }
      });
      if (changed) {
        draw();
        setRouterRefreshTrigger(prev => prev + 1);
      }
    }
  }, [showInputRouterPanel, activeCScriptForInputRouting, routerRefreshTrigger, activeProbes]);

  const handleMapInputSignal = (inputVar: string, probeTarget: string) => {
    if (!activeCScriptForInputRouting) return;
    saveState();

    if (!activeCScriptForInputRouting.parameters) {
      activeCScriptForInputRouting.parameters = {};
    }
    if (!activeCScriptForInputRouting.parameters.input_mappings) {
      activeCScriptForInputRouting.parameters.input_mappings = {};
    }

    const mappings = activeCScriptForInputRouting.parameters.input_mappings;
    
    // Find if there is already an existing INTERNAL_VAR block connected to this input pin
    const existingWire = state.wires.find((w: any) => {
      const isToCscript = w.to && w.to.type === 'pin' && w.to.compId === activeCScriptForInputRouting.id && w.to.terminal === inputVar;
      if (isToCscript) {
        const fromComp = state.components.find((c: any) => c.id === w.from.compId);
        return fromComp && fromComp.type === 'INTERNAL_VAR';
      }
      return false;
    });

    if (existingWire) {
      const intVarComp = state.components.find((c: any) => c.id === existingWire.from.compId);
      if (intVarComp) {
        if (!intVarComp.parameters) intVarComp.parameters = {};
        intVarComp.parameters.probe_target = probeTarget;
      }
      mappings[inputVar] = probeTarget;
      showToast(`Updated input ${inputVar} mapping to ${probeTarget}`);
    } else {
      const pinCoords = getTerminalCoords(activeCScriptForInputRouting, inputVar);
      const pinDir = getTerminalDir(activeCScriptForInputRouting, inputVar);
      
      let candidateX = pinCoords.x + pinDir.x * 60;
      let candidateY = pinCoords.y + pinDir.y * 60;
      
      let collision = true;
      while (collision) {
        collision = state.components.some((c: any) => {
          const dx = c.x - candidateX;
          const dy = c.y - candidateY;
          return Math.sqrt(dx * dx + dy * dy) < 30;
        });
        if (collision) {
          candidateX += pinDir.x * 40;
          candidateY += pinDir.y * 40;
        }
      }
      
      candidateX = Math.round(candidateX / 20) * 20;
      candidateY = Math.round(candidateY / 20) * 20;

      const intVarId = generateNextId('INTERNAL_VAR');
      
      state.components.push({
        id: intVarId,
        type: 'INTERNAL_VAR',
        x: candidateX,
        y: candidateY,
        rotation: activeCScriptForInputRouting.rotation,
        parameters: { probe_target: probeTarget }
      });

      state.wires = state.wires.filter((w: any) => {
        const isCscriptPort = w.to && w.to.type === 'pin' && w.to.compId === activeCScriptForInputRouting.id && w.to.terminal === inputVar;
        return !isCscriptPort;
      });

      state.wires.push({
        id: generateNextId('W'),
        from: { type: 'pin', compId: intVarId, terminal: 'Out' },
        to: { type: 'pin', compId: activeCScriptForInputRouting.id, terminal: inputVar },
        manualPath: null
      });

      mappings[inputVar] = probeTarget;
      showToast(`Mapped input ${inputVar} to ${probeTarget} wirelessly!`);
    }

    draw();
    setRouterRefreshTrigger(prev => prev + 1);
  };

  const handleUnmapInputSignal = (inputVar: string) => {
    if (!activeCScriptForInputRouting || !activeCScriptForInputRouting.parameters?.input_mappings) return;
    saveState();

    delete activeCScriptForInputRouting.parameters.input_mappings[inputVar];

    const existingWire = state.wires.find((w: any) => {
      const isToCscript = w.to && w.to.type === 'pin' && w.to.compId === activeCScriptForInputRouting.id && w.to.terminal === inputVar;
      if (isToCscript) {
        const fromComp = state.components.find((c: any) => c.id === w.from.compId);
        return fromComp && fromComp.type === 'INTERNAL_VAR';
      }
      return false;
    });

    if (existingWire) {
      const intVarId = existingWire.from.compId;
      state.components = state.components.filter((c: any) => c.id !== intVarId);
      state.wires = state.wires.filter((w: any) => 
        !(w.from && w.from.compId === intVarId) && !(w.to && w.to.compId === intVarId)
      );
    }

    showToast(`Unmapped input ${inputVar}`);
    draw();
    setRouterRefreshTrigger(prev => prev + 1);
  };

  const availableTags = (() => {
    const tags = new Set<string>();
    state.components.forEach((c: any) => {
      if (c.type === 'FROM_SIG') {
        const tag = (c.parameters?.tag || 'A').trim();
        if (tag) tags.add(tag);
      } else if (c.type === 'vg-FET') {
        const tag = (c.parameters?.Gate_Signal_Label || 'S1').trim();
        if (tag) tags.add(tag);
      }
    });
    return Array.from(tags).sort();
  })();

  const handleAddComponent = (type: string) => {
    saveState();
    
    // Calculate snapped grid points at center viewport
    let cx = 360;
    let cy = 240;
    if (svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      cx = (rect.width / 2 - state.panX) / state.zoom;
      cy = (rect.height / 2 - state.panY) / state.zoom;
    }
    
    // snap to 20px grid bounds
    cx = Math.round(cx / 20) * 20;
    cy = Math.round(cy / 20) * 20;
    
    const id = generateNextId(type);
    const parameters = JSON.parse(JSON.stringify(DEFAULT_PARAMETERS[type] || {}));
    if (type === 'vg-FET') {
      parameters.Gate_Signal_Label = getNextGateSignalLabel("S1", state.components);
    }


    
    state.components.push({
      id,
      type,
      x: cx,
      y: cy,
      rotation: 0,
      parameters
    });

    if (type === 'GEN_EBLOCK') {
      const n = parseInt(parameters.terminals) || 3;
      if (!state.plotConfiguration.plots || state.plotConfiguration.plots.length === 0) {
        state.plotConfiguration.plots = [{ title: 'Waveform analysis', variables: [] }];
      }
      const firstPlot = state.plotConfiguration.plots[0];
      if (!firstPlot.variables) firstPlot.variables = [];
      for (let i = 1; i <= n; i++) {
        firstPlot.variables.push(`${id}.v${i}`);
        firstPlot.variables.push(`${id}.i${i}`);
      }
      const ev = new CustomEvent('plotConfigUpdated', { detail: state.plotConfiguration });
      window.dispatchEvent(ev);
    }
    
    draw();
    updatePropertiesPanel();
    showToast(`Added ${id} to canvas.`);
  };

  // Run Simulation exporter trigger
  const handleSimulateBtn = () => {
    try {
      const isRegularMode = (state.simulationSettings.simulationMode || 'regular') === 'regular';
      const netlist = exportDualGraphJSON(isRegularMode);
      const netlistStr = JSON.stringify(netlist, null, 2);
      onRunSimulation(netlistStr);
      showToast("Automatic Netlist Export Complete. Running C++ Solver!");
    } catch (err: any) {
      alert(`Netlist compiling failure: ${err.message || err}`);
    }
  };

  // Handle importing a .json file layout
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        triggerImport(event.target.result as string);
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Clean input
  };

  // Download raw schematic JSON
  const handleExportFile = () => {
    try {
      const jsonStr = exportJSON();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'powerCAD_circuit.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast("Schematic file JSON exported.");
    } catch (err) {
      showToast("Failed to export schematic layout.");
    }
  };

  const handleClearWorkspace = () => {
    // Call modular clear workspace action
    clearWorkspace();
  };

  const handleUndo = () => {
    // Call modular undo action
    undo();
  };

  const handleFitSchematic = () => {
    const comps = state.components || [];
    const wires = state.wires || [];
    
    if (comps.length === 0 && wires.length === 0) {
      state.panX = 100;
      state.panY = 100;
      state.zoom = 1.0;
      updateViewportTransform();
      draw();
      return;
    }
    
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    
    // Components bounding box
    comps.forEach((c: any) => {
      const halfSize = 50; 
      if (c.x - halfSize < minX) minX = c.x - halfSize;
      if (c.x + halfSize > maxX) maxX = c.x + halfSize;
      if (c.y - halfSize < minY) minY = c.y - halfSize;
      if (c.y + halfSize > maxY) maxY = c.y + halfSize;
    });
    
    // Wires bounding box
    wires.forEach((w: any) => {
      if (w.from) {
        if (w.from.x < minX) minX = w.from.x;
        if (w.from.x > maxX) maxX = w.from.x;
        if (w.from.y < minY) minY = w.from.y;
        if (w.from.y > maxY) maxY = w.from.y;
      }
      if (w.to) {
        if (w.to.x < minX) minX = w.to.x;
        if (w.to.x > maxX) maxX = w.to.x;
        if (w.to.y < minY) minY = w.to.y;
        if (w.to.y > maxY) maxY = w.to.y;
      }
      if (Array.isArray(w.waypoints)) {
        w.waypoints.forEach((pt: any) => {
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
        });
      }
    });
    
    const svg = document.getElementById('canvas-svg');
    let W_canvas = 800;
    let H_canvas = 600;
    if (svg) {
      const rect = svg.getBoundingClientRect();
      if (rect.width > 0) W_canvas = rect.width;
      if (rect.height > 0) H_canvas = rect.height;
    }
    
    const padding = 60;
    const W_schematic = (maxX - minX) || 100;
    const H_schematic = (maxY - minY) || 100;
    
    const zoomX = (W_canvas - padding * 2) / W_schematic;
    const zoomY = (H_canvas - padding * 2) / H_schematic;
    let newZoom = Math.min(zoomX, zoomY);
    newZoom = Math.min(2.5, Math.max(0.2, newZoom)); // clamp zoom range for fitting
    
    const center_canvas_X = W_canvas / 2;
    const center_canvas_Y = H_canvas / 2;
    const center_schematic_X = (minX + maxX) / 2;
    const center_schematic_Y = (minY + maxY) / 2;
    
    state.panX = center_canvas_X - center_schematic_X * newZoom;
    state.panY = center_canvas_Y - center_schematic_Y * newZoom;
    state.zoom = newZoom;
    
    updateViewportTransform();
    draw();
  };

  const libraryPower = [
    { type: 'R', label: 'Resistor', desc: 'Passive resistive load R' },
    { type: 'L', label: 'Inductor', desc: 'Energy storing inductor L' },
    { type: 'C', label: 'Capacitor', desc: 'Filtering reservoir capacitor C' },
    { type: 'S', label: 'Ideal Switch', desc: 'Controllable physical switch' },
    { type: 'D', label: 'Diode', desc: 'Unidirectional clamping diode' },
    { type: 'MOSFET', label: 'MOSFET', desc: 'Active semiconductor device' },
    { type: 'vg-FET', label: 'vg-FET', desc: 'MOSFET with wireless gate control' },
    { type: 'V', label: 'DC Voltage Source', desc: 'Constant DC battery input' },
    { type: 'I', label: 'DC Current Source', desc: 'Ideal constant current gen' },
    { type: 'AC_V', label: 'AC Voltage Source', desc: 'Sinusoidal grid voltage source' },
    { type: 'XFMR', label: 'Transformer', desc: 'Ideal multi-winding magnetics' },
    { type: 'VM', label: 'Voltmeter', desc: 'Potential probe sensor' },
    { type: 'AM', label: 'Ammeter', desc: 'Discrete current sensor' },
    { type: 'GND', label: 'Ground', desc: 'Reference ground node (0V)' }
  ];

  const libraryControl = [
    { type: 'CONST', label: 'Constant', desc: 'Discrete constant controller level' },
    { type: 'GAIN', label: 'Gain Scalar', desc: 'Proportional gain factor multiplication' },
    { type: 'PID', label: 'PI Controller', desc: 'Closed loop controller gains effort' },
    { type: 'SUM', label: 'Summing Block', desc: 'Sum or difference junction' },
    { type: 'PWM', label: 'PWM Gen', desc: 'Pulse width generator carrier compare' },
    { type: 'PWM_MASTER', label: 'Master PWM', desc: 'Configurable Master PWM with dead-time and dynamic phase shifts' },
    { type: 'TRI', label: 'Triangle wave', desc: 'High frequency triangle modulation' },
    { type: 'COMP', label: 'Comparator', desc: 'Differential margin switch' },
    { type: 'AND', label: 'AND Logic', desc: 'Boolean AND gate output' },
    { type: 'OR', label: 'OR Logic', desc: 'Boolean OR gate output' },
    { type: 'NOT', label: 'NOT Logic', desc: 'Logic state inverter' },
    { type: 'FCN', label: 'Function F(u)', desc: 'Custom math expression block' },
    { type: 'PROD', label: 'Product Block', desc: 'Multiplier division math operator' },
    { type: 'MUX', label: 'Signal Mux', desc: 'Dynamic vector channels bundling' },
    { type: 'DEMUX', label: 'Signal Demux', desc: 'Unpack channel wires to lanes' },
    { type: 'CSCRIPT', label: 'C++ Script', desc: 'Block algorithm in C++ code' },
  ];

  const libraryProbes = [
    { type: 'PROBE', label: 'Active Probe', desc: 'Single tap waveforms probe' },
    { type: 'SCOPE', label: 'Oscilloscope', desc: 'Simulated scopes display lines' },
  ];

  // Consolidate all components from basic and detailed libraries for search
  const allBasicComponents = [
    ...libraryPower.map(item => ({ type: item.type, label: item.label, desc: item.desc, libType: 'Basic Lib', category: 'electrical', subcategory: 'Power Stage' })),
    ...libraryControl.map(item => ({ type: item.type, label: item.label, desc: item.desc, libType: 'Basic Lib', category: 'control', subcategory: 'Control Loops' })),
    ...libraryProbes.map(item => ({ type: item.type, label: item.label, desc: item.desc, libType: 'Basic Lib', category: 'general', subcategory: 'Scope & Probes' }))
  ];

  const allDetailedComponents = DETAILED_COMPONENTS.map(item => ({
    type: item.type,
    label: item.label,
    desc: item.desc,
    libType: 'Detailed Lib',
    category: item.category as string,
    subcategory: item.subcategory
  }));

  const allComponents = [...allBasicComponents, ...allDetailedComponents];

  // Filter matching components based on query
  const filteredComponents = searchQuery.trim() !== ''
    ? allComponents.filter(item => {
        const query = searchQuery.toLowerCase();
        return (
          item.label.toLowerCase().includes(query) ||
          item.type.toLowerCase().includes(query) ||
          item.desc.toLowerCase().includes(query) ||
          item.subcategory.toLowerCase().includes(query)
        );
      })
    : [];

  return (
    <div className="flex-1 flex flex-col min-h-[820px] bg-slate-950/20 border border-slate-900 rounded-xl shadow-2xl relative">
      <input 
        type="file" 
        ref={importInputRef} 
        onChange={handleImportFile} 
        accept=".json" 
        className="hidden" 
      />
      
      {/* Schematic Editor Toolbar controls */}
      <div className="sticky top-[57px] z-30 flex flex-wrap items-center justify-between gap-4 p-4 border-b border-slate-900 bg-slate-950/85 backdrop-blur-md rounded-t-xl shadow-md">
        
        {/* Actions panel */}
        <div className="flex flex-wrap items-center gap-2">
          
          <button 
            id="btn-undo"
            onClick={handleUndo}
            className="p-2 border border-slate-800 hover:border-slate-700 bg-slate-900/20 hover:bg-slate-900/40 text-slate-300 hover:text-sky-400 rounded-lg transition-all cursor-pointer select-none text-xs font-bold flex items-center gap-1.5"
            title="Ctrl+Z Undo"
          >
            <Undo2 className="h-4 w-4 text-sky-400" />
            <span>Undo</span>
          </button>
          
          <button 
            id="btn-clear-action"
            onClick={handleClearWorkspace}
            className="p-2 border border-slate-800 hover:border-rose-950/50 bg-slate-900/20 text-slate-300 hover:text-rose-400 rounded-lg transition-all cursor-pointer select-none text-xs font-bold flex items-center gap-1.5"
            title="Delete Canvas Items"
          >
            <Trash2 className="h-4 w-4 text-rose-500" />
            <span>Clear Workspace</span>
          </button>
          
          <div className="h-4 w-[1px] bg-slate-900 mx-1" />

          {/* Import/Export buttons */}
          <button 
            onClick={() => importInputRef.current?.click()}
            className="px-3 py-2 border border-slate-800 hover:border-sky-950 bg-slate-900/60 hover:bg-sky-950/20 hover:text-sky-400 rounded-lg text-xs font-bold font-sans cursor-pointer transition-all flex items-center gap-1.5"
          >
            <FolderInput className="h-3.5 w-3.5 text-sky-400" />
            <span>Open Layout</span>
          </button>

          <button 
            onClick={handleExportFile}
            className="px-3 py-2 border border-slate-800 hover:border-sky-950 bg-slate-900/60 hover:bg-sky-950/20 hover:text-sky-400 rounded-lg text-xs font-bold font-sans cursor-pointer transition-all flex items-center gap-1.5"
          >
            <FileJson className="h-3.5 w-3.5 text-amber-500" />
            <span>Save Schematic</span>
          </button>

          <button 
            onClick={handleFitSchematic}
            className="px-3 py-2 border border-slate-800 hover:border-sky-950 bg-slate-900/60 hover:bg-sky-950/20 hover:text-emerald-400 rounded-lg text-xs font-bold font-sans cursor-pointer transition-all flex items-center gap-1.5"
            title="Fit Schematic to Window"
          >
            <Maximize2 className="h-3.5 w-3.5 text-emerald-400" />
            <span>Fit Schematic</span>
          </button>

          {/* Export Menu Dropdown */}
          <div className="relative flex" ref={exportMenuRef}>
            <button 
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="px-3 py-2 border border-slate-800 hover:border-sky-950 bg-slate-900/60 hover:bg-sky-950/20 hover:text-sky-400 rounded-lg text-xs font-bold font-sans cursor-pointer transition-all flex items-center gap-1.5"
            >
              <PlusCircle className="h-3.5 w-3.5 text-emerald-400" />
              <span>Export Schematics</span>
              <ChevronDown className="h-3 w-3 text-slate-550" />
            </button>
            {showExportMenu && (
              <div className="absolute left-0 top-full mt-1.5 w-52 bg-slate-950 border border-slate-800 rounded-xl shadow-2xl z-50 flex flex-col p-1.5 gap-1 animate-fade-in text-slate-200">
                <button
                  onClick={() => {
                    setShowExportMenu(false);
                    handleExportCurrentSVG();
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-900 rounded-lg text-xs font-bold cursor-pointer transition-colors flex items-center gap-2 text-slate-300 hover:text-white"
                >
                  <ArrowUpRight className="h-3.5 w-3.5 text-sky-450" />
                  <span>Current View (SVG)</span>
                </button>
                <button
                  onClick={() => {
                    setShowExportMenu(false);
                    handleExportFullZIP();
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-900 rounded-lg text-xs font-bold cursor-pointer transition-colors flex items-center gap-2 text-slate-300 hover:text-white"
                >
                  <PlusCircle className="h-3.5 w-3.5 text-emerald-450" />
                  <span>Full Schematic (ZIP)</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Modal controls and running buttons */}
        <div className="flex items-center gap-2">
          
          {/* Settings togglers */}
          <button 
            onClick={openSimSettings}
            className="p-2 border border-slate-800 bg-slate-900/40 hover:bg-slate-900 hover:text-sky-400 rounded-lg text-xs font-sans font-bold cursor-pointer transition-all flex items-center gap-1.5"
            title="Solver & Stop time configs"
          >
            <Settings className="h-4 w-4" />
            <span>Simulation Parameters</span>
          </button>

          <button 
            onClick={openPlotConfig}
            className="p-2 border border-slate-800 bg-slate-900/40 hover:bg-slate-900 hover:text-sky-400 rounded-lg text-xs font-sans font-bold cursor-pointer transition-all flex items-center gap-1.5"
            title="Subplots overlay layouts settings"
          >
            <BarChart3 className="h-4 w-4 text-sky-400" />
            <span>Plot Configurations</span>
          </button>

          <div className="h-4 w-[1px] bg-slate-900 mx-1" />

          {/* Run simulated */}
          {isLoading ? (
            <div className="flex items-center gap-2">
              <span className="px-3 py-2 border border-slate-800 bg-slate-900 text-slate-400 rounded-lg text-xs font-bold flex items-center gap-1.5 animate-pulse select-none">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                SIMULATING...
              </span>
              {onPauseResume && (
                <button 
                  onClick={onPauseResume}
                  className="px-3 py-2 border border-yellow-500/30 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/25 rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5 duration-100"
                  title={isPaused ? "Resume simulation" : "Pause simulation"}
                >
                  {isPaused ? <Play className="h-4 w-4 fill-current" /> : <Pause className="h-4 w-4 fill-current" />}
                  <span>{isPaused ? "RESUME" : "PAUSE"}</span>
                </button>
              )}
              {onTerminate && (
                <button 
                  onClick={onTerminate}
                  className="px-3 py-2 border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/25 rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5 duration-100"
                  title="Terminate simulation and plot current data"
                >
                  <StopCircle className="h-4 w-4 text-red-400" />
                  <span>TERMINATE & PLOT</span>
                </button>
              )}
            </div>
          ) : (
            <button 
              onClick={handleSimulateBtn}
              className="px-5 py-2 border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/25 rounded-lg text-xs font-bold cursor-pointer transition-all flex items-center gap-2 shadow-lg shadow-emerald-500/5 select-none hover:scale-[1.02] active:scale-95 duration-100"
            >
              <Play className="h-4.5 w-4.5 fill-current text-emerald-400" />
              <span>COMPILE & RUN SIMULATION</span>
            </button>
          )}
        </div>
      </div>

      {/* Main split workbenches layout */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden" style={{ minHeight: "680px", maxHeight: "85vh" }}>
        
        {/* Left drawer panel - components dictionary */}
        <div className="w-full md:w-64 shrink-0 border-r border-slate-900 bg-slate-950/40 flex flex-col overflow-y-auto max-h-[250px] md:max-h-none">
          {/* Elegant Library Selector Tabs */}
          <div className="flex border-b border-slate-900 bg-slate-950/60 p-1 shrink-0">
            <button
              onClick={() => setShowDetailedLibrary(false)}
              className={`flex-1 py-1.5 text-[10px] font-bold font-mono uppercase tracking-wider rounded-md transition-all cursor-pointer ${
                !showDetailedLibrary
                  ? 'bg-slate-900 text-sky-400 border border-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-350 border border-transparent'
              }`}
            >
              Basic Lib
            </button>
            <button
              onClick={() => setShowDetailedLibrary(true)}
              className={`flex-1 py-1.5 text-[10px] font-bold font-mono uppercase tracking-wider rounded-md transition-all cursor-pointer ${
                showDetailedLibrary
                  ? 'bg-slate-900 text-sky-400 border border-slate-800 shadow-sm'
                  : 'text-slate-500 hover:text-slate-350 border border-transparent'
              }`}
            >
              Detailed Lib
            </button>
          </div>

          {/* Elegant Search Input */}
          <div className="p-2 border-b shrink-0" style={{ borderColor: 'var(--color-border)' }}>
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 h-3.5 w-3.5 pointer-events-none" style={{ color: 'var(--color-text-secondary)' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search components..."
                className="w-full pl-8 pr-7 py-1.5 rounded-lg outline-none text-xs transition-all font-sans focus:ring-1 focus:ring-sky-500/20 border"
                style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 p-1 transition-colors cursor-pointer rounded-full hover:bg-sky-500/10"
                  style={{ color: 'var(--color-text-secondary)' }}
                  title="Clear search"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
          
          {searchQuery.trim() !== '' ? (
            <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1.5" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
              <div className="px-1.5 py-1 font-mono text-[9px] uppercase font-bold tracking-wider flex items-center justify-between" style={{ color: 'var(--color-text-secondary)' }}>
                <span>Search Results</span>
                <span className="border px-1.5 py-0.5 rounded text-[8px]" style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}>
                  {filteredComponents.length} found
                </span>
              </div>
              
              {filteredComponents.length > 0 ? (
                <div className="flex flex-col gap-1.5 animate-fade-in">
                  {filteredComponents.map(item => {
                    const isControl = item.libType === 'Basic Lib' && item.subcategory === 'Control Loops' || item.libType === 'Detailed Lib' && item.category === 'control';
                    const isProbe = item.subcategory.toLowerCase().includes('probe') || item.subcategory.toLowerCase().includes('scope');
                    
                    let nameColor = 'text-slate-300 group-hover:text-white';
                    let borderHover = 'hover:border-sky-500/30';
                    
                    if (item.subcategory === 'Control Loops' || item.libType === 'Detailed Lib' && item.type.includes('CTRL') || item.type === 'PID' || item.type === 'GAIN' || item.type === 'PWM') {
                      nameColor = 'text-teal-400/90 group-hover:text-teal-350';
                      borderHover = 'hover:border-emerald-500/30';
                    } else if (isProbe) {
                      nameColor = 'text-cyan-400 group-hover:text-cyan-300';
                      borderHover = 'hover:border-cyan-500/30';
                    } else if (item.subcategory === 'Power Stage') {
                      nameColor = 'text-amber-500/90 group-hover:text-amber-400';
                      borderHover = 'hover:border-amber-500/30';
                    }

                    return (
                      <button
                        key={`search-${item.libType}-${item.type}`}
                        onClick={() => handleAddComponent(item.type)}
                        className={`w-full p-2.5 border text-left rounded-lg text-[11px] font-sans transition-all cursor-pointer group hover:scale-[1.01] flex flex-col gap-1 hover:bg-sky-500/5 ${borderHover}`}
                        style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
                        title={item.desc}
                      >
                        <div className="flex items-start justify-between gap-2 w-full">
                          <div className={`font-bold truncate ${nameColor}`} style={{ maxWidth: '140px' }}>
                            {item.label}
                          </div>
                          <div className="text-[8px] font-mono shrink-0" style={{ color: 'var(--color-text-secondary)' }}>
                            [{item.type}]
                          </div>
                        </div>
                        <div className="text-[9.5px] line-clamp-2 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                          {item.desc}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1 border-t pt-1 text-[8px] font-mono" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                          <span className="uppercase">{item.libType}</span>
                          <span>•</span>
                          <span className="truncate">{item.subcategory}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="p-6 text-center text-[11px] font-mono mt-4" style={{ color: 'var(--color-text-secondary)' }}>
                  No matching components found.
                </div>
              )}
            </div>
          ) : !showDetailedLibrary ? (
            <>
              {/* Section: Power Stage elements */}
              <div className="border-b border-slate-900">
                <button 
                  onClick={() => toggleAccordion('power')}
                  className="w-full p-3 flex items-center justify-between text-xs font-bold text-slate-300 hover:bg-slate-900/30 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-500 animate-pulse" />
                    <span>Power Stage</span>
                  </div>
                  {activeAccordion.power ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                </button>
                
                {activeAccordion.power && (
                  <div className="p-2 grid grid-cols-2 gap-1.5 bg-slate-950/20">
                    {libraryPower.map(item => (
                      <button
                        key={`palette-${item.type}`}
                        onClick={() => handleAddComponent(item.type)}
                        className="p-2 border border-slate-900 hover:border-sky-500/30 bg-slate-950 hover:bg-slate-900 text-left rounded-lg text-[11px] font-sans transition-all cursor-pointer group hover:scale-[1.01]"
                        title={item.desc}
                      >
                        <div className="font-bold text-slate-300 group-hover:text-white truncate">{item.label}</div>
                        <div className="text-[9px] text-slate-600 mt-0.5 font-mono">[{item.type}]</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Section: Control loops logic */}
              <div className="border-b border-slate-900">
                <button 
                  onClick={() => toggleAccordion('control')}
                  className="w-full p-3 flex items-center justify-between text-xs font-bold text-slate-300 hover:bg-slate-900/30 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Sliders className="h-4 w-4 text-emerald-400" />
                    <span>Control Loops</span>
                  </div>
                  {activeAccordion.control ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                </button>
                
                {activeAccordion.control && (
                  <div className="p-2 grid grid-cols-2 gap-1.5 bg-slate-950/20">
                    {libraryControl.map(item => (
                      <button
                        key={`palette-${item.type}`}
                        onClick={() => handleAddComponent(item.type)}
                        className="p-2 border border-slate-900 hover:border-emerald-500/30 bg-slate-950 hover:bg-slate-900 text-left rounded-lg text-[11px] font-sans transition-all cursor-pointer group hover:scale-[1.01]"
                        title={item.desc}
                      >
                        <div className="font-bold text-teal-400/90 group-hover:text-teal-300 truncate">{item.label}</div>
                        <div className="text-[9px] text-slate-600 mt-0.5 font-mono">[{item.type}]</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Section: Scopes / probes */}
              <div className="border-b border-slate-900">
                <button 
                  onClick={() => toggleAccordion('probes')}
                  className="w-full p-3 flex items-center justify-between text-xs font-bold text-slate-300 hover:bg-slate-900/30 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <ArrowUpRight className="h-4 w-4 text-cyan-400" />
                    <span>Scope & Probes</span>
                  </div>
                  {activeAccordion.probes ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                </button>
                
                {activeAccordion.probes && (
                  <div className="p-2 grid grid-cols-2 gap-1.5 bg-slate-950/20">
                    {libraryProbes.map(item => (
                      <button
                        key={`palette-${item.type}`}
                        onClick={() => handleAddComponent(item.type)}
                        className="p-2 border border-slate-900 hover:border-cyan-500/30 bg-slate-950 hover:bg-slate-900 text-left rounded-lg text-[11px] font-sans transition-all cursor-pointer group hover:scale-[1.01]"
                        title={item.desc}
                      >
                        <div className="font-bold text-cyan-400 group-hover:text-cyan-300 truncate">{item.label}</div>
                        <div className="text-[9px] text-slate-600 mt-0.5 font-mono">[{item.type}]</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {/* Category: General */}
              <div className="border-b border-slate-900">
                <button 
                  onClick={() => toggleDetailedAccordion('general')}
                  className="w-full p-3 flex items-center justify-between text-xs font-bold text-slate-300 hover:bg-slate-900/30 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-sky-400" />
                    <span>General Blocks</span>
                  </div>
                  {detailedAccordion.general ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                </button>
                
                {detailedAccordion.general && (
                  <div className="bg-slate-950/25 p-2 flex flex-col gap-3">
                    {renderDetailedCategory('general')}
                  </div>
                )}
              </div>

              {/* Category: Control */}
              <div className="border-b border-slate-900">
                <button 
                  onClick={() => toggleDetailedAccordion('control')}
                  className="w-full p-3 flex items-center justify-between text-xs font-bold text-slate-300 hover:bg-slate-900/30 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Sliders className="h-4 w-4 text-emerald-400" />
                    <span>Control Blocks</span>
                  </div>
                  {detailedAccordion.control ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                </button>
                
                {detailedAccordion.control && (
                  <div className="bg-slate-950/25 p-2 flex flex-col gap-3">
                    {renderDetailedCategory('control')}
                  </div>
                )}
              </div>

              {/* Category: Electrical */}
              <div className="border-b border-slate-900">
                <button 
                  onClick={() => toggleDetailedAccordion('electrical')}
                  className="w-full p-3 flex items-center justify-between text-xs font-bold text-slate-350 hover:bg-slate-900/30 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <ArrowUpRight className="h-4 w-4 text-amber-500" />
                    <span>Electrical Blocks</span>
                  </div>
                  {detailedAccordion.electrical ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                </button>
                
                {detailedAccordion.electrical && (
                  <div className="bg-slate-950/25 p-2 flex flex-col gap-3">
                    {renderDetailedCategory('electrical')}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Center workbench - canvas viewer */}
        <div className="flex-1 min-h-[300px] md:min-h-none flex flex-col relative bg-slate-950/10">
          <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-1 pointer-events-none select-none">
            <div id="zoom-display" className="px-2 py-1 border border-slate-800 bg-slate-950/80 backdrop-blur text-[9.5px] font-mono rounded text-slate-400 font-bold">
              Zoom: 100%
            </div>
            <div className="px-2 py-1 border border-slate-800 bg-slate-950/80 backdrop-blur text-[9px] text-slate-500 rounded">
              Use scroll-wheel to zoom. Drag background to pan.
            </div>
          </div>

          {/* Breadcrumbs navigation bar */}
          {navigationPath.length > 0 && (
            <div className="flex items-center gap-1.5 px-4 py-2 border-b bg-slate-950/40 text-[11px] font-mono select-none" style={{ borderColor: 'var(--color-border)' }}>
              <button 
                onClick={() => navigateToLevel(-1)} 
                className="text-sky-400 hover:text-sky-300 font-bold cursor-pointer transition-colors"
              >
                Main
              </button>
              {navigationPath.map((name, index) => (
                <React.Fragment key={index}>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                  <button
                    onClick={() => navigateToLevel(index)}
                    disabled={index === navigationPath.length - 1}
                    className={`transition-colors truncate max-w-[100px] ${
                      index === navigationPath.length - 1 
                        ? 'text-slate-300 font-bold pointer-events-none' 
                        : 'text-sky-400 hover:text-sky-300 cursor-pointer'
                    }`}
                    title={name}
                  >
                    {name.split('.').pop()}
                  </button>
                </React.Fragment>
              ))}
            </div>
          )}

          {/* Canvas SVG */}
          <div className="w-full h-full min-h-[640px] flex-1 overflow-hidden">
            <svg 
              id="canvas-svg"
              ref={svgRef}
              className="w-full h-full select-none outline-none"
              style={{ minHeight: "640px", cursor: 'default' }}
            >
              {/* Backgrid patterns */}
              <defs>
                <pattern id="grid-pattern" width="20" height="20" patternUnits="userSpaceOnUse">
                  <circle cx="20" cy="20" r="1" fill="var(--canvas-grid-dot)" />
                </pattern>
                <marker id="control-arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M 0 1.5 L 7 5 L 0 8.5 z" fill="var(--canvas-wire-control)" />
                </marker>
              </defs>
              
              {/* Backdrop grid */}
              <rect width="100%" height="100%" className="grid-bg" />
              <rect width="100%" height="100%" fill="url(#grid-pattern)" />
              
              {/* Scale transform groups */}
              <g id="viewport" transform="translate(100, 100) scale(1.0)">
                <g id="wires-group"></g>
                
                {/* Active connecting wire preview */}
                <path id="preview-wire" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeDasharray="3 3" display="none" />
                
                <g id="components-group"></g>
                <g id="junctions-group"></g>
                <g id="handles-group"></g>
                
                {/* Visual select marquee box */}
                <rect id="box-select-marquee" fill="rgba(56, 189, 248, 0.08)" stroke="#38bdf8" strokeWidth="1" strokeDasharray="2 2" display="none" />
              </g>
            </svg>
          </div>

          <div id="toast" className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 border border-sky-400 bg-sky-950/90 text-sky-200 rounded-lg text-xs font-semibold shadow-2xl z-30 opacity-0 transition-opacity pointer-events-none">
            Toast alert!
          </div>

          {/* Slide-out Signal Router Panel */}
          {showSignalRouterPanel && activeCScriptForRouting && (
            <div 
              className="absolute right-0 top-0 h-full w-80 bg-slate-950/85 backdrop-blur-md border-l border-slate-800 shadow-2xl z-20 flex flex-col animate-fade-in"
            >
              {/* Header */}
              <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/40">
                <h3 className="font-bold flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-slate-200">
                  <Zap className="h-4 w-4 text-amber-500 animate-pulse" />
                  <span>Control Signal Router</span>
                </h3>
                <button 
                  onClick={() => {
                    setShowSignalRouterPanel(false);
                    setActiveCScriptForRouting(null);
                    setSelectedLabel(null);
                  }} 
                  className="text-slate-500 hover:text-slate-350 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                {/* Description */}
                <div className="text-[10px] text-slate-400 bg-slate-900/60 p-3 rounded-lg border border-slate-900 leading-relaxed">
                  Map internal variables to external <strong>Go-To</strong> blocks. Drag from the list on the right, or click a label to select and click an output slot.
                </div>
                
                {/* Auto Route Button */}
                <button
                  onClick={handleAutoRouteFromBlockLabels}
                  className="w-full py-2 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold font-mono transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-indigo-600/10 border border-indigo-500/20"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Auto-Route from Canvas Labels</span>
                </button>

                {/* Two columns wrapper */}
                <div className="flex-1 flex gap-3 min-h-0">
                  {/* Column 1: Outputs */}
                  <div className="flex-1 flex flex-col gap-2 min-w-0">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">C-Script Outputs</span>
                    <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
                      {cscriptOutputs.length === 0 ? (
                        <span className="text-[10px] text-slate-600 italic">No output variables found in code.</span>
                      ) : (
                        cscriptOutputs.map(outVar => {
                          const mappings = activeCScriptForRouting.parameters?.goto_mappings || {};
                          const gotoId = mappings[outVar];
                          const gotoComp = gotoId ? state.components.find((c: any) => c.id === gotoId) : null;
                          const mappedTag = gotoComp ? gotoComp.parameters?.tag : null;

                          return (
                            <div 
                              key={outVar} 
                              className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/30 flex flex-col gap-1.5 hover:border-slate-700/60 transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-[10px] font-bold text-sky-400 truncate" title={outVar}>{outVar}</span>
                                {mappedTag && (
                                  <button 
                                    onClick={() => handleUnmapSignal(outVar)}
                                    className="text-[9px] text-red-400 hover:text-red-300 font-mono font-bold cursor-pointer hover:bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20 transition-colors"
                                  >
                                    Unassign
                                  </button>
                                )}
                              </div>
                              
                              {/* Drop zone */}
                              <div 
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  e.currentTarget.classList.add('border-sky-500', 'bg-sky-500/5');
                                }}
                                onDragLeave={(e) => {
                                  e.currentTarget.classList.remove('border-sky-500', 'bg-sky-500/5');
                                }}
                                onDrop={(e) => {
                                  e.currentTarget.classList.remove('border-sky-500', 'bg-sky-500/5');
                                  const tag = e.dataTransfer.getData('text/plain');
                                  if (tag) {
                                    handleMapSignal(outVar, tag);
                                  }
                                }}
                                onClick={() => {
                                  if (selectedLabel) {
                                    handleMapSignal(outVar, selectedLabel);
                                    setSelectedLabel(null);
                                  }
                                }}
                                className={`h-11 rounded-lg border-2 border-dashed flex items-center justify-center text-[10px] font-medium transition-all cursor-pointer ${
                                  mappedTag 
                                    ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-400 font-bold' 
                                    : selectedLabel 
                                      ? 'border-indigo-500/40 bg-indigo-500/5 hover:border-indigo-400 text-indigo-400 animate-pulse' 
                                      : 'border-slate-800 hover:border-slate-700 text-slate-500'
                                }`}
                              >
                                {mappedTag ? (
                                  <div className="flex items-center gap-1.5">
                                    <Link className="h-3 w-3 text-emerald-500 shrink-0" />
                                    <span className="truncate max-w-[90px]">{mappedTag}</span>
                                  </div>
                                ) : selectedLabel ? (
                                  <span>Click to assign {selectedLabel}</span>
                                ) : (
                                  <span>Drop tag here</span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Column 2: Available Labels */}
                  <div className="w-24 shrink-0 flex flex-col gap-2">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Canvas Tags</span>
                    <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-1">
                      {availableTags.length === 0 ? (
                        <span className="text-[9px] text-slate-600 italic leading-snug">No tags on canvas.</span>
                      ) : (
                        availableTags.map(tag => {
                          const isSelected = selectedLabel === tag;
                          return (
                            <div
                              key={tag}
                              draggable
                              onDragStart={(e) => {
                                  e.dataTransfer.setData('text/plain', tag);
                              }}
                              onClick={() => {
                                  setSelectedLabel(isSelected ? null : tag);
                              }}
                              className={`p-2 rounded-lg border text-center text-[10px] font-bold font-mono cursor-grab active:cursor-grabbing transition-all select-none hover:scale-[1.03] ${
                                isSelected 
                                  ? 'border-indigo-500 bg-indigo-600 text-white shadow-lg shadow-indigo-600/25' 
                                  : 'border-slate-800 bg-slate-900/40 hover:bg-slate-900/10 text-slate-350 hover:border-slate-700'
                              }`}
                              title="Drag to assign, or click to snap"
                            >
                              {tag}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Slide-out Input Router Panel */}
          {showInputRouterPanel && activeCScriptForInputRouting && (
            <div 
              className="absolute left-0 top-0 h-full w-80 bg-slate-950/85 backdrop-blur-md border-r border-slate-800 shadow-2xl z-20 flex flex-col animate-fade-in"
            >
              {/* Header */}
              <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/40">
                <h3 className="font-bold flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-slate-200">
                  <Zap className="h-4 w-4 text-indigo-500 animate-pulse" />
                  <span>Input Probing Router</span>
                </h3>
                <button 
                  onClick={() => {
                    setShowInputRouterPanel(false);
                    setActiveCScriptForInputRouting(null);
                    setSelectedProbe(null);
                  }} 
                  className="text-slate-500 hover:text-slate-350 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                {/* Description */}
                <div className="text-[10px] text-slate-400 bg-slate-900/60 p-3 rounded-lg border border-slate-900 leading-relaxed">
                  Map actively probed circuit variables to internal <strong>C-Script</strong> inputs. Drag from the list on the left, or click a probe to select and click an input slot.
                </div>

                {/* Two columns wrapper */}
                <div className="flex-1 flex gap-3 min-h-0">
                  {/* Column 1: Available Probes */}
                  <div className="w-24 shrink-0 flex flex-col gap-2">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Active Probes</span>
                    <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-1">
                      {activeProbes.length === 0 ? (
                        <span className="text-[9px] text-slate-600 italic leading-snug">No active probes on canvas.</span>
                      ) : (
                        activeProbes.map(probe => {
                          const isSelected = selectedProbe === probe;
                          return (
                            <div
                              key={probe}
                              draggable
                              onDragStart={(e) => {
                                  e.dataTransfer.setData('text/plain', probe);
                              }}
                              onClick={() => {
                                  setSelectedProbe(isSelected ? null : probe);
                              }}
                              className={`p-2 rounded-lg border text-center text-[9px] font-bold font-mono cursor-grab active:cursor-grabbing transition-all select-none hover:scale-[1.03] truncate ${
                                isSelected 
                                  ? 'border-indigo-500 bg-indigo-600/90 text-white shadow-lg shadow-indigo-600/25' 
                                  : 'border-slate-800 bg-slate-900/40 hover:bg-slate-900/10 text-slate-350 hover:border-slate-700'
                              }`}
                              title={probe}
                            >
                              {probe}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Column 2: C-Script Inputs */}
                  <div className="flex-1 flex flex-col gap-2 min-w-0">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">C-Script Inputs</span>
                    <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
                      {cscriptInputs.length === 0 ? (
                        <span className="text-[10px] text-slate-600 italic">No input variables found in code.</span>
                      ) : (
                        cscriptInputs.map(inputVar => {
                          const mappings = activeCScriptForInputRouting.parameters?.input_mappings || {};
                          const mappedProbe = mappings[inputVar];

                          return (
                            <div 
                              key={inputVar} 
                              className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/30 flex flex-col gap-1.5 hover:border-slate-700/60 transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-mono text-[10px] font-bold text-sky-400 truncate" title={inputVar}>{inputVar}</span>
                                {mappedProbe && (
                                  <button 
                                    onClick={() => handleUnmapInputSignal(inputVar)}
                                    className="text-[9px] text-red-400 hover:text-red-300 font-mono font-bold cursor-pointer hover:bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20 transition-colors"
                                  >
                                    Unassign
                                  </button>
                                )}
                              </div>
                              
                              {/* Drop zone */}
                              <div 
                                onDragOver={(e) => {
                                  e.preventDefault();
                                  e.currentTarget.classList.add('border-indigo-500', 'bg-indigo-500/5');
                                }}
                                onDragLeave={(e) => {
                                  e.currentTarget.classList.remove('border-indigo-500', 'bg-indigo-500/5');
                                }}
                                onDrop={(e) => {
                                  e.currentTarget.classList.remove('border-indigo-500', 'bg-indigo-500/5');
                                  const probe = e.dataTransfer.getData('text/plain');
                                  if (probe) {
                                    handleMapInputSignal(inputVar, probe);
                                  }
                                }}
                                onClick={() => {
                                  if (selectedProbe) {
                                    handleMapInputSignal(inputVar, selectedProbe);
                                    setSelectedProbe(null);
                                  }
                                }}
                                className={`h-11 rounded-lg border-2 border-dashed flex items-center justify-center text-[10px] font-medium transition-all cursor-pointer ${
                                  mappedProbe 
                                    ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-400 font-bold' 
                                    : selectedProbe 
                                      ? 'border-indigo-500/40 bg-indigo-500/5 hover:border-indigo-400 text-indigo-400 animate-pulse' 
                                      : 'border-slate-800 hover:border-slate-700 text-slate-500'
                                }`}
                              >
                                {mappedProbe ? (
                                  <div className="flex items-center gap-1.5">
                                    <Link className="h-3 w-3 text-emerald-500 shrink-0" />
                                    <span className="truncate max-w-[120px]">{mappedProbe}</span>
                                  </div>
                                ) : selectedProbe ? (
                                  <span>Click to assign {selectedProbe}</span>
                                ) : (
                                  <span>Drop probe here</span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right drawer panel - component properties */}
        <div id="sidebar-right" className="w-full md:w-64 shrink-0 border-t md:border-t-0 md:border-l border-slate-900 bg-slate-950/45 p-4 flex flex-col overflow-y-auto max-h-[300px] md:max-h-none">
          <div className="mb-3 border-b border-slate-900 pb-2 font-mono text-[10px] uppercase font-bold tracking-wider text-slate-500">
            ⚙️ PARAMETERS INSPECTOR
          </div>
          <div id="properties-panel" className="flex-1">
            {/* Populated dynamically inside properties.ts */}
            <div className="text-slate-500 font-mono text-[11px] text-center mt-8">
              Select component on canvas to edit parameters.
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Footer status bar */}
      <footer className="h-9 shrink-0 flex items-center justify-between px-4 bg-slate-950/85 border-t border-slate-950 text-[10px] font-mono text-slate-500 select-none">
        <div id="selection-display">Selection: None</div>
        <div className="flex gap-4 items-center">
          <div id="footer-coord-x">X: 0</div>
          <div id="footer-coord-y">Y: 0</div>
          <div className="text-sky-500 font-bold">GRID SILICON 20px</div>
        </div>
      </footer>

      {/* ========================================================= */}
      {/* CAD Schematic Overlay Modal Dialog Dialogs */}
      {/* ========================================================= */}

      {/* Modal 1: Simulation settings */}
      <div id="sim-settings-modal" className="modal-overlay">
        <div className="modal-content text-slate-200 text-sm">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
            <h3 className="font-bold flex items-center gap-2">
              <Sliders className="h-4 o-4 text-emerald-400" />
              <span>Simulation Solver settings</span>
            </h3>
            <button onClick={closeSimSettings} className="text-slate-500 hover:text-slate-350 cursor-pointer">×</button>
          </div>
          <div className="p-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Time limit stop (seconds)</label>
              <input id="sim-stop-time" type="text" className="px-3 py-2 bg-slate-950 border border-slate-800 rounded outline-none focus:border-emerald-500 text-xs font-mono" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Step solver interval dt (seconds / scientific shorthand)</label>
              <input id="sim-step-size" type="text" className="px-3 py-2 bg-slate-950 border border-slate-800 rounded outline-none focus:border-emerald-500 text-xs font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">Interval sizing type</label>
                <select id="sim-step-type" className="px-3 py-2 bg-slate-950 border border-slate-800 rounded outline-none focus:border-emerald-500 text-xs">
                  <option value="fixed">Fixed timestep size</option>
                  <option value="variable">Variable timestep size</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-400">Solver Integration Core</label>
                <select id="sim-solver" className="px-3 py-2 bg-slate-950 border border-slate-800 rounded outline-none focus:border-emerald-500 text-xs">
                  <option value="euler">Euler Forward Method</option>
                  <option value="rk45">Runge-Kutta Cash-Karp (RK45)</option>
                  <option value="radau">Implicit Radau solver</option>
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Simulation Mode</label>
              <select id="sim-mode" className="px-3 py-2 bg-slate-950 border border-slate-800 rounded outline-none focus:border-emerald-500 text-xs">
                <option value="regular">Regular Simulation (Treat wires as short circuits, faster)</option>
                <option value="current_flow">Current Flow Animation (Treat wires as small resistors)</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400">Solver Method</label>
              <select id="sim-solver-method" className="px-3 py-2 bg-slate-950 border border-slate-800 rounded outline-none focus:border-emerald-500 text-xs">
                <option value="non-ideal">Non-Ideal (DAE solver with ESR/parasitics)</option>
                <option value="ideal-pwl">Ideal PWL (High-speed node-collapsing solver)</option>
              </select>
            </div>
          </div>
          <div className="p-4 border-t border-slate-800 flex justify-end gap-2 bg-slate-900/10">
            <button onClick={closeSimSettings} className="px-4 py-2 border border-slate-800 hover:bg-slate-900 rounded font-bold text-xs cursor-pointer">Cancel</button>
            <button onClick={saveSimSettings} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-650 text-white font-bold rounded text-xs cursor-pointer">Save Solver Parameters</button>
          </div>
        </div>
      </div>

      {/* Modal 2: Multi-figure Plot configurations layout */}
      <div id="plot-config-modal" className="modal-overlay">
        <div className="modal-content text-slate-200 text-sm max-w-[660px]">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
            <h3 className="font-bold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-sky-400" />
              <span>Waveform visual overlay subplots configurations</span>
            </h3>
            <button onClick={closePlotConfig} className="text-slate-500 hover:text-slate-350 cursor-pointer">×</button>
          </div>
          
          <div className="flex" style={{ height: "350px" }}>
            {/* Left panels list */}
            <div className="w-[180px] shrink-0 border-r border-slate-800 flex flex-col justify-between bg-slate-950/30">
              <div className="p-2 border-b border-slate-805 text-xxs font-mono font-bold text-slate-500 uppercase tracking-wide">
                📑 Plot Figures Grid
              </div>
              <div id="plots-list-container" className="flex-1 overflow-y-auto">
                {/* Populated inside plotConfig.ts */}
              </div>
            </div>
            
            {/* Center configurations content */}
            <div className="flex-1 overflow-y-auto p-4" id="plots-preview-container">
              {/* Card subplots populated inside plotConfig.ts */}
            </div>
            
            {/* Right signals selection side lists */}
            <div className="w-[180px] shrink-0 border-l border-slate-805 bg-slate-950/20 p-3 flex flex-col gap-2" id="modal-vars-panel">
              {/* Populate details */}
            </div>
          </div>
          
          <div className="p-4 border-t border-slate-808 flex justify-end gap-2 bg-slate-900/10">
            <button onClick={closePlotConfig} className="px-4 py-2 border border-slate-800 hover:bg-slate-900 rounded font-bold text-xs cursor-pointer">Close</button>
            <button onClick={savePlotConfig} className="px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white font-bold rounded text-xs cursor-pointer">Apply Overlay Configurations</button>
          </div>
        </div>
      </div>

      {/* Modal 3: Block code scripts Editor overlay */}
      <div id="code-editor-modal" className="modal-overlay animate-fade-in">
        <div className="modal-content text-slate-200 text-sm max-w-[700px] w-11/12 overflow-hidden flex flex-col transition-all duration-200">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
            <h3 className="font-bold flex items-center gap-2">
              <Code className="h-4 w-4 text-emerald-400" />
              <span>C++ Script Block Editor</span>
            </h3>
            <button id="code-editor-close" onClick={() => document.getElementById('code-editor-modal')?.classList.remove('show')} className="text-slate-500 hover:text-slate-350 cursor-pointer">×</button>
          </div>
          
          <div className="flex flex-row overflow-hidden" style={{ minHeight: "420px" }}>
            {/* Left editor side */}
            <div className="flex-1 flex flex-col gap-3 p-4">
              <div className="flex gap-2 p-2.5 bg-slate-950 border border-slate-900 rounded-lg text-[10px] text-emerald-400/90 leading-relaxed font-sans shadow-sm">
                <Info className="h-4 w-4 shrink-0 text-emerald-500" />
                <div>
                  <strong>C++ Script block guidelines:</strong> Implement <code>void initialize()</code> and <code>void step()</code>. Read inputs via <code>inputs["name"]</code> or <code>inputs.get("name")</code>. Write outputs to <code>outputs["name"]</code>. Persist states in <code>state["name"]</code>.
                </div>
              </div>
              <textarea 
                id="code-editor-textarea" 
                spellCheck="false"
                className="w-full h-80 p-3 font-mono text-[11px] bg-slate-950 border border-slate-800 rounded outline-none focus:border-emerald-500 text-emerald-400/95 leading-relaxed"
              />
            </div>
            
            {/* Right plot configuration side */}
            <div 
              id="code-editor-plot-pane" 
              className="w-80 border-l border-slate-800 bg-slate-950 p-4 flex flex-col gap-3 hidden"
              style={{ borderLeft: '1px solid #1e293b' }}
            />
          </div>
          
          <div className="p-4 border-t border-slate-800 flex items-center justify-between gap-2 bg-slate-900/10">
            <div className="flex gap-2">
              <button id="code-editor-toggle-plot" className="px-4 py-2 border border-slate-800 hover:bg-slate-900 rounded font-bold text-xs cursor-pointer text-slate-300">Configure Plots</button>
              <button id="code-editor-toggle-params" className="px-4 py-2 border border-slate-800 hover:bg-slate-900 rounded font-bold text-xs cursor-pointer text-slate-300 hidden">Params</button>
            </div>
            <div className="flex gap-2">
              <button id="code-editor-cancel" className="px-4 py-2 border border-slate-800 hover:bg-slate-900 rounded font-bold text-xs cursor-pointer">Discard</button>
              <button id="code-editor-save" className="px-4 py-2 bg-emerald-500 hover:bg-emerald-650 font-bold rounded text-xs cursor-pointer text-white">Save Code Block</button>
            </div>
          </div>
        </div>
      </div>
      {/* Modal 4: Subsystem Mask Structure Editor */}
      <div id="mask-editor-modal" className="modal-overlay animate-fade-in">
        <div className="modal-content text-slate-200 text-sm max-w-[600px] w-11/12 overflow-hidden flex flex-col transition-all duration-200" style={{ maxHeight: "85vh" }}>
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
            <h3 className="font-bold flex items-center gap-2">
              <Sliders className="h-4 w-4 text-sky-400" />
              <span>Edit Subsystem Mask</span>
            </h3>
            <button onClick={() => document.getElementById('mask-editor-modal')?.classList.remove('show')} className="text-slate-550 hover:text-slate-350 cursor-pointer text-xl font-bold">×</button>
          </div>
          <div className="p-4 flex flex-col gap-4 overflow-y-auto" style={{ flex: 1 }}>
            <div className="text-xs text-slate-400 leading-relaxed">
              Define the parameters that this subsystem exposes. Child blocks inside the subsystem can reference these parameters by variable name.
            </div>
            <div id="mask-params-container" className="flex flex-col gap-2">
              {/* Parameter rows generated dynamically */}
            </div>
            <button id="btn-add-mask-param" className="mt-2 px-3 py-2 border border-dashed border-slate-800 hover:border-sky-500 hover:text-sky-450 rounded-lg text-xs font-bold cursor-pointer text-slate-400 transition-colors flex items-center justify-center gap-1">
              <PlusCircle className="h-4 w-4" />
              <span>Add Parameter</span>
            </button>
          </div>
          <div className="p-4 border-t border-slate-800 flex justify-end gap-2 bg-slate-900/10">
            <button id="mask-editor-cancel" className="px-4 py-2 border border-slate-800 hover:bg-slate-900 rounded font-bold text-xs cursor-pointer">Discard</button>
            <button id="mask-editor-save" className="px-4 py-2 bg-sky-500 hover:bg-sky-650 font-bold rounded text-xs cursor-pointer text-white">Save Mask</button>
          </div>
        </div>
      </div>

      {/* Modal 5: Subsystem Mask Values Parameters Dialog */}
      <div id="mask-values-modal" className="modal-overlay animate-fade-in">
        <div className="modal-content text-slate-200 text-sm max-w-[450px] w-11/12 overflow-hidden flex flex-col transition-all duration-200" style={{ maxHeight: "80vh" }}>
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
            <h3 id="mask-values-title" className="font-bold flex items-center gap-2">Subsystem Parameters</h3>
            <button onClick={() => document.getElementById('mask-values-modal')?.classList.remove('show')} className="text-slate-550 hover:text-slate-350 cursor-pointer text-xl font-bold">×</button>
          </div>
          <div id="mask-values-container" className="p-4 flex flex-col gap-3 overflow-y-auto" style={{ flex: 1 }}>
            {/* Value inputs generated dynamically */}
          </div>
          <div className="p-4 border-t border-slate-800 flex justify-end gap-2 bg-slate-900/10">
            <button id="mask-values-cancel" className="px-4 py-2 border border-slate-800 hover:bg-slate-900 rounded font-bold text-xs cursor-pointer">Cancel</button>
            <button id="mask-values-save" className="px-4 py-2 bg-sky-500 hover:bg-sky-650 font-bold rounded text-xs cursor-pointer text-white">OK</button>
          </div>
        </div>
      </div>

      {/* Modal 6: PLECS Probe Editor Dialog */}
      <div id="probe-editor-modal" className="modal-overlay animate-fade-in">
        <div id="probe-editor-drop-zone" className="modal-content text-slate-200 text-sm max-w-[650px] w-11/12 overflow-hidden flex flex-col transition-all duration-200" style={{ maxHeight: "80vh" }}>
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
            <h3 id="probe-editor-title" className="font-bold flex items-center gap-2">Probe Editor</h3>
            <button id="probe-editor-close-btn" className="text-slate-400 hover:text-slate-200 cursor-pointer text-xl font-bold">×</button>
          </div>
          
          <div className="p-4 flex gap-4 overflow-hidden" style={{ flex: 1, minHeight: "350px" }}>
            {/* Left Column: Probed Components */}
            <div className="w-1/2 flex flex-col border border-slate-800 rounded bg-slate-950/40 overflow-hidden">
              <div className="p-2 border-b border-slate-800 bg-slate-900/30 flex justify-between items-center">
                <span className="font-bold text-xs text-slate-400">Probed components</span>
                <div className="flex gap-1">
                  <button id="probe-comp-remove" title="Remove selected component" className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs cursor-pointer text-slate-200">-</button>
                  <button id="probe-comp-up" title="Move Up" className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs cursor-pointer text-slate-200">▲</button>
                  <button id="probe-comp-down" title="Move Down" className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs cursor-pointer text-slate-200">▼</button>
                  <button id="probe-comp-locate" title="Highlight in schematic" className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs cursor-pointer text-slate-200">👁</button>
                </div>
              </div>
              <div id="probe-components-list" className="p-2 flex-1 overflow-y-auto flex flex-col gap-1 select-none">
                {/* List items will be rendered here dynamically */}
              </div>
              <div className="p-2 text-[10px] text-slate-500 border-t border-slate-800 bg-slate-900/10 text-center">
                Drag & drop components from canvas here to add
              </div>
            </div>
            
            {/* Right Column: Component Signals */}
            <div className="w-1/2 flex flex-col border border-slate-800 rounded bg-slate-950/40 overflow-hidden">
              <div className="p-2 border-b border-slate-800 bg-slate-900/30">
                <span className="font-bold text-xs text-slate-400">Component signals</span>
              </div>
              <div id="probe-signals-list" className="p-3 flex-1 overflow-y-auto flex flex-col gap-2">
                {/* Checkboxes will be rendered here dynamically */}
              </div>
            </div>
          </div>
          
          <div className="p-4 border-t border-slate-800 flex justify-between bg-slate-900/10">
            <button id="probe-editor-help" className="px-3 py-1.5 border border-slate-800 hover:bg-slate-900 rounded font-bold text-xs cursor-pointer text-slate-400">Help</button>
            <button id="probe-editor-close" className="px-4 py-2 bg-sky-500 hover:bg-sky-600 font-bold rounded text-xs cursor-pointer text-white">Close</button>
          </div>
        </div>
      </div>

      {/* Modal 7: Master PWM Configurator Dialog */}
      <div id="pwm-master-modal" className="modal-overlay animate-fade-in">
        <div className="modal-content text-slate-200 text-sm max-w-[900px] w-11/12 overflow-hidden flex flex-col transition-all duration-200" style={{ maxHeight: "90vh" }}>
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
            <h3 id="pwm-master-title" className="font-bold flex items-center gap-2">Master PWM Configurator</h3>
            <button id="pwm-master-close-btn" className="text-slate-450 hover:text-slate-200 cursor-pointer text-xl font-bold">×</button>
          </div>
          
          <div className="p-4 flex flex-col gap-4 overflow-y-auto" style={{ flex: 1 }}>
            <div className="flex flex-col gap-3 p-3 bg-slate-950/40 border border-slate-800 rounded">
              <div className="grid grid-cols-4 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase">Number of Carriers (N)</label>
                  <input id="pwm-num-carriers" type="number" min="1" max="20" className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase">Carrier Frequency (fc, Hz)</label>
                  <input id="pwm-frequency" type="text" className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase">Dead Time (s)</label>
                  <input id="pwm-dead-time" type="text" className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400 font-bold uppercase">Preview Window (Cycles)</label>
                  <select id="pwm-preview-cycles" className="bg-slate-900 border border-slate-800 rounded px-2 py-1 text-slate-200">
                    <option value="2">2 Cycles</option>
                    <option value="3">3 Cycles</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <input id="pwm-common-modulation" type="checkbox" className="accent-emerald-500 cursor-pointer h-3.5 w-3.5 rounded border-slate-800 bg-slate-900" />
                <label htmlFor="pwm-common-modulation" className="text-[10px] text-slate-400 font-bold uppercase cursor-pointer select-none">Use Common Modulator Input (If unchecked, each carrier has its own Mod input)</label>
              </div>
            </div>
            
            {/* Middle Panel: Configuration Table */}
            <div className="flex flex-col border border-slate-800 rounded bg-slate-950/40 overflow-hidden">
              <div className="p-2 border-b border-slate-800 bg-slate-900/30 font-bold text-xs text-slate-400">
                Carriers Configuration Table
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/60">
                      <th className="p-2">Carrier ID</th>
                      <th className="p-2">Phase Shift Source</th>
                      <th className="p-2">Internal Phase (°)</th>
                      <th className="p-2">Level Shift Enable</th>
                      <th className="p-2">Internal Level Offset</th>
                    </tr>
                  </thead>
                  <tbody id="pwm-carriers-tbody">
                    {/* Rows populated dynamically */}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* Bottom Panel: Interactive Preview Plot */}
            <div className="flex flex-col border border-slate-800 rounded bg-slate-950/40 overflow-hidden">
              <div className="p-2 border-b border-slate-800 bg-slate-900/30 font-bold text-xs text-slate-400 flex justify-between items-center">
                <span>Real-Time Carrier Preview Plot</span>
                <span className="text-[10px] text-slate-500 font-normal">Superimposed carrier waves over fundamental period</span>
              </div>
              <div className="p-4 bg-slate-950 flex justify-center items-center">
                <canvas id="pwm-preview-canvas" width="800" height="240" className="w-full max-w-[800px] border border-slate-900 bg-slate-950/80 rounded"></canvas>
              </div>
            </div>
          </div>
          
          <div className="p-4 border-t border-slate-800 flex justify-end gap-2 bg-slate-900/10">
            <button id="pwm-master-cancel" className="px-4 py-2 border border-slate-800 hover:bg-slate-900 rounded font-bold text-xs cursor-pointer">Cancel</button>
            <button id="pwm-master-save" className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 font-bold rounded text-xs cursor-pointer text-white">Save Configuration</button>
          </div>
        </div>
      </div>
    </div>
  );
}
