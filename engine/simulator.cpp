#include "simulator.hpp"
#include <iomanip>
#include <cmath>
#include <iostream>

void split_into_nodes(const std::vector<std::string>& nodes, std::string& n1, std::string& n2) {
    n1 = (nodes.size() > 0) ? nodes[0] : "node_0";
    n2 = (nodes.size() > 1) ? nodes[1] : "node_0";
}

void CircuitSimulator::initializeNetwork() {
    active_nodes.clear();
    node_to_idx.clear();
    L_to_idx.clear();
    V_to_idx.clear();

    resistors.clear();
    capacitors.clear();
    inductors.clear();
    voltage_sources.clear();
    switches.clear();
    voltmeters.clear();

    std::set<std::string> nodes_set;
    for (const auto& comp : physical_stage) {
        for (const auto& node : comp.nodes) {
            nodes_set.insert(node);
        }
    }

    for (const auto& n : nodes_set) {
        if (n != "node_0") {
            active_nodes.push_back(n);
        }
    }
    std::sort(active_nodes.begin(), active_nodes.end());

    for (size_t i = 0; i < active_nodes.size(); ++i) {
        node_to_idx[active_nodes[i]] = static_cast<int>(i);
    }
    num_nodes = active_nodes.size();

    // Grouping
    for (const auto& comp : physical_stage) {
        if (comp.type == "Resistor") {
            resistors.push_back(comp);
        } else if (comp.type == "Capacitor") {
            capacitors.push_back(comp);
        } else if (comp.type == "Inductor") {
            inductors.push_back(comp);
        } else if (comp.type == "VoltageSource" || comp.type == "ACVoltageSource" || comp.type == "Ammeter") {
            voltage_sources.push_back(comp);
        } else if (comp.type == "Switch" || comp.type == "Diode" || comp.type == "MOSFET") {
            switches.push_back(comp);
        } else if (comp.type == "Voltmeter") {
            voltmeters.push_back(comp);
        }
    }

    num_L = inductors.size();
    num_V = voltage_sources.size();
    dim = num_nodes + num_L + num_V;

    M.resize(dim, dim, 0.0);
    K_static.resize(dim, dim, 0.0);
    w.resize(dim, 0.0);

    // Node & sources mapping indexes
    for (size_t i = 0; i < num_L; ++i) {
        L_to_idx[inductors[i].id] = num_nodes + i;
    }
    for (size_t i = 0; i < num_V; ++i) {
        V_to_idx[voltage_sources[i].id] = num_nodes + num_L + i;
    }

    // --- Resistors Conductance stamps ---
    for (const auto& r : resistors) {
        double r_val = r.getParam("value", 10.0);
        if (r_val < 1e-6) r_val = 1e-6;
        double g = 1.0 / r_val;
        std::string n1, n2;
        split_into_nodes(r.nodes, n1, n2);

        int idx1 = (n1 != "node_0" && node_to_idx.count(n1)) ? node_to_idx[n1] : -1;
        int idx2 = (n2 != "node_0" && node_to_idx.count(n2)) ? node_to_idx[n2] : -1;

        if (idx1 >= 0) K_static(idx1, idx1) += g;
        if (idx2 >= 0) K_static(idx2, idx2) += g;
        if (idx1 >= 0 && idx2 >= 0) {
            K_static(idx1, idx2) -= g;
            K_static(idx2, idx1) -= g;
        }
    }

    // --- Capacitors derivative stamps on M ---
    for (const auto& c : capacitors) {
        double c_val = c.getParam("C", 100e-6);
        std::string n1, n2;
        split_into_nodes(c.nodes, n1, n2);

        int idx1 = (n1 != "node_0" && node_to_idx.count(n1)) ? node_to_idx[n1] : -1;
        int idx2 = (n2 != "node_0" && node_to_idx.count(n2)) ? node_to_idx[n2] : -1;

        if (idx1 >= 0) M(idx1, idx1) += c_val;
        if (idx2 >= 0) M(idx2, idx2) += c_val;
        if (idx1 >= 0 && idx2 >= 0) {
            M(idx1, idx2) -= c_val;
            M(idx2, idx1) -= c_val;
        }
    }

    // --- Inductors MNA stamps ---
    for (size_t i = 0; i < num_L; ++i) {
        const auto& ind = inductors[i];
        double l_val = ind.getParam("L", 10e-3);
        double esr = ind.getParam("esr", 0.05);

        std::string n1, n2;
        split_into_nodes(ind.nodes, n1, n2);

        int idx1 = (n1 != "node_0" && node_to_idx.count(n1)) ? node_to_idx[n1] : -1;
        int idx2 = (n2 != "node_0" && node_to_idx.count(n2)) ? node_to_idx[n2] : -1;
        int idx_L = L_to_idx[ind.id];

        if (idx1 >= 0) {
            K_static(idx1, idx_L) += 1.0;
            K_static(idx_L, idx1) -= 1.0;
        }
        if (idx2 >= 0) {
            K_static(idx2, idx_L) -= 1.0;
            K_static(idx_L, idx2) += 1.0;
        }

        M(idx_L, idx_L) += l_val;
        if (esr > 0) {
            K_static(idx_L, idx_L) += esr;
        }
    }

    // --- Voltage Sources, AC Sources & Ammeters stamps ---
    for (const auto& src : voltage_sources) {
        std::string n1, n2;
        split_into_nodes(src.nodes, n1, n2);

        int idx1 = (n1 != "node_0" && node_to_idx.count(n1)) ? node_to_idx[n1] : -1;
        int idx2 = (n2 != "node_0" && node_to_idx.count(n2)) ? node_to_idx[n2] : -1;
        int idx_V = V_to_idx[src.id];

        if (idx1 >= 0) {
            K_static(idx1, idx_V) += 1.0;
            K_static(idx_V, idx1) += 1.0;
        }
        if (idx2 >= 0) {
            K_static(idx2, idx_V) -= 1.0;
            K_static(idx_V, idx2) -= 1.0;
        }
    }

    // Switches states initialization (Default to OFF)
    sw_states.clear();
    for (const auto& sw : switches) {
        sw_states[sw.id] = "OFF";
    }

    // Control loops states & custom blocks compilation
    control_states.clear();
    custom_blocks.clear();
    for (const auto& block : control_loops) {
        if (block.type == "PI_Controller") {
            control_states[block.id]["integral"] = 0.0;
        } else if (block.type == "PWM_Generator" || block.type == "Triangle_Carrier" || block.type == "PWM_MASTER") {
            control_states[block.id]["time"] = 0.0;
        } else if (block.type == "CustomScript") {
            std::map<std::string, double> blk_params;
            for (const auto& p : block.parameters) {
                if (p.first != "code") {
                    blk_params[p.first] = parse_scientific(p.second);
                }
            }
            std::string code_str = block.getParamStr("code", "");
            CustomScriptBlock inst(code_str, blk_params);
            custom_blocks[block.id] = inst;
            control_states[block.id] = inst.state;
        }
    }

    // Identify differential vs algebraic rows
    diff_idx.clear();
    alg_idx.clear();
    for (size_t i = 0; i < dim; ++i) {
        bool row_is_zero = true;
        for (size_t j = 0; j < dim; ++j) {
            if (std::abs(M(i, j)) > 1e-15) {
                row_is_zero = false;
                break;
            }
        }
        if (row_is_zero) {
            alg_idx.push_back(i);
        } else {
            diff_idx.push_back(i);
        }
    }
    is_alg_all_zero = alg_idx.empty();

    // Initial state vector setup
    for (size_t i = 0; i < dim; ++i) w[i] = 0.0;

    // Inductors initial currents
    for (const auto& ind : inductors) {
        double iL0 = ind.getParam("iL0", 0.0);
        w[L_to_idx[ind.id]] = iL0;
    }

    // Capacitors initial voltages
    for (const auto& cap : capacitors) {
        double vC0 = cap.getParam("vC0", 0.0);
        if (vC0 != 0.0) {
            std::string n1, n2;
            split_into_nodes(cap.nodes, n1, n2);
            int idx1 = (n1 != "node_0" && node_to_idx.count(n1)) ? node_to_idx[n1] : -1;
            int idx2 = (n2 != "node_0" && node_to_idx.count(n2)) ? node_to_idx[n2] : -1;

            if (idx2 == -1) { // Node 2 is ground
                if (idx1 >= 0) w[idx1] = vC0;
            } else if (idx1 == -1) { // Node 1 is ground
                if (idx2 >= 0) w[idx2] = -vC0;
            } else { // Floating Capacitor
                w[idx1] = w[idx2] + vC0;
            }
        }
    }

    // Initialize capacitor history logs for UnifiedProbe
    cap_history.clear();
    for (const auto& cap : capacitors) {
        std::string n1, n2;
        split_into_nodes(cap.nodes, n1, n2);
        int idx1 = (n1 != "node_0" && node_to_idx.count(n1)) ? node_to_idx[n1] : -1;
        int idx2 = (n2 != "node_0" && node_to_idx.count(n2)) ? node_to_idx[n2] : -1;

        double v1 = (idx1 >= 0) ? w[idx1] : 0.0;
        double v2 = (idx2 >= 0) ? w[idx2] : 0.0;
        double v0 = v1 - v2;

        CapHistory hist;
        hist.v_prev = v0;
        hist.v_prev_prev = v0;
        hist.dt_prev = sim_params.h;
        cap_history[cap.id] = hist;
    }
}

