export interface Component {
  id: string;
  type: string; // 'Resistor' | 'Capacitor' | 'Inductor' | 'VoltageSource' | 'ACVoltageSource' | 'Ammeter' | 'CurrentSource' | 'Switch' | 'Diode' | 'MOSFET' | 'Voltmeter' | 'Oscilloscope' | 'UnifiedProbe' | 'PI_Controller' | 'PWM_Generator' | 'Triangle_Carrier' | 'Constant' | 'Gain' | 'SummingJunction' | 'Comparator' | 'AND_Gate' | 'OR_Gate' | 'NOT_Gate' | 'Product' | 'CustomFunction' | 'Mux' | 'Demux' | 'CustomScript'
  label: string;
  x: number;
  y: number;
  rotation: number; // 0, 90, 180, 270 degrees
  nodes: string[];  // For electrical components e.g. ["node_1", "node_0"]
  parameters: Record<string, any>;
  channels: Record<string, any>;
}

export interface Wire {
  id: string;
  fromNode: string;
  toNode: string;
  points?: Array<{ x: number; y: number }>;
}

export interface CircuitDesign {
  components: Component[];
  wires: Wire[];
}

export interface SolverConfig {
  stop_time: string;
  step_size: string;
  solver: 'euler' | 'rk45' | 'radau';
  step_type: 'fixed' | 'variable';
}

export interface SimulationResults {
  time: number[];
  voltages: Record<string, number[]>;
  inductors: Record<string, number[]>;
  voltmeters: Record<string, number[]>;
  ammeters: Record<string, number[]>;
  signals: Record<string, number[]>;
  custom_plots: Record<string, number[]>;
}
