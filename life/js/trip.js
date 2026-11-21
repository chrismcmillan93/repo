// "Today on a trip": what your USA trip plan says about today (your own trip, read with your
// signed-in session; days are real dates). Other trip apps are deliberately not read here.
// Read-only: nothing here writes to the trip app. Each loader returns null when there is nothing
// for today, and never throws, so Today is never held up by a trip app.
import { supabase } from './supabaseClient.js';
import { todayStr, addDays } from './fit/utils.js';
import { orderEntries } from './tripmatch.js';

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
  const all = await Promise.all([loadUsa(today)]);
  return all.filter(Boolean);
}
