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

// Configuração Twilio (ajustada)
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Configuração OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

// Configuração Google Sheets
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDS),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Lista de contatos salvos (adicione os números já conhecidos)
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

// Prompt base da Suelen
const SYSTEM_PROMPT = `Você é Suelen, assistente virtual do fotógrafo Jonatas Teixeira (Sua Essência Fotografia). 
Seu papel: receber clientes pelo WhatsApp de forma acolhedora, simpática e natural, com emojis quando fizer sentido para deixar a conversa mais simpática.

Fluxo e regras:
1. **Apresentação**: sempre comece se apresentando como Suelen. Exemplo: "Oi! Eu sou a Suelen, assistente do Jonatas 😊"
2. **Coleta de informações e interação**:
   - Pergunte de forma natural sobre o momento do cliente: 
     - Exemplo: "Me conta um pouco sobre sua área de atuação e seus objetivos profissionais ou pessoais 🎯"
   - Pergunte como ele imagina que fotos profissionais poderiam ajudá-lo nesse momento, de forma acolhedora e envolvente.
3. **Portfólio**:
   - Baseado nas informações do cliente ou gênero, compartilhe exemplos relevantes:
     - Mulheres:
       - https://suaessenciafotografia.pixieset.com/letciapache/
       - https://suaessenciafotografia.pixieset.com/marliacatalano/
       - https://suaessenciafotografia.pixieset.com/aylapacheli/
     - Homens:
       - https://suaessenciafotografia.pixieset.com/talesgabbi/
       - https://suaessenciafotografia.pixieset.com/dredsonuramoto/
       - https://suaessenciafotografia.pixieset.com/drwilliamschwarzer/
4. **Data prevista**: pergunte de forma natural se há alguma data em mente para a sessão 📅
5. **Fechamento**: finalize resumindo o que foi compartilhado e informando que Jonatas enviará um orçamento personalizado ✨
6. **Tonalidade e estilo**:
   - Acolhedora, simpática e próxima
   - Use emojis quando fizer sentido
   - Nunca repita saudações ou elogios desnecessários
   - Fluida, objetiva e natural, sem respostas genéricas como “OK”
   - Persuasiva de forma leve, sem forçar a venda`;


app.get("/", (req, res) => {
  res.send("🚀 Suelen está rodando!");
});

app.post("/whatsapp", async (req, res) => {
  console.log("Servidor recebeu a requisição!");
  const incomingMsg = req.body.Body || "";
  const from = req.body.From || "";
  
  // 🔑 Ajuste: sempre forçar que o número de envio seja no formato whatsapp:
  const twilioNumber = `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`;

  console.log("Mensagem recebida:", incomingMsg);
  console.log("De:", from, "Para:", twilioNumber);

  try {
    if (deveResponder(from, incomingMsg)) {
      // Chamar OpenAI
      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: incomingMsg },
        ],
        temperature: 0.7,
      });

      const reply = aiResponse.choices[0].message.content;

      // Enviar resposta pelo Twilio
      await client.messages.create({
        from: twilioNumber, // agora garante o canal correto
        to: from,           // usuário que mandou msg
        body: reply,
      });

      console.log("Resposta enviada:", reply);
    }

    // Salvar no Google Sheets
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Leads!A:E",
      valueInputOption: "RAW",
      requestBody: {
        values: [[new Date().toLocaleString(), from, incomingMsg, "", ""]],
      },
    });

    res.sendStatus(200);
  } catch (err) {
    console.error("Erro:", err);
    res.sendStatus(500);
  }
});

// Inicia servidor (Render usa PORT)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor da Suelen rodando na porta ${PORT}`);
});











