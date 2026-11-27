// The modules in this folder (db.js, utils.js, nutrition.js, state.js, sessionChoices.js,
// analysis.js, ...) work on the `fitness` schema and expect a client whose default schema
// is `fitness`; this shim gives them that view of the app's single Supabase client, so
// there is one session and one auth listener.
import { supabase as life } from '../supabaseClient.js';

export const supabase = {
  from: (table) => life.schema('fitness').from(table),
  rpc: (fn, args) => life.schema('fitness').rpc(fn, args),
  functions: life.functions,
  auth: life.auth
};
