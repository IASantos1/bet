@echo off
cd /d "%~dp0"
echo Iniciando Worker da BET62 fora do Trae...
echo.
echo Se pedir permissao de Firewall, clique em Permitir.
echo Se der erro EPERM novamente, feche tudo e tente de novo.
echo.
npm run worker
pause