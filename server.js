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

// DATABASE SQUADRE CON RANKING REALISTICO (1-10, 10 = più forte)
const teamDatabase = {
  // Premier League
  'Manchester City': { strength: 9.5, form: 9.0, homeAdvantage: 1.2 },
  'Arsenal': { strength: 8.8, form: 8.5, homeAdvantage: 1.1 },
  'Liverpool': { strength: 9.2, form: 8.7, homeAdvantage: 1.3 },
  'Chelsea': { strength: 8.0, form: 7.5, homeAdvantage: 1.0 },
  'Manchester United': { strength: 7.8, form: 7.0, homeAdvantage: 1.1 },
  'Tottenham Hotspur': { strength: 7.5, form: 7.2, homeAdvantage: 1.0 },
  'Newcastle United': { strength: 7.2, form: 7.8, homeAdvantage: 1.1 },
  
  // La Liga
  'Real Madrid': { strength: 9.7, form: 9.2, homeAdvantage: 1.2 },
  'FC Barcelona': { strength: 9.0, form: 8.8, homeAdvantage: 1.2 },
  'Atlético de Madrid': { strength: 8.2, form: 7.9, homeAdvantage: 1.1 },
  'Real Sociedad': { strength: 7.0, form: 7.5, homeAdvantage: 1.0 },
  
  // Serie A
  'Juventus': { strength: 8.0, form: 7.8, homeAdvantage: 1.1 },
  'AC Milan': { strength: 8.2, form: 8.0, homeAdvantage: 1.2 },
  'Inter Milan': { strength: 8.5, form: 8.3, homeAdvantage: 1.1 },
  'SSC Napoli': { strength: 8.3, form: 7.9, homeAdvantage: 1.1 },
  'AS Roma': { strength: 7.5, form: 7.2, homeAdvantage: 1.0 },
  'SS Lazio': { strength: 7.3, form: 7.0, homeAdvantage: 1.0 },
  
  // Bundesliga
  'FC Bayern München': { strength: 9.3, form: 8.9, homeAdvantage: 1.2 },
  'Borussia Dortmund': { strength: 8.1, form: 8.0, homeAdvantage: 1.1 },
  'RB Leipzig': { strength: 7.8, form: 7.5, homeAdvantage: 1.0 },
  'Bayer 04 Leverkusen': { strength: 7.6, form: 8.2, homeAdvantage: 1.0 },
  
  // Ligue 1
  'Paris Saint-Germain': { strength: 9.1, form: 8.8, homeAdvantage: 1.1 },
  'AS Monaco': { strength: 7.4, form: 7.6, homeAdvantage: 1.0 },
  'Olympique de Marseille': { strength: 7.2, form: 7.0, homeAdvantage: 1.1 },
  
  // Default per squadre non in database
  'default': { strength: 6.0, form: 6.0, homeAdvantage: 1.0 }
};

// ALGORITMO AI AVANZATO PER PRONOSTICI
function generaPronosticoIntelligente(match) {
  const homeTeam = match.homeTeam.name;
  const awayTeam = match.awayTeam.name;
  
  // Ottieni dati squadre (usa default se non trovate)
  const homeData = teamDatabase[homeTeam] || teamDatabase['default'];
  const awayData = teamDatabase[awayTeam] || teamDatabase['default'];
  
  // Calcola forza effettiva (considera vantaggio casa)
  const homeEffectiveStrength = (homeData.strength + homeData.form) * homeData.homeAdvantage;
  const awayEffectiveStrength = (awayData.strength + awayData.form);
  
  // Calcola differenza di forza
  const strengthDiff = homeEffectiveStrength - awayEffectiveStrength;
  
  let pronostico = 'X';
  let confidenza = 50;
  let reasoning = '';
  
  // Logica decisionale avanzata
  if (strengthDiff > 2.5) {
    pronostico = '1';
    confidenza = Math.min(85, 65 + Math.floor(strengthDiff * 8));
    reasoning = `${homeTeam} nettamente superiore. Vantaggio casa decisivo`;
  } else if (strengthDiff > 1.5) {
    pronostico = '1';
    confidenza = Math.min(78, 62 + Math.floor(strengthDiff * 6));
    reasoning = `${homeTeam} favorita per qualità tecnica e fattore campo`;
  } else if (strengthDiff > 0.8) {
    pronostico = Math.random() > 0.25 ? '1' : 'X';
    confidenza = Math.min(72, 58 + Math.floor(strengthDiff * 5));
    reasoning = `Leggero vantaggio ${homeTeam}. Possibile pareggio`;
  } else if (strengthDiff < -2.5) {
    pronostico = '2';
    confidenza = Math.min(83, 68 + Math.floor(Math.abs(strengthDiff) * 7));
    reasoning = `${awayTeam} molto più forte. Supera lo svantaggio trasferta`;
  } else if (strengthDiff < -1.5) {
    pronostico = '2';
    confidenza = Math.min(76, 63 + Math.floor(Math.abs(strengthDiff) * 5));
    reasoning = `${awayTeam} superiore tecnicamente nonostante la trasferta`;
  } else if (strengthDiff < -0.8) {
    pronostico = Math.random() > 0.3 ? '2' : 'X';
    confidenza = Math.min(70, 59 + Math.floor(Math.abs(strengthDiff) * 4));
    reasoning = `${awayTeam} leggermente favorita. Pareggio probabile`;
  } else {
    // Partita equilibrata - varie opzioni
    const random = Math.random();
    if (random > 0.55) {
      pronostico = '1';
      reasoning = `Partita equilibrata, ma il fattore campo può decidere`;
    } else if (random > 0.25) {
      pronostico = 'X';
      reasoning = `Scontro equilibrato. Pareggio il risultato più probabile`;
    } else {
      pronostico = '2';
      reasoning = `Match equilibrato, ma ${awayTeam} può sorprendere`;
    }
    confidenza = 52 + Math.floor(Math.random() * 16); // 52-67%
  }
  
  // Aggiungi variabilità basata sulla competizione
  if (match.competition?.name?.includes('Champions') || match.competition?.name?.includes('Europa')) {
    confidenza = Math.max(45, confidenza - 8);
    reasoning += ` (Competizione europea: più imprevedibilità)`;
  }
  
  return {
    pronostico,
    confidenza,
    reasoning,
    homeTeam,
    awayTeam,
    homeStrength: homeData.strength,
    awayStrength: awayData.strength
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

    // Genera pronostici AI avanzati per ogni partita
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
