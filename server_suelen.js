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

// Lista de contatos salvos
const contatosSalvos = ["5511999999999", "5511888888888"];

// Palavras-chave para orçamento/valores
const palavrasChave = [
  "preço",
  "valor",
  "quanto",
  "custa",
  "orçamento",
  "pacote",
  "planos",
];

// Função para decidir se Suelen deve responder
function deveResponder(numero, mensagem) {
  const contatoSalvo = contatosSalvos.includes(numero.replace("whatsapp:", ""));
  const temPalavraChave = palavrasChave.some((p) =>
    mensagem.toLowerCase().includes(p)
  );
  return !contatoSalvo || temPalavraChave;
}

// Controle de fluxo por cliente
const clientes = {};

// Função para detectar gênero com base no nome (simples)
function detectarGenero(nomeCliente) {
  if (!nomeCliente) return "mulher"; // padrão
  const feminino = ["a", "ana", "mar", "let", "ayla"]; // nomes femininos comuns
  const masculino = ["tales", "dred", "dr", "will"]; // nomes masculinos comuns

  const nomeLower = nomeCliente.toLowerCase();
  if (feminino.some(n => nomeLower.includes(n))) return "mulher";
  if (masculino.some(n => nomeLower.includes(n))) return "homem";
  return "mulher"; // padrão
}

// Função que decide o próximo passo da Suelen
function gerarPromptFluxo(clienteId, mensagemCliente, nomeCliente = "") {
  if (!clientes[clienteId]) {
    clientes[clienteId] = {
      apresentacao: false,
      perguntaArea: false,
      perguntaFotos: false,
      portfólioEnviado: false,
      dataPerguntada: false,
      fechamento: false
    };
  }

  const estado = clientes[clienteId];
  let prompt = "";

  if (!estado.apresentacao) {
    prompt = "Apresente-se como Suelen, assistente do Jonatas 😊. Seja acolhedora e simpática. Não repita.";
    estado.apresentacao = true;
  } else if (!estado.perguntaArea) {
    prompt = "Pergunte de forma natural sobre a área de atuação e objetivos do cliente 🎯";
    estado.perguntaArea = true;
  } else if (!estado.perguntaFotos) {
    prompt = "Pergunte como fotos profissionais podem ajudar no momento atual do cliente, de forma acolhedora";
    estado.perguntaFotos = true;
  } else if (!estado.portfólioEnviado) {
    const genero = detectarGenero(nomeCliente);
    if (genero === "mulher") {
      prompt = "Envie links do portfólio feminino apenas uma vez, de forma simpática:\n- https://suaessenciafotografia.pixieset.com/letciapache/\n- https://suaessenciafotografia.pixieset.com/marliacatalano/\n- https://suaessenciafotografia.pixieset.com/aylapacheli/";
    } else {
      prompt = "Envie links do portfólio masculino apenas uma vez, de forma simpática:\n- https://suaessenciafotografia.pixieset.com/talesgabbi/\n- https://suaessenciafotografia.pixieset.com/dredsonuramoto/\n- https://suaessenciafotografia.pixieset.com/drwilliamschwarzer/";
    }
    estado.portfólioEnviado = true;
  } else if (!estado.dataPerguntada) {
    prompt = "Pergunte se o cliente tem alguma data prevista para a sessão 📅";
    estado.dataPerguntada = true;
  } else if (!estado.fechamento) {
    prompt = "Finalize de forma simpática, informando que Jonatas enviará um orçamento personalizado ✨";
    estado.fechamento = true;
  }

  return prompt;
}

app.get("/", (req, res) => {
  res.send("🚀 Suelen está rodando!");
});

app.post("/whatsapp", async (req, res) => {
  console.log("Servidor recebeu a requisição!");
  const incomingMsg = req.body.Body || "";
  const from = req.body.From || "";
  const nomeCliente = req.body.ProfileName || "";

  console.log("Mensagem recebida:", incomingMsg);
  console.log("De:", from, "Nome do cliente:", nomeCliente);

  try {
    if (deveResponder(from, incomingMsg)) {
      const promptFluxo = gerarPromptFluxo(from, incomingMsg, nomeCliente);

      if (promptFluxo) {
        // Chamar OpenAI
        const aiResponse = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `Você é Suelen, assistente do fotógrafo Jonatas Teixeira, acolhedora, simpática, natural, persuasiva, com emojis.`
            },
            { role: "user", content: promptFluxo }
          ],
          temperature: 0.7,
        });

        const reply = aiResponse.choices[0].message.content;

        // Simular pausa antes de enviar
        await new Promise(r => setTimeout(r, 1500));

        // Enviar resposta via Twilio
        await client.messages.create({
          from: MEU_NUMERO,
          to: from,
          body: reply,
        });

        console.log("Resposta da Suelen:", reply);
      }
    }

    // Salvar no Google Sheets
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Leads!A:E",
      valueInputOption: "RAW",
      requestBody: {
        values: [[new Date().toLocaleString(), from, incomingMsg, nomeCliente, ""]],
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














