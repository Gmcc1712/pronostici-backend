const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const FOOTBALL_DATA_KEY = process.env.FOOTBALL_DATA_KEY;

// Funzione helper per formattare data in YYYY-MM-DD
function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

// Funzione per ottenere le date di inizio e fine mese corrente
function getCurrentMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-12

  const pad = n => n.toString().padStart(2, '0');
  const start = `${year}-${pad(month)}-01`;
  const endDay = new Date(year, month, 0).getDate();
  const end = `${year}-${pad(month)}-${pad(endDay)}`;

  return { start, end };
}

// Funzione per suddividere il range in chunk di massimo 10 giorni
function splitDateRangeIntoChunks(startDateStr, endDateStr, maxChunkDays = 10) {
  const chunks = [];
  let currentStart = new Date(startDateStr);
  const endDate = new Date(endDateStr);

  while (currentStart <= endDate) {
    let currentEnd = new Date(currentStart);
    currentEnd.setDate(currentEnd.getDate() + maxChunkDays - 1);
    if (currentEnd > endDate) currentEnd = endDate;

    chunks.push({
      from: formatDate(currentStart),
      to: formatDate(currentEnd),
    });

    // Avanza al giorno dopo currentEnd
    currentStart = new Date(currentEnd);
    currentStart.setDate(currentStart.getDate() + 1);
  }

  return chunks;
}

app.get('/api/matches', async (req, res) => {
  if (!FOOTBALL_DATA_KEY) {
    return res.status(500).json({ error: "Manca la variabile d'ambiente FOOTBALL_DATA_KEY" });
  }

  const { start, end } = getCurrentMonthRange();
  const dateRanges = splitDateRangeIntoChunks(start, end, 10);

  try {
    // Effettua richieste per ogni chunk di 10 giorni e raccoglie i risultati
    const allMatches = [];

    for (const range of dateRanges) {
      const url = `https://api.football-data.org/v4/matches?dateFrom=${range.from}&dateTo=${range.to}`;
      const response = await axios.get(url, {
        headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY }
      });

      // Se ci sono partite, le aggiunge all'array totale
      if (Array.isArray(response.data.matches)) {
        allMatches.push(...response.data.matches);
      }
    }

    res.json(allMatches);

  } catch (error) {
    console.error("Errore chiamata Football-Data:", error?.response?.data || error.message);
    res.status(500).json({ error: 'Errore nel recupero delle partite' });
  }
});

app.listen(PORT, () => {
  console.log(`Server backend in ascolto sulla porta ${PORT}`);
});
