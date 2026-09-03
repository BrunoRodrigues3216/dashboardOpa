require('dotenv').config();

// 1. LISTA DE STATUS PERMITIDOS
const STATUS_PERMITIDOS = [
  "KICKOFF",
  "TREINAMENTO",
  "ATIVAÇÃO DE CANAIS",
  "GO-LIVE",
  "TELEFONIA",
  "ACOMPANHAMENTO"
];

// 2. PONTUAÇÃO (PESOS) DOS STATUS
const PESOS = {
  "KICKOFF": 5,
  "TREINAMENTO": 4,
  "ATIVAÇÃO DE CANAIS": 3,
  "TELEFONIA": 2,
  "GO-LIVE": 1,
  "ACOMPANHAMENTO": 1
};

// 3. EQUIPE DO DASHBOARD (FILTRO EXCLUSIVO)
const CONSULTORES_PERMITIDOS = [
  "Luís Felipe de Carvalho Smidt",
  "Bruno Gabriel Rodrigues",
  "Warley Rubas",
  "João Silva",
  "Diogo Basílio",
  "Luis Felipe Flores",
  "Alice Loreiro"
];

const getJiraData = async () => {
  const jql = `statusCategory != Done`;
  const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
  
  let todasAsTarefas = []; 
  let startAt = 0;         
  const maxResults = 100;  
  let temMais = true;      

  console.log("-> Iniciando busca no Jira. Aguarde...");

  while (temMais) {
    const url = `https://${process.env.JIRA_DOMAIN}.atlassian.net/rest/agile/1.0/board/${process.env.JIRA_BOARD_ID}/issue?jql=${encodeURIComponent(jql)}&startAt=${startAt}&maxResults=${maxResults}`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Basic ${auth}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
      });

      if (!response.ok) {
        throw new Error(`Erro API Jira: ${response.status} - ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.issues && data.issues.length > 0) {
        todasAsTarefas = todasAsTarefas.concat(data.issues);
        console.log(`-> Puxou ${data.issues.length} tarefas (Total até agora: ${todasAsTarefas.length} de ${data.total})`);
        
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
  
  console.log("-> Busca concluída! Total final:", todasAsTarefas.length);
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

    // Filtra pelo Status
    if (!STATUS_PERMITIDOS.includes(statusReal)) return;

    const assignee = issue.fields.assignee;

    if (assignee) {
      const nomeJira = assignee.displayName || assignee.emailAddress || "";

      // A MÁGICA DO FILTRO: Verifica se o consultor da tarefa está na nossa lista VIP
      const consultorValido = CONSULTORES_PERMITIDOS.find(nomeLista => 
        nomeJira.toLowerCase().includes(nomeLista.toLowerCase())
      );

      // Se não for um dos nossos consultores permitidos, a gente ignora a tarefa
      if (!consultorValido) return;

      // Usamos o nome exatamente como você escreveu na lista para o painel ficar padronizado
      const nomeResponsavel = consultorValido;

      if (!carga[nomeResponsavel]) {
        carga[nomeResponsavel] = {
          nome: nomeResponsavel,
          score: 0,
          projetos: 0,
          totalHoras: 0,
          projetosLista: [],
        };
      }

      carga[nomeResponsavel].score += PESOS[statusReal] || 0;
      carga[nomeResponsavel].projetos += 1;

      const idCampoHoras = process.env.JIRA_CUSTOM_FIELD_HORAS; 
      const valorHoras = idCampoHoras && issue.fields[idCampoHoras] ? issue.fields[idCampoHoras] : 0;
      const horasConvertidas = parseFloat(valorHoras) || 0;

      carga[nomeResponsavel].totalHoras += horasConvertidas;

      carga[nomeResponsavel].projetosLista.push({
        id: issue.key,
        nome: issue.fields.summary || "Sem Título",
        status: statusReal,
        horas: horasConvertidas
      });

      projetosUnicos.add(issue.key);
    }
  });

  const filaOrdenada = Object.values(carga).sort((a, b) => a.score - b.score);

  console.log("\n=== CÁLCULO DE CARGA ATUALIZADO (JIRA) ===");
  filaOrdenada.forEach((c) => {
    console.log(`[Score: ${c.score.toString().padStart(3, " ")}] - Consultor: ${c.nome} | Projetos Ativos: ${c.projetos}`);
  });
  console.log("==========================================\n");

  return {
    fila: filaOrdenada,
    totalProjetos: projetosUnicos.size,
  };
};

module.exports = { calcularFila };
