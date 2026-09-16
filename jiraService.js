require('dotenv').config();

const STATUS_PERMITIDOS = [
  "PRÉ-KICKOFF",
  "KICKOFF",
  "TREINAMENTO",
  "ATIVAÇÃO",
  "ATIVAÇÃO DE CANAIS", 
  "ACOMPANHAMENTO",
  "EM PAUSA" // <- Adicionado para o Backend enviar os pausados pro App.jsx tratar
];

const PESOS_STATUS = {
  "PRÉ-KICKOFF": 10,
  "KICKOFF": 8,
  "TREINAMENTO": 5,
  "ATIVAÇÃO": 3,
  "ATIVAÇÃO DE CANAIS": 3,
  "ACOMPANHAMENTO": 1,
  "EM PAUSA": 0
};

// Mantemos a sua lógica de Equipes (Básico/Complexo) que é a correta pro Dashboard atual
const PESOS_NIVEL = {
  "START": 1,
  "PLUS": 4,
  "PREMIUM": 6,
  "PRO": 10
};

const EQUIPE_BASICO = ["Alice Loreiro", "Diogo Basílio"];
const EQUIPE_COMPLEXO = ["Luis Felipe Flores", "Warley Rubas", "João Silva", "Luís Felipe de Carvalho Smidt"];

const getJiraData = async () => {
  const jql = `statusCategory != Done`;
  const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
  
  let todasAsTarefas = []; 
  let startAt = 0;         
  const maxResults = 100;  
  let temMais = true;      

  console.log("-> Iniciando busca no Jira (Com Histórico de Status e Atualizações)...");

  while (temMais) {
    const url = `https://${process.env.JIRA_DOMAIN}.atlassian.net/rest/agile/1.0/board/${process.env.JIRA_BOARD_ID}/issue?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}&expand=changelog`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
      });

      if (!response.ok) throw new Error(`Erro API Jira: ${response.status}`);
      const data = await response.json();
      
      if (data.issues && data.issues.length > 0) {
        todasAsTarefas = todasAsTarefas.concat(data.issues);
        startAt += data.issues.length; 
        if (startAt >= data.total) temMais = false; 
      } else {
        temMais = false; 
      }
    } catch (error) {
      console.error("Erro na requisição do Jira:", error);
      temMais = false; 
    }
  }
  return todasAsTarefas;
};

const calcularFila = async () => {
  const issues = await getJiraData();
  const carga = {};
  const projetosUnicos = new Set();

  if (!issues || issues.length === 0) return { fila: [], totalProjetos: 0 };

  issues.forEach((issue) => {
    if (!issue.fields || !issue.fields.status || !issue.fields.status.name) return;

    const statusReal = issue.fields.status.name.toUpperCase();
    if (!STATUS_PERMITIDOS.includes(statusReal)) return;

    const assignee = issue.fields.assignee;

    if (assignee) {
      const nomeJira = assignee.displayName || assignee.emailAddress || "";

      let equipe = null;
      let nomeFormatado = "";

      if (EQUIPE_BASICO.some(n => nomeJira.toLowerCase().includes(n.toLowerCase()))) {
        equipe = "BASICO";
        nomeFormatado = EQUIPE_BASICO.find(n => nomeJira.toLowerCase().includes(n.toLowerCase()));
      } else if (EQUIPE_COMPLEXO.some(n => nomeJira.toLowerCase().includes(n.toLowerCase()))) {
        equipe = "COMPLEXO";
        nomeFormatado = EQUIPE_COMPLEXO.find(n => nomeJira.toLowerCase().includes(n.toLowerCase()));
      }

      if (!equipe) return;

      if (!carga[nomeFormatado]) {
        carga[nomeFormatado] = {
          nome: nomeFormatado,
          equipe: equipe,
          score: 0,
          projetos: 0,
          totalHoras: 0,
          projetosLista: [],
        };
      }

      const idCampoNivel = process.env.JIRA_CUSTOM_FIELD_NIVEL; 
      let nivelRaw = "START"; 
      if (idCampoNivel && issue.fields[idCampoNivel]) {
        nivelRaw = issue.fields[idCampoNivel].value || issue.fields[idCampoNivel];
      }
      const nivel = typeof nivelRaw === 'string' ? nivelRaw.toUpperCase() : "START";

      const pesoStatus = PESOS_STATUS[statusReal] || 0;
      const pesoNivel = PESOS_NIVEL[nivel] || 1;
      const scoreTotalProjeto = pesoStatus + pesoNivel;

      carga[nomeFormatado].score += scoreTotalProjeto;
      carga[nomeFormatado].projetos += 1;

      const idCampoHoras = process.env.JIRA_CUSTOM_FIELD_HORAS; 
      const valorHoras = idCampoHoras && issue.fields[idCampoHoras] ? issue.fields[idCampoHoras] : 0;
      const horasConvertidas = parseFloat(valorHoras) || 0;
      carga[nomeFormatado].totalHoras += horasConvertidas;

      const historicoStatus = [];
      if (issue.changelog && issue.changelog.histories) {
        issue.changelog.histories.forEach(historia => {
          historia.items.forEach(item => {
            if (item.field === 'status') {
              historicoStatus.push({
                data: historia.created,
                de: item.fromString || "Anterior",
                para: item.toString || "Novo"
              });
            }
          });
        });
      }
      historicoStatus.sort((a, b) => new Date(b.data) - new Date(a.data));

      // 👇 Pegando a data exata da última interação no cartão (Comentário, Anexo, etc)
      const dataUltimaAtualizacao = issue.fields.updated || new Date().toISOString();

      carga[nomeFormatado].projetosLista.push({
        id: issue.key,
        nome: issue.fields.summary || "Sem Título",
        status: statusReal,
        nivel: nivel,
        horas: horasConvertidas,
        scoreProjeto: scoreTotalProjeto,
        historico: historicoStatus,
        ultimaAtualizacao: dataUltimaAtualizacao // <- Mandando para o Dashboard
      });

      projetosUnicos.add(issue.key);
    }
  });

  const filaOrdenada = Object.values(carga).sort((a, b) => a.score - b.score);
  
  return {
    fila: filaOrdenada,
    totalProjetos: projetosUnicos.size,
  };
};

module.exports = { calcularFila };
