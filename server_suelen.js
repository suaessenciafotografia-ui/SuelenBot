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

// Prompt simplificado da Suelen
const SYSTEM_PROMPT = `
Você é Suelen, assistente virtual do fotógrafo Jonatas Teixeira (Sua Essência Fotografia).
Seu papel é receber clientes pelo WhatsApp de forma acolhedora, simpática e natural.

Fluxo:
1. Apresente-se **uma única vez** no início: "Oi! Eu sou a Suelen, assistente do Jonatas 😊"
2. Pergunte sobre a área de atuação e objetivo do cliente com as fotos: "Me conta um pouco sobre sua área de atuação e seu objetivo com as fotos 🎯"
3. Mostre o portfólio correto baseado no gênero do cliente:
   - Mulheres:
     - https://suaessenciafotografia.pixieset.com/letciapache/
     - https://suaessenciafotografia.pixieset.com/marliacatalano/
     - https://suaessenciafotografia.pixieset.com/aylapacheli/
   - Homens:
     - https://suaessenciafotografia.pixieset.com/talesgabbi/
     - https://suaessenciafotografia.pixieset.com/dredsonuramoto/
     - https://suaessenciafotografia.pixieset.com/drwilliamschwarzer/
4. Pergunte de forma simpática se há alguma data prevista para a sessão 📅
5. Finalize informando que Jonatas enviará um orçamento personalizado ✨

Regras:
- Nunca repita saudações ou respostas genéricas como "OK".
- Use emojis quando fizer sentido.
- Seja humana, simpática e direta.
- Siga o fluxo de cima para baixo, apenas uma pergunta por vez.
`;

// Rota teste
app.get("/", (req, res) => {
  res.send("🚀 Suelen está rodando!");
});

// Rota WhatsApp
app.post("/whatsapp", async (req, res) => {
  const incomingMsg = req.body.Body || "";
  const from = req.body.From || "";
  const nomeCliente = req.body.ProfileName || "";

  console.log("Mensagem do cliente:", incomingMsg);

  if (!incomingMsg.trim()) return res.sendStatus(200);

  try {
    const genero = detectarGenero(nomeCliente);

    // Monta prompt para OpenAI
    const prompt = `${SYSTEM_PROMPT}\nCliente (${nomeCliente}): ${incomingMsg}\nResponda como Suelen seguindo o fluxo.`;

    // Chamada OpenAI
    const aiResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: prompt }],
      temperature: 0.7,
    });

    let reply = aiResponse.choices[0].message.content;

    // Pausa para parecer humano
    const pausa = Math.floor(Math.random() * 1500) + 1500;
    await new Promise(r => setTimeout(r, pausa));

    // Envia resposta pelo Twilio
    await client.messages.create({
      from: MEU_NUMERO,
      to: from,
      body: reply,
    });

    console.log("Resposta enviada pela Suelen:", reply);
    res.sendStatus(200);

  } catch (err) {
    console.error("Erro:", err);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor da Suelen rodando na porta ${PORT}`));




















