import { state, saveState } from './state';
import { draw } from './renderer';
import { showToast } from './utils';
import { getComponentPins, discoverPortsJS, senseTerminalsFromCode, discoverParamsFromCode, updateParamInCode } from './config';
import { getAvailableVariables } from './plotConfig';
import { DETAILED_COMPONENTS } from './detailedLibrary';
import { rotateSelected, deleteSelected, enterSubsystem } from './actions';

// Update properties panel dynamically based on select items
export function updatePropertiesPanel(): void {
  const panel = document.getElementById('properties-panel');
  if (!panel) return;
  panel.innerHTML = '';
  
  if (state.selectedComponentIds.length === 1 && state.selectedWireIds.length === 0) {
    const compId = state.selectedComponentIds[0];
    const comp = state.components.find((c: any) => c.id === compId);
    if (!comp) return;
    
    // Header
    const card = document.createElement('div');
    card.className = 'panel-card';
    
    let extraButtonsHTML = '';
    if (comp.type === 'SUBSYSTEM') {
      const hasMask = comp.mask && comp.mask.parameters && comp.mask.parameters.length > 0;
      extraButtonsHTML = `
        <button id="btn-look-inside" style="width: 100%; margin-top: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: bold; background: #0ea5e9; border: 1px solid #0284c7; color: white; padding: 6px 12px; height: 32px; border-radius: 6px; font-size: 11px;">
          Look Inside Subsystem
        </button>
        <button id="btn-edit-mask" style="width: 100%; margin-top: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: bold; background: ${hasMask ? '#475569' : '#10b981'}; border: 1px solid ${hasMask ? '#334155' : '#059669'}; color: white; padding: 6px 12px; height: 32px; border-radius: 6px; font-size: 11px;">
          ${hasMask ? 'Edit Mask Structure' : 'Create Mask'}
        </button>
      `;
    }

    card.innerHTML = `
      <h3 class="panel-card-title">${comp.id} properties</h3>
      <div class="prop-group">
        <label class="prop-label">Label / Identifier</label>
        <input type="text" id="prop-id" class="prop-input" value="${comp.id}" />
      </div>
      <div style="display: flex; gap: 8px; margin-top: 12px; margin-bottom: 8px;">
        <button id="btn-rotate-comp" style="flex: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: bold; background: #075985; border: 1px solid #0369a1; color: white; padding: 6px 12px; height: 32px; border-radius: 6px; font-size: 11px;" title="Rotate Component 90°">
          Rotate
        </button>
        <button id="btn-delete-comp" style="flex: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: bold; background: #b91c1c; border: 1px solid #991b1b; color: white; padding: 6px 12px; height: 32px; border-radius: 6px; font-size: 11px;" title="Delete Component">
          Delete
        </button>
      </div>
      ${extraButtonsHTML}
    `;
    
    const propGroup = document.createElement('div');
    propGroup.className = 'prop-group';
    propGroup.innerHTML = '<h4 class="category-title">Parameters</h4>';
    
    // Create params forms
    const isMaskedSubsystem = comp.type === 'SUBSYSTEM' && comp.mask && comp.mask.parameters && comp.mask.parameters.length > 0;
    if (isMaskedSubsystem) {
      comp.mask.parameters.forEach((param: any) => {
        const key = param.name;
        const row = document.createElement('div');
        row.className = 'prop-row';
        row.style.display = 'flex';
        row.style.flexDirection = 'column';
        row.style.marginBottom = '12px';
        
        const label = document.createElement('label');
        label.className = 'prop-label';
        label.textContent = param.label || key;
        
        const inputField = document.createElement('input');
        inputField.type = 'text';
        inputField.className = 'prop-input';
        inputField.value = comp.parameters[key] !== undefined ? String(comp.parameters[key]) : param.value;
        
        inputField.addEventListener('change', (e: any) => {
          saveState();
          comp.parameters[key] = e.target.value;
          draw();
        });
        
        row.appendChild(label);
        row.appendChild(inputField);
        propGroup.appendChild(row);
      });
    } else if (comp.parameters) {
      Object.keys(comp.parameters).forEach(key => {
        if (key === 'code') return; // Handled by Python Modal editor
        if (comp.type === 'GEN_EBLOCK' && !['terminals', 'timestep', 'plot_disabled_pins', 'plot_custom_vars'].includes(key)) return;
        
        const row = document.createElement('div');
        row.className = 'prop-row';
        row.style.display = 'flex';
        row.style.flexDirection = 'column';
        row.style.marginBottom = '12px';
        
        const label = document.createElement('label');
        label.className = 'prop-label';
        label.textContent = key.replace(/_/g, ' ');
        label.style.textTransform = 'capitalize';
        
        let inputField: any;
        if (['inputs', 'outputs', 'channels'].includes(key)) {
          // Number dropdown selectors
          inputField = document.createElement('select');
          inputField.className = 'prop-input';
          const maxVal = key === 'channels' ? 4 : 8;
          for (let i = 1; i <= maxVal; i++) {
            const opt = document.createElement('option');
            opt.value = String(i);
            opt.textContent = String(i);
            if (String(comp.parameters[key]) === String(i)) {
              opt.selected = true;
            }
            inputField.appendChild(opt);
          }
        } else {
          // Standard text inputs supporting scientific/metric shorthand notations
          inputField = document.createElement('input');
          inputField.type = 'text';
          inputField.className = 'prop-input';
          inputField.value = comp.parameters[key] !== undefined ? String(comp.parameters[key]) : '';
        }
        
        inputField.addEventListener('change', (e: any) => {
          saveState();
          const val = e.target.value;
          comp.parameters[key] = val;
          
          // Re-route wires for dynamic pins counts or custom XFMR winders
          if (comp.type === 'XFMR' && ['primary_turns', 'secondary_turns'].includes(key)) {
            cleanDanglingWires(comp.id);
          } else if (['SCOPE', 'MUX', 'DEMUX', 'CSCRIPT', 'GEN_EBLOCK', 'SUM_ROUND', 'SUM_RECT', 'PRODUCT_RECT', 'MULTIPORT_SWITCH'].includes(comp.type)) {
            cleanDanglingWires(comp.id);
          }
          if (comp.type === 'GEN_EBLOCK' && key === 'terminals') {
            syncScriptPlotConfig(comp);
          }
          
          // Auto-sync signs / operators when inputs change
          if (key === 'inputs' && ['SUM_ROUND', 'SUM_RECT', 'PRODUCT_RECT'].includes(comp.type)) {
            const numPins = parseInt(val) || 2;
            if (comp.type === 'PRODUCT_RECT') {
              const currentOps = comp.parameters.operators || '';
              if (currentOps.length < numPins) {
                comp.parameters.operators = currentOps + '*'.repeat(numPins - currentOps.length);
              } else if (currentOps.length > numPins) {
                comp.parameters.operators = currentOps.substring(0, numPins);
              }
            } else {
              const currentSigns = comp.parameters.signs || '';
              if (currentSigns.length < numPins) {
                comp.parameters.signs = currentSigns + '+'.repeat(numPins - currentSigns.length);
              } else if (currentSigns.length > numPins) {
                comp.parameters.signs = currentSigns.substring(0, numPins);
              }
            }
            setTimeout(() => {
              updatePropertiesPanel();
            }, 0);
          }
          
          draw();
        });
        
        row.appendChild(label);
        row.appendChild(inputField);
        propGroup.appendChild(row);
      });
    }
    
    card.appendChild(propGroup);

    // Add Custom Parameters Editor for GEN_EBLOCK components
    if (comp.type === 'GEN_EBLOCK') {
      const customParamsGroup = document.createElement('div');
      customParamsGroup.className = 'prop-group';
      customParamsGroup.style.marginTop = '15px';
      customParamsGroup.style.borderTop = '1px solid #1e293b';
      customParamsGroup.style.paddingTop = '12px';
      
      const codeParams = discoverParamsFromCode(comp.parameters.code || "");
      // Sync comp.parameters keys with codeParams
      const keysToKeep = ['code', 'terminals', 'timestep', 'plot_disabled_pins', 'plot_custom_vars'];
      const codeParamKeys = new Set(codeParams.map(p => p.name));
      Object.keys(comp.parameters).forEach(k => {
        if (!keysToKeep.includes(k) && !codeParamKeys.has(k)) {
          delete comp.parameters[k];
        }
      });
      codeParams.forEach(p => {
        comp.parameters[p.name] = p.value;
      });
      
      let html = `<h4 class="category-title" style="margin-bottom: 8px; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase;">Custom Parameters</h4>`;
      html += `<div id="custom-params-list" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px;">`;
      
      if (codeParams.length === 0) {
        html += `<span style="font-size: 10px; color: #64748b; font-style: italic;">No custom parameters defined in code.</span>`;
      } else {
        codeParams.forEach(p => {
          html += `
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
              <span style="font-family: monospace; font-size: 11px; color: #cbd5e1; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.name}</span>
              <input type="text" class="custom-param-value-input" data-key="${p.name}" value="${p.value}" style="width: 120px; padding: 4px 8px; border: 1px solid #334155; border-radius: 4px; font-size: 11px; background: #020617; color: #f8fafc; outline: none; font-family: monospace;" />
            </div>
          `;
        });
      }
      html += `</div>`;
      
      customParamsGroup.innerHTML = html;
      
      // Event listeners for value inputs
      customParamsGroup.querySelectorAll('.custom-param-value-input').forEach((input: any) => {
        input.addEventListener('change', (e: any) => {
          const key = input.getAttribute('data-key');
          const val = e.target.value.trim();
          saveState();
          comp.parameters.code = updateParamInCode(comp.parameters.code || "", key, val);
          comp.parameters[key] = val;
          updatePropertiesPanel();
          draw();
        });
      });
      
      card.appendChild(customParamsGroup);
    }
    
    // Add special Script Button for block-level scripts
    if (comp.type === 'CSCRIPT' || comp.type === 'GEN_EBLOCK') {
      const editorBtn = document.createElement('button');
      editorBtn.className = 'btn btn-primary';
      editorBtn.style.width = '100%';
      editorBtn.style.marginTop = '10px';
      editorBtn.style.padding = '8px';
      editorBtn.style.backgroundColor = '#10b981';
      editorBtn.style.color = '#ffffff';
      editorBtn.style.border = 'none';
      editorBtn.style.borderRadius = '4px';
      editorBtn.style.cursor = 'pointer';
      editorBtn.textContent = comp.type === 'GEN_EBLOCK' ? 'Edit Electrical Equations' : 'Edit Python script code';
      editorBtn.addEventListener('click', () => {
        openCodeEditorModal(comp);
      });
      card.appendChild(editorBtn);
    }
    
    // --- SIGNALS TO PLOT SECTION ---
    const tracesGroup = document.createElement('div');
    tracesGroup.className = 'prop-group';
    tracesGroup.style.borderTop = '1px solid var(--color-border)';
    tracesGroup.style.paddingTop = '16px';
    tracesGroup.innerHTML = '<h4 class="category-title">Signals to Plot / Probe</h4>';

    const predicted: string[] = [];
    
    // Predict based on physical electrical component types
    const isBasicElectrical = ['R', 'L', 'C', 'V', 'AC_V', 'I', 'S', 'D', 'MOSFET', 'VM', 'AM', 'Resistor', 'Inductor', 'Capacitor', 'VoltageSource', 'ACVoltageSource', 'CurrentSource', 'Switch', 'Diode', 'Voltmeter', 'Ammeter'].includes(comp.type);
    const isDetailedElectrical = DETAILED_COMPONENTS.some(dc => dc.type === comp.type && dc.category === 'electrical');
    if (isBasicElectrical || isDetailedElectrical) {
      predicted.push(`V_${comp.id}`);
      predicted.push(`I_${comp.id}`);
      const isSignalControlled = [
        'MOSFET', 'MOSFET_DIODE', 'IGBT', 'IGBT_DIODE', 'IGCT', 'GTO', 'THYRISTOR', 'JFET', 'BJT',
        'CTRL_V', 'CTRL_I', 'VAR_R',
        'S', 'BREAKER', 'SR_SWITCH', 'DBL_SWITCH', 'MAN_SWITCH', 'MAN_DBL_SWITCH', 'MAN_TRPL_SWITCH', 'TRPL_SWITCH'
      ].includes(comp.type);
      if (isSignalControlled) {
        predicted.push(`Ctrl_${comp.id}`);
      }
    }
    
    // Control / Signal types
    const isBasicControl = ['CONST', 'GAIN', 'PID', 'SUM', 'PWM', 'TRI', 'COMP', 'AND', 'OR', 'NOT', 'FCN', 'PROD', 'MUX', 'DEMUX', 'CSCRIPT'].includes(comp.type);
    const isDetailedControl = DETAILED_COMPONENTS.some(dc => dc.type === comp.type && (dc.category === 'control' || dc.subcategory === 'Signal Routing'));
    if (isBasicControl || isDetailedControl) {
      const pinMap = getComponentPins(comp);
      Object.keys(pinMap).forEach(pinName => {
        predicted.push(`${comp.id}.${pinName}`);
      });
    }
    
    if (comp.type === 'GEN_EBLOCK') {
      const n = parseInt(comp.parameters.terminals) || 3;
      for (let i = 1; i <= n; i++) {
        predicted.push(`${comp.id}.v${i}`);
        predicted.push(`${comp.id}.i${i}`);
      }
      const customVars = (comp.parameters.plot_custom_vars || "").split(",").filter(Boolean);
      customVars.forEach((v: string) => {
        predicted.push(`${comp.id}.${v}`);
      });
    }
    
    // Match actual available traces from simulation if any
    const actualList = getAvailableVariables() || [];
    actualList.forEach(t => {
      if (t === comp.id || t.startsWith(comp.id + '.') || t.startsWith(comp.id + '_') || t.startsWith('V_' + comp.id) || t.startsWith('I_' + comp.id)) {
        predicted.push(t);
      }
    });
    
    const finalVars = Array.from(new Set(predicted)).sort();
    
    const activePlots = state.plotConfiguration.plots || [];
    const isPlotted = (vName: string) => {
      return activePlots.some((p: any) => p.variables && p.variables.includes(vName));
    };
    
    const toggleVar = (vName: string) => {
      saveState();
      if (!state.plotConfiguration.plots || state.plotConfiguration.plots.length === 0) {
        state.plotConfiguration.plots = [{ title: 'Waveform analysis', variables: [] }];
      }
      const firstPlot = state.plotConfiguration.plots[0];
      if (!firstPlot.variables) firstPlot.variables = [];
      
      const alreadyAdded = firstPlot.variables.includes(vName);
      if (alreadyAdded) {
        firstPlot.variables = firstPlot.variables.filter((x: string) => x !== vName);
      } else {
        firstPlot.variables.push(vName);
      }
      updatePropertiesPanel();
      
      const ev = new CustomEvent('plotConfigUpdated', { detail: state.plotConfiguration });
      window.dispatchEvent(ev);
    };

    if (finalVars.length === 0) {
      const emptyRow = document.createElement('div');
      emptyRow.style.fontSize = '11px';
      emptyRow.style.color = 'var(--color-text-secondary)';
      emptyRow.style.fontStyle = 'italic';
      emptyRow.textContent = 'No plottable signals for this component.';
      tracesGroup.appendChild(emptyRow);
    } else {
      finalVars.forEach(vName => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '8px';
        row.style.marginBottom = '6px';
        row.style.cursor = 'pointer';
        
        const isSel = isPlotted(vName);
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = isSel;
        checkbox.style.cursor = 'pointer';
        checkbox.style.accentColor = '#0ea5e9';
        checkbox.addEventListener('change', () => {
          toggleVar(vName);
        });
        
        const label = document.createElement('span');
        label.className = 'prop-label-toggle' + (isSel ? ' active' : '');
        label.style.cursor = 'pointer';
        label.style.fontFamily = 'monospace';
        label.style.fontSize = '11px';
        label.textContent = vName;
        
        row.appendChild(checkbox);
        row.appendChild(label);
        
        row.addEventListener('click', (e) => {
          if (e.target !== checkbox) {
            checkbox.checked = !checkbox.checked;
            toggleVar(vName);
          }
        });
        
        tracesGroup.appendChild(row);
      });
    }
    card.appendChild(tracesGroup);
    // ------------------------------------
    
    panel.appendChild(card);
    
    // Bind identifier update logic
    const idInput = document.getElementById('prop-id');
    if (idInput) {
      idInput.addEventListener('change', (e: any) => {
        const newId = e.target.value.trim();
        if (!newId || newId === comp.id) return;
        
        if (state.components.some((c: any) => c.id === newId)) {
          showToast(`Error: ${newId} already exists!`);
          e.target.value = comp.id;
          return;
        }
        
        saveState();
        const oldId = comp.id;
        comp.id = newId;
        
        // Update all related properties binding or wire terminals references
        state.wires.forEach((wire: any) => {
          if (wire.from.type === 'pin' && wire.from.compId === oldId) {
            wire.from.compId = newId;
          }
          if (wire.to.type === 'pin' && wire.to.compId === oldId) {
            wire.to.compId = newId;
          }
        });
        
        draw();
        updatePropertiesPanel();
      });
    }

    // Bind Rotate & Delete buttons
    setTimeout(() => {
      const btnRotate = document.getElementById('btn-rotate-comp');
      if (btnRotate) {
        btnRotate.addEventListener('click', () => {
          rotateSelected();
        });
      }
      const btnDelete = document.getElementById('btn-delete-comp');
      if (btnDelete) {
        btnDelete.addEventListener('click', () => {
          deleteSelected();
        });
      }
      const btnLookInside = document.getElementById('btn-look-inside');
      if (btnLookInside) {
        btnLookInside.addEventListener('click', () => {
          enterSubsystem(comp.id);
        });
      }
      const btnEditMask = document.getElementById('btn-edit-mask');
      if (btnEditMask) {
        btnEditMask.addEventListener('click', () => {
          openMaskEditorModal(comp);
        });
      }
    }, 0);
  } else if (state.selectedComponentIds.length > 0 || state.selectedWireIds.length > 0) {
    const card = document.createElement('div');
    card.className = 'panel-card';
    
    let buttonsHtml = '';
    if (state.selectedComponentIds.length > 0) {
      buttonsHtml += `
        <button id="btn-rotate-comp" style="flex: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: bold; background: #075985; border: 1px solid #0369a1; color: white; padding: 6px 12px; height: 32px; border-radius: 6px; font-size: 11px;" title="Rotate Selection 90°">
          Rotate
        </button>
      `;
    }
    buttonsHtml += `
      <button id="btn-delete-comp" style="flex: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: bold; background: #b91c1c; border: 1px solid #991b1b; color: white; padding: 6px 12px; height: 32px; border-radius: 6px; font-size: 11px;" title="Delete Selection">
        Delete
      </button>
    `;
    
    card.innerHTML = `
      <h3 class="panel-card-title">Selection Operations</h3>
      <p style="font-size: 10px; color: #64748b; margin-bottom: 12px;">
        Selected: ${state.selectedComponentIds.length} component(s), ${state.selectedWireIds.length} wire(s)
      </p>
      <div style="display: flex; gap: 8px;">
        ${buttonsHtml}
      </div>
    `;
    
    panel.appendChild(card);
    
    // Bind buttons
    setTimeout(() => {
      const btnRotate = document.getElementById('btn-rotate-comp');
      if (btnRotate) {
        btnRotate.addEventListener('click', () => {
          rotateSelected();
        });
      }
      const btnDelete = document.getElementById('btn-delete-comp');
      if (btnDelete) {
        btnDelete.addEventListener('click', () => {
          deleteSelected();
        });
      }
    }, 0);
    
  } else {
    // Standard workspace keyboard bindings instruction panel
    const hint = document.createElement('div');
    hint.className = 'panel-card';
    hint.innerHTML = `
      <h3 class="panel-card-title">CAD keybinds</h3>
      <div class="keybinds-list">
        <div class="keybind-row">
          <span class="keybind-label">Rotate</span>
          <kbd class="keybind-kbd">R</kbd>
        </div>
        <div class="keybind-row">
          <span class="keybind-label">Delete path/comp</span>
          <kbd class="keybind-kbd">Del</kbd>
        </div>
        <div class="keybind-row">
          <span class="keybind-label">Copy selection</span>
          <kbd class="keybind-kbd">Ctrl+C</kbd>
        </div>
        <div class="keybind-row">
          <span class="keybind-label">Paste Copy</span>
          <kbd class="keybind-kbd">Ctrl+V</kbd>
        </div>
        <div class="keybind-row">
          <span class="keybind-label">Undo actions</span>
          <kbd class="keybind-kbd">Ctrl+Z</kbd>
        </div>
        <div class="keybind-row">
          <span class="keybind-label">Clear Workspace</span>
          <kbd class="keybind-kbd">Ctrl+Q</kbd>
        </div>
        <div class="keybind-row">
          <span class="keybind-label">Sim settings</span>
          <kbd class="keybind-kbd">S</kbd>
        </div>
        <div class="keybind-row">
          <span class="keybind-label">Plot configs</span>
          <kbd class="keybind-kbd">E</kbd>
        </div>
        <div class="keybind-row">
          <span class="keybind-label">Hold for Pan</span>
          <kbd class="keybind-kbd">Space</kbd>
        </div>
      </div>
    `;
    panel.appendChild(hint);
  }
}

