const express = require('express');
const cors = require('cors');
const path = require('path');
const { calcularFila } = require('./jiraService.js'); 

const app = express();
app.use(cors());

const distPath = path.join(__dirname, 'dist');
console.log("-> Servindo arquivos da Pasta:", distPath);

app.use(express.static(distPath));

app.get('/api/dashboard', async (req, res) => {
    try {
        const resultado = await calcularFila();
        
        res.json({ 
            fila: resultado.fila || [], 
            totalProjetos: resultado.totalProjetos 
        });
    } catch (error) {
        console.error("🔥 Erro fatal na rota:", error);
        res.status(500).json({ error: 'Erro ao processar dados' });
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