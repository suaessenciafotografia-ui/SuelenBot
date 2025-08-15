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
const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH);

// Configuração OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

// Configuração Google Sheets
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDS),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});
const sheets = google.sheets({ version: "v4", auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Prompt base da Suelen
const SYSTEM_PROMPT = `
Você é Suelen, assistente virtual do fotógrafo Jonatas Teixeira.
Seu papel: receber clientes pelo WhatsApp de forma acolhedora e natural,
coletar informações (nome, tipo de sessão, data, local, orçamento)
e oferecer portfólio, guia de preparação e depoimentos.
Sempre fale como assistente atenciosa, simpática e proativa.
Quando necessário, ofereça encaminhar o cliente para falar diretamente com Jonatas.
Não use linguagem robótica nem menus com números.
`;

app.post("/whatsapp", async (req, res) => {
  const incomingMsg = req.body.Body;
  const from = req.body.From;
  const to = req.body.To;

  try {
    // Chamar OpenAI
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: incomingMsg }
      ],
      temperature: 0.7
    });

    const reply = aiResponse.choices[0].message.content;

    // Enviar resposta pelo Twilio
    await client.messages.create({
      from: to,
      to: from,
      body: reply
    });

    // Salvar no Google Sheets (opcional: só se detectar nome/tipo/data/local/orçamento)
    // Aqui você pode melhorar a lógica para extrair dados do texto
    // Exemplo básico: adicionar mensagem recebida
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Leads!A:E",
      valueInputOption: "RAW",
      requestBody: {
        values: [[new Date().toLocaleString(), from, incomingMsg, "", ""]]
      }
    });

    res.sendStatus(200);
  } catch (err) {
    console.error("Erro:", err);
    res.sendStatus(500);
  }
});

app.listen(3000, () => {
  console.log("Servidor da Suelen rodando na porta 3000");
});
