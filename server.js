const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;
const FOOTBALL_DATA_KEY = process.env.FOOTBALL_DATA_KEY;

// CONTATORE RICHIESTE per rispettare i limiti API
let requestCount = 0;
const REQUEST_LIMIT = 5; // Limite molto sicuro per piano gratuito
const RESET_INTERVAL = 60000; // 1 minuto

// Reset contatore ogni minuto
setInterval(() => {
  console.log(`🔄 Reset contatore richieste. Precedente: ${requestCount}`);
  requestCount = 0;
}, RESET_INTERVAL);

// Funzione helper per formattare data in YYYY-MM-DD
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// DELAY tra richieste per rispettare rate limiting
async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ID CAMPIONATI UFFICIALI Football-Data.org (aggiornati per 2025)
const COMPETITION_IDS = {
  'Serie A': 2019,
  'Premier League': 2021,
  'La Liga': 2014,
  'Bundesliga': 2002,
  'Ligue 1': 2015,
  'Champions League': 2001,
  'Europa League': 2018,
  'Primeira Liga': 2017,
  'Eredivisie': 2003,
  'Championship': 2016,
  'Copa Libertadores': 2152,
  'Brasileirao': 2013
};

// FUNZIONE CON RATE LIMITING e debug dettagliato
async function getMatchesByDate(targetDate = null) {
  if (requestCount >= REQUEST_LIMIT) {
    console.log(`⚠️ Limite richieste raggiunto (${requestCount}/${REQUEST_LIMIT}). Ritorno risultati limitati.`);
    return [];
  }

  let dateString;
  
  if (targetDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      console.error(`❌ Formato data non valido: ${targetDate}`);
      return [];
    }
    dateString = targetDate;
    console.log(`📅 Utente ha selezionato: ${dateString}`);
  } else {
    const today = new Date();
    dateString = formatDate(today);
    console.log(`📅 Nessuna data specificata, uso oggi: ${dateString}`);
  }
  
  try {
    // Incrementa contatore PRIMA della richiesta
    requestCount++;
    
    const apiUrl = `https://api.football-data.org/v4/matches?dateFrom=${dateString}&dateTo=${dateString}`;
    console.log(`🔗 Chiamata API #${requestCount}: ${apiUrl}`);
    
    const response = await axios.get(apiUrl, {
      headers: { 
        'X-Auth-Token': FOOTBALL_DATA_KEY,
        'User-Agent': 'PronosticiAI/1.0'
      },
      timeout: 20000
    });
    
    console.log(`📊 Risposta API ricevuta. Status: ${response.status}`);
    console.log(`📊 Headers response:`, response.headers);
    
    const matches = response.data.matches || [];
    console.log(`✅ Partite TOTALI trovate per ${dateString}: ${matches.length}`);
    
    // DEBUG DETTAGLIATO: Mostra tutti i campionati disponibili
    if (matches.length > 0) {
      const competitionsFound = {};
      matches.forEach(match => {
        const compName = match.competition?.name || 'Sconosciuto';
        const compId = match.competition?.id || 'N/A';
        if (!competitionsFound[compName]) {
          competitionsFound[compName] = { id: compId, count: 0 };
        }
        competitionsFound[compName].count++;
      });
      
      console.log(`🏆 CAMPIONATI DISPONIBILI per ${dateString}:`);
      Object.entries(competitionsFound).forEach(([name, data]) => {
        console.log(`   - ${name} (ID: ${data.id}): ${data.count} partite`);
      });
      
      // Check specifico per campionati europei
      const europeanComps = ['Serie A', 'Premier League', 'La Liga', 'Bundesliga', 'Ligue 1'];
      const foundEuropean = europeanComps.filter(comp => 
        Object.keys(competitionsFound).some(found => 
          found.toLowerCase().includes(comp.toLowerCase()) || 
          comp.toLowerCase().includes(found.toLowerCase())
        )
      );
      
      if (foundEuropean.length > 0) {
        console.log(`🇪🇺 CAMPIONATI EUROPEI TROVATI: ${foundEuropean.join(', ')}`);
      } else {
        console.log(`⚠️ NESSUN CAMPIONATO EUROPEO MAGGIORE trovato per ${dateString}`);
        console.log(`💡 Probabilmente sono in pausa estiva o non ancora iniziati`);
      }
    } else {
      console.log(`❌ NESSUNA PARTITA trovata per ${dateString}`);
      
      // Se non ci sono partite, proviamo a controllare la stagione 2024-25
      console.log(`🔍 Controllo se ci sono informazioni sulla stagione...`);
      
      // Prova con range più ampio per vedere se ci sono dati
      if (requestCount < REQUEST_LIMIT) {
        await delay(3000);
        requestCount++;
        
        const rangeStart = dateString;
        const rangeEnd = new Date(dateString);
        rangeEnd.setDate(rangeEnd.getDate() + 7); // Prossimi 7 giorni
        const rangeEndString = formatDate(rangeEnd);
        
        const rangeUrl = `https://api.football-data.org/v4/matches?dateFrom=${rangeStart}&dateTo=${rangeEndString}`;
        console.log(`🔗 Provo con range 7 giorni: ${rangeUrl}`);
        
        try {
          const rangeResponse = await axios.get(rangeUrl, {
            headers: { 
              'X-Auth-Token': FOOTBALL_DATA_KEY,
              'User-Agent': 'PronosticiAI/1.0'
            },
            timeout: 20000
          });
          
          const rangeMatches = rangeResponse.data.matches || [];
          console.log(`📊 Partite trovate nei prossimi 7 giorni: ${rangeMatches.length}`);
          
          if (rangeMatches.length > 0) {
            const rangeComps = [...new Set(rangeMatches.map(m => m.competition?.name))];
            console.log(`🏆 Campionati nei prossimi 7 giorni: ${rangeComps.join(', ')}`);
            
            // Ritorna solo le partite del giorno specifico richiesto
            const dayMatches = rangeMatches.filter(match => {
              const matchDate = new Date(match.utcDate).toISOString().slice(0, 10);
              return matchDate === dateString;
            });
            
            console.log(`✅ Partite filtrate per ${dateString}: ${dayMatches.length}`);
            return dayMatches;
          }
        } catch (rangeError) {
          console.error(`❌ Errore nella ricerca range:`, rangeError.message);
        }
      }
    }
    
    // Se non ci sono partite e stiamo cercando "oggi", prova domani
    if (matches.length === 0 && !targetDate && requestCount < REQUEST_LIMIT) {
      console.log(`🔄 Oggi vuoto, provo con domani...`);
      
      await delay(5000); // 5 secondi di pausa
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowString = formatDate(tomorrow);
      
      requestCount++;
      
      const tomorrowUrl = `https://api.football-data.org/v4/matches?dateFrom=${tomorrowString}&dateTo=${tomorrowString}`;
      console.log(`🔗 Chiamata API #${requestCount} domani: ${tomorrowUrl}`);
      
      const tomorrowResponse = await axios.get(tomorrowUrl, {
        headers: { 
          'X-Auth-Token': FOOTBALL_DATA_KEY,
          'User-Agent': 'PronosticiAI/1.0'
        },
        timeout: 20000
      });
      
      const tomorrowMatches = tomorrowResponse.data.matches || [];
      console.log(`✅ Partite trovate per domani (${tomorrowString}): ${tomorrowMatches.length}`);
      
      if (tomorrowMatches.length > 0) {
        const tomorrowCompetitions = [...new Set(tomorrowMatches.map(m => m.competition?.name))];
        console.log(`🏆 Campionati domani: ${tomorrowCompetitions.join(', ')}`);
      }
      
      return tomorrowMatches;
    }
    
    return matches;
    
  } catch (error) {
    console.error(`❌ Errore chiamata API per ${dateString}:`);
    console.error(`   Status: ${error.response?.status}`);
    console.error(`   Status Text: ${error.response?.statusText}`);
    console.error(`   Headers: ${JSON.stringify(error.response?.headers)}`);
    console.error(`   Data: ${JSON.stringify(error.response?.data)}`);
    console.error(`   Message: ${error.message}`);
    
    // Check specifico per errori comuni
    if (error.response?.status === 429) {
      console.error(`🚫 RATE LIMIT EXCEEDED - Troppe richieste`);
    } else if (error.response?.status === 403) {
      console.error(`🚫 FORBIDDEN - Problema con API Key o permessi`);
    } else if (error.response?.status === 404) {
      console.error(`🚫 NOT FOUND - Endpoint non trovato`);
    }
    
    return [];
  }
}

