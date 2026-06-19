import { state, saveState } from './state';

// Load simulation settings properties into modal interface handles
export function openSimSettings(): void {
  const modal = document.getElementById('sim-settings-modal');
  if (!modal) return;
  
  const stopTimeInput: any = document.getElementById('sim-stop-time');
  const stepSizeInput: any = document.getElementById('sim-step-size');
  const stepTypeSelect: any = document.getElementById('sim-step-type');
  const solverSelect: any = document.getElementById('sim-solver');
  
  if (stopTimeInput) stopTimeInput.value = state.simulationSettings.stopTime;
  if (stepSizeInput) stepSizeInput.value = state.simulationSettings.stepSize;
  if (stepTypeSelect) stepTypeSelect.value = state.simulationSettings.stepType;
  if (solverSelect) solverSelect.value = state.simulationSettings.solver;
  
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
  
  saveState();
  
  if (stopTimeInput) state.simulationSettings.stopTime = stopTimeInput.value;
  if (stepSizeInput) state.simulationSettings.stepSize = stepSizeInput.value;
  if (stepTypeSelect) state.simulationSettings.stepType = stepTypeSelect.value;
  if (solverSelect) state.simulationSettings.solver = solverSelect.value;
  
  closeSimSettings();
}
