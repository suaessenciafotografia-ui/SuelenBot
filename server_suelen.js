// Instalar pacotes:
// npm install express body-parser openai googleapis dotenv twilio

import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import OpenAI from "openai";
import { google } from "googleapis";
import twilio from "twilio";

dotenv.config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// --- Configuração do Twilio ---
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// --- Configuração do Google Sheets ---
const auth = new google.auth.GoogleAuth({
  credentials: {
    type: "service_account",
    project_id: process.env.GOOGLE_PROJECT_ID,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
  },
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });

// --- OpenAI ---
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// --- Função para salvar no Google Sheets ---
async function salvarNoSheets(nome, telefone, interesse, status) {
  const spreadsheetId = process.env.SHEET_ID;

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "Respostas!A:D", // Nome da aba + colunas
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[nome, telefone, interesse, status]],
      },
    });
    console.log("✅ Dados salvos na planilha!");
  } catch (error) {
    console.error("❌ Erro ao salvar na planilha:", error);
  }
}

// --- Fluxo do Bot ---
async function processarMensagem(msg, from) {
  let resposta = "";

  // Captura telefone automaticamente (sem precisar perguntar)
  const telefone = from.replace("whatsapp:", "");

  // Primeira interação
  if (/olá|oi|bom dia|boa tarde|boa noite/i.test(msg)) {
    resposta = "Muito prazer, sou Suelen, assistente do Jonatas 📸. Me conta, qual é a sua área de atuação e o que espera transmitir com suas fotos?";
    return resposta;
  }

  // Se cliente pede orçamento diretamente
  if (/orçamento|preço|valor/i.test(msg)) {
    await salvarNoSheets("", telefone, "Solicitou orçamento", "Aguardando envio");
    resposta = "Claro! Para preparar seu orçamento, me diz: qual a sua área de atuação e qual objetivo você deseja alcançar com as fotos?";
    return resposta;
  }

  // Se cliente informa profissão/área
  if (/médico|advogado|psicólogo|coach|consultor|empresário|dentista/i.test(msg)) {
    await salvarNoSheets("", telefone, msg, "Interesse registrado");
    resposta = `Entendi, você é ${msg}. 📌 Vou preparar um portfólio personalizado para seu perfil e já te envio algumas opções. Pode me dizer se já tem uma expectativa de data para a sessão?`;
    return resposta;
  }

  // Se cliente menciona datas
  if (/amanhã|semana|mês|data|quando/i.test(msg)) {
    resposta = "Perfeito, já anotei sua disponibilidade 🗓️. Em instantes envio o orçamento detalhado.";
    return resposta;
  }

  // Caso genérico
  resposta = "Entendi. Pode me contar um pouco mais sobre seu objetivo com as fotos? Assim preparo algo bem alinhado ao que você precisa.";
  return resposta;
}

// --- Webhook Twilio ---
app.post("/webhook", async (req, res) => {
  const msg = req.body.Body;
  const from = req.body.From;

  console.log("📩 Mensagem recebida:", msg, "de", from);

  const resposta = await processarMensagem(msg, from);

  await client.messages.create({
    body: resposta,
    from: "whatsapp:" + process.env.TWILIO_NUMBER,
    to: from,
  });

  res.send("ok");
});

// --- Start server ---
app.listen(3000, () => {
  console.log("🚀 Servidor rodando na porta 3000");
});



















