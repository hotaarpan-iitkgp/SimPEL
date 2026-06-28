#ifndef SCRIPT_BLOCK_HPP
#define SCRIPT_BLOCK_HPP

#include <string>
#include <vector>
#include <map>
#include <set>
#include <cmath>
#include <sstream>
#include <algorithm>
#include <iostream>
#include <stdexcept>
#include <cctype>

class ExpressionEvaluator {
private:
    std::string expr_;
    size_t pos_ = 0;
    std::map<std::string, double> vars_;

    char peek() const {
        if (pos_ < expr_.size()) return expr_[pos_];
        return '\0';
    }

    char get() {
        if (pos_ < expr_.size()) return expr_[pos_++];
        return '\0';
    }

    void skipWhitespace() {
        while (pos_ < expr_.size() && std::isspace(expr_[pos_])) {
            pos_++;
        }
    }

    bool matchString(const std::string& s) {
        skipWhitespace();
        if (pos_ + s.size() <= expr_.size() && expr_.substr(pos_, s.size()) == s) {
            pos_ += s.size();
            return true;
        }
        return false;
    }

    double parsePrimary() {
        skipWhitespace();
        char c = peek();

        // Handle unary minus/plus/logical NOT
        if (c == '-') {
            get();
            return -parsePrimary();
        }
        if (c == '+') {
            get();
            return parsePrimary();
        }
        if (c == '!') {
            get();
            return (parsePrimary() == 0.0) ? 1.0 : 0.0;
        }

        // Handle parentheses
        if (c == '(') {
            get(); // consume '('
            double val = parseTernary();
            skipWhitespace();
            if (peek() == ')') get(); // consume ')'
            return val;
        }

        // Handle numbers
        if (std::isdigit(c) || c == '.') {
            std::string num;
            while (pos_ < expr_.size() && (std::isdigit(expr_[pos_]) || expr_[pos_] == '.' || expr_[pos_] == 'e' || expr_[pos_] == 'E' || expr_[pos_] == '-' || expr_[pos_] == '+')) {
                char current = expr_[pos_];
                if ((current == '-' || current == '+') && (num.back() != 'e' && num.back() != 'E')) {
                    break;
                }
                num += get();
            }
            try {
                return std::stod(num);
            } catch (...) {
                return 0.0;
            }
        }

        // Handle identifier (variables/functions)
        if (std::isalpha(c) || c == '_') {
            std::string name;
            while (pos_ < expr_.size() && (std::isalnum(expr_[pos_]) || expr_[pos_] == '_')) {
                name += get();
            }

            // Check if it's a math function
            skipWhitespace();
            if (peek() == '(') {
                get(); // consume '('
                double arg1 = parseTernary();
                skipWhitespace();
                double arg2 = 0.0;
                if (peek() == ',') {
                    get(); // consume ','
                    arg2 = parseTernary();
                }
                skipWhitespace();
                if (peek() == ')') get(); // consume ')'

                if (name == "sin") return std::sin(arg1);
                if (name == "cos") return std::cos(arg1);
                if (name == "tan") return std::tan(arg1);
                if (name == "abs") return std::abs(arg1);
                if (name == "sqrt") return std::sqrt(std::abs(arg1));
                if (name == "exp") return std::exp(arg1);
                if (name == "log") return std::log(std::abs(arg1) + 1e-15);
                if (name == "max") return std::max(arg1, arg2);
                if (name == "min") return std::min(arg1, arg2);
                if (name == "pow") return std::pow(arg1, arg2);
            }

            // Variable lookup
            auto it = vars_.find(name);
            if (it != vars_.end()) {
                return it->second;
            }
            if (name == "pi") return M_PI;
            return 0.0;
        }

        return 0.0;
    }

    double parsePower() {
        double val = parsePrimary();
        skipWhitespace();
        while (peek() == '^') {
            get();
            double expo = parsePrimary();
            val = std::pow(val, expo);
            skipWhitespace();
        }
        return val;
    }

