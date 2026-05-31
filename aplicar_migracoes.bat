@echo off
cd /d "%~dp0"
echo Aplicando migracoes no banco de dados local (D1)...
echo.
echo Se perguntar "Are you sure?", digite "y" e aperte ENTER.
echo.
call npx wrangler d1 migrations apply bet62-db --local
echo.
echo Concluido! Agora feche a janela do worker e abra de novo (iniciar_worker.bat).
pause