void CircuitSimulator::stampSwitch(Matrix& K, const Component& sw, const std::string& state) {
    double ron = sw.getParam("Ron", 1e-3);
    double roff = sw.getParam("Roff", 1e6);
    double r_val = (state == "ON") ? ron : roff;
    double g = 1.0 / r_val;

    std::string n1, n2;
    split_into_nodes(sw.nodes, n1, n2);
    int idx1 = (n1 != "node_0" && node_to_idx.count(n1)) ? node_to_idx[n1] : -1;
    int idx2 = (n2 != "node_0" && node_to_idx.count(n2)) ? node_to_idx[n2] : -1;

    if (idx1 >= 0) K(idx1, idx1) += g;
    if (idx2 >= 0) K(idx2, idx2) += g;
    if (idx1 >= 0 && idx2 >= 0) {
        K(idx1, idx2) -= g;
        K(idx2, idx1) -= g;
    }
}

struct CarrierConfig {
    int id = 1;
    std::string phase_source = "internal";
    double phase = 0.0;
    bool level_shift = false;
    double level_offset = 0.0;
};

inline std::vector<CarrierConfig> parse_pwm_config(const std::string& json, int N) {
    std::vector<CarrierConfig> configs(N + 1);
    for (int i = 1; i <= N; i++) {
        configs[i].id = i;
        if (i == 1) {
            configs[i].phase_source = "internal";
            configs[i].phase = 0.0;
        } else {
            configs[i].phase_source = "internal";
            configs[i].phase = (i - 1) * 360.0 / N;
        }
        configs[i].level_shift = false;
        configs[i].level_offset = 0.0;
    }

    for (int i = 1; i <= N; i++) {
        std::string search_id = "\"id\":" + std::to_string(i);
        size_t id_pos = json.find(search_id);
        if (id_pos == std::string::npos) continue;

        size_t end_pos = json.find("}", id_pos);
        if (end_pos == std::string::npos) continue;

        std::string obj_str = json.substr(id_pos, end_pos - id_pos);

        size_t ps_pos = obj_str.find("\"phase_source\":\"");
        if (ps_pos != std::string::npos) {
            size_t val_start = ps_pos + 16;
            size_t val_end = obj_str.find("\"", val_start);
            if (val_end != std::string::npos) {
                configs[i].phase_source = obj_str.substr(val_start, val_end - val_start);
            }
        }

        size_t p_pos = obj_str.find("\"phase\":");
        if (p_pos != std::string::npos) {
            size_t val_start = p_pos + 8;
            size_t comma_pos = obj_str.find(",", val_start);
            std::string val_str = obj_str.substr(val_start, comma_pos - val_start);
            try {
                configs[i].phase = std::stod(val_str);
            } catch (...) {}
        }

        size_t ls_pos = obj_str.find("\"level_shift\":");
        if (ls_pos != std::string::npos) {
            size_t val_start = ls_pos + 14;
            if (obj_str.substr(val_start, 4) == "true") {
                configs[i].level_shift = true;
            }
        }

        size_t lo_pos = obj_str.find("\"level_offset\":");
        if (lo_pos != std::string::npos) {
            size_t val_start = lo_pos + 15;
            size_t comma_pos = obj_str.find(",", val_start);
            if (comma_pos == std::string::npos) comma_pos = obj_str.size();
            std::string val_str = obj_str.substr(val_start, comma_pos - val_start);
            size_t bracket = val_str.find("}");
            if (bracket != std::string::npos) val_str = val_str.substr(0, bracket);
            try {
                configs[i].level_offset = std::stod(val_str);
            } catch (...) {}
        }
    }
    return configs;
}

