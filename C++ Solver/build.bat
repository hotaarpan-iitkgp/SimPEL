@echo off
echo ===================================================
echo   Building C++ Fast Circuit Solver (Release O3)
echo ===================================================

if not exist build mkdir build
cd build

cmake -G "MinGW Makefiles" .. 2>nul
if %errorlevel% neq 0 (
    echo MinGW not found, falling back to default CMake generator...
    cmake ..
)

cmake --build . --config Release

if %errorlevel% equ 0 (
    echo.
    echo ===================================================
    echo BUILD SUCCESSFUL!
    echo Executable created: build\circuitsim_solver.exe
    echo ===================================================
) else (
    echo.
    echo BUILD FAILED! Please verify your C++ compiler setup.
)

cd ..
