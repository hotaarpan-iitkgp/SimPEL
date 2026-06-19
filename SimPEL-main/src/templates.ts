import { Component, SolverConfig } from './types';

export interface Template {
  name: string;
  description: string;
  components: Component[];
  solverConfig: SolverConfig;
}

export const CIRCUITS_TEMPLATES: Record<string, Template> = {
  empty: {
    name: "Empty Workspace",
    description: "Start building your circuit from scratch.",
    solverConfig: {
      stop_time: "0.01",
      step_size: "10u",
      solver: "euler",
      step_type: "fixed"
    },
    components: []
  },
  buck_converter: {
    name: "Closed-Loop Buck DC-DC Converter",
    description: "Closed-loop regulated Buck converter. SummingJunction compares 12.0V reference with Voltmeter output, driving a PI Controller & PWM Generator to cycle the MOSFET, keeping output constant under input/load modifications.",
    solverConfig: {
      stop_time: "0.01",
      step_size: "1u",
      solver: "euler",
      step_type: "fixed"
    },
    components: [
      {
        id: "V_in",
        type: "VoltageSource",
        label: "Input DC (24V)",
        x: 100,
        y: 350,
        rotation: 0,
        nodes: ["node_in", "node_0"],
        parameters: { value: "24.0" },
        channels: {}
      },
      {
        id: "Q1",
        type: "MOSFET",
        label: "Regulator MOSFET",
        x: 240,
        y: 200,
        rotation: 90,
        nodes: ["node_in", "node_sw"],
        parameters: { Ron: "1m", Roff: "1e5" },
        channels: { G: "pwm_gate" }
      },
      {
        id: "D1",
        type: "Diode",
        label: "Freewheeling Diode",
        x: 350,
        y: 350,
        rotation: 180,
        nodes: ["node_0", "node_sw"],
        parameters: { Ron: "1m", Roff: "1e5" },
        channels: {}
      },
      {
        id: "L1",
        type: "Inductor",
        label: "Buck Inductor",
        x: 440,
        y: 200,
        rotation: 90,
        nodes: ["node_sw", "node_out"],
        parameters: { L: "330u", esr: "0.02", plotI: "1" },
        channels: {}
      },
      {
        id: "C1",
        type: "Capacitor",
        label: "Output Filter Cap",
        x: 550,
        y: 350,
        rotation: 0,
        nodes: ["node_out", "node_0"],
        parameters: { C: "100u", vC0: "0.0", plotV: "1" },
        channels: {}
      },
      {
        id: "R_load",
        type: "Resistor",
        label: "System Load (5 Ohm)",
        x: 680,
        y: 350,
        rotation: 0,
        nodes: ["node_out", "node_0"],
        parameters: { value: "5.0", plotV: "1", plotI: "1" },
        channels: {}
      },
      {
        id: "V_out_meter",
        type: "Voltmeter",
        label: "Output Voltage Sensor",
        x: 820,
        y: 350,
        rotation: 0,
        nodes: ["node_out", "node_0"],
        parameters: {},
        channels: { Out: "v_feedback" }
      },
      // --- Control loops ---
      {
        id: "V_ref",
        type: "Constant",
        label: "V_Set Target (12.0V)",
        x: 100,
        y: 550,
        rotation: 0,
        nodes: [],
        parameters: { value: "12.0" },
        channels: { Out: "v_ref" }
      },
      {
        id: "Error_Summer",
        type: "SummingJunction",
        label: "Error Calculator",
        x: 280,
        y: 550,
        rotation: 0,
        nodes: [],
        parameters: {},
        channels: { A: "v_ref", B: "v_feedback", Out: "v_err" }
      },
      {
        id: "PI_Reg",
        type: "PI_Controller",
        label: "PI Controller",
        x: 460,
        y: 550,
        rotation: 0,
        nodes: [],
        parameters: { Kp: "1.2", Ki: "450.0" },
        channels: { In: "v_err", Out: "control_effort" }
      },
      {
        id: "PWM_Modulator",
        type: "Triangle_Carrier",
        label: "PWM Carrier (20kHz)",
        x: 640,
        y: 550,
        rotation: 0,
        nodes: [],
        parameters: { frequency: "20e3", min: "0.0", max: "1.0" },
        channels: { Out: "sawtooth_pwm" }
      },
      {
        id: "PWM_Comp",
        type: "Comparator",
        label: "PWM Gate Driver",
        x: 820,
        y: 550,
        rotation: 0,
        nodes: [],
        parameters: {},
        channels: { Plus: "control_effort", Minus: "sawtooth_pwm", Out: "pwm_gate" }
      }
    ]
  },
  lc_resonance: {
    name: "LC Transient Resonance ringing",
    description: "A series RLC grid showing ringing and energy oscillation. When simulated, a step switch closes at t=0, dumping DC voltage into a series Inductor and Capacitor, triggering high-frequency underdamped oscillation.",
    solverConfig: {
      stop_time: "0.005",
      step_size: "10u",
      solver: "rk45",
      step_type: "variable"
    },
    components: [
      {
        id: "V_step",
        type: "VoltageSource",
        label: "DC Source (10V)",
        x: 100,
        y: 350,
        rotation: 0,
        nodes: ["node_in", "node_0"],
        parameters: { value: "10.0" },
        channels: {}
      },
      {
        id: "SW1",
        type: "Switch",
        label: "Primary Step Switch",
        x: 250,
        y: 200,
        rotation: 90,
        nodes: ["node_in", "node_mid1"],
        parameters: { state: "1.0", Ron: "1e-3", Roff: "1e6" },
        channels: {}
      },
      {
        id: "R1",
        type: "Resistor",
        label: "Damping Resistor (0.5 Ohm)",
        x: 400,
        y: 200,
        rotation: 90,
        nodes: ["node_mid1", "node_mid2"],
        parameters: { value: "0.5" },
        channels: {}
      },
      {
        id: "L1",
        type: "Inductor",
        label: "Ringing Inductor (100uH)",
        x: 550,
        y: 200,
        rotation: 90,
        nodes: ["node_mid2", "node_out"],
        parameters: { L: "100u", esr: "0.01", plotI: "1" },
        channels: {}
      },
      {
        id: "C1",
        type: "Capacitor",
        label: "Resonant Capacitor (22uF)",
        x: 680,
        y: 350,
        rotation: 0,
        nodes: ["node_out", "node_0"],
        parameters: { C: "22u", vC0: "0.0", plotV: "1" },
        channels: {}
      }
    ]
  },
  ac_rectifier: {
    name: "AC to DC Filter Rectifier",
    description: "Standard uncontrolled AC-DC rectifier. Converts 60Hz 120V AC input into stable, filtered ripples of DC voltage using a rectifier diode, smoothing reservoir capacitor, and load resistor.",
    solverConfig: {
      stop_time: "0.05",
      step_size: "50u",
      solver: "radau",
      step_type: "variable"
    },
    components: [
      {
        id: "V_ac",
        type: "ACVoltageSource",
        label: "AC Line Grid (120V Peak, 60Hz)",
        x: 100,
        y: 350,
        rotation: 0,
        nodes: ["node_ac", "node_0"],
        parameters: { amplitude: "120.0", frequency: "60.0" },
        channels: {}
      },
      {
        id: "D_rect",
        type: "Diode",
        label: "Rectifier Diode",
        x: 300,
        y: 200,
        rotation: 90,
        nodes: ["node_ac", "node_dc"],
        parameters: { Ron: "5m", Roff: "1e5" },
        channels: {}
      },
      {
        id: "C_reservoir",
        type: "Capacitor",
        label: "Smoothing Filter (470uF)",
        x: 480,
        y: 350,
        rotation: 0,
        nodes: ["node_dc", "node_0"],
        parameters: { C: "470u", vC0: "0.0", plotV: "1" },
        channels: {}
      },
      {
        id: "R_load",
        type: "Resistor",
        label: "Appliance Load (50 Ohm)",
        x: 650,
        y: 350,
        rotation: 0,
        nodes: ["node_dc", "node_0"],
        parameters: { value: "50.0", plotV: "1", plotI: "1" },
        channels: {}
      }
    ]
  },
  h_bridge_inverter: {
    name: "H-Bridge DC-AC Inverter Grid",
    description: "Four MOSFET switches forming an H-bridge configuration loaded with LC low-pass filter. Driven by complementary PWM logic, it modulates a 48VDC bus into clean sinusoidal 60Hz energy.",
    solverConfig: {
      stop_time: "0.02",
      step_size: "2u",
      solver: "euler",
      step_type: "fixed"
    },
    components: [
      {
        id: "V_dc_bus",
        type: "VoltageSource",
        label: "DC Bus (48V)",
        x: 100,
        y: 350,
        rotation: 0,
        nodes: ["node_v_plus", "node_0"],
        parameters: { value: "48.0" },
        channels: {}
      },
      {
        id: "Q1_high_left",
        type: "MOSFET",
        label: "Switch Q1 (High-Left)",
        x: 250,
        y: 180,
        rotation: 90,
        nodes: ["node_v_plus", "node_bridge_a"],
        parameters: { Ron: "1m", Roff: "1e5" },
        channels: { G: "gate_q1" }
      },
      {
        id: "Q2_low_left",
        type: "MOSFET",
        label: "Switch Q2 (Low-Left)",
        x: 250,
        y: 380,
        rotation: 90,
        nodes: ["node_bridge_a", "node_0"],
        parameters: { Ron: "1m", Roff: "1e5" },
        channels: { G: "gate_q2" }
      },
      {
        id: "Q3_high_right",
        type: "MOSFET",
        label: "Switch Q3 (High-Right)",
        x: 450,
        y: 180,
        rotation: 90,
        nodes: ["node_v_plus", "node_bridge_b"],
        parameters: { Ron: "1m", Roff: "1e5" },
        channels: { G: "gate_q3" }
      },
      {
        id: "Q4_low_right",
        type: "MOSFET",
        label: "Switch Q4 (Low-Right)",
        x: 450,
        y: 380,
        rotation: 90,
        nodes: ["node_bridge_b", "node_0"],
        parameters: { Ron: "1m", Roff: "1e5" },
        channels: { G: "gate_q4" }
      },
      {
        id: "L_filter",
        type: "Inductor",
        label: "Filter Inductor (2.2mH)",
        x: 600,
        y: 280,
        rotation: 90,
        nodes: ["node_bridge_a", "node_load_plus"],
        parameters: { L: "2.2m", esr: "0.1" },
        channels: {}
      },
      {
        id: "C_filter",
        type: "Capacitor",
        label: "Filter Cap (10uF)",
        x: 720,
        y: 400,
        rotation: 0,
        nodes: ["node_load_plus", "node_bridge_b"],
        parameters: { C: "10u", vC0: "0.0", plotV: "1" },
        channels: {}
      },
      {
        id: "R_ac_load",
        type: "Resistor",
        label: "AC Resistor Load (10 Ohm)",
        x: 850,
        y: 400,
        rotation: 0,
        nodes: ["node_load_plus", "node_bridge_b"],
        parameters: { value: "10.0", plotV: "1", plotI: "1" },
        channels: {}
      },
      // --- PWM control loops to form alternating output directions ---
      {
        id: "SigGen",
        type: "Triangle_Carrier",
        label: "PWM modulation ref (60Hz)",
        x: 100,
        y: 550,
        rotation: 0,
        nodes: [],
        parameters: { frequency: "60.0", min: "-1.0", max: "1.0" },
        channels: { Out: "sine_mod" }
      },
      {
        id: "Mod_Ref",
        type: "Triangle_Carrier",
        label: "high-f PWM carrier (5kHz)",
        x: 280,
        y: 550,
        rotation: 0,
        nodes: [],
        parameters: { frequency: "5000.0", min: "-1.0", max: "1.0" },
        channels: { Out: "triangle" }
      },
      {
        id: "PWM_Comp_A",
        type: "Comparator",
        label: "PWM Left Driver",
        x: 460,
        y: 550,
        rotation: 0,
        nodes: [],
        parameters: {},
        channels: { Plus: "sine_mod", Minus: "triangle", Out: "gate_q1" }
      },
      {
        id: "PWM_Comp_B",
        type: "Comparator",
        label: "PWM Right Driver",
        x: 640,
        y: 550,
        rotation: 0,
        nodes: [],
        parameters: {},
        channels: { Plus: "triangle", Minus: "sine_mod", Out: "gate_q3" }
      },
      {
        id: "Inv_A",
        type: "NOT_Gate",
        label: "Inverter Q1 to Q2",
        x: 550,
        y: 650,
        rotation: 0,
        nodes: [],
        parameters: {},
        channels: { In: "gate_q1", Out: "gate_q2" }
      },
      {
        id: "Inv_B",
        type: "NOT_Gate",
        label: "Inverter Q3 to Q4",
        x: 730,
        y: 650,
        rotation: 0,
        nodes: [],
        parameters: {},
        channels: { In: "gate_q3", Out: "gate_q4" }
      }
    ]
  }
};
