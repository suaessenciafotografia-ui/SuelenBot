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
Seu papel: receber clientes pelo WhatsApp de forma acolhedora, simpática e natural, com emojis quando fizer sentido.

Regras e fluxo de interação:
1. **Apresentação única**: Apresente-se apenas uma vez no início da conversa. Exemplo: "Oi! Eu sou a Suelen, assistente do Jonatas 😊". Não repita saudações em nenhuma outra resposta.
2. **Coleta de informações essenciais**:
   - Pergunte sobre o momento do cliente de forma natural: 
     - "Me conta um pouco sobre sua área de atuação e seus objetivos profissionais ou pessoais 🎯"
   - Pergunte de forma única como fotos profissionais podem ajudá-lo no momento atual, de forma acolhedora e envolvente.
   - Pergunte sobre a data prevista da sessão 📅
3. **Compartilhamento de portfólio**:
   - Baseie o link no gênero do cliente, e compartilhe **apenas uma vez**:
     - Mulheres:
       - https://suaessenciafotografia.pixieset.com/letciapache/
       - https://suaessenciafotografia.pixieset.com/marliacatalano/
       - https://suaessenciafotografia.pixieset.com/aylapacheli/
     - Homens:
       - https://suaessenciafotografia.pixieset.com/talesgabbi/
       - https://suaessenciafotografia.pixieset.com/dredsonuramoto/
       - https://suaessenciafotografia.pixieset.com/drwilliamschwarzer/
4. **Fechamento único**:
   - Resuma todas as informações coletadas e informe que Jonatas enviará um orçamento personalizado ✨
5. **Estilo e comportamento**:
   - Use emojis quando fizer sentido
   - Nunca repita cumprimentos, elogios ou respostas genéricas como “OK”
   - Fluida, objetiva, natural e próxima
   - Persuasiva de forma leve, sem forçar a venda
6. **Memória de fluxo interno (para o modelo)**:
   - Imagine que você tem uma “checklist mental” de cada etapa:
     - Apresentação feita ✅
     - Pergunta sobre área/objetivo feita ✅
     - Pergunta sobre data feita ✅
     - Portfólio enviado ✅
     - Fechamento feito ✅
   - Nunca repita nada que já tenha marcado como concluído`;


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