// DATABASE SQUADRE ESTESO (aggiunto squadre serie A 2025)
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
  'Athletic Bilbao': { strength: 6.9, form: 7.1, attack: 6.6, defense: 7.2 },
  
  // Serie A (aggiornato per 2025)
  'Juventus': { strength: 8.0, form: 7.5, attack: 7.2, defense: 8.2 },
  'AC Milan': { strength: 8.2, form: 8.0, attack: 7.8, defense: 7.5 },
  'Inter Milan': { strength: 8.5, form: 8.2, attack: 8.0, defense: 8.0 },
  'SSC Napoli': { strength: 8.0, form: 7.2, attack: 7.5, defense: 7.8 },
  'AS Roma': { strength: 7.2, form: 6.8, attack: 6.8, defense: 7.0 },
  'SS Lazio': { strength: 7.0, form: 7.0, attack: 7.2, defense: 6.8 },
  'Atalanta': { strength: 7.5, form: 7.8, attack: 8.2, defense: 6.8 },
  'ACF Fiorentina': { strength: 6.7, form: 6.9, attack: 6.5, defense: 6.9 },
  'Torino FC': { strength: 6.3, form: 6.5, attack: 6.0, defense: 6.6 },
  'Bologna FC': { strength: 6.5, form: 6.8, attack: 6.3, defense: 6.7 },
  
  // Bundesliga
  'FC Bayern München': { strength: 9.2, form: 8.8, attack: 9.0, defense: 8.0 },
  'Borussia Dortmund': { strength: 8.0, form: 7.5, attack: 8.2, defense: 7.0 },
  'RB Leipzig': { strength: 7.5, form: 7.8, attack: 7.2, defense: 7.8 },
  'Bayer Leverkusen': { strength: 7.8, form: 8.5, attack: 8.0, defense: 7.2 },
  'Eintracht Frankfurt': { strength: 6.8, form: 7.0, attack: 7.0, defense: 6.6 },
  
  // Ligue 1
  'Paris Saint-Germain': { strength: 9.0, form: 8.5, attack: 9.2, defense: 7.5 },
  'AS Monaco': { strength: 7.0, form: 7.2, attack: 7.5, defense: 6.8 },
  'Olympique de Marseille': { strength: 6.8, form: 6.5, attack: 6.5, defense: 6.8 },
  'Olympique Lyonnais': { strength: 6.5, form: 6.3, attack: 6.2, defense: 6.8 },
  
  // Campionati attivi ad agosto (Brasile, Portogallo, MLS, ecc.)
  'Flamengo': { strength: 7.8, form: 8.2, attack: 8.0, defense: 7.5 },
  'Palmeiras': { strength: 7.5, form: 7.8, attack: 7.2, defense: 7.8 },
  'São Paulo': { strength: 7.2, form: 7.0, attack: 6.8, defense: 7.4 },
  'FC Porto': { strength: 7.6, form: 7.5, attack: 7.3, defense: 7.8 },
  'Sporting CP': { strength: 7.4, form: 7.2, attack: 7.0, defense: 7.5 },
  'SL Benfica': { strength: 7.8, form: 7.6, attack: 7.5, defense: 7.3 },
  'LA Galaxy': { strength: 6.5, form: 6.8, attack: 6.7, defense: 6.3 },
  'Inter Miami': { strength: 6.8, form: 7.2, attack: 7.0, defense: 6.6 }
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
    console.log(`⚡ Generati dati casuali per ${teamName}:`, teamData);
  }
  
  return teamData;
}

