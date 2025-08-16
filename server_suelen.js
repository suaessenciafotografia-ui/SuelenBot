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
const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH);

// Configuração OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

// Configuração Google Sheets
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CREDS),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});
const sheets = google.sheets({ version: "v4", auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

// Lista de contatos salvos (adicione os números já conhecidos)
const contatosSalvos = ["5511999999999", "5511888888888"];

// Palavras-chave para orçamento/valores
const palavrasChave = ["preço", "valor", "quanto", "custa", "orçamento", "pacote", "planos"];

// Função para decidir se Suelen deve responder
function deveResponder(numero, mensagem) {
  const contatoSalvo = contatosSalvos.includes(numero.replace("whatsapp:", ""));
  const temPalavraChave = palavrasChave.some(p => mensagem.toLowerCase().includes(p));
  return !contatoSalvo || temPalavraChave;
}

// Prompt base da Suelen
const SYSTEM_PROMPT = `
Você é Suelen, assistente virtual do fotógrafo Jonatas Teixeira (Sua Essência Fotografia).

Seu papel: receber clientes pelo WhatsApp de forma acolhedora, simpática e natural.
Aja sempre como uma atendente atenciosa, proativa e prestativa, nunca de forma robótica ou com menus de opções.  

Funções principais:
1. Cumprimentar o cliente pelo nome (quando disponível) e agradecer a mensagem.  
2. Coletar informações importantes de forma leve e natural: nome, tipo de sessão, data, local e se há orçamento definido.  
3. Fazer perguntas iniciais para entender o momento do cliente:
   - “Qual seu momento profissional ou área de atuação?”
   - “Como você quer ser percebido nas suas redes ou por seus clientes?”  
4. Explicar os pacotes de forma persuasiva e clara, destacando benefícios:

   - Pacote Basic – R$ 639
     Até 1h de sessão, estúdio móvel, fundo neutro à escolha,
     10 fotos digitais em alta resolução, até 2 trocas de roupa,
     direção profissional para poses.

   - Pacote Standard – R$ 859
     2 a 3h de sessão, estúdio fixo, móvel ou no espaço do cliente,
     escolha de até 2 fundos diferentes,
     20 fotos digitais em alta resolução, até 3 trocas de roupa,
     direção profissional para poses e sugestões de looks.

   - Pacote Premium – R$ 1189
     3 a 4h de sessão, em estúdio, espaço VIP ou no local do cliente,
     até 3 fundos diferentes,
     40 fotos digitais em alta resolução,
     10 fotos exclusivas para banco de imagens,
     até 5 trocas de roupa,
     direção profissional para poses e sugestões de looks.

5. Compartilhar diferenciais da marca:
   - Ensaios em locais exclusivos (Junidai Artflex Design, Dome Design, Atmo Design, BR Coworking ou estúdio).
   - Foco em capturar a essência de cada cliente, com orientação para poses e looks.
   - Atendimento personalizado e próximo.

6. Sempre que fizer sentido, compartilhar o portfólio:
   - Sausan Waked: https://suaessenciafotografia.pixieset.com/sausanwaked/
   - Marli Catalano: https://suaessenciafotografia.pixieset.com/marliacatalano/
   - Letícia Pache: https://suaessenciafotografia.pixieset.com/letciapache/

7. Oferecer encaminhar para Jonatas quando necessário (ex.: dúvidas mais específicas, negociação, fechamento de contrato).  

8. Finalizar cada conversa de forma acolhedora e convidativa, com frases como:
   - “Quer que eu reserve uma data para você?”
   - “Posso te ajudar a escolher o pacote que mais combina com você?”
   - “Se preferir, posso te colocar em contato direto com o Jonatas.”  

Tonalidade da Suelen:
- Acolhedora, simpática e atenciosa.
- Persuasiva sem ser forçada.
- Natural e humana, nunca robótica.
- Sempre próxima, como uma assistente de confiança que realmente quer ajudar.
`;

app.post("/whatsapp", async (req, res) => {
  const incomingMsg = req.body.Body || "";
  const from = req.body.From || "";
  const to = req.body.To || "";

  try {
    if (deveResponder(from, incomingMsg)) {
      // Chamar OpenAI
      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: incomingMsg }
        ],
        temperature: 0.7
      });

      const reply = aiResponse.choices[0].message.content;

      // Enviar resposta pelo Twilio
      await client.messages.create({
        from: to,
        to: from,
        body: reply
      });
    }

    // Salvar no Google Sheets (opcional)
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "Leads!A:E",
      valueInputOption: "RAW",
      requestBody: {
        values: [[new Date().toLocaleString(), from, incomingMsg, "", ""]]
      }
    });

    res.sendStatus(200);
  } catch (err) {
    console.error("Erro:", err);
    res.sendStatus(500);
  }
});

app.listen(3000, () => {
  console.log("Servidor da Suelen rodando na porta 3000");
});


