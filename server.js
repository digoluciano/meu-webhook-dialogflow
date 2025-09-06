'use strict';

const { WebhookClient } = require('dialogflow-fulfillment');
const express = require('express');
const axios = require('axios'); // Nova biblioteca para fazer chamadas à sua API

// Cria o servidor web
const app = express();
app.use(express.json());

// --- Mapa para formatar os nomes dos serviços (Mantido) ---
const servicoMap = {
  impressao: 'impressão',
  digitalizacao: 'digitalização',
  fotocopia: 'fotocópia',
  encadernacao: 'encadernação',
  plastificacao: 'plastificação',
  declaracao: 'declaração',
  curriculo: 'currículo',
  contrato: 'contrato',
  foto: 'foto'
};

// --- Configurações para a sua API (coloque a sua chave aqui) ---
const faturaApiConfig = {
    baseUrl: 'https://sistema.ecosinformatica.com.br/sistema/api/faturas',
    apiKey: 'XoPz09W+7cQYbuvFMEzZ9GNkLaVmoiW0ArfXlhX7dd8=' // **IMPORTANTE**: Use a mesma chave secreta da sua API PHP
};


// Rota principal que o Dialogflow chama
app.post('/webhook', (req, res) => {
  const agent = new WebhookClient({ request: req, response: res });

  // --- FUNÇÕES EXISTENTES (Mantidas e com o prefixo "RESPOSTA AUTOMÁTICA") ---

  function agendamentoRetirada(agent) {
    const horarioAtendimento = 'de Segunda a Sexta, das 8h às 12h e das 13h às 18h, e aos Sábados das 8h às 12h';
    const data = agent.parameters.date;
    const perguntaHorario = agent.parameters['pergunta-horario'];
    const prefixo = 'RESPOSTA AUTOMÁTICA:\n\n';

    if (data) {
      agent.add(`${prefixo}Nosso horário de atendimento é ${horarioAtendimento}`);
    } else if (perguntaHorario) {
      agent.add(`${prefixo}Estamos abertos ${horarioAtendimento}.`);
    } else {
      agent.add(`${prefixo}Nosso horário de atendimento é ${horarioAtendimento}`);
    }
  }

  function saudacao(agent) {
    const now = new Date();
    const hourBRT = (now.getUTCHours() + 24 - 3) % 24;
    let greeting = '';
    if (hourBRT >= 5 && hourBRT < 12) {
      greeting = 'Bom dia!';
    } else if (hourBRT >= 12 && hourBRT < 18) {
      greeting = 'Boa tarde!';
    } else {
      greeting = 'Boa noite!';
    }
    agent.add(`RESPOSTA AUTOMÁTICA:\n\n${greeting} Em que posso ajudar?`);
  }

  function servicosDocumentos(agent) {
    const servicoRef = agent.parameters.TipoDeServicoDocumento;
    const nomeServicoFormatado = servicoMap[servicoRef] || servicoRef;
    const prefixo = 'RESPOSTA AUTOMÁTICA:\n\n';

    if (nomeServicoFormatado) {
      agent.add(`${prefixo}Sim, nós oferecemos o serviço de "${nomeServicoFormatado}". Para valores e prazos, por favor, envie mensagem para o número 48 99992-0920.`);
    } else {
      agent.add(`${prefixo}Oferecemos vários serviços como impressão, fotocópia e digitalização. Para valores e prazos, por favor, entre em contato pelo número 48 99992-0920.`);
    }
  }

  // --- NOVAS FUNÇÕES PARA O FLUXO DE FATURAS ---

  // Função para a intent `faturas.iniciar`
  function faturasIniciar(agent) {
    agent.add('RESPOSTA AUTOMÁTICA:\n\nClaro! Para que eu possa encontrar as suas faturas, por favor, digite o seu CPF ou CNPJ.');
    // O contexto `aguardando_cpf` é configurado diretamente no Dialogflow
  }

  // Função para a intent `faturas.receber_cpf`
  async function faturasReceberCpf(agent) {
    const cpf = agent.parameters.number;
    const prefixo = 'RESPOSTA AUTOMÁTICA:\n\n';
    
    try {
        // Chama a sua API para buscar as faturas
        const response = await axios.post(`${faturaApiConfig.baseUrl}/api_faturas.php`, 
            { cpf: cpf },
            { headers: { 'X-API-Key': faturaApiConfig.apiKey } }
        );

        const faturas = response.data;

        if (faturas && Array.isArray(faturas) && faturas.length > 0) {
            let resposta = 'Encontrei as seguintes faturas em aberto:\n\n';
            faturas.forEach((fatura, index) => {
                resposta += `${index + 1}. Vencimento: ${fatura.data_vencimento} - Valor: R$ ${fatura.valor}\n`;
            });
            resposta += '\nPor favor, digite o número da fatura que deseja receber.';

            // Define o contexto de saída com os dados para o próximo passo
            agent.context.set({
                name: 'aguardando_selecao_fatura',
                lifespan: 5, // O contexto dura 5 minutos
                parameters: {
                    cpf: cpf,
                    faturasEncontradas: faturas
                }
            });
            agent.add(prefixo + resposta);
        } else {
            agent.add(prefixo + 'Não encontrei faturas em aberto para o CPF informado. Gostaria de tentar com outro número?');
            // Mantém o contexto `aguardando_cpf` para que o utilizador possa tentar novamente
        }
    } catch (error) {
        console.error('Erro ao chamar a API de faturas:', error.response ? error.response.data : error.message);
        agent.add(prefixo + 'Ocorreu um erro ao consultar as suas faturas. Por favor, tente novamente mais tarde.');
    }
  }

  // Função para a intent `faturas.selecionar_numero`
  async function faturasSelecionarNumero(agent) {
    const numeroSelecionado = agent.parameters.number;
    const prefixo = 'RESPOSTA AUTOMÁTICA:\n\n';

    // Recupera os dados guardados no contexto
    const contexto = agent.context.get('aguardando_selecao_fatura');
    const faturas = contexto.parameters.faturasEncontradas;

    if (!faturas || numeroSelecionado < 1 || numeroSelecionado > faturas.length) {
        agent.add(prefixo + 'Número inválido. Por favor, digite um dos números da lista que enviei.');
        // Mantém o contexto para que o utilizador possa tentar novamente
        agent.context.set(contexto);
        return;
    }

    const faturaEscolhida = faturas[numeroSelecionado - 1];

    try {
        // Chama a sua API para obter os links de pagamento
        const response = await axios.post(`${faturaApiConfig.baseUrl}/api_enviar_fatura.php`, 
            { id_fatura: faturaEscolhida.id_fatura },
            { headers: { 'X-API-Key': faturaApiConfig.apiKey } }
        );

        const { link_pix, link_boleto } = response.data;
        let respostaFinal = "Perfeito! O seu pedido foi processado. Escolha a sua forma de pagamento preferida:\n";

        if (link_pix) {
            respostaFinal += `\n💳 Pagar com PIX:\n${link_pix}\n`;
        }
        if (link_boleto) {
            respostaFinal += `\n📄 Pagar com Boleto:\n${link_boleto}\n`;
        }

        agent.add(prefixo + respostaFinal);
        // Limpa o contexto, pois a conversa terminou
        agent.context.delete('aguardando_selecao_fatura');

    } catch (error) {
        console.error('Erro ao chamar a API de envio de fatura:', error.response ? error.response.data : error.message);
        agent.add(prefixo + 'Ocorreu um erro ao tentar enviar a sua fatura. Por favor, tente novamente mais tarde.');
    }
  }


  // Mapeia todas as intenções para as funções corretas
  let intentMap = new Map();
  intentMap.set('agendamento.retirada', agendamentoRetirada);
  intentMap.set('saudacao', saudacao);
  intentMap.set('servicos.documentos', servicosDocumentos);
  
  // --- NOVAS INTENTS DE FATURAS ADICIONADAS ---
  intentMap.set('faturas.iniciar', faturasIniciar);
  intentMap.set('faturas.receber_cpf', faturasReceberCpf);
  intentMap.set('faturas.selecionar_numero', faturasSelecionarNumero);

  agent.handleRequest(intentMap);
});

// --- Rota para o UptimeRobot (Manter o Servidor Acordado) ---
app.get('/', (req, res) => {
    res.send('Webhook está vivo e a funcionar!');
});

// O Render lida com a porta automaticamente
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Webhook rodando na porta ${port}`);
});
