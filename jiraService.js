const express = require("express");
const cors = require("cors");
require('dotenv').config();

const CLICKUP_TOKEN = process.env.CLICKUP_API_KEY;
const LIST_ID = process.env.LIST_ID;

const app = express();
app.use(cors());

const STATUS_PERMITIDOS = [
  "EN KICKOFF",
  "EN ANALISIS META",
  "EN CAPACITACIÓN",
  "ACTIVACIÓN CANALES",
  "POST ACTIVACIÓN",
];

const PESOS = {
  "EN KICKOFF": 5,
  "EN ANALISIS META": 3,
  "EN CAPACITACIÓN": 4,
  "ACTIVACIÓN DE CANALES": 2,
  "POST ACTIVACIÓN": 1,
};

const USUARIOS_IGNORADOS = [
  "Jorthy Carvajal",
  "Larissa Elizabeth",
  "Maximiliano Azeglio",
];

const getClickUpData = async () => {
  const queryParams = new URLSearchParams({
    include_closed: "false",
  }).toString();

  const url = `https://api.clickup.com/api/v2/list/${LIST_ID}/task?${queryParams}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: CLICKUP_TOKEN,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Erro na API do ClickUp: ${response.status} - ${response.statusText}`,
      );
    }

    const data = await response.json();
    return data.tasks || [];
  } catch (error) {
    console.error("Erro na requisição do ClickUp:", error);
    return [];
  }
};

const calcularFila = async () => {
  const tasks = await getClickUpData();
  const carga = {};

  const projetosUnicos = new Set();

  if (tasks.length === 0) return { fila: [], totalProjetos: 0 };

  tasks.forEach((task) => {
    const statusReal = task.status.status.toUpperCase();

    if (!STATUS_PERMITIDOS.includes(statusReal)) return;

    if (task.assignees && task.assignees.length > 0) {
      let temResponsavelValido = false;

      task.assignees.forEach((assignee) => {
        const nomeResponsavel = assignee.username;

        if (USUARIOS_IGNORADOS.includes(nomeResponsavel)) return;

        temResponsavelValido = true;

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

        const campoHoras = task.custom_fields?.find(
          campo => campo.name === 'Cantidad de horas' || campo.name === 'Cantidau de horas'
        );

        const horasConvertidas = campoHoras && campoHoras.value ? parseFloat(campoHoras.value) : 0;

        carga[nomeResponsavel].totalHoras += horasConvertidas;

        carga[nomeResponsavel].projetosLista.push({
          id: task.id,
          nome: task.name,
          status: statusReal,
          horas: horasConvertidas
        });
      });

      if (temResponsavelValido) {
        projetosUnicos.add(task.id);
      }
    }
  });

  const filaOrdenada = Object.values(carga).sort((a, b) => a.score - b.score);

  console.log("\n=== CÁLCULO DE CARGA ATUALIZADO ===");
  filaOrdenada.forEach((c) => {
    console.log(
      `[Score: ${c.score.toString().padStart(3, " ")}] - Consultor: ${c.nome} | Projetos Ativos: ${c.projetos}`,
    );
  });
  console.log("===================================\n");

  return {
    fila: filaOrdenada,
    totalProjetos: projetosUnicos.size,
  };
};

app.get("/api/dashboard", async (req, res) => {
  try {
    const resultado = await calcularFila();
    res.json({
      fila: resultado.fila,
      proximo: resultado.fila[0] || null,
      totalProjetos: resultado.totalProjetos,
    });
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar dados" });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
