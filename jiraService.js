require('dotenv').config();

const STATUS_PERMITIDOS = [
  "KICKOFF",
  "TREINAMENTO",
  "ATIVAÇÃO",
  "ATIVAÇÃO DE CANAIS",
  "GO-LIVE",
  "ACOMPANHAMENTO",
  "EM PAUSA" 
];

const PESOS_STATUS = {
  "KICKOFF": 8, "TREINAMENTO": 5,
  "ATIVAÇÃO": 3, "ATIVAÇÃO DE CANAIS": 3,"GO-LIVE":1, "ACOMPANHAMENTO": 1, "EM PAUSA": 0
};

const PESOS_NIVEL = {
  "START": 1, "PLUS": 4, "PREMIUM": 6, "PRO": 10
};

const EQUIPE_BASICO = ["Bruno Gabriel Rodrigues","Alice Loreiro", "Diogo Basílio","Luis Felipe Flores", "Warley Rubas", "João Silva", "Luís Felipe de Carvalho Smidt"];
const EQUIPE_COMPLEXO = ["Bruno Gabriel Rodrigues","Alice Loreiro", "Diogo Basílio","Luis Felipe Flores", "Warley Rubas", "João Silva", "Luís Felipe de Carvalho Smidt"];


const getTotalFinalizados = async () => {
  const jql = `project = OPI AND type = "Implantação Opa! Suite" AND status CHANGED TO "Go-live Finalizado" AFTER -30d`;
  const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
  
  const url = `https://${process.env.JIRA_DOMAIN}.atlassian.net/rest/agile/1.0/board/${process.env.JIRA_BOARD_ID}/issue?jql=${encodeURIComponent(jql)}&maxResults=0`;
  
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "Authorization": `Basic ${auth}`, "Accept": "application/json" }
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("❌ ERRO JIRA (Finalizados):", response.status, errText);
      return 0;
    }
    
    const data = await response.json();
    console.log(`✅ [MÉTRICA] Projetos finalizados: ${data.total}`);
    return data.total || 0;
  } catch (error) {
    console.error("❌ Erro interno ao buscar finalizados:", error);
    return 0;
  }
};

const getTotalIniciados = async () => {
  const jql = `project = OPI AND type = "Implantação Opa! Suite" AND status CHANGED TO "KICKOFF" AFTER -30d`;
  const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
  
  const url = `https://${process.env.JIRA_DOMAIN}.atlassian.net/rest/agile/1.0/board/${process.env.JIRA_BOARD_ID}/issue?jql=${encodeURIComponent(jql)}&maxResults=0`;
  
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { "Authorization": `Basic ${auth}`, "Accept": "application/json" }
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("❌ ERRO JIRA (Iniciados):", response.status, errText);
      return 0;
    }
    
    const data = await response.json();
    console.log(`✅ [MÉTRICA] Projetos iniciados (Kickoff): ${data.total}`);
    return data.total || 0;
  } catch (error) {
    console.error("❌ Erro interno ao buscar iniciados:", error);
    return 0;
  }
};

const getJiraData = async () => {
  const jql = `statusCategory != Done OR updated >= -30d`;
  const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
  
  let todasAsTarefas = []; 
  let startAt = 0;         
  const maxResults = 100;  
  let temMais = true;      

  console.log("-> Iniciando busca da fila de consultores...");

  while (temMais) {
    const url = `https://${process.env.JIRA_DOMAIN}.atlassian.net/rest/agile/1.0/board/${process.env.JIRA_BOARD_ID}/issue?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}&expand=changelog`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { "Authorization": `Basic ${auth}`, "Accept": "application/json" }
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
  // Dispara as três buscas simultaneamente! (Mais rápido)
  const [issues, totalFinalizadosExatos, totalIniciadosExatos] = await Promise.all([
    getJiraData(),
    getTotalFinalizados(),
    getTotalIniciados()
  ]);

  const carga = {};
  const projetosUnicos = new Set();

  if (!issues || issues.length === 0) {
    return { fila: [], totalProjetos: 0, metricasMes: { iniciados: totalIniciadosExatos, concluidos: totalFinalizadosExatos } };
  }

  issues.forEach((issue) => {
    if (!issue.fields || !issue.fields.status || !issue.fields.status.name) return;

    const statusReal = issue.fields.status.name.toUpperCase().trim();
    const dataAtualizacao = new Date(issue.fields.updated);
    const isConcluido = statusReal.includes("CONCLUÍ") || statusReal.includes("CONCLUIDO") || statusReal.includes("FINALIZADO") || statusReal.includes("DONE") || statusReal.includes("ENTREGUE");
    
    if (isConcluido) return; 

    // Bloqueia status que não estão previstos (Ex: Cancelados)
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
          nome: nomeFormatado, equipe: equipe, score: 0, projetos: 0, totalHoras: 0, projetosLista: [],
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

      const historicoStatus = [];
      if (issue.changelog && issue.changelog.histories) {
        issue.changelog.histories.forEach(historia => {
          historia.items.forEach(item => {
            if (item.field === 'status') {
              historicoStatus.push({
                data: historia.created, de: item.fromString || "Anterior", para: item.toString || "Novo"
              });
            }
          });
        });
      }
      historicoStatus.sort((a, b) => new Date(b.data) - new Date(a.data));

      carga[nomeFormatado].projetosLista.push({
        id: issue.key, 
        nome: issue.fields.summary || "Sem Título", 
        status: statusReal, 
        nivel: nivel,
        scoreProjeto: scoreTotalProjeto, 
        historico: historicoStatus, 
        ultimaAtualizacao: dataAtualizacao.toISOString() 
      });

      projetosUnicos.add(issue.key);
    }
  });

  const filaOrdenada = Object.values(carga).sort((a, b) => a.score - b.score);
  
  return {
    fila: filaOrdenada,
    totalProjetos: projetosUnicos.size,
    metricasMes: { iniciados: totalIniciadosExatos, concluidos: totalFinalizadosExatos }
  };
};

module.exports = { calcularFila };