@echo off
title C++ Native Circuit Solver (Port 3001)
echo =======================================================
echo   Starting C++ Native Circuit Solver Server...
echo =======================================================
cd /d "%~dp0C++ Solver\build"

if not exist circuitsim_solver.exe (
    echo Executable not found! Building solver...
    cd /d "%~dp0C++ Solver"
    call build.bat
    cd /d "%~dp0C++ Solver\build"
)

circuitsim_solver.exe
pause
