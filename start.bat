@echo off
title Keramika Sintez Server
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================================
echo         Запуск системы Keramika Sintez...
echo ========================================================
echo.

:: Проверка наличия Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ОШИБКА] Node.js не найден на вашем компьютере!
    echo Пожалуйста, установите Node.js с официального сайта: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

:: Проверка наличия node_modules
if not exist "node_modules\" (
    echo [ИНФО] Папка node_modules не найдена. Выполняется npm install...
    call npm install
    if %errorlevel% neq 0 (
        echo [ОШИБКА] Не удалось установить зависимости.
        pause
        exit /b 1
    )
)

echo [ИНФО] Сервер запускается на http://localhost:3000
echo [ИНФО] Нажмите Ctrl+C в этом окне для остановки сервера.
echo.

:: Открытие браузера через 2 секунды после старта
start "" timeout /t 2 /nobreak >nul & start http://localhost:3000

:: Запуск сервера Node.js
node server/server.js

pause
