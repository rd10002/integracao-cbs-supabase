/************************************************************
 * RECEITA FEDERAL - CBS
 * Destino exclusivo: SUPABASE
 *
 * Tabelas:
 *   - debitos_cbs
 *   - creditos_cbs
 *   - pagamentos_cbs
 *   - consultas_cbs
 *   - historico_importacoes
 *
 * 
 ************************************************************/

const CBS_API_BASE = 'https://api.receitafederal.gov.br/apuracao-cbs/v2';
const CBS_TOKEN_URL = 'https://api.receitafederal.gov.br/token';

const CBS_TAMANHO_LOTE = 300;
const CBS_INTERVALO_PROCESSAMENTO_MINUTOS = 15;


/* ==========================================================
   1. CONFIGURAÇÃO
   ========================================================== */

function obterConfigSupabase() {
  const props = PropertiesService.getScriptProperties();

  const url = props.getProperty('SUPABASE_URL');
  const chave = props.getProperty('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !chave) {
    throw new Error(
      'Faltam as propriedades SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  return {
    url: url.replace(/\/+$/, ''),
    chave: chave
  };
}


function obterCnpjBase_() {
  const valor = PropertiesService
    .getScriptProperties()
    .getProperty('CNPJ_BASE');

  const cnpj = String(valor || '').replace(/\D/g, '');

  if (!/^\d{8}$/.test(cnpj)) {
    throw new Error(
      'A propriedade CNPJ_BASE deve conter exatamente 8 algarismos.'
    );
  }

  return cnpj;
}


/* ==========================================================
   2. TESTE DE LIGAÇÃO AO SUPABASE
   ========================================================== */

function testarConexaoSupabase() {
  const resultado = supabaseRequisicao(
    'GET',
    'debitos_cbs?select=id&limit=1'
  );

  Logger.log('Ligação ao Supabase concluída.');
  Logger.log(JSON.stringify(resultado));

  return resultado;
}


/* ==========================================================
   3. PEDIDOS AO SUPABASE
   ========================================================== */

function supabaseRequisicao(metodo, endpoint, corpo, prefer) {
  const config = obterConfigSupabase();

  const opcoes = {
    method: metodo,
    headers: {
      apikey: config.chave,
      'Content-Type': 'application/json',
      'Prefer': prefer || 'return=minimal'
    },
    muteHttpExceptions: true
  };

  if (corpo !== undefined && corpo !== null) {
    opcoes.payload = JSON.stringify(corpo);
  }

  const resposta = UrlFetchApp.fetch(
    config.url + '/rest/v1/' + endpoint,
    opcoes
  );

  const codigo = resposta.getResponseCode();
  const texto = resposta.getContentText();

  if (codigo < 200 || codigo >= 300) {
    throw new Error(
      'Erro Supabase (' + codigo + '): ' + texto
    );
  }

  if (!texto) {
    return null;
  }

  try {
    return JSON.parse(texto);
  } catch (e) {
    return texto;
  }
}


/* ==========================================================
   4. AUTENTICAÇÃO NA RECEITA FEDERAL
   ========================================================== */

function obterTokenReceita() {
  const props = PropertiesService.getScriptProperties();

  const tokenGuardado = props.getProperty('ACCESS_TOKEN');
  const expiracaoGuardada = Number(
    props.getProperty('TOKEN_EXPIRA_EM') || 0
  );

  // Renova o token 5 minutos antes de expirar.
  if (
    tokenGuardado &&
    expiracaoGuardada > Date.now() + 5 * 60 * 1000
  ) {
    return tokenGuardado;
  }

  const clientId = props.getProperty('CLIENT_ID');
  const clientSecret = props.getProperty('CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    throw new Error(
      'Faltam CLIENT_ID ou CLIENT_SECRET nas Propriedades do Script.'
    );
  }

  const credenciais = Utilities.base64Encode(
    clientId + ':' + clientSecret
  );

  const resposta = UrlFetchApp.fetch(CBS_TOKEN_URL, {
    method: 'post',
    headers: {
      Authorization: 'Basic ' + credenciais
    },
    contentType: 'application/x-www-form-urlencoded',
    payload: {
      grant_type: 'client_credentials'
    },
    muteHttpExceptions: true
  });

  const codigo = resposta.getResponseCode();
  const texto = resposta.getContentText();

  if (codigo < 200 || codigo >= 300) {
    throw new Error(
      'Erro ao obter token da Receita Federal (' +
      codigo + '): ' + texto
    );
  }

  const dados = JSON.parse(texto);

  if (!dados.access_token) {
    throw new Error(
      'A resposta da autenticação não contém access_token.'
    );
  }

  const validadeSegundos = Number(dados.expires_in || 3600);

  props.setProperty('ACCESS_TOKEN', dados.access_token);
  props.setProperty(
    'TOKEN_EXPIRA_EM',
    String(Date.now() + validadeSegundos * 1000)
  );

  return dados.access_token;
}


