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
