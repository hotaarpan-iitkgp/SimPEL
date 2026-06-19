@echo off
echo ===================================================
echo   Starting SimPEL (Voltaic++) Development Server
echo ===================================================
echo.
npm.cmd run dev
if errorlevel 1 (
    echo.
    echo Server stopped with an error.
    pause
)