/* ==========================================================
   5. PEDIDOS À API DA RECEITA FEDERAL
   ========================================================== */

function receitaRequisicao_(metodo, endpoint, corpo) {
  const token = obterTokenReceita();

  const opcoes = {
    method: metodo,
    headers: {
      Authorization: 'Bearer ' + token
    },
    muteHttpExceptions: true
  };

  if (corpo !== undefined && corpo !== null) {
    opcoes.contentType = 'application/json';
    opcoes.payload = JSON.stringify(corpo);
  }

  const resposta = UrlFetchApp.fetch(
    CBS_API_BASE + endpoint,
    opcoes
  );

  const codigo = resposta.getResponseCode();
  const texto = resposta.getContentText();

  if (codigo < 200 || codigo >= 300) {
    throw new Error(
      'Erro na API da Receita (' + codigo + '): ' + texto
    );
  }

  if (!texto) {
    return null;
  }

  return JSON.parse(texto);
}


/* ==========================================================
   6. FUNÇÕES AUXILIARES
   ========================================================== */

function normalizarNumero_(valor) {
  if (
    valor === null ||
    valor === undefined ||
    valor === ''
  ) {
    return 0;
  }

  const numero = Number(valor);

  return isNaN(numero) ? 0 : numero;
}


function obterValor_(objeto, nomes, padrao) {
  objeto = objeto || {};

  for (let i = 0; i < nomes.length; i++) {
    const nome = nomes[i];

    if (
      objeto[nome] !== undefined &&
      objeto[nome] !== null
    ) {
      return objeto[nome];
    }
  }

  return padrao;
}


function dataSupabase(valor) {
  if (
    valor === null ||
    valor === undefined ||
    valor === ''
  ) {
    return null;
  }

  if (valor instanceof Date) {
    return valor.toISOString();
  }

  const data = new Date(valor);

  if (isNaN(data.getTime())) {
    return null;
  }

  return data.toISOString();
}



function normalizarPeriodoApuracao(valor) {
  if (!valor) return null;

  const texto = String(valor).trim();

  // Formato recebido da Receita: MM/AAAA
  const match = texto.match(/^(\d{2})\/(\d{4})$/);

  if (match) {
    const mes = Number(match[1]);
    const ano = Number(match[2]);

    if (mes < 1 || mes > 12) return null;

    return String(mes).padStart(2, '0') + '/' + ano;
  }

  // Também aceita AAAA-MM-DD
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (iso) {
    const mes = Number(iso[2]);
    const dia = Number(iso[3]);

    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) {
      return null;
    }

    return String(mes).padStart(2, '0') + '/' + iso[1];
  }

  return null;
}




function gerarExternalId(registo) {
  const r = registo || {};

  // Preferir um identificador próprio fornecido pela Receita.
  const idProprio = obterValor_(
    r,
    ['id', 'idRegistro', 'id_registro', 'identificador'],
    null
  );

  if (idProprio !== null && idProprio !== '') {
    return String(idProprio);
  }

  // Na ausência de ID próprio, utilizar a identidade documental.
  const identidade = {
    ni: obterValor_(r, ['ni', 'niConsumidor', 'ni_consumidor'], ''),
    origem: obterValor_(r, ['origem'], ''),
    documento: obterValor_(r, ['documento'], ''),
    chave: obterValor_(r, ['chave'], ''),
    emissao: obterValor_(r, ['emissao', 'dataEmissao'], ''),
    registro: obterValor_(r, ['registro', 'dataRegistro'], '')
  };

  const texto = JSON.stringify(identidade);

  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    texto,
    Utilities.Charset.UTF_8
  );

  return bytes.map(function(byte) {
    const valor = (byte + 256) % 256;
    return ('0' + valor.toString(16)).slice(-2);
  }).join('');
}



