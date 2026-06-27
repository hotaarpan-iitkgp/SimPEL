import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, RotateCcw, Settings, Sliders, ChevronDown, ChevronRight, 
  Trash2, RotateCw, PlusCircle, ArrowUpRight, Code, Sparkles, BarChart3,
  Undo2, FileJson, Upload, FolderInput, LogOut, CheckCircle2, AlertTriangle, Info,
  Pause, StopCircle, Search, X
} from 'lucide-react';
import { state, saveState } from '../schematic/state';
import { draw, updateAllWirePathsInDOM } from '../schematic/renderer';
import { initInteractions } from '../schematic/interaction';
import { updatePropertiesPanel } from '../schematic/properties';
import { generateNextId, showToast, getNextGateSignalLabel } from '../schematic/utils';
import { DEFAULT_PARAMETERS, getComponentPins } from '../schematic/config';
import { openSimSettings, saveSimSettings, closeSimSettings } from '../schematic/simSettings';
import { openPlotConfig, savePlotConfig, closePlotConfig, setAvailableVariables } from '../schematic/plotConfig';
import { exportDualGraphJSON, triggerImport, exportJSON, clearWorkspace, undo, navigateToLevel } from '../schematic/actions';
import { DETAILED_COMPONENTS } from '../schematic/detailedLibrary';
import { exportCurrentSubsystemSVG, exportFullSchematicZIP } from '../schematic/svgExporter';

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
      const netlist = exportDualGraphJSON();
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
    <div className="flex-1 flex flex-col min-h-[820px] bg-slate-950/20 border border-slate-900 rounded-xl overflow-hidden shadow-2xl relative">
      <input 
        type="file" 
        ref={importInputRef} 
        onChange={handleImportFile} 
        accept=".json" 
        className="hidden" 
      />
      
      {/* Schematic Editor Toolbar controls */}
      <div className="relative z-30 flex flex-wrap items-center justify-between gap-4 p-4 border-b border-slate-900 bg-slate-950/60 backdrop-blur-md">
        
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
            {/* Top Panel */}
            <div className="grid grid-cols-4 gap-4 p-3 bg-slate-950/40 border border-slate-800 rounded">
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