std::map<std::string, double> CircuitSimulator::evaluateControls(
    double t_curr, const Vector& w_curr,
    std::map<std::string, std::map<std::string, double>>& ctrl_states,
    double dt_val, const std::map<std::string, std::string>& sw_states_curr,
    bool is_first_step) {

    std::map<std::string, double> signals_local;

    // Fast solving for feed-forward static signals first
    for (const auto& block : control_loops) {
        std::string out_chan = block.getChannelRef("Out");
        if (out_chan.empty()) continue;

        if (block.type == "Constant") {
            signals_local[out_chan] = block.getParam("value", 1.0);
        } else if (block.type == "Triangle_Carrier") {
            double freq = block.getParam("frequency", 10e3);
            double v_min = block.getParam("min", 0.0);
            double v_max = block.getParam("max", 1.0);
            double period = 1.0 / freq;
            double t_local = std::fmod(t_curr, period);
            double val = 0.0;
            if (t_local < period / 2.0) {
                val = v_min + (v_max - v_min) * (t_local / (period / 2.0));
            } else {
                val = v_max - (v_max - v_min) * ((t_local - period / 2.0) / (period / 2.0));
            }
            signals_local[out_chan] = val;
        }
    }

    // Run convergence iterations for interdependent control elements
    for (int iter = 0; iter < 3; ++iter) {
        // Resolve physical meters & probes
        for (const auto& comp : physical_stage) {
            std::string out_chan = comp.getChannelRef("Out");

            if (comp.type == "Voltmeter" && !out_chan.empty()) {
                std::string n1, n2;
                split_into_nodes(comp.nodes, n1, n2);
                int idx1 = (n1 != "node_0" && node_to_idx.count(n1)) ? node_to_idx[n1] : -1;
                int idx2 = (n2 != "node_0" && node_to_idx.count(n2)) ? node_to_idx[n2] : -1;
                double v1 = (idx1 >= 0) ? w_curr[idx1] : 0.0;
                double v2 = (idx2 >= 0) ? w_curr[idx2] : 0.0;
                signals_local[out_chan] = v1 - v2;
            } else if (comp.type == "Ammeter" && !out_chan.empty()) {
                int idx_V = V_to_idx.count(comp.id) ? V_to_idx[comp.id] : -1;
                signals_local[out_chan] = (idx_V >= 0) ? w_curr[idx_V] : 0.0;
            } else if (comp.type == "UnifiedProbe") {
                std::string target_id = comp.getParamStr("target", "");
                double v_val = 0.0;
                double i_val = 0.0;

                if (!target_id.empty()) {
                    // Find target component
                    const Component* target_comp = nullptr;
                    for (const auto& c : physical_stage) {
                        if (c.id == target_id) {
                            target_comp = &c;
                            break;
                        }
                    }

                    if (target_comp) {
                        std::string tn1, tn2;
                        split_into_nodes(target_comp->nodes, tn1, tn2);
                        int t_idx1 = (tn1 != "node_0" && node_to_idx.count(tn1)) ? node_to_idx[tn1] : -1;
                        int t_idx2 = (tn2 != "node_0" && node_to_idx.count(tn2)) ? node_to_idx[tn2] : -1;

                        double tv1 = (t_idx1 >= 0) ? w_curr[t_idx1] : 0.0;
                        double tv2 = (t_idx2 >= 0) ? w_curr[t_idx2] : 0.0;
                        v_val = tv1 - tv2;

                        if (target_comp->type == "Resistor") {
                            double r_val = target_comp->getParam("value", 10.0);
                            if (r_val < 1e-6) r_val = 1e-6;
                            i_val = v_val / r_val;
                        } else if (target_comp->type == "Inductor") {
                            if (L_to_idx.count(target_id)) {
                                i_val = w_curr[L_to_idx[target_id]];
                            }
                        } else if (target_comp->type == "Capacitor") {
                            double c_val = target_comp->getParam("C", 100e-6);
                            if (is_first_step) {
                                i_val = 0.0;
                            } else {
                                if (cap_history.count(target_id)) {
                                    const auto& hist = cap_history[target_id];
                                    i_val = c_val / hist.dt_prev * (v_val - hist.v_prev);
                                }
                            }
                        } else if (target_comp->type == "VoltageSource" || target_comp->type == "ACVoltageSource" || target_comp->type == "Ammeter") {
                            if (V_to_idx.count(target_id)) {
                                i_val = w_curr[V_to_idx[target_id]];
                            }
                        } else if (target_comp->type == "Switch" || target_comp->type == "Diode" || target_comp->type == "MOSFET") {
                            double ron = target_comp->getParam("Ron", 1e-3);
                            double roff = target_comp->getParam("Roff", 1e6);
                            std::string sw_state = "OFF";
                            auto it = sw_states_curr.find(target_id);
                            if (it != sw_states_curr.end()) sw_state = it->second;
                            double r_curr = (sw_state == "ON") ? ron : roff;
                            i_val = v_val / r_curr;
                        } else if (target_comp->type == "CurrentSource") {
                            i_val = target_comp->getParam("value", 1.0);
                        }
                    }
                }

                std::string out_v_sig = comp.getChannelRef("OutV");
                std::string out_i_sig = comp.getChannelRef("OutI");
                if (!out_v_sig.empty()) signals_local[out_v_sig] = v_val;
                if (!out_i_sig.empty()) signals_local[out_i_sig] = i_val;
            }
        }

        // Evaluate signal processors
        for (const auto& block : control_loops) {
            std::string out_chan = block.getChannelRef("Out");
            if (out_chan.empty() && block.type != "PWM_MASTER") continue;

            if (block.type == "PWM_MASTER") {
                int N = (int)block.getParam("num_carriers", 3.0);
                double fc = parse_scientific(block.getParamStr("fc", "10k"));
                double dead_time = parse_scientific(block.getParamStr("dead_time", "1u"));
                std::string config_str = block.getParamStr("config", "[]");
                
                auto config = parse_pwm_config(config_str, N);
                
                bool is_common = (block.getParamStr("common_modulation", "false") == "true");
                double Tc = 1.0 / fc;

                for (int idx = 1; idx <= N; idx++) {
                    double v_mod = 0.0;
                    if (is_common) {
                        std::string in_chan = block.getChannelRef("In");
                        v_mod = in_chan.empty() ? 0.0 : signals_local[in_chan];
                    } else {
                        std::string in_chan = block.getChannelRef("In" + std::to_string(idx));
                        v_mod = in_chan.empty() ? 0.0 : signals_local[in_chan];
                    }
                    double phase_deg = 0.0;
                    double l_offset = 0.0;

                    const auto& c_conf = config[idx];
                    if (idx > 1 && c_conf.phase_source == "external") {
                        std::string ext_phase_chan = block.getChannelRef("ExtPhase" + std::to_string(idx));
                        phase_deg = ext_phase_chan.empty() ? 0.0 : signals_local[ext_phase_chan];
                    } else {
                        phase_deg = c_conf.phase;
                    }
                    l_offset = c_conf.level_shift ? c_conf.level_offset : 0.0;

                    double t_offset = (phase_deg / 360.0) * Tc;
                    double t_local = std::fmod(t_curr - t_offset, Tc);
                    if (t_local < 0) t_local += Tc;

                    double tri_val = (t_local < Tc / 2.0)
                        ? (t_local / (Tc / 2.0))
                        : (1.0 - (t_local - Tc / 2.0) / (Tc / 2.0));

                    double v_carrier = tri_val + l_offset;

                    int target_direct = (v_mod >= v_carrier) ? 1 : 0;
                    int target_compl = (target_direct == 0) ? 1 : 0;

                    std::string k_ltd = "last_target_direct_" + std::to_string(idx);
                    std::string k_ltc = "last_target_compl_" + std::to_string(idx);
                    std::string k_lttd = "last_transition_time_direct_" + std::to_string(idx);
                    std::string k_lttc = "last_transition_time_compl_" + std::to_string(idx);

                    if (ctrl_states[block.id].count(k_ltd) == 0) {
                        ctrl_states[block.id][k_ltd] = 0.0;
                        ctrl_states[block.id][k_ltc] = 0.0;
                        ctrl_states[block.id][k_lttd] = 0.0;
                        ctrl_states[block.id][k_lttc] = 0.0;
                    }

                    int prev_td = (int)ctrl_states[block.id][k_ltd];
                    int prev_tc = (int)ctrl_states[block.id][k_ltc];
                    double trans_time_direct = ctrl_states[block.id][k_lttd];
                    double trans_time_compl = ctrl_states[block.id][k_lttc];

                    if (target_direct == 1 && prev_td == 0) {
                        trans_time_direct = t_curr;
                    }
                    if (target_compl == 1 && prev_tc == 0) {
                        trans_time_compl = t_curr;
                    }

                    ctrl_states[block.id][k_ltd] = target_direct;
                    ctrl_states[block.id][k_ltc] = target_compl;
                    ctrl_states[block.id][k_lttd] = trans_time_direct;
                    ctrl_states[block.id][k_lttc] = trans_time_compl;

                    double out_d = (target_direct == 1 && (t_curr - trans_time_direct >= dead_time)) ? 1.0 : 0.0;
                    double out_c = (target_compl == 1 && (t_curr - trans_time_compl >= dead_time)) ? 1.0 : 0.0;

                    std::string out_d_chan = block.getChannelRef("OutDirect" + std::to_string(idx));
                    std::string out_c_chan = block.getChannelRef("OutCompl" + std::to_string(idx));
                    if (!out_d_chan.empty()) signals_local[out_d_chan] = out_d;
                    if (!out_c_chan.empty()) signals_local[out_c_chan] = out_c;
                }
            } else if (block.type == "Gain") {
                double k = block.getParam("K", 1.0);
                double in_val = signals_local[block.getChannelRef("In")];
                signals_local[out_chan] = k * in_val;
            } else if (block.type == "SummingJunction") {
                double v_a = signals_local[block.getChannelRef("A")];
                double v_b = signals_local[block.getChannelRef("B")];
                signals_local[out_chan] = v_a - v_b;
            } else if (block.type == "PI_Controller") {
                double kp = block.getParam("Kp", 2.5);
                double ki = block.getParam("Ki", 50.0);
                double in_val = signals_local[block.getChannelRef("In")];
                double integral = ctrl_states[block.id]["integral"];
                signals_local[out_chan] = kp * in_val + ki * integral;
            } else if (block.type == "Comparator") {
                double v_plus = signals_local[block.getChannelRef("Plus")];
                double v_minus = signals_local[block.getChannelRef("Minus")];
                signals_local[out_chan] = (v_plus >= v_minus) ? 1.0 : 0.0;
            } else if (block.type == "AND_Gate") {
                double v_a = signals_local[block.getChannelRef("A")];
                double v_b = signals_local[block.getChannelRef("B")];
                signals_local[out_chan] = (v_a > 0.5 && v_b > 0.5) ? 1.0 : 0.0;
            } else if (block.type == "OR_Gate") {
                double v_a = signals_local[block.getChannelRef("A")];
                double v_b = signals_local[block.getChannelRef("B")];
                signals_local[out_chan] = (v_a > 0.5 || v_b > 0.5) ? 1.0 : 0.0;
            } else if (block.type == "NOT_Gate") {
                double v_in = signals_local[block.getChannelRef("In")];
                signals_local[out_chan] = (v_in < 0.5) ? 1.0 : 0.0;
            } else if (block.type == "Product") {
                double v1 = signals_local[block.getChannelRef("In1")];
                double v2 = signals_local[block.getChannelRef("In2")];
                signals_local[out_chan] = v1 * v2;
            } else if (block.type == "CustomFunction") {
                double in_val = signals_local[block.getChannelRef("In")];
                // default expr is "u * 2"
                std::string expr = block.getParamStr("expr", "u * 2");
                // Fast parse fallback
                ExpressionEvaluator eval;
                std::map<std::string, double> variables;
                variables["u"] = in_val;
                signals_local[out_chan] = eval.evaluate(expr, variables);
            } else if (block.type == "Mux") {
                // Returns first input channel value as a scalar (as vector features collapse into scalar loops mostly)
                signals_local[out_chan] = signals_local[block.getChannelRef("In1")];
            } else if (block.type == "Demux") {
                double in_val = signals_local[block.getChannelRef("In")];
                signals_local[block.getChannelRef("Out1")] = in_val;
                signals_local[block.getChannelRef("Out2")] = 0.0;
            } else if (block.type == "CustomScript") {
                if (custom_blocks.count(block.id)) {
                    auto& block_inst = custom_blocks[block.id];
                    std::map<std::string, double> inputs_dict;
                    for (const auto& port : block_inst.inputs) {
                        std::string chan_name = block.getChannelRef(port);
                        inputs_dict[port] = (!chan_name.empty()) ? signals_local[chan_name] : 0.0;
                    }
                    block_inst.state = ctrl_states[block.id];
                    auto outputs_dict = block_inst.step(t_curr, inputs_dict);
                    ctrl_states[block.id] = block_inst.state;

                    for (const auto& pair : outputs_dict) {
                        std::string chan_name = block.getChannelRef(pair.first);
                        if (!chan_name.empty()) {
                            signals_local[chan_name] = pair.second;
                        }
                    }
                }
            }
        }
    }

    return signals_local;
}