function extrairRegistosCBS_(json, tipo) {
  const resultado = [];
  const apuracoes = Array.isArray(json && json.apuracao)
    ? json.apuracao
    : [];

  apuracoes.forEach(function(apuracao) {
    const lista = tipo === 'debitos'
      ? apuracao.debitos
      : apuracao.creditos;

    if (!Array.isArray(lista)) return;

    lista.forEach(function(registo) {
      resultado.push({
        periodo: apuracao.pa || null,
        ni: json.ni || null,
        niConsumidor: json.niConsumidor || null,
        geradoEm: json.geradoEm || null,
        ticket: json.tiqueteSolicitacao || null,
        registo: registo
      });
    });
  });

  return resultado;
}


/* ==========================================================
   7. UPSERT EM LOTES NO SUPABASE
   ========================================================== */

function supabaseUpsertLotes(tabela, linhas) {
  if (!linhas || linhas.length === 0) {
    return 0;
  }

  let total = 0;

  for (
    let inicio = 0;
    inicio < linhas.length;
    inicio += CBS_TAMANHO_LOTE
  ) {
    const lote = linhas.slice(
      inicio,
      inicio + CBS_TAMANHO_LOTE
    );

    supabaseRequisicao(
      'POST',
      tabela + '?on_conflict=cnpj_base,external_id',
      lote,
      'resolution=merge-duplicates,return=minimal'
    );

    total += lote.length;
  }

  return total;
}


/* ==========================================================
   8. GRAVAÇÃO DE DÉBITOS
   ========================================================== */


function gravarDebitosNoSupabase(json, ticket, cnpj) {
  const cnpjBase = String(cnpj || '').replace(/\D/g, '');

  if (!/^\d{8}$/.test(cnpjBase)) {
    throw new Error('CNPJ base inválido ao gravar débitos.');
  }

  const registos = extrairRegistosCBS_(json, 'debitos');
  const agora = new Date().toISOString();

  const linhas = registos.map(function(item) {
    const r = item.registo || {};
    const cbs = r.cbs || {};

    return {
      cnpj_base: cnpjBase,
      external_id: gerarExternalId(r),
      ticket: ticket || item.ticket,

      // Dados que vêm na raiz do JSON
      ni_consumidor: item.niConsumidor || null,
      gerado_em: dataSupabase(item.geradoEm),

      periodo_apuracao:
        normalizarPeriodoApuracao(item.periodo),

      origem: obterValor_(r, ['origem'], null),
      documento: obterValor_(r, ['documento'], null),
      chave: obterValor_(r, ['chave'], null),

      emissao: dataSupabase(
        obterValor_(r, ['emissao', 'dataEmissao'], null)
      ),

      registro: dataSupabase(
        obterValor_(r, ['registro', 'dataRegistro'], null)
      ),

      atualizacao: dataSupabase(
        obterValor_(r, ['atualizacao', 'dataAtualizacao'], null)
      ),

      cbs_apurado: normalizarNumero_(
        obterValor_(cbs, ['apurado'], 0)
      ),

      excedente: normalizarNumero_(
        obterValor_(cbs, ['excedentes', 'excedente'], 0)
      ),

      inexigivel: normalizarNumero_(
        obterValor_(cbs, ['inexigivel', 'inexigibilidade'], 0)
      ),

      suspenso: normalizarNumero_(
        obterValor_(cbs, ['suspenso'], 0)
      ),

      pagamento_antecipado: normalizarNumero_(
        obterValor_(
          cbs,
          ['pgtoAntecipado', 'pagamentoAntecipado', 'pagamento_antecipado'],
          0
        )
      ),

      extinto: normalizarNumero_(
        obterValor_(cbs, ['extinto'], 0)
      ),

      saldo_devedor: normalizarNumero_(
        obterValor_(cbs, ['saldoDevedor', 'saldo_devedor'], 0)
      ),

      dados_originais: {
        ni: item.ni,
        niConsumidor: item.niConsumidor,
        geradoEm: item.geradoEm,
        tiqueteSolicitacao: ticket || item.ticket,
        periodo: item.periodo,
        debito: r
      },

      atualizado_em: agora
    };
  });

  return supabaseUpsertLotes('debitos_cbs', linhas);
}