// Clean dangling/orphaned wires when terminal configurations change
export function cleanDanglingWires(compId: string): void {
  const comp = state.components.find((c: any) => c.id === compId);
  if (!comp) return;
  const pinMap = getComponentPins(comp);
  
  state.wires = state.wires.filter((wire: any) => {
    if (wire.from.type === 'pin' && wire.from.compId === compId) {
      if (!pinMap[wire.from.terminal]) return false;
    }
    if (wire.to && wire.to.type === 'pin' && wire.to.compId === compId) {
      if (!pinMap[wire.to.terminal]) return false;
    }
    return true;
  });
}

// Highlighting syntax keywords for python scripts (Lightweight regex replacement)
export function highlightPython(code: string): string {
  if (!code) return '';
  const escaped = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
    
  const rules = [
    { regex: /\b(def|class|if|else|elif|while|for|in|return|import|from|as|try|except|print|None|True|False)\b/g, cls: 'token-keyword' },
    { regex: /(#.*)/g, cls: 'token-comment' },
    { regex: /(['"`])(.*?)\1/g, cls: 'token-string' },
    { regex: /\b(self|state|inputs|outputs|params)\b/g, cls: 'token-builtin' }
  ];
  
  let html = escaped;
  // Standard token parsing replacement
  rules.forEach(rule => {
    html = html.replace(rule.regex, `<span class="${rule.cls}">$1</span>`);
  });
  return html;
}

// Global script block modal editor handlers
// Global script block modal editor handlers
export function openCodeEditorModal(comp: any): void {
  const modal = document.getElementById('code-editor-modal');
  const textarea: any = document.getElementById('code-editor-textarea');
  const saveBtn = document.getElementById('code-editor-save');
  const cancelBtn = document.getElementById('code-editor-cancel');
  
  if (!modal || !textarea) return;
  
  textarea.value = comp.parameters.code || '';
  
  const disabledPins = new Set<string>((comp.parameters.plot_disabled_pins || "").split(",").filter(Boolean));
  const customVars = (comp.parameters.plot_custom_vars || "").split(",").filter(Boolean);
  
  const pane = document.getElementById('code-editor-plot-pane');
  const toggleBtn = document.getElementById('code-editor-toggle-plot');
  const toggleParamsBtn = document.getElementById('code-editor-toggle-params');
  
  let activePaneTab: 'plots' | 'params' = 'plots';

  const renderPlotPane = () => {
    if (!pane) return;
    
    const ports = comp.type === 'GEN_EBLOCK' ? {
      inputs: Array.from({ length: parseInt(comp.parameters.terminals) || 3 }, (_, i) => `v${i + 1}`),
      outputs: Array.from({ length: parseInt(comp.parameters.terminals) || 3 }, (_, i) => `i${i + 1}`)
    } : discoverPortsJS(textarea.value);
    
    let html = `
      <div style="display: flex; flex-direction: column; gap: 16px; height: 100%;">
        <h4 style="font-size: 13px; font-weight: 700; color: #f1f5f9; border-bottom: 1px solid #1e293b; padding-bottom: 8px; margin: 0;">Plot Configurations</h4>
        
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <label style="font-size: 10px; color: #94a3b8; font-weight: 600; text-transform: uppercase;">Sample Timestep (s)</label>
          <input type="text" id="plot-pane-timestep" value="${comp.parameters.timestep || '0'}" placeholder="0 (continuous)" style="width: 100%; padding: 6px 10px; border: 1px solid #334155; border-radius: 4px; font-size: 11px; font-family: monospace; background: #020617; color: #f8fafc; outline: none;" />
          <span style="font-size: 9px; color: #64748b;">Set to 0 to run at every simulation step.</span>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 6px;">
          <label style="font-size: 10px; color: #94a3b8; font-weight: 600; text-transform: uppercase;">Inputs & Outputs to Plot</label>
          <div style="max-height: 120px; overflow-y: auto; display: flex; flex-direction: column; gap: 5px; padding-right: 4px;">
    `;
    
    if (ports.inputs.length === 0 && ports.outputs.length === 0) {
      html += `<span style="font-size: 10px; color: #64748b; font-style: italic;">No pins discovered in code yet.</span>`;
    } else {
      ports.inputs.forEach(p => {
        const checked = !disabledPins.has(p);
        html += `
          <label style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: #cbd5e1; cursor: pointer; user-select: none;">
            <input type="checkbox" data-pin="${p}" class="plot-pane-pin-check" ${checked ? 'checked' : ''} style="cursor: pointer; accent-color: #10b981;" />
            <span style="font-family: monospace; color: #60a5fa;">inputs["${p}"]</span>
          </label>
        `;
      });
      ports.outputs.forEach(p => {
        const checked = !disabledPins.has(p);
        html += `
          <label style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: #cbd5e1; cursor: pointer; user-select: none;">
            <input type="checkbox" data-pin="${p}" class="plot-pane-pin-check" ${checked ? 'checked' : ''} style="cursor: pointer; accent-color: #10b981;" />
            <span style="font-family: monospace; color: #fb7185;">outputs["${p}"]</span>
          </label>
        `;
      });
    }
    
    html += `
          </div>
        </div>
        
        <div style="display: flex; flex-direction: column; gap: 8px; flex: 1;">
          <label style="font-size: 10px; color: #94a3b8; font-weight: 600; text-transform: uppercase;">Custom Plot Variables</label>
          
          <div style="display: flex; gap: 6px;">
            <input type="text" id="plot-pane-new-var" placeholder="e.g. integral" style="flex: 1; padding: 6px 10px; border: 1px solid #334155; border-radius: 4px; font-size: 11px; background: #020617; color: #f8fafc; outline: none;" />
            <button id="plot-pane-add-var" style="padding: 4px 10px; background: #10b981; color: white; border: none; border-radius: 4px; font-size: 11px; font-weight: bold; cursor: pointer;">Add</button>
          </div>
          
          <div id="plot-pane-custom-list" style="flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; max-height: 120px; border: 1px solid #1e293b; border-radius: 4px; padding: 6px; background: #020617;">
    `;
    
    if (customVars.length === 0) {
      html += `<span style="font-size: 10px; color: #64748b; font-style: italic; text-align: center; margin-top: 20px;">No custom variables added.</span>`;
    } else {
      customVars.forEach((v, idx) => {
        html += `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 4px 6px; background: #0f172a; border-radius: 3px; border: 1px solid #1e293b;">
            <span style="font-family: monospace; font-size: 11px; color: #34d399;">${v}</span>
            <button class="plot-pane-remove-var" data-index="${idx}" style="background: none; border: none; color: #ef4444; font-size: 12px; cursor: pointer; padding: 0 4px;">&times;</button>
          </div>
        `;
      });
    }
    
    html += `
          </div>
        </div>
      </div>
    `;
    
    pane.innerHTML = html;
    
    pane.querySelectorAll('.plot-pane-pin-check').forEach((chk: any) => {
      chk.addEventListener('change', () => {
        const pin = chk.getAttribute('data-pin');
        if (chk.checked) {
          disabledPins.delete(pin);
        } else {
          disabledPins.add(pin);
        }
      });
    });
    
    const addBtn = pane.querySelector('#plot-pane-add-var');
    const newVarInput: any = pane.querySelector('#plot-pane-new-var');
    if (addBtn && newVarInput) {
      const handleAdd = () => {
        const val = newVarInput.value.trim();
        if (val && !customVars.includes(val) && /^[a-zA-Z0-9_]+$/.test(val)) {
          customVars.push(val);
          renderPlotPane();
        } else if (val) {
          showToast("Invalid or duplicate variable name.");
        }
      };
      addBtn.addEventListener('click', handleAdd);
      newVarInput.addEventListener('keydown', (e: any) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAdd();
        }
      });
    }
    
    pane.querySelectorAll('.plot-pane-remove-var').forEach((btn: any) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-index'));
        customVars.splice(idx, 1);
        renderPlotPane();
      });
    });
  };

  const renderParamsPane = () => {
    if (!pane) return;
    
    const codeParams = discoverParamsFromCode(textarea.value);
    
    let html = `
      <div style="display: flex; flex-direction: column; gap: 16px; height: 100%;">
        <h4 style="font-size: 13px; font-weight: 700; color: #f1f5f9; border-bottom: 1px solid #1e293b; padding-bottom: 8px; margin: 0;">Block Parameters</h4>
        <div style="display: flex; flex-direction: column; gap: 10px; flex: 1; overflow-y: auto; padding-right: 4px;">
    `;
    
    if (codeParams.length === 0) {
      html += `<span style="font-size: 10px; color: #64748b; font-style: italic;">No parameters found in the code (e.g. Rs = 0.5;).</span>`;
    } else {
      codeParams.forEach(p => {
        html += `
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <label style="font-family: monospace; font-size: 11px; color: #94a3b8; font-weight: 600;">${p.name}</label>
            <input type="text" class="pane-param-input" data-name="${p.name}" value="${p.value}" style="width: 100%; padding: 6px 10px; border: 1px solid #334155; border-radius: 4px; font-size: 11px; font-family: monospace; background: #020617; color: #f8fafc; outline: none;" />
          </div>
        `;
      });
    }
    
    html += `
        </div>
        <span style="font-size: 9px; color: #64748b; line-height: 1.4;">
          Parameters are read directly from code assignments (e.g. <code>Rs = 0.5;</code>). Editing them here will modify their definition in the code.
        </span>
      </div>
    `;
    
    pane.innerHTML = html;
    
    pane.querySelectorAll('.pane-param-input').forEach((input: any) => {
      input.addEventListener('input', (e: any) => {
        const name = input.getAttribute('data-name');
        const val = e.target.value.trim();
        textarea.value = updateParamInCode(textarea.value, name, val);
      });
    });
  };
  
  const showPane = (tab: 'plots' | 'params') => {
    if (!pane) return;
    
    const isHidden = pane.classList.contains('hidden');
    
    if (isHidden) {
      pane.classList.remove('hidden');
      const content = modal.querySelector('.modal-content');
      if (content) {
        content.setAttribute('style', 'max-width: 1000px; width: 11/12;');
      }
      activePaneTab = tab;
      if (tab === 'plots') renderPlotPane();
      else renderParamsPane();
    } else {
      if (activePaneTab === tab) {
        pane.classList.add('hidden');
        const content = modal.querySelector('.modal-content');
        if (content) {
          content.setAttribute('style', 'max-width: 700px; width: 11/12;');
        }
      } else {
        activePaneTab = tab;
        if (tab === 'plots') renderPlotPane();
        else renderParamsPane();
      }
    }
  };
  
  if (toggleBtn) {
    const newToggleBtn = toggleBtn.cloneNode(true);
    toggleBtn.parentNode?.replaceChild(newToggleBtn, toggleBtn);
    newToggleBtn.addEventListener('click', () => showPane('plots'));
  }
  
  if (toggleParamsBtn) {
    if (comp.type === 'GEN_EBLOCK') {
      toggleParamsBtn.classList.remove('hidden');
      const newToggleParamsBtn = toggleParamsBtn.cloneNode(true);
      toggleParamsBtn.parentNode?.replaceChild(newToggleParamsBtn, toggleParamsBtn);
      newToggleParamsBtn.addEventListener('click', () => showPane('params'));
    } else {
      toggleParamsBtn.classList.add('hidden');
    }
  }
  
  const handleTextareaInput = () => {
    if (activePaneTab === 'plots') {
      renderPlotPane();
    } else {
      renderParamsPane();
    }
  };
  textarea.addEventListener('input', handleTextareaInput);
  
  if (pane) {
    pane.classList.add('hidden');
    const content = modal.querySelector('.modal-content');
    if (content) {
      content.setAttribute('style', 'max-width: 700px; width: 11/12;');
    }
  }
  
  const handleSave = () => {
    saveState();
    comp.parameters.code = textarea.value;
    
    if (comp.type === 'GEN_EBLOCK') {
      const sensed = senseTerminalsFromCode(textarea.value);
      comp.parameters.terminals = String(sensed);
      
      // Discover and sync parameters to comp.parameters
      const codeParams = discoverParamsFromCode(textarea.value);
      const keysToKeep = ['code', 'terminals', 'timestep', 'plot_disabled_pins', 'plot_custom_vars'];
      const codeParamKeys = new Set(codeParams.map(p => p.name));
      Object.keys(comp.parameters).forEach(k => {
        if (!keysToKeep.includes(k) && !codeParamKeys.has(k)) {
          delete comp.parameters[k];
        }
      });
      codeParams.forEach(p => {
        comp.parameters[p.name] = p.value;
      });
    }
    
    const tsInput: any = document.getElementById('plot-pane-timestep');
    if (tsInput) {
      comp.parameters.timestep = tsInput.value.trim() || '0';
    }
    
    comp.parameters.plot_disabled_pins = Array.from(disabledPins).join(",");
    comp.parameters.plot_custom_vars = Array.from(customVars).join(",");
    
    syncScriptPlotConfig(comp);
    
    cleanDanglingWires(comp.id);
    modal.classList.remove('show');
    cleanup();
    draw();
    updatePropertiesPanel();
  };
  
  const handleCancel = () => {
    modal.classList.remove('show');
    cleanup();
  };
  
  const cleanup = () => {
    saveBtn?.removeEventListener('click', handleSave);
    cancelBtn?.removeEventListener('click', handleCancel);
    textarea.removeEventListener('input', handleTextareaInput);
  };
  
  saveBtn?.addEventListener('click', handleSave);
  cancelBtn?.addEventListener('click', handleCancel);
  modal.classList.add('show');
}

