#ifndef SIMULATOR_HPP
#define SIMULATOR_HPP

#include "types.hpp"
#include "matrix.hpp"
#include "script_block.hpp"
#include <memory>
#include <vector>
#include <string>
#include <map>
#include <set>

struct LogAcceptedState {
    double time;
    std::vector<double> w;
    std::map<std::string, double> signals;
    std::map<std::string, std::string> sw_states;
    double dt;
};

class CircuitSimulator {
public:
    std::vector<Component> physical_stage;
    std::vector<Component> control_loops;
    SimulationParameters sim_params;

    // Simulation mapping
    std::map<std::string, int> node_to_idx;
    std::map<std::string, int> L_to_idx;
    std::map<std::string, int> V_to_idx;
    std::vector<std::string> active_nodes;

    size_t num_nodes = 0;
    size_t num_L = 0;
    size_t num_V = 0;
    size_t dim = 0;

    // Static structures
    Matrix M;
    Matrix K_static;
    Matrix F; // for current sources etc.

    // State vectors
    Vector w;

    // System partitions for DAE
    std::vector<size_t> diff_idx;
    std::vector<size_t> alg_idx;
    bool is_alg_all_zero = false;

    // Component groupings
    std::vector<Component> resistors;
    std::vector<Component> capacitors;
    std::vector<Component> inductors;
    std::vector<Component> voltage_sources;
    std::vector<Component> switches;
    std::vector<Component> voltmeters;

    // Switches states
    std::map<std::string, std::string> sw_states; // "id" -> "ON"/"OFF"

    // Control loops states
    std::map<std::string, std::map<std::string, double>> control_states; // b_id -> state variables ("integral", "time")
    std::map<std::string, CustomScriptBlock> custom_blocks;

    // Logging arrays for dynamic plots and results
    std::vector<double> time_log;
    std::map<std::string, std::vector<double>> voltages_log; // node_name -> values
    std::map<std::string, std::vector<double>> inductors_log; // id -> values
    std::map<std::string, std::vector<double>> voltmeters_log; // id -> values
    std::map<std::string, std::vector<double>> ammeters_log; // id -> values
    std::map<std::string, std::vector<double>> signals_log;  // signal_name -> values
    std::map<std::string, std::vector<double>> custom_plots_log; // plot_variable -> values

    // History logs structure for intermediate transitions
    std::vector<LogAcceptedState> trans_history;

    // Capacitor history for UnifiedProbe (stores v_prev, v_prev_prev, dt_prev)
    struct CapHistory {
        double v_prev = 0.0;
        double v_prev_prev = 0.0;
        double dt_prev = 1e-5;
    };
    std::map<std::string, CapHistory> cap_history;

public:
    CircuitSimulator() = default;

    void initializeNetwork();
    void run();

    // Helper functions
    std::map<std::string, double> evaluateControls(double t_curr, const Vector& w_curr,
                                                  std::map<std::string, std::map<std::string, double>>& ctrl_states,
                                                  double dt_val, const std::map<std::string, std::string>& sw_states_curr,
                                                  bool is_first_step = false);

    void stampSwitch(Matrix& K, const Component& sw, const std::string& state);
    Vector buildRHS(double t_stage, const std::map<std::string, std::string>& ss);

    Vector compute_k(double t_stage, const Vector& w_stage,
                      std::map<std::string, std::map<std::string, double>>& ctrl_states,
                      double dt_val, const std::map<std::string, std::string>& sw_states_curr);

    // Stepper methods
    void eulerStep(double t_curr, double dt_val, std::vector<LogAcceptedState>& out_trans);
    void rk45Step(double t_curr, double dt_val, std::vector<LogAcceptedState>& out_trans);
    void radauStep(double t_curr, double dt_val, std::vector<LogAcceptedState>& out_trans);

    std::tuple<Vector, std::map<std::string, std::map<std::string, double>>, std::map<std::string, std::string>, std::vector<LogAcceptedState>>
    takeStep(double t_curr, const Vector& w_curr, double dt_val, const std::string& solver_type,
             const std::map<std::string, std::map<std::string, double>>& ctrl_states,
             const std::map<std::string, std::string>& sw_states_curr);

    void logAcceptedState(double t_val, const Vector& w_val, const std::map<std::string, double>& sigs_val,
                           const std::map<std::string, std::string>& sw_states_val, double dt_val);
};

#endif // SIMULATOR_HPP
