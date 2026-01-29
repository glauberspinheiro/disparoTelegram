// Telegram MTProto bulk sender using GramJS (based on official Telegram API).
// Requires consent: recipients must have your account in contacts or accept messages.
require("dotenv").config();

const fs = require("fs");
const EventEmitter = require("events");
const { parse } = require("csv-parse/sync");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { Api } = require("telegram");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const loadContacts = (source) => {
  // Se for um array (vindo do Banco de Dados), usa direto
  if (Array.isArray(source)) {
    return source.map(c => ({
      phone: String(c.phone).replace(/\D/g, ""),
      message: c.message || "",
      image: c.image || ""
    }));
  }
  // Se for string, tenta ler como arquivo CSV
  if (typeof source === 'string' && !fs.existsSync(source)) {
    console.error(`ERRO: O arquivo "${source}" não foi encontrado.`);
    return [];
  }
  const raw = fs.readFileSync(source, "utf8");
  
  // --- DEBUG: Mostrar o que o script está lendo ---
  console.log(`\n--- DEBUG CSV ---`);
  console.log(`Tamanho do arquivo: ${raw.length} bytes`);
  console.log(`Conteúdo inicial:\n${raw.slice(0, 150)}...`);
  console.log(`-----------------\n`);
  // ------------------------------------------------

  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    delimiter: [",", ";"],
    relax_column_count: true,
  });
  return rows.map((row) => {
    // Normaliza as chaves para minúsculo (evita erro se estiver "Phone" em vez de "phone")
    const norm = {};
    Object.keys(row).forEach(k => norm[k.toLowerCase()] = row[k]);
    
    return {
      phone: String(norm.phone || norm.telefone || norm.tel || "").replace(/\D/g, ""),
      message: String(norm.message || norm.mensagem || "").trim(),
      image: String(norm.image || norm.imagem || norm.foto || "").trim(),
    };
  }).filter((row) => row.phone);
};

const importAndSend = async (client, contact, index, defaultMessage, defaultImage, uploadedDefaultImage, logger) => {
  const clientId = BigInt(Date.now()) + BigInt(index + 1);
  const result = await client.invoke(
    new Api.contacts.ImportContacts({
      contacts: [
        new Api.InputPhoneContact({
          clientId,
          phone: contact.phone,
          firstName: "Contato",
          lastName: "Telegram",
        }),
      ],
    })
  );

  if (!result.users || result.users.length === 0) {
    logger(`[AVISO] Usuário Telegram não encontrado para ${contact.phone}`);
    return;
  }

  const message = contact.message || defaultMessage;
  
  if (!message) {
    logger(`[PULAR] ${contact.phone}: mensagem vazia`);
    return;
  }

  // Lógica de Seleção de Imagem (Prioridade: Contato > UploadedDefault > Buffer/Path Default)
  let fileToSend = null;
  if (contact.image && fs.existsSync(contact.image)) {
    fileToSend = contact.image; // Imagem específica do contato
  } else if (uploadedDefaultImage) {
    fileToSend = uploadedDefaultImage; // Imagem padrão já enviada ao Telegram (Rápido)
  } else if (defaultImage) {
    // Aceita Buffer (do DB) ou String (Caminho)
    if (Buffer.isBuffer(defaultImage)) fileToSend = defaultImage;
    else if (typeof defaultImage === 'string' && fs.existsSync(defaultImage)) fileToSend = defaultImage;
  }

  if (fileToSend) {
    await client.sendFile(result.users[0], {
      file: fileToSend,
      caption: message,
      forceDocument: false, // Garante que vá como foto/vídeo e não arquivo genérico
    });
    logger(`[SUCESSO] Imagem + Mensagem enviada para ${contact.phone}`);
  } else {
    await client.sendMessage(result.users[0], { message });
    logger(`[SUCESSO] Mensagem enviada para ${contact.phone}`);
  }
};

class TelegramService extends EventEmitter {
  constructor() {
    super();
    this.client = null;
    this.resolvers = {}; // Para armazenar promessas de input (código, senha)
    this.shouldStop = false;
  }

  log(msg) {
    console.log(msg);
    this.emit("log", msg);
  }

