export interface DetailedComponent {
  type: string;
  label: string;
  desc: string;
  category: 'general' | 'control' | 'electrical';
  subcategory: string;
  symbol: string;
  defaultParameters?: Record<string, string>;
}

export const DETAILED_COMPONENTS: DetailedComponent[] = [
  // ==========================================
  // GENERAL (SYSTEM & CONNECTIVITY) BLOCKS
  // ==========================================
  // Ports and Subsystems
  {
    type: 'SUBSYSTEM',
    label: 'Subsystem',
    desc: 'Nest a collection of blocks inside a single container block.',
    category: 'general',
    subcategory: 'Ports and Subsystems',
    symbol: 'Subsys'
  },
  {
    type: 'CONFIG_SUBSYSTEM',
    label: 'Configurable Subsystem',
    desc: 'A subsystem that allows switching between different internal configurations.',
    category: 'general',
    subcategory: 'Ports and Subsystems',
    symbol: 'CfgSub'
  },
  {
    type: 'INPORT',
    label: 'Signal Inport',
    desc: 'Input port for a subsystem or a model reference.',
    category: 'general',
    subcategory: 'Ports and Subsystems',
    symbol: 'Inport'
  },
  {
    type: 'OUTPORT',
    label: 'Signal Outport',
    desc: 'Output port for a subsystem or a model reference.',
    category: 'general',
    subcategory: 'Ports and Subsystems',
    symbol: 'Outport'
  },
  {
    type: 'TRIGGER',
    label: 'Trigger',
    desc: 'Execute a subsystem or log a task when a specific signal event occurs.',
    category: 'general',
    subcategory: 'Ports and Subsystems',
    symbol: 'Trig'
  },
  {
    type: 'ENABLE',
    label: 'Enable',
    desc: 'Enable or disable the execution of a subsystem based on a control input.',
    category: 'general',
    subcategory: 'Ports and Subsystems',
    symbol: 'Enable'
  },
  {
    type: 'MODEL_REF',
    label: 'Model Reference',
    desc: 'Reference another separate PLECS model file inside the current schematic.',
    category: 'general',
    subcategory: 'Ports and Subsystems',
    symbol: 'Model'
  },

  // Signal Routing
  {
    type: 'MUX',
    label: 'Signal Multiplexer (Mux)',
    desc: 'Combine several scalar or vector signals into a single vector signal.',
    category: 'general',
    subcategory: 'Signal Routing',
    symbol: 'MUX',
    defaultParameters: { inputs: '2' }
  },
  {
    type: 'DEMUX',
    label: 'Signal Demultiplexer (Demux)',
    desc: 'Split a vector signal into separate scalar or vector signals.',
    category: 'general',
    subcategory: 'Signal Routing',
    symbol: 'DMUX',
    defaultParameters: { outputs: '2' }
  },
  {
    type: 'SIG_SEL',
    label: 'Signal Selector',
    desc: 'Extract a subset of signals from a vector based on user-defined indices.',
    category: 'general',
    subcategory: 'Signal Routing',
    symbol: 'Select',
    defaultParameters: { indices: '[0]' }
  },
  {
    type: 'DYNAMIC_SIG_SEL',
    label: 'Dynamic Signal Selector',
    desc: 'Dynamically select an element or slice of a vector signal using a control input.',
    category: 'general',
    subcategory: 'Signal Routing',
    symbol: 'DynSel'
  },
  {
    type: 'SCALAR_EXP',
    label: 'Scalar Expander',
    desc: 'Expand a scalar signal to match the dimensions of a vector.',
    category: 'general',
    subcategory: 'Signal Routing',
    symbol: 'Expand'
  },
  {
    type: 'FROM_SIG',
    label: 'Signal From',
    desc: 'Receive a signal from a matching Signal Goto block without a physical connection line.',
    category: 'general',
    subcategory: 'Signal Routing',
    symbol: 'From',
    defaultParameters: { tag: 'A' }
  },
  {
    type: 'GOTO_SIG',
    label: 'Signal Goto',
    desc: 'Broadcast a signal to all matching Signal From blocks.',
    category: 'general',
    subcategory: 'Signal Routing',
    symbol: 'Goto',
    defaultParameters: { tag: 'A' }
  },

  // Visualization & Logging
  {
    type: 'SCOPE',
    label: 'Scope',
    desc: 'Display and analyze simulated signals over time with built-in measurement tools.',
    category: 'general',
    subcategory: 'Visualization & Logging',
    symbol: 'Scope',
    defaultParameters: { channels: '2' }
  },
  {
    type: 'XY_PLOT',
    label: 'XY Plot',
    desc: 'Display one signal against another (useful for phase-plane plots, locus diagrams, etc.).',
    category: 'general',
    subcategory: 'Visualization & Logging',
    symbol: 'XY'
  },
  {
    type: 'DISPLAY_VAL',
    label: 'Display',
    desc: 'Show the current numerical value of a signal during a simulation run.',
    category: 'general',
    subcategory: 'Visualization & Logging',
    symbol: 'Disp'
  },
  {
    type: 'TO_FILE',
    label: 'To File',
    desc: 'Save simulation signal data directly to a file (e.g., .mat or .csv).',
    category: 'general',
    subcategory: 'Visualization & Logging',
    symbol: 'ToFile',
    defaultParameters: { filename: 'output.csv' }
  },
  {
    type: 'FROM_FILE',
    label: 'From File',
    desc: 'Read time-varying signal data from a file for use in the simulation.',
    category: 'general',
    subcategory: 'Visualization & Logging',
    symbol: 'FromFile',
    defaultParameters: { filename: 'input.csv' }
  },

  // Execution Control & Tools
  {
    type: 'PAUSE_STOP',
    label: 'Pause / Stop',
    desc: 'Halt or stop the simulation execution based on a trigger signal.',
    category: 'general',
    subcategory: 'Execution Control & Tools',
    symbol: 'Stop'
  },
  {
    type: 'TASK_FRAME',
    label: 'Task Frame',
    desc: 'Define execution boundaries for code generation tasks.',
    category: 'general',
    subcategory: 'Execution Control & Tools',
    symbol: 'Task'
  },
  {
    type: 'TASK_TRANS',
    label: 'Task Transition',
    desc: 'Handle data exchange between blocks running in different task rates.',
    category: 'general',
    subcategory: 'Execution Control & Tools',
    symbol: 'Trans'
  },
  {
    type: 'LOSS_CALC',
    label: 'Switch Loss Calculator',
    desc: 'Calculate semiconductor conduction and switching losses.',
    category: 'general',
    subcategory: 'Execution Control & Tools',
    symbol: 'Loss'
  },

  // ==========================================
  // CONTROL (SIGNAL PROCESSING) BLOCKS
  // ==========================================
  // Sources
  {
    type: 'CONST',
    label: 'Constant',
    desc: 'Output a constant value.',
    category: 'control',
    subcategory: 'Sources',
    symbol: 'CST',
    defaultParameters: { value: '1.0' }
  },
  {
    type: 'CLOCK',
    label: 'Clock',
    desc: 'Output the current simulation time.',
    category: 'control',
    subcategory: 'Sources',
    symbol: 't'
  },
  {
    type: 'INIT_COND',
    label: 'Initial Condition',
    desc: 'Output a specified initial value in the very first simulation step and pass the input through thereafter.',
    category: 'control',
    subcategory: 'Sources',
    symbol: 'x0',
    defaultParameters: { initial_value: '0' }
  },
  {
    type: 'PULSE_GEN',
    label: 'Pulse Generator',
    desc: 'Generate a periodic pulse train signal.',
    category: 'control',
    subcategory: 'Sources',
    symbol: 'Pulse',
    defaultParameters: { amplitude: '1', period: '1', width: '0.5', delay: '0' }
  },
  {
    type: 'RAMP',
    label: 'Ramp',
    desc: 'Generate a signal that increases or decreases linearly over time.',
    category: 'control',
    subcategory: 'Sources',
    symbol: 'Ramp',
    defaultParameters: { slope: '1', start_time: '0', initial_output: '0' }
  },
  {
    type: 'RANDOM_NUM',
    label: 'Random Numbers',
    desc: 'Generate normally (Gaussian) distributed random numbers.',
    category: 'control',
    subcategory: 'Sources',
    symbol: 'Rand'
  },
  {
    type: 'SINE_WAVE',
    label: 'Sine Wave',
    desc: 'Generate a sinusoidal signal with adjustable amplitude, frequency, and phase.',
    category: 'control',
    subcategory: 'Sources',
    symbol: 'Sin',
    defaultParameters: { amplitude: '1', frequency: '50', phase: '0' }
  },
  {
    type: 'STEP',
    label: 'Step',
    desc: 'Generate a step change at a specified time.',
    category: 'control',
    subcategory: 'Sources',
    symbol: 'Step',
    defaultParameters: { step_time: '1', initial_value: '0', final_value: '1' }
  },
  {
    type: 'TRI_GEN',
    label: 'Triangular Wave Generator',
    desc: 'Generate a symmetric or asymmetric triangular/sawtooth wave.',
    category: 'control',
    subcategory: 'Sources',
    symbol: 'Triangle',
    defaultParameters: { frequency: '10k', min: '0', max: '1' }
  },
  {
    type: 'WHITE_NOISE',
    label: 'White Noise',
    desc: 'Generate continuous-time white noise.',
    category: 'control',
    subcategory: 'Sources',
    symbol: 'Noise'
  },

  // Functions & Tables
  {
    type: 'GAIN',
    label: 'Gain',
    desc: 'Multiply the input signal by a constant factor.',
    category: 'control',
    subcategory: 'Functions & Tables',
    symbol: 'K',
    defaultParameters: { K: '2.5' }
  },
  {
    type: 'SUM',
    label: 'Sum',
    desc: 'Output the sum of the inputs.',
    category: 'control',
    subcategory: 'Functions & Tables',
    symbol: '+',
    defaultParameters: { signs: '++' }
  },
  {
    type: 'PROD',
    label: 'Product',
    desc: 'Output the product or division of the inputs.',
    category: 'control',
    subcategory: 'Functions & Tables',
    symbol: '*',
    defaultParameters: { operators: '*/' }
  },
  {
    type: 'TRIG_FCN',
    label: 'Trigonometric Function',
    desc: 'Perform trigonometric operations (sin, cos, tan, asin, acos, atan, atan2, sinh, cosh, tanh).',
    category: 'control',
    subcategory: 'Functions & Tables',
    symbol: 'Trig',
    defaultParameters: { function: 'sin' }
  },
  {
    type: 'MATH_FCN',
    label: 'Math Function',
    desc: 'Perform mathematical operations (exp, log, 10^u, ln, square, sqrt, power, mod).',
    category: 'control',
    subcategory: 'Functions & Tables',
    symbol: 'Math',
    defaultParameters: { function: 'exp' }
  },
  {
    type: 'ABS',
    label: 'Abs',
    desc: 'Output the absolute value of the input.',
    category: 'control',
    subcategory: 'Functions & Tables',
    symbol: '|u|'
  },
  {
    type: 'SIGN',
    label: 'Sign',
    desc: 'Output the sign (+1, 0, or -1) of the input.',
    category: 'control',
    subcategory: 'Functions & Tables',
    symbol: 'sgn'
  },
  {
    type: 'ROUND',
    label: 'Round',
    desc: 'Round the input to the nearest integer, floor, or ceiling.',
    category: 'control',
    subcategory: 'Functions & Tables',
    symbol: 'Round',
    defaultParameters: { mode: 'nearest' }
  },
  {
    type: 'MIN_MAX',
    label: 'Min/Max',
    desc: 'Output the minimum or maximum value among inputs.',
    category: 'control',
    subcategory: 'Functions & Tables',
    symbol: 'MinMax',
    defaultParameters: { function: 'min' }
  },
  {
    type: 'LUT_1D',
    label: '1D Look-Up Table',
    desc: 'Linearly interpolate or extrapolate a 1D function defined by vectors.',
    category: 'control',
    subcategory: 'Functions & Tables',
    symbol: 'LUT 1D'
  },
  {
    type: 'LUT_2D',
    label: '2D Look-Up Table',
    desc: 'Linearly interpolate or extrapolate a 2D function defined by a grid.',
    category: 'control',
    subcategory: 'Functions & Tables',
    symbol: 'LUT 2D'
  },
  {
    type: 'LUT_3D',
    label: '3D Look-Up Table',
    desc: 'Interpolate a 3D function.',
    category: 'control',
    subcategory: 'Functions & Tables',
    symbol: 'LUT 3D'
  },
  {
    type: 'FCN',
    label: 'Function (f(u))',
    desc: 'Evaluate a custom mathematical expression.',
    category: 'control',
    subcategory: 'Functions & Tables',
    symbol: 'f(u)',
    defaultParameters: { expr: 'u[0] * 2' }
  },
  {
    type: 'CSCRIPT',
    label: 'C-Script',
    desc: 'Implement custom continuous/discrete dynamic behavior in ANSI-C code.',
    category: 'control',
    subcategory: 'Functions & Tables',
    symbol: 'C++',
    defaultParameters: { timestep: '0' }
  },
  {
    type: 'DLL',
    label: 'DLL',
    desc: 'Link and run an external compiled dynamically-linked library.',
    category: 'control',
    subcategory: 'Functions & Tables',
    symbol: 'DLL'
  },
  {
    type: 'FMU',
    label: 'FMU',
    desc: 'Import Functional Mock-up Units (FMUs) for co-simulation.',
    category: 'control',
    subcategory: 'Functions & Tables',
    symbol: 'FMU'
  },
  {
    type: 'FOURIER_SERIES',
    label: 'Fourier Series',
    desc: 'Synthesize a periodic signal using Fourier coefficients.',
    category: 'control',
    subcategory: 'Functions & Tables',
    symbol: 'Fourier'
  },

  // Continuous
  {
    type: 'INTEGRATOR',
    label: 'Integrator',
    desc: 'Integrate the input signal over time (1/s).',
    category: 'control',
    subcategory: 'Continuous',
    symbol: '1/s'
  },
  {
    type: 'DERIVATIVE',
    label: 'Derivative',
    desc: 'Calculate the time derivative of the input signal (s).',
    category: 'control',
    subcategory: 'Continuous',
    symbol: 's'
  },
  {
    type: 'TRANSFER_FCN',
    label: 'Transfer Function',
    desc: 'Implement a continuous-time linear transfer function G(s).',
    category: 'control',
    subcategory: 'Continuous',
    symbol: 'G(s)',
    defaultParameters: { num: '[1]', den: '[1 1]' }
  },
  {
    type: 'STATE_SPACE',
    label: 'State Space',
    desc: 'Implement continuous-time state-space equations (dx = Ax + Bu, y = Cx + Du).',
    category: 'control',
    subcategory: 'Continuous',
    symbol: 'x\'=Ax+Bu'
  },
  {
    type: 'DELAY',
    label: 'Delay',
    desc: 'Delay the input signal by a continuous or variable time step.',
    category: 'control',
    subcategory: 'Delays',
    symbol: 'Delay',
    defaultParameters: { delay: '0.1' }
  },
  {
    type: 'TRANSPORT_DELAY',
    label: 'Transport Delay',
    desc: 'Delay an input signal by a specified, fixed amount of time.',
    category: 'control',
    subcategory: 'Delays',
    symbol: 'e^-sT',
    defaultParameters: { delay: '0.1' }
  },
  {
    type: 'TURN_ON_DELAY',
    label: 'Turn-on Delay',
    desc: 'Delay the rising edge of a boolean control signal.',
    category: 'control',
    subcategory: 'Delays',
    symbol: 'Ton',
    defaultParameters: { delay: '0.05' }
  },
  {
    type: 'MEMORY_BLOCK',
    label: 'Memory',
    desc: 'Outputs the input value from the previous solver integration step.',
    category: 'control',
    subcategory: 'Delays',
    symbol: 'Mem',
    defaultParameters: { initial_value: '0.0' }
  },
  {
    type: 'CONT_PID',
    label: 'Continuous PID Controller',
    desc: 'Continuous-time Proportional-Integral-Derivative (PID) controller with derivative filtering.',
    category: 'control',
    subcategory: 'Continuous',
    symbol: 'PID(s)',
    defaultParameters: { Kp: '1.0', Ki: '0.0', Kd: '0.0', Tf: '0.01' }
  },
  {
    type: 'PLL_1PH',
    label: 'Single-Phase PLL',
    desc: 'Single-phase phase-locked loop using Second-Order Generalized Integrator (SOGI-PLL) for grid synchronization.',
    category: 'control',
    subcategory: 'Continuous',
    symbol: 'PLL 1Φ',
    defaultParameters: { fn: '50.0', Kp: '20.0', Ki: '1000.0' }
  },
  {
    type: 'PLL_3PH',
    label: 'Three-Phase PLL',
    desc: 'Three-phase Synchronous Reference Frame Phase-Locked Loop (SRF-PLL) for grid synchronization.',
    category: 'control',
    subcategory: 'Continuous',
    symbol: 'PLL 3Φ',
    defaultParameters: { fn: '50.0', Kp: '20.0', Ki: '1000.0' }
  },
  {
    type: 'QUANTIZER',
    label: 'Quantizer',
    desc: 'Quantize input signal to a specified interval.',
    category: 'control',
    subcategory: 'Discontinuous',
    symbol: 'Quantize',
    defaultParameters: { step_size: '0.5', mode: 'round' }
  },
  {
    type: 'SIGNAL_SWITCH',
    label: 'Signal Switch',
    desc: 'Switch between two input signals based on a control threshold.',
    category: 'control',
    subcategory: 'Discontinuous',
    symbol: 'Switch',
    defaultParameters: { threshold: '0.5', criteria: 'u2 >= threshold' }
  },
  {
    type: 'MANUAL_SWITCH',
    label: 'Manual Signal Switch',
    desc: 'Manually select between two input signals (double click to toggle).',
    category: 'control',
    subcategory: 'Discontinuous',
    symbol: 'Manual Sw',
    defaultParameters: { state: 'Input 1' }
  },
  {
    type: 'MULTIPORT_SWITCH',
    label: 'Multiport Signal Switch',
    desc: 'Route one of multiple inputs to the output based on control index.',
    category: 'control',
    subcategory: 'Discontinuous',
    symbol: 'Multiport Sw',
    defaultParameters: { inputs: '3', indexing: '1-based' }
  },
  {
    type: 'HIT_CROSSING',
    label: 'Hit Crossing',
    desc: 'Detect when the input signal crosses a specified offset threshold.',
    category: 'control',
    subcategory: 'Discontinuous',
    symbol: 'Hit Cross',
    defaultParameters: { offset: '0.0', direction: 'either' }
  },

  // Discrete-Time Dynamics
  {
    type: 'DISCRETE_INT',
    label: 'Discrete Integrator',
    desc: 'Integrate the input signal using discrete-time approximation methods (Forward Euler, Backward Euler, Trapezoidal).',
    category: 'control',
    subcategory: 'Discrete-Time Dynamics',
    symbol: 'Int z',
    defaultParameters: { method: 'Forward Euler', ts: '100u' }
  },
  {
    type: 'DISCRETE_TF',
    label: 'Discrete Transfer Function',
    desc: 'Implement a discrete-time linear transfer function H(z).',
    category: 'control',
    subcategory: 'Discrete-Time Dynamics',
    symbol: 'H(z)',
    defaultParameters: { num: '[1]', den: '[1 -0.9]', ts: '100u' }
  },
  {
    type: 'DISCRETE_SS',
    label: 'Discrete State Space',
    desc: 'Implement discrete-time state-space equations (x[k+1] = Ax[k] + Bu[k]).',
    category: 'control',
    subcategory: 'Discrete-Time Dynamics',
    symbol: 'x[k+1]'
  },
  {
    type: 'ZOH',
    label: 'Zero Order Hold',
    desc: 'Sample the input at a specified rate and hold it constant.',
    category: 'control',
    subcategory: 'Discrete-Time Dynamics',
    symbol: 'ZOH',
    defaultParameters: { ts: '100u' }
  },
  {
    type: 'UNIT_DELAY',
    label: 'Unit Delay',
    desc: 'Delay a discrete signal by one sample period (z^-1).',
    category: 'control',
    subcategory: 'Discrete-Time Dynamics',
    symbol: 'z^-1',
    defaultParameters: { ts: '100u' }
  },
  {
    type: 'DISCRETE_MEAN',
    label: 'Discrete Mean Value',
    desc: 'Compute the running mean of an input signal over a specified period.',
    category: 'control',
    subcategory: 'Discrete-Time Dynamics',
    symbol: 'Mean z',
    defaultParameters: { ts: '100u', period: '0.02', initial_value: '0.0' }
  },
  {
    type: 'DISCRETE_PID',
    label: 'Discrete PID Controller',
    desc: 'Discrete-time PID controller with configurable approximation methods and derivative filtering.',
    category: 'control',
    subcategory: 'Discrete-Time Dynamics',
    symbol: 'PID z',
    defaultParameters: { Kp: '1.0', Ki: '10.0', Kd: '0.0', Tf: '0.001', ts: '100u', method: 'Forward Euler' }
  },

  // Discontinuous
  {
    type: 'SATURATION',
    label: 'Saturation',
    desc: 'Limit the upper and lower bounds of a signal.',
    category: 'control',
    subcategory: 'Discontinuous',
    symbol: 'Sat',
    defaultParameters: { min: '-10', max: '10' }
  },
  {
    type: 'DEAD_ZONE',
    label: 'Dead Zone',
    desc: 'Output zero when the input is within a specified dead band.',
    category: 'control',
    subcategory: 'Discontinuous',
    symbol: 'Dead',
    defaultParameters: { start: '-0.5', end: '0.5' }
  },
  {
    type: 'RATE_LIMITER',
    label: 'Rate Limiter',
    desc: 'Limit the maximum rate of change (slope) of a signal.',
    category: 'control',
    subcategory: 'Discontinuous',
    symbol: 'Rate',
    defaultParameters: { up: '10', down: '-10' }
  },
  {
    type: 'RELAY',
    label: 'Relay',
    desc: 'Implement a relay with adjustable hysteresis thresholds.',
    category: 'control',
    subcategory: 'Discontinuous',
    symbol: 'Relay',
    defaultParameters: { on_threshold: '1', off_threshold: '-1' }
  },
  {
    type: 'COMP',
    label: 'Comparator',
    desc: 'Compare two signals and output a boolean/digital output.',
    category: 'control',
    subcategory: 'Discontinuous',
    symbol: 'COMP'
  },

  // Logical & Bitwise
  {
    type: 'LOGIC_OP',
    label: 'Logical Operator',
    desc: 'Perform logical operations (AND, OR, XOR, NOT, NAND, NOR, NXOR).',
    category: 'control',
    subcategory: 'Logical & Bitwise',
    symbol: 'Logic',
    defaultParameters: { operator: 'AND' }
  },
  {
    type: 'BITWISE_OP',
    label: 'Bitwise Operator',
    desc: 'Perform bitwise logical operations on integer signals.',
    category: 'control',
    subcategory: 'Logical & Bitwise',
    symbol: 'Bitwise',
    defaultParameters: { operator: 'AND' }
  },
  {
    type: 'COMB_LOGIC',
    label: 'Combinational Logic',
    desc: 'Implement a truth table lookup.',
    category: 'control',
    subcategory: 'Logical & Bitwise',
    symbol: 'Truth'
  },
  {
    type: 'EDGE_DETECT',
    label: 'Edge Detector',
    desc: 'Detect rising, falling, or both edges of a digital signal.',
    category: 'control',
    subcategory: 'Logical & Bitwise',
    symbol: 'Edge',
    defaultParameters: { edge: 'rising' }
  },
  {
    type: 'MONOSTABLE',
    label: 'Monostable',
    desc: 'Output a pulse of fixed duration when triggered.',
    category: 'control',
    subcategory: 'Logical & Bitwise',
    symbol: 'Mono',
    defaultParameters: { duration: '0.1' }
  },
  {
    type: 'MONOFLOP',
    label: 'Monoflop',
    desc: 'Output a pulse of fixed duration when triggered by a rising/falling edge.',
    category: 'control',
    subcategory: 'Logical & Bitwise',
    symbol: 'Mono',
    defaultParameters: { duration: '0.1', trigger_edge: 'rising', retriggerable: 'false' }
  },
  {
    type: 'RELATIONAL_OPERATOR',
    label: 'Relational Operator',
    desc: 'Compare two input signals using a relational operator.',
    category: 'control',
    subcategory: 'Logical & Bitwise',
    symbol: 'RelOp',
    defaultParameters: { operator: '==' }
  },
  {
    type: 'COMPARE_TO_CONSTANT',
    label: 'Compare to Constant',
    desc: 'Compare the input to a constant value using a relational operator.',
    category: 'control',
    subcategory: 'Logical & Bitwise',
    symbol: 'CompConst',
    defaultParameters: { operator: '==', constant: '0.0' }
  },
  {
    type: 'D_FLIP_FLOP',
    label: 'D Flip-Flop',
    desc: 'D-type flip-flop with rising/falling edge clock trigger and optional initial state.',
    category: 'control',
    subcategory: 'Logical & Bitwise',
    symbol: 'D-FF',
    defaultParameters: { initial_state: '0.0', trigger_edge: 'rising' }
  },
  {
    type: 'JK_FLIP_FLOP',
    label: 'JK Flip-Flop',
    desc: 'JK-type flip-flop with rising/falling edge clock trigger and optional initial state.',
    category: 'control',
    subcategory: 'Logical & Bitwise',
    symbol: 'JK-FF',
    defaultParameters: { initial_state: '0.0', trigger_edge: 'rising' }
  },
  {
    type: 'SHIFT_REG',
    label: 'Shift Register',
    desc: 'Shift bits or signals through a discrete delay chain.',
    category: 'control',
    subcategory: 'Logical & Bitwise',
    symbol: 'Shift'
  },

  // Modulators
  {
    type: 'PWM',
    label: 'PWM',
    desc: 'Generate standard pulse-width modulated signals.',
    category: 'control',
    subcategory: 'Modulators',
    symbol: 'PWM',
    defaultParameters: { frequency: '10k' }
  },
  {
    type: 'PWM_3PH',
    label: 'PWM (3-Phase)',
    desc: 'Generate duty cycles and control signals for 3-phase converters.',
    category: 'control',
    subcategory: 'Modulators',
    symbol: 'PWM 3Ph',
    defaultParameters: { frequency: '10k' }
  },
  {
    type: 'SVPWM',
    label: 'Space Vector PWM',
    desc: 'Implement space vector modulation for 3-phase systems.',
    category: 'control',
    subcategory: 'Modulators',
    symbol: 'SVPWM'
  },

  // Signal Transforms
  {
    type: 'CLARKE',
    label: 'Clarke Transform',
    desc: 'Convert 3-phase quantities (abc) to stationary 2-phase coordinates (αβ0).',
    category: 'control',
    subcategory: 'Signal Transforms',
    symbol: 'abc-αβ'
  },
  {
    type: 'PARK',
    label: 'Park Transform',
    desc: 'Convert stationary 2-phase coordinates (αβ) to rotating coordinates (dq).',
    category: 'control',
    subcategory: 'Signal Transforms',
    symbol: 'αβ-dq'
  },
  {
    type: 'INV_CLARKE',
    label: 'Inverse Clarke Transform',
    desc: 'Convert stationary 2-phase coordinates (αβ0) back to 3-phase quantities (abc).',
    category: 'control',
    subcategory: 'Signal Transforms',
    symbol: 'αβ-abc'
  },
  {
    type: 'INV_PARK',
    label: 'Inverse Park Transform',
    desc: 'Convert rotating coordinates (dq) back to stationary 2-phase coordinates (αβ).',
    category: 'control',
    subcategory: 'Signal Transforms',
    symbol: 'dq-αβ'
  },

  // Filters & Measurements
  {
    type: 'PER_AVG',
    label: 'Periodic Average',
    desc: 'Compute the average value of a signal over a specified moving period.',
    category: 'control',
    subcategory: 'Filters & Measurements',
    symbol: 'Avg T',
    defaultParameters: { period: '0.02' }
  },
  {
    type: 'PERIODIC_IMP_AVG',
    label: 'Periodic Impulse Average',
    desc: 'Compute the average value of a signal over the interval between trigger impulses.',
    category: 'control',
    subcategory: 'Filters & Measurements',
    symbol: 'Imp Avg',
    defaultParameters: { initial_value: '0.0' }
  },
  {
    type: 'FOURIER_TRANS',
    label: 'Fourier Transform',
    desc: 'Compute magnitude and phase of fundamental or harmonic component of a signal.',
    category: 'control',
    subcategory: 'Filters & Measurements',
    symbol: 'Fourier',
    defaultParameters: { f: '50.0', harmonic: '1', ts: '100u' }
  },
  {
    type: 'MOV_AVG',
    label: 'Moving Average',
    desc: 'Compute the running average of a signal over a sliding window.',
    category: 'control',
    subcategory: 'Filters & Measurements',
    symbol: 'MovAvg',
    defaultParameters: { window: '10' }
  },
  {
    type: 'FILTER_1ST',
    label: 'First-Order Filter',
    desc: 'Low-pass, high-pass, or all-pass first-order linear filter.',
    category: 'control',
    subcategory: 'Filters & Measurements',
    symbol: 'Filt1st',
    defaultParameters: { type: 'Lowpass', fc: '1k' }
  },
  {
    type: 'FILTER_2ND',
    label: 'Second-Order Filter',
    desc: 'Low-pass, high-pass, band-pass, or notch second-order linear filter.',
    category: 'control',
    subcategory: 'Filters & Measurements',
    symbol: 'Filt2nd',
    defaultParameters: { type: 'Lowpass', fc: '1k', Q: '0.707' }
  },
  {
    type: 'FOURIER_ANALYSIS',
    label: 'Fourier Analysis',
    desc: 'Extract the magnitude and phase of specific frequency components.',
    category: 'control',
    subcategory: 'Filters & Measurements',
    symbol: 'Fourier'
  },
  {
    type: 'RMS_VAL',
    label: 'RMS',
    desc: 'Calculate the Root Mean Square value of a signal.',
    category: 'control',
    subcategory: 'Filters & Measurements',
    symbol: 'RMS',
    defaultParameters: { frequency: '50' }
  },
  {
    type: 'THD_VAL',
    label: 'THD',
    desc: 'Calculate the Total Harmonic Distortion of a periodic signal.',
    category: 'control',
    subcategory: 'Filters & Measurements',
    symbol: 'THD'
  },
  {
    type: 'PLL_LOOP',
    label: 'PLL (Phase-Locked Loop)',
    desc: 'Synchronize to the phase of an input AC signal.',
    category: 'control',
    subcategory: 'Filters & Measurements',
    symbol: 'PLL'
  },

  // State Machines
  {
    type: 'STATE_MACHINE',
    label: 'State Machine',
    desc: 'Design and execute event-driven logic using standard state chart semantics (states, transitions, events).',
    category: 'control',
    subcategory: 'State Machines',
    symbol: 'State'
  },

  // Math
  {
    type: 'OFFSET',
    label: 'Offset',
    desc: 'Add a static offset to the input signal.',
    category: 'control',
    subcategory: 'Math',
    symbol: 'OFFSET',
    defaultParameters: { offset: '0.0' }
  },
  {
    type: 'SUM_ROUND',
    label: 'Sum (round)',
    desc: 'Circular summing junction to sum two signals.',
    category: 'control',
    subcategory: 'Math',
    symbol: 'SUM',
    defaultParameters: { inputs: '2', signs: '++' }
  },
  {
    type: 'SUM_RECT',
    label: 'Sum (rectangular)',
    desc: 'Rectangular summing junction to sum two signals.',
    category: 'control',
    subcategory: 'Math',
    symbol: 'SUM',
    defaultParameters: { inputs: '2', signs: '++' }
  },
  {
    type: 'SUBTRACT',
    label: 'Subtract',
    desc: 'Subtract input B from input A.',
    category: 'control',
    subcategory: 'Math',
    symbol: 'SUB',
    defaultParameters: { signs: '+-' }
  },
  {
    type: 'PRODUCT_RECT',
    label: 'Product (rectangular)',
    desc: 'Multiply or divide two input signals.',
    category: 'control',
    subcategory: 'Math',
    symbol: 'PROD',
    defaultParameters: { inputs: '2', operators: '**' }
  },
  {
    type: 'SIGNUM',
    label: 'Signum',
    desc: 'Output the signum of the input signal.',
    category: 'control',
    subcategory: 'Math',
    symbol: 'sgn'
  },
  {
    type: 'DIVIDE',
    label: 'Divide',
    desc: 'Divide the numerator by the denominator.',
    category: 'control',
    subcategory: 'Math',
    symbol: 'DIV',
    defaultParameters: { operators: '*/' }
  },
  {
    type: 'DATATYPE_CONV',
    label: 'Data Type Conversion',
    desc: 'Convert input signal to boolean, integer, single, or double.',
    category: 'control',
    subcategory: 'Math',
    symbol: 'Cast',
    defaultParameters: { datatype: 'boolean' }
  },

  // ==========================================
  // ELECTRICAL DOMAIN BLOCKS
  // ==========================================
  // Connectivity
  {
    type: 'E_PORT',
    label: 'Electrical Port',
    desc: 'Create physical electrical connection points for subsystems.',
    category: 'electrical',
    subcategory: 'Connectivity',
    symbol: 'E-Port'
  },
  {
    type: 'E_LABEL',
    label: 'Electrical Label',
    desc: 'Create wireless electrical connections using named tags (labels).',
    category: 'electrical',
    subcategory: 'Connectivity',
    symbol: 'E-Tag',
    defaultParameters: { label: 'A' }
  },

  // Sources
  {
    type: 'V',
    label: 'DC Voltage Source',
    desc: 'Ideal constant voltage source.',
    category: 'electrical',
    subcategory: 'Sources',
    symbol: 'DC_V',
    defaultParameters: { value: '24' }
  },
  {
    type: 'I',
    label: 'DC Current Source',
    desc: 'Ideal constant current source.',
    category: 'electrical',
    subcategory: 'Sources',
    symbol: 'DC_I',
    defaultParameters: { value: '1' }
  },
  {
    type: 'AC_V',
    label: 'AC Voltage Source',
    desc: 'Sinusoidal voltage source.',
    category: 'electrical',
    subcategory: 'Sources',
    symbol: 'AC_V',
    defaultParameters: { amplitude: '12', frequency: '50' }
  },
  {
    type: 'AC_I',
    label: 'AC Current Source',
    desc: 'Sinusoidal current source.',
    category: 'electrical',
    subcategory: 'Sources',
    symbol: 'AC_I',
    defaultParameters: { amplitude: '1', frequency: '50' }
  },
  {
    type: 'CTRL_V',
    label: 'Controlled Voltage Source',
    desc: 'Voltage source controlled by a signal from the Control domain.',
    category: 'electrical',
    subcategory: 'Sources',
    symbol: 'Src V'
  },
  {
    type: 'CTRL_I',
    label: 'Controlled Current Source',
    desc: 'Current source controlled by a signal from the Control domain.',
    category: 'electrical',
    subcategory: 'Sources',
    symbol: 'Src I'
  },
  {
    type: 'V_3PH',
    label: '3-Phase Voltage Source (Controlled)',
    desc: '3-phase voltage output controlled by a 3-element signal.',
    category: 'electrical',
    subcategory: 'Sources',
    symbol: '3Ph V'
  },
  {
    type: 'I_3PH',
    label: '3-Phase Current Source (Controlled)',
    desc: '3-phase current output controlled by a 3-element signal.',
    category: 'electrical',
    subcategory: 'Sources',
    symbol: '3Ph I'
  },

  // Meters (Sensors)
  {
    type: 'VM',
    label: 'Voltmeter',
    desc: 'Measure the potential difference between two electrical nodes.',
    category: 'electrical',
    subcategory: 'Meters (Sensors)',
    symbol: 'VM'
  },
  {
    type: 'AM',
    label: 'Ammeter',
    desc: 'Measure the current flowing through an electrical branch.',
    category: 'electrical',
    subcategory: 'Meters (Sensors)',
    symbol: 'AM'
  },
  {
    type: 'VM_3PH',
    label: 'Voltage Meter (3-Phase)',
    desc: 'Measure line-to-line or line-to-neutral voltages in a 3-phase network.',
    category: 'electrical',
    subcategory: 'Meters (Sensors)',
    symbol: '3VM'
  },
  {
    type: 'AM_3PH',
    label: 'Current Meter (3-Phase)',
    desc: 'Measure the individual currents in a 3-phase branch.',
    category: 'electrical',
    subcategory: 'Meters (Sensors)',
    symbol: '3AM'
  },

  // Passive Components
  {
    type: 'R',
    label: 'Resistor',
    desc: 'Ideal linear resistor (R).',
    category: 'electrical',
    subcategory: 'Passive Components',
    symbol: 'R',
    defaultParameters: { value: '10' }
  },
  {
    type: 'L',
    label: 'Inductor',
    desc: 'Ideal linear inductor (L).',
    category: 'electrical',
    subcategory: 'Passive Components',
    symbol: 'L',
    defaultParameters: { L: '10m', esr: '0' }
  },
  {
    type: 'C',
    label: 'Capacitor',
    desc: 'Ideal linear capacitor (C).',
    category: 'electrical',
    subcategory: 'Passive Components',
    symbol: 'C',
    defaultParameters: { C: '100u', esr: '0' }
  },
  {
    type: 'VAR_R',
    label: 'Variable Resistor',
    desc: 'Resistor whose resistance is controlled by an external signal.',
    category: 'electrical',
    subcategory: 'Passive Components',
    symbol: 'var R'
  },
  {
    type: 'VAR_L',
    label: 'Variable Inductor',
    desc: 'Inductor whose inductance is controlled by an external signal.',
    category: 'electrical',
    subcategory: 'Passive Components',
    symbol: 'var L'
  },
  {
    type: 'VAR_C',
    label: 'Variable Capacitor',
    desc: 'Capacitor whose capacitance is controlled by an external signal.',
    category: 'electrical',
    subcategory: 'Passive Components',
    symbol: 'var C'
  },
  {
    type: 'SAT_L',
    label: 'Saturable Inductor',
    desc: 'Inductor that models magnetic core saturation natively in the electrical domain.',
    category: 'electrical',
    subcategory: 'Passive Components',
    symbol: 'sat L'
  },
  {
    type: 'SAT_C',
    label: 'Saturable Capacitor',
    desc: 'Capacitor modeling non-linear capacitance behavior.',
    category: 'electrical',
    subcategory: 'Passive Components',
    symbol: 'sat C'
  },
  {
    type: 'PI_SECTION',
    label: 'Pi-Section Line',
    desc: 'Model a transmission line using lumped Pi-sections.',
    category: 'electrical',
    subcategory: 'Passive Components',
    symbol: 'Pi Line'
  },
  {
    type: 'LINE_3PH',
    label: 'Transmission Line (3ph)',
    desc: 'Model a 3-phase transmission line with series impedances and shunt capacitances.',
    category: 'electrical',
    subcategory: 'Passive Components',
    symbol: '3Ph Line'
  },
  {
    type: 'PWL_R',
    label: 'Piece-wise Linear Resistor',
    desc: 'Non-linear resistor defined by voltage-current coordinate pairs.',
    category: 'electrical',
    subcategory: 'Passive Components',
    symbol: 'pwl R'
  },
  {
    type: 'E_ALGEBRAIC',
    label: 'Electrical Algebraic Component',
    desc: 'Impose an algebraic constraint in terms of branch voltage and current.',
    category: 'electrical',
    subcategory: 'Passive Components',
    symbol: 'E-Alg'
  },

  // Power Semiconductors (Ideal Behavioral Switches)
  {
    type: 'D',
    label: 'Diode',
    desc: 'Ideal diode with optional forward voltage and on-resistance.',
    category: 'electrical',
    subcategory: 'Power Semiconductors (Ideal Behavioral Switches)',
    symbol: 'D'
  },
  {
    type: 'THYRISTOR',
    label: 'Thyristor',
    desc: 'Ideal thyristor that turns on with a gate trigger and turns off at zero current.',
    category: 'electrical',
    subcategory: 'Power Semiconductors (Ideal Behavioral Switches)',
    symbol: 'Thyristor'
  },
  {
    type: 'GTO',
    label: 'GTO (Gate Turn-Off Thyristor)',
    desc: 'Thyristor that can be turned on and off via gate signals.',
    category: 'electrical',
    subcategory: 'Power Semiconductors (Ideal Behavioral Switches)',
    symbol: 'GTO'
  },
  {
    type: 'IGBT',
    label: 'IGBT',
    desc: 'Ideal Insulated Gate Bipolar Transistor.',
    category: 'electrical',
    subcategory: 'Power Semiconductors (Ideal Behavioral Switches)',
    symbol: 'IGBT'
  },
  {
    type: 'IGBT_DIODE',
    label: 'IGBT with Diode',
    desc: 'IGBT co-packaged with an anti-parallel diode.',
    category: 'electrical',
    subcategory: 'Power Semiconductors (Ideal Behavioral Switches)',
    symbol: 'IGBT+d'
  },
  {
    type: 'IGCT',
    label: 'IGCT',
    desc: 'Integrated Gate-Commutated Thyristor.',
    category: 'electrical',
    subcategory: 'Power Semiconductors (Ideal Behavioral Switches)',
    symbol: 'IGCT'
  },
  {
    type: 'MOSFET',
    label: 'MOSFET',
    desc: 'Ideal Metal-Oxide-Semiconductor Field-Effect Transistor.',
    category: 'electrical',
    subcategory: 'Power Semiconductors (Ideal Behavioral Switches)',
    symbol: 'MOSFET'
  },
  {
    type: 'BJT',
    label: 'BJT',
    desc: 'Bipolar Junction Transistor modeled as an ideal switch.',
    category: 'electrical',
    subcategory: 'Power Semiconductors (Ideal Behavioral Switches)',
    symbol: 'BJT'
  },
  {
    type: 'JFET',
    label: 'JFET',
    desc: 'Junction Field-Effect Transistor modeled as an ideal switch.',
    category: 'electrical',
    subcategory: 'Power Semiconductors (Ideal Behavioral Switches)',
    symbol: 'JFET'
  },

  // Switches
  {
    type: 'S',
    label: 'Switch',
    desc: 'Single-pole switch controlled by a logical control signal.',
    category: 'electrical',
    subcategory: 'Switches',
    symbol: 'S'
  },
  {
    type: 'BREAKER',
    label: 'Breaker',
    desc: 'Circuit breaker controlled by a logical control signal (opens at zero current).',
    category: 'electrical',
    subcategory: 'Switches',
    symbol: 'Breaker'
  },
  {
    type: 'DBL_SWITCH',
    label: 'Double Switch',
    desc: 'Double-throw switch toggling between two electrical nodes.',
    category: 'electrical',
    subcategory: 'Switches',
    symbol: 'DblSW'
  },
  {
    type: 'MAN_SWITCH',
    label: 'Manual Switch',
    desc: 'Double-throw switch toggled manually by double-clicking it on the schematic.',
    category: 'electrical',
    subcategory: 'Switches',
    symbol: 'mSW'
  },
  {
    type: 'MAN_DBL_SWITCH',
    label: 'Manual Double Switch',
    desc: 'Manual switch with double poles.',
    category: 'electrical',
    subcategory: 'Switches',
    symbol: 'mSW2'
  },
  {
    type: 'MAN_TRPL_SWITCH',
    label: 'Manual Triple Switch',
    desc: 'Manual switch with triple poles.',
    category: 'electrical',
    subcategory: 'Switches',
    symbol: 'mSW3'
  },
  {
    type: 'SR_SWITCH',
    label: 'Set/Reset Switch',
    desc: 'Latching electrical switch.',
    category: 'electrical',
    subcategory: 'Switches',
    symbol: 'SR SW'
  },
  {
    type: 'TRPL_SWITCH',
    label: 'Triple Switch',
    desc: 'Triple-pole switch controlled by a logical control signal.',
    category: 'electrical',
    subcategory: 'Switches',
    symbol: 'SW3'
  },

  // Transformers
  {
    type: 'IDEAL_XFMR',
    label: 'Ideal Transformer',
    desc: 'Ideal transformer modeling voltage and current scaling without leakage or magnetization.',
    category: 'electrical',
    subcategory: 'Transformers',
    symbol: 'Ideal XF'
  },
  {
    type: 'XFMR_2W',
    label: 'Linear Transformer (2 Windings)',
    desc: 'Single-phase transformer with winding resistance and leakage inductance.',
    category: 'electrical',
    subcategory: 'Transformers',
    symbol: 'XF 2W'
  },
  {
    type: 'XFMR_3W',
    label: 'Linear Transformer (3 Windings)',
    desc: 'Three-winding single-phase transformer.',
    category: 'electrical',
    subcategory: 'Transformers',
    symbol: 'XF 3W'
  },
  {
    type: 'MUTUAL_2W',
    label: 'Mutual Inductance (2 Windings)',
    desc: 'Mutually coupled inductors.',
    category: 'electrical',
    subcategory: 'Transformers',
    symbol: 'Mut 2W'
  },
  {
    type: 'MUTUAL_3W',
    label: 'Mutual Inductance (3 Windings)',
    desc: 'Three mutually coupled inductors.',
    category: 'electrical',
    subcategory: 'Transformers',
    symbol: 'Mut 3W'
  },
  {
    type: 'SAT_XFMR',
    label: 'Saturable Transformers',
    desc: 'Linear transformers with core saturation curves integrated.',
    category: 'electrical',
    subcategory: 'Transformers',
    symbol: 'sat XF'
  },
  {
    type: 'XFMR_3PH_2W',
    label: 'Transformers (3ph, 2 Windings)',
    desc: '3-phase 2-winding transformer (configurable as Y, D, Z, etc.).',
    category: 'electrical',
    subcategory: 'Transformers',
    symbol: '3Ph XF2'
  },
  {
    type: 'XFMR_3PH_3W',
    label: 'Transformers (3ph, 3 Windings)',
    desc: '3-phase 3-winding transformer.',
    category: 'electrical',
    subcategory: 'Transformers',
    symbol: '3Ph XF3'
  },

  // Electronics
  {
    type: 'OPAMP',
    label: 'Operational Amplifier (Op-Amp)',
    desc: 'Ideal or non-ideal analog operational amplifier.',
    category: 'electrical',
    subcategory: 'Electronics',
    symbol: 'OpAmp'
  },
  {
    type: 'E_COMP',
    label: 'Comparator',
    desc: 'Analog voltage comparator with customizable output levels.',
    category: 'electrical',
    subcategory: 'Electronics',
    symbol: 'eComp'
  },
  {
    type: 'GEN_EBLOCK',
    label: 'Generalized Electrical Block',
    desc: 'Configurable C++/JS script-based electrical multi-terminal machine or load block.',
    category: 'electrical',
    subcategory: 'Custom Machine/Load Models',
    symbol: 'GEN_EBLOCK'
  },
  {
    type: 'IC_555',
    label: '555 Timer IC',
    desc: 'Highly popular 8-pin integrated circuit used in a variety of timer, pulse generation, and oscillator applications.',
    category: 'electrical',
    subcategory: 'Integrated Circuits (ICs)',
    symbol: 'NE555'
  },
  {
    type: 'IC_LM7805',
    label: 'LM7805 5V Regulator IC',
    desc: 'Three-terminal positive linear voltage regulator IC with a fixed 5V output.',
    category: 'electrical',
    subcategory: 'Integrated Circuits (ICs)',
    symbol: '7805'
  },
  {
    type: 'IC_LM317',
    label: 'LM317 Adjustable Regulator IC',
    desc: 'Three-terminal adjustable positive linear voltage regulator IC capable of supplying 1.2V to 37V.',
    category: 'electrical',
    subcategory: 'Integrated Circuits (ICs)',
    symbol: 'LM317'
  },
  {
    type: 'IC_PC817',
    label: 'PC817 Optocoupler IC',
    desc: 'Photocoupler consisting of a GaAs light emitting diode optically coupled to a phototransistor in a 4-pin DIP package.',
    category: 'electrical',
    subcategory: 'Integrated Circuits (ICs)',
    symbol: 'PC817'
  },
  {
    type: 'IC_7400',
    label: '7400 Quad NAND Gate IC',
    desc: 'Standard TTL digital logic IC containing four independent 2-input NAND gates.',
    category: 'electrical',
    subcategory: 'Integrated Circuits (ICs)',
    symbol: '7400'
  },
  {
    type: 'IC_7408',
    label: '7408 Quad AND Gate IC',
    desc: 'Standard TTL digital logic IC containing four independent 2-input AND gates.',
    category: 'electrical',
    subcategory: 'Integrated Circuits (ICs)',
    symbol: '7408'
  },
  {
    type: 'IC_7432',
    label: '7432 Quad OR Gate IC',
    desc: 'Standard TTL digital logic IC containing four independent 2-input OR gates.',
    category: 'electrical',
    subcategory: 'Integrated Circuits (ICs)',
    symbol: '7432'
  },
  {
    type: 'IC_7404',
    label: '7404 Hex Inverter IC',
    desc: 'Standard TTL digital logic IC containing six independent inverter gates.',
    category: 'electrical',
    subcategory: 'Integrated Circuits (ICs)',
    symbol: '7404'
  }
];