export function syncScriptPlotConfig(comp: any) {
  if (!state.plotConfiguration.plots || state.plotConfiguration.plots.length === 0) {
    state.plotConfiguration.plots = [{ title: 'Waveform analysis', variables: [] }];
  }
  const firstPlot = state.plotConfiguration.plots[0];
  if (!firstPlot.variables) firstPlot.variables = [];
  
  firstPlot.variables = firstPlot.variables.filter((v: string) => {
    if (v === comp.id || v.startsWith(comp.id + ".")) return false;
    return true;
  });
  
  const ports = comp.type === 'GEN_EBLOCK' ? {
    inputs: Array.from({ length: parseInt(comp.parameters.terminals) || 3 }, (_, i) => `v${i + 1}`),
    outputs: Array.from({ length: parseInt(comp.parameters.terminals) || 3 }, (_, i) => `i${i + 1}`)
  } : discoverPortsJS(comp.parameters.code || "");
  const disabledPins = new Set((comp.parameters.plot_disabled_pins || "").split(",").filter(Boolean));
  
  ports.inputs.forEach(p => {
    if (!disabledPins.has(p)) {
      firstPlot.variables.push(`${comp.id}.${p}`);
    }
  });
  
  ports.outputs.forEach(p => {
    if (!disabledPins.has(p)) {
      firstPlot.variables.push(`${comp.id}.${p}`);
    }
  });
  
  const customVars = (comp.parameters.plot_custom_vars || "").split(",").filter(Boolean);
  customVars.forEach((v: string) => {
    firstPlot.variables.push(`${comp.id}.${v}`);
  });
  
  const ev = new CustomEvent('plotConfigUpdated', { detail: state.plotConfiguration });
  window.dispatchEvent(ev);
}

