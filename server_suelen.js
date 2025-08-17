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

// Palavras-chave e respostas irrelevantes
const palavrasChave = ["preço", "valor", "quanto", "custa", "orçamento", "pacote", "planos"];
const respostasIgnorar = ["ok", "okay", "👍", "ok!"];

// Detecta gênero pelo nome (simples)
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
      areaObjetivo: clienteLinha ? linha[3] : null,
      dataPrevista: clienteLinha ? linha[4] : null,
    };
  } catch (err) {
    console.error("Erro ao buscar na planilha:", err);
    return { areaObjetivo: null, dataPrevista: null };
  }
}

// Função para decidir se Suelen deve responder
function deveResponder(mensagem) {
  if (!mensagem) return false;
  const temPalavraChave = palavrasChave.some(p => mensagem.toLowerCase().includes(p));
  return !respostasIgnorar.includes(mensagem.toLowerCase()) || temPalavraChave;
}

// Função que gera o prompt da Suelen baseado no fluxo
function gerarPrompt(clienteInfo, genero, passoAtual) {
  let prompt = "";
  switch (passoAtual) {
    case "apresentacao":
      prompt = "Apresente-se como Suelen, assistente do Jonatas 😊. Seja direta, acolhedora e simpática. Não repita a apresentação.";
      break;
    case "area":
      prompt = "Pergunte de forma direta sobre a área de atuação e objetivo do cliente com as fotos 🎯. Aguarde resposta.";
      break;
    case "portfólio":
      if (genero === "mulher") {
        prompt = "Mostre os links do portfólio feminino, de forma direta e simpática:\n- https://suaessenciafotografia.pixieset.com/letciapache/\n- https://suaessenciafotografia.pixieset.com/marliacatalano/\n- https://suaessenciafotografia.pixieset.com/aylapacheli/";
      } else {
        prompt = "Mostre os links do portfólio masculino, de forma direta e simpática:\n- https://suaessenciafotografia.pixieset.com/talesgabbi/\n- https://suaessenciafotografia.pixieset.com/dredsonuramoto/\n- https://suaessenciafotografia.pixieset.com/drwilliamschwarzer/";
      }
      break;
    case "data":
      prompt = "Pergunte de forma direta qual a expectativa de data para a sessão 📅";
      break;
    case "fechamento":
      prompt = "Finalize de forma simpática, informando que Jonatas enviará um orçamento personalizado ✨";
      break;
    default:
      prompt = "";
  }
  return prompt;
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

  if (!deveResponder(incomingMsg)) {
    return res.sendStatus(200); // ignora mensagens irrelevantes
  }

  try {
    // Buscar informações já existentes na planilha
    const respostasPlanilha = await buscarRespostasPlanilha(from);
    const genero = detectarGenero(nomeCliente);

    // Definir próximo passo do fluxo
    let passoAtual = "";
    if (!respostasPlanilha.areaObjetivo) passoAtual = "apresentacao";
    else if (!respostasPlanilha.areaObjetivo) passoAtual = "area";
    else if (!respostasPlanilha.portfólioEnviado) passoAtual = "portfólio";
    else if (!respostasPlanilha.dataPrevista) passoAtual = "data";
    else passoAtual = "fechamento";

    const promptFluxo = gerarPrompt(respostasPlanilha, genero, passoAtual);

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
    }

    // Salvar na planilha
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Leads!A:E",
      valueInputOption: "RAW",
      requestBody: {
        values: [[new Date().toLocaleString(), from, incomingMsg, respostasPlanilha.areaObjetivo || "", respostasPlanilha.dataPrevista || ""]],
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

















