// Data access for the `life` schema. Every read and write is scoped by user_id
// explicitly as well as by RLS (belt and suspenders, same rule as the other apps).
import { supabase } from './supabaseClient.js';

let uid = null;
export function setUser(id){ uid = id; }
export function userId(){ return uid; }

function ok({ data, error }){
  if (error) throw new Error(error.message);
  return data;
}

export function table(name){
  return {
    // build: optional (query) => query, for filters and ordering.
    async list(build){
      let q = supabase.from(name).select('*').eq('user_id', uid);
      if (build) q = build(q);
      return ok(await q) || [];
    },
    async add(row){
      return ok(await supabase.from(name).insert({ ...row, user_id: uid }).select().single());
    },
    async addMany(rows){
      if (!rows.length) return [];
      return ok(await supabase.from(name).insert(rows.map((r) => ({ ...r, user_id: uid }))).select()) || [];
    },
    async set(id, patch){
      return ok(await supabase.from(name).update(patch).eq('id', id).eq('user_id', uid).select().single());
    },
    async del(id){
      ok(await supabase.from(name).delete().eq('id', id).eq('user_id', uid));
    }
  };
}

export const goals = table('goals');
export const steps = table('goal_steps');
export const commitments = table('commitments');
export const tasks = table('tasks');
export const habits = table('habits');
export const journal = table('journal');
export const listItems = table('list_items');
export const career = table('career_items');
export const events = table('events');
export const rules = table('commitment_rules');
export const quits = table('quits');
export const quitSlips = table('quit_slips');
export const quitCravings = table('quit_cravings');
export const niggles = table('niggles');
export const reviews = table('reviews');
export const reviewGoals = table('review_goals');
export const notes = table('notes');
export const pushSubs = table('push_subscriptions');

// Playbook progress is keyed by directive, not id.
export const playbook = {
  async list(){
    return ok(await supabase.from('playbook_progress').select('*').eq('user_id', uid)) || [];
  },
  async set(directive_key, patch){
    return ok(await supabase.from('playbook_progress').upsert({ user_id: uid, directive_key, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id,directive_key' }).select().single());
  }
};

// Insert rows, silently skipping any that already exist (so two screens loading at the
// same moment can't create the same recurring commitment twice).
export async function upsertIgnore(name, rows, onConflict){
  if (!rows.length) return;
  ok(await supabase.from(name).upsert(rows.map((r) => ({ ...r, user_id: uid })), { onConflict, ignoreDuplicates: true }));
}

export async function upsertOn(name, row, onConflict){
  return ok(await supabase.from(name).upsert({ ...row, user_id: uid }, { onConflict }).select().single());
}

export const habitChecks = {
  async listSince(date){
    return ok(await supabase.from('habit_checks').select('*').eq('user_id', uid).gte('check_date', date)) || [];
  },
  async set(habitId, date, on){
    if (on) ok(await supabase.from('habit_checks').upsert({ habit_id: habitId, check_date: date, user_id: uid }, { onConflict: 'habit_id,check_date' }));
    else ok(await supabase.from('habit_checks').delete().eq('habit_id', habitId).eq('check_date', date).eq('user_id', uid));
  }
};

export const settings = {
  async get(){
    const row = ok(await supabase.from('settings').select('data').eq('user_id', uid).maybeSingle());
    return (row && row.data) || {};
  },
  async save(data){
    ok(await supabase.from('settings').upsert({ user_id: uid, data, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }));
  }
};
