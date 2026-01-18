-- 1. Criação do Banco de Dados
-- Execute esta linha separadamente se o banco ainda não existir:
-- CREATE DATABASE "frazaoAcaiteria";

-- 2. Estrutura das Tabelas
-- Certifique-se de estar conectado ao banco 'frazaoAcaiteria' antes de rodar os comandos abaixo.

-- Tabela para salvar configurações (como a sessão do Telegram)
CREATE TABLE IF NOT EXISTS settings (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT
);

-- Tabela de Contatos
CREATE TABLE IF NOT EXISTS contacts (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20) UNIQUE NOT NULL,
    name VARCHAR(100),
    message_count INT DEFAULT 0,
    last_sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Templates de Mensagem
CREATE TABLE IF NOT EXISTS templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    message TEXT,
    image_path TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Logs de Envio
CREATE TABLE IF NOT EXISTS logs (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(20),
    status VARCHAR(20),
    error_details TEXT,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);