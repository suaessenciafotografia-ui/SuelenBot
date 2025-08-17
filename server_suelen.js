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

// Configuração Twilio
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const MEU_NUMERO = `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`;

// Configuração OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

// Configuração Google Sheets
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDS),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Respostas curtas irrelevantes
const respostasIgnorar = ["ok", "okay", "👍", "ok!"];

// Função para detectar gênero simples pelo nome
function detectarGenero(nomeCliente) {
  if (!nomeCliente) return "mulher";
  const feminino = ["a", "ana", "mar", "let", "ayla"];
  const masculino = ["tales", "dred", "dr", "will"];
  const nomeLower = nomeCliente.toLowerCase();
  if (feminino.some(n => nomeLower.includes(n))) return "mulher";
  if (masculino.some(n => nomeLower.includes(n))) return "homem";
  return "mulher";
}

// Função para buscar respostas anteriores do cliente na planilha
async function buscarRespostasPlanilha(numero) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Leads!A:E",
    });
    const linhas = res.data.values || [];
    const clienteLinha = linhas.reverse().find(linha => linha[1] === numero); // pega última entrada do cliente
    return {
      apresentacao: clienteLinha ? true : false,
      areaObjetivo: clienteLinha && linha[3] ? linha[3] : null,
      portfólioEnviado: clienteLinha ? true : false,
      dataPrevista: clienteLinha && linha[4] ? linha[4] : null,
      fechamento: false,
    };
  } catch (err) {
    console.error("Erro ao buscar na planilha:", err);
    return { apresentacao: false, areaObjetivo: null, portfólioEnviado: false, dataPrevista: null, fechamento: false };
  }
}

// Função que gera o prompt da Suelen baseado no fluxo
function gerarPrompt(clienteInfo, genero) {
  if (!clienteInfo.apresentacao) return "Apresente-se como Suelen, assistente do Jonatas 😊. Seja direta, acolhedora e simpática. Não repita a apresentação.";
  if (!clienteInfo.areaObjetivo) return "Pergunte de forma direta sobre a área de atuação e objetivo do cliente com as fotos 🎯.";
  if (!clienteInfo.portfólioEnviado) {
    if (genero === "mulher") {
      return "Mostre os links do portfólio feminino de forma direta e simpática:\n- https://suaessenciafotografia.pixieset.com/letciapache/\n- https://suaessenciafotografia.pixieset.com/marliacatalano/\n- https://suaessenciafotografia.pixieset.com/aylapacheli/";
    } else {
      return "Mostre os links do portfólio masculino de forma direta e simpática:\n- https://suaessenciafotografia.pixieset.com/talesgabbi/\n- https://suaessenciafotografia.pixieset.com/dredsonuramoto/\n- https://suaessenciafotografia.pixieset.com/drwilliamschwarzer/";
    }
  }
  if (!clienteInfo.dataPrevista) return "Pergunte de forma direta qual a expectativa de data para a sessão 📅";
  if (!clienteInfo.fechamento) return "Finalize de forma simpática, informando que Jonatas enviará um orçamento personalizado ✨";
  return null;
}

// Rota inicial
app.get("/", (req, res) => {
  res.send("🚀 Suelen está rodando!");
});

// Rota WhatsApp
app.post("/whatsapp", async (req, res) => {
  const incomingMsg = req.body.Body || "";
  const from = req.body.From || "";
  const nomeCliente = req.body.ProfileName || "";

  console.log("Mensagem do cliente:", incomingMsg);

  if (respostasIgnorar.includes(incomingMsg.toLowerCase()) || !incomingMsg.trim()) {
    return res.sendStatus(200);
  }

  try {
    const clienteInfo = await buscarRespostasPlanilha(from);
    const genero = detectarGenero(nomeCliente);
    const promptFluxo = gerarPrompt(clienteInfo, genero);

    if (promptFluxo) {
      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `Você é Suelen, assistente do fotógrafo Jonatas Teixeira. Seja direta, acolhedora, simpática, natural, persuasiva, use emojis quando fizer sentido. Nunca repita "Olá", "Oi", "OK" e nunca repita perguntas já respondidas.`
          },
          { role: "user", content: promptFluxo }
        ],
        temperature: 0.7,
      });

      let reply = aiResponse.choices[0].message.content;

      // Pausa aleatória para parecer humano
      const pausa = Math.floor(Math.random() * 1500) + 1500;
      await new Promise(r => setTimeout(r, pausa));

      await client.messages.create({
        from: MEU_NUMERO,
        to: from,
        body: reply,
      });

      console.log("Resposta da Suelen:", reply);

      // Atualiza planilha para marcar a etapa como concluída
      let area = clienteInfo.areaObjetivo || "";
      let data = clienteInfo.dataPrevista || "";
      if (!clienteInfo.areaObjetivo && promptFluxo.includes("área de atuação")) area = incomingMsg;
      if (!clienteInfo.dataPrevista && promptFluxo.includes("data")) data = incomingMsg;

      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: "Leads!A:E",
        valueInputOption: "RAW",
        requestBody: {
          values: [[new Date().toLocaleString(), from, incomingMsg, area, data]],
        },
      });
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Erro:", err);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor da Suelen rodando na porta ${PORT}`));


















