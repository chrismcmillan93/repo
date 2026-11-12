// Thin data-access layer over the `fitness` schema. Every function throws
// on error (with the Supabase error message attached) so callers can toast
// it or feed it into the offline queue.
import { supabase } from './supabaseClient.js';

function checkError(error){
  if (error) throw new Error(error.message || 'Database error');
}

export const db = {
  // Single round-trip for the Today screen: block/week/day type, target,
  // session+exercises, run prescription, meals, rules, and this user's
  // existing log/checks for the date. See the get_day_bundle migration.
  async getDayBundle(dateStr){
    const { data, error } = await supabase.rpc('get_day_bundle', { p_date: dateStr });
    checkError(error);
    return data;
  },

  dailyLogs: {
    async upsert(userId, logDate, fields){
      const { data, error } = await supabase
        .from('daily_logs')
        .upsert({ user_id: userId, log_date: logDate, ...fields }, { onConflict: 'user_id,log_date' })
        .select()
        .single();
      checkError(error);
      return data;
    },
    async listRange(userId, startDate, endDate){
      const { data, error } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('user_id', userId)
        .gte('log_date', startDate)
        .lte('log_date', endDate)
        .order('log_date');
      checkError(error);
      return data || [];
    }
  },

  dailyChecks: {
    async upsert(userId, logDate, itemId, isChecked){
      const { data, error } = await supabase
        .from('daily_checks')
        .upsert(
          { user_id: userId, log_date: logDate, item_id: itemId, is_checked: isChecked },
          { onConflict: 'user_id,log_date,item_id' }
        )
        .select()
        .single();
      checkError(error);
      return data;
    },
    async listRange(userId, startDate, endDate){
      const { data, error } = await supabase
        .from('daily_checks')
        .select('*')
        .eq('user_id', userId)
        .gte('log_date', startDate)
        .lte('log_date', endDate);
      checkError(error);
      return data || [];
    }
  },

  weeklyCheckins: {
    async list(userId, blockId){
      const { data, error } = await supabase
        .from('weekly_checkins')
        .select('*')
        .eq('user_id', userId)
        .eq('block_id', blockId)
        .order('week_number', { ascending: false });
      checkError(error);
      return data || [];
    },
    async upsert(userId, blockId, weekNumber, fields){
      const { data, error } = await supabase
        .from('weekly_checkins')
        .upsert(
          { user_id: userId, block_id: blockId, week_number: weekNumber, ...fields },
          { onConflict: 'user_id,block_id,week_number' }
        )
        .select()
        .single();
      checkError(error);
      return data;
    }
  },

  blocks: {
    async getCurrent(dateStr){
      const { data, error } = await supabase
        .from('blocks')
        .select('*')
        .lte('start_date', dateStr)
        .gte('end_date', dateStr)
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      checkError(error);
      return data;
    },
    async getLatest(){
      const { data, error } = await supabase
        .from('blocks')
        .select('*')
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      checkError(error);
      return data;
    }
  },

  blockWeeks: {
    async list(blockId){
      const { data, error } = await supabase
        .from('block_weeks')
        .select('*')
        .eq('block_id', blockId)
        .order('week_number');
      checkError(error);
      return data || [];
    }
  },

  weekTargets: {
    async list(blockId){
      const { data, error } = await supabase
        .from('week_targets')
        .select('*')
        .eq('block_id', blockId)
        .order('week_number');
      checkError(error);
      return data || [];
    }
  },

  mealTemplates: {
    // Aliased to `foods` (not the table's own name, `meal_foods`) so both
    // this direct query (Plan, Week) and get_day_bundle()'s RPC (Today)
    // hand mealCard.js's shared accordion the exact same shape.
    async list(blockId){
      const { data, error } = await supabase
        .from('meal_templates')
        .select('*, foods:meal_foods(*)')
        .eq('block_id', blockId)
        .order('slot_order')
        .order('order_num', { foreignTable: 'meal_foods' });
      checkError(error);
      return data || [];
    }
  },

  // v1 (archived) session templates. Only read to work out the nutrition day
  // type (lift/run/rest) for dates inside Block 2 -- training sessions come
  // from planDays/picks now.
  sessionTemplates: {
    async list(blockId){
      const { data, error } = await supabase
        .from('session_templates')
        .select('*')
        .eq('block_id', blockId)
        .order('day_of_week');
      checkError(error);
      return data || [];
    }
  },

  // The v2 training plan (Edale 50km). Read-only to the app; every list is
  // scoped by plan_version, same belt-and-suspenders rule as the block tables.
  trainingPlans: {
    async get(planVersion){
      const { data, error } = await supabase
        .from('training_plans')
        .select('*')
        .eq('plan_version', planVersion)
        .maybeSingle();
      checkError(error);
      return data;
    }
  },

  planWeeks: {
    async list(planVersion){
      const { data, error } = await supabase
        .from('plan_weeks')
        .select('*')
        .eq('plan_version', planVersion)
        .order('week_number');
      checkError(error);
      return data || [];
    }
  },

  planDays: {
    async listRange(planVersion, fromDate, toDate){
      const { data, error } = await supabase
        .from('plan_days')
        .select('*')
        .eq('plan_version', planVersion)
        .gte('date', fromDate)
        .lte('date', toDate)
        .order('date');
      checkError(error);
      return data || [];
    }
  },

  liftTemplates: {
    async list(planVersion){
      const { data, error } = await supabase
        .from('lift_templates')
        .select('*, exercises:lift_template_exercises(*)')
        .eq('plan_version', planVersion)
        .order('sort_order')
        .order('order_num', { foreignTable: 'lift_template_exercises' });
      checkError(error);
      return data || [];
    }
  },

  liftModes: {
    async list(planVersion){
      const { data, error } = await supabase
        .from('lift_modes')
        .select('*')
        .eq('plan_version', planVersion);
      checkError(error);
      return data || [];
    }
  },

  // Weights / Cardio picks are stored as daily_checks rows (pick:weights,
  // pick:cardio) so they ride the same offline queue as every other tick.
  dayPicks: {
    async listRange(userId, fromDate, toDate){
      const { data, error } = await supabase
        .from('daily_checks')
        .select('log_date, item_id, is_checked')
        .eq('user_id', userId)
        .in('item_id', ['pick:weights', 'pick:cardio'])
        .gte('log_date', fromDate)
        .lte('log_date', toDate);
      checkError(error);
      return data || [];
    }
  },

  // Which specific session was done for a Weights / Cardio pick (e.g.
  // "Full Body #2", "Long run"). The on/off pick itself is in daily_checks.
  pickSessions: {
    async listRange(userId, fromDate, toDate){
      const { data, error } = await supabase
        .from('pick_sessions')
        .select('log_date, kind, session')
        .eq('user_id', userId)
        .gte('log_date', fromDate)
        .lte('log_date', toDate);
      checkError(error);
      return data || [];
    },
    async set(userId, logDate, kind, session){
      const { error } = await supabase
        .from('pick_sessions')
        .upsert({ user_id: userId, log_date: logDate, kind, session, updated_at: new Date().toISOString() }, { onConflict: 'user_id,log_date,kind' });
      checkError(error);
    },
    async remove(userId, logDate, kinds){
      if (!kinds.length) return;
      const { error } = await supabase
        .from('pick_sessions')
        .delete()
        .eq('user_id', userId)
        .eq('log_date', logDate)
        .in('kind', kinds);
      checkError(error);
    }
  },

  races: {
    // Plan races (user_id null) plus this user's own; RLS hides everyone else's.
    async list(planVersion){
      const { data, error } = await supabase
        .from('races')
        .select('*')
        .eq('plan_version', planVersion)
        .order('race_date');
      checkError(error);
      return data || [];
    },
    async create(userId, race){
      const { data, error } = await supabase
        .from('races')
        .insert({ ...race, user_id: userId })
        .select()
        .single();
      checkError(error);
      return data;
    },
    async remove(userId, raceId){
      const { error } = await supabase
        .from('races')
        .delete()
        .eq('id', raceId)
        .eq('user_id', userId);
      checkError(error);
    }
  },

  // Day swaps: "on log_date, do source_date's planned session". Only
  // non-identity entries are stored; see daySwap.js.
  daySwaps: {
    async listRange(userId, fromDate, toDate){
      const { data, error } = await supabase
        .from('day_swaps')
        .select('log_date, source_date')
        .eq('user_id', userId)
        .gte('log_date', fromDate)
        .lte('log_date', toDate);
      checkError(error);
      return data || [];
    },
    async upsertMany(userId, rows){
      if (!rows.length) return;
      const { error } = await supabase
        .from('day_swaps')
        .upsert(rows.map((r) => ({ user_id: userId, log_date: r.log_date, source_date: r.source_date })), { onConflict: 'user_id,log_date' });
      checkError(error);
    },
    async removeMany(userId, dates){
      if (!dates.length) return;
      const { error } = await supabase
        .from('day_swaps')
        .delete()
        .eq('user_id', userId)
        .in('log_date', dates);
      checkError(error);
    }
  },

  // "Booked" ticks. Effective booked = this row if present, else the race's own
  // status === 'entered' (so only the Edale 50km starts ticked).
  raceBooked: {
    async list(userId){
      const { data, error } = await supabase
        .from('race_booked')
        .select('race_id, booked')
        .eq('user_id', userId);
      checkError(error);
      return data || [];
    },
    async set(userId, raceId, booked){
      const { error } = await supabase
        .from('race_booked')
        .upsert({ user_id: userId, race_id: raceId, booked, updated_at: new Date().toISOString() }, { onConflict: 'user_id,race_id' });
      checkError(error);
    }
  },

  raceResults: {
    async list(userId){
      const { data, error } = await supabase
        .from('race_results')
        .select('*')
        .eq('user_id', userId);
      checkError(error);
      return data || [];
    },
    async upsert(userId, raceId, finishSeconds, notes){
      const { data, error } = await supabase
        .from('race_results')
        .upsert(
          { user_id: userId, race_id: raceId, finish_time_seconds: finishSeconds, notes: notes || null, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,race_id' }
        )
        .select()
        .single();
      checkError(error);
      return data;
    },
    async remove(userId, raceId){
      const { error } = await supabase
        .from('race_results')
        .delete()
        .eq('user_id', userId)
        .eq('race_id', raceId);
      checkError(error);
    }
  },

  rules: {
    async list(){
      const { data, error } = await supabase
        .from('rules')
        .select('*')
        .order('order_num');
      checkError(error);
      return data || [];
    }
  },

  prepTasks: {
    async list(blockId){
      const { data, error } = await supabase
        .from('prep_tasks')
        .select('*')
        .eq('block_id', blockId)
        .order('sort_order');
      checkError(error);
      return data || [];
    }
  },

  prepChecks: {
    async listForWeek(userId, weekStartDate){
      const { data, error } = await supabase
        .from('prep_checks')
        .select('*')
        .eq('user_id', userId)
        .eq('week_start_date', weekStartDate);
      checkError(error);
      return data || [];
    },
    async upsert(userId, weekStartDate, taskId, isChecked){
      const { data, error } = await supabase
        .from('prep_checks')
        .upsert(
          { user_id: userId, week_start_date: weekStartDate, task_id: taskId, is_checked: isChecked, checked_at: isChecked ? new Date().toISOString() : null },
          { onConflict: 'user_id,week_start_date,task_id' }
        )
        .select()
        .single();
      checkError(error);
      return data;
    }
  },

  shoppingListItems: {
    async list(blockId){
      const { data, error } = await supabase
        .from('shopping_list_items')
        .select('*')
        .eq('block_id', blockId)
        .order('sort_order');
      checkError(error);
      return data || [];
    }
  },

  shoppingChecks: {
    async listForWeek(userId, weekStartDate){
      const { data, error } = await supabase
        .from('shopping_checks')
        .select('*')
        .eq('user_id', userId)
        .eq('week_start_date', weekStartDate);
      checkError(error);
      return data || [];
    },
    async upsert(userId, weekStartDate, itemId, isChecked){
      const { data, error } = await supabase
        .from('shopping_checks')
        .upsert(
          { user_id: userId, week_start_date: weekStartDate, item_id: itemId, is_checked: isChecked, checked_at: isChecked ? new Date().toISOString() : null },
          { onConflict: 'user_id,week_start_date,item_id' }
        )
        .select()
        .single();
      checkError(error);
      return data;
    }
  },

  // Lifting tab: a read-only mirror of Hevy, filled by the `hevy-sync`
  // Edge Function. The browser never writes these tables.
  hevy: {
    async syncState(userId){
      const { data, error } = await supabase
        .from('hevy_sync_state')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      checkError(error);
      return data;
    },
    // Every set since `sinceIso`, oldest first. PostgREST caps a response
    // at 1,000 rows, so page through with range() until a short page.
    async listSets(userId, sinceIso){
      const pageSize = 1000;
      const out = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from('hevy_sets')
          .select('hevy_workout_id, exercise_index, set_index, exercise_template_id, exercise_title, set_type, weight_kg, reps, distance_m, duration_s, performed_at')
          .eq('user_id', userId)
          .gte('performed_at', sinceIso)
          .order('performed_at')
          .order('exercise_index')
          .order('set_index')
          .range(from, from + pageSize - 1);
        checkError(error);
        out.push(...(data || []));
        if (!data || data.length < pageSize) break;
      }
      return out;
    },
    async listWorkouts(userId, sinceIso){
      const { data, error } = await supabase
        .from('hevy_workouts')
        .select('hevy_id, title, start_time, end_time')
        .eq('user_id', userId)
        .gte('start_time', sinceIso)
        .order('start_time');
      checkError(error);
      return data || [];
    },
    async listTemplates(ids){
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from('hevy_exercise_templates')
        .select('id, title, primary_muscle_group, secondary_muscle_groups, equipment')
        .in('id', ids);
      checkError(error);
      return data || [];
    },
    async runSync(){
      const { data, error } = await supabase.functions.invoke('hevy-sync', { method: 'POST' });
      if (error) {
        // FunctionsHttpError carries the JSON body on `context`.
        let detail = null;
        try { detail = await error.context.json(); } catch (_) { /* not JSON */ }
        const err = new Error((detail && detail.message) || error.message || 'Sync failed');
        err.code = detail && detail.error;
        throw err;
      }
      return data;
    }
  }
};
