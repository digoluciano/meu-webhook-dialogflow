'use strict';

const { WebhookClient } = require('dialogflow-fulfillment');
const express = require('express');

// Cria o servidor web
const app = express();
app.use(express.json());

// Esta é a rota que o Dialogflow vai chamar: /webhook
app.post('/webhook', (req, res) => {
  console.log('--- Pedido recebido do Dialogflow! ---');
  const agent = new WebhookClient({ request: req, response: res });
  console.log('Intent detectada: ' + agent.intent);

  // Função para a intenção de agendamento de retirada
  function agendamentoRetirada(agent) {
    const horarioAtendimento = 'de Segunda a Sexta, das 8h às 12h e das 13h às 18h, e aos Sábados das 8h às 12h';
    const data = agent.parameters.date;
    const perguntaHorario = agent.parameters['pergunta-horario'];

    if (data) {
      agent.add(`RESPOSTA AUTOMÁTICA:\n\nNosso horário de atendimento é ${horarioAtendimento}`);
    } else if (perguntaHorario) {
      agent.add(`ESPOSTA AUTOMÁTICA:\n\nEstamos abertos ${horarioAtendimento}.`);
    } else {
      agent.add(`ESPOSTA AUTOMÁTICA:\n\nNosso horário de atendimento é ${horarioAtendimento}`);
    }
  }

  // Função para saudações
  function saudacao(agent) {
    const now = new Date();
    const hourBRT = (now.getUTCHours() + 24 - 3) % 24; // Fuso horário do Brasil (UTC-3)

    let greeting = '';
    if (hourBRT >= 5 && hourBRT < 12) {
      greeting = 'Bom dia!';
    } else if (hourBRT >= 12 && hourBRT < 18) {
      greeting = 'Boa tarde!';
    } else {
      greeting = 'Boa noite!';
    }
    agent.add(`${greeting} Em que posso ajudar?`);
  }

  // Mapeia as intenções para as funções corretas
  let intentMap = new Map();
  intentMap.set('agendamento.retirada', agendamentoRetirada);
  intentMap.set('saudacao', saudacao);

  agent.handleRequest(intentMap);
});

// O Render lida com a porta automaticamente
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Webhook rodando na porta ${port}`);
});
