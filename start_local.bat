@echo off
echo Starting BET62 Local Environment...

echo Starting Backend Worker...
start "BET62 Worker" npm run worker

echo Starting Frontend...
start "BET62 Frontend" npm run dev

echo Waiting for services to initialize...
timeout /t 10

echo Importing initial data (Force Import)...
npm run import

echo.
echo Environment is ready!
echo Frontend: http://localhost:5173
echo Backend: http://127.0.0.1:8788
echo.
pause