Vector CircuitSimulator::compute_k(
    double t_stage, const Vector& w_stage,
    std::map<std::string, std::map<std::string, double>>& ctrl_states,
    double dt_val, const std::map<std::string, std::string>& sw_states_curr) {

    Vector w_local = w_stage;
    Matrix K = K_static;

    // Stamp active switch states
    for (const auto& sw : switches) {
        std::string sw_st = sw_states_curr.count(sw.id) ? sw_states_curr.at(sw.id) : "OFF";
        stampSwitch(K, sw, sw_st);
    }

    Vector b(dim, 0.0);
    // Source values
    for (const auto& src : voltage_sources) {
        int idx_V = V_to_idx[src.id];
        if (src.type == "VoltageSource") {
            b[idx_V] = src.getParam("value", 24.0);
        } else if (src.type == "ACVoltageSource") {
            double amp = src.getParam("amplitude", 12.0);
            double freq = src.getParam("frequency", 50.0);
            b[idx_V] = amp * std::sin(2.0 * M_PI * freq * t_stage);
        } else if (src.type == "Ammeter") {
            b[idx_V] = 0.0;
        }
    }

    // Current sources stamps in b vector
    for (const auto& comp : physical_stage) {
        if (comp.type == "CurrentSource") {
            std::string n1, n2;
            split_into_nodes(comp.nodes, n1, n2);
            int idx1 = (n1 != "node_0" && node_to_idx.count(n1)) ? node_to_idx[n1] : -1;
            int idx2 = (n2 != "node_0" && node_to_idx.count(n2)) ? node_to_idx[n2] : -1;
            double i_val = comp.getParam("value", 1.0);
            if (idx1 >= 0) b[idx1] -= i_val;
            if (idx2 >= 0) b[idx2] += i_val;
        }
    }

    // Solve for algebraic constraint variables
    if (!alg_idx.empty() && !diff_idx.empty()) {
        Matrix K_aa = K.submatrix(alg_idx, alg_idx);
        Matrix K_ad = K.submatrix(alg_idx, diff_idx);

        Vector b_a(alg_idx.size());
        for (size_t i = 0; i < alg_idx.size(); ++i) {
            b_a[i] = b[alg_idx[i]];
        }

        Vector w_diff(diff_idx.size());
        for (size_t i = 0; i < diff_idx.size(); ++i) {
            w_diff[i] = w_local[diff_idx[i]];
        }

        Vector K_ad_w_diff = K_ad * w_diff;
        Vector b_sub = b_a - K_ad_w_diff;

        try {
            Vector w_alg_solved = K_aa.solve(b_sub);
            for (size_t i = 0; i < alg_idx.size(); ++i) {
                w_local[alg_idx[i]] = w_alg_solved[i];
            }
        } catch (...) {
            // Keep previous algebraic values on singular solving failure
        }
    } else if (!alg_idx.empty() && diff_idx.empty()) {
        try {
            w_local = K.solve(b);
        } catch (...) {}
    }

    // --- Resolve control loop and switches states inside derivative solver ---
    for (int iter = 0; iter < 3; ++iter) {
        auto stage_ctrl = ctrl_states;
        auto signals_local = evaluateControls(t_stage, w_local, stage_ctrl, dt_val, sw_states_curr);

        // Map switch states
        std::map<std::string, std::string> sw_stage_states = sw_states_curr;
        bool any_change = false;

        for (const auto& sw : switches) {
            std::string sw_id = sw.id;
            std::string sw_type = sw.type;

            std::string n1, n2;
            split_into_nodes(sw.nodes, n1, n2);
            int idx1 = (n1 != "node_0" && node_to_idx.count(n1)) ? node_to_idx[n1] : -1;
            int idx2 = (n2 != "node_0" && node_to_idx.count(n2)) ? node_to_idx[n2] : -1;

            double v1 = (idx1 >= 0) ? w_local[idx1] : 0.0;
            double v2 = (idx2 >= 0) ? w_local[idx2] : 0.0;
            double vd = v1 - v2;

            std::string old_state = sw_stage_states[sw_id];
            std::string new_state = "OFF";

            if (sw_type == "MOSFET") {
                double gate_val = signals_local[sw.getChannelRef("G")];
                new_state = (gate_val > 0.5) ? "ON" : "OFF";
            } else if (sw_type == "Diode") {
                double threshold = (old_state == "ON") ? 0.0 : 0.7;
                new_state = (vd > threshold) ? "ON" : "OFF";
            } else if (sw_type == "Switch") {
                double sw_val = sw.getParam("state", 0.0);
                new_state = (sw_val > 0.5) ? "ON" : "OFF";
            }

            if (new_state != old_state) {
                sw_stage_states[sw_id] = new_state;
                any_change = true;
            }
        }

        if (any_change) {
            // Rebuild K and re-solve algebraic equations
            K = K_static;
            for (const auto& sw : switches) {
                std::string sw_st = sw_stage_states[sw.id];
                stampSwitch(K, sw, sw_st);
            }
            if (!alg_idx.empty() && !diff_idx.empty()) {
                Matrix K_aa = K.submatrix(alg_idx, alg_idx);
                Matrix K_ad = K.submatrix(alg_idx, diff_idx);
                Vector b_a(alg_idx.size());
                for (size_t i = 0; i < alg_idx.size(); ++i) b_a[i] = b[alg_idx[i]];

                Vector w_diff(diff_idx.size());
                for (size_t i = 0; i < diff_idx.size(); ++i) w_diff[i] = w_local[diff_idx[i]];

                try {
                    Vector w_alg_solved = K_aa.solve(b_a - (K_ad * w_diff));
                    for (size_t i = 0; i < alg_idx.size(); ++i) w_local[alg_idx[i]] = w_alg_solved[i];
                } catch (...) {}
            }
        } else {
            break;
        }
    }

    // Final derivative computation: M * dw = rhs
    Vector rhs = b - (K * w_local);
    Vector dw(dim, 0.0);

    if (!diff_idx.empty()) {
        Matrix M_dd = M.submatrix(diff_idx, diff_idx);
        Vector rhs_diff(diff_idx.size());
        for (size_t i = 0; i < diff_idx.size(); ++i) {
            rhs_diff[i] = rhs[diff_idx[i]];
        }
        try {
            Vector dw_diff_solved = M_dd.solve(rhs_diff);
            for (size_t i = 0; i < diff_idx.size(); ++i) {
                dw[diff_idx[i]] = dw_diff_solved[i];
            }
        } catch (...) {
            // Degenerate case - zero derivatives
        }
    }

    return dw;
}

