import { state, saveState } from './state';

// Load simulation settings properties into modal interface handles
export function openSimSettings(): void {
  const modal = document.getElementById('sim-settings-modal');
  if (!modal) return;
  
  const stopTimeInput: any = document.getElementById('sim-stop-time');
  const stepSizeInput: any = document.getElementById('sim-step-size');
  const stepTypeSelect: any = document.getElementById('sim-step-type');
  const solverSelect: any = document.getElementById('sim-solver');
  const simModeSelect: any = document.getElementById('sim-mode');
  const solverMethodSelect: any = document.getElementById('sim-solver-method');
  
  if (stopTimeInput) stopTimeInput.value = state.simulationSettings.stopTime;
  if (stepSizeInput) stepSizeInput.value = state.simulationSettings.stepSize;
  if (stepTypeSelect) stepTypeSelect.value = state.simulationSettings.stepType;
  if (solverSelect) solverSelect.value = state.simulationSettings.solver;
  if (simModeSelect) simModeSelect.value = state.simulationSettings.simulationMode || 'regular';
  if (solverMethodSelect) solverMethodSelect.value = state.simulationSettings.solverMethod || 'non-ideal';
  
  modal.classList.add('show');
}

export function closeSimSettings(): void {
  const modal = document.getElementById('sim-settings-modal');
  if (modal) {
    modal.classList.remove('show');
  }
}

// Save simulation solver presets
export function saveSimSettings(): void {
  const stopTimeInput: any = document.getElementById('sim-stop-time');
  const stepSizeInput: any = document.getElementById('sim-step-size');
  const stepTypeSelect: any = document.getElementById('sim-step-type');
  const solverSelect: any = document.getElementById('sim-solver');
  const simModeSelect: any = document.getElementById('sim-mode');
  const solverMethodSelect: any = document.getElementById('sim-solver-method');
  
  saveState();
  
  if (stopTimeInput) state.simulationSettings.stopTime = stopTimeInput.value;
  if (stepSizeInput) state.simulationSettings.stepSize = stepSizeInput.value;
  if (stepTypeSelect) state.simulationSettings.stepType = stepTypeSelect.value;
  if (solverSelect) state.simulationSettings.solver = solverSelect.value;
  if (simModeSelect) state.simulationSettings.simulationMode = simModeSelect.value;
  if (solverMethodSelect) state.simulationSettings.solverMethod = solverMethodSelect.value;
  
  closeSimSettings();
}
