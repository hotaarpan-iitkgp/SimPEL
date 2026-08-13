#include "SolverServer.hpp"
#include "../engine/NetlistParser.hpp"
#include "../engine/CircuitSimulator.hpp"

#include <iostream>
#include <sstream>
#include <thread>
#include <chrono>
#include <algorithm>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib, "ws2_32.lib")
typedef int socklen_t;
#else
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#define SOCKET int
#define INVALID_SOCKET -1
#define SOCKET_ERROR -1
#define closesocket close
#endif

#include <nlohmann/json.hpp>
using json = nlohmann::json;

namespace CircuitSimEngine {

void SolverServer::start() {
    isRunning = true;

#ifdef _WIN32
    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
        std::cerr << "[C++ SOLVER ERROR] Failed to initialize WinSock." << std::endl;
        return;
    }
#endif

    SOCKET listenSock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (listenSock == INVALID_SOCKET) {
        std::cerr << "[C++ SOLVER ERROR] Error creating socket." << std::endl;
        return;
    }

    int opt = 1;
    setsockopt(listenSock, SOL_SOCKET, SO_REUSEADDR, (const char*)&opt, sizeof(opt));

    sockaddr_in serverAddr{};
    serverAddr.sin_family = AF_INET;
    serverAddr.sin_addr.s_addr = INADDR_ANY;
    serverAddr.sin_port = htons(port);

    int bindRetries = 0;
    while (bind(listenSock, (sockaddr*)&serverAddr, sizeof(serverAddr)) == SOCKET_ERROR) {
        std::cerr << "[C++ SOLVER WARNING] Port " << port << " busy, retrying (" << ++bindRetries << "/5)..." << std::endl;
#ifdef _WIN32
        Sleep(500);
#else
        std::this_thread::sleep_for(std::chrono::milliseconds(500));
#endif
        if (bindRetries >= 5) {
            std::cerr << "[C++ SOLVER ERROR] Could not bind to port " << port << std::endl;
            closesocket(listenSock);
            return;
        }
    }

    if (listen(listenSock, SOMAXCONN) == SOCKET_ERROR) {
        std::cerr << "[C++ SOLVER ERROR] Error listening on socket." << std::endl;
        closesocket(listenSock);
        return;
    }

    std::cout << "\n=======================================================\n";
    std::cout << "  C++ Native High-Performance Circuit Solver Active!  \n";
    std::cout << "  Listening on: http://127.0.0.1:" << port << "\n";
    std::cout << "  Endpoint:     http://127.0.0.1:" << port << "/api/simulate\n";
    std::cout << "=======================================================\n" << std::flush;

    while (isRunning) {
        sockaddr_in clientAddr{};
        socklen_t clientLen = sizeof(clientAddr);
        SOCKET clientSock = accept(listenSock, (sockaddr*)&clientAddr, &clientLen);

        if (clientSock == INVALID_SOCKET) {
#ifdef _WIN32
            Sleep(10);
#else
            std::this_thread::sleep_for(std::chrono::milliseconds(10));
#endif
            continue;
        }

        // Handle in worker thread
        std::thread([clientSock]() {
            char buffer[16384];
            std::string requestStr;
            int bytesRead = 0;

            // Read header section until \r\n\r\n
            while ((bytesRead = recv(clientSock, buffer, sizeof(buffer) - 1, 0)) > 0) {
                buffer[bytesRead] = '\0';
                requestStr.append(buffer, bytesRead);
                if (requestStr.find("\r\n\r\n") != std::string::npos) break;
            }

            // Options / CORS preflight
            if (requestStr.rfind("OPTIONS", 0) == 0) {
                std::string corsResp = 
                    "HTTP/1.1 204 No Content\r\n"
                    "Access-Control-Allow-Origin: *\r\n"
                    "Access-Control-Allow-Methods: POST, GET, OPTIONS\r\n"
                    "Access-Control-Allow-Headers: Content-Type\r\n"
                    "Connection: close\r\n\r\n";
                send(clientSock, corsResp.c_str(), (int)corsResp.size(), 0);
                closesocket(clientSock);
                return;
            }

            // Extract Content-Length case-insensitively
            size_t contentLen = 0;
            std::string lowerReq = requestStr;
            std::transform(lowerReq.begin(), lowerReq.end(), lowerReq.begin(), ::tolower);
            size_t clPos = lowerReq.find("content-length:");
            if (clPos != std::string::npos) {
                size_t valStart = clPos + 15;
                size_t valEnd = lowerReq.find("\r\n", valStart);
                if (valEnd != std::string::npos) {
                    try {
                        contentLen = std::stoul(requestStr.substr(valStart, valEnd - valStart));
                    } catch (...) {}
                }
            }

            size_t headerEnd = requestStr.find("\r\n\r\n");
            std::string body = "";
            if (headerEnd != std::string::npos) {
                body = requestStr.substr(headerEnd + 4);
            }

            while (body.size() < contentLen) {
                bytesRead = recv(clientSock, buffer, sizeof(buffer) - 1, 0);
                if (bytesRead <= 0) break;
                body.append(buffer, bytesRead);
            }

            // Execute Simulation
            std::vector<ComponentModel> physComps;
            std::vector<ComponentModel> ctrlComps;
            SimulationConfig cfg;

            if (NetlistParser::parseJsonString(body, physComps, ctrlComps, cfg)) {
                auto t0 = std::chrono::high_resolution_clock::now();
                
                CircuitSimulator sim;
                sim.setup(physComps, ctrlComps, cfg);
                SimulationOutput res = sim.runTransient();

                auto t1 = std::chrono::high_resolution_clock::now();
                double elapsedMs = std::chrono::duration<double, std::milli>(t1 - t0).count();

                std::cout << "[C++ SOLVER] Solved " << res.time.size() << " steps in " << elapsedMs << " ms.\n" << std::flush;

                // Format Output JSON
                json outJson;
                outJson["time"] = res.time;
                outJson["voltages"] = res.voltages;
                outJson["inductors"] = res.inductors;
                outJson["voltmeters"] = res.voltmeters;
                outJson["ammeters"] = res.ammeters;
                outJson["signals"] = res.signals;
                outJson["custom_plots"] = res.custom_plots;

                std::string jsonStr = outJson.dump();

                std::ostringstream httpResp;
                httpResp << "HTTP/1.1 200 OK\r\n"
                         << "Content-Type: application/json\r\n"
                         << "Access-Control-Allow-Origin: *\r\n"
                         << "Content-Length: " << jsonStr.size() << "\r\n"
                         << "Connection: close\r\n\r\n"
                         << jsonStr;

                std::string respStr = httpResp.str();
                send(clientSock, respStr.c_str(), (int)respStr.size(), 0);
            } else {
                std::cerr << "[C++ SOLVER ERROR] Failed to parse netlist JSON body (length: " << body.size() << ")\n" << std::flush;
                std::string errResp = "HTTP/1.1 400 Bad Request\r\nContent-Type: text/plain\r\nContent-Length: 26\r\n\r\nInvalid Netlist JSON Body";
                send(clientSock, errResp.c_str(), (int)errResp.size(), 0);
            }

            closesocket(clientSock);
        }).detach();
    }

    closesocket(listenSock);
#ifdef _WIN32
    WSACleanup();
#endif
}

void SolverServer::stop() {
    isRunning = false;
}

} // namespace CircuitSimEngine
