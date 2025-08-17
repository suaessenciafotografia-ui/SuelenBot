// Instalar pacotes:
// npm install express body-parser openai dotenv twilio

import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import OpenAI from "openai";
import twilio from "twilio";

dotenv.config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Twilio
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const MEU_NUMERO = `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`;

// OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

// Memória temporária por cliente
const memoriaClientes = {};

// Função para pegar ou inicializar estado do cliente
function pegarEstadoCliente(numero) {
  if (!memoriaClientes[numero]) {
    memoriaClientes[numero] = {
      apresentacao: false,
      areaObjetivo: false,
      portfolio: false,
      dataPrevista: false,
      fechamento: false,
      genero: null
    };
  }
  return memoriaClientes[numero];
}

// Função simples para detectar gênero pelo nome
function detectarGenero(nome) {
  if (!nome) return "mulher";
  const feminino = ["a", "ana", "mar", "let", "ayla"];
  const masculino = ["tales", "dred", "dr", "will"];
  const nomeLower = nome.toLowerCase();
  if (feminino.some(n => nomeLower.includes(n))) return "mulher";
  if (masculino.some(n => nomeLower.includes(n))) return "homem";
  return "mulher";
}

// Prompt base da Suelen
function gerarPrompt(estado) {
  if (!estado.apresentacao) return "Apresente-se como Suelen, assistente do Jonatas 😊 de forma acolhedora.";
  if (!estado.areaObjetivo) return "Pergunte de forma direta sobre a área de atuação e objetivo do cliente com as fotos 🎯";
  if (!estado.portfolio) {
    if (estado.genero === "mulher") {
      return "Mostre os links do portfólio feminino de forma simpática:\n- https://suaessenciafotografia.pixieset.com/letciapache/\n- https://suaessenciafotografia.pixieset.com/marliacatalano/\n- https://suaessenciafotografia.pixieset.com/aylapacheli/";
    } else {
      return "Mostre os links do portfólio masculino de forma simpática:\n- https://suaessenciafotografia.pixieset.com/talesgabbi/\n- https://suaessenciafotografia.pixieset.com/dredsonuramoto/\n- https://suaessenciafotografia.pixieset.com/drwilliamschwarzer/";
    }
  }
  if (!estado.dataPrevista) return "Pergunte de forma simpática qual a expectativa de data para a sessão 📅";
  if (!estado.fechamento) return "Finalize informando que Jonatas enviará um orçamento personalizado ✨";
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

  const estado = pegarEstadoCliente(from);
  if (!estado.genero) estado.genero = detectarGenero(nomeCliente);

  const promptFluxo = gerarPrompt(estado);
  if (!promptFluxo) return res.sendStatus(200); // Já finalizou

  try {
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Você é Suelen, assistente do fotógrafo Jonatas Teixeira. Seja acolhedora, simpática, humana, use emojis quando fizer sentido. Nunca repita "Olá" ou "OK". Siga o fluxo do cliente: apresentação → área/objetivo → portfólio → data → fechamento.`
        },
        { role: "user", content: promptFluxo }
      ],
      temperature: 0.7,
    });

    let reply = aiResponse.choices[0].message.content;

    // Pausa humana aleatória
    const pausa = Math.floor(Math.random() * 1500) + 1500;
    await new Promise(r => setTimeout(r, pausa));

    await client.messages.create({
      from: MEU_NUMERO,
      to: from,
      body: reply,
    });

    // Marca etapa como concluída
    if (!estado.apresentacao) estado.apresentacao = true;
    else if (!estado.areaObjetivo) estado.areaObjetivo = true;
    else if (!estado.portfolio) estado.portfolio = true;
    else if (!estado.dataPrevista) estado.dataPrevista = true;
    else if (!estado.fechamento) estado.fechamento = true;

    res.sendStatus(200);

  } catch (err) {
    console.error("Erro:", err);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor da Suelen rodando na porta ${PORT}`));

















