import { state, saveState } from './state';
import { draw } from './renderer';

// Global available variables list populated dynamically
let availableVariables: string[] = [];
let currentPlotConfig: any = null; // Copy of active tracking during plot configuration edits

export function setAvailableVariables(vars: string[]): void {
  availableVariables = vars;
}

export function getAvailableVariables(): string[] {
  return availableVariables;
}

// Open Multi-Figure Reconfigurable plot modal
export function openPlotConfig(): void {
  const modal = document.getElementById('plot-config-modal');
  if (!modal) return;
  
  // Clone current configurations
  currentPlotConfig = JSON.parse(JSON.stringify(state.plotConfiguration));
  if (!currentPlotConfig.plots) currentPlotConfig.plots = [];
  
  modal.classList.add('show');
  renderPlotListModal();
  renderPlotsPreviewModal();
}

export function closePlotConfig(): void {
  const modal = document.getElementById('plot-config-modal');
  if (modal) modal.classList.remove('show');
}

export function savePlotConfig(): void {
  saveState();
  state.plotConfiguration = JSON.parse(JSON.stringify(currentPlotConfig));
  closePlotConfig();
  
  // Trigger general plotter update on parent
  const event = new CustomEvent('plotConfigUpdated', { detail: state.plotConfiguration });
  window.dispatchEvent(event);
}

// Render dynamic subplots figures side scroll list inside configuration modal
function renderPlotListModal(): void {
  const container = document.getElementById('plots-list-container');
  if (!container) return;
  container.innerHTML = '';
  
  const plots = currentPlotConfig.plots || [];
  plots.forEach((plot: any, idx: number) => {
    const item = document.createElement('div');
    item.className = 'plot-list-item';
    
    const textSpan = document.createElement('span');
    textSpan.className = 'plot-item-text';
    textSpan.textContent = plot.title || `Plot ${idx + 1}`;
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'plot-item-delete';
    deleteBtn.innerHTML = `
      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    `;
    deleteBtn.className = 'plot-item-delete';
    
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      currentPlotConfig.plots.splice(idx, 1);
      renderPlotListModal();
      renderPlotsPreviewModal();
    });
    
    item.appendChild(textSpan);
    item.appendChild(deleteBtn);
    container.appendChild(item);
  });
  
  // Append "Add Plot" bottom panel link
  const btnDiv = document.createElement('div');
  btnDiv.style.padding = '12px';
  const addBtn = document.createElement('button');
  addBtn.className = 'plot-add-btn';
  addBtn.textContent = '+ Add Figure';
  addBtn.addEventListener('click', () => {
    currentPlotConfig.plots.push({
      title: `Plot ${currentPlotConfig.plots.length + 1}`,
      variables: []
    });
    renderPlotListModal();
    renderPlotsPreviewModal();
  });
  btnDiv.appendChild(addBtn);
  container.appendChild(btnDiv);
}

