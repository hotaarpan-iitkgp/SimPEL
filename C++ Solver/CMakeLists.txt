cmake_minimum_required(VERSION 3.16)
project(CircuitSimFastSolver LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include_directories(
    src
    "../c++ version/3rdparty"
)

set(SOURCES
    src/main.cpp
    src/engine/ExpressionEvaluator.cpp
    src/engine/CScriptEngine.cpp
    src/engine/CircuitSimulator.cpp
    src/engine/NetlistParser.cpp
    src/server/SolverServer.cpp
)

add_executable(circuitsim_solver ${SOURCES})

if (WIN32)
    target_link_libraries(circuitsim_solver PRIVATE ws2_32)
    if (MINGW)
        target_link_options(circuitsim_solver PRIVATE -static -static-libgcc -static-libstdc++)
    endif()
endif()

if (MSVC)
    target_compile_options(circuitsim_solver PRIVATE /O2 /arch:AVX2 /fp:fast)
else()
    target_compile_options(circuitsim_solver PRIVATE -O3 -march=native -ffast-math)
endif()

