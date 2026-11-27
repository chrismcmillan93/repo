// The readiness line for the morning brief, from the result of readiness() (readiness.js). Plain JavaScript with
// no Deno or browser APIs, so the app's tests can import it (life/tests/readinessline.test.mjs).
//
// r: the readiness() result ({ score, verdict, worst }) or null; hasSession: whether a session is planned today.
// Easy names the weakest number and says what to do about today's session; Push says it is a good day; Normal
// just gives the score. No result (not enough data yet, or last night has not synced) means no line.
const WORD = { push: 'Push', normal: 'Normal', easy: 'Easy' };

export function readinessLine(r, hasSession){
  if (!r) return null;
  const head = `Readiness ${r.score}, ${WORD[r.verdict]}.`;
  if (r.verdict === 'easy') {
    const why = r.worst ? ` Weakest: ${r.worst.label} ${r.worst.text}.` : '';
    return `${head}${why} ${hasSession ? "Go easy on today's session, or swap it." : 'Keep today light.'}`;
  }
  if (r.verdict === 'push') return `${head} Good day to hit it.`;
  return head;
}