    double parseFactor() {
        double val = parsePower();
        skipWhitespace();
        while (peek() == '*' || peek() == '/') {
            char op = get();
            double r = parsePower();
            if (op == '*') {
                val *= r;
            } else {
                val = (std::abs(r) > 1e-30) ? (val / r) : 0.0;
            }
            skipWhitespace();
        }
        return val;
    }

    double parseExpression() {
        double val = parseFactor();
        skipWhitespace();
        while (peek() == '+' || peek() == '-') {
            char op = get();
            double r = parseFactor();
            if (op == '+') {
                val += r;
            } else {
                val -= r;
            }
            skipWhitespace();
        }
        return val;
    }

    double parseComparison() {
        double val = parseExpression();
        while (true) {
            if (matchString(">=")) {
                double r = parseExpression();
                val = (val >= r) ? 1.0 : 0.0;
            } else if (matchString("<=")) {
                double r = parseExpression();
                val = (val <= r) ? 1.0 : 0.0;
            } else if (matchString(">")) {
                double r = parseExpression();
                val = (val > r) ? 1.0 : 0.0;
            } else if (matchString("<")) {
                double r = parseExpression();
                val = (val < r) ? 1.0 : 0.0;
            } else {
                break;
            }
        }
        return val;
    }

    double parseEquality() {
        double val = parseComparison();
        while (true) {
            if (matchString("==")) {
                double r = parseComparison();
                val = (val == r) ? 1.0 : 0.0;
            } else if (matchString("!=")) {
                double r = parseComparison();
                val = (val != r) ? 1.0 : 0.0;
            } else {
                break;
            }
        }
        return val;
    }

    double parseLogicalAnd() {
        double val = parseEquality();
        while (matchString("&&")) {
            double r = parseEquality();
            val = (val != 0.0 && r != 0.0) ? 1.0 : 0.0;
        }
        return val;
    }

    double parseLogicalOr() {
        double val = parseLogicalAnd();
        while (matchString("||")) {
            double r = parseLogicalAnd();
            val = (val != 0.0 || r != 0.0) ? 1.0 : 0.0;
        }
        return val;
    }

    double parseTernary() {
        double cond = parseLogicalOr();
        skipWhitespace();
        if (peek() == '?') {
            get();
            double val1 = parseTernary();
            skipWhitespace();
            if (peek() == ':') {
                get();
            }
            double val2 = parseTernary();
            return (cond != 0.0) ? val1 : val2;
        }
        return cond;
    }

public:
    double evaluate(const std::string& expression, const std::map<std::string, double>& variables) {
        expr_ = expression;
        pos_ = 0;
        vars_ = variables;
        try {
            return parseTernary();
        } catch (...) {
            return 0.0;
        }
    }
};

class CustomScriptBlock {
public:
    std::string code_str;
    std::map<std::string, double> params;
    std::map<std::string, double> state;
    std::vector<std::string> inputs;
    std::vector<std::string> outputs;

private:
    struct Statement {
        std::string lhs_type; // "state" or "outputs"
        std::string lhs_key;  // key name
        std::string op;       // "=" or "+=" etc.
        std::string rhs_expr; // expression text
    };

    std::vector<Statement> init_statements_;
    std::vector<Statement> step_statements_;

