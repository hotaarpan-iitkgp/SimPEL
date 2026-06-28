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

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

class CustomScriptBlock;

class ExpressionEvaluator {
private:
    std::string expr_;
    size_t pos_ = 0;
    std::map<std::string, double> vars_;
    const CustomScriptBlock* block_ = nullptr;

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

    double parsePrimary();
    double parsePower();
    double parseFactor();
    double parseExpression();
    double parseComparison();
    double parseEquality();
    double parseLogicalAnd();
    double parseLogicalOr();
    double parseTernary();

public:
    double evaluate(const std::string& expression, const std::map<std::string, double>& variables, const CustomScriptBlock* block = nullptr);
};

class CustomScriptBlock {
public:
    std::string code_str;
    std::map<std::string, double> params;
    std::map<std::string, double> state;
    std::vector<std::string> inputs;
    std::vector<std::string> outputs;
    std::map<std::string, int> state_arrays;

    struct Statement {
        std::string type; // "assign" or "for"
        std::string lhs_type; // "state", "outputs", "state_array", "local"
        std::string lhs_key;  // key name / loop variable
        std::string lhs_idx_expr; // index expression for arrays
        std::string op;       // "=" or "+=" etc.
        std::string rhs_expr; // expression text / loop limit expression
        std::string loop_var;
        std::string loop_start_expr;
        std::string loop_limit_expr;
        std::vector<Statement> body;
    };

private:
    std::vector<Statement> init_statements_;
    std::vector<Statement> step_statements_;

    std::string normalize_expression(const std::string& raw) {
        std::string norm = raw;
        // Strip prefixes for compatibility
        size_t pos;
        while ((pos = norm.find("std::")) != std::string::npos) norm.erase(pos, 5);
        while ((pos = norm.find("Math.")) != std::string::npos) norm.erase(pos, 5);
        while ((pos = norm.find("math.")) != std::string::npos) norm.erase(pos, 5);
        return norm;
    }

