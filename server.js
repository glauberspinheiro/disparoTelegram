// c:\Users\Glauber\OneDrive\Documentos\DevAcaiteria\server.js
require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const telegramService = require("./ScriptTelegram");
const db = require("./db");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Configuração de Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// Middleware
app.use(express.static("public"));
app.use(express.json());

// Criar pastas necessárias
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
if (!fs.existsSync("public")) fs.mkdirSync("public");

// Inicializar Banco de Dados
db.initDb();

// --- Rotas da API ---

// 1. Obter Configuração Atual
app.get("/api/config", async (req, res) => {
  let session = process.env.TELEGRAM_SESSION || "";
  // Tentar buscar sessão do banco se não estiver no env (ou para priorizar banco)
  try {
    const result = await db.pool.query("SELECT value FROM settings WHERE key = 'session'");
    if (result.rows.length > 0) session = result.rows[0].value;
  } catch (e) {}

  res.json({
    apiId: process.env.TELEGRAM_API_ID || "",
    apiHash: process.env.TELEGRAM_API_HASH || "",
    session: session,
  });
});

// 2. Salvar Configuração
app.post("/api/config", async (req, res) => {
  const { apiId, apiHash, session } = req.body;
  
  // Atualizar arquivo .env apenas com chaves (Key e ID)
  let envContent = `TELEGRAM_API_ID=${apiId}\nTELEGRAM_API_HASH=${apiHash}\nDATABASE_URL=${process.env.DATABASE_URL}\n`;
  fs.writeFileSync(".env", envContent);
  
  // Salvar sessão no Banco de Dados
  await db.pool.query("INSERT INTO settings (key, value) VALUES ('session', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [session]);

  res.json({ success: true });
});

// 3. Iniciar Login
app.post("/api/login/start", async (req, res) => {
  let session = "";
  try {
    const r = await db.pool.query("SELECT value FROM settings WHERE key = 'session'");
    if (r.rows.length > 0) session = r.rows[0].value;
  } catch (e) {}

  const config = {
    apiId: process.env.TELEGRAM_API_ID,
    apiHash: process.env.TELEGRAM_API_HASH,
    session: session,
  };
  
  // Não aguarda terminar, pois o login é interativo
  telegramService.startLogin(config).catch(err => {
    telegramService.log("Erro fatal no login: " + err.message);
  });
  
  res.json({ success: true, message: "Processo de login iniciado." });
});

// 4. Enviar Dados de Login (Telefone, Código, Senha)
app.post("/api/login/input", (req, res) => {
  const { type, value } = req.body; // type: 'phone', 'code', 'password'
  telegramService.submitInput(type, value);
  res.json({ success: true });
});

// 5. Enviar Mensagens (Upload de CSV e Imagem)
app.post("/api/send", upload.fields([{ name: 'csv' }, { name: 'image' }]), async (req, res) => {
  const message = req.body.message;
  const delay = Number(req.body.delay) || 3000;
  const sourceType = req.body.sourceType; // 'csv', 'db_all', 'db_filter'
  
  const csvFile = req.files['csv'] ? req.files['csv'][0].path : null;
  const imageFile = req.files['image'] ? req.files['image'][0].path : null;

  let source = csvFile;

  if (sourceType === 'db_all' || sourceType === 'db_filter') {
    try {
      let query = "SELECT phone, name FROM contacts";
      let params = [];

      if (sourceType === 'db_filter') {
        const days = Number(req.body.filterDays) || 0;
        const limit = Number(req.body.filterLimit) || 1000;
        // Seleciona quem nunca recebeu (NULL) OU quem recebeu há mais de X dias
        query += " WHERE last_sent_at IS NULL OR last_sent_at < NOW() - ($1 * INTERVAL '1 day') ORDER BY last_sent_at ASC NULLS FIRST LIMIT $2";
        params = [days, limit];
      }

      const result = await db.pool.query(query, params);
      source = result.rows; // Array de contatos do banco
      if (source.length === 0) return res.status(400).json({ error: "Nenhum contato salvo no banco." });
    } catch (e) {
      return res.status(500).json({ error: "Erro ao ler banco de dados." });
    }
  } else if (sourceType === 'csv' && !csvFile) {
    return res.status(400).json({ error: "Arquivo CSV ou uso do Banco é obrigatório." });
  }

  // Iniciar envio em background
  telegramService.startBulkSend(source, message, imageFile, delay, async (contact, status, error) => {
    // Callback para salvar log no banco
    try {
      await db.pool.query("INSERT INTO logs (phone, status, error_details) VALUES ($1, $2, $3)", 
        [contact.phone, status, error || '']);
      
      if (status === 'SUCESSO') {
        // Tenta atualizar o contato existente (COALESCE garante que NULL vire 0 antes de somar)
        const result = await db.pool.query(
          "UPDATE contacts SET message_count = COALESCE(message_count, 0) + 1, last_sent_at = CURRENT_TIMESTAMP WHERE phone = $1", 
          [contact.phone]
        );

        // Se o contato não existir (ex: envio via CSV), cria o registro automaticamente
        if (result.rowCount === 0) {
          await db.pool.query(
            "INSERT INTO contacts (phone, name, message_count, last_sent_at) VALUES ($1, $2, 1, CURRENT_TIMESTAMP) ON CONFLICT (phone) DO UPDATE SET message_count = COALESCE(contacts.message_count, 0) + 1, last_sent_at = CURRENT_TIMESTAMP",
            [contact.phone, "Auto (CSV)"]
          );
        }
      }
    } catch (e) {
      console.error("Erro ao salvar log:", e);
    }
  });

  res.json({ success: true, message: "Disparo iniciado! Acompanhe no log." });
});

// 6. Parar Envio
app.post("/api/stop", (req, res) => {
  telegramService.stop();
  res.json({ success: true, message: "Parando envio..." });
});

// --- Rotas CRUD Banco de Dados ---

// Contatos
app.get("/api/db/contacts", async (req, res) => {
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  try {
    const result = await db.pool.query("SELECT * FROM contacts ORDER BY id DESC LIMIT $1 OFFSET $2", [limit, offset]);
    const countRes = await db.pool.query("SELECT COUNT(*) FROM contacts");
    res.json({
      contacts: result.rows,
      total: Number(countRes.rows[0].count),
      page,
      limit
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Filtrar Contatos (Preview)
app.post("/api/db/filter-preview", async (req, res) => {
  const days = Number(req.body.days) || 0;
  const limit = Number(req.body.limit) || 10;
  
  try {
    const result = await db.pool.query(`
      SELECT phone, name, message_count, last_sent_at 
      FROM contacts 
      WHERE last_sent_at IS NULL OR last_sent_at < NOW() - ($1 * INTERVAL '1 day') 
      ORDER BY last_sent_at ASC NULLS FIRST 
      LIMIT $2`, [days, limit]);
    res.json(result.rows);
  } catch (e) { 
    console.error("Erro no filtro SQL:", e);
    res.status(500).json({ error: e.message }); 
  }
});

app.post("/api/db/contacts", async (req, res) => {
  const { phone, name } = req.body;
  try {
    await db.pool.query("INSERT INTO contacts (phone, name) VALUES ($1, $2)", [phone, name]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Importar do Telegram
app.post("/api/telegram/import-contacts", async (req, res) => {
  try {
    const users = await telegramService.getTelegramContacts();
    let count = 0;
    
    for (const user of users) {
      if (user.phone) {
        const name = ((user.firstName || "") + " " + (user.lastName || "")).trim();
        // Salvar no banco (ON CONFLICT DO NOTHING evita erro se o telefone já existir)
        await db.pool.query("INSERT INTO contacts (phone, name) VALUES ($1, $2) ON CONFLICT (phone) DO NOTHING", [user.phone, name || "Sem Nome"]);
        count++;
      }
    }
    res.json({ success: true, message: `Importação concluída! ${count} contatos processados.` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Templates
app.get("/api/db/templates", async (req, res) => {
  try {
    const result = await db.pool.query("SELECT * FROM templates ORDER BY id DESC");
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/db/templates", async (req, res) => {
  const { name, message } = req.body;
  try {
    await db.pool.query("INSERT INTO templates (name, message) VALUES ($1, $2)", [name, message]);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Logs
app.get("/api/db/logs", async (req, res) => {
  try {
    const result = await db.pool.query("SELECT * FROM logs ORDER BY sent_at DESC LIMIT 100");
    res.json(result.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Socket.io para Logs em Tempo Real ---
telegramService.on("log", (msg) => io.emit("log", msg));
telegramService.on("status", (status) => io.emit("status", status));
telegramService.on("session", async (session) => {
    // Salvar sessão no Banco
    await db.pool.query("INSERT INTO settings (key, value) VALUES ('session', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [session]);
    io.emit("log", "Sessão salva automaticamente no Banco de Dados.");
});

// Iniciar Servidor
const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:`);
});
