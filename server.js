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
  const start = formatDate(today);
  const futureDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const end = formatDate(futureDate);
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
  
  if (standingsCache[cacheKey] && (now - standingsCache[cacheKey].timestamp) < CACHE_DURATION) {
    return standingsCache[cacheKey].data;
  }
  
  try {
    const response = await axios.get(`https://api.football-data.org/v4/competitions/${competitionId}/standings`, {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY }
    });
    
    const standings = response.data.standings[0]?.table || [];
    
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
  if (!teamStats) return { strength: 5.0, form: 5.0, homeAdvantage: 1.0, stats: {} };
  
  const totalTeams = 20;
  const position = teamStats.position;
  const points = teamStats.points;
  const goalDifference = teamStats.goalDifference;
  const goalsFor = teamStats.goalsFor;
  const goalsAgainst = teamStats.goalsAgainst;
  const wins = teamStats.won;
  const draws = teamStats.draw;
  const losses = teamStats.lost;
  const gamesPlayed = wins + draws + losses;
  
  const positionStrength = Math.max(1, 10 - ((position - 1) / (totalTeams - 1)) * 9);
  const pointsPerGame = gamesPlayed > 0 ? points / gamesPlayed : 1;
  const formStrength = Math.min(10, Math.max(1, pointsPerGame * 3.33));
  const avgGoalsFor = gamesPlayed > 0 ? goalsFor / gamesPlayed : 1;
  const avgGoalsAgainst = gamesPlayed > 0 ? goalsAgainst / gamesPlayed : 1;
  const goalDiffBonus = Math.max(-2, Math.min(2, goalDifference / 10));
  const homeAdvantage = 1.0 + (positionStrength / 50);
  
  const finalStrength = Math.min(10, Math.max(1, positionStrength + goalDiffBonus));
  const finalForm = Math.min(10, Math.max(1, formStrength));
  
  return {
    strength: Math.round(finalStrength * 10) / 10,
    form: Math.round(finalForm * 10) / 10,
    homeAdvantage: Math.round(homeAdvantage * 100) / 100,
    avgGoalsFor: Math.round(avgGoalsFor * 100) / 100,
    avgGoalsAgainst: Math.round(avgGoalsAgainst * 100) / 100,
    stats: {
      position, points, goalDifference, goalsFor, goalsAgainst,
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
    return { 
      strength: 5.0, form: 5.0, homeAdvantage: 1.0, 
      avgGoalsFor: 1.5, avgGoalsAgainst: 1.5, stats: {} 
    };
  }
}

// ALGORITMO AI SUPER-AVANZATO CON TUTTI I MERCATI
async function generaPronosticoSuperIntelligente(match) {
  const homeTeam = match.homeTeam.name;
  const awayTeam = match.awayTeam.name;
  const competitionId = match.competition.id;
  
  const homeData = await getTeamData(homeTeam, competitionId);
  const awayData = await getTeamData(awayTeam, competitionId);
  
  const homeEffectiveStrength = (homeData.strength + homeData.form) * homeData.homeAdvantage;
  const awayEffectiveStrength = (awayData.strength + awayData.form);
  const strengthDiff = homeEffectiveStrength - awayEffectiveStrength;
  
  // CALCOLA PROBABILITÀ PER OGNI MERCATO
  
  // 1. MERCATO 1-X-2
  let prob1, probX, prob2;
  if (strengthDiff > 3.0) {
    prob1 = 75; probX = 18; prob2 = 7;
  } else if (strengthDiff > 2.0) {
    prob1 = 65; probX = 22; prob2 = 13;
  } else if (strengthDiff > 1.0) {
    prob1 = 55; probX = 28; prob2 = 17;
  } else if (strengthDiff < -3.0) {
    prob1 = 10; probX = 20; prob2 = 70;
  } else if (strengthDiff < -2.0) {
    prob1 = 15; probX = 25; prob2 = 60;
  } else if (strengthDiff < -1.0) {
    prob1 = 22; probX = 30; prob2 = 48;
  } else {
    prob1 = 40; probX = 32; prob2 = 28;
  }
  
  // 2. MERCATO DOPPIA CHANCE
  const prob1X = prob1 + probX;
  const probX2 = probX + prob2;
  const prob12 = prob1 + prob2;
  
  // 3. MERCATO UNDER/OVER
  const avgGoalsTotali = homeData.avgGoalsFor + awayData.avgGoalsFor + 
                        homeData.avgGoalsAgainst + awayData.avgGoalsAgainst;
  const expectedGoals = avgGoalsTotali / 2;
  
  const probOver05 = expectedGoals > 0.8 ? 85 : 70;
  const probOver15 = expectedGoals > 1.5 ? 75 : 45;
  const probOver25 = expectedGoals > 2.2 ? 65 : 35;
  const probOver35 = expectedGoals > 3.0 ? 55 : 25;
  
  // 4. MERCATO GOAL/NO GOAL
  const probGoal = (homeData.avgGoalsFor > 1.2 && awayData.avgGoalsFor > 1.0) ? 75 : 50;
  const probNoGoal = 100 - probGoal;
  
  // CREA LISTA DI TUTTI I PRONOSTICI CON PROBABILITÀ
  const tuttiPronostici = [
    { tipo: '1 (Vittoria Casa)', codice: '1', probabilita: prob1, mercato: '1X2' },
    { tipo: 'X (Pareggio)', codice: 'X', probabilita: probX, mercato: '1X2' },
    { tipo: '2 (Vittoria Trasferta)', codice: '2', probabilita: prob2, mercato: '1X2' },
    { tipo: '1X (Casa o Pareggio)', codice: '1X', probabilita: prob1X, mercato: 'Doppia Chance' },
    { tipo: 'X2 (Pareggio o Trasferta)', codice: 'X2', probabilita: probX2, mercato: 'Doppia Chance' },
    { tipo: '12 (Casa o Trasferta)', codice: '12', probabilita: prob12, mercato: 'Doppia Chance' },
    { tipo: 'Over 0.5 Gol', codice: 'O0.5', probabilita: probOver05, mercato: 'Under/Over' },
    { tipo: 'Under 0.5 Gol', codice: 'U0.5', probabilita: 100 - probOver05, mercato: 'Under/Over' },
    { tipo: 'Over 1.5 Gol', codice: 'O1.5', probabilita: probOver15, mercato: 'Under/Over' },
    { tipo: 'Under 1.5 Gol', codice: 'U1.5', probabilita: 100 - probOver15, mercato: 'Under/Over' },
    { tipo: 'Over 2.5 Gol', codice: 'O2.5', probabilita: probOver25, mercato: 'Under/Over' },
    { tipo: 'Under 2.5 Gol', codice: 'U2.5', probabilita: 100 - probOver25, mercato: 'Under/Over' },
    { tipo: 'Over 3.5 Gol', codice: 'O3.5', probabilita: probOver35, mercato: 'Under/Over' },
    { tipo: 'Under 3.5 Gol',