// Render dynamic subplots interactive layout previews
function renderPlotsPreviewModal(): void {
  const container = document.getElementById('plots-preview-container');
  if (!container) return;
  container.innerHTML = '';
  
  const plots = currentPlotConfig.plots || [];
  if (plots.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.style.display = 'flex';
    emptyMsg.style.alignItems = 'center';
    emptyMsg.style.justifyContent = 'center';
    emptyMsg.style.height = '100%';
    emptyMsg.style.color = '#64748b';
    emptyMsg.textContent = 'No figures added. Click "+ Add Figure" to build configurations.';
    container.appendChild(emptyMsg);
    return;
  }
  
  plots.forEach((plot: any, idx: number) => {
    const card = document.createElement('div');
    card.className = 'subplot-card';
    
    const header = document.createElement('div');
    header.className = 'subplot-header';
    header.style.display = 'flex';
    header.style.alignItems = 'center';
    header.style.justifyContent = 'space-between';
    header.style.marginBottom = '8px';
    
    const titleInput = document.createElement('input');
    titleInput.className = 'subplot-title-input';
    titleInput.type = 'text';
    titleInput.value = plot.title || `Plot ${idx + 1}`;
    titleInput.addEventListener('change', (e: any) => {
      plot.title = e.target.value;
      renderPlotListModal();
    });
    
    header.appendChild(titleInput);
    card.appendChild(header);
    
    // Variables active badges matching
    const varsContainer = document.createElement('div');
    varsContainer.className = 'subplot-vars-container';
    
    const vars = plot.variables || [];
    if (vars.length === 0) {
      const varsPlaceholder = document.createElement('span');
      varsPlaceholder.style.color = 'var(--color-text-secondary)';
      varsPlaceholder.style.fontSize = '11px';
      varsPlaceholder.style.padding = '4px';
      varsPlaceholder.textContent = 'Drag or click traces on the right panel to append.';
      varsContainer.appendChild(varsPlaceholder);
    } else {
      vars.forEach((v: string, vIdx: number) => {
        const badge = document.createElement('div');
        badge.className = 'var-badge';
        
        const badgeText = document.createElement('span');
        badgeText.textContent = v;
        badgeText.style.marginRight = '4px';
        
        const badgeClose = document.createElement('span');
        badgeClose.className = 'var-badge-close';
        badgeClose.textContent = '×';
        badgeClose.addEventListener('click', () => {
          plot.variables.splice(vIdx, 1);
          renderPlotsPreviewModal();
        });
        
        badge.appendChild(badgeText);
        badge.appendChild(badgeClose);
        varsContainer.appendChild(badge);
      });
    }
    
    card.appendChild(varsContainer);
    
    // Click active card area highlights variables mapping panel
    card.addEventListener('pointerdown', () => {
      // Clear visual overlay highlights
      const cards = container.querySelectorAll('.subplot-card');
      cards.forEach((c: any) => c.style.borderColor = 'var(--color-border)');
      card.style.borderColor = 'var(--canvas-wire-power)';
      
      renderVariablesSelectorModal(plot);
    });
    
    container.appendChild(card);
  });
}

// Populate Right panel Variable selectors inside Plot Settings Modal
function renderVariablesSelectorModal(activePlot: any): void {
  const panel = document.getElementById('modal-vars-panel');
  if (!panel) return;
  panel.innerHTML = '';
  
  const title = document.createElement('h4');
  title.style.fontSize = '12px';
  title.style.color = 'var(--color-text-secondary)';
  title.style.marginBottom = '8px';
  title.style.borderBottom = '1px solid var(--color-border)';
  title.style.paddingBottom = '4px';
  title.textContent = `Avail. Signals / Traces (to overlay in ${activePlot.title})`;
  panel.appendChild(title);
  
  const list = document.createElement('div');
  list.className = 'vars-list';
  list.style.maxHeight = '280px';
  list.style.overflowY = 'auto';
  
  if (availableVariables.length === 0) {
    const noVars = document.createElement('div');
    noVars.style.padding = '8px';
    noVars.style.fontSize = '11px';
    noVars.style.color = 'var(--color-text-secondary)';
    noVars.textContent = 'Traces list empty. Execute simulation to discover signal tags.';
    list.appendChild(noVars);
  } else {
    availableVariables.forEach(v => {
      const isSelected = activePlot.variables.includes(v);
      const item = document.createElement('div');
      item.className = 'var-list-item' + (isSelected ? ' selected' : '');
      
      const text = document.createElement('span');
      text.className = 'var-list-item-text';
      text.textContent = v;
      
      const check = document.createElement('span');
      check.className = 'var-list-item-check';
      check.textContent = isSelected ? '✓' : '+';
      
      item.appendChild(text);
      item.appendChild(check);
      
      item.addEventListener('click', () => {
        if (isSelected) {
          activePlot.variables = activePlot.variables.filter((x: string) => x !== v);
        } else {
          activePlot.variables.push(v);
        }
        renderPlotsPreviewModal();
        renderVariablesSelectorModal(activePlot);
      });
      list.appendChild(item);
    });
  }
  
  panel.appendChild(list);
}
