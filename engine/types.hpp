#ifndef TYPES_HPP
#define TYPES_HPP

#include <string>
#include <vector>
#include <map>
#include <sstream>
#include <algorithm>
#include <iostream>

inline double parse_scientific(const std::string& input_str) {
    if (input_str.empty()) return 0.0;
    std::string s = input_str;
    size_t start = s.find_first_not_of(" \t\r\n");
    if (start == std::string::npos) return 0.0;
    size_t end = s.find_last_not_of(" \t\r\n");
    s = s.substr(start, end - start + 1);
    if (s.empty()) return 0.0;

    char last_char = s.back();
    double multiplier = 1.0;
    bool has_suffix = false;
    if (last_char == 'p') { multiplier = 1e-12; has_suffix = true; }
    else if (last_char == 'n') { multiplier = 1e-9; has_suffix = true; }
    else if (last_char == 'u') { multiplier = 1e-6; has_suffix = true; }
    else if (last_char == 'm') { multiplier = 1e-3; has_suffix = true; }
    else if (last_char == 'k') { multiplier = 1e3; has_suffix = true; }
    else if (last_char == 'M') { multiplier = 1e6; has_suffix = true; }
    else if (last_char == 'G') { multiplier = 1e9; has_suffix = true; }

    if (has_suffix) {
        s.pop_back();
        size_t last = s.find_last_not_of(" \t\r\n");
        if (last != std::string::npos) {
            s = s.substr(0, last + 1);
        }
    }

    try {
        return std::stod(s) * multiplier;
    } catch (...) {
        return 0.0;
    }
}

struct Component {
    std::string id;
    std::string type;
    std::vector<std::string> nodes;
    std::map<std::string, std::string> parameters;
    std::map<std::string, std::string> channels;

    double getParam(const std::string& name, double default_val) const {
        auto it = parameters.find(name);
        if (it != parameters.end()) {
            return parse_scientific(it->second);
        }
        return default_val;
    }

    std::string getParamStr(const std::string& name, const std::string& default_val = "") const {
        auto it = parameters.find(name);
        if (it != parameters.end()) {
            return it->second;
        }
        return default_val;
    }

    std::string getChannelRef(const std::string& name) const {
        auto it = channels.find(name);
        if (it != channels.end()) {
            return it->second;
        }
        return "";
    }
};

struct SimulationParameters {
    double t_end = 0.05;
    double h = 1e-5;
    std::string solver = "euler";  // "euler", "rk45", "radau"
    std::string step_type = "fixed";  // "fixed", "variable"
};

#endif // TYPES_HPP
