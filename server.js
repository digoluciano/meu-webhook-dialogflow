'use strict';

const { WebhookClient } = require('dialogflow-fulfillment');
const express = require('express');
const axios = require('axios');

// Cria o servidor web
const app = express();
app.use(express.json());

// --- Mapa para formatar os nomes dos serviços ---
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

// --- Configurações para as suas APIs ---
const apiConfig = {
    baseUrl: 'https://sistema.ecosinformatica.com.br/sistema/api/',
    apiKey: 'XoPz09W+7cQYbuvFMEzZ9GNkLaVmoiW0ArfXlhX7dd8='
};


// Rota principal que o Dialogflow chama
app.post('/webhook', (req, res) => {
  const agent = new WebhookClient({ request: req, response: res });

  // --- FUNÇÕES DE LÓGICA ---

  function agendamentoRetirada(agent) {
    const horarioAtendimento = 'de Segunda a Sexta, das 8h às 12h e das 13h às 18h, e aos Sábados das 8h às 12h';
    const prefixo = 'RESPOSTA AUTOMÁTICA:\n\n';
    agent.add(`${prefixo}Nosso horário de atendimento é ${horarioAtendimento}`);
  }

  function faturasIniciar(agent) {
    const prefixo = 'RESPOSTA AUTOMÁTICA:\n\n';
    agent.add(prefixo + 'Claro! Para que eu possa encontrar as suas faturas, por favor, digite o seu CPF ou CNPJ.');
  }

  async function faturasReceberCpf(agent) {
    // ... (Esta função mantém-se igual)
    const rawInput = agent.query;
    const prefixo = 'RESPOSTA AUTOMÁTICA:\n\n';
    const cpfCnpjLimpo = rawInput.replace(/\D/g, '');

    if (cpfCnpjLimpo.length !== 11 && cpfCnpjLimpo.length !== 14) {
      agent.add(prefixo + 'O CPF ou CNPJ parece inválido. Por favor, digite apenas os números, sem pontos ou traços.');
      return;
    }
    
    try {
        const response = await axios.post(`${apiConfig.baseUrl}faturas/api_faturas.php`, 
            { cpf: cpfCnpjLimpo },
            { headers: { 'X-API-Key': apiConfig.apiKey } }
        );
        
        const faturas = response.data;

        if (faturas && Array.isArray(faturas) && faturas.length > 0) {
            let resposta = 'Encontrei as seguintes faturas em aberto:\n\n';
            faturas.forEach((fatura, index) => {
                resposta += `${index + 1}. Vencimento: ${fatura.data_vencimento} - Valor: R$ ${fatura.valor}\n`;
            });
            resposta += '\nPor favor, digite o número da fatura que deseja receber.';

            agent.context.set({
                name: 'aguardando_selecao_fatura',
                lifespan: 5,
                parameters: { cpf: cpfCnpjLimpo, faturasEncontradas: faturas }
            });
            agent.add(prefixo + resposta);
        } else {
            agent.add(prefixo + 'Não encontrei faturas em aberto para o CPF informado.');
        }
    } catch (error) {
        console.error('[DEBUG] Erro ao chamar a API de faturas:', error.response ? error.response.data : error.message);
        agent.add(prefixo + 'Ocorreu um erro ao consultar as suas faturas.');
    }
  }

  async function faturasSelecionarNumero(agent) {
    // ... (Esta função mantém-se igual)
    const numeroSelecionado = agent.parameters.number;
    const prefixo = 'RESPOSTA AUTOMÁTICA:\n\n';
    const contexto = agent.context.get('aguardando_selecao_fatura');
    const faturas = contexto.parameters.faturasEncontradas;

    if (!faturas || numeroSelecionado < 1 || numeroSelecionado > faturas.length) {
        agent.add(prefixo + 'Número inválido. Por favor, digite um dos números da lista.');
        agent.context.set(contexto);
        return;
    }

    const faturaEscolhida = faturas[numeroSelecionado - 1];

    try {
        const response = await axios.post(`${apiConfig.baseUrl}faturas/api_enviar_fatura.php`, 
            { id_fatura: faturaEscolhida.id_fatura },
            { headers: { 'X-API-Key': apiConfig.apiKey } }
        );

        const { link_pix, link_boleto } = response.data;
        let respostaFinal = "Perfeito! O seu pedido foi processado. Escolha a sua forma de pagamento preferida:\n";

        if (link_pix) { respostaFinal += `\n💳 Pagar com PIX:\n${link_pix}\n`; }
        if (link_boleto) { respostaFinal += `\n📄 Pagar com Boleto:\n${link_boleto}\n`; }

        agent.add(prefixo + respostaFinal);
        agent.context.delete('aguardando_selecao_fatura');

    } catch (error) {
        console.error('[DEBUG] Erro ao chamar a API de envio de fatura:', error.response ? error.response.data : error.message);
        agent.add(prefixo + 'Ocorreu um erro ao tentar enviar a sua fatura.');
    }
  }

  async function produtosConsultarPreco(agent) {
    // ... (Esta função mantém-se igual)
    const prefixo = 'RESPOSTA AUTOMÁTICA:\n\n';
    const tamanhoFoto = agent.parameters.TamanhoFoto;
    const userQuery = agent.query.toLowerCase();

    let termoParaApi = '';
    
    if (tamanhoFoto) { termoParaApi = tamanhoFoto; } 
    else if (userQuery.includes('revelação') || userQuery.includes('revelacao')) { termoParaApi = 'revelacao'; }
    else if (userQuery.includes('foto') || userQuery.includes('fotos')) {
        agent.add(prefixo + 'Claro! Temos vários tamanhos de foto. Qual tamanho você gostaria de saber o preço? (ex: 10x15, 15x21)');
        return;
    } else { termoParaApi = agent.query; }

    try {
        const response = await axios.post(`${apiConfig.baseUrl}produtos/api_produtos.php`, 
            { termo_busca: termoParaApi },
            { headers: { 'X-API-Key': apiConfig.apiKey } }
        );
        const produtos = response.data;
        if (produtos && Array.isArray(produtos) && produtos.length > 0) {
            let resposta = 'Encontrei os seguintes preços:\n\n';
            produtos.forEach(produto => {
                resposta += `- ${produto.descricao}: R$ ${produto.preco}\n`;
            });
            agent.add(prefixo + resposta);
        } else {
            agent.add(prefixo + `Não encontrei um preço para "${termoParaApi}".`);
        }
    } catch (error) {
        console.error('[DEBUG] Erro ao chamar a API de produtos:', error.response ? error.response.data : error.message);
        agent.add(prefixo + 'Ocorreu um erro ao consultar os preços.');
    }
  }
  
  function servicosDocumentos(agent) {
    const servicoRef = agent.parameters.TipoDeServicoDocumento;
    const nomeServicoFormatado = servicoMap[servicoRef] || servicoRef;
    const prefixo = 'RESPOSTA AUTOMÁTICA:\n\n';
    
    // Resposta genérica para todos os serviços, como definido no seu pedido
    agent.add(`${prefixo}Sim, nós oferecemos o serviço de "${nomeServicoFormatado}". Para valores e prazos, por favor, envie mensagem para o número 48 99992-0920.`);
  }

  // Mapeia todas as intenções para as funções corretas
  let intentMap = new Map();
  // Intents do Menu Principal
  intentMap.set('menu.faturas', faturasIniciar);
  intentMap.set('menu.precos', produtosConsultarPreco);
  intentMap.set('menu.horario', agendamentoRetirada);
  // A 'menu.servicos' agora é tratada no Dialogflow, não aqui.

  // Intents do Fluxo de Faturas
  intentMap.set('faturas.receber_cpf', faturasReceberCpf);
  intentMap.set('faturas.selecionar_numero', faturasSelecionarNumero);
  
  // **NOVAS LIGAÇÕES PARA O SUB-MENU**
  // Todas estas intents chamam a mesma função, pois o Dialogflow
  // já nos diz qual é o serviço através do parâmetro.
  intentMap.set('servicos.impressao', servicosDocumentos);
  intentMap.set('servicos.fotocopia', servicosDocumentos);
  intentMap.set('servicos.digitalizacao', servicosDocumentos);

  agent.handleRequest(intentMap);
});

// Rota para o UptimeRobot
app.get('/', (req, res) => {
    res.send('Webhook está vivo e a funcionar!');
});

// O Render lida com a porta automaticamente
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Webhook rodando na porta ${port}`);
});
