@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "node_modules" (
  echo Установка зависимостей...
  call npm.cmd install
)
echo Запуск сервера Шашки Pro на http://localhost:3000 ...
start "" "http://localhost:3000"
node server/server.js
pause
