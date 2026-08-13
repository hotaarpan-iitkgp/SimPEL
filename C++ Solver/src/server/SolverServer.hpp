#pragma once

#include <string>
#include <functional>

namespace CircuitSimEngine {

class SolverServer {
private:
    int port = 3001;
    bool isRunning = false;

public:
    SolverServer(int portNum = 3001) : port(portNum) {}
    ~SolverServer() { stop(); }

    void start();
    void stop();
};

} // namespace CircuitSimEngine