/* ==========================================================
   9. GRAVAÇÃO DE CRÉDITOS
   ========================================================== */



function gravarCreditosNoSupabase(json, ticket, cnpj) {
  const cnpjBase = String(
    cnpj || obterCnpjBase_()
  ).replace(/\D/g, '');

  if (!/^\d{8}$/.test(cnpjBase)) {
    throw new Error('CNPJ base inválido ao gravar créditos.');
  }

  // Recebe o JSON completo e extrai os registros de crédito.
  const itens = extrairRegistosCBS_(json, 'creditos');

  if (itens.length === 0) {
    Logger.log('Nenhum crédito encontrado para importar.');
    return 0;
  }

  const agora = new Date().toISOString();

  const linhas = itens.map(function(item) {
    const r = item.registo || {};
    const cbs = r.cbs || {};
    const apropriacao = cbs.apropriacao || {};
    const utilizacao = apropriacao.utilizacao || {};
    const naoUtilizado = utilizacao.naoUtilizado || {};

    const saldoCredor = normalizarNumero_(
      naoUtilizado.saldoCredor
    );

    const ticketRegistro = ticket || item.ticket;

    if (!ticketRegistro) {
      throw new Error('Crédito sem tíquete de solicitação.');
    }

    return {
      cnpj_base: cnpjBase,
      external_id: gerarExternalId(r),
      ticket: String(ticketRegistro),

      ni_consumidor: item.niConsumidor || null,
      gerado_em: dataSupabase(item.geradoEm),
      periodo_apuracao: normalizarPeriodoApuracao(item.periodo),

      origem: obterValor_(r, ['origem'], null),
      documento: obterValor_(r, ['documento'], null),
      chave: obterValor_(r, ['chave'], null),

      emissao: dataSupabase(
        obterValor_(r, ['emissao', 'dataEmissao'], null)
      ),

      registro: dataSupabase(
        obterValor_(r, ['registro', 'dataRegistro'], null)
      ),

      atualizacao: dataSupabase(
        obterValor_(r, ['atualizacao', 'dataAtualizacao'], null)
      ),

      cbs_apurado: normalizarNumero_(cbs.apurado),
      excedentes: normalizarNumero_(cbs.excedentes),

      inapropriavel: normalizarNumero_(
        apropriacao.inapropriavel
      ),

      suspenso: normalizarNumero_(
        apropriacao.suspenso
      ),

      prescrito: normalizarNumero_(
        apropriacao.prescrito
      ),

      a_apropriar: normalizarNumero_(
        apropriacao.aApropriar
      ),

      apropriado: normalizarNumero_(
        apropriacao.apropriado
      ),

      inutilizavel: normalizarNumero_(
        utilizacao.inutilizavel
      ),

      utilizado: normalizarNumero_(
        utilizacao.utilizado
      ),

      restabelecido: normalizarNumero_(
        utilizacao.restabelecido
      ),

      saldo_credor: saldoCredor,

      pedido_ressarcimento: normalizarNumero_(
        naoUtilizado.pedidoRessarcimento
      ),

      saldo_util: saldoCredor,

      dados_originais: {
        ni: item.ni,
        niConsumidor: item.niConsumidor,
        geradoEm: item.geradoEm,
        tiqueteSolicitacao: ticketRegistro,
        periodo: item.periodo,
        credito: r
      },

      atualizado_em: agora
    };
  });

  return supabaseUpsertLotes('creditos_cbs', linhas);
}






/* ==========================================================
   9A. GRAVAÇÃO DE PAGAMENTOS (PCONT + RAD)
   ========================================================== */

/**
 * Gera uma identidade estável por item de composição.
 * Um DARF pode conter mais de um item; por isso a chave inclui
 * o número do DARF e os dados identificadores da composição.
 */
