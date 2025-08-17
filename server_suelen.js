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
app.use(bodyParser.json());

// --- Twilio ---
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const MEU_NUMERO = `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`;

// --- OpenAI ---
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

// --- Google Sheets ---
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDS),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });
const SPREADSHEET_ID = process.env.SHEET_ID;

// --- Memória temporária por cliente ---
const memoriaClientes = {};

// Inicializa ou pega estado do cliente
function pegarEstadoCliente(numero) {
  if (!memoriaClientes[numero]) {
    memoriaClientes[numero] = {
      apresentacaoFeita: false,
      areaObjetivo: false,
      portfolio: false,
      dataPrevista: false,
      fechamento: false,
      nome: null,
      genero: null,
    };
  }
  return memoriaClientes[numero];
}

// Detecta gênero com base no nome (simples)
function detectarGenero(nome) {
  if (!nome) return "mulher";
  const feminino = ["a", "ana", "mar", "let", "ayla", "maria", "carla"];
  const masculino = ["tales", "dred", "dr", "will", "joao", "carlos", "pedro"];
  const nomeLower = nome.toLowerCase();
  if (feminino.some(n => nomeLower.includes(n))) return "mulher";
  if (masculino.some(n => nomeLower.includes(n))) return "homem";
  return "mulher";
}

// Gera prompt para o OpenAI de acordo com o estado
function gerarPrompt(estado) {
  if (!estado.apresentacaoFeita) return "Apresente-se como Suelen, assistente do Jonatas, de forma acolhedora e natural 😊";
  if (!estado.areaObjetivo) return "Pergunte sobre a área de atuação e objetivo do cliente com as fotos 🎯";
  if (!estado.portfolio) {
    if (estado.genero === "mulher") {
      return "Mostre os links do portfólio feminino de forma simpática:\n- https://suaessenciafotografia.pixieset.com/letciapache/\n- https://suaessenciafotografia.pixieset.com/marliacatalano/\n- https://suaessenciafotografia.pixieset.com/aylapacheli/";
    } else {
      return "Mostre os links do portfólio masculino de forma simpática:\n- https://suaessenciafotografia.pixieset.com/talesgabbi/\n- https://suaessenciafotografia.pixieset.com/dredsonuramoto/\n- https://suaessenciafotografia.pixieset.com/drwilliamschwarzer/";
    }
  }
  if (!estado.dataPrevista) return "Pergunte de forma simpática qual a expectativa de data para a sessão 📅";
  if (!estado.fechamento) return "Finalize informando que Jonatas enviará um orçamento personalizado aqui pelo WhatsApp ✨";
  return null;
}

// Salva informações na planilha
async function salvarNaPlanilha(nome, telefone, mensagem) {
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Leads!A:D",
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[new Date().toLocaleString(), telefone, nome, mensagem]],
      },
    });
  } catch (err) {
    console.error("Erro ao salvar na planilha:", err);
  }
}

// Rota de teste
app.get("/", (req, res) => {
  res.send("🚀 Suelen está rodando!");
});

// Webhook WhatsApp
app.post("/whatsapp", async (req, res) => {
  const incomingMsg = req.body.Body?.trim();
  const from = req.body.From;
  const nomeCliente = req.body.ProfileName || "";

  if (!incomingMsg) return res.sendStatus(200);

  const estado = pegarEstadoCliente(from);
  if (!estado.nome) estado.nome = nomeCliente || "Cliente";
  if (!estado.genero) estado.genero = detectarGenero(nomeCliente);

  const promptFluxo = gerarPrompt(estado);
  if (!promptFluxo) return res.sendStatus(200); // Fluxo finalizado

  try {
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Você é Suelen, assistente do fotógrafo Jonatas. Seja acolhedora, simpática, humana e direta. Use emojis quando fizer sentido. Siga o fluxo sem repetir etapas já concluídas.`
        },
        { role: "user", content: promptFluxo }
      ],
      temperature: 0.7,
    });

    let reply = aiResponse.choices[0].message.content;

    // Pausa leve para parecer mais humano
    const pausa = Math.floor(Math.random() * 1500) + 1500;
    await new Promise(r => setTimeout(r, pausa));

    // Envia mensagem pelo Twilio
    await client.messages.create({
      from: MEU_NUMERO,
      to: from,
      body: reply,
    });

    // Atualiza estado
    if (!estado.apresentacaoFeita) estado.apresentacaoFeita = true;
    else if (!estado.areaObjetivo) estado.areaObjetivo = true;
    else if (!estado.portfolio) estado.portfolio = true;
    else if (!estado.dataPrevista) estado.dataPrevista = true;
    else if (!estado.fechamento) estado.fechamento = true;

    // Salva mensagem na planilha
    await salvarNaPlanilha(estado.nome, from, incomingMsg);

    res.sendStatus(200);
  } catch (err) {
    console.error("Erro:", err);
    res.sendStatus(500);
  }
});

// Inicia servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor da Suelen rodando na porta ${PORT}`));

