std::tuple<Vector, std::map<std::string, std::map<std::string, double>>, std::map<std::string, std::string>, std::vector<LogAcceptedState>>
CircuitSimulator::takeStep(double t_curr, const Vector& w_curr, double dt_val, const std::string& solver_type,
                           const std::map<std::string, std::map<std::string, double>>& ctrl_states,
                           const std::map<std::string, std::string>& sw_states_curr) {

    std::vector<LogAcceptedState> out_trans;
    Vector w_new = w_curr;
    auto ctrl_new = ctrl_states;
    auto sw_new = sw_states_curr;

    if (solver_type == "euler") {
        // --- Backward Euler implicit solver step ---
        std::map<std::string, std::string> sw_stage_states = sw_states_curr;
        bool switch_changed = true;
        int inner_loops = 0;

        while (switch_changed && inner_loops < 10) {
            switch_changed = false;
            inner_loops++;

            Matrix K = K_static;
            for (const auto& sw : switches) {
                std::string sw_st = sw_stage_states[sw.id];
                stampSwitch(K, sw, sw_st);
            }

            Vector b(dim, 0.0);
            for (const auto& src : voltage_sources) {
                int idx_V = V_to_idx[src.id];
                if (src.type == "VoltageSource") {
                    b[idx_V] = src.getParam("value", 24.0);
                } else if (src.type == "ACVoltageSource") {
                    double amp = src.getParam("amplitude", 12.0);
                    double freq = src.getParam("frequency", 50.0);
                    b[idx_V] = amp * std::sin(2.0 * M_PI * freq * (t_curr + dt_val));
                } else if (src.type == "Ammeter") {
                    b[idx_V] = 0.0;
                }
            }

            for (const auto& comp : physical_stage) {
                if (comp.type == "CurrentSource") {
                    std::string n1, n2;
                    split_into_nodes(comp.nodes, n1, n2);
                    int idx1 = (n1 != "node_0" && node_to_idx.count(n1)) ? node_to_idx[n1] : -1;
                    int idx2 = (n2 != "node_0" && node_to_idx.count(n2)) ? node_to_idx[n2] : -1;
                    double i_val = comp.getParam("value", 1.0);
                    if (idx1 >= 0) b[idx1] -= i_val;
                    if (idx2 >= 0) b[idx2] += i_val;
                }
            }

            // A_num = M / dt + K
            Matrix A_num(dim, dim);
            for (size_t r = 0; r < dim; ++r) {
                for (size_t c = 0; c < dim; ++c) {
                    A_num(r, c) = M(r, c) / dt_val + K(r, c);
                }
            }

            // b_num_val = (M / dt) * w_curr + b
            Vector M_w_curr(dim, 0.0);
            for (size_t r = 0; r < dim; ++r) {
                double sum = 0.0;
                for (size_t c = 0; c < dim; ++c) {
                    sum += (M(r, c) / dt_val) * w_curr[c];
                }
                M_w_curr[r] = sum;
            }
            Vector b_num_val = M_w_curr + b;

            try {
                w_new = A_num.solve(b_num_val);
            } catch (...) {
                // Solver fail - keep current
            }

            // Check switch state changes at the end of implicit step
            auto temp_ctrl_states = ctrl_states;
            auto signals_local = evaluateControls(t_curr + dt_val, w_new, temp_ctrl_states, dt_val, sw_stage_states);

            bool any_change = false;
            std::map<std::string, std::string> next_sw;

            for (const auto& sw : switches) {
                std::string sw_id = sw.id;
                std::string sw_type = sw.type;

                std::string n1, n2;
                split_into_nodes(sw.nodes, n1, n2);
                int idx1 = (n1 != "node_0" && node_to_idx.count(n1)) ? node_to_idx[n1] : -1;
                int idx2 = (n2 != "node_0" && node_to_idx.count(n2)) ? node_to_idx[n2] : -1;

                double v1 = (idx1 >= 0) ? w_new[idx1] : 0.0;
                double v2 = (idx2 >= 0) ? w_new[idx2] : 0.0;
                double vd = v1 - v2;

                std::string old_state = sw_stage_states[sw_id];
                std::string new_state = "OFF";

                if (sw_type == "MOSFET") {
                    double gate_val = signals_local[sw.getChannelRef("G")];
                    new_state = (gate_val > 0.5) ? "ON" : "OFF";
                } else if (sw_type == "Diode") {
                    double threshold = (old_state == "ON") ? 0.0 : 0.7;
                    new_state = (vd > threshold) ? "ON" : "OFF";
                } else if (sw_type == "Switch") {
                    double sw_val = sw.getParam("state", 0.0);
                    new_state = (sw_val > 0.5) ? "ON" : "OFF";
                }

                next_sw[sw_id] = new_state;
                if (new_state != old_state) {
                    any_change = true;
                }
            }

            if (any_change) {
                if (inner_loops == 1) {
                    // Record transition state matching Python's pre_trans_record
                    LogAcceptedState trans;
                    trans.time = t_curr + dt_val;
                    trans.w = w_new.data;
                    trans.signals = signals_local;
                    trans.sw_states = sw_stage_states;
                    trans.dt = dt_val;
                    out_trans.push_back(trans);
                }
                sw_stage_states = next_sw;
                switch_changed = true;
            }
        }

        sw_new = sw_stage_states;
        ctrl_new = ctrl_states;
        // update Custom scripts inside backward Euler step
        for (const auto& block : control_loops) {
            if (block.type == "CustomScript") {
                if (custom_blocks.count(block.id)) {
                    auto& block_inst = custom_blocks[block.id];
                    std::map<std::string, double> inputs_dict;
                    for (const auto& port : block_inst.inputs) {
                        std::string chan_name = block.getChannelRef(port);
                        inputs_dict[port] = 0.0; // standard bindings updated inside step anyway
                    }
                    block_inst.state = ctrl_new[block.id];
                    block_inst.step(t_curr + dt_val, inputs_dict);
                    ctrl_new[block.id] = block_inst.state;
                }
            }
        }
    }
    else if (solver_type == "rk45") {
        // --- High-Performance DAE-Aware rk45 ---
        Vector k1 = compute_k(t_curr, w_curr, ctrl_new, dt_val, sw_new);
        Vector k2 = compute_k(t_curr + 0.2 * dt_val, w_curr + (dt_val * 0.2) * k1, ctrl_new, dt_val, sw_new);
        Vector k3 = compute_k(t_curr + 0.3 * dt_val, w_curr + dt_val * (3.0/40.0 * k1 + 9.0/40.0 * k2), ctrl_new, dt_val, sw_new);
        Vector k4 = compute_k(t_curr + 0.8 * dt_val, w_curr + dt_val * (44.0/45.0 * k1 - 56.0/15.0 * k2 + 32.0/9.0 * k3), ctrl_new, dt_val, sw_new);
        Vector k5 = compute_k(t_curr + 8.0/9.0 * dt_val, w_curr + dt_val * (19372.0/6561.0 * k1 - 25360.0/2187.0 * k2 + 64448.0/6561.0 * k3 - 212.0/729.0 * k4), ctrl_new, dt_val, sw_new);
        Vector k6 = compute_k(t_curr + dt_val, w_curr + dt_val * (9017.0/3168.0 * k1 - 355.0/33.0 * k2 + 46732.0/5247.0 * k3 + 49.0/176.0 * k4 - 5103.0/18656.0 * k5), ctrl_new, dt_val, sw_new);

        w_new = w_curr + dt_val * (35.0/384.0 * k1 + 500.0/1113.0 * k3 + 125.0/192.0 * k4 - 2187.0/6784.0 * k5 + 11.0/84.0 * k6);

        // Algebraic projection iterations for switch consistency
        Vector w_consistent = w_new;
        std::map<std::string, std::string> sw_stage_states = sw_new;

        for (int iter = 0; iter < 3; ++iter) {
            auto temp_ctrl_states = ctrl_states;
            auto signals_local = evaluateControls(t_curr + dt_val, w_consistent, temp_ctrl_states, dt_val, sw_stage_states);

            bool any_change = false;
            std::map<std::string, std::string> next_sw = sw_stage_states;

            for (const auto& sw : switches) {
                std::string sw_id = sw.id;
                std::string sw_type = sw.type;

                std::string n1, n2;
                split_into_nodes(sw.nodes, n1, n2);
                int idx1 = (n1 != "node_0" && node_to_idx.count(n1)) ? node_to_idx[n1] : -1;
                int idx2 = (n2 != "node_0" && node_to_idx.count(n2)) ? node_to_idx[n2] : -1;

                double v1 = (idx1 >= 0) ? w_consistent[idx1] : 0.0;
                double v2 = (idx2 >= 0) ? w_consistent[idx2] : 0.0;
                double vd = v1 - v2;

                std::string old_state = sw_stage_states[sw_id];
                std::string new_state = "OFF";

                if (sw_type == "MOSFET") {
                    double gate_val = signals_local[sw.getChannelRef("G")];
                    new_state = (gate_val > 0.5) ? "ON" : "OFF";
                } else if (sw_type == "Diode") {
                    double threshold = (old_state == "ON") ? 0.0 : 0.7;
                    new_state = (vd > threshold) ? "ON" : "OFF";
                } else if (sw_type == "Switch") {
                    double sw_val = sw.getParam("state", 0.0);
                    new_state = (sw_val > 0.5) ? "ON" : "OFF";
                }

                next_sw[sw_id] = new_state;
                if (new_state != old_state) {
                    any_change = true;
                }
            }

            if (any_change) {
                if (iter == 0) {
                    LogAcceptedState trans;
                    trans.time = t_curr + dt_val;
                    trans.w = w_consistent.data;
                    trans.signals = signals_local;
                    trans.sw_states = sw_stage_states;
                    trans.dt = dt_val;
                    out_trans.push_back(trans);
                }
                sw_stage_states = next_sw;

                // Re-stamp switches and re-solve algebraic constraint values
                Matrix K = K_static;
                for (const auto& sw : switches) {
                    stampSwitch(K, sw, sw_stage_states[sw.id]);
                }

                Vector b(dim, 0.0);
                for (const auto& src : voltage_sources) {
                    int idx_V = V_to_idx[src.id];
                    b[idx_V] = (src.type == "VoltageSource") ? src.getParam("value", 24.0) : 0.0;
                }

                if (!alg_idx.empty() && !diff_idx.empty()) {
                    Matrix K_aa = K.submatrix(alg_idx, alg_idx);
                    Matrix K_ad = K.submatrix(alg_idx, diff_idx);
                    Vector b_a(alg_idx.size());
                    for (size_t i = 0; i < alg_idx.size(); ++i) b_a[i] = b[alg_idx[i]];

                    Vector w_diff(diff_idx.size());
                    for (size_t i = 0; i < diff_idx.size(); ++i) w_diff[i] = w_consistent[diff_idx[i]];

                    try {
                        Vector w_alg_solved = K_aa.solve(b_a - (K_ad * w_diff));
                        for (size_t i = 0; i < alg_idx.size(); ++i) w_consistent[alg_idx[i]] = w_alg_solved[i];
                    } catch (...) {}
                }
            } else {
                break;
            }
        }
        w_new = w_consistent;
        sw_new = sw_stage_states;
    }
    else if (solver_type == "radau") {
        // --- 3-Stage Fully Implicit Radau IIA order 5 ---
        double sqrt6 = std::sqrt(6.0);
        double c_radau[3] = {
            (4.0 - sqrt6) / 10.0,
            (4.0 + sqrt6) / 10.0,
            1.0
        };

        double a_radau[3][3] = {
            { (88.0 - 7.0*sqrt6)/360.0, (296.0 - 169.0*sqrt6)/1800.0, (-2.0 + 3.0*sqrt6)/225.0 },
            { (296.0 + 169.0*sqrt6)/1800.0, (88.0 + 7.0*sqrt6)/360.0, (-2.0 - 3.0*sqrt6)/225.0 },
            { (16.0 - sqrt6)/360.0, (16.0 + sqrt6)/360.0, 1.0/9.0 }
        };

        std::map<std::string, std::string> sw_stage_states = sw_states_curr;
        bool switch_changed = true;
        int outer_loops = 0;

        Vector W[3] = { w_curr, w_curr, w_curr };

        while (switch_changed && outer_loops < 10) {
            switch_changed = false;
            outer_loops++;

            std::vector<Matrix> K_list;
            std::vector<Vector> b_list;

            for (int j = 0; j < 3; ++j) {
                double T_j = t_curr + c_radau[j] * dt_val;
                auto temp_ctrl_states = ctrl_states;
                auto signals_local = evaluateControls(T_j, W[j], temp_ctrl_states, dt_val, sw_stage_states);

                Matrix K_j = K_static;
                for (const auto& sw : switches) {
                    stampSwitch(K_j, sw, sw_stage_states[sw.id]);
                }

                Vector b_j(dim, 0.0);
                for (const auto& src : voltage_sources) {
                    int idx_V = V_to_idx[src.id];
                    if (src.type == "VoltageSource") {
                        b_j[idx_V] = src.getParam("value", 24.0);
                    } else if (src.type == "ACVoltageSource") {
                        double amp = src.getParam("amplitude", 12.0);
                        double freq = src.getParam("frequency", 50.0);
                        b_j[idx_V] = amp * std::sin(2.0 * M_PI * freq * T_j);
                    } else if (src.type == "Ammeter") {
                        b_j[idx_V] = 0.0;
                    }
                }

                for (const auto& comp : physical_stage) {
                    if (comp.type == "CurrentSource") {
                        std::string n1, n2;
                        split_into_nodes(comp.nodes, n1, n2);
                        int idx1 = (n1 != "node_0" && node_to_idx.count(n1)) ? node_to_idx[n1] : -1;
                        int idx2 = (n2 != "node_0" && node_to_idx.count(n2)) ? node_to_idx[n2] : -1;
                        double i_val = comp.getParam("value", 1.0);
                        if (idx1 >= 0) b_j[idx1] -= i_val;
                        if (idx2 >= 0) b_j[idx2] += i_val;
                    }
                }

                K_list.push_back(K_j);
                b_list.push_back(b_j);
            }

            // Build coupled system size 3N x 3N
            Matrix A_block(3 * dim, 3 * dim, 0.0);
            Vector b_block(3 * dim, 0.0);

            for (size_t i = 0; i < 3; ++i) {
                // Diagonals receive derivative coefficient M
                for (size_t r = 0; r < dim; ++r) {
                    for (size_t c = 0; c < dim; ++c) {
                        A_block(i * dim + r, i * dim + c) = M(r, c);
                    }
                }

                for (size_t j = 0; j < 3; ++j) {
                    // Coupled algebraic coefficient matrices
                    for (size_t r = 0; r < dim; ++r) {
                        for (size_t c = 0; c < dim; ++c) {
                            A_block(i * dim + r, j * dim + c) += dt_val * a_radau[i][j] * K_list[j](r, c);
                        }
                    }
                }

                // Vector block formulation
                Vector M_w_curr = M * w_curr;
                Vector b_sum(dim, 0.0);
                for (size_t j = 0; j < 3; ++j) {
                    b_sum = b_sum + a_radau[i][j] * b_list[j];
                }
                Vector b_block_i = M_w_curr + dt_val * b_sum;

                for (size_t r = 0; r < dim; ++r) {
                    b_block[i * dim + r] = b_block_i[r];
                }
            }

            try {
                Vector W_all = A_block.solve(b_block);
                for (size_t i = 0; i < 3; ++i) {
                    for (size_t r = 0; r < dim; ++r) {
                        W[i][r] = W_all[i * dim + r];
                    }
                }
                w_new = W[2]; // third stage solution represents end value
            } catch (...) {
                break;
            }

            // Check switch convergence logic matching state variables
            auto temp_ctrl_states = ctrl_states;
            auto signals_local = evaluateControls(t_curr + dt_val, w_new, temp_ctrl_states, dt_val, sw_stage_states);

            bool any_change = false;
            std::map<std::string, std::string> next_sw = sw_stage_states;

            for (const auto& sw : switches) {
                std::string sw_id = sw.id;
                std::string sw_type = sw.type;

                std::string n1, n2;
                split_into_nodes(sw.nodes, n1, n2);
                int idx1 = (n1 != "node_0" && node_to_idx.count(n1)) ? node_to_idx[n1] : -1;
                int idx2 = (n2 != "node_0" && node_to_idx.count(n2)) ? node_to_idx[n2] : -1;

                double v1 = (idx1 >= 0) ? w_new[idx1] : 0.0;
                double v2 = (idx2 >= 0) ? w_new[idx2] : 0.0;
                double vd = v1 - v2;

                std::string old_state = sw_stage_states[sw_id];
                std::string new_state = "OFF";

                if (sw_type == "MOSFET") {
                    double gate_val = signals_local[sw.getChannelRef("G")];
                    new_state = (gate_val > 0.5) ? "ON" : "OFF";
                } else if (sw_type == "Diode") {
                    double threshold = (old_state == "ON") ? 0.0 : 0.7;
                    new_state = (vd > threshold) ? "ON" : "OFF";
                } else if (sw_type == "Switch") {
                    double sw_val = sw.getParam("state", 0.0);
                    new_state = (sw_val > 0.5) ? "ON" : "OFF";
                }

                next_sw[sw_id] = new_state;
                if (new_state != old_state) {
                    any_change = true;
                }
            }

            if (any_change) {
                if (outer_loops == 1) {
                    LogAcceptedState trans;
                    trans.time = t_curr + dt_val;
                    trans.w = w_new.data;
                    trans.signals = signals_local;
                    trans.sw_states = sw_stage_states;
                    trans.dt = dt_val;
                    out_trans.push_back(trans);
                }
                sw_stage_states = next_sw;
                switch_changed = true;
            }
        }
        sw_new = sw_stage_states;
    }

    return { w_new, ctrl_new, sw_new, out_trans };
}