// Algoritmo AI con varietà garantita (identico a prima)
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

// ENDPOINT con informazioni di debug dettagliate
app.get('/api/matches', async (req, res) => {
  if (!FOOTBALL_DATA_KEY) {
    return res.status(500).json({ error: "Manca la variabile d'ambiente FOOTBALL_DATA_KEY" });
  }

  try {
    console.log(`\n🚀 === NUOVA RICHIESTA ===`);
    console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
    console.log(`📊 Stato rate limiting: ${requestCount}/${REQUEST_LIMIT} richieste utilizzate`);
    console.log(`📅 Query params:`, req.query);
    
    const selectedDate = req.query.date;
    const allMatches = await getMatchesByDate(selectedDate);

    console.log(`📊 Partite ricevute dall'API: ${allMatches.length}`);

    const matchesConPronostici = allMatches.map((match, index) => ({
      ...match,
      aiPronostico: generaPronosticoVariegato(match, index)
    }));

    console.log(`✅ Invio ${matchesConPronostici.length} partite con pronostici`);
    console.log(`📊 Rate limiting finale: ${requestCount}/${REQUEST_LIMIT} richieste utilizzate`);
    console.log(`🏁 === FINE RICHIESTA ===\n`);
    
    res.json(matchesConPronostici);

  } catch (error) {
    console.error("❌ Errore generale:", error.message);
    res.status(500).json({ error: 'Errore nel recupero delle partite' });
  }
});

