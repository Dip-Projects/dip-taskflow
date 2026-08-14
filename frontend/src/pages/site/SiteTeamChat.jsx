import { useEffect, useState } from 'react';

function authHeaders() {
  const token = localStorage.getItem('tf_token') || '';
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: { ...authHeaders(), ...(opts.headers || {}) },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function kindTag(r) {
  if (r.kind === 'team' || /team group/i.test(r.title || '')) return 'Team';
  if (r.kind === 'project') return 'Group';
  return 'DM';
}

export default function SiteTeamChat({ user }) {
  const [rooms, setRooms] = useState([]);
  const [directory, setDirectory] = useState([]);
  const [peerId, setPeerId] = useState('');
  const [active, setActive] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const loadRooms = async () => {
    try {
      const list = await api('/bot/chats');
      setRooms(list || []);
      setErr('');
    } catch (e) {
      setErr(e.message);
    }
  };

  useEffect(() => {
    loadRooms();
    api('/bot/directory').then(setDirectory).catch(() => setDirectory([]));
    const t = setInterval(loadRooms, 12000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!active?.id) return undefined;
    let stop = false;
    const pull = async () => {
      try {
        const rows = await api(`/bot/chats/${active.id}/messages`);
        if (!stop) setMsgs(rows || []);
        await api(`/bot/chats/${active.id}/read`, { method: 'POST', body: '{}' });
      } catch (_) {}
    };
    pull();
    const t = setInterval(pull, 6000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [active?.id]);

  const startDm = async () => {
    if (!peerId) return;
    setBusy(true);
    try {
      const room = await api('/bot/chats/dm', { method: 'POST', body: JSON.stringify({ user_id: peerId }) });
      await loadRooms();
      setActive({ id: room.id, kind: 'dm', title: directory.find((u) => u.id === peerId)?.full_name || 'Chat' });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const send = async (e) => {
    e.preventDefault();
    if (!active?.id || !text.trim()) return;
    const body = text.trim();
    setText('');
    try {
      await api(`/bot/chats/${active.id}/messages`, { method: 'POST', body: JSON.stringify({ body }) });
      const rows = await api(`/bot/chats/${active.id}/messages`);
      setMsgs(rows || []);
    } catch (e2) {
      setErr(e2.message);
    }
  };

  return (
    <div className="stc">
      <h2 className="stc-title">Team chat</h2>
      <p className="stc-sub">Site team group + project groups + 1:1 chat. MIS can hide this from Who sees what.</p>
      {err ? <div className="stc-err">{err}</div> : null}
      <div className="stc-grid">
        <aside className="stc-side">
          <label>Start 1:1 chat</label>
          <select value={peerId} onChange={(e) => setPeerId(e.target.value)}>
            <option value="">Select colleague…</option>
            {(directory || []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name}{u.department ? ` · ${u.department}` : ''}
              </option>
            ))}
          </select>
          <button type="button" className="stc-btn" onClick={startDm} disabled={!peerId || busy}>Start chat</button>
          <div className="stc-rooms">
            {(rooms || []).length === 0 ? (
              <div className="stc-empty">No groups yet — open this page once after SQL is run, or start a 1:1 chat.</div>
            ) : (
              rooms.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={`stc-room${active?.id === r.id ? ' on' : ''}`}
                  onClick={() => setActive(r)}
                >
                  <span>{r.title || r.kind} <em>{kindTag(r)}</em></span>
                  {r.unread_count > 0 && active?.id !== r.id ? <b>{r.unread_count}</b> : null}
                </button>
              ))
            )}
          </div>
        </aside>
        <section className="stc-main">
          <div className="stc-head">{active?.title || 'Select a team or project group'}</div>
          <div className="stc-log">
            {(msgs || []).map((m) => (
              <div key={m.id} className={`stc-msg${m.sender_id === user?.id ? ' mine' : ''}${m.is_bot ? ' bot' : ''}`}>
                <small>{m.sender?.full_name || (m.is_bot ? 'System' : 'Member')}</small>
                <div>{m.body}</div>
              </div>
            ))}
          </div>
          <form className="stc-send" onSubmit={send}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={active ? 'Type a message…' : 'Pick a chat first'}
              disabled={!active}
            />
            <button type="submit" disabled={!active || !text.trim()}>Send</button>
          </form>
        </section>
      </div>
      <style>{`
        .stc { background:#fffefb; border:1px solid #e8e2d8; border-radius:14px; padding:16px; }
        .stc-title { font-size:1.1rem; margin:0 0 4px; }
        .stc-sub { color:#6b645c; font-size:.82rem; margin:0 0 12px; }
        .stc-err { background:#fef2f2; color:#b91c1c; padding:8px 10px; border-radius:8px; margin-bottom:10px; font-size:.82rem; }
        .stc-grid { display:grid; grid-template-columns: 240px 1fr; gap:12px; min-height:420px; }
        .stc-side { display:flex; flex-direction:column; gap:8px; }
        .stc-side label { font-size:.75rem; font-weight:700; }
        .stc-side select { padding:8px; border-radius:8px; border:1px solid #d4ccc0; }
        .stc-btn { padding:8px 10px; border:0; border-radius:8px; background:#0f766e; color:#fff; font-weight:700; cursor:pointer; }
        .stc-rooms { display:flex; flex-direction:column; gap:6px; overflow:auto; max-height:340px; }
        .stc-room { text-align:left; padding:8px 10px; border:1px solid #e8e2d8; background:#fff; border-radius:8px; cursor:pointer; display:flex; justify-content:space-between; gap:8px; }
        .stc-room.on { border-color:#0f766e; background:#f0fdfa; }
        .stc-room em { font-style:normal; font-size:.68rem; color:#0f766e; margin-left:6px; }
        .stc-room b { background:#0f766e; color:#fff; border-radius:999px; padding:0 6px; font-size:.7rem; }
        .stc-empty { font-size:.8rem; color:#6b645c; }
        .stc-main { display:flex; flex-direction:column; border:1px solid #e8e2d8; border-radius:10px; min-height:420px; }
        .stc-head { padding:10px 12px; font-weight:700; border-bottom:1px solid #e8e2d8; }
        .stc-log { flex:1; overflow:auto; padding:10px; display:flex; flex-direction:column; gap:8px; }
        .stc-msg { background:#f5f2ee; padding:8px 10px; border-radius:10px; max-width:80%; }
        .stc-msg.mine { align-self:flex-end; background:#ccfbf1; }
        .stc-msg.bot { background:#fff7ed; }
        .stc-msg small { display:block; font-size:.68rem; color:#6b645c; margin-bottom:2px; }
        .stc-send { display:flex; gap:8px; padding:10px; border-top:1px solid #e8e2d8; }
        .stc-send input { flex:1; padding:8px 10px; border-radius:8px; border:1px solid #d4ccc0; }
        .stc-send button { padding:8px 14px; border:0; border-radius:8px; background:#0f766e; color:#fff; font-weight:700; }
        @media (max-width:800px) { .stc-grid { grid-template-columns:1fr; } }
      `}</style>
    </div>
  );
}