export function getDetailedComponentPins(type: string): Record<string, any> | null {
  const libComp = DETAILED_COMPONENTS.find(c => c.type === type);
  if (!libComp) return null;

  // Keep basic ones as they are
  const basicTypes = ['R', 'L', 'C', 'S', 'D', 'MOSFET', 'V', 'I', 'AC_V', 'XFMR', 'VM', 'AM', 'CONST', 'GAIN', 'PID', 'SUM', 'PWM', 'TRI', 'COMP', 'AND', 'OR', 'NOT', 'FCN', 'PROD', 'MUX', 'DEMUX', 'CSCRIPT', 'PROBE', 'SCOPE', 'GEN_EBLOCK', 'GND', 'MULTIPORT_SWITCH'];
  if (basicTypes.includes(type)) return null;

  // Custom configurations for new blocks
  if (type === 'E_PORT' || type === 'E_LABEL') {
    return {
      A: { x: 0, y: -30, dx: 0, dy: -1 }
    };
  }

  if (type === 'GOTO_SIG') {
    return {
      In: { x: -15, y: 0, dx: -1, dy: 0 }
    };
  }

  if (type === 'FROM_SIG') {
    return {
      Out: { x: 15, y: 0, dx: 1, dy: 0 }
    };
  }

  if (type === 'OFFSET') {
    return {
      In: { x: -20, y: 0, dx: -1, dy: 0 },
      Out: { x: 20, y: 0, dx: 1, dy: 0 }
    };
  }

  if (type === 'DISCRETE_MEAN' || type === 'DISCRETE_PID') {
    return {
      In: { x: -25, y: 0, dx: -1, dy: 0 },
      Out: { x: 25, y: 0, dx: 1, dy: 0 }
    };
  }

  if (type === 'PERIODIC_IMP_AVG') {
    return {
      In: { x: -25, y: -10, dx: -1, dy: 0 },
      Trig: { x: -25, y: 10, dx: -1, dy: 0 },
      Out: { x: 25, y: 0, dx: 1, dy: 0 }
    };
  }

  if (type === 'FOURIER_TRANS') {
    return {
      In: { x: -25, y: 0, dx: -1, dy: 0 },
      Mag: { x: 25, y: -10, dx: 1, dy: 0 },
      Phase: { x: 25, y: 10, dx: 1, dy: 0 }
    };
  }

  if (type === 'SIGNAL_SWITCH') {
    return {
      In1: { x: -25, y: -20, dx: -1, dy: 0 },
      Ctrl: { x: -25, y: 0, dx: -1, dy: 0 },
      In2: { x: -25, y: 20, dx: -1, dy: 0 },
      Out: { x: 25, y: 0, dx: 1, dy: 0 }
    };
  }

  if (type === 'COMPARE_TO_CONSTANT' || type === 'MONOFLOP' || type === 'MONOSTABLE') {
    return {
      In: { x: -25, y: 0, dx: -1, dy: 0 },
      Out: { x: 25, y: 0, dx: 1, dy: 0 }
    };
  }

  if (type === 'D_FLIP_FLOP') {
    return {
      D: { x: -25, y: -10, dx: -1, dy: 0 },
      Clk: { x: -25, y: 10, dx: -1, dy: 0 },
      Q: { x: 25, y: -10, dx: 1, dy: 0 },
      Q_bar: { x: 25, y: 10, dx: 1, dy: 0 }
    };
  }

  if (type === 'JK_FLIP_FLOP') {
    return {
      J: { x: -25, y: -12, dx: -1, dy: 0 },
      Clk: { x: -25, y: 0, dx: -1, dy: 0 },
      K: { x: -25, y: 12, dx: -1, dy: 0 },
      Q: { x: 25, y: -10, dx: 1, dy: 0 },
      Q_bar: { x: 25, y: 10, dx: 1, dy: 0 }
    };
  }

  if (type === 'MANUAL_SWITCH') {
    return {
      In1: { x: -25, y: -20, dx: -1, dy: 0 },
      In2: { x: -25, y: 20, dx: -1, dy: 0 },
      Out: { x: 25, y: 0, dx: 1, dy: 0 }
    };
  }

  if (type === 'CONT_PID') {
    return {
      In: { x: -25, y: 0, dx: -1, dy: 0 },
      Out: { x: 25, y: 0, dx: 1, dy: 0 }
    };
  }

  if (type === 'PLL_1PH') {
    return {
      In: { x: -30, y: 0, dx: -1, dy: 0 },
      Theta: { x: 30, y: -15, dx: 1, dy: 0 },
      Freq: { x: 30, y: -5, dx: 1, dy: 0 },
      Cos: { x: 30, y: 5, dx: 1, dy: 0 },
      Sin: { x: 30, y: 15, dx: 1, dy: 0 }
    };
  }

  if (type === 'PLL_3PH') {
    return {
      Va: { x: -30, y: -10, dx: -1, dy: 0 },
      Vb: { x: -30, y: 0, dx: -1, dy: 0 },
      Vc: { x: -30, y: 10, dx: -1, dy: 0 },
      Theta: { x: 30, y: -15, dx: 1, dy: 0 },
      Freq: { x: 30, y: -5, dx: 1, dy: 0 },
      Cos: { x: 30, y: 5, dx: 1, dy: 0 },
      Sin: { x: 30, y: 15, dx: 1, dy: 0 }
    };
  }

  if (type === 'SUM_ROUND' || type === 'SUM_RECT' || type === 'SUBTRACT') {
    return {
      A: { x: -20, y: -20, dx: -1, dy: 0 },
      B: { x: -20, y: 20, dx: -1, dy: 0 },
      Out: { x: 20, y: 0, dx: 1, dy: 0 }
    };
  }

  if (type === 'PRODUCT_RECT') {
    return {
      In1: { x: -20, y: -20, dx: -1, dy: 0 },
      In2: { x: -20, y: 20, dx: -1, dy: 0 },
      Out: { x: 20, y: 0, dx: 1, dy: 0 }
    };
  }

  if (type === 'SIGNUM' || type === 'DATATYPE_CONV') {
    return {
      In: { x: -20, y: 0, dx: -1, dy: 0 },
      Out: { x: 20, y: 0, dx: 1, dy: 0 }
    };
  }

  if (type === 'DIVIDE') {
    return {
      Num: { x: -20, y: -20, dx: -1, dy: 0 },
      Den: { x: -20, y: 20, dx: -1, dy: 0 },
      Out: { x: 20, y: 0, dx: 1, dy: 0 }
    };
  }

  if (type === 'OPAMP' || type === 'E_COMP') {
    return {
      Plus: { x: -25, y: -10, dx: -1, dy: 0 },
      Minus: { x: -25, y: 10, dx: -1, dy: 0 },
      Out: { x: 25, y: 0, dx: 1, dy: 0 }
    };
  }

  if (type === 'DBL_SWITCH' || type === 'MAN_SWITCH') {
    return {
      Common: { x: -20, y: 0, dx: -1, dy: 0 },
      A: { x: 20, y: -20, dx: 1, dy: 0 },
      B: { x: 20, y: 20, dx: 1, dy: 0 }
    };
  }

  if (type === 'MAN_DBL_SWITCH') {
    return {
      A1: { x: -8, y: -30, dx: 0, dy: -1 },
      B1: { x: 8, y: -30, dx: 0, dy: -1 },
      A2: { x: -8, y: 30, dx: 0, dy: 1 },
      B2: { x: 8, y: 30, dx: 0, dy: 1 }
    };
  }

  if (type === 'MAN_TRPL_SWITCH' || type === 'TRPL_SWITCH') {
    const pins: Record<string, any> = {
      A1: { x: -12, y: -30, dx: 0, dy: -1 },
      B1: { x: 0, y: -30, dx: 0, dy: -1 },
      C1: { x: 12, y: -30, dx: 0, dy: -1 },
      A2: { x: -12, y: 30, dx: 0, dy: 1 },
      B2: { x: 0, y: 30, dx: 0, dy: 1 },
      C2: { x: 12, y: 30, dx: 0, dy: 1 }
    };
    if (type === 'TRPL_SWITCH') {
      pins['Ctrl'] = { x: -20, y: 0, dx: -1, dy: 0 };
    }
    return pins;
  }

  if (['IDEAL_XFMR', 'XFMR_2W', 'MUTUAL_2W', 'SAT_XFMR'].includes(type)) {
    return {
      P1: { x: -20, y: -15, dx: -1, dy: 0 },
      P2: { x: -20, y: 15, dx: -1, dy: 0 },
      S1: { x: 20, y: -15, dx: 1, dy: 0 },
      S2: { x: 20, y: 15, dx: 1, dy: 0 }
    };
  }

  if (['XFMR_3W', 'MUTUAL_3W'].includes(type)) {
    return {
      P1: { x: -20, y: -20, dx: -1, dy: 0 },
      P2: { x: -20, y: 20, dx: -1, dy: 0 },
      S1_1: { x: 20, y: -25, dx: 1, dy: 0 },
      S1_2: { x: 20, y: -5, dx: 1, dy: 0 },
      S2_1: { x: 20, y: 5, dx: 1, dy: 0 },
      S2_2: { x: 20, y: 25, dx: 1, dy: 0 }
    };
  }

  if (type === 'XFMR_3PH_3W') {
    return {
      A: { x: -25, y: -15, dx: -1, dy: 0 },
      B: { x: -25, y: 0, dx: -1, dy: 0 },
      C: { x: -25, y: 15, dx: -1, dy: 0 },
      a: { x: 25, y: -15, dx: 1, dy: 0 },
      b: { x: 25, y: 0, dx: 1, dy: 0 },
      c: { x: 25, y: 15, dx: 1, dy: 0 },
      a3: { x: 0, y: 25, dx: 0, dy: 1 },
      b3: { x: -10, y: 25, dx: 0, dy: 1 },
      c3: { x: 10, y: 25, dx: 0, dy: 1 }
    };
  }

  if (type === 'CLARKE') {
    return {
      A: { x: -25, y: -15, dx: -1, dy: 0 },
      B: { x: -25, y: 0, dx: -1, dy: 0 },
      C: { x: -25, y: 15, dx: -1, dy: 0 },
      Alpha: { x: 25, y: -10, dx: 1, dy: 0 },
      Beta: { x: 25, y: 10, dx: 1, dy: 0 }
    };
  }

  if (type === 'PARK') {
    return {
      Alpha: { x: -25, y: -15, dx: -1, dy: 0 },
      Beta: { x: -25, y: 0, dx: -1, dy: 0 },
      Theta: { x: -25, y: 15, dx: -1, dy: 0 },
      d: { x: 25, y: -10, dx: 1, dy: 0 },
      q: { x: 25, y: 10, dx: 1, dy: 0 }
    };
  }

  if (type === 'INV_CLARKE') {
    return {
      Alpha: { x: -25, y: -10, dx: -1, dy: 0 },
      Beta: { x: -25, y: 10, dx: -1, dy: 0 },
      A: { x: 25, y: -15, dx: 1, dy: 0 },
      B: { x: 25, y: 0, dx: 1, dy: 0 },
      C: { x: 25, y: 15, dx: 1, dy: 0 }
    };
  }

  if (type === 'INV_PARK') {
    return {
      d: { x: -25, y: -15, dx: -1, dy: 0 },
      q: { x: -25, y: 0, dx: -1, dy: 0 },
      Theta: { x: -25, y: 15, dx: -1, dy: 0 },
      Alpha: { x: 25, y: -10, dx: 1, dy: 0 },
      Beta: { x: 25, y: 10, dx: 1, dy: 0 }
    };
  }

  if (type === 'V_3PH' || type === 'I_3PH' || type === 'VM_3PH' || type === 'AM_3PH') {
    return {
      A: { x: -25, y: -15, dx: -1, dy: 0 },
      B: { x: -25, y: 0, dx: -1, dy: 0 },
      C: { x: -25, y: 15, dx: -1, dy: 0 }
    };
  }

  if (type === 'LINE_3PH' || type === 'XFMR_3PH_2W') {
    return {
      A: { x: -25, y: -15, dx: -1, dy: 0 },
      B: { x: -25, y: 0, dx: -1, dy: 0 },
      C: { x: -25, y: 15, dx: -1, dy: 0 },
      a: { x: 25, y: -15, dx: 1, dy: 0 },
      b: { x: 25, y: 0, dx: 1, dy: 0 },
      c: { x: 25, y: 15, dx: 1, dy: 0 }
    };
  }

  if (type === 'IC_555') {
    return {
      GND: { x: -25, y: -30, dx: -1, dy: 0 },
      TRIG: { x: -25, y: -10, dx: -1, dy: 0 },
      OUT: { x: -25, y: 10, dx: -1, dy: 0 },
      RESET: { x: -25, y: 30, dx: -1, dy: 0 },
      CTRL: { x: 25, y: 30, dx: 1, dy: 0 },
      THR: { x: 25, y: 10, dx: 1, dy: 0 },
      DIS: { x: 25, y: -10, dx: 1, dy: 0 },
      VCC: { x: 25, y: -30, dx: 1, dy: 0 }
    };
  }

  if (type === 'IC_LM7805') {
    return {
      IN: { x: -20, y: -20, dx: -1, dy: 0 },
      GND: { x: 0, y: 20, dx: 0, dy: 1 },
      OUT: { x: 20, y: -20, dx: 1, dy: 0 }
    };
  }

  if (type === 'IC_LM317') {
    return {
      IN: { x: -20, y: -20, dx: -1, dy: 0 },
      ADJ: { x: 0, y: 20, dx: 0, dy: 1 },
      OUT: { x: 20, y: -20, dx: 1, dy: 0 }
    };
  }

  if (type === 'IC_PC817') {
    return {
      Anode: { x: -25, y: -15, dx: -1, dy: 0 },
      Cathode: { x: -25, y: 15, dx: -1, dy: 0 },
      Emitter: { x: 25, y: 15, dx: 1, dy: 0 },
      Collector: { x: 25, y: -15, dx: 1, dy: 0 }
    };
  }

  if (['IC_7400', 'IC_7408', 'IC_7432'].includes(type)) {
    return {
      "1A": { x: -25, y: -45, dx: -1, dy: 0 },
      "1B": { x: -25, y: -30, dx: -1, dy: 0 },
      "1Y": { x: -25, y: -15, dx: -1, dy: 0 },
      "2A": { x: -25, y: 0, dx: -1, dy: 0 },
      "2B": { x: -25, y: 15, dx: -1, dy: 0 },
      "2Y": { x: -25, y: 30, dx: -1, dy: 0 },
      "GND": { x: -25, y: 45, dx: -1, dy: 0 },
      "3Y": { x: 25, y: 45, dx: 1, dy: 0 },
      "3A": { x: 25, y: 30, dx: 1, dy: 0 },
      "3B": { x: 25, y: 15, dx: 1, dy: 0 },
      "4Y": { x: 25, y: 0, dx: 1, dy: 0 },
      "4A": { x: 25, y: -15, dx: 1, dy: 0 },
      "4B": { x: 25, y: -30, dx: 1, dy: 0 },
      "VCC": { x: 25, y: -45, dx: 1, dy: 0 }
    };
  }

  if (type === 'IC_7404') {
    return {
      "1A": { x: -25, y: -45, dx: -1, dy: 0 },
      "1Y": { x: -25, y: -30, dx: -1, dy: 0 },
      "2A": { x: -25, y: -15, dx: -1, dy: 0 },
      "2Y": { x: -25, y: 0, dx: -1, dy: 0 },
      "3A": { x: -25, y: 15, dx: -1, dy: 0 },
      "3Y": { x: -25, y: 30, dx: -1, dy: 0 },
      "GND": { x: -25, y: 45, dx: -1, dy: 0 },
      "4Y": { x: 25, y: 45, dx: 1, dy: 0 },
      "4A": { x: 25, y: 30, dx: 1, dy: 0 },
      "5Y": { x: 25, y: 15, dx: 1, dy: 0 },
      "5A": { x: 25, y: 0, dx: 1, dy: 0 },
      "6Y": { x: 25, y: -15, dx: 1, dy: 0 },
      "6A": { x: 25, y: -30, dx: 1, dy: 0 },
      "VCC": { x: 25, y: -45, dx: 1, dy: 0 }
    };
  }

  // Fallback categorization mapping
  if (libComp.category === 'electrical') {
    if (type.includes('MOSFET') || type.includes('IGBT') || type === 'GTO' || type === 'THYRISTOR' || type === 'BJT' || type === 'JFET' || type === 'IGCT') {
      const isBJT = type === 'BJT';
      const isJFET = type === 'JFET';
      return {
        [isBJT ? 'C' : (isJFET ? 'D' : 'D')]: { x: 0, y: -30, dx: 0, dy: -1 },
        [isBJT ? 'E' : (isJFET ? 'S' : 'S')]: { x: 0, y: 30, dx: 0, dy: 1 },
        [isBJT ? 'B' : 'G']: { x: -20, y: 0, dx: -1, dy: 0 }
      };
    }
    if (type.includes('VAR_') || type.includes('SAT_') || type.includes('CTRL_') || type.includes('BREAKER') || type.includes('SR_')) {
      return {
        A: { x: 0, y: -30, dx: 0, dy: -1 },
        B: { x: 0, y: 30, dx: 0, dy: 1 },
        Ctrl: { x: -20, y: 0, dx: -1, dy: 0 }
      };
    }
    // Default 2-terminal electrical
    return {
      A: { x: 0, y: -30, dx: 0, dy: -1 },
      B: { x: 0, y: 30, dx: 0, dy: 1 }
    };
  }

  // General & Control
  if ((libComp.subcategory === 'Sources' && type !== 'INIT_COND') || libComp.subcategory === 'Ports and Subsystems' && type.includes('INPORT')) {
    return {
      Out: { x: 25, y: 0, dx: 1, dy: 0 }
    };
  }

  const twoInputSubcategories = ['Logical & Bitwise', 'Discontinuous', 'Functions & Tables'];
  const twoInputTypes = ['SUM', 'PROD', 'COMP', 'MIN_MAX', 'TRIG_FCN', 'MATH_FCN', 'LOGIC_OP', 'BITWISE_OP'];
  if (twoInputSubcategories.includes(libComp.subcategory) || twoInputTypes.includes(type)) {
    // Check for single input exceptions
    if (['ABS', 'SIGN', 'ROUND', 'NOT', 'QUANTIZER', 'HIT_CROSSING'].includes(type)) {
      return {
        In: { x: -25, y: 0, dx: -1, dy: 0 },
        Out: { x: 25, y: 0, dx: 1, dy: 0 }
      };
    }
    return {
      In1: { x: -25, y: -10, dx: -1, dy: 0 },
      In2: { x: -25, y: 10, dx: -1, dy: 0 },
      Out: { x: 25, y: 0, dx: 1, dy: 0 }
    };
  }

  // Default 1-in 1-out control/general
  return {
    In: { x: -25, y: 0, dx: -1, dy: 0 },
    Out: { x: 25, y: 0, dx: 1, dy: 0 }
  };
}

