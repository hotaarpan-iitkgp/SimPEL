#ifndef MATRIX_HPP
#define MATRIX_HPP

#include <vector>
#include <iostream>
#include <cmath>
#include <stdexcept>

class Vector {
public:
    std::vector<double> data;

    Vector() = default;
    explicit Vector(size_t size, double init_val = 0.0) : data(size, init_val) {}
    Vector(std::initializer_list<double> list) : data(list) {}

    size_t size() const { return data.size(); }
    void resize(size_t size, double val = 0.0) { data.resize(size, val); }

    double& operator[](size_t idx) {
        return data[idx];
    }

    const double& operator[](size_t idx) const {
        return data[idx];
    }

    Vector operator+(const Vector& other) const {
        Vector res(size());
        for (size_t i = 0; i < size(); ++i) res[i] = data[i] + other.data[i];
        return res;
    }

    Vector operator-(const Vector& other) const {
        Vector res(size());
        for (size_t i = 0; i < size(); ++i) res[i] = data[i] - other.data[i];
        return res;
    }

    Vector operator*(double scalar) const {
        Vector res(size());
        for (size_t i = 0; i < size(); ++i) res[i] = data[i] * scalar;
        return res;
    }
};

inline Vector operator*(double scalar, const Vector& vec) {
    return vec * scalar;
}

class Matrix {
private:
    size_t rows_;
    size_t cols_;
    std::vector<double> data_;

public:
    Matrix() : rows_(0), cols_(0) {}
    Matrix(size_t rows, size_t cols, double init_val = 0.0)
        : rows_(rows), cols_(cols), data_(rows * cols, init_val) {}

    size_t rows() const { return rows_; }
    size_t cols() const { return cols_; }

    void resize(size_t rows, size_t cols, double init_val = 0.0) {
        rows_ = rows;
        cols_ = cols;
        data_.assign(rows * cols, init_val);
    }

    double& operator()(size_t r, size_t c) {
        return data_[r * cols_ + c];
    }

    const double& operator()(size_t r, size_t c) const {
        return data_[r * cols_ + c];
    }

    void setZero() {
        std::fill(data_.begin(), data_.end(), 0.0);
    }

    // Solves Ax = b using Gaussian elimination with partial pivoting for stability.
    // Throws dynamic runtime_error if singular.
    Vector solve(const Vector& b) const {
        if (rows_ != cols_) {
            throw std::runtime_error("Solve requires a square matrix");
        }
        if (rows_ != b.size()) {
            throw std::runtime_error("Matrix rows and vector size mismatch");
        }

        size_t n = rows_;
        Matrix A = *this;
        Vector x = b;

        for (size_t i = 0; i < n; ++i) {
            // Find pivot
            size_t max_row = i;
            double max_val = std::abs(A(i, i));
            for (size_t k = i + 1; k < n; ++k) {
                double val = std::abs(A(k, i));
                if (val > max_val) {
                    max_val = val;
                    max_row = k;
                }
            }

            // Swap rows in A and x
            if (max_row != i) {
                for (size_t j = i; j < n; ++j) {
                    std::swap(A(i, j), A(max_row, j));
                }
                std::swap(x[i], x[max_row]);
            }

            // Check for singularity
            if (std::abs(A(i, i)) < 1e-15) {
                // Return zero vector or throw singular error
                throw std::runtime_error("Singular matrix encountered in linear solver");
            }

            // Pivot elimination
            for (size_t k = i + 1; k < n; ++k) {
                double factor = A(k, i) / A(i, i);
                A(k, i) = 0.0;
                for (size_t j = i + 1; j < n; ++j) {
                    A(k, j) -= factor * A(i, j);
                }
                x[k] -= factor * x[i];
            }
        }

        // Back substitution
        Vector res(n);
        for (int i = static_cast<int>(n) - 1; i >= 0; --i) {
            double sum = 0.0;
            for (size_t j = i + 1; j < n; ++j) {
                sum += A(i, j) * res[j];
            }
            res[i] = (x[i] - sum) / A(i, i);
        }

        return res;
    }

    // Multiply Matrix * Vector
    Vector multiply(const Vector& vec) const {
        if (cols_ != vec.size()) {
            throw std::runtime_error("Matrix column count must match Vector size for multiplication");
        }
        Vector res(rows_, 0.0);
        for (size_t r = 0; r < rows_; ++r) {
            double sum = 0.0;
            for (size_t c = 0; c < cols_; ++c) {
                sum += (*this)(r, c) * vec[c];
            }
            res[r] = sum;
        }
        return res;
    }

    // Submatrix extraction for solving partitioned equations (used in DAE partitioned solver)
    Matrix submatrix(const std::vector<size_t>& rows_indices, const std::vector<size_t>& cols_indices) const {
        Matrix sub(rows_indices.size(), cols_indices.size());
        for (size_t i = 0; i < rows_indices.size(); ++i) {
            for (size_t j = 0; j < cols_indices.size(); ++j) {
                sub(i, j) = (*this)(rows_indices[i], cols_indices[j]);
            }
        }
        return sub;
    }
};

inline Vector operator*(const Matrix& mat, const Vector& vec) {
    return mat.multiply(vec);
}

#endif // MATRIX_HPP
