/// <reference types="node" />
import { CircuitSimulator } from './src/solver_ts';

console.log('[TESTING] Verifying Electrical blocks in CircuitSimulator...\n');

// CircuitSimulator expects the electrical circuit in the form of nodes, not GUI wires.
// We manually define the node connections for our test circuits here.

const physical_stage = [
  // Ckt 1: DC Voltage Source (12V) connected to Resistor (6 ohm)
  // V1 from node_1 to node_0 (Ground is always node_0)
  { id: "V1", type: "VoltageSource", nodes: ["node_1", "node_0"], parameters: { value: "12", src_type: "dc" } },
  { id: "R1", type: "Resistor", nodes: ["node_1", "node_0"], parameters: { value: "6" } },
  { id: "VM1", type: "Voltmeter", nodes: ["node_1", "node_0"], parameters: {} },

  // Ckt 2: DC Current Source (2A) connected to Resistor (5 ohm)
  // I1 from node_2 to node_0
  { id: "I1", type: "CurrentSource", nodes: ["node_2", "node_0"], parameters: { value: "2", src_type: "dc" } },
  { id: "R2", type: "Resistor", nodes: ["node_2", "node_3"], parameters: { value: "5" } },
  { id: "AM1", type: "Ammeter", nodes: ["node_3", "node_0"], parameters: {} }
];

const sim = new CircuitSimulator(physical_stage, [], { t_stop: 0.05, dt: 1e-4 });
const solution = sim.run();

console.log('=== ELECTRICAL MEASUREMENT RESULTS (at t = 0.05s) ===');

const lastIdx = solution.time.length - 1;

if (solution.voltmeters && solution.voltmeters['VM1']) {
    console.log(`DC Voltmeter (VM1) reading: ${solution.voltmeters['VM1'][lastIdx].toFixed(2)} V  (Expected: 12.00 V)`);
}

if (solution.ammeters && solution.ammeters['AM1']) {
    console.log(`DC Ammeter (AM1) reading: ${solution.ammeters['AM1'][lastIdx].toFixed(2)} A  (Expected: 2.00 A)`);
}

console.log('\n✓ Electrical Blocks simulation logic test completed.');
