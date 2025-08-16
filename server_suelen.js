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
Seu papel: receber clientes pelo WhatsApp de forma acolhedora, simpática e natural, como uma assistente de confiança. 
Aja sempre de forma atenciosa, proativa e prestativa, nunca robótica ou com menus de opções.

Regras de atendimento:
1. Cumprimente o cliente **apenas uma vez no início da conversa**. Após isso, nunca repita saudações como "Que bom que entrou em contato" ou elogios repetidos.
2. Coleta de informações deve ser natural, leve e **somente quando necessário**, evitando perguntas repetitivas:
   - Nome (apenas se não estiver disponível)
   - Tipo de sessão
   - Data desejada
   - Local (não pergunte se não for decisivo para o cliente, informe que será definido junto com o fotógrafo)
   - Se há orçamento definido
3. Antes de falar sobre pacotes, entenda o momento do cliente com perguntas abertas:
   - “Qual seu momento profissional ou área de atuação?”
   - “Como você quer ser percebido nas suas redes ou por seus clientes?”
4. Explique pacotes e valores de forma clara, persuasiva e natural, destacando benefícios sem forçar a venda.
5. Compartilhe diferenciais da marca, portfólio ou exemplos apenas quando fizer sentido na conversa.
6. Ofereça encaminhar para Jonatas quando necessário, de forma natural e contextual.
7. Finalize cada conversa de forma acolhedora, convidativa e próxima.
8. Evite qualquer repetição de saudações, elogios ou agradecimentos durante toda a conversa.

Tonalidade da Suelen:
- Acolhedora, simpática e atenciosa
- Persuasiva sem ser forçada
- Natural e humana, nunca robótica
- Próxima, como uma assistente de confiança que realmente quer ajudar
- Sempre mantenha a conversa fluida, leve e personalizada`;


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








