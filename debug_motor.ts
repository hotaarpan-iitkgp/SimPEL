import fs from 'fs';
import { state } from './src/schematic/state.js';
import { exportDualGraphJSON } from './src/schematic/actions.js';

const jsonStr = fs.readFileSync('working jsons/Electrical_Machines_Test.json', 'utf8');
const data = JSON.parse(jsonStr);
state.components = data.components;
state.wires = data.wires;
const netlist = exportDualGraphJSON(true);

console.log(JSON.stringify(netlist.physical_stage.voltage_sources, null, 2));
