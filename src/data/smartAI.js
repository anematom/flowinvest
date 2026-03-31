// FlowInvest Smart AI — Automatische portfolio manager
// Checkt elke 10 minuten de markt en herbalanceert indien nodig

// Drempels voor actie
const THRESHOLDS = {
  // Bij hoeveel % daling schakelen we naar defensief?
  defenseMode: -2.0,        // -2% op een dag = defensief
  panicMode: -5.0,          // -5% op een dag = maximaal defensief
  recoveryMode: 1.5,        // +1.5% = terug naar normaal

  // Stop-loss: maximaal verlies voordat we verkopen
  stopLoss: -10.0,          // -10% totaal verlies = alles naar veilig

  // Buy the dip: wanneer bijkopen?
  buyDipThreshold: -3.0,    // -3% = kans om bij te kopen

  // Minimale verandering voordat we herbalanceren
  minRebalance: 1.0,        // Pas herbalanceren als allocatie >1% afwijkt
};

// Defensieve allocaties (meer obligaties, minder aandelen)
const defensiveShifts = {
  low: {
    normal:   { BND: 0.50, VGK: 0.20, SPY: 0.15, VXUS: 0.15 },
    defense:  { BND: 0.70, VGK: 0.10, SPY: 0.10, VXUS: 0.10 },
    panic:    { BND: 0.85, VGK: 0.05, SPY: 0.05, VXUS: 0.05 },
  },
  medium: {
    normal:   { SPY: 0.35, VGK: 0.20, VXUS: 0.20, BND: 0.15, VTI: 0.10 },
    defense:  { BND: 0.40, SPY: 0.20, VGK: 0.15, VXUS: 0.15, VTI: 0.10 },
    panic:    { BND: 0.60, SPY: 0.15, VGK: 0.10, VXUS: 0.10, VTI: 0.05 },
  },
  high: {
    normal:   { SPY: 0.40, VTI: 0.25, VXUS: 0.20, VGK: 0.15 },
    defense:  { SPY: 0.25, VTI: 0.15, VXUS: 0.15, VGK: 0.10, BND: 0.35 },
    panic:    { BND: 0.50, SPY: 0.20, VTI: 0.10, VXUS: 0.10, VGK: 0.10 },
  },
  // Ultra: geen defensieve modus — altijd vol in aandelen
  // Bij paniek wisselen we naar de minst dalende aandelen
  ultra: {
    normal:   null, // wordt dynamisch bepaald op basis van momentum
    defense:  null,
    panic:    null,
  },
};

// Bepaal de huidige markt-modus op basis van de data
export function analyzeMarket(quotes) {
  // Bereken gemiddelde verandering over alle ETF's
  const changes = quotes
    .filter(q => q.changePercent != null)
    .map(q => q.changePercent);

  if (changes.length === 0) return { mode: 'normal', avgChange: 0 };

  const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
  const worstDrop = Math.min(...changes);

  let mode = 'normal';
  if (worstDrop <= THRESHOLDS.panicMode || avgChange <= THRESHOLDS.panicMode) {
    mode = 'panic';
  } else if (worstDrop <= THRESHOLDS.defenseMode || avgChange <= THRESHOLDS.defenseMode) {
    mode = 'defense';
  } else if (avgChange >= THRESHOLDS.recoveryMode) {
    mode = 'recovery';
  }

  return {
    mode,
    avgChange,
    worstDrop,
    bestGain: Math.max(...changes),
    shouldBuyDip: avgChange <= THRESHOLDS.buyDipThreshold,
  };
}

// Haal de juiste allocatie op basis van markt-modus
export function getSmartAllocation(riskLevel, marketMode) {
  const shifts = defensiveShifts[riskLevel] || defensiveShifts.medium;

  if (marketMode === 'panic') return shifts.panic;
  if (marketMode === 'defense') return shifts.defense;
  return shifts.normal;
}

// Bereken wat er moet veranderen in de portfolio
export function calculateRebalance(currentPortfolio, targetAllocation, totalValue) {
  const trades = [];

  for (const [symbol, targetWeight] of Object.entries(targetAllocation)) {
    const current = currentPortfolio.find(p => p.symbol === symbol);
    const currentWeight = current ? current.currentValue / totalValue : 0;
    const diff = targetWeight - currentWeight;

    if (Math.abs(diff * 100) >= THRESHOLDS.minRebalance) {
      const amount = diff * totalValue;
      trades.push({
        symbol,
        action: amount > 0 ? 'KOOP' : 'VERKOOP',
        amount: Math.abs(amount),
        reason: amount > 0 ? 'Onderwogen' : 'Overwogen',
        fromWeight: (currentWeight * 100).toFixed(1),
        toWeight: (targetWeight * 100).toFixed(1),
      });
    }
  }

  return trades;
}

// Check stop-loss
export function checkStopLoss(totalGainPercent) {
  return totalGainPercent <= THRESHOLDS.stopLoss;
}

