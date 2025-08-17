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
      etapa: 0, // 0: boas-vindas, 1: qualificação, 2: serviços, 3: orçamento, 4: agendamento, 5: encerramento
      nome: null,
      genero: null,
      respostas: {}
    };
  }
  return memoriaClientes[numero];
}

// Detecta gênero pelo contexto da mensagem
function detectarGenero(mensagem) {
  if (!mensagem) return null;
  const msgLower = mensagem.toLowerCase();
  if (msgLower.includes("sou médico") || msgLower.includes("dr ")) return "homem";
  if (msgLower.includes("sou médica") || msgLower.includes("dra ")) return "mulher";
  return null;
}

// Gera prompt para OpenAI baseado na etapa do cliente
function gerarPrompt(estado) {
  switch (estado.etapa) {
    case 0:
      return "Boas-vindas: Olá! 😊 Sou a assistente virtual da Sua Essência Fotografia. Posso te ajudar a descobrir qual tipo de sessão é ideal para você?";
    case 1:
      return `Qualificação: Pergunte de forma acolhedora e estratégica sobre:
- Tipo de sessão (Pessoal, corporativa ou produtos)
- Objetivo da sessão (Ex.: Instagram, LinkedIn, marketing pessoal)
- Preferência de estilo ou locação
- Já fez sessões de fotos antes?
Aguarde a resposta do cliente antes de continuar.`;
    case 2:
      return `Apresentação de serviços e diferenciais: Explique que temos retratos corporativos, fotografia de produtos, cobertura de eventos e vídeos institucionais. Destaque a captura da essência, sofisticação e atendimento personalizado. Informe sobre a Consulta de Essência Visual como bônus, incluindo orientação de looks, poses e mensagem.`;
    case 3:
      return `Coleta de informações para orçamento: Pergunte:
- Quantas pessoas participarão da sessão?
- Local e duração desejada
- Preferência por pacote padrão ou orçamento personalizado
Após isso, informe: "Perfeito! Vou preparar um orçamento personalizado para você."`;
    case 4:
      return `Agendamento da Consulta de Essência Visual: Explique que é um bônus para alinhar looks, poses e mensagem para garantir que a sessão reflita a essência do cliente.`;
    case 5:
      return `Encerramento: Confirme que o orçamento será enviado e a Consulta de Essência Visual agendada. Reforce entusiasmo e acolhimento: "Você vai adorar o resultado! ✨"`;
    default:
      return null;
  }
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

  const estado = pegarEstadoCliente(from);

  // Captura nome automaticamente se não tiver
  if (!estado.nome) {
    if (nomeCliente) estado.nome = nomeCliente;
    else {
      const matchNome = incomingMsg.match(/meu nome é (\w+)/i) || incomingMsg.match(/sou o (\w+)/i) || incomingMsg.match(/sou a (\w+)/i);
      if (matchNome) estado.nome = matchNome[1];
      else estado.nome = "Cliente";
    }
  }

  // Detecta gênero pelo contexto
  if (!estado.genero) estado.genero = detectarGenero(incomingMsg);

  const promptFluxo = gerarPrompt(estado);
  if (!promptFluxo) return res.sendStatus(200);

  try {
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Você é a Suelen, assistente virtual da Sua Essência Fotografia. Seja acolhedora, sofisticada, estratégica e empática. Use emojis quando fizer sentido. Siga o fluxo: boas-vindas → qualificação → serviços → orçamento → agendamento → encerramento. Nunca repita etapas já concluídas. Não informe valores, apenas indique que o orçamento será personalizado.`
        },
        { role: "user", content: promptFluxo }
      ],
      temperature: 0.7,
    });

    let reply = aiResponse.choices[0].message.content;

    // Pausa humana aleatória para respostas mais naturais
    const pausa = Math.floor(Math.random() * 1500) + 1500;
    await new Promise(r => setTimeout(r, pausa));

    await client.messages.create({
      from: MEU_NUMERO,
      to: from,
      body: reply,
    });

    // Avança para a próxima etapa
    if (estado.etapa < 5) estado.etapa += 1;

    // Salvar na planilha: data, número, nome, mensagem recebida
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Leads!A:E",
      valueInputOption: "RAW",
      requestBody: {
        values: [[new Date().toLocaleString(), from, estado.nome, incomingMsg, reply]],
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





















