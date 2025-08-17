// Instalar pacotes:
// npm install express body-parser openai dotenv twilio googleapis

import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import OpenAI from "openai";
import twilio from "twilio";
import { google } from "googleapis";

dotenv.config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Twilio
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const MEU_NUMERO = `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`;

// OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

// Google Sheets
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDS),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Memória temporária por cliente
const memoriaClientes = {};

// Inicializa ou pega estado do cliente
function pegarEstadoCliente(numero) {
  if (!memoriaClientes[numero]) {
    memoriaClientes[numero] = {
      apresentacao: false,
      qualificacao: false,
      servicos: false,
      coletaInfo: false,
      fechamento: false,
      nome: null
    };
  }
  return memoriaClientes[numero];
}

// Detecta nome automático do cliente se ele escrever algo como "sou o João" ou "meu nome é Maria"
function detectarNome(mensagem, nomeWhatsApp) {
  const regex = /(?:sou o|sou a|meu nome é|me chamo)\s+([A-Za-zÀ-ú]+)/i;
  const match = mensagem.match(regex);
  if (match) return match[1];
  if (nomeWhatsApp) return nomeWhatsApp;
  return null;
}

// Prompt base do GPT
function gerarPrompt(estado, nomeCliente) {
  if (!estado.apresentacao) 
    return `Apresente-se como Suelen, assistente da Sua Essência Fotografia, acolhedora e simpática, usando emojis. Nome do cliente: ${nomeCliente || "Cliente"}.\nMensagem curta e interativa para WhatsApp.`;
  if (!estado.qualificacao)
    return "Pergunte de forma estratégica sobre o cliente: tipo de sessão, objetivo da sessão, estilo ou locação, se já fez sessões antes. Seja curto e acolhedor.";
  if (!estado.servicos)
    return "Explique os serviços e diferenciais da Sua Essência Fotografia de forma curta, incluindo a Consulta de Essência Visual como bônus.";
  if (!estado.coletaInfo)
    return "Pergunte informações para orçamento: quantidade de pessoas, local, duração, preferência por pacote ou orçamento personalizado. Mensagem curta e interativa.";
  if (!estado.fechamento)
    return "Finalize informando que o orçamento será enviado em breve e que a Consulta de Essência Visual será agendada como bônus. Seja acolhedora e curta.";
  return null;
}

// Rota teste
app.get("/", (req, res) => {
  res.send("🚀 Suelen está rodando!");
});

// Rota WhatsApp
app.post("/whatsapp", async (req, res) => {
  const incomingMsg = req.body.Body || "";
  const from = req.body.From || "";
  const nomeWhatsApp = req.body.ProfileName || "";

  if (!incomingMsg.trim()) return res.sendStatus(200);

  const estado = pegarEstadoCliente(from);
  if (!estado.nome) estado.nome = detectarNome(incomingMsg, nomeWhatsApp) || "Cliente";

  const promptFluxo = gerarPrompt(estado, estado.nome);
  if (!promptFluxo) return res.sendStatus(200); // fluxo finalizado

  try {
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Você é Suelen, assistente virtual da Sua Essência Fotografia de Jonatas Teixeira. Seja acolhedora, simpática, humana e curta. Use emojis quando fizer sentido. Evite textos longos, respostas genéricas ou repetir saudações. Siga o fluxo: apresentação → qualificação → serviços → coleta de info → fechamento.`
        },
        { role: "user", content: promptFluxo }
      ],
      temperature: 0.6,
    });

    let reply = aiResponse.choices[0].message.content;

    // Quebra em mensagens curtas por linha ou parágrafo
    const linhas = reply.split("\n").filter(l => l.trim() !== "");

    for (const linha of linhas) {
      await client.messages.create({
        from: MEU_NUMERO,
        to: from,
        body: linha,
      });
      // Pausa curta entre mensagens (1-2s)
      await new Promise(r => setTimeout(r, 1000 + Math.random() * 1000));
    }

    // Atualiza etapas concluídas
    if (!estado.apresentacao) estado.apresentacao = true;
    else if (!estado.qualificacao) estado.qualificacao = true;
    else if (!estado.servicos) estado.servicos = true;
    else if (!estado.coletaInfo) estado.coletaInfo = true;
    else if (!estado.fechamento) estado.fechamento = true;

    // Salvar na planilha: data, número, nome, mensagem recebida
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Leads!A:D",
      valueInputOption: "RAW",
      requestBody: {
        values: [[new Date().toLocaleString(), from, estado.nome, incomingMsg]],
      },
    });

    res.sendStatus(200);

  } catch (err) {
    console.error("Erro:", err);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor da Suelen rodando na porta ${PORT}`));



















