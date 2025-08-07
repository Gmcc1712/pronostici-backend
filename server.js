const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const FOOTBALL_DATA_KEY = process.env.FOOTBALL_DATA_KEY;

// Funzione helper per formattare data in YYYY-MM-DD (MIGLIORATA)
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// FUNZIONE MIGLIORATA: Partite per data con gestione robusta
async function getMatchesByDate(targetDate = null) {
  let dateString;
  
  if (targetDate) {
    // Valida il formato della data ricevuta
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      console.error(`❌ Formato data non valido: ${targetDate}`);
      return [];
    }
    dateString = targetDate;
    console.log(`📅 Utente ha selezionato: ${dateString}`);
  } else {
    // Usa oggi
    const today = new Date();
    dateString = formatDate(today);
    console.log(`📅 Nessuna data specificata, uso oggi: ${dateString}`);
  }
  
  try {
    const apiUrl = `https://api.football-data.org/v4/matches?dateFrom=${dateString}&dateTo=${dateString}`;
    console.log(`🔗 Chiamata API: ${apiUrl}`);
    
    const response = await axios.get(apiUrl, {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
      timeout: 10000 // 10 secondi timeout
    });
    
    console.log(`📊 Risposta API ricevuta. Status: ${response.status}`);
    
    const matches = response.data.matches || [];
    console.log(`✅ Partite trovate per ${dateString}: ${matches.length}`);
    
    // Se non ci sono partite e stiamo cercando "oggi", prova domani
    if (matches.length === 0 && !targetDate) {
      console.log(`🔄 Oggi vuoto, provo con domani...`);
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowString = formatDate(tomorrow);
      
      const tomorrowUrl = `https://api.football-data.org/v4/matches?dateFrom=${tomorrowString}&dateTo=${tomorrowString}`;
      console.log(`🔗 Chiamata API domani: ${tomorrowUrl}`);
      
      const tomorrowResponse = await axios.get(tomorrowUrl, {
        headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY },
        timeout: 10000
      });
      
      const tomorrowMatches = tomorrowResponse.data.matches || [];
      console.log(`✅ Partite trovate per domani (${tomorrowString}): ${tomorrowMatches.length}`);
      
      return tomorrowMatches;
    }
    
    return matches;
    
  } catch (error) {
    console.error(`❌ Errore chiamata API per ${dateString}:`);
    console.error(`   Status: ${error.response?.status}`);
    console.error(`   Data: ${JSON.stringify(error.response?.data)}`);
    console.error(`   Message: ${error.message}`);
    return [];
  }
}

// [Resto del codice rimane identico: database squadre, algoritmo AI, etc...]
const teamStrengthDatabase = {
  'Manchester City': { strength: 9.5, form: 9.0, attack: 8.8, defense: 8.5 },
  'Arsenal': { strength: 8.5, form: 8.2, attack: 8.0, defense: 7.8 },
  'Liverpool': { strength: 9.0, form: 8.5, attack: 8.7, defense: 8.0 },
  'Chelsea': { strength: 7.8, form: 7.0, attack: 7.5, defense: 7.2 },
  'Manchester United': { strength: 7.5, form: 6.8, attack: 7.0, defense: 7.0 },
  'Tottenham': { strength: 7.2, form: 7.0, attack: 7.5, defense: 6.5 },
  'Newcastle United': { strength: 7.0, form: 7.5, attack: 6.8, defense: 7.2 },
  'Real Madrid': { strength: 9.8, form: 9.5, attack: 9.2, defense: 8.5 },
  'FC Barcelona': { strength: 8.8, form: 8.0, attack: 8.5, defense: 7.8 },
  'Juventus': { strength: 8.0, form: 7.5, attack: 7.2, defense: 8.2 },
  'AC Milan': { strength: 8.2, form: 8.0, attack: 7.8, defense: 7.5 },
  'Inter Milan': { strength: 8.5, form: 8.2, attack: 8.0, defense: 8.0 },
  'FC Bayern München': { strength: 9.2, form: 8.8, attack: 9.0, defense: 8.0 },
  'Paris Saint-Germain': { strength: 9.0, form: 8.5, attack: 9.2, defense: 7.5 },
};