// Analyse specifiek voor ultra modus (losse aandelen)
export function analyzeUltraMarket(stockQuotes) {
  const changes = stockQuotes
    .filter(q => q.changePercent != null)
    .map(q => q.changePercent);

  if (changes.length === 0) return { mode: 'normal', avgChange: 0, winners: 0, losers: 0 };

  const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
  const winners = changes.filter(c => c > 0).length;
  const losers = changes.filter(c => c < 0).length;
  const bestStock = stockQuotes.reduce((a, b) =>
    (a.changePercent || 0) > (b.changePercent || 0) ? a : b
  );
  const worstStock = stockQuotes.reduce((a, b) =>
    (a.changePercent || 0) < (b.changePercent || 0) ? a : b
  );

  let mode = 'normal';
  if (avgChange <= -5) mode = 'panic';
  else if (avgChange <= -2) mode = 'defense';
  else if (avgChange >= 1.5) mode = 'recovery';

  return {
    mode,
    avgChange,
    winners,
    losers,
    bestStock,
    worstStock,
    shouldRotate: true, // ultra modus roteert altijd naar de sterkste
  };
}

// Genereer AI-bericht specifiek voor ultra modus
export function getUltraMessage(analysis, portfolio, totalGainPercent) {
  const { avgChange, winners, losers, bestStock, worstStock } = analysis;

  if (totalGainPercent <= THRESHOLDS.stopLoss) {
    return {
      type: 'warning',
      title: 'Stop-loss geactiveerd',
      message: `Je portfolio is ${Math.abs(totalGainPercent).toFixed(1)}% gedaald. Bij ultra modus kan dit snel gaan. Overweeg om naar een rustiger profiel te schakelen.`,
    };
  }

  if (avgChange <= -3) {
    return {
      type: 'alert',
      title: 'Aandelen dalen fors',
      message: `Gemiddeld ${Math.abs(avgChange).toFixed(1)}% daling. ${worstStock.symbol} daalt het meest (${worstStock.changePercent.toFixed(1)}%). De AI verschuift naar de sterkste aandelen om verlies te beperken.`,
    };
  }

  if (avgChange >= 2) {
    return {
      type: 'positive',
      title: 'Sterke dag!',
      message: `${winners} van de 10 aandelen stijgen. ${bestStock.symbol} is de beste (+${bestStock.changePercent.toFixed(1)}%). Je geld zit in de top 5 performers.`,
    };
  }

  if (winners > losers) {
    return {
      type: 'good',
      title: 'Markt is positief',
      message: `${winners} stijgers, ${losers} dalers. Beste: ${bestStock.symbol} (+${bestStock.changePercent.toFixed(1)}%). De AI focust je geld op de winnaars.`,
    };
  }

  if (losers > winners) {
    return {
      type: 'caution',
      title: 'Meer dalers dan stijgers',
      message: `${losers} dalers, ${winners} stijgers. De AI heeft geroteerd naar de minst dalende aandelen. Bij ultra modus zijn schommelingen normaal.`,
    };
  }

  return {
    type: 'good',
    title: 'Portfolio actief beheerd',
    message: `De AI monitort 10 aandelen en houdt je geld in de top 5. Huidige beste: ${bestStock.symbol} (+${bestStock.changePercent?.toFixed(1) || '0'}%).`,
  };
}

// Genereer AI-bericht over wat er gebeurt
export function getMarketMessage(analysis, trades, totalGainPercent) {
  const { mode, avgChange } = analysis;

  if (checkStopLoss(totalGainPercent)) {
    return {
      type: 'warning',
      title: 'Stop-loss geactiveerd',
      message: `Je portfolio is ${Math.abs(totalGainPercent).toFixed(1)}% gedaald. Om je te beschermen is je geld automatisch naar veilige beleggingen verplaatst.`,
    };
  }

  if (mode === 'panic') {
    return {
      type: 'alert',
      title: 'Grote marktdaling gedetecteerd',
      message: `De markt daalt vandaag gemiddeld ${Math.abs(avgChange).toFixed(1)}%. Je portfolio is automatisch naar defensief geschakeld om verliezen te beperken. Dit is tijdelijk — bij herstel schakelen we terug.`,
    };
  }

  if (mode === 'defense') {
    return {
      type: 'caution',
      title: 'Defensieve modus actief',
      message: `De markt is licht aan het dalen (${avgChange.toFixed(1)}%). We hebben je portfolio iets defensiever gemaakt. Geen zorgen — dit is normaal marktgedrag.`,
    };
  }

  if (analysis.shouldBuyDip) {
    return {
      type: 'opportunity',
      title: 'Kans: lagere koersen',
      message: 'De markt staat lager dan normaal. Historisch gezien is dit een goed moment om bij te kopen. Je portfolio koopt automatisch bij tegen lagere prijzen.',
    };
  }

  if (mode === 'recovery') {
    return {
      type: 'positive',
      title: 'Markt herstelt zich',
      message: `Goed nieuws! De markt stijgt vandaag ${avgChange.toFixed(1)}%. Je portfolio is terug naar de normale verdeling om maximaal te profiteren.`,
    };
  }

  if (trades.length > 0) {
    return {
      type: 'info',
      title: 'Portfolio geoptimaliseerd',
      message: `Er zijn ${trades.length} kleine aanpassingen gemaakt om je portfolio in balans te houden. Dit gebeurt automatisch.`,
    };
  }

  return {
    type: 'good',
    title: 'Alles op koers',
    message: 'De markt is stabiel en je portfolio is in balans. Er zijn geen aanpassingen nodig.',
  };
}

// Formateer de laatse check tijd
export function formatLastCheck(date) {
  return date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}
