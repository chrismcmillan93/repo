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
    async list(blockId){
      const { data, error } = await supabase
        .from('meal_templates')
        .select('*')
        .eq('block_id', blockId)
        .order('slot_order');
      checkError(error);
      return data || [];
    }
  },

  sessionTemplates: {
    async list(blockId){
      const { data, error } = await supabase
        .from('session_templates')
        .select('*, session_exercises(*)')
        .eq('block_id', blockId)
        .order('day_of_week');
      checkError(error);
      return data || [];
    }
  },

  runPlan: {
    async list(blockId){
      const { data, error } = await supabase
        .from('run_plan')
        .select('*')
        .eq('block_id', blockId)
        .order('week_number')
        .order('day_of_week');
      checkError(error);
      return data || [];
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
  }
};