function getTeamData(teamName) {
  let teamData = teamStrengthDatabase[teamName];
  
  if (!teamData) {
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
  
  if (!teamData) {
    const randomStrength = 5.0 + Math.random() * 4.0;
    teamData = {
      strength: Math.round(randomStrength * 10) / 10,
      form: Math.round((5.0 + Math.random() * 4.0) * 10) / 10,
      attack: Math.round((5.0 + Math.random() * 4.0) * 10) / 10,
      defense: Math.round((5.0 + Math.random() * 4.0) * 10) / 10
    };
  }
  
  return teamData;
}

function generaPronosticoVariegato(match, matchIndex) {
  const homeTeam = match.homeTeam.name;
  const awayTeam = match.awayTeam.name;
  
  const homeData = getTeamData(homeTeam);
  const awayData = getTeamData(awayTeam);
  
  const homeAdvantage = 1.15;
  const homeScore = (homeData.strength + homeData.form) * homeAdvantage;
  const awayScore = awayData.strength + awayData.form;
  const strengthDiff = homeScore - awayScore;
  
  let prob1, probX, prob2;
  
  if (strengthDiff > 3.5) {
    prob1 = 70 + Math.random() * 15;
    prob2 = 5 + Math.random() * 10;
    probX = 100 - prob1 - prob2;
  } else if (strengthDiff > 2.0) {
    prob1 = 55 + Math.random() * 15;
    prob2 = 10 + Math.random() * 15;
    probX = 100 - prob1 - prob2;
  } else if (strengthDiff > 0.5) {
    prob1 = 40 + Math.random() * 15;
    prob2 = 20 + Math.random() * 15;
    probX = 100 - prob1 - prob2;
  } else if (strengthDiff < -3.5) {
    prob2 = 70 + Math.random() * 15;
    prob1 = 5 + Math.random() * 10;
    probX = 100 - prob1 - prob2;
  } else if (strengthDiff < -2.0) {
    prob2 = 55 + Math.random() * 15;
    prob1 = 10 + Math.random() * 15;
    probX = 100 - prob1 - prob2;
  } else if (strengthDiff < -0.5) {
    prob2 = 40 + Math.random() * 15;
    prob1 = 20 + Math.random() * 15;
    probX = 100 - prob1 - prob2;
  } else {
    prob1 = 30 + Math.random() * 20;
    prob2 = 25 + Math.random() * 20;
    probX = 100 - prob1 - prob2;
  }
  
  prob1 = Math.round(prob1);
  prob2 = Math.round(prob2);
  probX = Math.round(probX);
  
  const prob1X = prob1 + probX;
  const probX2 = probX + prob2;
  const prob12 = prob1 + prob2;
  
  const avgGoals = (homeData.attack + awayData.attack) / 2;
  const goalVariation = Math.random() * 0.8 + 0.6;
  const expectedGoals = avgGoals * goalVariation;
  
  const probOver05 = expectedGoals > 1.0 ? 80 + Math.random() * 15 : 60 + Math.random() * 20;
  const probOver15 = expectedGoals > 1.8 ? 70 + Math.random() * 15 : 40 + Math.random() * 20;
  const probOver25 = expectedGoals > 2.5 ? 60 + Math.random() * 15 : 25 + Math.random() * 20;
  const probOver35 = expectedGoals > 3.2 ? 50 + Math.random() * 15 : 15 + Math.random() * 15;
  
  const bothAttack = (homeData.attack + awayData.attack) / 2;
  const probGoal = bothAttack > 7.0 ? 70 + Math.random() * 15 : 45 + Math.random() * 25;
  
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
  
  const pronosticoMigliore = tuttiPronostici.reduce((max, current) => 
    current.probabilita > max.probabilita ? current : max
  );
  
  let reasoning = '';
  if (strengthDiff > 2.0) {
    reasoning = `${homeTeam} molto più forte (${homeData.strength}/10 vs ${awayData.strength}/10). Vantaggio casa decisivo`;
  } else if (strengthDiff < -2.0) {
    reasoning = `${awayTeam} superiore (${awayData.strength}/10 vs ${homeData.strength}/10). Supera lo svantaggio trasferta`;
  } else {
    reasoning = `Partita equilibrata. ${homeTeam}: ${homeData.strength}/10, ${awayTeam}: ${awayData.strength}/10. ${pronosticoMigliore.mercato} consigliato`;
  }
  
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

// ENDPOINT PRINCIPALE CON DEBUG MIGLIORATO
app.get('/api/matches', async (req, res) => {
  if (!FOOTBALL_DATA_KEY) {
    return res.status(500).json({ error: "Manca la variabile d'ambiente FOOTBALL_DATA_KEY
