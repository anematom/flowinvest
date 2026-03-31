import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://hwevdgjuxewdqzmcakpk.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_W-h7OaJ_-zDoAaMum8okWQ_NQ31HfN8';

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

// ========== Settings ==========
export async function loadUserSettings(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
  return data;
}

export async function saveUserSettings(userId, settings) {
  const { error } = await supabase
    .from('profiles')
    .upsert({
      user_id: userId,
      amount: settings.amount,
      goal: settings.goal,
      horizon: settings.horizon,
      risk: settings.risk,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
  if (error) throw error;
}

// ========== Transactions ==========
export async function loadTransactions(userId) {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data || [];
}

export async function addTransaction(userId, tx) {
  const { error } = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      type: tx.type,
      amount: tx.amount,
      label: tx.label,
    });
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