    std::string normalize_expression(const std::string& raw) {
        std::string norm;
        size_t i = 0;
        while (i < raw.size()) {
            // Match inputs["key"] inputs['key'] state["key"] etc.
            if (i + 7 < raw.size() && (raw.substr(i, 7) == "inputs[" || raw.substr(i, 7) == "inputs.get(")) {
                bool is_get = (raw.substr(i, 11) == "inputs.get(");
                i += is_get ? 11 : 7;
                norm += "inputs_";
                char quote = raw[i];
                if (quote == '"' || quote == '\'') i++;
                while (i < raw.size() && raw[i] != ']' && raw[i] != ')' && raw[i] != ',' && raw[i] != '"' && raw[i] != '\'') {
                    if (std::isalnum(raw[i]) || raw[i] == '_') norm += raw[i];
                    i++;
                }
                while (i < raw.size() && raw[i] != ']' && raw[i] != ')') i++;
                if (i < raw.size()) i++; // consume ] or )
            }
            else if (i + 8 < raw.size() && (raw.substr(i, 8) == "outputs[" || raw.substr(i, 8) == "outputs.get(")) {
                bool is_get = (raw.substr(i, 12) == "outputs.get(");
                i += is_get ? 12 : 8;
                norm += "outputs_";
                char quote = raw[i];
                if (quote == '"' || quote == '\'') i++;
                while (i < raw.size() && raw[i] != ']' && raw[i] != ')' && raw[i] != ',' && raw[i] != '"' && raw[i] != '\'') {
                    if (std::isalnum(raw[i]) || raw[i] == '_') norm += raw[i];
                    i++;
                }
                while (i < raw.size() && raw[i] != ']' && raw[i] != ')') i++;
                if (i < raw.size()) i++;
            }
            else if (i + 6 < raw.size() && raw.substr(i, 6) == "state[") {
                i += 6;
                norm += "state_";
                char quote = raw[i];
                if (quote == '"' || quote == '\'') i++;
                while (i < raw.size() && raw[i] != ']' && raw[i] != '"' && raw[i] != '\'') {
                    if (std::isalnum(raw[i]) || raw[i] == '_') norm += raw[i];
                    i++;
                }
                while (i < raw.size() && raw[i] != ']') i++;
                if (i < raw.size()) i++;
            }
            else if (i + 7 < raw.size() && raw.substr(i, 7) == "params[") {
                i += 7;
                norm += "params_";
                char quote = raw[i];
                if (quote == '"' || quote == '\'') i++;
                while (i < raw.size() && raw[i] != ']' && raw[i] != '"' && raw[i] != '\'') {
                    if (std::isalnum(raw[i]) || raw[i] == '_') norm += raw[i];
                    i++;
                }
                while (i < raw.size() && raw[i] != ']') i++;
                if (i < raw.size()) i++;
            }
            else if (i + 5 < raw.size() && raw.substr(i, 5) == "math.") {
                i += 5; // strip math. prefix for compatibility
            }
            else {
                norm += raw[i++];
            }
        }
        return norm;
    }

    void parse_statement(const std::string& line, std::vector<Statement>& target) {
        if (line.empty()) return;
        size_t eq_pos = line.find('=');
        if (eq_pos == std::string::npos) return;

        std::string lhs = line.substr(0, eq_pos);
        std::string rhs = line.substr(eq_pos + 1);

        // Check for operator like +=, -=
        std::string op = "=";
        if (!lhs.empty() && lhs.back() == '+') {
            op = "+=";
            lhs.pop_back();
        } else if (!lhs.empty() && lhs.back() == '-') {
            op = "-=";
            lhs.pop_back();
        } else if (!lhs.empty() && lhs.back() == '*') {
            op = "*=";
            lhs.pop_back();
        }

        // Trim LHS
        size_t start_lhs = lhs.find_first_not_of(" \t\r\n");
        size_t end_lhs = lhs.find_last_not_of(" \t\r\n");
        if (start_lhs == std::string::npos) return;
        lhs = lhs.substr(start_lhs, end_lhs - start_lhs + 1);

        // Parse key
        std::string lhs_type;
        std::string lhs_key;
        if (lhs.substr(0, 6) == "state[" || lhs.substr(0, 6) == "state_") {
            lhs_type = "state";
            // extract key matching state["key"] or state_key
            if (lhs.substr(0, 6) == "state[") {
                size_t p1 = lhs.find('"');
                if (p1 == std::string::npos) p1 = lhs.find('\'');
                if (p1 != std::string::npos) {
                    size_t p2 = lhs.find(lhs[p1], p1 + 1);
                    if (p2 != std::string::npos) lhs_key = lhs.substr(p1 + 1, p2 - p1 - 1);
                }
            } else {
                lhs_key = lhs.substr(6);
            }
        } else if (lhs.substr(0, 8) == "outputs[" || lhs.substr(0, 8) == "outputs_") {
            lhs_type = "outputs";
            if (lhs.substr(0, 8) == "outputs[") {
                size_t p1 = lhs.find('"');
                if (p1 == std::string::npos) p1 = lhs.find('\'');
                if (p1 != std::string::npos) {
                    size_t p2 = lhs.find(lhs[p1], p1 + 1);
                    if (p2 != std::string::npos) lhs_key = lhs.substr(p1 + 1, p2 - p1 - 1);
                }
            } else {
                lhs_key = lhs.substr(8);
            }
        }

        if (lhs_key.empty()) return;

        // Strip semicolons and tailing space in RHS
        size_t start_rhs = rhs.find_first_not_of(" \t\r\n");
        size_t end_rhs = rhs.find_last_not_of(" \t\r\n;");
        if (start_rhs == std::string::npos) return;
        rhs = rhs.substr(start_rhs, end_rhs - start_rhs + 1);

        Statement stmt;
        stmt.lhs_type = lhs_type;
        stmt.lhs_key = lhs_key;
        stmt.op = op;
        stmt.rhs_expr = normalize_expression(rhs);
        target.push_back(stmt);
    }

public:
    CustomScriptBlock() = default;
    CustomScriptBlock(const std::string& code, const std::map<std::string, double>& input_params)
        : code_str(code), params(input_params) {
        discover_ports();
        compile_code();
        reset();
    }