void CircuitSimulator::logAcceptedState(double t_val, const Vector& w_val, const std::map<std::string, double>& sigs_val,
                                         const std::map<std::string, std::string>& sw_states_val, double dt_val) {
    time_log.push_back(t_val);

    for (const auto& node : active_nodes) {
        int idx = node_to_idx[node];
        voltages_log[node].push_back(w_val[idx]);
    }

    for (const auto& ind : inductors) {
        int idx_L = L_to_idx[ind.id];
        inductors_log[ind.id].push_back(w_val[idx_L]);
    }

    for (const auto& comp : voltage_sources) {
        if (comp.type == "Ammeter") {
            int idx_V = V_to_idx[comp.id];
            ammeters_log[comp.id].push_back(w_val[idx_V]);
        }
    }

    for (const auto& vm : voltmeters) {
        std::string n1, n2;
        split_into_nodes(vm.nodes, n1, n2);
        int idx1 = (n1 != "node_0" && node_to_idx.count(n1)) ? node_to_idx[n1] : -1;
        int idx2 = (n2 != "node_0" && node_to_idx.count(n2)) ? node_to_idx[n2] : -1;
        double v1 = (idx1 >= 0) ? w_val[idx1] : 0.0;
        double v2 = (idx2 >= 0) ? w_val[idx2] : 0.0;
        voltmeters_log[vm.id].push_back(v1 - v2);
    }

    for (const auto& pair : sigs_val) {
        signals_log[pair.first].push_back(pair.second);
    }

    // Capture component custom plots V / I
    for (const auto& comp : physical_stage) {
        bool plot_v = (comp.getParam("plotV", 0.0) > 0.5);
        bool plot_i = (comp.getParam("plotI", 0.0) > 0.5);

        std::string n1, n2;
        split_into_nodes(comp.nodes, n1, n2);
        int idx1 = (n1 != "node_0" && node_to_idx.count(n1)) ? node_to_idx[n1] : -1;
        int idx2 = (n2 != "node_0" && node_to_idx.count(n2)) ? node_to_idx[n2] : -1;
        double v1 = (idx1 >= 0) ? w_val[idx1] : 0.0;
        double v2 = (idx2 >= 0) ? w_val[idx2] : 0.0;
        double v_val = v1 - v2;

        if (plot_v) {
            custom_plots_log[comp.id + "_V"].push_back(v_val);
        }

        if (plot_i) {
            double i_val = 0.0;
            if (comp.type == "Resistor") {
                double r_val = comp.getParam("value", 10.0);
                if (r_val < 1e-6) r_val = 1e-6;
                i_val = v_val / r_val;
            } else if (comp.type == "Inductor") {
                if (L_to_idx.count(comp.id)) {
                    i_val = w_val[L_to_idx[comp.id]];
                }
            } else if (comp.type == "Capacitor") {
                double c_val = comp.getParam("C", 100e-6);
                if (cap_history.count(comp.id)) {
                    i_val = (c_val / dt_val) * (v_val - cap_history[comp.id].v_prev);
                }
            } else if (comp.type == "VoltageSource" || comp.type == "ACVoltageSource" || comp.type == "Ammeter") {
                if (V_to_idx.count(comp.id)) {
                    i_val = w_val[V_to_idx[comp.id]];
                }
            } else if (comp.type == "Switch" || comp.type == "Diode" || comp.type == "MOSFET") {
                double ron = comp.getParam("Ron", 1e-3);
                double roff = comp.getParam("Roff", 1e6);
                std::string sw_st = "OFF";
                if (sw_states_val.count(comp.id)) sw_st = sw_states_val.at(comp.id);
                double r_curr = (sw_st == "ON") ? ron : roff;
                i_val = v_val / r_curr;
            } else if (comp.type == "CurrentSource") {
                i_val = comp.getParam("value", 1.0);
            }
            custom_plots_log[comp.id + "_I"].push_back(i_val);
        }
    }
}

