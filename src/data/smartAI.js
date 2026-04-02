// FlowInvest Smart AI — Automatische portfolio manager
// Checkt elke 10 minuten de markt en herbalanceert indien nodig

// Drempels voor actie — geoptimaliseerd op basis van backtest (1 jaar, 8 aandelen)
const THRESHOLDS = {
  // Bij hoeveel % daling schakelen we naar defensief?
  defenseMode: -3.0,        // -3% op een dag = defensief (was -2%)
  panicMode: -7.0,          // -7% op een dag = maximaal defensief (was -5%)
  recoveryMode: 2.0,        // +2% = terug naar normaal (was 1.5%)

  // Stop-loss: maximaal verlies voordat we verkopen
  stopLoss: -15.0,          // -15% totaal verlies (was -10%, meer ruimte voor herstel)

  // Buy the dip: wanneer bijkopen?
  buyDipThreshold: -5.0,    // -5% = kans om bij te kopen (was -3%, alleen echte dips)

  // Minimale verandering voordat we herbalanceren
  minRebalance: 1.5,        // Pas herbalanceren als allocatie >1.5% afwijkt (was 1%, minder handelen)
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
  // Ultra: geleidelijk afbouwen bij daling
  // Bij paniek deels naar BND (obligaties), rest in sterkste aandelen
  ultra: {
    normal:   { stocks: 1.00, BND: 0.00 }, // 100% in top aandelen
    defense:  { stocks: 0.80, BND: 0.20 }, // 20% naar obligaties
    panic:    { stocks: 0.60, BND: 0.40 }, // 40% naar obligaties
    crisis:   { stocks: 0.40, BND: 0.60 }, // 60% naar obligaties bij -10%+
  },
  // Crypto: veel ruimere drempels (crypto is veel volatieler)
  crypto: {
    normal:   { stocks: 1.00, BND: 0.00 },
    defense:  { stocks: 0.85, BND: 0.15 },
    panic:    { stocks: 0.70, BND: 0.30 },
    crisis:   { stocks: 0.50, BND: 0.50 },
  },
};

// Aparte drempels voor crypto (geoptimaliseerd via backtest)
export const CRYPTO_THRESHOLDS = {
  defenseMode: -8.0,        // Crypto daalt makkelijk 5-10% per dag
  panicMode: -15.0,
  crisisMode: -25.0,
  recoveryMode: 5.0,        // Crypto herstelt ook sneller
  stopLoss: -30.0,          // Veel ruimer dan aandelen (-15%)
  buyDipThreshold: -15.0,   // Alleen kopen bij echte crypto crash
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

  // Geleidelijke afbouw: trapsgewijs defensiever
  let mode = 'normal';
  if (avgChange <= THRESHOLDS.stopLoss) mode = 'crisis';       // -10%+: zwaarste bescherming
  else if (avgChange <= THRESHOLDS.panicMode) mode = 'panic';   // -5% tot -10%: 40% obligaties
  else if (avgChange <= THRESHOLDS.defenseMode) mode = 'defense'; // -2% tot -5%: 20% obligaties
  else if (avgChange >= THRESHOLDS.recoveryMode) mode = 'recovery';

  // Buy the dip: bij daling tussen -3% en -10%, koop bij met kleine bedragen
  const shouldBuyDip = avgChange <= THRESHOLDS.buyDipThreshold && avgChange > THRESHOLDS.stopLoss;

  return {
    mode,
    avgChange,
    winners,
    losers,
    bestStock,
    worstStock,
    shouldRotate: true,
    shouldBuyDip,
    // Geeft aan hoeveel % naar obligaties gaat
    defensiveShift: defensiveShifts.ultra[mode] || defensiveShifts.ultra.normal,
  };
}

// Haal ultra defensieve verdeling op
export function getUltraDefensiveShift(mode) {
  return defensiveShifts.ultra[mode] || defensiveShifts.ultra.normal;
}

// Genereer AI-bericht specifiek voor ultra modus
export function getUltraMessage(analysis, portfolio, totalGainPercent) {
  const { mode, avgChange, winners, losers, bestStock, worstStock, shouldBuyDip, defensiveShift } = analysis;
  const bndPercent = Math.round((defensiveShift?.BND || 0) * 100);
  const stockPercent = Math.round((defensiveShift?.stocks || 1) * 100);

  if (mode === 'crisis') {
    return {
      type: 'warning',
      title: 'Zware daling — maximale bescherming actief',
      message: `De markt daalt ${Math.abs(avgChange).toFixed(1)}%. Je portfolio is nu ${bndPercent}% obligaties en ${stockPercent}% in de sterkste aandelen. Bij herstel (+3%) schakelen we geleidelijk terug.`,
    };
  }

  if (mode === 'panic') {
    return {
      type: 'alert',
      title: 'Forse daling — deels beschermd',
      message: `Gemiddeld ${Math.abs(avgChange).toFixed(1)}% daling. ${bndPercent}% van je geld is naar obligaties verschoven. De rest zit in de sterkste aandelen.${shouldBuyDip ? ' Buy-the-dip is actief: er wordt bijgekocht tegen lage koersen.' : ''}`,
    };
  }

  if (mode === 'defense') {
    return {
      type: 'caution',
      title: 'Lichte daling — voorzichtigheidsmodus',
      message: `De markt daalt ${Math.abs(avgChange).toFixed(1)}%. ${bndPercent}% is naar obligaties verschoven ter bescherming. ${stockPercent}% blijft in de top aandelen.${shouldBuyDip ? ' Buy-the-dip is actief.' : ''}`,
    };
  }

  if (mode === 'recovery') {
    return {
      type: 'positive',
      title: 'Markt herstelt — terug naar vol gas',
      message: `De markt stijgt ${avgChange.toFixed(1)}%! Je portfolio is terug naar 100% aandelen om maximaal te profiteren. ${bestStock.symbol} is de sterkste (+${bestStock.changePercent?.toFixed(1) || '0'}%).`,
    };
  }

  if (avgChange >= 2) {
    return {
      type: 'positive',
      title: 'Sterke dag!',
      message: `${winners} van de 10 aandelen stijgen. ${bestStock.symbol} is de beste (+${bestStock.changePercent?.toFixed(1) || '0'}%). Je geld zit 100% in de top 5 performers.`,
    };
  }

  if (winners > losers) {
    return {
      type: 'good',
      title: 'Markt is positief',
      message: `${winners} stijgers, ${losers} dalers. Beste: ${bestStock.symbol} (+${bestStock.changePercent?.toFixed(1) || '0'}%). 100% in aandelen — de AI focust op de winnaars.`,
    };
  }

  if (losers > winners) {
    return {
      type: 'caution',
      title: 'Meer dalers dan stijgers',
      message: `${losers} dalers, ${winners} stijgers. De AI roteert naar de sterkste aandelen. Portfolio blijft 100% in aandelen zolang de daling beperkt is.`,
    };
  }

  return {
    type: 'good',
    title: 'Portfolio actief beheerd',
    message: `De AI monitort 10 aandelen en houdt je geld in de top 5. 100% in aandelen. Huidige beste: ${bestStock.symbol} (+${bestStock.changePercent?.toFixed(1) || '0'}%).`,
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