function gerarExternalIdPagamento_(pagamento, composicao, dataArrecadacao) {
  const p = pagamento || {};
  const c = composicao || {};

  const identidade = {
    numeroDARF: obterValor_(p, ['numeroDARF', 'numeroDarf'], ''),
    tipo: obterValor_(p, ['tipo'], ''),
    dataArrecadacao: dataArrecadacao || '',
    sequencial: obterValor_(c, ['sequencial'], ''),
    pa: obterValor_(c, ['pa'], ''),
    ni_contribuinte: obterValor_(c, ['ni_contribuinte', 'niContribuinte'], ''),
    chaveDFE: obterValor_(c, ['chaveDFE', 'chaveDfe'], '')
  };

  const texto = JSON.stringify(identidade);
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    texto,
    Utilities.Charset.UTF_8
  );

  return bytes.map(function(byte) {
    const valor = (byte + 256) % 256;
    return ('0' + valor.toString(16)).slice(-2);
  }).join('');
}


/**
 * A API retorna:
 * apuracao[] -> pagamentos[] -> composicao[].
 * Gravamos uma linha por item de composição para permitir
 * conciliação por PA, contribuinte e chave do documento fiscal.
 */
function gravarPagamentosNoSupabase(json, ticket, cnpj) {
  const cnpjBase = String(cnpj || '').replace(/\D/g, '');

  if (!/^\d{8}$/.test(cnpjBase)) {
    throw new Error('CNPJ base inválido ao gravar pagamentos.');
  }

  const apuracoes = Array.isArray(json && json.apuracao)
    ? json.apuracao
    : [];

  const agora = new Date().toISOString();
  const linhas = [];

  apuracoes.forEach(function(apuracao) {
    const dataArrecadacao = dataSupabase(
      obterValor_(apuracao, ['dataArrecadacao', 'data_arrecadacao'], null)
    );

    const pagamentos = Array.isArray(apuracao && apuracao.pagamentos)
      ? apuracao.pagamentos
      : [];

    pagamentos.forEach(function(pagamento) {
      const composicoes = Array.isArray(pagamento && pagamento.composicao)
        ? pagamento.composicao
        : [];

      composicoes.forEach(function(composicao) {
        const tipo = normalizarNumero_(
          obterValor_(pagamento, ['tipo'], 0)
        );

        const descricaoTipo = tipo === 1
          ? 'RAD'
          : tipo === 2
            ? 'PCONT'
            : 'OUTRO';

        const numeroDARF = obterValor_(
          pagamento,
          ['numeroDARF', 'numeroDarf'],
          null
        );

        const sequencial = obterValor_(
          composicao,
          ['sequencial'],
          null
        );

        const externalId = gerarExternalIdPagamento_(
          pagamento,
          composicao,
          dataArrecadacao
        );

        linhas.push({
          cnpj_base: cnpjBase,
          external_id: externalId,
          ticket: ticket || json.tiqueteSolicitacao || null,

          ni: json.ni || null,
          ni_consumidor: json.niConsumidor || null,
          gerado_em: dataSupabase(json.geradoEm),

          data_arrecadacao: dataArrecadacao,
          numero_darf: numeroDARF,
          tipo: tipo,
          tipo_descricao: descricaoTipo,
          ni_adquirente: obterValor_(
            pagamento,
            ['niAdquirente', 'ni_adquirente'],
            null
          ),

          sequencial: sequencial,
          periodo_apuracao: normalizarPeriodoApuracao(
            obterValor_(composicao, ['pa'], null)
          ),
          vencimento: dataSupabase(
            obterValor_(composicao, ['vencimento'], null)
          ),
          ni_contribuinte: obterValor_(
            composicao,
            ['ni_contribuinte', 'niContribuinte'],
            null
          ),
          chave_dfe: obterValor_(
            composicao,
            ['chaveDFE', 'chaveDfe'],
            null
          ),

          principal: normalizarNumero_(
            obterValor_(composicao, ['principal'], 0)
          ),
          multa: normalizarNumero_(
            obterValor_(composicao, ['multa'], 0)
          ),
          juros: normalizarNumero_(
            obterValor_(composicao, ['juros'], 0)
          ),
          total: normalizarNumero_(
            obterValor_(composicao, ['total'], 0)
          ),

          dados_originais: {
            ni: json.ni || null,
            niConsumidor: json.niConsumidor || null,
            geradoEm: json.geradoEm || null,
            tiqueteSolicitacao: ticket || json.tiqueteSolicitacao || null,
            dataArrecadacao: apuracao.dataArrecadacao || null,
            pagamento: pagamento,
            composicao: composicao
          },

          atualizado_em: agora
        });
      });
    });
  });

  if (linhas.length === 0) {
    Logger.log('Nenhum item de pagamento encontrado para importar.');
    return 0;
  }

  return supabaseUpsertLotes('pagamentos_cbs', linhas);
}


