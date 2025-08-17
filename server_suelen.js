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

// Função para consultar etapas salvas na planilha
async function pegarEstadoClientePlanilha(numero) {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "Leads!A:E",
    });
    const linhas = res.data.values || [];
    const linhaCliente = linhas.reverse().find(l => l[1] === numero); // último registro
    if (linhaCliente) {
      return {
        apresentacaoFeita: linhaCliente[4] === "apresentacao",
        areaObjetivoFeita: linhaCliente[4] === "areaObjetivo",
        portfolioFeito: linhaCliente[4] === "portfolio",
        dataPrevistaFeita: linhaCliente[4] === "dataPrevista",
        fechamentoFeito: linhaCliente[4] === "fechamento",
        nome: linhaCliente[2] || numero,
      };
    }
  } catch (err) {
    console.error("Erro ao pegar estado na planilha:", err);
  }
  return {
    apresentacaoFeita: false,
    areaObjetivoFeita: false,
    portfolioFeito: false,
    dataPrevistaFeita: false,
    fechamentoFeito: false,
    nome: numero,
  };
}

// Função para atualizar etapa na planilha
async function atualizarEstadoPlanilha(numero, nome, etapa) {
  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Leads!A:E",
      valueInputOption: "RAW",
      requestBody: {
        values: [[new Date().toLocaleString(), numero, nome, "", etapa]],
      },
    });
  } catch (err) {
    console.error("Erro ao atualizar planilha:", err);
  }
}

// Função para detectar gênero pelo nome
function detectarGenero(nome) {
  if (!nome) return "mulher";
  const feminino = ["a", "ana", "mar", "let", "ayla", "maria", "carla"];
  const masculino = ["tales", "dred", "dr", "will", "joao", "carlos", "pedro", "felipe"];
  const nomeLower = nome.toLowerCase();
  if (feminino.some(n => nomeLower.includes(n))) return "mulher";
  if (masculino.some(n => nomeLower.includes(n))) return "homem";
  return "mulher";
}

// Função para gerar prompt baseado na etapa
function gerarPromptPorEtapa(estado, incomingMsg) {
  if (!estado.apresentacaoFeita) return `Apresente-se como Suelen, assistente do Jonatas 😊, de forma acolhedora e natural. Diga boas-vindas e ofereça ajuda para descobrir o tipo de sessão ideal.`;
  if (!estado.areaObjetivoFeita) return `Pergunte sobre tipo de sessão, objetivo da sessão, preferência de estilo ou locação e se já fez sessões de fotos antes.`;
  if (!estado.portfolioFeito) {
    if (estado.genero === "mulher") {
      return `Mostre os links do portfólio feminino de forma simpática:\n- https://suaessenciafotografia.pixieset.com/letciapache/\n- https://suaessenciafotografia.pixieset.com/marliacatalano/\n- https://suaessenciafotografia.pixieset.com/aylapacheli/`;
    } else {
      return `Mostre os links do portfólio masculino de forma simpática:\n- https://suaessenciafotografia.pixieset.com/talesgabbi/\n- https://suaessenciafotografia.pixieset.com/dredsonuramoto/\n- https://suaessenciafotografia.pixieset.com/drwilliamschwarzer/`;
    }
  }
  if (!estado.dataPrevistaFeita) return `Pergunte de forma simpática qual a expectativa de data para a sessão 📅 e informe sobre opções de locações como Artflex, Atmo Design, Dome Design, estúdio fixo ou móvel.`;
  if (!estado.fechamentoFeito) return `Finalize explicando que Jonatas enviará um orçamento personalizado com base nas respostas do cliente e informe sobre a Consulta de Essência Visual como bônus.`;
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
  const nomeCliente = req.body.ProfileName || "";

  if (!incomingMsg.trim()) return res.sendStatus(200);

  // Consultar estado na planilha
  let estado = await pegarEstadoClientePlanilha(from);
  if (!estado.genero) estado.genero = detectarGenero(nomeCliente);
  if (!estado.nome) estado.nome = nomeCliente || from;

  const prompt = gerarPromptPorEtapa(estado, incomingMsg);
  if (!prompt) return res.sendStatus(200);

  try {
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Você é Suelen, assistente do fotógrafo Jonatas Teixeira. Seja acolhedora, simpática, humana e direta. Use emojis quando fizer sentido. Siga o fluxo: apresentação → qualificação → portfólio → data → fechamento. Não repita etapas já concluídas.`
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
    });

    let reply = aiResponse.choices[0].message.content;

    // Pausa para parecer humano
    const pausa = Math.floor(Math.random() * 1500) + 1500;
    await new Promise(r => setTimeout(r, pausa));

    await client.messages.create({
      from: MEU_NUMERO,
      to: from,
      body: reply,
    });

    // Atualiza etapa concluída e grava na planilha
    if (!estado.apresentacaoFeita) {
      estado.apresentacaoFeita = true;
      await atualizarEstadoPlanilha(from, estado.nome, "apresentacao");
    } else if (!estado.areaObjetivoFeita) {
      estado.areaObjetivoFeita = true;
      await atualizarEstadoPlanilha(from, estado.nome, "areaObjetivo");
    } else if (!estado.portfolioFeito) {
      estado.portfolioFeito = true;
      await atualizarEstadoPlanilha(from, estado.nome, "portfolio");
    } else if (!estado.dataPrevistaFeita) {
      estado.dataPrevistaFeita = true;
      await atualizarEstadoPlanilha(from, estado.nome, "dataPrevista");
    } else if (!estado.fechamentoFeito) {
      estado.fechamentoFeito = true;
      await atualizarEstadoPlanilha(from, estado.nome, "fechamento");
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Erro:", err);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor da Suelen rodando na porta ${PORT}`));



















