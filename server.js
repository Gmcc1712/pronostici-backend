const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const FOOTBALL_DATA_KEY = process.env.FOOTBALL_DATA_KEY;

// Cache per le classifiche (evita troppe chiamate API)
let standingsCache = {};
const CACHE_DURATION = 3600000; // 1 ora

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

// RECUPERA CLASSIFICA REALE DA API
async function getStandings(competitionId) {
  const cacheKey = `standings_${competitionId}`;
  const now = Date.now();
  
  // Controlla cache
  if (standingsCache[cacheKey] && (now - standingsCache[cacheKey].timestamp) < CACHE_DURATION) {
    return standingsCache[cacheKey].data;
  }
  
  try {
    const response = await axios.get(`https://api.football-data.org/v4/competitions/${competitionId}/standings`, {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY }
    });
    
    const standings = response.data.standings[0]?.table || [];
    
    // Salva in cache
    standingsCache[cacheKey] = {
      data: standings,
      timestamp: now
    };
    
    return standings;
  } catch (error) {
    console.error(`Errore recupero classifica ${competitionId}:`, error.message);
    return [];
  }
}

// CALCOLA FORZA SQUADRA BASATA SU DATI REALI
function calculateTeamStrength(teamStats) {
  if (!teamStats) return { strength: 5.0, form: 5.0, homeAdvantage: 1.0 };
  
  const totalTeams = 20; // Assumiamo leghe a 20 squadre (media)
  const position = teamStats.position;
  const points = teamStats.points;
  const goalDifference = teamStats.goalDifference;
  const goalsFor = teamStats.goalsFor;
  const goalsAgainst = teamStats.goalsAgainst;
  const wins = teamStats.won;
  const draws = teamStats.draw;
  const losses = teamStats.lost;
  const gamesPlayed = wins + draws + losses;
  
  // Calcola forza basata su posizione (10 = primo, 1 = ultimo)
  const positionStrength = Math.max(1, 10 - ((position - 1) / (totalTeams - 1)) * 9);
  
  // Calcola forma basata su punti per partita
  const pointsPerGame = gamesPlayed > 0 ? points / gamesPlayed : 1;
  const formStrength = Math.min(10, Math.max(1, pointsPerGame * 3.33)); // 3 punti = 10, 0 punti = 1
  
  // Calcola efficacia offensiva e difensiva
  const avgGoalsFor = gamesPlayed > 0 ? goalsFor / gamesPlayed : 1;
  const avgGoalsAgainst = gamesPlayed > 0 ? goalsAgainst / gamesPlayed : 1;
  
  // Bonus/malus per differenza reti
  const goalDiffBonus = Math.max(-2, Math.min(2, goalDifference / 10));
  
  // Calcola vantaggio casa basato su posizione (squadre forti hanno più vantaggio casa)
  const homeAdvantage = 1.0 + (positionStrength / 50); // Da 1.02 a 1.2
  
  const finalStrength = Math.min(10, Math.max(1, positionStrength + goalDiffBonus));
  const finalForm = Math.min(10, Math.max(1, formStrength));
  
  return {
    strength: Math.round(finalStrength * 10) / 10,
    form: Math.round(finalForm * 10) / 10,
    homeAdvantage: Math.round(homeAdvantage * 100) / 100,
    stats: {
      position,
      points,
      goalDifference,
      goalsFor,
      goalsAgainst,
      pointsPerGame: Math.round(pointsPerGame * 100) / 100
    }
  };
}

// TROVA DATI SQUADRA NELLA CLASSIFICA
async function getTeamData(teamName, competitionId) {
  try {
    const standings = await getStandings(competitionId);
    const teamStats = standings.find(team => 
      team.team.name === teamName || 
      team.team.shortName === teamName ||
      team.team.name.includes(teamName.split(' ')[0])
    );
    
    return calculateTeamStrength(teamStats);
  } catch (error) {
    console.error(`Errore recupero dati per ${teamName}:`, error.message);
    // Fallback con valori default
    return { strength: 5.0, form: 5.0, homeAdvantage: 1.0 };
  }
}