/* ==========================================================
   10. REGISTO DE CONSULTAS E IMPORTAÇÕES
   ========================================================== */

function registarConsultaSupabase(
  ticket,
  cnpj,
  tipo,
  situacao,
  tempoEstimado,
  mensagem,
  quantidade
) {
  const linha = {
    ticket: ticket,
    cnpj_base: cnpj,
    tipo: tipo,
    situacao: situacao,
    tempo_estimado_segundos: normalizarNumero_(tempoEstimado),
    mensagem: mensagem || null,
    quantidade_registros: normalizarNumero_(quantidade)
  };

  if (situacao === 'CONCLUIDA' ||
      situacao === 'ERRO' ||
      situacao === 'EXPIRADA') {
    linha.concluido_em = new Date().toISOString();
  }

  supabaseRequisicao(
    'POST',
    'consultas_cbs?on_conflict=ticket',
    linha,
    'resolution=merge-duplicates,return=minimal'
  );
}


function registarImportacaoSupabase(
  ticket,
  tipo,
  quantidade,
  resultado
) {
  const linha = {
    ticket: ticket,
    tipo: tipo,
    quantidade_registros: normalizarNumero_(quantidade),
    resultado: resultado
  };

  supabaseRequisicao(
    'POST',
    'historico_importacoes?on_conflict=ticket,tipo',
    linha,
    'resolution=merge-duplicates,return=minimal'
  );
}


/* ==========================================================
   11. ABERTURA DAS CONSULTAS DIÁRIAS
   ========================================================== */

function abrirConsultasSupabaseCBS() {
  const tipos = ['debitos', 'creditos', 'pagamentos'];

  tipos.forEach(function(tipo) {
    try {
      abrirTipoSupabaseCBS(tipo);
    } catch (erro) {
      Logger.log(
        'Erro ao abrir consulta de ' + tipo + ': ' + erro.message
      );
    }
  });
}



function abrirTipoSupabaseCBS(tipo) {

  if (['debitos', 'creditos', 'pagamentos'].indexOf(tipo) === -1) {
    throw new Error('Tipo de consulta inválido: ' + tipo);
  }

  const cnpj = obterCnpjBase_();
  const props = PropertiesService.getScriptProperties();

  const hoje = Utilities.formatDate(
    new Date(),
    'America/Sao_Paulo',
    'yyyy-MM-dd'
  );

  const chaveData =
    'DATA_ABERTURA_' + tipo.toUpperCase() + '_SUPABASE';

  const chaveTicket =
    'TICKET_' + tipo.toUpperCase() + '_SUPABASE';

  const chaveImportado =
    'IMPORTADO_' + tipo.toUpperCase() + '_SUPABASE';

  const chaveFinalizado =
    'FINALIZADO_' + tipo.toUpperCase() + '_SUPABASE';

  const chaveTentativa =
    'ULTIMA_TENTATIVA_' + tipo.toUpperCase() + '_SUPABASE';

  // Já abriu consulta hoje.
  if (props.getProperty(chaveData) === hoje) {
    Logger.log('Consulta de ' + tipo + ' já aberta hoje.');
    return;
  }

  // Proteção específica para pagamentos.
  // Evita consumir várias solicitações no mesmo dia.
  if (
    tipo === 'pagamentos' &&
    props.getProperty(chaveTentativa) === hoje
  ) {
    Logger.log(
      'Pagamentos já testados hoje. ' +
      'Nova tentativa somente amanhã.'
    );
    return;
  }

  const ticketAnterior = props.getProperty(chaveTicket);
  const importadoAnterior = props.getProperty(chaveImportado);
  const finalizadoAnterior = props.getProperty(chaveFinalizado);

  // Não abre outra consulta enquanto existir uma pendente.
  if (
    ticketAnterior &&
    importadoAnterior !== ticketAnterior &&
    finalizadoAnterior !== ticketAnterior
  ) {
    Logger.log(
      'Consulta anterior de ' + tipo +
      ' ainda não está finalizada.'
    );
    return;
  }

  Logger.log('API BASE: ' + CBS_API_BASE);
  Logger.log('TIPO: ' + tipo);
  Logger.log('CNPJ BASE: ' + cnpj);

  // Registra a tentativa antes da chamada.
  // Mesmo se houver erro 404, não repetirá no mesmo dia.
  if (tipo === 'pagamentos') {
    props.setProperty(chaveTentativa, hoje);
  }

  let resposta;

  try {

    resposta = receitaRequisicao_(
      'post',
      '/' + tipo + '/' + cnpj,
      { urlRetorno: '' }
    );

  } catch (erro) {

    const mensagemErro = String(erro.message || erro);

    if (
      tipo === 'pagamentos' &&
      mensagemErro.indexOf('(404)') !== -1
    ) {
      Logger.log(
        'PAGAMENTOS AINDA NÃO DISPONÍVEL NA API. ' +
        'O sistema tentará novamente amanhã.'
      );

      Logger.log(mensagemErro);

      return;
    }

    throw erro;
  }

  const ticket = resposta && resposta.tiqueteSolicitacao;

  if (!ticket) {
    throw new Error(
      'A Receita não devolveu tiqueteSolicitacao para ' + tipo + '.'
    );
  }

  // Consulta aceita pela Receita.
  props.setProperty(chaveData, hoje);
  props.setProperty(chaveTicket, String(ticket));

  props.deleteProperty(chaveImportado);
  props.deleteProperty(chaveFinalizado);

  registarConsultaSupabase(
    String(ticket),
    cnpj,
    tipo,
    'PENDENTE',
    resposta.tEASegundos,
    'Consulta submetida à Receita Federal.',
    0
  );

  Logger.log(
    'Consulta de ' + tipo +
    ' aberta com sucesso. Ticket: ' + ticket
  );
}