    void discover_ports() {
        inputs.clear();
        outputs.clear();
        std::set<std::string> inputs_set;
        std::set<std::string> outputs_set;

        // Parse subscript lookups inputs[...] outputs[...]
        size_t pos = 0;
        while (true) {
            size_t p_in = code_str.find("inputs", pos);
            if (p_in == std::string::npos) break;
            pos = p_in + 6;

            // extract subscript key
            if (p_in + 7 < code_str.size() && (code_str[p_in + 6] == '[' || (p_in + 11 < code_str.size() && code_str.substr(p_in + 6, 5) == ".get("))) {
                bool is_get = (code_str.substr(p_in + 6, 5) == ".get(");
                size_t start_pos = p_in + (is_get ? 11 : 7);
                char quote = code_str[start_pos];
                if (quote == '"' || quote == '\'') start_pos++;
                std::string key;
                while (start_pos < code_str.size() && code_str[start_pos] != ']' && code_str[start_pos] != ')' && code_str[start_pos] != ',' && code_str[start_pos] != '"' && code_str[start_pos] != '\'') {
                    if (std::isalnum(code_str[start_pos]) || code_str[start_pos] == '_') {
                        key += code_str[start_pos];
                    }
                    start_pos++;
                }
                if (!key.empty()) inputs_set.insert(key);
            }
        }

        pos = 0;
        while (true) {
            size_t p_out = code_str.find("outputs", pos);
            if (p_out == std::string::npos) break;
            pos = p_out + 7;

            if (p_out + 8 < code_str.size() && (code_str[p_out + 7] == '[' || (p_out + 12 < code_str.size() && code_str.substr(p_out + 7, 5) == ".get("))) {
                bool is_get = (code_str.substr(p_out + 7, 5) == ".get(");
                size_t start_pos = p_out + (is_get ? 12 : 8);
                char quote = code_str[start_pos];
                if (quote == '"' || quote == '\'') start_pos++;
                std::string key;
                while (start_pos < code_str.size() && code_str[start_pos] != ']' && code_str[start_pos] != ')' && code_str[start_pos] != ',' && code_str[start_pos] != '"' && code_str[start_pos] != '\'') {
                    if (std::isalnum(code_str[start_pos]) || code_str[start_pos] == '_') {
                        key += code_str[start_pos];
                    }
                    start_pos++;
                }
                if (!key.empty()) outputs_set.insert(key);
            }
        }

        inputs.assign(inputs_set.begin(), inputs_set.end());
        outputs.assign(outputs_set.begin(), outputs_set.end());
    }

