@echo off
chcp 65001 >nul
title Marcos Donate - actualizar clips de vista previa
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo No encuentro Python. Instalalo desde https://www.python.org/downloads/
  echo y vuelve a ejecutar este archivo.
  echo.
  pause
  exit /b 1
)

echo.
echo Generando los clips que hayas encolado en /admin ...
echo.
python tools\procesar_cola.py

echo.
pause
