@echo off
echo Starting C++ Native Circuit Solver on http://127.0.0.1:3001...
start "C++ Circuit Solver Server" /d "%~dp0build" "%~dp0build\circuitsim_solver.exe"
echo C++ Solver Server started in background window on Port 3001.
