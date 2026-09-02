const express = require('express');
const cors = require('cors');
const path = require('path');
const { calcularFila } = require('./jiraService.js'); 

const app = express();
app.use(cors());

const distPath = path.join(__dirname, 'dist');
console.log("-> Servindo arquivos da Pasta:", distPath);

app.use(express.static(distPath));

app.get("/api/dashboard", async (req, res) => {
  try {
    const resultado = await calcularFila();
    
    // 1. A MÁGICA: Cria uma fila secundária removendo você do sorteio
    const consultoresElegiveis = resultado.fila.filter(
      (c) => c.nome !== "Bruno Gabriel Rodrigues"
    );
    
    // 2. Define o "Próximo" pegando o primeiro da fila de elegíveis
    const proximo = consultoresElegiveis.length > 0 ? consultoresElegiveis[0] : null;

    res.json({
      fila: resultado.fila, // Você continua aparecendo na tabela geral
      proximo: proximo,     // Mas o Card de Destaque (Próximo) pula você!
      totalProjetos: resultado.totalProjetos,
    });
  } catch (error) {
    console.error("🔥 ERRO FATAL NO BACKEND:", error);
    res.status(500).json({ error: "Erro ao buscar dados" });
  }
});


app.use((req, res) => {
    // Radar 2: Mostra no terminal qual rota o navegador tentou acessar
    console.log("-> Navegador pediu a rota:", req.originalUrl);
    
    res.sendFile(path.join(distPath, 'index.html'), (err) => {
        if (err) {
            console.error("-> ERRO: Não consegui entregar o index.html. Detalhes:", err.message);
            res.status(500).send("O arquivo index.html não foi encontrado na pasta dist.");
        }
    });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`-> Servidor rodando na porta ${PORT}`));