@echo off
title Disparador Acaiteria

:: Navega para a pasta do projeto (garante que esteja no drive correto)
cd /d "c:\Users\Glauber\OneDrive\Documentos\DevAcaiteria\"

echo Iniciando o servidor...
echo O navegador abrira em instantes...

:: Abre o navegador no endereço local (o comando start não trava o script)
start http://localhost:3000

:: Inicia o servidor Node.js
node server.js

:: Se o servidor parar (erro ou Ctrl+C), pausa a tela para você ler o que aconteceu
pause