// Predict component terminal and connection node bindings
function getComponentNodes(compId: string): string[] {
  class SimpleUF {
    parent: Record<string, string> = {};
    find(i: string): string {
      if (!this.parent[i]) this.parent[i] = i;
      if (this.parent[i] === i) return i;
      return this.find(this.parent[i]);
    }
    union(i: string, j: string) {
      const rootI = this.find(i);
      const rootJ = this.find(j);
      if (rootI !== rootJ) {
        this.parent[rootI] = rootJ;
      }
    }
  }
  
  const uf = new SimpleUF();
  state.components.forEach((c: any) => {
    const pins = getComponentPins(c);
    Object.keys(pins).forEach(p => {
      uf.find(`${c.id}.${p}`);
    });
  });
  
  state.wires.forEach((w: any) => {
    if (w.from && w.to && w.from.type === 'pin' && w.to.type === 'pin') {
      uf.union(`${w.from.compId}.${w.from.terminal}`, `${w.to.compId}.${w.to.terminal}`);
    }
  });
  
  const comp = state.components.find((c: any) => c.id === compId);
  if (!comp) return [];
  const compPins = getComponentPins(comp);
  
  const partitions: Record<string, string[]> = {};
  Object.keys(uf.parent).forEach(pin => {
    const r = uf.find(pin);
    if (!partitions[r]) partitions[r] = [];
    partitions[r].push(pin);
  });
  
  let groundRoot: string | null = null;
  const vsources = state.components.filter((c: any) => ['V', 'AC_V'].includes(c.type));
  if (vsources.length > 0) {
    const negPinKey = `${vsources[0].id}.B`;
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
  
  const res: string[] = [];
  Object.keys(compPins).forEach(p => {
    const pinKey = `${compId}.${p}`;
    const root = uf.find(pinKey);
    const nodeIndex = rootToNodeIndex[root];
    if (nodeIndex) {
      res.push(nodeIndex);
    }
  });
  
  return Array.from(new Set(res));
}

export function openMaskEditorModal(comp: any): void {
  const modal = document.getElementById('mask-editor-modal');
  const container = document.getElementById('mask-params-container');
  const addBtn = document.getElementById('btn-add-mask-param');
  const saveBtn = document.getElementById('mask-editor-save');
  const cancelBtn = document.getElementById('mask-editor-cancel');

  if (!modal || !container || !saveBtn || !cancelBtn) return;

  let params = comp.mask && comp.mask.parameters ? JSON.parse(JSON.stringify(comp.mask.parameters)) : [];

  const renderParams = () => {
    container.innerHTML = '';
    if (params.length === 0) {
      container.innerHTML = `<div style="font-size: 11px; color: #64748b; font-style: italic; padding: 8px;">No parameters defined yet. Click "Add Parameter" below.</div>`;
      return;
    }

    params.forEach((p: any, idx: number) => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '8px';
      row.style.marginBottom = '8px';
      row.style.alignItems = 'center';

      row.innerHTML = `
        <input type="text" placeholder="Variable Name" class="prop-input name-input" value="${p.name}" style="flex: 1; font-family: monospace; background: #020617; color: #f8fafc; border: 1px solid #334155; border-radius: 4px; padding: 4px 8px; font-size: 11px;" />
        <input type="text" placeholder="Label" class="prop-input label-input" value="${p.label}" style="flex: 1.5; background: #020617; color: #f8fafc; border: 1px solid #334155; border-radius: 4px; padding: 4px 8px; font-size: 11px;" />
        <input type="text" placeholder="Default Value" class="prop-input val-input" value="${p.value}" style="flex: 1; font-family: monospace; background: #020617; color: #f8fafc; border: 1px solid #334155; border-radius: 4px; padding: 4px 8px; font-size: 11px;" />
        <button class="btn-delete-param" style="background: #b91c1c; border: none; color: white; border-radius: 4px; padding: 4px 8px; cursor: pointer; font-size: 11px;">×</button>
      `;

      const nameInput = row.querySelector('.name-input') as HTMLInputElement;
      const labelInput = row.querySelector('.label-input') as HTMLInputElement;
      const valInput = row.querySelector('.val-input') as HTMLInputElement;
      const deleteBtn = row.querySelector('.btn-delete-param') as HTMLButtonElement;

      nameInput.addEventListener('input', (e: any) => { p.name = e.target.value.trim(); });
      labelInput.addEventListener('input', (e: any) => { p.label = e.target.value.trim(); });
      valInput.addEventListener('input', (e: any) => { p.value = e.target.value.trim(); });
      deleteBtn.addEventListener('click', () => {
        params.splice(idx, 1);
        renderParams();
      });

      container.appendChild(row);
    });
  };

  renderParams();

  const handleAdd = () => {
    params.push({ name: `param_${params.length + 1}`, label: `Parameter ${params.length + 1}`, value: '1.0' });
    renderParams();
  };
  addBtn?.replaceWith(addBtn.cloneNode(true));
  const newAddBtn = document.getElementById('btn-add-mask-param');
  newAddBtn?.addEventListener('click', handleAdd);

  const handleSave = () => {
    saveState();
    const validParams = params.filter((p: any) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(p.name));
    
    comp.mask = {
      title: comp.id + " Mask",
      parameters: validParams
    };

    if (!comp.parameters) comp.parameters = {};
    validParams.forEach((p: any) => {
      if (comp.parameters[p.name] === undefined) {
        comp.parameters[p.name] = p.value;
      }
    });

    const validNames = new Set(validParams.map((p: any) => p.name));
    Object.keys(comp.parameters).forEach(k => {
      if (!validNames.has(k)) {
        delete comp.parameters[k];
      }
    });

    modal.classList.remove('show');
    updatePropertiesPanel();
    draw();
  };
  saveBtn.replaceWith(saveBtn.cloneNode(true));
  const newSaveBtn = document.getElementById('mask-editor-save');
  newSaveBtn?.addEventListener('click', handleSave);

  const handleCancel = () => {
    modal.classList.remove('show');
  };
  cancelBtn.replaceWith(cancelBtn.cloneNode(true));
  const newCancelBtn = document.getElementById('mask-editor-cancel');
  newCancelBtn?.addEventListener('click', handleCancel);

  modal.classList.add('show');
}

