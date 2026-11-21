// "Today on a trip": what your trip apps say about today, so one app is enough while you're away.
//   - Thailand (`thailand` schema, the group tracker): its tables are open to the anonymous key
//     only, so this reads them with a separate read-only client that has no session. Days there
//     are text labels like "22 Nov", so today is matched by label.
//   - USA (`usa` schema, your own trip): read with your signed-in session; days are real dates.
// Read-only: nothing here writes to either app. Each loader returns null when there is nothing
// for today, and never throws, so Today is never held up by a trip app.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { supabase } from './supabaseClient.js';
import { todayStr, addDays } from './fit/utils.js';
import { dayLabel, parseLabel, stayToday, orderEntries } from './tripmatch.js';

let anon = null;
function thailandClient(){
  if (!anon) anon = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { db: { schema: 'thailand' }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'life-thailand-anon' } });
  return anon;
}

export async function loadThailand(today = todayStr()){
  try {
    const c = thailandClient(), label = dayLabel(today);
    const { data: trip } = await c.from('trip').select('name,target_departure').limit(1).maybeSingle();
    const year = trip && trip.target_departure ? new Date(trip.target_departure).getUTCFullYear() : Number(today.slice(0, 4));
    if (String(year) !== today.slice(0, 4)) return null;
    const [e, a, f] = await Promise.all([
      c.from('itinerary_entries').select('time_label,text,kind,status,sort_order,is_selected').eq('day_label', label),
      c.from('accommodations').select('name,address,check_in_label,check_out_label'),
      c.from('flight_legs').select('route,airline,when_label,detail,mode,sort_order')
    ]);
    const rows = orderEntries((e.data || []).filter((r) => r.is_selected !== false).map((r) => ({ time: r.time_label || '', text: r.text, tag: r.status || '', dim: r.kind === 'optional', order: Number(r.sort_order) || 0 })));
    const moves = (f.data || []).filter((r) => String(r.when_label || '').includes(label)).map((r) => ({ icon: r.mode === 'ferry' ? '⛴️' : '✈️', route: r.route, when: r.when_label, detail: r.detail || '' }));
    const stay = stayToday((a.data || []).map((s) => ({ name: s.name, address: s.address, in: s.check_in_label, out: s.check_out_label })), today, year);
    if (!rows.length && !moves.length && !stay) return null;
    return { title: `Today in ${(trip && trip.name) || 'Thailand'}`, link: '../thailand/', rows, moves, stay };
  } catch (_) { return null; }
}

export async function loadUsa(today = todayStr()){
  try {
    const { data: trips } = await supabase.schema('usa').from('trips').select('id,name,start_date,end_date').eq('user_id', (await supabase.auth.getUser()).data.user.id);
    const trip = (trips || []).find((t) => t.start_date && t.end_date && today >= t.start_date && today <= t.end_date);
    if (!trip) return null;
    const u = supabase.schema('usa');
    const dayStart = new Date(`${today}T00:00:00`).toISOString(), dayEnd = new Date(`${addDays(today, 1)}T00:00:00`).toISOString();
    const [it, ac, fl] = await Promise.all([
      u.from('itinerary_items').select('title,start_time,end_time,notes,is_selected,choice_group_id,sort_order').eq('trip_id', trip.id).eq('day', today),
      u.from('accommodations').select('name,address,check_in,check_out').eq('trip_id', trip.id).lte('check_in', today).gte('check_out', today),
      u.from('flights').select('label,flight_number,from_airport,to_airport,depart_at').eq('trip_id', trip.id).gte('depart_at', dayStart).lt('depart_at', dayEnd)
    ]);
    const rows = orderEntries((it.data || []).filter((r) => r.is_selected !== false).map((r) => ({ time: (r.start_time || '').slice(0, 5), text: r.title, tag: '', dim: false, order: r.sort_order || 0 })));
    const moves = (fl.data || []).map((r) => ({ icon: '✈️', route: `${r.from_airport} to ${r.to_airport}`, when: new Date(r.depart_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), detail: r.flight_number || r.label || '' }));
    const s = (ac.data || [])[0];
    const stay = s ? { name: s.name, address: s.address || '', note: today === s.check_in ? 'Check in today' : today === s.check_out ? 'Check out today' : 'Staying tonight' } : null;
    if (!rows.length && !moves.length && !stay) return null;
    return { title: `Today in ${trip.name || 'the USA'}`, link: '../usa/', rows, moves, stay };
  } catch (_) { return null; }
}

export async function loadTrips(today = todayStr()){
  const all = await Promise.all([loadThailand(today), loadUsa(today)]);
  return all.filter(Boolean);
}
