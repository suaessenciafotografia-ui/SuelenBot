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
  "preço", "valor", "quanto", "custa", "orçamento", "pacote", "planos",
];

// Função para decidir se Suelen deve responder
function deveResponder(numero, mensagem) {
  const contatoSalvo = contatosSalvos.includes(numero.replace("whatsapp:", ""));
  const temPalavraChave = palavrasChave.some((p) =>
    mensagem.toLowerCase().includes(p)
  );
  return !contatoSalvo || temPalavraChave;
}

// Memória do cliente
const clientes = {};

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

// Função que gera o prompt da Suelen baseado no fluxo
function gerarPromptFluxo(clienteId, mensagemCliente, nomeCliente = "") {
  if (!clientes[clienteId]) {
    clientes[clienteId] = {
      apresentacao: false,
      perguntaArea: false,
      portfólioEnviado: false,
      dataPerguntada: false,
      fechamento: false,
      areaRespondida: false,
    };
  }

  const estado = clientes[clienteId];
  let prompt = "";

  if (!estado.apresentacao) {
    prompt = "Apresente-se como Suelen, assistente do Jonatas 😊. Seja direta, acolhedora e simpática. Não repita a apresentação.";
    estado.apresentacao = true;
  } else if (!estado.perguntaArea && !estado.areaRespondida) {
    prompt = "Pergunte de forma direta sobre a área de atuação e o objetivo do cliente com as fotos 🎯. Aguarde a resposta.";
    estado.perguntaArea = true;
  } else if (!estado.portfólioEnviado) {
    const genero = detectarGenero(nomeCliente);
    if (genero === "mulher") {
      prompt = "Mostre os links do portfólio feminino, de forma direta e simpática:\n- https://suaessenciafotografia.pixieset.com/letciapache/\n- https://suaessenciafotografia.pixieset.com/marliacatalano/\n- https://suaessenciafotografia.pixieset.com/aylapacheli/";
    } else {
      prompt = "Mostre os links do portfólio masculino, de forma direta e simpática:\n- https://suaessenciafotografia.pixieset.com/talesgabbi/\n- https://suaessenciafotografia.pixieset.com/dredsonuramoto/\n- https://suaessenciafotografia.pixieset.com/drwilliamschwarzer/";
    }
    estado.portfólioEnviado = true;
  } else if (!estado.dataPerguntada) {
    prompt = "Pergunte diretamente qual a expectativa de data para a sessão 📅";
    estado.dataPerguntada = true;
  } else if (!estado.fechamento) {
    prompt = "Finalize de forma simpática, informando que Jonatas enviará um orçamento personalizado ✨";
    estado.fechamento = true;
  }

  return prompt;
}

// Rota inicial
app.get("/", (req, res) => {
  res.send("🚀 Suelen está rodando!");
});

// Rota de mensagens WhatsApp
app.post("/whatsapp", async (req, res) => {
  console.log("Mensagem recebida do cliente:", req.body.Body);
  const incomingMsg = req.body.Body || "";
  const from = req.body.From || "";
  const nomeCliente = req.body.ProfileName || "";

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
              content: `Você é Suelen, assistente do fotógrafo Jonatas Teixeira. Seja direta, acolhedora, simpática, natural, persuasiva, use emojis quando fizer sentido. Nunca repita "Olá", "Oi" ou "OK" e nunca repita perguntas já respondidas.`
            },
            { role: "user", content: promptFluxo }
          ],
          temperature: 0.7,
        });

        let reply = aiResponse.choices[0].message.content;

        // Pausa aleatória para parecer humano (1,5 a 3s)
        const pausa = Math.floor(Math.random() * 1500) + 1500;
        await new Promise(r => setTimeout(r, pausa));

        // Enviar resposta
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
