// ALGORITMO AI CON DATI REALI
async function generaPronosticoIntelligente(match) {
  const homeTeam = match.homeTeam.name;
  const awayTeam = match.awayTeam.name;
  const competitionId = match.competition.id;
  
  // Recupera dati reali delle squadre
  const homeData = await getTeamData(homeTeam, competitionId);
  const awayData = await getTeamData(awayTeam, competitionId);
  
  // Calcola forza effettiva
  const homeEffectiveStrength = (homeData.strength + homeData.form) * homeData.homeAdvantage;
  const awayEffectiveStrength = (awayData.strength + awayData.form);
  
  const strengthDiff = homeEffectiveStrength - awayEffectiveStrength;
  
  let pronostico = 'X';
  let confidenza = 50;
  let reasoning = '';
  
  // Logica decisionale avanzata con dati reali
  if (strengthDiff > 3.0) {
    pronostico = '1';
    confidenza = Math.min(88, 70 + Math.floor(strengthDiff * 6));
    reasoning = `${homeTeam} domina la classifica (${homeData.stats?.position}° vs ${awayData.stats?.position}°). Vantaggio netto`;
  } else if (strengthDiff > 2.0) {
    pronostico = '1';
    confidenza = Math.min(82, 66 + Math.floor(strengthDiff * 5));
    reasoning = `${homeTeam} in posizione migliore (${homeData.stats?.position}° vs ${awayData.stats?.position}°). Fattore campo decisivo`;
  } else if (strengthDiff > 1.0) {
    pronostico = Math.random() > 0.2 ? '1' : 'X';
    confidenza = Math.min(75, 62 + Math.floor(strengthDiff * 4));
    reasoning = `Leggero vantaggio ${homeTeam} secondo classifica. Possibile sorpresa`;
  } else if (strengthDiff < -3.0) {
    pronostico = '2';
    confidenza = Math.min(85, 68 + Math.floor(Math.abs(strengthDiff) * 5));
    reasoning = `${awayTeam} molto superiore in classifica. Supera lo svantaggio trasferta`;
  } else if (strengthDiff < -2.0) {
    pronostico = '2';
    confidenza = Math.min(78, 64 + Math.floor(Math.abs(strengthDiff) * 4));
    reasoning = `${awayTeam} in posizione migliore (${awayData.stats?.position}° vs ${homeData.stats?.position}°)`;
  } else if (strengthDiff < -1.0) {
    pronostico = Math.random() > 0.25 ? '2' : 'X';
    confidenza = Math.min(72, 60 + Math.floor(Math.abs(strengthDiff) * 3));
    reasoning = `${awayTeam} favorita dalla classifica, ma trasferta complicata`;
  } else {
    // Partita molto equilibrata
    const random = Math.random();
    if (random > 0.5) {
      pronostico = '1';
      reasoning = `Squadre vicine in classifica. Fattore campo può decidere`;
    } else if (random > 0.2) {
      pronostico = 'X';
      reasoning = `Posizioni simili in classifica. Pareggio probabile`;
    } else {
      pronostico = '2';
      reasoning = `Match equilibrato secondo le statistiche`;
    }
    confidenza = 55 + Math.floor(Math.random() * 12); // 55-66%
  }
  
  return {
    pronostico,
    confidenza,
    reasoning,
    homeTeam,
    awayTeam,
    homeStats: homeData.stats,
    awayStats: awayData.stats,
    realData: true
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

    // Genera pronostici con dati reali (limitiamo a 10 per evitare troppe chiamate API)
    const limitedMatches = allMatches.slice(0, 10);
    const matchesConPronostici = [];

    for (const match of limitedMatches) {
      const aiPronostico = await generaPronosticoIntelligente(match);
      matchesConPronostici.push({
        ...match,
        aiPronostico
      });
    }

    res.json(matchesConPronostici);

  } catch (error) {
    console.error("Errore chiamata Football-Data:", error?.response?.data || error.message);
    res.status(500).json({ error: 'Errore nel recupero delle partite' });
  }
});

app.listen(PORT, () => {
  console.log(`Server backend in ascolto sulla porta ${PORT} - AI con dati reali attivata`);
});
