const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const FOOTBALL_DATA_KEY = process.env.FOOTBALL_DATA_KEY;

// Funzione per ottenere l’intervallo di date dell’intero mese corrente
function getCurrentMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  // Mese corrente (0-11) + 1 per compatibilità con Date
  const month = now.getMonth() + 1; 
  const pad = n => n.toString().padStart(2, '0');
  const start = `${year}-${pad(month)}-01`;
  // Calcola l’ultimo giorno del mese corrente
  const endDay = new Date(year, month, 0).getDate();
  const end = `${year}-${pad(month)}-${pad(endDay)}`;
  return { start, end };
}

app.get('/api/matches', async (req, res) => {
  if (!FOOTBALL_DATA_KEY) {
    return res.status(500).json({ error: "Manca la variabile d'ambiente FOOTBALL_DATA_KEY" });
  }
  // Calcola date inizio/fine mese corrente
  const { start, end } = getCurrentMonthRange();
  try {
    const apiUrl = `https://api.football-data.org/v4/matches?dateFrom=${start}&dateTo=${end}`;
    const response = await axios.get(apiUrl, {
      headers: {
        'X-Auth-Token': FOOTBALL_DATA_KEY
      }
    });
    res.json(response.data.matches || []);
  } catch (error) {
    // Logga errore per debug
    console.error("Errore chiamata Football-Data:", error?.response?.data || error.message);
    res.status(500).json({ error: 'Errore nel recupero delle partite' });
  }
});

app.listen(PORT, () => {
  console.log(`Server backend in ascolto sulla porta ${PORT}`);
});