  async startLogin(config) {
    const apiId = Number(config.apiId);
    const apiHash = config.apiHash;
    const sessionString = config.session || "";

    this.log("Iniciando cliente Telegram...");
    const stringSession = new StringSession(sessionString);
    this.client = new TelegramClient(stringSession, apiId, apiHash, {
      connectionRetries: 5,
    });

    await this.client.start({
      phoneNumber: async () => {
        this.log("Aguardando número de telefone...");
        this.emit("status", "waiting_phone");
        return new Promise((resolve) => { this.resolvers.phone = resolve; });
      },
      phoneCode: async () => {
        this.log("Aguardando código de login...");
        this.emit("status", "waiting_code");
        return new Promise((resolve) => { this.resolvers.code = resolve; });
      },
      password: async () => {
        this.log("Aguardando senha 2FA...");
        this.emit("status", "waiting_password");
        return new Promise((resolve) => { this.resolvers.password = resolve; });
      },
      onError: (err) => this.log(`Erro no cliente: ${err}`),
    });

    this.log("Login realizado com sucesso!");
    this.emit("status", "ready");
    const newSession = this.client.session.save();
    this.emit("session", newSession);
    return newSession;
  }

  submitInput(type, value) {
    if (this.resolvers[type]) {
      this.resolvers[type](value);
      delete this.resolvers[type];
    }
  }

  async getTelegramContacts() {
    if (!this.client || !await this.client.checkAuthorization()) {
      throw new Error("Cliente não conectado. Faça login na aba Conexão.");
    }
    // hash: 0 retorna todos os contatos
    const result = await this.client.invoke(new Api.contacts.GetContacts({ hash: BigInt(0) }));
    return result.users; // Retorna a lista de objetos de usuário (com telefone e nome)
  }

  stop() {
    this.shouldStop = true;
    this.log("🛑 Solicitação de parada recebida. O envio será interrompido após a mensagem atual.");
  }

  async startBulkSend(source, message, imageFile, delay, onResult) {
    if (!this.client || !await this.client.checkAuthorization()) {
      this.log("Erro: Cliente não está conectado.");
      return;
    }

    // --- OTIMIZAÇÃO: Upload Prévio da Imagem Padrão ---
    let uploadedFile = null;
    // Verifica se é um Buffer válido ou um arquivo existente
    const isValidImage = imageFile && (Buffer.isBuffer(imageFile) || (typeof imageFile === 'string' && fs.existsSync(imageFile)));
    
    if (isValidImage) {
      this.log("Otimizando: Fazendo upload da imagem padrão para o Telegram...");
      try {
        uploadedFile = await this.client.uploadFile({
          file: imageFile,
          name: 'image.jpg', // Nome genérico ajuda o Telegram a identificar
          workers: 1,
        });
        this.log("Upload concluído. A imagem será reutilizada para todos os contatos.");
      } catch (e) {
        this.log("Erro no upload prévio: " + e.message + ". Tentando envio direto.");
      }
    }
    // --------------------------------------------------

    const contacts = loadContacts(source);
    this.log(`Carregados ${contacts.length} contatos para envio.`);

    const total = contacts.length;
    this.shouldStop = false; // Reseta a flag antes de começar

    for (let i = 0; i < contacts.length; i += 1) {
      if (this.shouldStop) {
        this.log("🛑 Envio em massa interrompido pelo usuário.");
        break;
      }

      try {
        // Emitir progresso
        const percent = Math.round(((i + 1) / total) * 100);
        this.emit("progress", { current: i + 1, total: total, percent: percent });

        await importAndSend(this.client, contacts[i], i, message, imageFile, uploadedFile, (msg) => this.log(msg));
        if (onResult) await onResult(contacts[i], 'SUCESSO', null);
      } catch (err) {
        const msg = String(err && err.message ? err.message : err);
        if (onResult) await onResult(contacts[i], 'ERRO', msg);
        
        if (msg.includes("FLOOD_WAIT") && err.seconds) {
          this.log(`Aguardando Flood Wait de ${err.seconds}s...`);
          await sleep((err.seconds + 1) * 1000);
        } else {
          this.log(`Falha para ${contacts[i].phone}: ${msg}`);
        }
      }
      await sleep(delay);
    }
    this.log("Envio em massa finalizado.");
  }
}

module.exports = new TelegramService();
