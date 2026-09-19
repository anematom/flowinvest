import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://hwevdgjuxewdqzmcakpk.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3ZXZkZ2p1eGV3ZHF6bWNha3BrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5ODI2NDksImV4cCI6MjA5MDU1ODY0OX0.u1ih2CjiKv-6bYNyuyCRbbZzyENtfPj1-DE5ZzSXQ6E';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ========== Auth ==========
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function resetPasswordForEmail(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) throw error;
}

export async function updatePassword(newPassword) {
  const { data, error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
  return data;
}

// ========== Portfolios ==========
export async function loadPortfolios(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function savePortfolio(userId, portfolio) {
  if (portfolio.id) {
    // Update bestaand portfolio
    const { error } = await supabase
      .from('profiles')
      .update({
        name: portfolio.name,
        amount: portfolio.amount,
        goal: portfolio.goal,
        horizon: portfolio.horizon,
        risk: portfolio.risk,
        broker_mode: portfolio.broker_mode || 'simulation',
        updated_at: new Date().toISOString(),
      })
      .eq('id', portfolio.id);
    if (error) throw error;
  } else {
    // Nieuw portfolio
    const { data, error } = await supabase
      .from('profiles')
      .insert({
        user_id: userId,
        name: portfolio.name,
        amount: portfolio.amount,
        goal: portfolio.goal,
        horizon: portfolio.horizon,
        risk: portfolio.risk,
        broker_mode: portfolio.broker_mode || 'simulation',
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }
}

export async function deletePortfolio(portfolioId) {
  const { error } = await supabase
    .from('profiles')
    .delete()
    .eq('id', portfolioId);
  if (error) throw error;
}

// Backwards compatible: laad eerste portfolio als "settings"
export async function loadUserSettings(userId) {
  const portfolios = await loadPortfolios(userId);
  return portfolios.length > 0 ? portfolios[0] : null;
}

export async function saveUserSettings(userId, settings) {
  await savePortfolio(userId, settings);
}

// ========== Portfolio Holdings & History ==========
export async function loadPortfolioHoldings(portfolioId) {
  if (!portfolioId) return null;
  const { data, error } = await supabase
    .from('portfolio_holdings')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function savePortfolioHoldings(portfolioId, holdings, history) {
  if (!portfolioId) return;

  // Check of er al een record bestaat
  const { data: existing } = await supabase
    .from('portfolio_holdings')
    .select('id')
    .eq('portfolio_id', portfolioId)
    .single();

  const updateData = { updated_at: new Date().toISOString() };
  if (holdings !== null && holdings !== undefined) updateData.holdings = holdings;
  if (history !== null && history !== undefined) updateData.history = history.slice(-200);

  if (existing) {
    // Update alleen de velden die meegegeven zijn
    const { error } = await supabase
      .from('portfolio_holdings')
      .update(updateData)
      .eq('portfolio_id', portfolioId);
    if (error) throw error;
  } else {
    // Insert nieuw record
    const { error } = await supabase
      .from('portfolio_holdings')
      .insert({
        portfolio_id: portfolioId,
        holdings: holdings || [],
        history: history ? history.slice(-200) : [],
      });
    if (error) throw error;
  }
}

// ========== Transactions ==========
export async function loadTransactions(userId, portfolioId) {
  let query = supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (portfolioId) {
    query = query.eq('portfolio_id', portfolioId);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function addTransaction(userId, tx, portfolioId) {
  const row = {
    user_id: userId,
    type: tx.type,
    amount: tx.amount,
    label: tx.label,
  };
  if (portfolioId) row.portfolio_id = portfolioId;
  const { error } = await supabase
    .from('transactions')
    .insert(row);
  if (error) throw error;
}

// ========== Alpaca Keys ==========
// Paper- en live-sleutels stonden allebei in api_key/secret_key, dus wie later
// paper instelde overschreef zijn live-sleutels. De app probeerde dan met
// paper-sleutels het live account op te halen, kreeg niets terug en toonde
// "wachten op storting" terwijl er gewoon posities stonden.
//
// Ze staan nu in aparte kolommen. Eenmalig aan te maken in Supabase:
//   alter table alpaca_keys
//     add column if not exists paper_api_key text,
//     add column if not exists paper_secret_key text,
//     add column if not exists live_api_key text,
//     add column if not exists live_secret_key text;
//
// De oude kolommen blijven staan en worden als terugval gelezen, zodat
// bestaande gebruikers niets kwijtraken zolang ze hun sleutels niet opnieuw
// invoeren.
// Beide sets in een keer, zodat de app bij het wisselen van portfolio niet
// opnieuw hoeft te laden.
export async function loadAllAlpacaKeys(userId) {
  const { data, error } = await supabase
    .from('alpaca_keys')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  if (!data) return { paper: null, live: null };

  const paar = (apiKey, secretKey) =>
    (apiKey && secretKey) ? { apiKey, secretKey } : null;

  return {
    paper: paar(data.paper_api_key ?? data.api_key, data.paper_secret_key ?? data.secret_key),
    live: paar(data.live_api_key ?? data.api_key, data.live_secret_key ?? data.secret_key),
  };
}

export async function loadAlpacaKeys(userId, mode = 'paper') {
  const { data, error } = await supabase
    .from('alpaca_keys')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  if (!data) return null;

  const live = mode === 'live';
  const apiKey = (live ? data.live_api_key : data.paper_api_key) ?? data.api_key;
  const secretKey = (live ? data.live_secret_key : data.paper_secret_key) ?? data.secret_key;
  if (!apiKey || !secretKey) return null;
  return { apiKey, secretKey };
}

export async function saveAlpacaKeys(userId, apiKey, secretKey, mode = 'paper') {
  const veld = mode === 'live'
    ? { live_api_key: apiKey, live_secret_key: secretKey }
    : { paper_api_key: apiKey, paper_secret_key: secretKey };

  const { error } = await supabase
    .from('alpaca_keys')
    .upsert({
      user_id: userId,
      // De oude kolommen blijven meelopen zodat een oudere versie van de app
      // niet plotseling zonder sleutels zit.
      api_key: apiKey,
      secret_key: secretKey,
      ...veld,
    }, { onConflict: 'user_id' });
  if (error) throw error;
}

// ========== Auto Invest ==========
export async function loadAutoInvest(userId) {
  const { data, error } = await supabase
    .from('auto_invest')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || { enabled: false, amount: 100 };
}

export async function saveAutoInvest(userId, config) {
  const { error } = await supabase
    .from('auto_invest')
    .upsert({
      user_id: userId,
      enabled: config.enabled,
      amount: config.amount,
    }, { onConflict: 'user_id' });
  if (error) throw error;
}
