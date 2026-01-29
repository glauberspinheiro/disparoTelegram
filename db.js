const { Pool } = require('pg');
require('dotenv').config();

// Certifique-se de ter DATABASE_URL no seu .env
// Exemplo: postgres://postgres:senha@localhost:5432/acaiteria
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const initDb = async () => {
  if (!process.env.DATABASE_URL) return;
  
  const client = await pool.connect();
  try {
    // Tabela de Configurações (Sessão)
    await client.query(`CREATE TABLE IF NOT EXISTS settings (key VARCHAR(50) PRIMARY KEY, value TEXT);`);

    // Tabela de Contatos
    await client.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(20) UNIQUE NOT NULL,
        name VARCHAR(100),
        message_count INT DEFAULT 0,
        last_sent_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migração automática: Garantir que colunas novas existam (caso a tabela já tenha sido criada antes)
    try {
      await client.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS message_count INT DEFAULT 0;`);
      await client.query(`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMP;`);
    } catch (e) {
      // Ignorar erros se colunas já existirem
    }

    // Tabela de Templates
    await client.query(`
      CREATE TABLE IF NOT EXISTS templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        message TEXT,
        image_path TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Tabela de Logs
    await client.query(`CREATE TABLE IF NOT EXISTS logs (id SERIAL PRIMARY KEY, phone VARCHAR(20), status VARCHAR(20), error_details TEXT, sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);

    // Tabela de Galeria
    await client.query(`
      CREATE TABLE IF NOT EXISTS gallery (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        original_name VARCHAR(255),
        data TEXT,
        mime_type VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Migração: Adicionar colunas para suporte a Base64 em bancos existentes
    try {
      await client.query(`ALTER TABLE gallery ADD COLUMN IF NOT EXISTS data TEXT;`);
      await client.query(`ALTER TABLE gallery ADD COLUMN IF NOT EXISTS mime_type VARCHAR(50);`);
      await client.query(`ALTER TABLE gallery ALTER COLUMN path DROP NOT NULL;`); // Torna path opcional
    } catch (e) {}
    
    console.log("Banco de dados PostgreSQL conectado e tabelas verificadas.");
  } catch (err) {
    console.error("Erro ao conectar no PostgreSQL:", err.message);
  } finally {
    client.release();
  }
};

module.exports = { pool, initDb };