@echo off
echo ===================================================
echo   Voltaic++ Git Push Helper
echo ===================================================
echo.
echo Initializing Git repository...
git init

echo.
echo Adding files to git staging (excluding ignored files)...
git add .

echo.
echo Creating commit...
git commit -m "Deploy Voltaic++ schematic and simulation engine"

echo.
echo Setting branch to main...
git branch -M main

echo.
echo Checking if remote origin already exists...
git remote remove origin >nul 2>&1
git remote add origin https://github.com/hotaarpan-iitkgp/SimPEL.git

echo.
echo Pushing to GitHub (SimPEL repository)...
echo If prompted, please authorize GitHub in the browser or credential manager helper.
echo.
git push -u origin main

echo.
echo ===================================================
echo   Process complete! Press any key to exit.
echo ===================================================
pause