void CircuitSimulator::run() {
    initializeNetwork();

    time_log.clear();
    voltages_log.clear();
    inductors_log.clear();
    voltmeters_log.clear();
    ammeters_log.clear();
    signals_log.clear();
    custom_plots_log.clear();

    double t = 0.0;
    double h = sim_params.h;
    double t_end = sim_params.t_end;

    // First accepted state evaluations
    auto initial_signals = evaluateControls(0.0, w, control_states, h, sw_states, true);
    logAcceptedState(0.0, w, initial_signals, sw_states, h);

    // Dynamic tolerances
    double atol = 1e-4;
    double rtol = 1e-3;

    double h_min = std::max(sim_params.h * 1e-4, 1e-12);
    double h_max = sim_params.h * 10.0;

    int consecutive_rejects = 0;

    while (t < t_end) {
        if (t + h > t_end) {
            h = t_end - t;
        }

        try {
            // Take dynamic step h
            auto [w_full, ctrl_full, sw_full, trans_full] = takeStep(t, w, h, sim_params.solver, control_states, sw_states);

            if (sim_params.step_type == "variable") {
                // Adaptive sizing (Richardson step doubling error estimations)
                double h_half = h / 2.0;
                auto [w_half1, ctrl_half1, sw_half1, trans_half1] = takeStep(t, w, h_half, sim_params.solver, control_states, sw_states);
                auto [w_half2, ctrl_half2, sw_half2, trans_half2] = takeStep(t + h_half, w_half1, h_half, sim_params.solver, ctrl_half1, sw_half1);

                // Estimate max truncation error on state elements
                double err_norm = 0.0;
                if (!diff_idx.empty()) {
                    double max_err_ratio = 0.0;
                    for (size_t idx : diff_idx) {
                        double scale = atol + rtol * std::max(std::abs(w_full[idx]), std::abs(w_half2[idx]));
                        double err = std::abs(w_full[idx] - w_half2[idx]) / scale;
                        if (err > max_err_ratio) {
                            max_err_ratio = err;
                        }
                    }
                    err_norm = max_err_ratio;
                }

                if (err_norm <= 1.0 || h < h_min) {
                    // Accept step!
                    w = w_half2;
                    double t_new = t + h;

                    // Log history of first step if transitions exist
                    for (const auto& ev : trans_half1) {
                        logAcceptedState(ev.time, Vector(ev.w.size()), ev.signals, ev.sw_states, ev.dt);
                    }

                    // Intermediary record
                    auto sig_half1 = evaluateControls(t + h_half, w_half1, control_states, h_half, sw_half1);
                    logAcceptedState(t + h_half, w_half1, sig_half1, sw_half1, h_half);

                    // Log second half transitions
                    for (const auto& ev : trans_half2) {
                        logAcceptedState(ev.time, Vector(ev.w.size()), ev.signals, ev.sw_states, ev.dt);
                    }

                    // First half components histories updates
                    for (const auto& cap : capacitors) {
                        std::string n1, n2;
                        split_into_nodes(cap.nodes, n1, n2);
                        int idx1 = (n1 != "node_0" && node_to_idx.count(n1)) ? node_to_idx[n1] : -1;
                        int idx2 = (n2 != "node_0" && node_to_idx.count(n2)) ? node_to_idx[n2] : -1;
                        double v1 = (idx1 >= 0) ? w_half1[idx1] : 0.0;
                        double v2 = (idx2 >= 0) ? w_half1[idx2] : 0.0;

                        auto& hist = cap_history[cap.id];
                        hist.v_prev_prev = hist.v_prev;
                        hist.v_prev = v1 - v2;
                        hist.dt_prev = h_half;
                    }

                    // Second half histories updates
                    for (const auto& cap : capacitors) {
                        std::string n1, n2;
                        split_into_nodes(cap.nodes, n1, n2);
                        int idx1 = (n1 != "node_0" && node_to_idx.count(n1)) ? node_to_idx[n1] : -1;
                        int idx2 = (n2 != "node_0" && node_to_idx.count(n2)) ? node_to_idx[n2] : -1;
                        double v1 = (idx1 >= 0) ? w[idx1] : 0.0;
                        double v2 = (idx2 >= 0) ? w[idx2] : 0.0;

                        auto& hist = cap_history[cap.id];
                        hist.v_prev_prev = hist.v_prev;
                        hist.v_prev = v1 - v2;
                        hist.dt_prev = h_half;
                    }

                    // Update states with second step values
                    control_states = ctrl_half2;
                    sw_states = sw_half2;

                    for (const auto& pair : custom_blocks) {
                        if (ctrl_half2.count(pair.first)) {
                            custom_blocks[pair.first].state = ctrl_half2.at(pair.first);
                        }
                    }

                    auto final_signals = evaluateControls(t_new, w, control_states, h_half, sw_states);
                    logAcceptedState(t_new, w, final_signals, sw_states, h_half);

                    t = t_new;
                    consecutive_rejects = 0;

                    // Compute PI controller formula for optimal next step
                    double p = (sim_params.solver == "euler" ? 1.0 : (sim_params.solver == "rk45" ? 4.0 : 5.0));
                    double safety = 0.9;
                    double h_new = h;
                    if (err_norm > 0) {
                        h_new = safety * h * std::pow(err_norm, -1.0 / (p + 1.0));
                    } else {
                        h_new = 5.0 * h;
                    }

                    h = std::max(0.1 * h, std::min(5.0 * h, h_new));
                    h = std::min(h_max, std::max(h_min, h));
                } else {
                    // Reject step! Try smaller
                    consecutive_rejects++;
                    if (consecutive_rejects >= 50) {
                        // Collapse safety guard - force accept
                        w = w_half2;
                        t += h;
                        consecutive_rejects = 0;
                        h = h_min;
                    } else {
                        h = std::max(h_min, h * 0.5);
                    }
                }
            } else {
                // Fixed steps loop
                w = w_full;
                double t_new = t + h;

                for (const auto& ev : trans_full) {
                    logAcceptedState(ev.time, Vector(ev.w.size()), ev.signals, ev.sw_states, ev.dt);
                }

                // Update standard capacitor histories
                for (const auto& cap : capacitors) {
                    std::string n1, n2;
                    split_into_nodes(cap.nodes, n1, n2);
                    int idx1 = (n1 != "node_0" && node_to_idx.count(n1)) ? node_to_idx[n1] : -1;
                    int idx2 = (n2 != "node_0" && node_to_idx.count(n2)) ? node_to_idx[n2] : -1;
                    double v1 = (idx1 >= 0) ? w[idx1] : 0.0;
                    double v2 = (idx2 >= 0) ? w[idx2] : 0.0;

                    auto& hist = cap_history[cap.id];
                    hist.v_prev_prev = hist.v_prev;
                    hist.v_prev = v1 - v2;
                    hist.dt_prev = h;
                }

                control_states = ctrl_full;
                sw_states = sw_full;

                for (const auto& pair : custom_blocks) {
                    if (ctrl_full.count(pair.first)) {
                        custom_blocks[pair.first].state = ctrl_full.at(pair.first);
                    }
                }

                auto final_signals = evaluateControls(t_new, w, control_states, h, sw_states);
                logAcceptedState(t_new, w, final_signals, sw_states, h);

                t = t_new;
            }
        } catch (...) {
            if (sim_params.step_type == "variable") {
                h = h * 0.5;
                if (h < 1e-15) {
                    break;
                }
            } else {
                break;
            }
        }
    }
}
