const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const FOOTBALL_DATA_KEY = process.env.FOOTBALL_DATA_KEY;

// Cache per le classifiche
let standingsCache = {};
const CACHE_DURATION = 3600000; // 1 ora

// Funzione helper per formattare data in YYYY-MM-DD
function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

// Funzione per ottenere range futuro (da oggi + 30 giorni)
function getFutureRange() {
  const today = new Date();
  today.setDate(today.getDate() + 1); // Partite di domani in avanti
  const start = formatDate(today);
  
  const futureDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const end = formatDate(futureDate);
  
  console.log(`🗓️ Cercando partite dal ${start} al ${end}`);
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

// DATABASE SQUADRE ESTESO CON VALORI REALISTICI
const teamStrengthDatabase = {
  // Premier League
  'Manchester City': { strength: 9.5, form: 9.0, attack: 8.8, defense: 8.5 },
  'Arsenal': { strength: 8.5, form: 8.2, attack: 8.0, defense: 7.8 },
  'Liverpool': { strength: 9.0, form: 8.5, attack: 8.7, defense: 8.0 },
  'Chelsea': { strength: 7.8, form: 7.0, attack: 7.5, defense: 7.2 },
  'Manchester United': { strength: 7.5, form: 6.8, attack: 7.0, defense: 7.0 },
  'Tottenham': { strength: 7.2, form: 7.0, attack: 7.5, defense: 6.5 },
  'Newcastle United': { strength: 7.0, form: 7.5, attack: 6.8, defense: 7.2 },
  'Aston Villa': { strength: 6.8, form: 7.0, attack: 6.5, defense: 6.8 },
  'West Ham United': { strength: 6.2, form: 6.0, attack: 6.0, defense: 6.2 },
  'Brighton & Hove Albion': { strength: 6.5, form: 6.8, attack: 6.2, defense: 6.5 },
  
  // La Liga
  'Real Madrid': { strength: 9.8, form: 9.5, attack: 9.2, defense: 8.5 },
  'FC Barcelona': { strength: 8.8, form: 8.0, attack: 8.5, defense: 7.8 },
  'Atlético Madrid': { strength: 8.0, form: 7.5, attack: 7.0, defense: 8.5 },
  'Real Sociedad': { strength: 7.0, form: 7.2, attack: 6.8, defense: 7.0 },
  'Real Betis': { strength: 6.8, form: 6.5, attack: 6.5, defense: 6.8 },
  'Villarreal': { strength: 7.2, form: 7.0, attack: 7.0, defense: 7.0 },
  
  // Serie A
  'Juventus': { strength: 8.0, form: 7.5, attack: 7.2, defense: 8.2 },
  'AC Milan': { strength: 8.2, form: 8.0, attack: 7.8, defense: 7.5 },
  'Inter Milan': { strength: 8.5, form: 8.2, attack: 8.0, defense: 8.0 },
  'SSC Napoli': { strength: 8.0, form: 7.2, attack: 7.5, defense: 7.8 },
  'AS Roma': { strength: 7.2, form: 6.8, attack: 6.8, defense: 7.0 },
  'SS Lazio': { strength: 7.0, form: 7.0, attack: 7.2, defense: 6.8 },
  'Atalanta': { strength: 7.5, form: 7.8, attack: 8.2, defense: 6.8 },
  
  // Bundesliga
  'FC Bayern München': { strength: 9.2, form: 8.8, attack: 9.0, defense: 8.0 },
  'Borussia Dortmund': { strength: 8.0, form: 7.5, attack: 8.2, defense: 7.0 },
  'RB Leipzig': { strength: 7.5, form: 7.8, attack: 7.2, defense: 7.8 },
  'Bayer Leverkusen': { strength: 7.8, form: 8.5, attack: 8.0, defense: 7.2 },
  
  // Ligue 1
  'Paris Saint-Germain': { strength: 9.0, form: 8.5, attack: 9.2, defense: 7.5 },
  'AS Monaco': { strength: 7.0, form: 7.2, attack: 7.5, defense: 6.8 },
  'Olympique de Marseille': { strength: 6.8, form: 6.5, attack: 6.5, defense: 6.8 },
};

// FUNZIONE PER OTTENERE DATI SQUADRA (con fallback intelligente)
function getTeamData(teamName) {
  // Cerca nel database
  let teamData = teamStrengthDatabase[teamName];
  
  if (!teamData) {
    // Cerca con nomi parziali
    const searchName = teamName.toLowerCase();
    for (const [dbName, data] of Object.entries(teamStrengthDatabase)) {
      if (dbName.toLowerCase().includes(searchName.split(' ')[0].toLowerCase()) ||
          searchName.includes(dbName.toLowerCase().split(' ')[0])) {
        teamData = data;
        console.log(`🔍 Trovata squadra simile: ${teamName} -> ${dbName}`);
        break;
      }
    }
  }
  
  // Se ancora non trovata, usa valori casuali realistici
  if (!teamData) {
    const randomStrength = 5.0 + Math.random() * 4.0; // Da 5.0 a 9.0
    teamData = {
      strength: Math.round(randomStrength * 10) / 10,
      form: Math.round((5.0 + Math.random() * 4.0) * 10) / 10,
      attack: Math.round((5.0 + Math.random() * 4.0) * 10) / 10,
      defense: Math.round((5.0 + Math.random() * 4.0) * 10) / 10
    };
    console.log(`⚡ Generati dati casuali per ${teamName}:`, teamData);
  }
  
  return teamData;
}

// ALGORITMO AI CON VARIETÀ GARANTITA
function generaPronosticoVariegato(match, matchIndex) {
  const homeTeam = match.homeTeam.name;
  const awayTeam = match.awayTeam.name;
  
  console.log(`🤖 Generando pronostico per: ${homeTeam} vs ${awayTeam}`);
  
  const homeData = getTeamData(homeTeam);
  const awayData = getTeamData(awayTeam);
  
  // Calcola forze effettive con vantaggio casa
  const homeAdvantage = 1.15; // 15% vantaggio casa
  const homeScore = (homeData.strength + homeData.form) * homeAdvantage;
  const awayScore = awayData.strength + awayData.form;
  const strengthDiff = homeScore - awayScore;
  
  // Calcola probabilità base per 1-X-2
  let prob1, probX, prob2;
  
  if (strengthDiff > 3.5) {
    prob1 = 70 + Math.random() * 15; // 70-85%
    prob2 = 5 + Math.random() * 10;  // 5-15%
    probX = 100 - prob1 - prob2;
  } else if (strengthDiff > 2.0) {
    prob1 = 55 + Math.random() * 15; // 55-70%
    prob2 = 10 + Math.random() * 15; // 10-25%
    probX = 100 - prob1 - prob2;
  } else if (strengthDiff > 0.5) {
    prob1 = 40 + Math.random() * 15; // 40-55%
    prob2 = 20 + Math.random() * 15; // 20-35%
    probX = 100 - prob1 - prob2;
  } else if (strengthDiff < -3.5) {
    prob2 = 70 + Math.random() * 15; // 70-85%
    prob1 = 5 + Math.random() * 10;  // 5-15%
    probX = 100 - prob1 - prob2;
  } else if (strengthDiff < -2.0) {
    prob2 = 55 + Math.random() * 15; // 55-70%
    prob1 = 10 + Math.random() * 15; // 10-25%
    probX = 100 - prob1 - prob2;
  } else if (strengthDiff < -0.5) {
    prob2 = 40 + Math.random() * 15; // 40-55%
    prob1 = 20 + Math.random() * 15; // 20-35%
    probX = 100 - prob1 - prob2;
  } else {
    // Partita equilibrata - più casualità
    prob1 = 30 + Math.random() * 20; // 30-50%
    prob2 = 25 + Math.random() * 20; // 25-45%
    probX = 100 - prob1 - prob2;
  }
  
  // Arrotonda le probabilità
  prob1 = Math.round(prob1);
  prob2 = Math.round(prob2);
  probX = Math.round(probX);
  
  // CALCOLA ALTRI MERCATI
  const prob1X = prob1 + probX;
  const probX2 = probX + prob2;
  const prob12 = prob1 + prob2;
  
  // Under/Over basato su attacchi
  const avgGoals = (homeData.attack + awayData.attack) / 2;
  const goalVariation = Math.random() * 0.8 + 0.6; // 0.6-1.4
  const expectedGoals = avgGoals * goalVariation;
  
  const probOver05 = expectedGoals > 1.0 ? 80 + Math.random() * 15 : 60 + Math.random() * 20;
  const probOver15 = expectedGoals > 1.8 ? 70 + Math.random() * 15 : 40 + Math.random() * 20;
  const probOver25 = expectedGoals > 2.5 ? 60 + Math.random() * 15 : 25 + Math.random() * 20;
  const probOver35 = expectedGoals > 3.2 ? 50 + Math.random() * 15 : 15 + Math.random() * 15;
  
  // Goal/No Goal
  const bothAttack = (homeData.attack + awayData.attack) / 2;
  const probGoal = bothAttack > 7.0 ? 70 + Math.random() * 15 : 45 + Math.random() * 25;
  
  // TUTTI I PRONOSTICI
  const tuttiPronostici = [
    { tipo: '1 (Vittoria Casa)', codice: '1', probabilita: Math.round(prob1), mercato: '1X2' },
    { tipo: 'X (Pareggio)', codice: 'X', probabilita: Math.round(probX), mercato: '1X2' },
    { tipo: '2 (Vittoria Trasferta)', codice: '2', probabilita: Math.round(prob2), mercato: '1X2' },
    { tipo: '1X (Casa o Pareggio)', codice: '1X', probabilita: Math.round(prob1X), mercato: 'Doppia Chance' },
    { tipo: 'X2 (Pareggio o Trasferta)', codice: 'X2', probabilita: Math.round(probX2), mercato: 'Doppia Chance' },
    { tipo: '12 (Casa o Trasferta)', codice: '12', probabilita: Math.round(prob12), mercato: 'Doppia Chance' },
    { tipo: 'Over 0.5 Gol', codice: 'O0.5', probabilita: Math.round(probOver05), mercato: 'Under/Over' },
    { tipo: 'Under 0.5 Gol', codice: 'U0.5', probabilita: Math.round(100 - probOver05), mercato: 'Under/Over' },
    { tipo: 'Over 1.5 Gol', codice: 'O1.5', probabilita: Math.round(probOver15), mercato: 'Under/Over' },
    { tipo: 'Under 1.5 Gol', codice: 'U1.5', probabilita: Math.round(100 - probOver15), mercato: 'Under/Over' },
    { tipo: 'Over 2.5 Gol', codice: 'O2.5', probabilita: Math.round(probOver25), mercato: 'Under/Over' },
    { tipo: 'Under 2.5 Gol', codice: 'U2.5', probabilita: Math.round(100 - probOver25), mercato: 'Under/Over' },
    { tipo: 'Over 3.5 Gol', codice: 'O3.5', probabilita: Math.round(probOver35), mercato: 'Under/Over' },
    { tipo: 'Under 3.5 Gol', codice: 'U3.5', probabilita: Math.round(100 - probOver35), mercato: 'Under/Over' },
    { tipo: 'Goal (Entrambe Segnano)', codice: 'GG', probabilita: Math.round(probGoal), mercato: 'Goal/No Goal' },
    { tipo: 'No Goal (Non Entrambe)', codice: 'NG', probabilita: Math.round(100 - probGoal), mercato: 'Goal/No Goal' }
  ];
  
  // TROVA MIGLIOR PRONOSTICO
  const pronosticoMigliore = tuttiPronostici.reduce((max, current) => 
    current.probabilita > max.probabilita ? current : max
  );
  
  // REASONING PERSONALIZZATO
  let reasoning = '';
  if (strengthDiff > 2.0) {
    reasoning = `${homeTeam} molto più forte (${homeData.strength}/10 vs ${awayData.strength}/10). Vantaggio casa decisivo`;
  } else if (strengthDiff < -2.0) {
    reasoning = `${awayTeam} superiore (${awayData.strength}/10 vs ${homeData.strength}/10). Supera lo svantaggio trasferta`;
  } else {
    reasoning = `Partita equilibrata. ${homeTeam}: ${homeData.strength}/10, ${awayTeam}: ${awayData.strength}/10. ${pronosticoMigliore.mercato} consigliato`;
  }
  
  console.log(`✅ ${homeTeam} vs ${awayTeam}: ${pronosticoMigliore.tipo} (${pronosticoMigliore.probabilita}%)`);
  
  return {
    pronosticoMigliore,
    tuttiPronostici,
    reasoning,
    confidenza: pronosticoMigliore.probabilita,
    datiStatistici: {
      expectedGoals: Math.round(expectedGoals * 100) / 100,
      homeStrength: homeData.strength,
      awayStrength: awayData.strength,
      homeAttack: homeData.attack,
      awayAttack: awayData.attack
    }
  };
}

app.get('/api/matches', async (req, res) => {
  if (!FOOTBALL_DATA_KEY) {
    return res.status(500).json({ error: "Manca la variabile d'ambiente FOOTBALL_DATA_KEY" });
  }

  const { start, end } = getFutureRange();
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

    // Limita a 12 partite (aumentato da 8) e genera pronostici variati
    const limitedMatches = allMatches.slice(0, 12);
    const matchesConPronostici = limitedMatches.map((match, index) => ({
      ...match,
      aiPronostico: generaPronosticoVariegato(match, index)
    }));

    console.log(`✅ Invio ${matchesConPronostici.length} partite con pronostici VARIATI`);
    res.json(matchesConPronostici);

  } catch (error) {
    console.error("Errore chiamata Football-Data:", error?.response?.data || error.message);
    res.status(500).json({ error: 'Errore nel recupero delle partite' });
  }
});

app.listen(PORT, () => {
  console.log(`🤖 Server AI CON VARIETÀ GARANTITA in ascolto sulla porta ${PORT}`);
  console.log(`🎯 Ogni partita avrà pronostici DIVERSI e realistici`);
  console.log(`📊 Database: ${Object.keys(teamStrengthDatabase).length} squadre top + generazione casuale per altre`);
});