/* ==========================================================
   12. PROCESSAMENTO AUTOMÁTICO
   ========================================================== */


function processarConsultasSupabaseCBS() {

  const lock = LockService.getScriptLock();

  if (!lock.tryLock(1000)) {
    Logger.log('Já existe outro processamento em execução.');
    return;
  }

  try {

    ['debitos', 'creditos', 'pagamentos'].forEach(function(tipo) {

      try {
        processarTipoSupabaseCBS(tipo);

      } catch (erro) {

        Logger.log(
          'Erro no processamento de ' +
          tipo + ': ' + erro.message
        );

      }

    });

  } finally {
    lock.releaseLock();
  }
}



function processarTipoSupabaseCBS(tipo) {
  const props = PropertiesService.getScriptProperties();

  const chaveTicket = 'TICKET_' + tipo.toUpperCase() + '_SUPABASE';
  const chaveImportado = 'IMPORTADO_' + tipo.toUpperCase() + '_SUPABASE';
  const chaveFinalizado = 'FINALIZADO_' + tipo.toUpperCase() + '_SUPABASE';

  const ticket = props.getProperty(chaveTicket);

  if (!ticket) {
    return;
  }

  if (props.getProperty(chaveImportado) === ticket) {
    return;
  }

  if (props.getProperty(chaveFinalizado) === ticket) {
    return;
  }

  const cnpj = obterCnpjBase_();

  const situacaoResposta = receitaRequisicao_(
    'get',
    '/situacao/' + encodeURIComponent(ticket)
  );

  const situacao = String(
    situacaoResposta.situacao || ''
  ).toUpperCase();

  const mensagem =
  situacaoResposta.mensagemErro ||
  situacaoResposta.mensagem ||
  null;

  Logger.log(
    'Ticket ' + ticket + ' (' + tipo + '): ' + situacao
  );

  if (situacao === 'CONCLUIDA') {
    const dados = baixarParaSupabaseCBS(ticket);

    let quantidade;

    if (tipo === 'debitos') {
      quantidade = gravarDebitosNoSupabase(
        dados,
        ticket,
        cnpj
      );
    } else if (tipo === 'creditos') {
      quantidade = gravarCreditosNoSupabase(
        dados,
        ticket,
        cnpj
      );
    } else if (tipo === 'pagamentos') {
      quantidade = gravarPagamentosNoSupabase(
        dados,
        ticket,
        cnpj
      );
    } else {
      throw new Error('Tipo de consulta sem rotina de gravação: ' + tipo);
    }

    registarImportacaoSupabase(
      ticket,
      tipo,
      quantidade,
      'SUCESSO'
    );

    registarConsultaSupabase(
      ticket,
      cnpj,
      tipo,
      'CONCLUIDA',
      situacaoResposta.tEASegundos,
      mensagem || 'Importação concluída.',
      quantidade
    );

    props.setProperty(chaveImportado, ticket);

    Logger.log(
      'Importação de ' + tipo + ' concluída. Registos: ' + quantidade
    );

    return;
  }

  if (situacao === 'ERRO' || situacao === 'EXPIRADA') {
    registarConsultaSupabase(
      ticket,
      cnpj,
      tipo,
      situacao,
      situacaoResposta.tEASegundos,
      mensagem || situacao,
      0
    );

    registarImportacaoSupabase(
      ticket,
      tipo,
      0,
      situacao
    );

    props.setProperty(chaveFinalizado, ticket);

    Logger.log(
      'Consulta de ' + tipo + ' terminou com estado: ' + situacao
    );

    return;
  }

  // PENDENTE ou EM_PROCESSAMENTO
  registarConsultaSupabase(
    ticket,
    cnpj,
    tipo,
    situacao || 'EM_PROCESSAMENTO',
    situacaoResposta.tEASegundos,
    mensagem,
    0
  );
}


