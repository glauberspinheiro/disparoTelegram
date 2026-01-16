// Telegram MTProto bulk sender using GramJS (based on official Telegram API).
// Requires consent: recipients must have your account in contacts or accept messages.
require("dotenv").config();

const fs = require("fs");
const { parse } = require("csv-parse/sync");
const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { Api } = require("telegram");
const readline = require("readline/promises");

const apiId = Number(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;
const sessionString = process.env.TELEGRAM_SESSION || "";
const contactsCsv = process.env.CONTACTS_CSV || "contacts.csv";
const defaultMessage = process.env.DEFAULT_MESSAGE || "";
const defaultImagePath = process.env.IMAGE_PATH || "";
const delayMs = Number(process.env.DELAY_MS || 2000);

if (!apiId || !apiHash) {
  console.error("Missing TELEGRAM_API_ID / TELEGRAM_API_HASH in .env");
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const ask = async (label) => {
  const answer = await rl.question(label);
  return answer.trim();
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const loadContacts = () => {
  const raw = fs.readFileSync(contactsCsv, "utf8");
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  return rows.map((row) => ({
    phone: String(row.phone || row.telefone || row.tel || "").trim(),
    message: String(row.message || row.mensagem || "").trim(),
    image: String(row.image || row.imagem || row.foto || "").trim(),
  })).filter((row) => row.phone);
};

const importAndSend = async (client, contact, index) => {
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
    console.warn(`No Telegram user for ${contact.phone}`);
    return;
  }

  const message = contact.message || defaultMessage;
  const imagePath = contact.image || defaultImagePath;
  if (!message) {
    console.warn(`Skipping ${contact.phone}: empty message`);
    return;
  }

  if (imagePath) {
    if (!fs.existsSync(imagePath)) {
      console.warn(`Image not found for ${contact.phone}: ${imagePath}`);
      return;
    }
    await client.sendFile(result.users[0], {
      file: imagePath,
      caption: message,
    });
    console.log(`Sent image+message to ${contact.phone}`);
  } else {
    await client.sendMessage(result.users[0], { message });
    console.log(`Sent message to ${contact.phone}`);
  }
};

const main = async () => {
  const stringSession = new StringSession(sessionString);
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await ask("Phone number: "),
    phoneCode: async () => await ask("Code: "),
    password: async () => await ask("2FA password (if any): "),
    onError: (err) => console.error(err),
  });

  console.log("Logged in.");
  console.log("Session string (store in TELEGRAM_SESSION):");
  console.log(client.session.save());

  const contacts = loadContacts();
  console.log(`Loaded ${contacts.length} contacts from ${contactsCsv}`);

  for (let i = 0; i < contacts.length; i += 1) {
    try {
      await importAndSend(client, contacts[i], i);
    } catch (err) {
      const msg = String(err && err.message ? err.message : err);
      if (msg.includes("FLOOD_WAIT") && err.seconds) {
        console.warn(`Flood wait ${err.seconds}s. Sleeping...`);
        await sleep((err.seconds + 1) * 1000);
      } else {
        console.error(`Failed for ${contacts[i].phone}:`, err);
      }
    }
    await sleep(delayMs);
  }

  await client.disconnect();
  rl.close();
};

main().catch((err) => {
  console.error(err);
  rl.close();
  process.exit(1);
});
