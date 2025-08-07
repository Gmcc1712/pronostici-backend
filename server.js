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
  const month = now.getMonth() + 1;

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

    currentStart = new Date(currentEnd);
    currentStart.setDate(currentStart.getDate() + 1);
  }

  return chunks;
}

// FUNZIONE IA PER GENERARE PRONOSTICI INTELLIGENTI
function generaPronosticoIntelligente(match) {
  const homeTeam = match.homeTeam.name;
  const awayTeam = match.awayTeam.name;
  
  // Squadre forti (logic semplificata - puoi espandere con dati reali)
  const squadreForti = [
    'Manchester City', 'Arsenal', 'Liverpool', 'Chelsea', 'Manchester United', 'Tottenham',
    'Real Madrid', 'Barcelona', 'Atlético Madrid', 'Athletic Club',
    'Bayern Munich', 'Borussia Dortmund', 'RB Leipzig',
    'Paris Saint-Germain', 'AS Monaco', 'Olympique Lyonnais',
    'Juventus', 'AC Milan', 'Inter', 'Napoli', 'AS Roma', 'Lazio',
    'Ajax', 'PSV', 'Feyenoord'
  ];

  const homeStrong = squadreForti.includes(homeTeam);
  const awayStrong = squadreForti.includes(awayTeam);
  
  let pronostico = 'X'; // Default pareggio
  let confidenza = 50;
  let reasoning = '';

  // Logica di decisione
  if (homeStrong && !awayStrong) {
    pronostico = '1';
    confidenza = 75;
    reasoning = `${homeTeam} è favorita in casa contro ${awayTeam}`;
  } else if (!homeStrong && awayStrong) {
    pronostico = '2'; 
    confidenza = 70;
    reasoning = `${awayTeam} ha maggiore qualità tecnica`;
  } else if (homeStrong && awayStrong) {
    // Vantaggio casa tra due squadre forti
    pronostico = Math.random() > 0.4 ? '1' : 'X';
    confidenza = 60;
    reasoning = `Scontro equilibrato, leggero vantaggio casa`;
  } else {
    // Due squadre non top: più imprevedibile
    const random = Math.random();
    if (random > 0.6) pronostico = '1';
    else if (random > 0.3) pronostico = 'X';
    else pronostico = '2';
    confidenza = 55;
    reasoning = `Partita equilibrata, risultato incerto`;
  }

  return {
    pronostico,
    confidenza,
    reasoning,
    homeTeam,
    awayTeam
  };
}

app.get('/api/matches', async (req, res) => {
  if (!FOOTBALL_DATA_KEY) {
    return res.status(500).json({ error: "Manca la variabile d'ambiente FOOTBALL_DATA_KEY" });
  }

  const { start, end } = getCurrentMonthRange();
  const dateRanges = splitDateRangeIntoChunks(start, end, 10);

  try {
    const allMatches = [];

    for (const range of dateRanges) {
      const url = `https://api.football-data.org/v4/matches?dateFrom=${range.from}&dateTo=${range.to}`;
      const response = await axios.get(url, {
        headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY }
      });

      if (Array.isArray(response.data.matches)) {
        allMatches.push(...response.data.matches);
      }
    }

    // GENERA PRONOSTICI AUTOMATICI PER OGNI PARTITA
    const matchesConPronostici = allMatches.map(match => ({
      ...match,
      aiPronostico: generaPronosticoIntelligente(match)
    }));

    res.json(matchesConPronostici);

  } catch (error) {
    console.error("Errore chiamata Football-Data:", error?.response?.data || error.message);
    res.status(500).json({ error: 'Errore nel recupero delle partite' });
  }
});

app.listen(PORT, () => {
  console.log(`Server backend in ascolto sulla porta ${PORT}`);
});