/* ==========================================================
   13. DOWNLOAD DOS RESULTADOS
   ========================================================== */

function baixarParaSupabaseCBS(ticket) {
  const resposta = receitaRequisicao_(
    'get',
    '/download/' + encodeURIComponent(ticket)
  );

  const urlAssinada = resposta && resposta.urlAssinada;

  if (!urlAssinada) {
    throw new Error(
      'A resposta do download não contém urlAssinada.'
    );
  }

  // A URL assinada é utilizada sem o token da Receita.
  const ficheiro = UrlFetchApp.fetch(urlAssinada, {
    method: 'get',
    muteHttpExceptions: true
  });

  const codigo = ficheiro.getResponseCode();
  const texto = ficheiro.getContentText();

  if (codigo < 200 || codigo >= 300) {
    throw new Error(
      'Erro ao descarregar o ficheiro (' + codigo + '): ' + texto
    );
  }

  try {
    return JSON.parse(texto);
  } catch (erro) {
    throw new Error(
      'O ficheiro descarregado não contém JSON válido: ' +
      erro.message
    );
  }
}


/* ==========================================================
   14. INSTALAÇÃO DOS ACIONADORES
   ========================================================== */

function instalarAutomacaoSupabaseCBS() {
  const handlersAntigos = [
    // Automações antigas que escreviam no Google Sheets
    'solicitarDebitosDiario',
    'verificarPendentes',
    'baixarEGravar',
    'abrirConsultaCBS',
    'verificarConsultaCBS',
    'baixarEImportarCBS',
    'processarConsultaCBS',
    'abrirConsultasDiariasCBS',
    'processarConsultasCBS',
    'processarTipoCBS_',
    'baixarImportarTipoCBS_',

    // Acionadores Supabase anteriores
    'abrirConsultasSupabaseCBS',
    'processarConsultasSupabaseCBS'
  ];

  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    const handler = trigger.getHandlerFunction();

    if (handlersAntigos.indexOf(handler) !== -1) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Consulta diária às 07:00.
  ScriptApp.newTrigger('abrirConsultasSupabaseCBS')
    .timeBased()
    .everyDays(1)
    .atHour(7)
    .create();

  // Verificação dos tickets a cada 15 minutos.
  ScriptApp.newTrigger('processarConsultasSupabaseCBS')
    .timeBased()
    .everyMinutes(CBS_INTERVALO_PROCESSAMENTO_MINUTOS)
    .create();

  Logger.log('Automações Supabase instaladas.');
}


/* ==========================================================
   15. DIAGNÓSTICO DOS ACIONADORES
   ========================================================== */

function listarAcionadoresCBS() {
  const triggers = ScriptApp.getProjectTriggers();

  triggers.forEach(function(trigger) {
    Logger.log(
      trigger.getHandlerFunction() +
      ' | ' +
      trigger.getEventType()
    );
  });

  Logger.log('Total de acionadores: ' + triggers.length);
}



