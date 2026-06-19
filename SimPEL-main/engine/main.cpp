#include "simulator.hpp"
#include "json.hpp"
#include <fstream>
#include <iostream>
#include <sstream>
#include <memory>
#include <iomanip>

void serialize_log(CircuitSimulator& sim, const std::string& filepath) {
    std::ofstream f(filepath);
    if (!f.is_open()) {
        std::cerr << "Error writing to " << filepath << std::endl;
        return;
    }

    // Set high precision for double streams
    f << std::setprecision(10);

    f << "{\n";

    // --- time_log ---
    f << "  \"time\": [";
    for (size_t i = 0; i < sim.time_log.size(); ++i) {
        f << sim.time_log[i] << (i + 1 < sim.time_log.size() ? "," : "");
    }
    f << "],\n";

    // --- voltages ---
    f << "  \"voltages\": {\n";
    for (auto it = sim.voltages_log.begin(); it != sim.voltages_log.end(); ++it) {
        f << "    \"" << it->first << "\": [";
        for (size_t i = 0; i < it->second.size(); ++i) {
            f << it->second[i] << (i + 1 < it->second.size() ? "," : "");
        }
        f << "]" << (std::next(it) != sim.voltages_log.end() ? ",\n" : "\n");
    }
    f << "  },\n";

    // --- inductors ---
    f << "  \"inductors\": {\n";
    for (auto it = sim.inductors_log.begin(); it != sim.inductors_log.end(); ++it) {
        f << "    \"" << it->first << "\": [";
        for (size_t i = 0; i < it->second.size(); ++i) {
            f << it->second[i] << (i + 1 < it->second.size() ? "," : "");
        }
        f << "]" << (std::next(it) != sim.inductors_log.end() ? ",\n" : "\n");
    }
    f << "  },\n";

    // --- voltmeters ---
    f << "  \"voltmeters\": {\n";
    for (auto it = sim.voltmeters_log.begin(); it != sim.voltmeters_log.end(); ++it) {
        f << "    \"" << it->first << "\": [";
        for (size_t i = 0; i < it->second.size(); ++i) {
            f << it->second[i] << (i + 1 < it->second.size() ? "," : "");
        }
        f << "]" << (std::next(it) != sim.voltmeters_log.end() ? ",\n" : "\n");
    }
    f << "  },\n";

    // --- ammeters ---
    f << "  \"ammeters\": {\n";
    for (auto it = sim.ammeters_log.begin(); it != sim.ammeters_log.end(); ++it) {
        f << "    \"" << it->first << "\": [";
        for (size_t i = 0; i < it->second.size(); ++i) {
            f << it->second[i] << (i + 1 < it->second.size() ? "," : "");
        }
        f << "]" << (std::next(it) != sim.ammeters_log.end() ? ",\n" : "\n");
    }
    f << "  },\n";

    // --- signals ---
    f << "  \"signals\": {\n";
    for (auto it = sim.signals_log.begin(); it != sim.signals_log.end(); ++it) {
        f << "    \"" << it->first << "\": [";
        for (size_t i = 0; i < it->second.size(); ++i) {
            f << it->second[i] << (i + 1 < it->second.size() ? "," : "");
        }
        f << "]" << (std::next(it) != sim.signals_log.end() ? ",\n" : "\n");
    }
    f << "  },\n";

    // --- custom_plots ---
    f << "  \"custom_plots\": {\n";
    for (auto it = sim.custom_plots_log.begin(); it != sim.custom_plots_log.end(); ++it) {
        f << "    \"" << it->first << "\": [";
        for (size_t i = 0; i < it->second.size(); ++i) {
            f << it->second[i] << (i + 1 < it->second.size() ? "," : "");
        }
        f << "]" << (std::next(it) != sim.custom_plots_log.end() ? ",\n" : "\n");
    }
    f << "  }\n";

    f << "}\n";
    f.close();
}

int main(int argc, char* argv[]) {
    std::string netlist_file = "schematic_netlist.json";
    if (argc > 1) {
        netlist_file = argv[1];
    }

    std::ifstream in(netlist_file);
    if (!in.is_open()) {
        std::cerr << "C++ Solver Error: Netlist file not found: " << netlist_file << std::endl;
        return 1;
    }

    std::stringstream buffer;
    buffer << in.rdbuf();
    std::string json_str = buffer.str();
    in.close();

    try {
        Json root = Json::parse(json_str);

        CircuitSimulator sim;

        // --- 1. Parse Simulation parameters ---
        Json sim_p = root.get("simulation_parameters");
        if (!sim_p.is_null()) {
            sim.sim_params.t_end = parse_scientific(sim_p.get("stop_time").as_string("0.05"));
            sim.sim_params.h = parse_scientific(sim_p.get("step_size").as_string("1e-5"));
            sim.sim_params.solver = sim_p.get("solver").as_string("euler");
            sim.sim_params.step_type = sim_p.get("step_type").as_string("fixed");
        }

        // --- 2. Parse physical_stage components ---
        Json phys = root.get("physical_stage");
        if (phys.is_array()) {
            for (const auto& item : phys.as_array()) {
                Component comp;
                comp.id = item.get("id").as_string();
                comp.type = item.get("type").as_string();

                Json nodes_json = item.get("nodes");
                if (nodes_json.is_array()) {
                    for (const auto& node : nodes_json.as_array()) {
                        comp.nodes.push_back(node.as_string());
                    }
                }

                Json params_json = item.get("parameters");
                if (params_json.is_object()) {
                    for (const auto& pair : params_json.as_object()) {
                        comp.parameters[pair.first] = pair.second.as_string();
                    }
                }

                Json chans_json = item.get("channels");
                if (chans_json.is_object()) {
                    for (const auto& pair : chans_json.as_object()) {
                        comp.channels[pair.first] = pair.second.as_string();
                    }
                }

                sim.physical_stage.push_back(comp);
            }
        }

        // --- 3. Parse control_loops blocks ---
        Json ctrl = root.get("control_loops");
        if (ctrl.is_array()) {
            for (const auto& item : ctrl.as_array()) {
                Component comp;
                comp.id = item.get("id").as_string();
                comp.type = item.get("type").as_string();

                Json nodes_json = item.get("nodes");
                if (nodes_json.is_array()) {
                    for (const auto& node : nodes_json.as_array()) {
                        comp.nodes.push_back(node.as_string());
                    }
                }

                Json params_json = item.get("parameters");
                if (params_json.is_object()) {
                    for (const auto& pair : params_json.as_object()) {
                        comp.parameters[pair.first] = pair.second.as_string();
                    }
                }

                Json chans_json = item.get("channels");
                if (chans_json.is_object()) {
                    for (const auto& pair : chans_json.as_object()) {
                        comp.channels[pair.first] = pair.second.as_string();
                    }
                }

                sim.control_loops.push_back(comp);
            }
        }

        std::cout << "Starting high-performance C++ Transient Solver Core..." << std::endl;
        std::cout << "System Solver Mode: " << sim.sim_params.solver 
                  << ", Timing Step: " << sim.sim_params.h 
                  << " s, Duration: " << sim.sim_params.t_end << " s" << std::endl;

        sim.run();

        // Save solution logs directly to JSON file
        serialize_log(sim, "simulation_results.json");

        std::cout << "C++ transient simulation completed successfully!" << std::endl;
        return 0;

    } catch (const std::exception& e) {
        std::cerr << "C++ Simulation Engine Error: " << e.what() << std::endl;
        return 1;
    }
}