export function getDetailedComponentSVG(comp: any): string | null {
  const type = comp.type;
  const id = comp.id;
  const rotation = comp.rotation;

  if (type === 'SUBSYSTEM') {
    const subschematic = comp.sub_schematic || { components: [] };
    const inports = (subschematic.components || [])
      .filter((c: any) => c.type === 'INPORT')
      .sort((a: any, b: any) => (a.y ?? 0) - (b.y ?? 0));
    const outports = (subschematic.components || [])
      .filter((c: any) => c.type === 'OUTPORT')
      .sort((a: any, b: any) => (a.y ?? 0) - (b.y ?? 0));
    const eports = (subschematic.components || [])
      .filter((c: any) => c.type === 'E_PORT')
      .sort((a: any, b: any) => (a.x ?? 0) - (b.x ?? 0));

    const numLeft = inports.length;
    const numRight = outports.length;
    const numBottom = eports.length;

    const width = Math.max(60, numBottom * 40 + 20);
    const height = Math.max(50, Math.max(numLeft, numRight) * 20 + 20);

    const halfW = width / 2;
    const halfH = height / 2;

    const isLightMode = typeof document !== 'undefined' && document.querySelector('.light-mode') !== null;
    let borderColor = isLightMode ? '#0284c7' : '#0ea5e9'; // sky border
    let fillColor = isLightMode ? '#f8fafc' : '#0f172a'; // slate light/dark fill
    let symbolColor = isLightMode ? '#0369a1' : '#38bdf8'; // sky symbol

    let pinsSVG = '';
    
    // Left signal ports (triangles pointing in)
    inports.forEach((ip: any, idx: number) => {
      const yOffset = - (numLeft - 1) * 10 + idx * 20;
      pinsSVG += `
        <polygon points="-${halfW},${yOffset-4} -${halfW+6},${yOffset} -${halfW},${yOffset+4}" fill="${symbolColor}" />
        <text x="-${halfW-8}" y="${yOffset+3}" font-family="Inter, sans-serif" font-size="7.5" font-weight="700" fill="${symbolColor}" text-anchor="start">${ip.id.split('.').pop()}</text>
      `;
    });

    // Right signal ports (triangles pointing out)
    outports.forEach((op: any, idx: number) => {
      const yOffset = - (numRight - 1) * 10 + idx * 20;
      pinsSVG += `
        <polygon points="${halfW-6},${yOffset-4} ${halfW},${yOffset} ${halfW-6},${yOffset+4}" fill="${symbolColor}" />
        <text x="${halfW-8}" y="${yOffset+3}" font-family="Inter, sans-serif" font-size="7.5" font-weight="700" fill="${symbolColor}" text-anchor="end">${op.id.split('.').pop()}</text>
      `;
    });

    // Bottom electrical ports (circles with vertical text labels to prevent horizontal overlap)
    eports.forEach((ep: any, idx: number) => {
      const xOffset = - (numBottom - 1) * 20 + idx * 40;
      pinsSVG += `
        <circle cx="${xOffset}" cy="${halfH}" r="4" fill="none" stroke="${symbolColor}" stroke-width="2" />
        <text x="${xOffset + 3}" y="${halfH - 8}" transform="rotate(-90, ${xOffset + 3}, ${halfH - 8})" font-family="Inter, sans-serif" font-size="7.5" font-weight="700" fill="${symbolColor}" text-anchor="start">${ep.id.split('.').pop()}</text>
      `;
    });

    const iconSVG = `
      <g opacity="0.3" transform="translate(0, -2)">
        <rect x="-12" y="-12" width="16" height="16" rx="2" fill="none" stroke="${symbolColor}" stroke-width="2" />
        <rect x="-4" y="-4" width="16" height="16" rx="2" fill="${fillColor}" stroke="${symbolColor}" stroke-width="2" />
      </g>
    `;

    return `
      <rect x="-${halfW}" y="-${halfH}" width="${width}" height="${height}" rx="6" fill="${fillColor}" stroke="${borderColor}" stroke-width="2.5" />
      ${iconSVG}
      ${pinsSVG}
      <g transform="translate(0, -${halfH + 14}) rotate(${-rotation})">
        <text class="comp-label" x="0" y="4" text-anchor="middle" font-family="Inter, sans-serif" font-size="11" font-weight="bold" fill="currentColor">${id}</text>
      </g>
    `;
  }

  const libComp = DETAILED_COMPONENTS.find(c => c.type === type);
  if (!libComp) return null;

  // Basic components should use their existing custom SVGs
  const basicTypes = ['R', 'L', 'C', 'S', 'D', 'MOSFET', 'V', 'I', 'AC_V', 'XFMR', 'VM', 'AM', 'CONST', 'GAIN', 'PID', 'SUM', 'PWM', 'TRI', 'COMP', 'AND', 'OR', 'NOT', 'FCN', 'PROD', 'MUX', 'DEMUX', 'CSCRIPT', 'PROBE', 'SCOPE', 'GEN_EBLOCK', 'GND'];
  if (basicTypes.includes(type)) return null;

  if (type === 'GOTO_SIG') {
    const tag = comp.parameters?.tag ?? 'A';
    const isLightMode = typeof document !== 'undefined' && document.querySelector('.light-mode') !== null;
    let fillColor = isLightMode ? '#ffffff' : '#090d16'; // white vs deep slate
    const textWidth = Math.max(15, tag.length * 6);
    const boundsW = 25 + textWidth;
    return `
      <rect class="comp-bounds" x="-18" y="-15" width="${boundsW}" height="30" rx="4" />
      <polygon points="-15,-10 5,0 -15,10" class="comp-path" fill="${fillColor}" />
      <g transform="translate(10, 0) rotate(${-rotation})">
        <text x="0" y="3.5" font-family="Inter, sans-serif" font-size="9" font-weight="700" fill="currentColor" text-anchor="start">${tag}</text>
      </g>
    `;
  }

  if (type === 'FROM_SIG') {
    const tag = comp.parameters?.tag ?? 'A';
    const isLightMode = typeof document !== 'undefined' && document.querySelector('.light-mode') !== null;
    let fillColor = isLightMode ? '#ffffff' : '#090d16'; // white vs deep slate
    const textWidth = Math.max(15, tag.length * 6);
    const boundsW = 25 + textWidth;
    const boundsX = -boundsW + 18;
    return `
      <rect class="comp-bounds" x="${boundsX}" y="-15" width="${boundsW}" height="30" rx="4" />
      <polygon points="-5,-10 15,0 -5,10" class="comp-path" fill="${fillColor}" />
      <g transform="translate(-10, 0) rotate(${-rotation})">
        <text x="0" y="3.5" font-family="Inter, sans-serif" font-size="9" font-weight="700" fill="currentColor" text-anchor="end">${tag}</text>
      </g>
    `;
  }

  if (type === 'SUM_ROUND') {
    const isLightMode = typeof document !== 'undefined' && document.querySelector('.light-mode') !== null;
    let borderColor = isLightMode ? '#059669' : '#10b981'; // emerald-600 vs emerald-500
    let fillColor = isLightMode ? '#ffffff' : '#090d16'; // white vs deep slate
    let symbolColor = isLightMode ? '#047857' : '#34d399'; // emerald-700 vs emerald-400

    const numInputs = parseInt(comp.parameters && comp.parameters.inputs) || 2;
    const radius = Math.max(16, (numInputs - 1) * 10 + 5);
    const signs = comp.parameters && comp.parameters.signs ? comp.parameters.signs : '++';

    let signsSVG = '';
    for (let i = 0; i < numInputs; i++) {
      const y = - (numInputs - 1) * 10 + i * 20;
      const x = - Math.sqrt(Math.max(0, radius * radius - y * y));
      const sign = signs[i] ?? '+';
      signsSVG += `<text x="${x + 8}" y="${y + 3}" font-family="Inter, sans-serif" font-size="7" font-weight="900" fill="${symbolColor}" text-anchor="middle">${sign}</text>`;
    }

    return `
      <rect class="comp-bounds" x="-${radius + 6}" y="-${radius + 6}" width="${radius * 2 + 12}" height="${radius * 2 + 12}" rx="${radius + 6}" />
      <circle cx="0" cy="0" r="${radius}" fill="${fillColor}" fill-opacity="0.85" stroke="${borderColor}" stroke-width="2" />
      ${signsSVG}
      <!-- Center symbol -->
      <text x="3" y="3.5" font-family="Inter, sans-serif" font-size="9" font-weight="700" fill="${symbolColor}" text-anchor="middle">Σ</text>
      <g transform="translate(0, ${radius + 12}) rotate(${-rotation})">
        <text class="comp-label" x="0" y="4" text-anchor="middle" fill="currentColor">${id}</text>
      </g>
    `;
  }

  if (type === 'SUM_RECT' || type === 'PRODUCT_RECT') {
    const isLightMode = typeof document !== 'undefined' && document.querySelector('.light-mode') !== null;
    let borderColor = isLightMode ? '#059669' : '#10b981'; // emerald-600 vs emerald-500
    let fillColor = isLightMode ? '#ffffff' : '#090d16'; // white vs deep slate
    let symbolColor = isLightMode ? '#047857' : '#34d399'; // emerald-700 vs emerald-400

    const numInputs = parseInt(comp.parameters && comp.parameters.inputs) || 2;
    const width = 50;
    const height = Math.max(40, numInputs * 20);
    const halfW = width / 2;
    const halfH = height / 2;

    let signsSVG = '';
    if (type === 'SUM_RECT') {
      const signs = comp.parameters && comp.parameters.signs ? comp.parameters.signs : '++';
      for (let i = 0; i < numInputs; i++) {
        const y = - (numInputs - 1) * 10 + i * 20;
        const sign = signs[i] ?? '+';
        signsSVG += `<text x="-${halfW - 8}" y="${y + 3}" font-family="Inter, sans-serif" font-size="7" font-weight="900" fill="${symbolColor}" text-anchor="middle">${sign}</text>`;
      }
    } else {
      const operators = comp.parameters && comp.parameters.operators ? comp.parameters.operators : '**';
      for (let i = 0; i < numInputs; i++) {
        const y = - (numInputs - 1) * 10 + i * 20;
        const op = operators[i] ?? '*';
        const displayOp = op === '/' ? '÷' : '×';
        signsSVG += `<text x="-${halfW - 8}" y="${y + 3.5}" font-family="Inter, sans-serif" font-size="8" font-weight="900" fill="${symbolColor}" text-anchor="middle">${displayOp}</text>`;
      }
    }

    const centerSymbol = type === 'SUM_RECT'
      ? `<text x="2" y="3.5" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="${symbolColor}" text-anchor="middle">Σ</text>`
      : `<text x="2" y="5" font-family="Inter, sans-serif" font-size="14" font-weight="700" fill="${symbolColor}" text-anchor="middle">×</text>`;

    return `
      <rect class="comp-bounds" x="-${halfW + 2}" y="-${halfH + 2}" width="${width + 4}" height="${height + 4}" rx="6" />
      <rect x="-${halfW}" y="-${halfH}" width="${width}" height="${height}" rx="5" fill="${fillColor}" fill-opacity="0.85" stroke="${borderColor}" stroke-width="2" />
      <!-- Top category line strip -->
      <line x1="-${halfW - 5}" y1="-${halfH}" x2="${halfW - 5}" y2="-${halfH}" stroke="${symbolColor}" stroke-width="2" stroke-linecap="round" />
      <!-- Badge category indicator -->
      <text x="-${halfW - 6}" y="-${halfH - 5}" font-family="Inter, sans-serif" font-size="6" font-weight="900" fill="${symbolColor}" opacity="0.6" stroke="none">CTRL</text>
      <!-- CTRL pin label near the handle -->
      <text x="-${halfW - 3}" y="-${halfH - 8}" font-family="Inter, sans-serif" font-size="5.5" font-weight="800" fill="${symbolColor}" opacity="0.8" text-anchor="start">CTRL</text>
      ${signsSVG}
      ${centerSymbol}
      <g transform="translate(0, ${halfH + 12}) rotate(${-rotation})">
        <text class="comp-label" x="0" y="4" text-anchor="middle" fill="currentColor">${id}</text>
      </g>
    `;
  }

  // Check for electrical schematic custom symbol override
  if (libComp.category === 'electrical') {
    let shape = '';
    let boundsX = -22;
    let boundsY = -32;
    let boundsW = 44;
    let boundsH = 64;
    let labelY = 38;

    switch (type) {
      case 'E_PORT':
        shape = `
          <path class="comp-path" d="M 0,-30 L 0,-10" />
          <circle cx="0" cy="0" r="10" class="comp-path" />
          <text x="0" y="3" font-family="Inter, sans-serif" font-size="8" font-weight="700" fill="currentColor" text-anchor="middle">P</text>
        `;
        break;
      case 'E_LABEL':
        shape = `
          <path class="comp-path" d="M 0,-30 L 0,-8" />
          <polygon points="-16,-8 10,-8 16,0 10,8 -16,8" class="comp-path" />
          <text x="-2" y="2.5" font-family="Inter, sans-serif" font-size="7" font-weight="700" fill="currentColor" text-anchor="middle">TAG</text>
        `;
        break;
      case 'AC_I':
        shape = `
          <circle cx="0" cy="0" r="15" class="comp-path" />
          <path class="comp-path" d="M 0,-30 L 0,-15 M 0,15 L 0,30" />
          <path class="comp-path" d="M 0,-8 L 0,8 M -3,3 L 0,8 L 3,3" />
          <path class="comp-path" d="M 5,-4 C 7,-8 7,0 9,-4 C 9,-8 11,-8 11,-4" stroke-width="1.2" />
        `;
        break;
      case 'CTRL_V':
        shape = `
          <polygon points="0,-16 16,0 0,16 -16,0" class="comp-path" />
          <path class="comp-path" d="M 0,-30 L 0,-16 M 0,16 L 0,30" />
          <path class="comp-path" d="M 0,-9 L 0,-5 M -2,-7 L 2,-7" />
          <path class="comp-path" d="M -2,7 L 2,7" />
          <path class="comp-path" d="M -20,0 L -12,0" />
          <polygon points="-16,-3 -12,0 -16,3" fill="currentColor" />
        `;
        break;
      case 'CTRL_I':
        shape = `
          <polygon points="0,-16 16,0 0,16 -16,0" class="comp-path" />
          <path class="comp-path" d="M 0,-30 L 0,-16 M 0,16 L 0,30" />
          <path class="comp-path" d="M 0,-8 L 0,8 M -3,3 L 0,8 L 3,3" />
          <path class="comp-path" d="M -20,0 L -12,0" />
          <polygon points="-16,-3 -12,0 -16,3" fill="currentColor" />
        `;
        break;
      case 'V_3PH':
        boundsX = -27; boundsW = 54; boundsY = -22; boundsH = 44; labelY = 28;
        shape = `
          <rect x="-16" y="-20" width="32" height="40" rx="3" class="comp-path" />
          <path class="comp-path" d="M -25,-15 L -16,-15 M -25,0 L -16,0 M -25,15 L -16,15" />
          <text x="0" y="5" font-family="Inter, sans-serif" font-size="14" font-weight="700" fill="currentColor" text-anchor="middle">3~</text>
        `;
        break;
      case 'I_3PH':
        boundsX = -27; boundsW = 54; boundsY = -22; boundsH = 44; labelY = 28;
        shape = `
          <rect x="-16" y="-20" width="32" height="40" rx="3" class="comp-path" />
          <path class="comp-path" d="M -25,-15 L -16,-15 M -25,0 L -16,0 M -25,15 L -16,15" />
          <circle cx="-4" cy="-10" r="5" class="comp-path" />
          <circle cx="-4" cy="0" r="5" class="comp-path" />
          <circle cx="-4" cy="10" r="5" class="comp-path" />
          <path class="comp-path" d="M -4,-12 L -4,-8 M -6,-10 L -4,-8 L -2,-10" />
          <path class="comp-path" d="M -4,-2 L -4,2 M -6,0 L -4,2 L -2,0" />
          <path class="comp-path" d="M -4,8 L -4,12 M -6,10 L -4,12 L -2,10" />
          <text x="8" y="3.5" font-family="Inter, sans-serif" font-size="10" font-weight="700" fill="currentColor">3~</text>
        `;
        break;
      case 'VM_3PH':
        boundsX = -27; boundsW = 54; boundsY = -22; boundsH = 44; labelY = 28;
        shape = `
          <rect x="-16" y="-20" width="32" height="40" rx="3" class="comp-path" />
          <path class="comp-path" d="M -25,-15 L -16,-15 M -25,0 L -16,0 M -25,15 L -16,15" />
          <text x="0" y="3" font-family="Inter, sans-serif" font-size="14" font-weight="700" fill="currentColor" text-anchor="middle">V</text>
          <text x="0" y="14" font-family="Inter, sans-serif" font-size="8" font-weight="700" fill="currentColor" text-anchor="middle">3φ</text>
        `;
        break;
      case 'AM_3PH':
        boundsX = -27; boundsW = 54; boundsY = -22; boundsH = 44; labelY = 28;
        shape = `
          <rect x="-16" y="-20" width="32" height="40" rx="3" class="comp-path" />
          <path class="comp-path" d="M -25,-15 L -16,-15 M -25,0 L -16,0 M -25,15 L -16,15" />
          <text x="0" y="3" font-family="Inter, sans-serif" font-size="14" font-weight="700" fill="currentColor" text-anchor="middle">A</text>
          <text x="0" y="14" font-family="Inter, sans-serif" font-size="8" font-weight="700" fill="currentColor" text-anchor="middle">3φ</text>
        `;
        break;
      case 'VAR_R':
        shape = `
          <path class="comp-path" d="M 0,-30 L 0,-15 L -6,-12 L 6,-9 L -6,-6 L 6,-3 L -6,0 L 6,3 L -6,6 L 6,9 L 0,12 L 0,30" />
          <path class="comp-path" d="M -20,0 L -8,0" />
          <path class="comp-path" d="M -10,12 L 10,-12 M 5,-12 L 10,-12 L 10,-7" />
        `;
        break;
      case 'VAR_L':
        shape = `
          <path class="comp-path" d="M 0,-30 L 0,-15 C -8,-15 -8,-8 0,-8 C -8,-8 -8,-1 0,-1 C -8,-1 -8,6 0,6 C -8,6 -8,13 0,13 L 0,30" />
          <path class="comp-path" d="M -20,0 L -8,0" />
          <path class="comp-path" d="M -10,12 L 10,-12 M 5,-12 L 10,-12 L 10,-7" />
        `;
        break;
      case 'VAR_C':
        shape = `
          <path class="comp-path" d="M 0,-30 L 0,-4 M -12,-4 L 12,-4 M -12,4 L 12,4 M 0,4 L 0,30" />
          <path class="comp-path" d="M -20,0 L -8,0" />
          <path class="comp-path" d="M -10,12 L 10,-12 M 5,-12 L 10,-12 L 10,-7" />
        `;
        break;
      case 'SAT_L':
        shape = `
          <path class="comp-path" d="M 0,-30 L 0,-15 C -8,-15 -8,-8 0,-8 C -8,-8 -8,-1 0,-1 C -8,-1 -8,6 0,6 C -8,6 -8,13 0,13 L 0,30" />
          <path class="comp-path" d="M -20,0 L -8,0" />
          <line x1="4" y1="-12" x2="4" y2="12" class="comp-path" stroke-width="1.2" />
          <line x1="7" y1="-12" x2="7" y2="12" class="comp-path" stroke-width="1.2" />
        `;
        break;
      case 'SAT_C':
        shape = `
          <path class="comp-path" d="M 0,-30 L 0,-4 M -12,-4 L 12,-4 M -12,4 C -6,1 6,1 12,4 M 0,4 L 0,30" />
          <path class="comp-path" d="M -20,0 L -8,0" />
          <text x="12" y="10" font-family="Inter, sans-serif" font-size="7" font-weight="700" fill="currentColor">sat</text>
        `;
        break;
      case 'PI_SECTION':
        boundsX = -18; boundsW = 36;
        shape = `
          <path class="comp-path" d="M 0,-30 L 0,-15 M 0,15 L 0,30 M -12,-15 L 12,-15 M -12,15 L 12,15" />
          <path class="comp-path" d="M 0,-15 L 0,-6 L -4,-3 L 4,0 L -4,3 L 4,6 L 0,9 L 0,15" />
          <path class="comp-path" d="M -10,-15 L -10,-3 M -14,-3 L -6,-3 M -14,3 L -6,3 M -10,3 L -10,15" />
          <path class="comp-path" d="M 10,-15 L 10,-3 M 6,-3 L 14,-3 M 6,3 L 14,3 M 10,3 L 10,15" />
        `;
        break;
      case 'LINE_3PH':
        boundsX = -27; boundsW = 54; boundsY = -22; boundsH = 44; labelY = 28;
        shape = `
          <path class="comp-path" d="M -25,-15 L 25,-15 M -25,0 L 25,0 M -25,15 L 25,15" />
          <rect x="-8" y="-18" width="16" height="6" rx="1" class="comp-path" />
          <rect x="-8" y="-3" width="16" height="6" rx="1" class="comp-path" />
          <rect x="-8" y="12" width="16" height="6" rx="1" class="comp-path" />
        `;
        break;
      case 'PWL_R':
        shape = `
          <path class="comp-path" d="M 0,-30 L 0,-15 L -6,-12 L 6,-9 L -6,-6 L 6,-3 L -6,0 L 6,3 L -6,6 L 6,9 L 0,12 L 0,30" />
          <path d="M 8,5 L 8,-5 L 14,-5 M 8,-3 L 11,-3 L 14,3" class="comp-path" stroke-width="1.2" />
        `;
        break;
      case 'E_ALGEBRAIC':
        shape = `
          <rect x="-16" y="-16" width="32" height="32" rx="4" class="comp-path" />
          <path class="comp-path" d="M 0,-30 L 0,-16 M 0,16 L 0,30" />
          <text x="0" y="4" font-family="Times New Roman, Georgia, serif" font-size="12" font-style="italic" font-weight="700" fill="currentColor" text-anchor="middle">f(v,i)</text>
        `;
        break;
      case 'THYRISTOR':
        shape = `
          <path class="comp-path" d="M 0,-30 L 0,-10" />
          <polygon points="-12,-10 12,-10 0,10" class="comp-path" />
          <polygon points="-12,-10 12,-10 0,10" class="comp-fill" />
          <path class="comp-path" d="M -12,10 L 12,10 M 0,10 L 0,30" />
          <path class="comp-path" d="M -20,0 L -8,0 L -4,8" />
        `;
        break;
      case 'GTO':
        shape = `
          <path class="comp-path" d="M 0,-30 L 0,-10" />
          <polygon points="-12,-10 12,-10 0,10" class="comp-path" />
          <polygon points="-12,-10 12,-10 0,10" class="comp-fill" />
          <path class="comp-path" d="M -12,10 L 12,10 M 0,10 L 0,30" />
          <path class="comp-path" d="M -20,0 L -8,0 L -4,8 M -14,-4 L -10,4" />
        `;
        break;
      case 'IGBT':
        shape = `
          <path class="comp-path" d="M 0,-30 L 0,-10 L -6,-5 M 0,30 L 0,10 L -6,5 M -6,-15 L -6,15 M -10,-12 L -10,12 M -20,0 L -10,0" />
          <path class="comp-path" d="M -4,7 L -6,5 L -2,4" />
        `;
        break;
      case 'IGBT_DIODE':
        shape = `
          <path class="comp-path" d="M -4,-30 L -4,-10 L -10,-5 M -4,30 L -4,10 L -10,5 M -10,-15 L -10,15 M -14,-12 L -14,12 M -20,0 L -14,0" />
          <path class="comp-path" d="M -8,7 L -10,5 L -6,4" />
          <path class="comp-path" d="M -4,-20 L 8,-20 L 8,-8 M 8,8 L 8,20 L -4,20" />
          <polygon points="2,6 14,6 8,-6" class="comp-path" />
          <polygon points="2,6 14,6 8,-6" class="comp-fill" />
          <path class="comp-path" d="M 2,-6 L 14,-6" />
        `;
        break;
      case 'IGCT':
        shape = `
          <path class="comp-path" d="M 0,-30 L 0,-10" />
          <polygon points="-12,-10 12,-10 0,10" class="comp-path" />
          <polygon points="-12,-10 12,-10 0,10" class="comp-fill" />
          <path class="comp-path" d="M -12,10 L 12,10 M 0,10 L 0,30" />
          <path class="comp-path" d="M -20,0 L -8,0 L -4,8" />
          <rect x="-17" y="-4" width="6" height="8" rx="1" fill="currentColor" />
        `;
        break;
      case 'MOSFET_DIODE':
        shape = `
          <path class="comp-path" d="M -4,-30 L -4,-15 M -4,15 L -4,30 M -8,-15 L -8,15 M -8,0 L -4,0 M -4,-15 L -4,-10 M -4,15 L -4,10 M -12,-15 L -12,15 M -20,0 L -12,0" />
          <path class="comp-path" d="M -4,-15 L 8,-15 L 8,-6 M 8,6 L 8,15 L -4,15" />
          <polygon points="2,6 14,6 8,-6" class="comp-path" />
          <polygon points="2,6 14,6 8,-6" class="comp-fill" />
          <path class="comp-path" d="M 2,-6 L 14,-6" />
        `;
        break;
      case 'BJT':
        shape = `
          <path class="comp-path" d="M -8,-15 L -8,15 M -20,0 L -8,0 M 0,-30 L 0,-10 L -8,-4 M 0,30 L 0,10 L -8,4" />
          <path class="comp-path" d="M -3,5 L 0,10 L -5,9" />
        `;
        break;
      case 'JFET':
        shape = `
          <path class="comp-path" d="M -8,-15 L -8,15 M 0,-30 L 0,-10 L -8,-10 M 0,30 L 0,10 L -8,10 M -20,0 L -8,0" />
          <polygon points="-14,-3 -8,0 -14,3" fill="currentColor" />
        `;
        break;
      case 'BREAKER':
        shape = `
          <path class="comp-path" d="M 0,-30 L 0,-15 M 0,15 L 0,30" />
          <circle cx="0" cy="-15" r="2.5" class="comp-path" />
          <circle cx="0" cy="15" r="2.5" class="comp-path" />
          <path class="comp-path" d="M 0,-15 L 12,12 M -20,0 L -8,0" />
          <rect x="-8" y="-20" width="16" height="40" rx="2" class="comp-path" stroke-dasharray="2 2" />
          <path class="comp-path" d="M -4,22 L 4,28 M -4,28 L 4,22" />
        `;
        break;
      case 'DBL_SWITCH':
      case 'MAN_SWITCH':
        boundsX = -22; boundsW = 44; boundsY = -24; boundsH = 48; labelY = 28;
        shape = `
          <path class="comp-path" d="M -20,0 L -10,0 M 20,-20 L 10,-20 M 20,20 L 10,20" />
          <circle cx="-10" cy="0" r="2.5" class="comp-path" />
          <circle cx="10" cy="-20" r="2.5" class="comp-path" />
          <circle cx="10" cy="20" r="2.5" class="comp-path" />
          <path class="comp-path" d="M -10,0 L 8,-16" />
        `;
        if (type === 'MAN_SWITCH') {
          shape += `<path d="M 0,-6 C 4,-4 4,4 0,6" class="comp-path" stroke-width="1.2" />`;
        }
        break;
      case 'MAN_DBL_SWITCH':
        shape = `
          <path class="comp-path" d="M -8,-30 L -8,-20 M 8,-30 L 8,-20 M -8,30 L -8,20 M 8,30 L 8,20" />
          <circle cx="-8" cy="-20" r="2" class="comp-path" />
          <circle cx="-8" cy="20" r="2" class="comp-path" />
          <circle cx="8" cy="-20" r="2" class="comp-path" />
          <circle cx="8" cy="20" r="2" class="comp-path" />
          <path class="comp-path" d="M -8,-20 L -3,15 M 8,-20 L 13,15" />
          <path class="comp-path" d="M -5,0 L 11,0" stroke-dasharray="2 2" />
          <path class="comp-path" d="M -20,0 L -5,0" />
        `;
        break;
      case 'MAN_TRPL_SWITCH':
      case 'TRPL_SWITCH':
        shape = `
          <path class="comp-path" d="M -12,-30 L -12,-20 M 0,-30 L 0,-20 M 12,-30 L 12,-20" />
          <path class="comp-path" d="M -12,30 L -12,20 M 0,30 L 0,20 M 12,30 L 12,20" />
          <circle cx="-12" cy="-20" r="2" class="comp-path" />
          <circle cx="-12" cy="20" r="2" class="comp-path" />
          <circle cx="0" cy="-20" r="2" class="comp-path" />
          <circle cx="0" cy="20" r="2" class="comp-path" />
          <circle cx="12" cy="-20" r="2" class="comp-path" />
          <circle cx="12" cy="20" r="2" class="comp-path" />
          <path class="comp-path" d="M -12,-20 L -7,15 M 0,-20 L 5,15 M 12,-20 L 17,15" />
          <path class="comp-path" d="M -9,0 L 14,0" stroke-dasharray="2 2" />
          <path class="comp-path" d="M -20,0 L -9,0" />
        `;
        break;
      case 'IC_555':
        boundsX = -25; boundsW = 50; boundsY = -40; boundsH = 80; labelY = 52;
        shape = `
          <rect x="-18" y="-35" width="36" height="70" rx="2" class="comp-path" fill="#1e293b" stroke="currentColor" stroke-width="2" />
          <path d="M -6 -35 A 6 6 0 0 0 6 -35" class="comp-path" fill="none" stroke="currentColor" stroke-width="2" />
          <!-- Pin lines -->
          <line x1="-25" y1="-30" x2="-18" y2="-30" class="comp-path" stroke-width="1.5" />
          <line x1="-25" y1="-10" x2="-18" y2="-10" class="comp-path" stroke-width="1.5" />
          <line x1="-25" y1="10" x2="-18" y2="10" class="comp-path" stroke-width="1.5" />
          <line x1="-25" y1="30" x2="-18" y2="30" class="comp-path" stroke-width="1.5" />
          <line x1="18" y1="-30" x2="25" y2="-30" class="comp-path" stroke-width="1.5" />
          <line x1="18" y1="-10" x2="25" y2="-10" class="comp-path" stroke-width="1.5" />
          <line x1="18" y1="10" x2="25" y2="10" class="comp-path" stroke-width="1.5" />
          <line x1="18" y1="30" x2="25" y2="30" class="comp-path" stroke-width="1.5" />
          <!-- Label -->
          <text x="0" y="4" font-family="Inter, sans-serif" font-size="9" font-weight="700" fill="#e2e8f0" text-anchor="middle">555</text>
        `;
        break;
      case 'IC_LM7805':
      case 'IC_LM317': {
        const isAdj = type === 'IC_LM317';
        boundsX = -22; boundsW = 44; boundsY = -28; boundsH = 56; labelY = 38;
        shape = `
          <!-- Heat sink tab -->
          <rect x="-14" y="-22" width="28" height="10" rx="1" fill="#64748b" stroke="currentColor" stroke-width="1.5" />
          <circle cx="0" cy="-17" r="2.5" fill="none" stroke="currentColor" stroke-width="1.2" />
          <!-- Chip body -->
          <rect x="-16" y="-12" width="32" height="30" rx="1" fill="#1e293b" stroke="currentColor" stroke-width="2" />
          <!-- Pin lines -->
          <line x1="-20" y1="-20" x2="-16" y2="-12" class="comp-path" stroke-width="1.5" />
          <line x1="20" y1="-20" x2="16" y2="-12" class="comp-path" stroke-width="1.5" />
          <line x1="0" y1="18" x2="0" y2="20" class="comp-path" stroke-width="1.5" />
          <text x="0" y="4" font-family="Inter, sans-serif" font-size="7.5" font-weight="700" fill="#e2e8f0" text-anchor="middle">${isAdj ? 'LM317' : '7805'}</text>
        `;
        break;
      }
      case 'IC_PC817':
        boundsX = -25; boundsW = 50; boundsY = -25; boundsH = 50; labelY = 32;
        shape = `
          <rect x="-16" y="-20" width="32" height="40" rx="1.5" fill="#1e293b" stroke="currentColor" stroke-width="2" />
          <circle cx="-12" cy="-15" r="1.5" fill="currentColor" /> <!-- Dot for Pin 1 -->
          <!-- Pin lines -->
          <line x1="-25" y1="-15" x2="-16" y2="-15" class="comp-path" stroke-width="1.5" />
          <line x1="-25" y1="15" x2="-16" y2="15" class="comp-path" stroke-width="1.5" />
          <line x1="16" y1="-15" x2="25" y2="-15" class="comp-path" stroke-width="1.5" />
          <line x1="16" y1="15" x2="25" y2="15" class="comp-path" stroke-width="1.5" />
          <!-- Opto symbol internally -->
          <path d="M -8,-5 L -4,-5 M -6,-7 L -6,-3" stroke="currentColor" stroke-width="1" />
          <path d="M -8,5 L -4,5" stroke="currentColor" stroke-width="1" />
          <path d="M -6,-5 L -6,5" stroke="currentColor" stroke-width="1" />
          <!-- Diagonal light rays -->
          <line x1="-3" y1="-2" x2="1" y2="1" stroke="currentColor" stroke-width="1" />
          <polygon points="1,1 0,0 1,-1" fill="currentColor" />
          <line x1="-3" y1="2" x2="1" y2="5" stroke="currentColor" stroke-width="1" />
          <polygon points="1,5 0,4 1,3" fill="currentColor" />
          <text x="0" y="4" font-family="Inter, sans-serif" font-size="7" font-weight="700" fill="#e2e8f0" text-anchor="middle">PC817</text>
        `;
        break;
      case 'IC_7400':
      case 'IC_7408':
      case 'IC_7432':
      case 'IC_7404': {
        const label = type.split('_')[1];
        boundsX = -25; boundsW = 50; boundsY = -55; boundsH = 110; labelY = 65;
        shape = `
          <rect x="-18" y="-50" width="36" height="100" rx="2" class="comp-path" fill="#1e293b" stroke="currentColor" stroke-width="2" />
          <path d="M -6 -50 A 6 6 0 0 0 6 -50" class="comp-path" fill="none" stroke="currentColor" stroke-width="2" />
          <!-- Pin lines -->
          <line x1="-25" y1="-45" x2="-18" y2="-45" class="comp-path" stroke-width="1.5" />
          <line x1="-25" y1="-30" x2="-18" y2="-30" class="comp-path" stroke-width="1.5" />
          <line x1="-25" y1="-15" x2="-18" y2="-15" class="comp-path" stroke-width="1.5" />
          <line x1="-25" y1="0" x2="-18" y2="0" class="comp-path" stroke-width="1.5" />
          <line x1="-25" y1="15" x2="-18" y2="15" class="comp-path" stroke-width="1.5" />
          <line x1="-25" y1="30" x2="-18" y2="30" class="comp-path" stroke-width="1.5" />
          <line x1="-25" y1="45" x2="-18" y2="45" class="comp-path" stroke-width="1.5" />
          <line x1="18" y1="-45" x2="25" y2="-45" class="comp-path" stroke-width="1.5" />
          <line x1="18" y1="-30" x2="25" y2="-30" class="comp-path" stroke-width="1.5" />
          <line x1="18" y1="-15" x2="25" y2="-15" class="comp-path" stroke-width="1.5" />
          <line x1="18" y1="0" x2="25" y2="0" class="comp-path" stroke-width="1.5" />
          <line x1="18" y1="15" x2="25" y2="15" class="comp-path" stroke-width="1.5" />
          <line x1="18" y1="30" x2="25" y2="30" class="comp-path" stroke-width="1.5" />
          <line x1="18" y1="45" x2="25" y2="45" class="comp-path" stroke-width="1.5" />
          <!-- Label -->
          <text x="0" y="4" font-family="Inter, sans-serif" font-size="9" font-weight="700" fill="#e2e8f0" text-anchor="middle">${label}</text>
        `;
        break;
      }
      case 'SR_SWITCH':
        shape = `
          <rect x="-15" y="-15" width="30" height="30" rx="3" class="comp-path" />
          <path class="comp-path" d="M 0,-30 L 0,-15 M 0,15 L 0,30 M -20,0 L -15,0" />
          <text x="0" y="4" font-family="Inter, sans-serif" font-size="10" font-weight="700" fill="currentColor" text-anchor="middle">SR</text>
        `;
        break;
      case 'IDEAL_XFMR':
        boundsX = -22; boundsW = 44; boundsY = -22; boundsH = 44; labelY = 28;
        shape = `
          <path class="comp-path" d="M -20,-15 L -10,-15 C -4,-15 -4,-9 -10,-9 C -4,-9 -4,-3 -10,-3 C -4,-3 -4,3 -10,3 C -4,3 -4,9 -10,9 C -4,9 -4,15 -10,15 L -20,15" />
          <path class="comp-path" d="M 20,-15 L 10,-15 C 4,-15 4,-9 10,-9 C 4,-9 4,-3 10,-3 C 4,-3 4,3 10,3 C 4,3 4,9 10,9 C 4,9 4,15 10,15 L 20,15" />
        `;
        break;
      case 'XFMR_2W':
        boundsX = -22; boundsW = 44; boundsY = -22; boundsH = 44; labelY = 28;
        shape = `
          <path class="comp-path" d="M -20,-15 L -10,-15 C -4,-15 -4,-9 -10,-9 C -4,-9 -4,-3 -10,-3 C -4,-3 -4,3 -10,3 C -4,3 -4,9 -10,9 C -4,9 -4,15 -10,15 L -20,15" />
          <path class="comp-path" d="M 20,-15 L 10,-15 C 4,-15 4,-9 10,-9 C 4,-9 4,-3 10,-3 C 4,-3 4,3 10,3 C 4,3 4,9 10,9 C 4,9 4,15 10,15 L 20,15" />
          <line x1="-2" y1="-15" x2="-2" y2="15" class="comp-path" stroke-width="1.2" />
          <line x1="2" y1="-15" x2="2" y2="15" class="comp-path" stroke-width="1.2" />
        `;
        break;
      case 'XFMR_3W':
        boundsX = -22; boundsW = 44; boundsY = -27; boundsH = 54; labelY = 32;
        shape = `
          <path class="comp-path" d="M -20,-20 L -10,-20 C -4,-20 -4,-14 -10,-14 C -4,-14 -4,-8 -10,-8 C -4,-8 -4,-2 -10,-2 C -4,-2 -4,4 -10,4 C -4,4 -4,10 -10,10 C -4,10 -4,16 -10,16 C -4,16 -4,20 -10,20 L -20,20" />
          <path class="comp-path" d="M 20,-25 L 10,-25 C 4,-25 4,-21 10,-21 C 4,-21 4,-17 10,-17 C 4,-17 4,-13 10,-13 C 4,-13 4,-9 10,-9 C 4,-9 4,-5 10,-5 L 20,-5" />
          <path class="comp-path" d="M 20,5 L 10,5 C 4,5 4,9 10,9 C 4,9 4,13 10,13 C 4,13 4,17 10,17 C 4,17 4,21 10,21 C 4,21 4,25 10,25 L 20,25" />
          <line x1="-2" y1="-25" x2="-2" y2="25" class="comp-path" stroke-width="1.2" />
          <line x1="2" y1="-25" x2="2" y2="25" class="comp-path" stroke-width="1.2" />
        `;
        break;
      case 'MUTUAL_2W':
        boundsX = -22; boundsW = 44; boundsY = -22; boundsH = 44; labelY = 28;
        shape = `
          <path class="comp-path" d="M -20,-15 L -10,-15 C -4,-15 -4,-9 -10,-9 C -4,-9 -4,-3 -10,-3 C -4,-3 -4,3 -10,3 C -4,3 -4,9 -10,9 C -4,9 -4,15 -10,15 L -20,15" />
          <path class="comp-path" d="M 20,-15 L 10,-15 C 4,-15 4,-9 10,-9 C 4,-9 4,-3 10,-3 C 4,-3 4,3 10,3 C 4,3 4,9 10,9 C 4,9 4,15 10,15 L 20,15" />
          <text x="0" y="3.5" font-family="Times New Roman, Georgia, serif" font-size="10" font-style="italic" fill="currentColor" text-anchor="middle">M</text>
        `;
        break;
      case 'MUTUAL_3W':
        boundsX = -22; boundsW = 44; boundsY = -27; boundsH = 54; labelY = 32;
        shape = `
          <path class="comp-path" d="M -20,-20 L -10,-20 C -4,-20 -4,-14 -10,-14 C -4,-14 -4,-8 -10,-8 C -4,-8 -4,-2 -10,-2 C -4,-2 -4,4 -10,4 C -4,4 -4,10 -10,10 C -4,10 -4,16 -10,16 C -4,16 -4,20 -10,20 L -20,20" />
          <path class="comp-path" d="M 20,-25 L 10,-25 C 4,-25 4,-21 10,-21 C 4,-21 4,-17 10,-17 C 4,-17 4,-13 10,-13 C 4,-13 4,-9 10,-9 C 4,-9 4,-5 10,-5 L 20,-5" />
          <path class="comp-path" d="M 20,5 L 10,5 C 4,5 4,9 10,9 C 4,9 4,13 10,13 C 4,13 4,17 10,17 C 4,17 4,21 10,21 C 4,21 4,25 10,25 L 20,25" />
          <text x="0" y="3.5" font-family="Times New Roman, Georgia, serif" font-size="10" font-style="italic" fill="currentColor" text-anchor="middle">M</text>
        `;
        break;
      case 'SAT_XFMR':
        boundsX = -22; boundsW = 44; boundsY = -22; boundsH = 44; labelY = 28;
        shape = `
          <path class="comp-path" d="M -20,-15 L -10,-15 C -4,-15 -4,-9 -10,-9 C -4,-9 -4,-3 -10,-3 C -4,-3 -4,3 -10,3 C -4,3 -4,9 -10,9 C -4,9 -4,15 -10,15 L -20,15" />
          <path class="comp-path" d="M 20,-15 L 10,-15 C 4,-15 4,-9 10,-9 C 4,-9 4,-3 10,-3 C 4,-3 4,3 10,3 C 4,3 4,9 10,9 C 4,9 4,15 10,15 L 20,15" />
          <line x1="-2" y1="-15" x2="-2" y2="15" class="comp-path" stroke-width="1.2" />
          <line x1="2" y1="-15" x2="2" y2="15" class="comp-path" stroke-width="1.2" />
          <text x="0" y="24" font-family="Inter, sans-serif" font-size="6" font-weight="700" fill="currentColor" text-anchor="middle">SAT</text>
        `;
        break;
      case 'XFMR_3PH_2W':
        boundsX = -27; boundsW = 54; boundsY = -22; boundsH = 44; labelY = 28;
        shape = `
          <circle cx="-6" cy="0" r="10" class="comp-path" />
          <circle cx="6" cy="0" r="10" class="comp-path" />
          <path class="comp-path" d="M -6,0 L -6,-5 M -6,0 L -9,3 M -6,0 L -3,3" />
          <path class="comp-path" d="M 6,-4 L 2,2 L 10,2 Z" />
          <path class="comp-path" d="M -25,-15 L -12,-15 M -25,0 L -16,0 M -25,15 L -12,15" />
          <path class="comp-path" d="M 25,-15 L 12,-15 M 25,0 L 16,0 M 25,15 L 12,15" />
        `;
        break;
      case 'XFMR_3PH_3W':
        boundsX = -27; boundsW = 54; boundsY = -18; boundsH = 48; labelY = 32;
        shape = `
          <circle cx="-6" cy="-5" r="9" class="comp-path" />
          <circle cx="6" cy="-5" r="9" class="comp-path" />
          <circle cx="0" cy="7" r="9" class="comp-path" />
          <path class="comp-path" d="M -6,-5 L -6,-9 M -6,-5 L -9,-2 M -6,-5 L -3,-2" />
          <path class="comp-path" d="M 6,-9 L 2,-3 L 10,-3 Z" />
          <path class="comp-path" d="M 0,7 L 0,3 M 0,7 L -3,10 M 0,7 L 3,10" />
          <path class="comp-path" d="M -25,-15 L -12,-10 M -25,0 L -15,-5 M -25,15 L -9,7" />
          <path class="comp-path" d="M 25,-15 L 12,-10 M 25,0 L 15,-5 M 25,15 L 9,7" />
          <path class="comp-path" d="M 0,25 L 0,16 M -10,25 L -7,15 M 10,25 L 7,15" />
        `;
        break;
      case 'OPAMP':
        boundsX = -27; boundsW = 54; boundsY = -22; boundsH = 44; labelY = 28;
        shape = `
          <path class="comp-path" d="M -15,-20 L 15,0 L -15,20 Z" />
          <polygon points="-15,-20 15,0 -15,20" class="comp-fill" />
          <path class="comp-path" d="M -25,-10 L -15,-10 M -25,10 L -15,10 M 15,0 L 25,0" />
          <path class="comp-path" d="M -11,-10 L -7,-10 M -9,-12 L -9,-8" />
          <path class="comp-path" d="M -11,10 L -7,10" />
        `;
        break;
      case 'E_COMP':
        boundsX = -27; boundsW = 54; boundsY = -22; boundsH = 44; labelY = 28;
        shape = `
          <path class="comp-path" d="M -15,-20 L 15,0 L -15,20 Z" />
          <polygon points="-15,-20 15,0 -15,20" class="comp-fill" />
          <path class="comp-path" d="M -25,-10 L -15,-10 M -25,10 L -15,10 M 15,0 L 25,0" />
          <path class="comp-path" d="M -11,-10 L -7,-10 M -9,-12 L -9,-8" />
          <path class="comp-path" d="M -11,10 L -7,10" />
          <path d="M -3,-2 L 1,-2 L 1,2 L 5,2" class="comp-path" stroke-width="1.2" />
        `;
        break;
    }

    return `
      <rect class="comp-bounds" x="${boundsX}" y="${boundsY}" width="${boundsW}" height="${boundsH}" rx="4" />
      ${shape}
      <g transform="translate(0, ${labelY}) rotate(${-rotation})">
        <text class="comp-label" x="0" y="4" text-anchor="middle" fill="currentColor">${id}</text>
      </g>
    `;
  }

  // Styling based on category
  const isLightMode = typeof document !== 'undefined' && document.querySelector('.light-mode') !== null;

  let width = 50;
  let height = 40;
  let borderColor = isLightMode ? '#0284c7' : '#0ea5e9'; // sky-600 vs sky-500
  let fillColor = isLightMode ? '#ffffff' : '#090d16'; // white vs deep slate
  let symbolColor = isLightMode ? '#0369a1' : '#38bdf8'; // sky-700 vs sky-400
  let badgeText = 'GEN';

  if (libComp.category === 'control') {
    borderColor = isLightMode ? '#059669' : '#10b981'; // emerald-600 vs emerald-500
    symbolColor = isLightMode ? '#047857' : '#34d399'; // emerald-700 vs emerald-400
    badgeText = 'CTRL';
  } else if ((libComp.category as string) === 'electrical') {
    borderColor = isLightMode ? '#d97706' : '#f59e0b'; // amber-600 vs amber-500
    symbolColor = isLightMode ? '#b45309' : '#fbbf24'; // amber-700 vs amber-400
    badgeText = 'ELEC';
  }


  // Size adjustments for wider labels
  const symbol = libComp.symbol;
  if (symbol.length > 5) {
    width = 56;
  }

  const halfW = width / 2;
  const halfH = height / 2;

  // Check for specialized graphic override instead of simple text symbol
  let innerGraphic = `
    <!-- Central symbol -->
    <text x="0" y="3.5" font-family="JetBrains Mono, monospace" font-size="9" font-weight="700" fill="${symbolColor}" text-anchor="middle" stroke="none">${symbol}</text>
  `;

  if (type === 'STEP') {
    innerGraphic = `
      <path d="M -12,6 L -2,6 L -2,-6 L 10,-6" fill="none" stroke="${symbolColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    `;
  } else if (type === 'RAMP') {
    innerGraphic = `
      <path d="M -12,6 L -4,6 L 8,-6" fill="none" stroke="${symbolColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    `;
  } else if (type === 'CLOCK') {
    innerGraphic = `
      <circle cx="0" cy="0" r="7" fill="none" stroke="${symbolColor}" stroke-width="1.5" />
      <line x1="0" y1="0" x2="0" y2="-4" stroke="${symbolColor}" stroke-width="1.5" stroke-linecap="round" />
      <line x1="0" y1="0" x2="3.5" y2="2" stroke="${symbolColor}" stroke-width="1.5" stroke-linecap="round" />
    `;
  } else if (type === 'SINE_WAVE') {
    innerGraphic = `
      <path d="M -12,0 C -6,-10 -6,10 0,0 C 6,-10 6,10 12,0" fill="none" stroke="${symbolColor}" stroke-width="1.8" stroke-linecap="round" />
    `;
  } else if (type === 'PULSE_GEN') {
    innerGraphic = `
      <path d="M -12,6 L -6,6 L -6,-6 L 2,-6 L 2,6 L 10,6" fill="none" stroke="${symbolColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    `;
  } else if (type === 'TRI_GEN') {
    innerGraphic = `
      <path d="M -12,6 L -4,-6 L 4,6 L 12,-6" fill="none" stroke="${symbolColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    `;
  } else if (type === 'SATURATION') {
    innerGraphic = `
      <path d="M -12,6 L -5,6 L 5,-6 L 12,-6" fill="none" stroke="${symbolColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    `;
  } else if (type === 'DEAD_ZONE') {
    innerGraphic = `
      <path d="M -12,5 L -5,0 L 5,0 L 12,-5" fill="none" stroke="${symbolColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    `;
  } else if (type === 'INTEGRATOR') {
    innerGraphic = `
      <text x="0" y="3.5" font-family="Times New Roman, Georgia, serif" font-size="16" font-style="italic" font-weight="700" fill="${symbolColor}" text-anchor="middle" stroke="none">∫</text>
    `;
  } else if (type === 'OFFSET') {
    innerGraphic = `
      <path d="M -12,4 L -2,4 M -2,-4 L 10,-4 M -2,4 L -2,-4" fill="none" stroke="${symbolColor}" stroke-width="1.2" stroke-dasharray="2,2" />
      <path d="M -12,4 L -4,4 M -4,-2 L 8,-2" fill="none" stroke="${symbolColor}" stroke-width="1.8" stroke-linecap="round" />
      <text x="0" y="7" font-family="Inter, sans-serif" font-size="6" font-weight="700" fill="${symbolColor}" text-anchor="middle">OFFSET</text>
    `;
  } else if (type === 'SUM_RECT') {
    innerGraphic = `
      <text x="-12" y="-6" font-family="Inter, sans-serif" font-size="9" font-weight="900" fill="${symbolColor}">+</text>
      <text x="-12" y="12" font-family="Inter, sans-serif" font-size="9" font-weight="900" fill="${symbolColor}">+</text>
      <text x="2" y="3.5" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="${symbolColor}" text-anchor="middle">Σ</text>
    `;
  } else if (type === 'SUBTRACT') {
    innerGraphic = `
      <text x="-12" y="-6" font-family="Inter, sans-serif" font-size="9" font-weight="900" fill="${symbolColor}">+</text>
      <text x="-12" y="12" font-family="Inter, sans-serif" font-size="9" font-weight="900" fill="${symbolColor}">-</text>
      <text x="2" y="3.5" font-family="Inter, sans-serif" font-size="11" font-weight="700" fill="${symbolColor}" text-anchor="middle">Σ</text>
    `;
  } else if (type === 'PRODUCT_RECT') {
    innerGraphic = `
      <text x="0" y="5" font-family="Inter, sans-serif" font-size="16" font-weight="700" fill="${symbolColor}" text-anchor="middle">×</text>
    `;
  } else if (type === 'SIGNUM') {
    innerGraphic = `
      <path d="M -12,6 L -3,6 L -3,0 L 3,0 L 3,-6 L 12,-6" fill="none" stroke="${symbolColor}" stroke-width="1.2" stroke-dasharray="2,2" />
      <path d="M -12,5 L -3,5 M 3,-5 L 12,-5" fill="none" stroke="${symbolColor}" stroke-width="1.8" stroke-linecap="round" />
      <circle cx="0" cy="0" r="1.5" fill="${symbolColor}" />
      <text x="0" y="-7" font-family="Inter, sans-serif" font-size="5" font-weight="700" fill="${symbolColor}" text-anchor="middle">sgn</text>
    `;
  } else if (type === 'DIVIDE') {
    innerGraphic = `
      <text x="0" y="5.5" font-family="Inter, sans-serif" font-size="16" font-weight="700" fill="${symbolColor}" text-anchor="middle">÷</text>
    `;
  } else if (type === 'DATATYPE_CONV') {
    innerGraphic = `
      <rect x="-12" y="-8" width="24" height="16" rx="2" fill="none" stroke="${symbolColor}" stroke-width="1.2" />
      <text x="0" y="3" font-family="Inter, sans-serif" font-size="7" font-weight="800" fill="${symbolColor}" text-anchor="middle">CAST</text>
    `;
  } else if (type === 'PLL_1PH') {
    width = 60;
    height = 50;
    innerGraphic = `
      <rect x="-22" y="-18" width="44" height="36" fill="none" stroke="${symbolColor}" stroke-width="1.2" stroke-dasharray="2 2" />
      <text x="0" y="3.5" font-family="Inter, sans-serif" font-size="8" font-weight="800" fill="${symbolColor}" text-anchor="middle">PLL 1Φ</text>
      <text x="-21" y="2.5" font-family="Inter, sans-serif" font-size="5.5" font-weight="700" fill="${symbolColor}" opacity="0.8" text-anchor="start">In</text>
      <text x="21" y="-12.5" font-family="Inter, sans-serif" font-size="5.5" font-weight="700" fill="${symbolColor}" opacity="0.8" text-anchor="end">θ</text>
      <text x="21" y="-2.5" font-family="Inter, sans-serif" font-size="5.5" font-weight="700" fill="${symbolColor}" opacity="0.8" text-anchor="end">f</text>
      <text x="21" y="7.5" font-family="Inter, sans-serif" font-size="5.5" font-weight="700" fill="${symbolColor}" opacity="0.8" text-anchor="end">cos</text>
      <text x="21" y="17.5" font-family="Inter, sans-serif" font-size="5.5" font-weight="700" fill="${symbolColor}" opacity="0.8" text-anchor="end">sin</text>
    `;
  } else if (type === 'PLL_3PH') {
    width = 60;
    height = 50;
    innerGraphic = `
      <rect x="-22" y="-18" width="44" height="36" fill="none" stroke="${symbolColor}" stroke-width="1.2" stroke-dasharray="2 2" />
      <text x="0" y="3.5" font-family="Inter, sans-serif" font-size="8" font-weight="800" fill="${symbolColor}" text-anchor="middle">PLL 3Φ</text>
      <text x="-21" y="-7.5" font-family="Inter, sans-serif" font-size="5.5" font-weight="700" fill="${symbolColor}" opacity="0.8" text-anchor="start">a</text>
      <text x="-21" y="2.5" font-family="Inter, sans-serif" font-size="5.5" font-weight="700" fill="${symbolColor}" opacity="0.8" text-anchor="start">b</text>
      <text x="-21" y="12.5" font-family="Inter, sans-serif" font-size="5.5" font-weight="700" fill="${symbolColor}" opacity="0.8" text-anchor="start">c</text>
      <text x="21" y="-12.5" font-family="Inter, sans-serif" font-size="5.5" font-weight="700" fill="${symbolColor}" opacity="0.8" text-anchor="end">θ</text>
      <text x="21" y="-2.5" font-family="Inter, sans-serif" font-size="5.5" font-weight="700" fill="${symbolColor}" opacity="0.8" text-anchor="end">f</text>
      <text x="21" y="7.5" font-family="Inter, sans-serif" font-size="5.5" font-weight="700" fill="${symbolColor}" opacity="0.8" text-anchor="end">cos</text>
      <text x="21" y="17.5" font-family="Inter, sans-serif" font-size="5.5" font-weight="700" fill="${symbolColor}" opacity="0.8" text-anchor="end">sin</text>
    `;
  } else if (type === 'QUANTIZER') {
    innerGraphic = `
      <path d="M -12,6 L -6,6 L -6,0 L 2,0 L 2,-6 L 10,-6" fill="none" stroke="${symbolColor}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
    `;
  } else if (type === 'SIGNAL_SWITCH') {
    innerGraphic = `
      <text x="-14" y="-14" font-family="Inter, sans-serif" font-size="5.5" font-weight="700" fill="${symbolColor}">In1</text>
      <text x="-14" y="3" font-family="Inter, sans-serif" font-size="5.5" font-weight="700" fill="${symbolColor}">Ctrl</text>
      <text x="-14" y="20" font-family="Inter, sans-serif" font-size="5.5" font-weight="700" fill="${symbolColor}">In2</text>
      <path d="M -15,-17 L -2,-17 M -15,17 L -2,17 M 15,0 L 2,0" fill="none" stroke="${symbolColor}" stroke-width="1.2" />
      <circle cx="-2" cy="-17" r="1.5" fill="${symbolColor}" />
      <circle cx="-2" cy="17" r="1.5" fill="${symbolColor}" />
      <circle cx="2" cy="0" r="1.5" fill="${symbolColor}" />
      <path d="M 1,0 L -2,-11" fill="none" stroke="${symbolColor}" stroke-width="1.8" stroke-linecap="round" />
    `;
  } else if (type === 'MANUAL_SWITCH') {
    const isInput1 = (comp.parameters && comp.parameters.state) !== 'Input 2';
    const lineToY = isInput1 ? -17 : 17;
    innerGraphic = `
      <text x="-14" y="-14" font-family="Inter, sans-serif" font-size="5.5" font-weight="700" fill="${symbolColor}">In1</text>
      <text x="-14" y="20" font-family="Inter, sans-serif" font-size="5.5" font-weight="700" fill="${symbolColor}">In2</text>
      <path d="M -15,-17 L -2,-17 M -15,17 L -2,17 M 15,0 L 2,0" fill="none" stroke="${symbolColor}" stroke-width="1.2" />
      <circle cx="-2" cy="-17" r="1.5" fill="${symbolColor}" />
      <circle cx="-2" cy="17" r="1.5" fill="${symbolColor}" />
      <circle cx="2" cy="0" r="1.5" fill="${symbolColor}" />
      <path d="M 1,0 L -2,${lineToY}" fill="none" stroke="${symbolColor}" stroke-width="1.8" stroke-linecap="round" />
      <text x="0" y="3.5" font-family="Inter, sans-serif" font-size="5.5" font-weight="800" fill="${symbolColor}" text-anchor="middle">MANUAL</text>
    `;
  } else if (type === 'MULTIPORT_SWITCH') {
    const numInputs = parseInt(comp.parameters && comp.parameters.inputs) || 3;
    width = 50;
    height = Math.max(40, numInputs * 20);
    const halfH = height / 2;
    let inputsLabels = '';
    for (let i = 1; i <= numInputs; i++) {
      const y = - (numInputs - 1) * 10 + (i - 1) * 20;
      inputsLabels += `<text x="-21" y="${y + 2.5}" font-family="Inter, sans-serif" font-size="5.5" font-weight="700" fill="${symbolColor}">In${i}</text>`;
    }
    innerGraphic = `
      <text x="0" y="-${halfH - 12}" font-family="Inter, sans-serif" font-size="5.5" font-weight="800" fill="${symbolColor}" text-anchor="middle">Idx</text>
      ${inputsLabels}
      <circle cx="2" cy="0" r="1.5" fill="${symbolColor}" />
      <path d="M 2,0 L -10,0" fill="none" stroke="${symbolColor}" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="2 1" />
    `;
  } else if (type === 'HIT_CROSSING') {
    innerGraphic = `
      <line x1="-12" y1="0" x2="12" y2="0" stroke="${symbolColor}" stroke-width="1" stroke-dasharray="2,2" />
      <path d="M -12,8 Q -6,-8 0,0 Q 6,8 12,-8" fill="none" stroke="${symbolColor}" stroke-width="1.8" stroke-linecap="round" />
      <circle cx="0" cy="0" r="2.5" fill="#f43f5e" stroke="none" />
    `;
  } else if (type === 'DISCRETE_MEAN') {
    innerGraphic = `
      <text x="0" y="-4" font-family="Inter, sans-serif" font-size="8" font-weight="800" fill="${symbolColor}" text-anchor="middle">Mean</text>
      <text x="0" y="6" font-family="Inter, sans-serif" font-size="6.5" font-weight="700" fill="${symbolColor}" opacity="0.8" text-anchor="middle">z^-N</text>
    `;
  } else if (type === 'DISCRETE_PID') {
    innerGraphic = `
      <text x="0" y="-4" font-family="Inter, sans-serif" font-size="8" font-weight="800" fill="${symbolColor}" text-anchor="middle">PID</text>
      <text x="0" y="6" font-family="Inter, sans-serif" font-size="7" font-weight="700" fill="${symbolColor}" opacity="0.8" text-anchor="middle">z-domain</text>
    `;
  } else if (type === 'PERIODIC_IMP_AVG') {
    innerGraphic = `
      <text x="0" y="3.5" font-family="Inter, sans-serif" font-size="7.5" font-weight="800" fill="${symbolColor}" text-anchor="middle">Imp Avg</text>
      <text x="-21" y="-7.5" font-family="Inter, sans-serif" font-size="5" font-weight="700" fill="${symbolColor}" opacity="0.8" text-anchor="start">In</text>
      <text x="-21" y="12.5" font-family="Inter, sans-serif" font-size="5" font-weight="700" fill="${symbolColor}" opacity="0.8" text-anchor="start">Trig</text>
    `;
  } else if (type === 'FOURIER_TRANS') {
    innerGraphic = `
      <text x="0" y="3.5" font-family="Inter, sans-serif" font-size="8" font-weight="800" fill="${symbolColor}" text-anchor="middle">Fourier</text>
      <text x="-21" y="2.5" font-family="Inter, sans-serif" font-size="5" font-weight="700" fill="${symbolColor}" opacity="0.8" text-anchor="start">In</text>
      <text x="21" y="-7.5" font-family="Inter, sans-serif" font-size="5" font-weight="700" fill="${symbolColor}" opacity="0.8" text-anchor="end">Mag</text>
      <text x="21" y="12.5" font-family="Inter, sans-serif" font-size="5" font-weight="700" fill="${symbolColor}" opacity="0.8" text-anchor="end">Phase</text>
    `;
  } else if (type === 'RELATIONAL_OPERATOR') {
    const op = comp.parameters?.operator ?? '==';
    innerGraphic = `
      <text x="0" y="-4" font-family="Inter, sans-serif" font-size="7" font-weight="850" fill="${symbolColor}" text-anchor="middle">Relational</text>
      <text x="0" y="7" font-family="Inter, sans-serif" font-size="11" font-weight="900" fill="${symbolColor}" text-anchor="middle">${op}</text>
    `;
  } else if (type === 'COMPARE_TO_CONSTANT') {
    const op = comp.parameters?.operator ?? '==';
    const cVal = comp.parameters?.constant ?? '0.0';
    innerGraphic = `
      <text x="0" y="-5" font-family="Inter, sans-serif" font-size="7" font-weight="850" fill="${symbolColor}" text-anchor="middle">Compare</text>
      <text x="0" y="5" font-family="Inter, sans-serif" font-size="9" font-weight="900" fill="${symbolColor}" text-anchor="middle">${op} ${cVal}</text>
    `;
  } else if (type === 'D_FLIP_FLOP') {
    width = 50;
    height = 40;
    innerGraphic = `
      <text x="0" y="3" font-family="Inter, sans-serif" font-size="8" font-weight="800" fill="${symbolColor}" text-anchor="middle">D-FF</text>
      <text x="-21" y="-8" font-family="Inter, sans-serif" font-size="6" font-weight="700" fill="${symbolColor}" text-anchor="start">D</text>
      <text x="-21" y="12" font-family="Inter, sans-serif" font-size="6" font-weight="700" fill="${symbolColor}" text-anchor="start">></text>
      <text x="21" y="-8" font-family="Inter, sans-serif" font-size="6" font-weight="700" fill="${symbolColor}" text-anchor="end">Q</text>
      <text x="21" y="12" font-family="Inter, sans-serif" font-size="6" font-weight="700" fill="${symbolColor}" text-anchor="end">Q̅</text>
    `;
  } else if (type === 'JK_FLIP_FLOP') {
    width = 50;
    height = 40;
    innerGraphic = `
      <text x="0" y="3" font-family="Inter, sans-serif" font-size="8" font-weight="800" fill="${symbolColor}" text-anchor="middle">JK-FF</text>
      <text x="-21" y="-10" font-family="Inter, sans-serif" font-size="6" font-weight="700" fill="${symbolColor}" text-anchor="start">J</text>
      <text x="-21" y="2" font-family="Inter, sans-serif" font-size="6" font-weight="700" fill="${symbolColor}" text-anchor="start">></text>
      <text x="-21" y="14" font-family="Inter, sans-serif" font-size="6" font-weight="700" fill="${symbolColor}" text-anchor="start">K</text>
      <text x="21" y="-8" font-family="Inter, sans-serif" font-size="6" font-weight="700" fill="${symbolColor}" text-anchor="end">Q</text>
      <text x="21" y="12" font-family="Inter, sans-serif" font-size="6" font-weight="700" fill="${symbolColor}" text-anchor="end">Q̅</text>
    `;
  } else if (type === 'MONOFLOP' || type === 'MONOSTABLE') {
    const dur = comp.parameters?.duration ?? '0.1';
    innerGraphic = `
      <text x="0" y="-3" font-family="Inter, sans-serif" font-size="8" font-weight="800" fill="${symbolColor}" text-anchor="middle">Monoflop</text>
      <text x="0" y="7" font-family="Inter, sans-serif" font-size="6.5" font-weight="700" fill="${symbolColor}" opacity="0.8" text-anchor="middle">T = ${dur}</text>
    `;

  }

  // Premium design container with top glow strip and center symbol
  const body = `
    <rect class="comp-bounds" x="-${halfW + 2}" y="-${halfH + 2}" width="${width + 4}" height="${height + 4}" rx="6" />
    <rect x="-${halfW}" y="-${halfH}" width="${width}" height="${height}" rx="5" fill="${fillColor}" fill-opacity="0.85" stroke="${borderColor}" stroke-width="2" />
    <!-- Top category line strip -->
    <line x1="-${halfW - 5}" y1="-${halfH}" x2="${halfW - 5}" y2="-${halfH}" stroke="${symbolColor}" stroke-width="2" stroke-linecap="round" />
    <!-- Badge category indicator -->
    <text x="-${halfW - 6}" y="-${halfH - 5}" font-family="Inter, sans-serif" font-size="6" font-weight="900" fill="${symbolColor}" opacity="0.6" stroke="none">${badgeText}</text>
    ${innerGraphic}
  `;

  return `
    ${body}
    <g transform="translate(0, ${halfH + 12}) rotate(${-rotation})">
      <text class="comp-label" x="0" y="4" text-anchor="middle" fill="currentColor">${id}</text>
    </g>
  `;
}
