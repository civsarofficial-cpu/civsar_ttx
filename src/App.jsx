import React, { useEffect, useState } from 'react';
import Library from './pages/Library.jsx'; import Planner from './pages/Planner.jsx'; import Control from './pages/Control.jsx';
import Player from './pages/Player.jsx'; import Display from './pages/Display.jsx'; import Debrief from './pages/Debrief.jsx'; import Settings from './pages/Settings.jsx';
import { backendName } from './lib/backend.js';
export const go = h => (location.hash = h);
const useHash = () => { const [h, set] = useState(location.hash.slice(1) || '/'); useEffect(() => { const f = () => set(location.hash.slice(1) || '/'); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []); return h; };
export default function App() {
  const h = useHash(); const [, page, arg] = h.split('/');
  const body = page === 'plan' ? <Planner id={arg} /> : page === 'control' ? <Control code={arg} /> : page === 'play' ? <Player code={arg} />
    : page === 'display' ? <Display code={arg} /> : page === 'debrief' ? <Debrief code={arg} /> : page === 'settings' ? <Settings /> : <Library />;
  if (page === 'display') return body;
  return <>
    <div className="banner">Training tool. CIVSAR is a volunteer initiative. In a real emergency, dial <b>117</b>. Exercise messages begin and end with "EXERCISE EXERCISE EXERCISE".</div>
    <div className="top"><a href="#/" className="brand" style={{ color: 'inherit', textDecoration: 'none' }}>CIVSAR <b>TTX</b></a>
      <a href="#/" className="small">Library</a><a href="#/play/" className="small">Join exercise</a><a href="#/settings" className="small">Settings</a>
      <span className="sp" /><span className="pill">{backendName}</span></div>
    {body}</>;
}
