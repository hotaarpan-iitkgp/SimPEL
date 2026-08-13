#include <iostream>
#include <fstream>
#include <sstream>
#include <string>

#include "engine/CircuitSimulator.hpp"
#include "engine/NetlistParser.hpp"
#include "server/SolverServer.hpp"

#include <nlohmann/json.hpp>
using json = nlohmann::json;

void runSelfTest() {
    std::cout << "[C++ SOLVER] Running Self-Test Simulation (12V -> 100 Ohm + 1uF RC Filter)...\n";
    std::string testJson = R"({
        "physical_stage": [
            { "id": "V1", "type": "VoltageSource", "nodes": ["node_1", "0"], "parameters": { "value": "12" } },
            { "id": "R1", "type": "Resistor", "nodes": ["node_1", "node_2"], "parameters": { "value": "100" } },
            { "id": "C1", "type": "Capacitor", "nodes": ["node_2", "0"], "parameters": { "C": "1u" } }
        ],
        "simulation_parameters": {
            "stop_time": "0.001",
            "step_size": "1u"
        }
    })";

    std::vector<CircuitSimEngine::ComponentModel> phys;
    std::vector<CircuitSimEngine::ComponentModel> ctrl;
    CircuitSimEngine::SimulationConfig cfg;

    if (CircuitSimEngine::NetlistParser::parseJsonString(testJson, phys, ctrl, cfg)) {
        CircuitSimEngine::CircuitSimulator sim;
        sim.setup(phys, ctrl, cfg);
        auto out = sim.runTransient();
        std::cout << "[C++ SOLVER] Self-Test PASSED! Computed " << out.time.size() << " steps.\n";
        if (out.voltages.count("node_2") && !out.voltages["node_2"].empty()) {
            std::cout << "  - Final V(node_2): " << out.voltages["node_2"].back() << " V\n";
        }
    } else {
        std::cerr << "[C++ SOLVER] Self-Test FAILED to parse netlist!\n";
    }
}

int main(int argc, char* argv[]) {
    int port = 3001;
    std::string inputFile = "";
    std::string outputFile = "";
    bool testMode = false;

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--port" && i + 1 < argc) {
            port = std::stoi(argv[++i]);
        } else if ((arg == "--input" || arg == "-i") && i + 1 < argc) {
            inputFile = argv[++i];
        } else if ((arg == "--output" || arg == "-o") && i + 1 < argc) {
            outputFile = argv[++i];
        } else if (arg == "--test" || arg == "-t") {
            testMode = true;
        }
    }

    if (testMode) {
        runSelfTest();
        return 0;
    }

    if (!inputFile.empty()) {
        std::ifstream inFile(inputFile);
        if (!inFile.is_open()) {
            std::cerr << "Error opening input netlist file: " << inputFile << std::endl;
            return 1;
        }
        std::stringstream ss;
        ss << inFile.rdbuf();
        std::string netlistStr = ss.str();

        std::vector<CircuitSimEngine::ComponentModel> phys;
        std::vector<CircuitSimEngine::ComponentModel> ctrl;
        CircuitSimEngine::SimulationConfig cfg;

        if (CircuitSimEngine::NetlistParser::parseJsonString(netlistStr, phys, ctrl, cfg)) {
            CircuitSimEngine::CircuitSimulator sim;
            sim.setup(phys, ctrl, cfg);
            auto res = sim.runTransient();

            json outJson;
            outJson["time"] = res.time;
            outJson["voltages"] = res.voltages;
            outJson["inductors"] = res.inductors;
            outJson["voltmeters"] = res.voltmeters;
            outJson["ammeters"] = res.ammeters;
            outJson["signals"] = res.signals;
            outJson["custom_plots"] = res.custom_plots;

            if (!outputFile.empty()) {
                std::ofstream outFile(outputFile);
                outFile << outJson.dump(2);
                std::cout << "Successfully saved simulation results to " << outputFile << std::endl;
            } else {
                std::cout << outJson.dump(2) << std::endl;
            }
        }
        return 0;
    }

    // Default: Start Server
    CircuitSimEngine::SolverServer server(port);
    server.start();

    return 0;
}
