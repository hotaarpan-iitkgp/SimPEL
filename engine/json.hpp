#ifndef JSON_HPP
#define JSON_HPP

#include <string>
#include <vector>
#include <map>
#include <sstream>
#include <stdexcept>
#include <cctype>
#include <algorithm>

class Json {
public:
    enum Type { Null, Bool, Number, String, Array, Object };

private:
    Type type_ = Null;
    bool bool_val_ = false;
    double num_val_ = 0.0;
    std::string str_val_;
    std::vector<Json> arr_val_;
    std::map<std::string, Json> obj_val_;

    static void skip_whitespace(const std::string& str, size_t& pos) {
        while (pos < str.size() && (std::isspace(str[pos]) || str[pos] == '\r' || str[pos] == '\n')) {
            pos++;
        }
    }

    static std::string parse_string(const std::string& str, size_t& pos) {
        pos++; // Skip opening quote
        std::string res;
        while (pos < str.size() && str[pos] != '"') {
            if (str[pos] == '\\') {
                pos++;
                if (pos >= str.size()) break;
                char c = str[pos];
                if (c == 'n') res += '\n';
                else if (c == 't') res += '\t';
                else if (c == 'r') res += '\r';
                else res += c;
            } else {
                res += str[pos];
            }
            pos++;
        }
        if (pos < str.size()) pos++; // Skip closing quote
        return res;
    }

    static Json parse_value(const std::string& str, size_t& pos) {
        skip_whitespace(str, pos);
        if (pos >= str.size()) return Json();

        char c = str[pos];
        if (c == '"') {
            return Json(parse_string(str, pos));
        } else if (c == '{') {
            pos++; // Skip '{'
            std::map<std::string, Json> obj;
            skip_whitespace(str, pos);
            while (pos < str.size() && str[pos] != '}') {
                skip_whitespace(str, pos);
                if (str[pos] != '"') {
                    throw std::runtime_error("Expected string key in object");
                }
                std::string key = parse_string(str, pos);
                skip_whitespace(str, pos);
                if (pos >= str.size() || str[pos] != ':') {
                    throw std::runtime_error("Expected ':' after key in object");
                }
                pos++; // Skip ':'
                obj[key] = parse_value(str, pos);
                skip_whitespace(str, pos);
                if (pos < str.size() && str[pos] == ',') {
                    pos++;
                } else if (pos < str.size() && str[pos] != '}') {
                    throw std::runtime_error("Expected ',' or '}' in object");
                }
                skip_whitespace(str, pos);
            }
            if (pos < str.size()) pos++; // Skip '}'
            return Json(obj);
        } else if (c == '[') {
            pos++; // Skip '['
            std::vector<Json> arr;
            skip_whitespace(str, pos);
            while (pos < str.size() && str[pos] != ']') {
                arr.push_back(parse_value(str, pos));
                skip_whitespace(str, pos);
                if (pos < str.size() && str[pos] == ',') {
                    pos++;
                } else if (pos < str.size() && str[pos] != ']') {
                    throw std::runtime_error("Expected ',' or ']' in array");
                }
                skip_whitespace(str, pos);
            }
            if (pos < str.size()) pos++; // Skip ']'
            return Json(arr);
        } else if (std::isdigit(c) || c == '-' || c == '.') {
            std::string num_str;
            while (pos < str.size() && (std::isdigit(str[pos]) || str[pos] == '-' || str[pos] == '+' || str[pos] == '.' || str[pos] == 'e' || str[pos] == 'E')) {
                num_str += str[pos++];
            }
            try {
                return Json(std::stod(num_str));
            } catch (...) {
                return Json(0.0);
            }
        } else if (pos + 4 <= str.size() && str.substr(pos, 4) == "true") {
            pos += 4;
            return Json(true);
        } else if (pos + 5 <= str.size() && str.substr(pos, 5) == "false") {
            pos += 5;
            return Json(false);
        } else if (pos + 4 <= str.size() && str.substr(pos, 4) == "null") {
            pos += 4;
            return Json();
        }

        pos++;
        return Json();
    }

public:
    Json() : type_(Null) {}
    explicit Json(bool val) : type_(Bool), bool_val_(val) {}
    explicit Json(double val) : type_(Number), num_val_(val) {}
    explicit Json(std::string val) : type_(String), str_val_(std::move(val)) {}
    explicit Json(const char* val) : type_(String), str_val_(val) {}
    explicit Json(std::vector<Json> val) : type_(Array), arr_val_(std::move(val)) {}
    explicit Json(std::map<std::string, Json> val) : type_(Object), obj_val_(std::move(val)) {}

    Type type() const { return type_; }
    bool is_null() const { return type_ == Null; }
    bool is_bool() const { return type_ == Bool; }
    bool is_number() const { return type_ == Number; }
    bool is_string() const { return type_ == String; }
    bool is_array() const { return type_ == Array; }
    bool is_object() const { return type_ == Object; }

    bool as_bool(bool default_val = false) const {
        return (type_ == Bool) ? bool_val_ : default_val;
    }

    double as_double(double default_val = 0.0) const {
        if (type_ == Number) return num_val_;
        if (type_ == String) {
            try {
                return std::stod(str_val_);
            } catch (...) {
                return default_val;
            }
        }
        return default_val;
    }

    std::string as_string(const std::string& default_val = "") const {
        if (type_ == String) return str_val_;
        if (type_ == Number) {
            std::ostringstream ss;
            ss << num_val_;
            return ss.str();
        }
        return default_val;
    }

    const std::vector<Json>& as_array() const {
        if (type_ != Array) {
            static const std::vector<Json> static_empty_arr;
            return static_empty_arr;
        }
        return arr_val_;
    }

    const std::map<std::string, Json>& as_object() const {
        if (type_ != Object) {
            static const std::map<std::string, Json> static_empty_obj;
            return static_empty_obj;
        }
        return obj_val_;
    }

    bool has_key(const std::string& key) const {
        if (type_ != Object) return false;
        return obj_val_.find(key) != obj_val_.end();
    }

    Json get(const std::string& key) const {
        if (type_ != Object) return Json();
        auto it = obj_val_.find(key);
        if (it != obj_val_.end()) return it->second;
        return Json();
    }

    static Json parse(const std::string& str) {
        size_t pos = 0;
        return parse_value(str, pos);
    }
};

#endif // JSON_HPP