// Endpoint per controllare lo stato delle richieste API
app.get('/api/status', (req, res) => {
  res.json({
    requestCount: requestCount,
    requestLimit: REQUEST_LIMIT,
    remainingRequests: Math.max(0, REQUEST_LIMIT - requestCount),
    resetTime: '60 secondi',
    supportedCompetitions: Object.keys(COMPETITION_IDS),
    lastRequest: new Date().toISOString()
  });
});

// Endpoint per debug campionati specifici
app.get('/api/competitions', async (req, res) => {
  if (!FOOTBALL_DATA_KEY) {
    return res.status(500).json({ error: "Manca la variabile d'ambiente FOOTBALL_DATA_KEY" });
  }

  try {
    console.log(`🔍 Richiesta informazioni campionati`);
    
    if (requestCount >= REQUEST_LIMIT) {
      return res.json({ error: 'Rate limit raggiunto', requestCount, requestLimit: REQUEST_LIMIT });
    }
    
    requestCount++;
    
    const response = await axios.get('https://api.football-data.org/v4/competitions', {
      headers: { 
        'X-Auth-Token': FOOTBALL_DATA_KEY,
        'User-Agent': 'PronosticiAI/1.0'
      },
      timeout: 20000
    });
    
    const competitions = response.data.competitions || [];
    console.log(`📊 Campionati disponibili nell'API: ${competitions.length}`);
    
    const competitionsSummary = competitions.map(comp => ({
      id: comp.id,
      name: comp.name,
      code: comp.code,
      area: comp.area?.name,
      currentSeason: comp.currentSeason?.startDate ? {
        start: comp.currentSeason.startDate,
        end: comp.currentSeason.endDate,
        current: comp.currentSeason.currentMatchday
      } : null
    }));
    
    res.json({
      total: competitions.length,
      competitions: competitionsSummary,
      requestCount,
      requestLimit: REQUEST_LIMIT
    });
    
  } catch (error) {
    console.error(`❌ Errore recupero campionati:`, error.message);
    res.status(500).json({ error: 'Errore nel recupero dei campionati' });
  }
});

app.listen(PORT, () => {
  console.log(`📅 Server AI CON DEBUG COMPLETO in ascolto sulla porta ${PORT}`);
  console.log(`⚠️  Limite sicuro: ${REQUEST_LIMIT} richieste/minuto`);
  console.log(`🔍 Debug dettagliato per trovare problema Serie A`);
  console.log(`🌐 Endpoints disponibili:`);
  console.log(`   - GET /api/matches?date=YYYY-MM-DD`);
  console.log(`   - GET /api/status`);
  console.log(`   - GET /api/competitions`);
});
