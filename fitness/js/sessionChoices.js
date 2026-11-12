// The specific sessions you can say you did when you pick Weights or Cardio
// for a day. Weights match the three Hevy routines in the plan; cardio covers
// the run types the plan uses. "Other" is there so any day can still be logged.
export const WEIGHT_SESSIONS = ['Full Body #1', 'Full Body #2', 'Full Body #3', 'Other weights'];
export const CARDIO_SESSIONS = [
  'Easy run', 'Long run', 'Strides / hill sprints', 'Steady run', 'Hills / climbing',
  'Shakeout', 'Walk / hike', 'Other cardio'
];

export function sessionOptions(kind){
  return kind === 'weights' ? WEIGHT_SESSIONS : CARDIO_SESSIONS;
}

// What a pick shows as its title: the chosen session, else the generic label.
export function pickTitle(kind, sessionName){
  return sessionName || (kind === 'weights' ? 'Weights session' : 'Cardio session');
}