    void parse_legacy_statement(const std::string& line, std::vector<Statement>& target) {
        if (line.empty()) return;
        size_t eq_pos = line.find('=');
        if (eq_pos == std::string::npos) return;

        std::string lhs = line.substr(0, eq_pos);
        std::string rhs = line.substr(eq_pos + 1);

        std::string op = "=";
        if (!lhs.empty() && lhs.back() == '+') { op = "+="; lhs.pop_back(); }
        else if (!lhs.empty() && lhs.back() == '-') { op = "-="; lhs.pop_back(); }
        else if (!lhs.empty() && lhs.back() == '*') { op = "*="; lhs.pop_back(); }

        size_t start_lhs = lhs.find_first_not_of(" \t\r\n");
        size_t end_lhs = lhs.find_last_not_of(" \t\r\n");
        if (start_lhs == std::string::npos) return;
        lhs = lhs.substr(start_lhs, end_lhs - start_lhs + 1);

        std::vector<std::string> typePrefixes = {"double", "float", "int", "auto", "double&", "float&", "int&"};
        for (const auto& pref : typePrefixes) {
            if (lhs.substr(0, pref.size() + 1) == pref + " ") {
                lhs = lhs.substr(pref.size() + 1);
                break;
            }
        }

        std::string lhs_type = "local";
        std::string lhs_key = lhs;
        if (lhs.substr(0, 6) == "state[" || lhs.substr(0, 6) == "state_") {
            lhs_type = "state";
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

        size_t start_rhs = rhs.find_first_not_of(" \t\r\n");
        size_t end_rhs = rhs.find_last_not_of(" \t\r\n;");
        if (start_rhs == std::string::npos) return;
        rhs = rhs.substr(start_rhs, end_rhs - start_rhs + 1);

        Statement stmt;
        stmt.type = "assign";
        stmt.lhs_type = lhs_type;
        stmt.lhs_key = lhs_key;
        stmt.op = op;
        stmt.rhs_expr = normalize_expression(rhs);
        target.push_back(stmt);
    }

    std::vector<Statement> parse_block(const std::vector<std::string>& lines, size_t& pos_index) {
        std::vector<Statement> statements;
        
        while (pos_index < lines.size()) {
            std::string line = lines[pos_index];
            pos_index++;
            
            size_t comment_pos = line.find("//");
            if (comment_pos != std::string::npos) {
                line = line.substr(0, comment_pos);
            }
            
            size_t first = line.find_first_not_of(" \t\r\n");
            if (first == std::string::npos) continue;
            size_t last = line.find_last_not_of(" \t\r\n");
            std::string clean = line.substr(first, last - first + 1);
            if (clean.empty() || clean == "{" || clean == "pass;") continue;
            
            if (clean == "}") {
                break;
            }
            
            if (clean.substr(0, 4) == "for " || clean.substr(0, 4) == "for(") {
                size_t p1 = clean.find('(');
                size_t p2 = clean.find(')', p1);
                if (p1 != std::string::npos && p2 != std::string::npos) {
                    std::string header = clean.substr(p1 + 1, p2 - p1 - 1);
                    size_t s1 = header.find(';');
                    size_t s2 = header.find(';', s1 + 1);
                    if (s1 != std::string::npos && s2 != std::string::npos) {
                        std::string part1 = header.substr(0, s1);
                        std::string part2 = header.substr(s1 + 1, s2 - s1 - 1);
                        
                        size_t eq_pos = part1.find('=');
                        if (eq_pos != std::string::npos) {
                            std::string lhs_p = part1.substr(0, eq_pos);
                            std::string rhs_p = part1.substr(eq_pos + 1);
                            
                            size_t fl = lhs_p.find_first_not_of(" \t");
                            size_t ll = lhs_p.find_last_not_of(" \t");
                            std::string var_decl = lhs_p.substr(fl, ll - fl + 1);
                            size_t space_pos = var_decl.find_last_of(" \t");
                            std::string loop_var = (space_pos == std::string::npos) ? var_decl : var_decl.substr(space_pos + 1);
                            
                            size_t fr = rhs_p.find_first_not_of(" \t");
                            size_t lr = rhs_p.find_last_not_of(" \t");
                            std::string loop_start_expr = rhs_p.substr(fr, lr - fr + 1);
                            
                            size_t cmp_pos = part2.find('<');
                            std::string loop_limit_expr = "0";
                            if (cmp_pos != std::string::npos) {
                                std::string limit_raw = part2.substr(cmp_pos + 1);
                                size_t flm = limit_raw.find_first_not_of(" \t");
                                size_t llm = limit_raw.find_last_not_of(" \t");
                                loop_limit_expr = limit_raw.substr(flm, llm - flm + 1);
                            }
                            
                            std::vector<Statement> body = parse_block(lines, pos_index);
                            
                            Statement stmt;
                            stmt.type = "for";
                            stmt.loop_var = loop_var;
                            stmt.loop_start_expr = loop_start_expr;
                            stmt.loop_limit_expr = loop_limit_expr;
                            stmt.body = body;
                            statements.push_back(stmt);
                            continue;
                        }
                    }
                }
            }
            
            if (!clean.empty() && clean.back() == ';') {
                clean.pop_back();
            }
            size_t eq_pos = clean.find('=');
            if (eq_pos == std::string::npos) continue;
            
            std::string lhs = clean.substr(0, eq_pos);
            std::string rhs = clean.substr(eq_pos + 1);
            
            std::string op = "=";
            if (!lhs.empty() && lhs.back() == '+') { op = "+="; lhs.pop_back(); }
            else if (!lhs.empty() && lhs.back() == '-') { op = "-="; lhs.pop_back(); }
            else if (!lhs.empty() && lhs.back() == '*') { op = "*="; lhs.pop_back(); }
            
            size_t fl = lhs.find_first_not_of(" \t");
            size_t ll = lhs.find_last_not_of(" \t");
            if (fl == std::string::npos) continue;
            lhs = lhs.substr(fl, ll - fl + 1);
            
            std::vector<std::string> typePrefixes = {"double", "float", "int", "auto", "double&", "float&", "int&"};
            for (const auto& pref : typePrefixes) {
                if (lhs.substr(0, pref.size() + 1) == pref + " ") {
                    lhs = lhs.substr(pref.size() + 1);
                    size_t fl2 = lhs.find_first_not_of(" \t");
                    size_t ll2 = lhs.find_last_not_of(" \t");
                    lhs = lhs.substr(fl2, ll2 - fl2 + 1);
                    break;
                }
            }
            
            size_t fr = rhs.find_first_not_of(" \t\r\n");
            size_t lr = rhs.find_last_not_of(" \t\r\n");
            if (fr == std::string::npos) continue;
            rhs = rhs.substr(fr, lr - fr + 1);
            
            if (lhs.substr(0, 8) == "outputs[" && lhs.back() == ']') {
                std::string idx_expr = lhs.substr(8, lhs.size() - 9);
                Statement stmt;
                stmt.type = "assign";
                stmt.lhs_type = "outputs";
                stmt.lhs_key = idx_expr;
                stmt.op = op;
                stmt.rhs_expr = normalize_expression(rhs);
                statements.push_back(stmt);
                continue;
            }
            
            size_t br_pos = lhs.find('[');
            if (br_pos != std::string::npos && lhs.back() == ']') {
                std::string array_name = lhs.substr(0, br_pos);
                std::string idx_expr = lhs.substr(br_pos + 1, lhs.size() - br_pos - 2);
                if (state_arrays.find(array_name) != state_arrays.end()) {
                    Statement stmt;
                    stmt.type = "assign";
                    stmt.lhs_type = "state_array";
                    stmt.lhs_key = array_name;
                    stmt.lhs_idx_expr = idx_expr;
                    stmt.op = op;
                    stmt.rhs_expr = normalize_expression(rhs);
                    statements.push_back(stmt);
                    continue;
                }
            }
            
            std::string lhs_type = (state.find(lhs) != state.end()) ? "state" : "local";
            Statement stmt;
            stmt.type = "assign";
            stmt.lhs_type = lhs_type;
            stmt.lhs_key = lhs;
            stmt.op = op;
            stmt.rhs_expr = normalize_expression(rhs);
            statements.push_back(stmt);
        }
        
        return statements;
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

        size_t pos = 0;
        while (true) {
            size_t p_in = code_str.find("inputs", pos);
            if (p_in == std::string::npos) break;
            pos = p_in + 6;
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

        pos = 0;
        while (true) {
            size_t p_in = code_str.find("inputs[", pos);
            if (p_in == std::string::npos) break;
            pos = p_in + 7;
            std::string num_str;
            while (pos < code_str.size() && std::isdigit(code_str[pos])) {
                num_str += code_str[pos++];
            }
            if (!num_str.empty()) {
                inputs_set.insert("In" + std::to_string(std::stoi(num_str) + 1));
            }
        }
        pos = 0;
        while (true) {
            size_t p_out = code_str.find("outputs[", pos);
            if (p_out == std::string::npos) break;
            pos = p_out + 8;
            std::string num_str;
            while (pos < code_str.size() && std::isdigit(code_str[pos])) {
                num_str += code_str[pos++];
            }
            if (!num_str.empty()) {
                outputs_set.insert("Out" + std::to_string(std::stoi(num_str) + 1));
            }
        }

        pos = 0;
        while (true) {
            size_t p_for = code_str.find("for", pos);
            if (p_for == std::string::npos) break;
            pos = p_for + 3;
            size_t lt_pos = code_str.find('<', p_for);
            if (lt_pos != std::string::npos) {
                size_t p_idx = lt_pos + 1;
                while (p_idx < code_str.size() && std::isspace(code_str[p_idx])) p_idx++;
                std::string limit_str;
                while (p_idx < code_str.size() && std::isdigit(code_str[p_idx])) {
                    limit_str += code_str[p_idx++];
                }
                if (!limit_str.empty()) {
                    int limit = std::stoi(limit_str);
                    if (code_str.find("inputs[", p_for) != std::string::npos || code_str.find("inputs [", p_for) != std::string::npos) {
                        for (int i = 0; i < limit; ++i) inputs_set.insert("In" + std::to_string(i + 1));
                    }
                    if (code_str.find("outputs[", p_for) != std::string::npos || code_str.find("outputs [", p_for) != std::string::npos) {
                        for (int i = 0; i < limit; ++i) outputs_set.insert("Out" + std::to_string(i + 1));
                    }
                }
            }
        }

        auto sort_ports = [](const std::set<std::string>& s, const std::string& prefix) {
            std::vector<std::string> v(s.begin(), s.end());
            std::sort(v.begin(), v.end(), [&prefix](const std::string& a, const std::string& b) {
                if (a.size() > prefix.size() && b.size() > prefix.size() &&
                    a.substr(0, prefix.size()) == prefix && b.substr(0, prefix.size()) == prefix) {
                    try {
                        return std::stoi(a.substr(prefix.size())) < std::stoi(b.substr(prefix.size()));
                    } catch (...) {}
                }
                return a < b;
            });
            return v;
        };

        inputs = sort_ports(inputs_set, "In");
        outputs = sort_ports(outputs_set, "Out");
    }

    void compile_code() {
        init_statements_.clear();
        step_statements_.clear();
        state_arrays.clear();

        bool isStandardC = (code_str.find("void step(") != std::string::npos);
        if (!isStandardC) {
            std::stringstream ss(code_str);
            std::string line;
            bool in_initialize = false;
            bool in_step = false;

            while (std::getline(ss, line)) {
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

                size_t first = line.find_first_not_of(" \t");
                if (first == std::string::npos) continue;
                std::string clean_line = line.substr(first);
                if (clean_line.empty() || clean_line[0] == '#' || clean_line == "pass") continue;

                if (in_initialize) {
                    parse_legacy_statement(clean_line, init_statements_);
                } else if (in_step) {
                    parse_legacy_statement(clean_line, step_statements_);
                }
            }
            return;
        }

        std::stringstream ss(code_str);
        std::string line;
        std::vector<std::string> stepLines;
        bool in_step = false;

        while (std::getline(ss, line)) {
            size_t first = line.find_first_not_of(" \t\r\n");
            if (first == std::string::npos) continue;
            std::string clean = line.substr(first);
            if (clean.find("//") != std::string::npos) {
                clean = clean.substr(0, clean.find("//"));
            }
            // Trim trailing whitespace
            size_t last = clean.find_last_not_of(" \t\r\n");
            if (last != std::string::npos) clean = clean.substr(0, last + 1);

            if (clean.empty()) continue;

            if (clean.find("void step(") != std::string::npos) {
                in_step = true;
                continue;
            }

            if (in_step) {
                stepLines.push_back(line);
                continue;
            }

            // const double M = 0.8;
            if (clean.substr(0, 13) == "const double ") {
                size_t eq = clean.find('=');
                size_t semi = clean.find(';');
                if (eq != std::string::npos && semi != std::string::npos) {
                    std::string name = clean.substr(13, eq - 13);
                    std::string val_str = clean.substr(eq + 1, semi - eq - 1);
                    // Trim name
                    size_t fn = name.find_first_not_of(" \t");
                    size_t ln = name.find_last_not_of(" \t");
                    name = name.substr(fn, ln - fn + 1);
                    params[name] = std::stod(val_str);
                }
                continue;
            }

            // double x[5] = {0.0}; or double x[5];
            if (clean.substr(0, 7) == "double ") {
                size_t br_open = clean.find('[');
                size_t br_close = clean.find(']');
                size_t eq = clean.find('=');
                size_t semi = clean.find(';');

                if (br_open != std::string::npos && br_close != std::string::npos && semi != std::string::npos) {
                    std::string name = clean.substr(7, br_open - 7);
                    std::string size_str = clean.substr(br_open + 1, br_close - br_open - 1);
                    // Trim name
                    size_t fn = name.find_first_not_of(" \t");
                    size_t ln = name.find_last_not_of(" \t");
                    name = name.substr(fn, ln - fn + 1);

                    int size = std::stoi(size_str);
                    state_arrays[name] = size;

                    std::vector<double> default_vals(size, 0.0);
                    if (eq != std::string::npos) {
                        size_t brace_open = clean.find('{');
                        size_t brace_close = clean.find('}');
                        if (brace_open != std::string::npos && brace_close != std::string::npos) {
                            std::string vals_str = clean.substr(brace_open + 1, brace_close - brace_open - 1);
                            std::stringstream vss(vals_str);
                            std::string item;
                            int idx = 0;
                            while (std::getline(vss, item, ',')) {
                                if (idx >= size) break;
                                default_vals[idx++] = std::stod(item);
                            }
                        }
                    }
                    for (int i = 0; i < size; ++i) {
                        state[name + "_" + std::to_string(i)] = default_vals[i];
                    }
                } else if (eq != std::string::npos && semi != std::string::npos) {
                    // double ramp = 0.0;
                    std::string name = clean.substr(7, eq - 7);
                    std::string val_str = clean.substr(eq + 1, semi - eq - 1);
                    size_t fn = name.find_first_not_of(" \t");
                    size_t ln = name.find_last_not_of(" \t");
                    name = name.substr(fn, ln - fn + 1);
                    state[name] = std::stod(val_str);
                }
                continue;
            }

            // Legacy/fallback without types (e.g. M = 0.8;)
            size_t eq = clean.find('=');
            size_t semi = clean.find(';');
            if (eq != std::string::npos && semi != std::string::npos) {
                std::string name = clean.substr(0, eq);
                std::string val_str = clean.substr(eq + 1, semi - eq - 1);
                size_t fn = name.find_first_not_of(" \t");
                size_t ln = name.find_last_not_of(" \t");
                name = name.substr(fn, ln - fn + 1);
                if (state.find(name) == state.end() && params.find(name) == params.end()) {
                    params[name] = std::stod(val_str);
                }
            }
        }

        size_t pos_idx = 0;
        step_statements_ = parse_block(stepLines, pos_idx);
    }

    void reset() {
        state.clear();
        compile_code();

        ExpressionEvaluator eval;
        std::map<std::string, double> variables;
        for (const auto& pair : params) {
            variables["params_" + pair.first] = pair.second;
        }

        for (const auto& stmt : init_statements_) {
            if (stmt.lhs_type == "state") {
                double val = eval.evaluate(stmt.rhs_expr, variables, this);
                state[stmt.lhs_key] = val;
                variables["state_" + stmt.lhs_key] = val;
            }
        }
    }

    void execute_statements(const std::vector<Statement>& statements, std::map<std::string, double>& variables, std::map<std::string, double>& run_outputs, ExpressionEvaluator& eval) {
        for (const auto& s : statements) {
            if (s.type == "for") {
                int start = std::round(eval.evaluate(s.loop_start_expr, variables, this));
                int limit = std::round(eval.evaluate(s.loop_limit_expr, variables, this));
                std::string loop_var = s.loop_var;
                
                for (int val = start; val < limit; ++val) {
                    variables[loop_var] = val;
                    execute_statements(s.body, variables, run_outputs, eval);
                }
            } else if (s.type == "assign") {
                double rhs_val = eval.evaluate(s.rhs_expr, variables, this);
                if (s.lhs_type == "state") {
                    if (s.op == "=") state[s.lhs_key] = rhs_val;
                    else if (s.op == "+=") state[s.lhs_key] += rhs_val;
                    else if (s.op == "-=") state[s.lhs_key] -= rhs_val;
                    else if (s.op == "*=") state[s.lhs_key] *= rhs_val;
                    variables["state_" + s.lhs_key] = state[s.lhs_key];
                } else if (s.lhs_type == "state_array") {
                    int idx = std::round(eval.evaluate(s.lhs_idx_expr, variables, this));
                    std::string array_name = s.lhs_key;
                    std::string state_key = array_name + "_" + std::to_string(idx);
                    
                    if (s.op == "=") state[state_key] = rhs_val;
                    else if (s.op == "+=") state[state_key] += rhs_val;
                    else if (s.op == "-=") state[state_key] -= rhs_val;
                    else if (s.op == "*=") state[state_key] *= rhs_val;
                    variables["state_" + state_key] = state[state_key];
                } else if (s.lhs_type == "outputs") {
                    int idx = std::round(eval.evaluate(s.lhs_key, variables, this));
                    if (idx >= 0 && idx < (int)outputs.size()) {
                        std::string port_name = outputs[idx];
                        if (s.op == "=") run_outputs[port_name] = rhs_val;
                        else if (s.op == "+=") run_outputs[port_name] += rhs_val;
                        else if (s.op == "-=") run_outputs[port_name] -= rhs_val;
                        else if (s.op == "*=") run_outputs[port_name] *= rhs_val;
                        variables["outputs_" + port_name] = run_outputs[port_name];
                    }
                } else if (s.lhs_type == "local") {
                    if (s.op == "=") variables[s.lhs_key] = rhs_val;
                    else if (s.op == "+=") variables[s.lhs_key] += rhs_val;
                    else if (s.op == "-=") variables[s.lhs_key] -= rhs_val;
                    else if (s.op == "*=") variables[s.lhs_key] *= rhs_val;
                }
            }
        }
    }

    std::map<std::string, double> step(double time, const std::map<std::string, double>& inputs_dict) {
        std::map<std::string, double> run_outputs;
        for (const auto& out : outputs) {
            run_outputs[out] = 0.0;
        }

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
        execute_statements(step_statements_, variables, run_outputs, eval);

        return run_outputs;
    }
};

// Define parser primary/expr methods with forward CustomScriptBlock references
inline double ExpressionEvaluator::evaluate(const std::string& expression, const std::map<std::string, double>& variables, const CustomScriptBlock* block) {
    expr_ = expression;
    pos_ = 0;
    vars_ = variables;
    block_ = block;
    try {
        return parseTernary();
    } catch (...) {
        return 0.0;
    }
}

inline double ExpressionEvaluator::parsePrimary() {
    skipWhitespace();
    char c = peek();

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

    if (c == '(') {
        get();
        double val = parseTernary();
        skipWhitespace();
        if (peek() == ')') get();
        return val;
    }

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

    if (std::isalpha(c) || c == '_') {
        std::string name;
        while (pos_ < expr_.size() && (std::isalnum(expr_[pos_]) || expr_[pos_] == '_')) {
            name += get();
        }

        skipWhitespace();
        if (peek() == '[') {
            get(); // consume '['
            double idx = parseTernary();
            skipWhitespace();
            if (peek() == ']') get(); // consume ']'
            
            if (name == "inputs" && block_) {
                int r_idx = std::round(idx);
                if (r_idx >= 0 && r_idx < (int)block_->inputs.size()) {
                    std::string port_name = block_->inputs[r_idx];
                    auto it = vars_.find("inputs_" + port_name);
                    return (it != vars_.end()) ? it->second : 0.0;
                }
                return 0.0;
            }
            if (name == "outputs" && block_) {
                int r_idx = std::round(idx);
                if (r_idx >= 0 && r_idx < (int)block_->outputs.size()) {
                    std::string port_name = block_->outputs[r_idx];
                    auto it = vars_.find("outputs_" + port_name);
                    return (it != vars_.end()) ? it->second : 0.0;
                }
                return 0.0;
            }
            
            std::string state_key = name + "_" + std::to_string((int)std::round(idx));
            auto it = vars_.find("state_" + state_key);
            if (it != vars_.end()) {
                return it->second;
            }
            return 0.0;
        }

        if (peek() == '(') {
            get();
            double arg1 = parseTernary();
            skipWhitespace();
            double arg2 = 0.0;
            if (peek() == ',') {
                get();
                arg2 = parseTernary();
            }
            skipWhitespace();
            if (peek() == ')') get();

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

        auto it_s = vars_.find("state_" + name);
        if (it_s != vars_.end()) return it_s->second;
        auto it_p = vars_.find("params_" + name);
        if (it_p != vars_.end()) return it_p->second;
        auto it_v = vars_.find(name);
        if (it_v != vars_.end()) return it_v->second;
        if (name == "pi") return M_PI;
        return 0.0;
    }

    return 0.0;
}

inline double ExpressionEvaluator::parsePower() {
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

inline double ExpressionEvaluator::parseFactor() {
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

inline double ExpressionEvaluator::parseExpression() {
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

inline double ExpressionEvaluator::parseComparison() {
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

inline double ExpressionEvaluator::parseEquality() {
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

inline double ExpressionEvaluator::parseLogicalAnd() {
    double val = parseEquality();
    while (matchString("&&")) {
        double r = parseEquality();
        val = (val != 0.0 && r != 0.0) ? 1.0 : 0.0;
    }
    return val;
}

inline double ExpressionEvaluator::parseLogicalOr() {
    double val = parseLogicalAnd();
    while (matchString("||")) {
        double r = parseLogicalAnd();
        val = (val != 0.0 || r != 0.0) ? 1.0 : 0.0;
    }
    return val;
}

inline double ExpressionEvaluator::parseTernary() {
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

#endif // SCRIPT_BLOCK_HPP