    void compile_code() {
        init_statements_.clear();
        step_statements_.clear();

        // Split into lines
        std::stringstream ss(code_str);
        std::string line;
        bool in_initialize = false;
        bool in_step = false;

        while (std::getline(ss, line)) {
            // Check for def initialize(...) or def step(...)
            if (line.find("def initialize") != std::string::npos) {
                in_initialize = true;
                in_step = false;
                continue;
            } else if (line.find("def step") != std::string::npos) {
                in_initialize = false;
                in_step = true;
                continue;
            } else if (line.find("def ") != std::string::npos) {
                in_initialize = false;
                in_step = false;
                continue;
            }

            // Clean leading/trailing spaces and skip comments or passes
            size_t first = line.find_first_not_of(" \t");
            if (first == std::string::npos) continue;
            std::string clean_line = line.substr(first);
            if (clean_line.empty() || clean_line[0] == '#' || clean_line == "pass") continue;

            if (in_initialize) {
                parse_statement(clean_line, init_statements_);
            } else if (in_step) {
                parse_statement(clean_line, step_statements_);
            }
        }
    }

    void reset() {
        state.clear();
        // Default initial values to 0.0
        ExpressionEvaluator eval;
        std::map<std::string, double> variables;
        for (const auto& pair : params) {
            variables["params_" + pair.first] = pair.second;
        }

        for (const auto& stmt : init_statements_) {
            if (stmt.lhs_type == "state") {
                double val = eval.evaluate(stmt.rhs_expr, variables);
                state[stmt.lhs_key] = val;
                variables["state_" + stmt.lhs_key] = val;
            }
        }
    }

    std::map<std::string, double> step(double time, const std::map<std::string, double>& inputs_dict) {
        std::map<std::string, double> run_outputs;
        for (const auto& out : outputs) {
            run_outputs[out] = 0.0;
        }

        // Bind all current scope variables
        std::map<std::string, double> variables;
        variables["time"] = time;
        for (const auto& pair : params) {
            variables["params_" + pair.first] = pair.second;
        }
        for (const auto& pair : state) {
            variables["state_" + pair.first] = pair.second;
        }
        for (const auto& inp : inputs) {
            auto it = inputs_dict.find(inp);
            variables["inputs_" + inp] = (it != inputs_dict.end()) ? it->second : 0.0;
        }
        for (const auto& out : outputs) {
            variables["outputs_" + out] = 0.0;
        }

        ExpressionEvaluator eval;
        for (const auto& stmt : step_statements_) {
            double rhs_val = eval.evaluate(stmt.rhs_expr, variables);
            double current_val = 0.0;

            if (stmt.lhs_type == "state") {
                current_val = state[stmt.lhs_key];
                if (stmt.op == "=") state[stmt.lhs_key] = rhs_val;
                else if (stmt.op == "+=") state[stmt.lhs_key] += rhs_val;
                else if (stmt.op == "-=") state[stmt.lhs_key] -= rhs_val;
                else if (stmt.op == "*=") state[stmt.lhs_key] *= rhs_val;
                variables["state_" + stmt.lhs_key] = state[stmt.lhs_key];
            } else if (stmt.lhs_type == "outputs") {
                current_val = run_outputs[stmt.lhs_key];
                if (stmt.op == "=") run_outputs[stmt.lhs_key] = rhs_val;
                else if (stmt.op == "+=") run_outputs[stmt.lhs_key] += rhs_val;
                else if (stmt.op == "-=") run_outputs[stmt.lhs_key] -= rhs_val;
                else if (stmt.op == "*=") run_outputs[stmt.lhs_key] *= rhs_val;
                variables["outputs_" + stmt.lhs_key] = run_outputs[stmt.lhs_key];
            }
        }

        return run_outputs;
    }
};

#endif // SCRIPT_BLOCK_HPP
