#include "engine/CScriptEngine.hpp"
#include <iostream>

int main() {
    using namespace CircuitSimEngine;
    std::string code = R"(
const double fs = 10000.0;   // Switching frequency (100 kHz)
const double phi = 0.2;       // Phase shift angle normalized (-0.5 to 0.5)
const double dt = 1e-6;       // Simulation time step (0.1 µs)

double ramp_prim = 0.0;       // Primary carrier accumulator

void step() {
    double next_ramp_prim = ramp_prim + fs * dt;
    ramp_prim = (next_ramp_prim >= 1.0) ? next_ramp_prim - 1.0 : next_ramp_prim;

    double ramp_sec = ramp_prim - phi;
    if (ramp_sec < 0.0) {
        ramp_sec += 1.0;
    } else if (ramp_sec >= 1.0) {
        ramp_sec -= 1.0;
    }

    double g1 = (ramp_prim < 0.5) ? 1.0 : 0.0;
    double g2 = (g1 > 0.5) ? 0.0 : 1.0;
    double g3 = (ramp_prim >= 0.5) ? 1.0 : 0.0;
    double g4 = (g3 > 0.5) ? 0.0 : 1.0;

    outputs[0] = g1; // vgFET1 (S1)
    outputs[1] = g2; // vgFET2 (S2)
    outputs[2] = g3; // vgFET3 (S3)
    outputs[3] = g4; // vgFET4 (S4)
}
)";

    std::unordered_map<std::string, std::string> params;
    params["fs"] = "10000.0";
    params["phi"] = "0.2";
    params["dt"] = "1e-6";
    params["ramp_prim"] = "0.0";

    CScriptEngine engine;
    engine.setup(code, params);

    std::vector<double> inVals(20, 0.0);
    for (int t = 0; t < 5; ++t) {
        engine.step(t * 1e-6, inVals, 1e-6);
        std::cout << "Step " << t 
                  << " -> g1: " << engine.getOutput(0) 
                  << ", g2: " << engine.getOutput(1)
                  << ", g3: " << engine.getOutput(2)
                  << ", g4: " << engine.getOutput(3)
                  << ", ramp_prim: " << engine.getVar("ramp_prim") << "\n";
    }
    return 0;
}
