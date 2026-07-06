import React, { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { state } from '../schematic/state';

// --- Graph Theory & Active State Resolvers ---

class UnionFind {
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

function getPrefixedCompId(compId: string): string {
  const currentPrefix = [
    ...(state.navigationStack || []).map((layer: any) => layer.subsystemId),
    state.currentSubsystemId
  ].filter(Boolean).join('.');
  return currentPrefix && !compId.startsWith(currentPrefix + '.') 
    ? `${currentPrefix}.${compId}` 
    : compId;
}

function getGateSignalName(compId: string, wires: any[], compType?: string): string {
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
}

export function resolveActiveGraph(
  components: any[],
  wires: any[],
  simResults: any,
  stepIdx: number,
  pinToNode: Record<string, string>
) {
  const uf = new UnionFind();

  if (pinToNode) {
    Object.values(pinToNode).forEach(nodeName => {
      uf.find(nodeName);
    });
  }
  
  const physicalComponents = components.filter((c: any) =>
    ['R', 'L', 'C', 'S', 'D', 'MOSFET', 'vg-FET', 'V', 'I', 'AC_V', 'VM', 'AM', 'X', 'Resistor', 'Inductor', 'Capacitor', 'VoltageSource', 'ACVoltageSource', 'CurrentSource', 'Switch', 'Diode', 'Transformer'].includes(c.type)
  );

  const checkSwitchOn = (compId: string, compType: string) => {
    if (!simResults) return false;
    const prefId = getPrefixedCompId(compId);

    // 1. Check control channels (covers wireless PWM gate signals)
    const compObj = components.find(c => c.id === compId);
    const channelName = compObj?.channels?.G || compObj?.channels?.Ctrl || compObj?.channels?.Switch;
    if (channelName) {
      const prefChannel = getPrefixedCompId(channelName);
      if (simResults.signals?.[prefChannel] !== undefined) {
        return (simResults.signals[prefChannel][stepIdx] ?? 0.0) > 0.5;
      }
      if (simResults.signals?.[channelName] !== undefined) {
        return (simResults.signals[channelName][stepIdx] ?? 0.0) > 0.5;
      }
    }

    // 2. Check solver control custom plots
    const ctrlPlot = simResults.custom_plots?.[`Ctrl_${prefId}`] || simResults.custom_plots?.[`Ctrl_${compId}`];
    if (ctrlPlot) {
      return (ctrlPlot[stepIdx] ?? 0.0) > 0.5;
    }

    // 3. Check wired gate signal name
    const gateSig = getGateSignalName(compId, wires, compType);
    if (gateSig && gateSig !== "0.0") {
      const prefGateSig = getPrefixedCompId(gateSig);
      if (simResults.signals?.[prefGateSig] !== undefined) {
        return (simResults.signals[prefGateSig][stepIdx] ?? 0.0) > 0.5;
      }
      if (simResults.signals?.[gateSig] !== undefined) {
        return (simResults.signals[gateSig][stepIdx] ?? 0.0) > 0.5;
      }
    }

    // 4. Fallback to logged current
    const iVal = (simResults.custom_plots?.[`I_${prefId}`]?.[stepIdx] || simResults.custom_plots?.[`I_${compId}`]?.[stepIdx]) ?? 0.0;
    return Math.abs(iVal) > 1e-3;
  };

  const checkDiodeOn = (compId: string) => {
    if (!simResults) return false;
    const prefId = getPrefixedCompId(compId);
    const iVal = (simResults.custom_plots?.[`I_${prefId}`]?.[stepIdx] || simResults.custom_plots?.[`I_${compId}`]?.[stepIdx]) ?? 0.0;
    return Math.abs(iVal) > 1e-3; 
  };

  const switchStates: Record<string, boolean> = {};
  physicalComponents.forEach((comp: any) => {
    if (['MOSFET', 'vg-FET', 'Switch', 'S'].includes(comp.type)) {
      const isOn = checkSwitchOn(comp.id, comp.type);
      switchStates[comp.id] = isOn;
      if (isOn && pinToNode) {
        const uNode = pinToNode[`${comp.id}.D`] || pinToNode[`${comp.id}.A`] || pinToNode[`${comp.id}.Plus`] || pinToNode[`${comp.id}.In1`];
        const vNode = pinToNode[`${comp.id}.S`] || pinToNode[`${comp.id}.B`] || pinToNode[`${comp.id}.Minus`] || pinToNode[`${comp.id}.Out1`];
        if (uNode && vNode) {
          uf.union(uNode, vNode);
        }
      }
    } else if (['D', 'Diode'].includes(comp.type)) {
      const isOn = checkDiodeOn(comp.id);
      switchStates[comp.id] = isOn;
      if (isOn && pinToNode) {
        const uNode = pinToNode[`${comp.id}.A`] || pinToNode[`${comp.id}.Plus`];
        const vNode = pinToNode[`${comp.id}.B`] || pinToNode[`${comp.id}.Minus`];
        if (uNode && vNode) {
          uf.union(uNode, vNode);
        }
      }
    }
  });

  return { uf, switchStates };
}

// Derived Symbolic ODE Generator - pulls branch equations directly from MNA result
export function deriveComponentODE(
  targetId: string,
  components: any[],
  wires: any[],
  simResults: any,
  stepIdx: number,
  pinToNode: Record<string, string>,
  modeMnaResult?: any
): { vLhs: string; vRhs: string; iLhs: string; iRhs: string } {
  if (!modeMnaResult || !modeMnaResult.edgeEqs) {
    return { vLhs: `v_{${targetId}}`, vRhs: "0", iLhs: `i_{${targetId}}`, iRhs: "0" };
  }

  const edgeData = modeMnaResult.edgeEqs[targetId];
  if (edgeData) {
    return {
      vLhs: `v_{${targetId}}`,
      vRhs: edgeData.v || "0",
      iLhs: `i_{${targetId}}`,
      iRhs: edgeData.i || "0"
    };
  }

  return { vLhs: `v_{${targetId}}`, vRhs: "0", iLhs: `i_{${targetId}}`, iRhs: "0" };
}


// --- React Popover Components ---

interface DraggablePopoverProps {
  id: string;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  odeData: any;
  onClose: () => void;
  onDrag: (dx: number, dy: number) => void;
  panX: number;
  panY: number;
  zoom: number;
}

const DraggablePopover: React.FC<DraggablePopoverProps> = ({
  id,
  x,
  y,
  offsetX,
  offsetY,
  odeData,
  onClose,
  onDrag,
  panX,
  panY,
  zoom
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const screenX = panX + (x + offsetX) * zoom;
  const screenY = panY + (y - 50 + offsetY) * zoom;

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    e.stopPropagation();
    
    setIsDragging(true);
    dragStartRef.current = {
      mx: e.clientX,
      my: e.clientY,
      ox: offsetX,
      oy: offsetY
    };
    
    if (containerRef.current && ('setPointerCapture' in containerRef.current)) {
      try {
        containerRef.current.setPointerCapture(e.pointerId);
      } catch (err) {}
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    e.stopPropagation();
    
    const dx = (e.clientX - dragStartRef.current.mx) / zoom;
    const dy = (e.clientY - dragStartRef.current.my) / zoom;
    
    onDrag(dragStartRef.current.ox + dx, dragStartRef.current.oy + dy);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    dragStartRef.current = null;
    setIsDragging(false);
  };

  // MathJax typesetting after render
  useEffect(() => {
    if (containerRef.current) {
      const w = window as any;
      if (w.MathJax && w.MathJax.typesetPromise) {
        w.MathJax.typesetPromise([containerRef.current]).catch(() => {});
      }
    }
  }, [odeData]);

  return (
    <div 
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`absolute border shadow-2xl rounded-xl z-20 flex flex-col min-w-[220px] max-w-[380px] pointer-events-auto transition-all duration-75 select-none 
        bg-white/95 border-2 border-[#17a2b8] text-slate-850 shadow-[#17a2b8]/15 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
      style={{
        left: `${screenX}px`,
        top: `${screenY}px`,
        transform: 'translate(-50%, -100%)',
      }}
    >
      <div className="px-4 py-2 border-b flex items-center justify-between select-none rounded-t-lg bg-slate-50 border-slate-200/60 text-slate-500">
        <span className="font-sans text-xs font-extrabold text-[#0056b3]">
          Branch: {id}
        </span>
        <button 
          onClick={onClose} 
          className="p-0.5 rounded cursor-pointer transition-colors text-slate-400 hover:text-slate-655 hover:bg-slate-200/50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="p-4 flex flex-col gap-2.5 select-none">
        {odeData.vRhs && odeData.vRhs !== '0' ? (
          <>
            <div className="overflow-x-auto text-[12px] text-slate-800">
              {`\\( v_{${id}} = ${odeData.vRhs} \\)`}
            </div>
            <div className="overflow-x-auto text-[12px] text-slate-800">
              {`\\( i_{${id}} = ${odeData.iRhs} \\)`}
            </div>
          </>
        ) : (
          <div className="text-[10px] text-slate-400 italic text-center py-2">
            No MNA equations available for this branch. Run simulation first.
          </div>
        )}
      </div>
    </div>
  );
};

// --- MathVisualizer Overlay Wrapper ---

interface MathVisualizerProps {
  components: any[];
  wires: any[];
  simResults: any;
  currentStepIndex: number;
  panX: number;
  panY: number;
  zoom: number;
  activeMathPopovers: string[];
  onClosePopover: (id: string) => void;
  popoverOffsets: Record<string, { x: number; y: number }>;
  onDragPopover: (id: string, offset: { x: number; y: number }) => void;
  theme: string;
  pinToNode: Record<string, string>;
  modeMnaResult?: any;
}

export const MathVisualizer: React.FC<MathVisualizerProps> = ({
  components,
  wires,
  simResults,
  currentStepIndex,
  panX,
  panY,
  zoom,
  activeMathPopovers,
  onClosePopover,
  popoverOffsets,
  onDragPopover,
  theme,
  pinToNode,
  modeMnaResult
}) => {
  const isLight = theme === 'light';

  // Debug logger for runtime tracing
  useEffect(() => {
    if (simResults) {
      const { switchStates } = resolveActiveGraph(components, wires, simResults, currentStepIndex, pinToNode);
      console.log(`[MathVisualizer] Timeline step: ${currentStepIndex}, Switch States:`, switchStates);
    }
  }, [currentStepIndex, simResults, components, wires, pinToNode]);



  return (
    <div className="absolute inset-0 pointer-events-none w-full h-full select-none">
      
      {components.map((comp: any) => {
        if (comp.type === 'C' || comp.type === 'Capacitor') {
          return (
            <div 
              key={`label-static-C-${comp.id}`} 
              className={`absolute font-serif italic font-bold select-none pointer-events-none transition-colors ${isLight ? 'text-indigo-650/70' : 'text-cyan-400/80'}`}
              style={{
                left: `${panX + (comp.x + 25) * zoom}px`,
                top: `${panY + (comp.y - 25) * zoom}px`,
                transform: 'translate(-50%, -50%)',
                fontSize: `${Math.max(6, 9.5 * zoom)}px`
              }}
            >
              v<sub>{comp.id}</sub>
            </div>
          );
        }
        if (comp.type === 'L' || comp.type === 'Inductor') {
          return (
            <div 
              key={`label-static-L-${comp.id}`} 
              className={`absolute font-serif italic font-bold select-none pointer-events-none transition-colors ${isLight ? 'text-indigo-650/70' : 'text-emerald-450/80'}`}
              style={{
                left: `${panX + (comp.x + 25) * zoom}px`,
                top: `${panY + (comp.y - 25) * zoom}px`,
                transform: 'translate(-50%, -50%)',
                fontSize: `${Math.max(6, 9.5 * zoom)}px`
              }}
            >
              i<sub>{comp.id}</sub>
            </div>
          );
        }
        return null;
      })}

      {activeMathPopovers.map((compId) => {
        const comp = components.find(c => c.id === compId);
        if (!comp) return null;

        const offset = popoverOffsets[compId] || { x: 0, y: 0 };
        const odeData = deriveComponentODE(compId, components, wires, simResults, currentStepIndex, pinToNode, modeMnaResult);

        return (
          <DraggablePopover
            key={`math-popover-${compId}`}
            id={compId}
            x={comp.x}
            y={comp.y}
            offsetX={offset.x}
            offsetY={offset.y}
            odeData={odeData}
            onClose={() => onClosePopover(compId)}
            onDrag={(dx, dy) => onDragPopover(compId, { x: dx, y: dy })}
            panX={panX}
            panY={panY}
            zoom={zoom}
          />
        );
      })}

    </div>
  );
};
