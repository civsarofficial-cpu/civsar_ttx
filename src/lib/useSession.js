import { useEffect, useRef, useState } from 'react';
import { openSession, elapsedOf } from './backend.js';
export function useSession(code) {
  const [rec, setRec] = useState(null); const [err, setErr] = useState(''); const ctl = useRef(null); const [now, setNow] = useState(Date.now());
  // `dead` matters because openSession resolves asynchronously: without it, unmounting before it
  // settles leaves the realtime channel (or the storage/BroadcastChannel listeners) open forever.
  useEffect(() => { if (!code) return; let c = null, dead = false;
    openSession(code, r => { if (!dead) setRec({ ...r }); })
      .then(x => { c = x; if (dead) x.close(); else ctl.current = x; })
      .catch(e => { if (!dead) setErr(e.message); });
    return () => { dead = true; c?.close(); ctl.current = null; }; }, [code]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const elapsed = rec ? elapsedOf(rec.state) : 0;
  const getElapsed = () => (ctl.current ? elapsedOf(ctl.current.get().state) : 0);
  return { rec, err, ctl: ctl.current, elapsed, now, getElapsed };
}
export const releasedInjects = rec => rec ? rec.scenario.injects.filter(i => rec.state.released?.[i.id] != null).sort((a, b) => rec.state.released[b.id] - rec.state.released[a.id]) : [];
export const me = () => { try { return JSON.parse(sessionStorage.getItem('ttx:me') || 'null'); } catch { return null; } };
