// Storage + realtime. Uses Supabase when VITE_SUPABASE_URL/KEY are set; otherwise localStorage + BroadcastChannel
// (works offline; syncs between tabs/windows on the same device — e.g. facilitator laptop + projector window).
import { createClient } from '@supabase/supabase-js';
const URL_ = import.meta.env.VITE_SUPABASE_URL, KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const cfg = (() => { try { return JSON.parse(localStorage.getItem('ttx:supabase') || 'null'); } catch { return null; } })();
const url = cfg?.url || URL_, key = cfg?.key || KEY;
export const sb = url && key ? createClient(url, key) : null;
export const backendName = sb ? 'Supabase (cloud sync)' : 'Local (this device)';
export function setSupabaseConfig(c) { c ? localStorage.setItem('ttx:supabase', JSON.stringify(c)) : localStorage.removeItem('ttx:supabase'); location.reload(); }

const ls = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  // Shared files can fill the ~5 MB localStorage quota. Fail with something a facilitator can act
  // on rather than a raw QuotaExceededError that would strand the session mid-exercise.
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {
    if (String(e.name).includes('Quota') || e.code === 22) throw new Error('This device is out of local storage — delete some shared files, or configure Supabase so files are not kept in the browser.');
    throw e; } }
};
const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('civsar-ttx') : null;

/* ---------- exercise library ---------- */
export async function listExercises() {
  const local = ls.get('ttx:exercises', {});
  if (!sb) return Object.values(local).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const { data, error } = await sb.from('ttx_exercises').select('data').order('updated_at', { ascending: false });
  if (error) { console.warn(error); return Object.values(local); }
  return data.map(d => d.data);
}
export async function saveExercise(s) {
  const all = ls.get('ttx:exercises', {}); all[s.id] = s; ls.set('ttx:exercises', all);
  if (sb) { const { error } = await sb.from('ttx_exercises').upsert({ id: s.id, title: s.title, data: s, updated_at: new Date().toISOString() }); if (error) throw error; }
}
export async function deleteExercise(id) {
  const all = ls.get('ttx:exercises', {}); delete all[id]; ls.set('ttx:exercises', all);
  if (sb) await sb.from('ttx_exercises').delete().eq('id', id);
}

/* ---------- live sessions ---------- */
const code6 = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
export const initialState = () => ({ status: 'ready', startedAt: null, offsetMs: 0, released: {}, auto: true, speed: 1, phase: '' });

export async function createSession(scenario) {
  const code = code6(); const rec = { code, scenario, state: initialState(), events: [] };
  if (sb) { const { error } = await sb.from('ttx_sessions').insert({ code, exercise_id: null, scenario, state: rec.state }); if (error) throw error; }
  else ls.set('ttx:sess:' + code, rec);
  const mine = ls.get('ttx:mysessions', []); mine.unshift({ code, title: scenario.title, at: Date.now() }); ls.set('ttx:mysessions', mine.slice(0, 30));
  return code;
}
export const mySessions = () => ls.get('ttx:mysessions', []);

// Subscribe to a session; cb({scenario,state,events}) on every change. Returns controller.
export async function openSession(code, cb) {
  code = code.toUpperCase();
  let rec;
  if (sb) {
    const { data: s, error } = await sb.from('ttx_sessions').select('*').eq('code', code).single();
    if (error || !s) throw new Error('Session not found');
    const { data: ev } = await sb.from('ttx_session_events').select('*').eq('code', code).order('created_at');
    rec = { code, scenario: s.scenario, state: s.state, events: ev || [] };
    const ch = sb.channel('s-' + code)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'ttx_sessions', filter: `code=eq.${code}` }, p => { rec = { ...rec, state: p.new.state, scenario: p.new.scenario }; cb(rec); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'ttx_session_events', filter: `code=eq.${code}` }, p => { if (!rec.events.some(e => e.id === p.new.id)) { rec = { ...rec, events: [...rec.events, p.new] }; cb(rec); } })
      .subscribe();
    cb(rec);
    return {
      get: () => rec,
      setState: async patch => { const state = { ...rec.state, ...(typeof patch === 'function' ? patch(rec.state) : patch) }; rec = { ...rec, state }; cb(rec); await sb.from('ttx_sessions').update({ state }).eq('code', code); },
      setScenario: async scenario => { rec = { ...rec, scenario }; cb(rec); await sb.from('ttx_sessions').update({ scenario }).eq('code', code); },
      emit: async e => { const { data } = await sb.from('ttx_session_events').insert({ code, ...e }).select().single(); if (data && !rec.events.some(x => x.id === data.id)) { rec = { ...rec, events: [...rec.events, data] }; cb(rec); } },
      close: () => sb.removeChannel(ch)
    };
  }
  const k = 'ttx:sess:' + code;
  rec = ls.get(k, null); if (!rec) throw new Error('Session not found on this device. (Local mode only syncs on one device — configure Supabase for multi-device play.)');
  const onMsg = m => { if (m.data?.code === code) { rec = ls.get(k, rec); cb(rec); } };
  bc?.addEventListener('message', onMsg);
  const onStore = e => { if (e.key === k) { rec = ls.get(k, rec); cb(rec); } }; addEventListener('storage', onStore);
  const commit = () => { ls.set(k, rec); bc?.postMessage({ code }); cb(rec); };
  cb(rec);
  return {
    get: () => rec,
    setState: async patch => { rec = { ...rec, state: { ...rec.state, ...(typeof patch === 'function' ? patch(rec.state) : patch) } }; commit(); },
    setScenario: async scenario => { rec = { ...rec, scenario }; commit(); },
    // Roll back in memory if the write fails, so what is on screen matches what is stored.
    emit: async e => { const prev = rec; rec = { ...rec, events: [...rec.events, { id: Date.now() + Math.random(), created_at: new Date().toISOString(), payload: {}, ...e }] };
      try { commit(); } catch (err) { rec = prev; cb(rec); throw err; } },
    close: () => { bc?.removeEventListener('message', onMsg); removeEventListener('storage', onStore); }
  };
}
export const elapsedOf = st => st.status === 'running' ? st.offsetMs + (Date.now() - st.startedAt) * (st.speed || 1) : st.offsetMs;