export function openMaskValuesModal(comp: any): void {
  const modal = document.getElementById('mask-values-modal');
  const title = document.getElementById('mask-values-title');
  const container = document.getElementById('mask-values-container');
  const saveBtn = document.getElementById('mask-values-save');
  const cancelBtn = document.getElementById('mask-values-cancel');

  if (!modal || !container || !saveBtn || !cancelBtn) return;

  if (title) title.textContent = comp.id + " Parameters";

  container.innerHTML = '';
  const params = comp.mask && comp.mask.parameters ? comp.mask.parameters : [];

  const inputs: Record<string, HTMLInputElement> = {};

  params.forEach((param: any) => {
    const row = document.createElement('div');
    row.className = 'prop-row';
    row.style.display = 'flex';
    row.style.flexDirection = 'column';
    row.style.marginBottom = '12px';

    const label = document.createElement('label');
    label.className = 'prop-label';
    label.textContent = param.label || param.name;

    const inputField = document.createElement('input');
    inputField.type = 'text';
    inputField.className = 'prop-input';
    inputField.value = comp.parameters[param.name] !== undefined ? String(comp.parameters[param.name]) : param.value;

    row.appendChild(label);
    row.appendChild(inputField);
    container.appendChild(row);

    inputs[param.name] = inputField;
  });

  const handleSave = () => {
    saveState();
    params.forEach((param: any) => {
      comp.parameters[param.name] = inputs[param.name].value;
    });
    modal.classList.remove('show');
    updatePropertiesPanel();
    draw();
  };

  saveBtn.replaceWith(saveBtn.cloneNode(true));
  const newSaveBtn = document.getElementById('mask-values-save');
  newSaveBtn?.addEventListener('click', handleSave);

  cancelBtn.replaceWith(cancelBtn.cloneNode(true));
  const newCancelBtn = document.getElementById('mask-values-cancel');
  newCancelBtn?.addEventListener('click', () => {
    modal.classList.remove('show');
  });

  modal.classList.add('show');
}

