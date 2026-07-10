import React, { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ref, onValue, update } from 'firebase/database';
import { db } from '../firebase';
import Button from '../components/Button';
import { playClip, isNarrator } from '../audio';

// ลำดับการลืมตาของ Salem: แม่มดฆ่า -> สายตรวจปกป้อง
const SALEM_WAKE = ['witch', 'constable'];

const Title = ({ title, desc, color }) => (
  <div className="text-center">
    <h2 style={{ color }}>{title}</h2>
    {desc && <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{desc}</p>}
  </div>
);

const SleepView = ({ msg = 'หลับตา... 😴' }) => (
  <div className="text-center animate-fade-in" style={{ padding: '3rem 1rem' }}>
    <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🌙</div>
    <h2 style={{ color: 'var(--text-secondary)' }}>{msg}</h2>
  </div>
);

export default function SalemNight() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const playerName = searchParams.get('name');
  const navigate = useNavigate();

  const [roomData, setRoomData] = useState(null);
  const [target, setTarget] = useState(null);
  const [showIntro, setShowIntro] = useState(false);
  const [introRound, setIntroRound] = useState(0);
  const spokenTurnRef = useRef(null);

  // subscribe
  useEffect(() => {
    if (!roomId || !playerName) { navigate('/'); return; }
    const unsub = onValue(ref(db, `rooms/${roomId}`), (snap) => {
      if (snap.exists()) {
        const data = snap.val();
        setRoomData(data);
        if (data.status === 'morning') navigate(`/morning/${roomId}?name=${playerName}`);
      } else navigate('/');
    });
    return () => unsub();
  }, [roomId, playerName, navigate]);

  // banner คืน
  useEffect(() => {
    if (roomData?.status === 'night' && roomData?.round && roomData.round !== introRound) {
      setIntroRound(roomData.round);
      setShowIntro(true);
      spokenTurnRef.current = null;
      if (isNarrator(roomData, playerName)) playClip('sl_night');
      const amMod = roomData?.players?.[playerName]?.role === 'moderator';
      if (!amMod) {
        const t = setTimeout(() => setShowIntro(false), 2200);
        return () => clearTimeout(t);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomData?.round, roomData?.status, playerName]);

  // เสียงพากย์ตอนเปลี่ยนคิว role (narrator, หลังปิด banner)
  useEffect(() => {
    if (!roomData || roomData.status !== 'night' || showIntro) return;
    if (!isNarrator(roomData, playerName)) return;
    const turn = roomData.currentTurn;
    if (turn && turn !== spokenTurnRef.current) {
      spokenTurnRef.current = turn;
      playClip('sl_' + turn); // เล่น sl_<role>.mp3 ถ้ามี (ไม่มีก็ข้าม)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomData?.currentTurn, roomData?.status, showIntro, playerName]);

  // HOST ENGINE (Salem)
  useEffect(() => {
    if (!roomData || roomData.host !== playerName) return;
    const currentTurn = roomData.currentTurn || SALEM_WAKE[0];
    const playersList = Object.values(roomData.players || {}).filter(Boolean);
    const livingPlayers = playersList.filter(p => !p.isDead && p.role !== 'moderator');
    const nightActions = roomData.nightActions || {};

    const advanceTurn = (next) => update(ref(db, `rooms/${roomId}`), { currentTurn: next });
    const finishNight = () => update(ref(db, `rooms/${roomId}`), { status: 'morning' });

    const processQueue = async () => {
      const idx = Math.max(0, SALEM_WAKE.indexOf(currentTurn));
      for (let i = idx; i < SALEM_WAKE.length; i++) {
        const role = SALEM_WAKE[i];
        let shouldWait = false;

        if (role === 'witch') {
          const witches = livingPlayers.filter(p => p.role === 'witch');
          if (witches.length === 0) shouldWait = false;
          else {
            const votes = nightActions.witchVotes || {};
            const counts = {};
            Object.values(votes).forEach(t => { if (t) counts[t] = (counts[t] || 0) + 1; });
            shouldWait = true;
            for (const [t, c] of Object.entries(counts)) {
              if (c === witches.length) {
                await update(ref(db, `rooms/${roomId}/nightActions`), { witchTarget: t });
                shouldWait = false;
                break;
              }
            }
          }
        } else if (role === 'constable') {
          const cons = livingPlayers.filter(p => p.role === 'constable');
          if (cons.length === 0 || nightActions.constableDone) shouldWait = false;
          else shouldWait = true;
        }

        if (shouldWait) {
          if (currentTurn !== role) await advanceTurn(role);
          return;
        }
      }
      await finishNight();
    };

    processQueue();
  }, [roomData, playerName, roomId]);

  if (!roomData || !roomData.currentTurn) return <div className="text-center mt-8">กำลังโหลด...</div>;

  const currentTurn = roomData.currentTurn;
  const me = roomData.players[playerName] || {};
  const myRole = me.role;
  const isDead = me.isDead;
  const isModerator = myRole === 'moderator';
  const playersList = Object.values(roomData.players || {}).filter(Boolean);
  const livingPlayers = playersList.filter(p => !p.isDead && p.role !== 'moderator');
  const nightActions = roomData.nightActions || {};
  const round = roomData.round || 1;

  // คนตาย: banner แดง
  if (isDead && !isModerator) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', textAlign: 'center', padding: '2rem', background: 'radial-gradient(circle, rgba(139,0,0,0.88) 0%, rgba(0,0,0,1) 100%)' }}>
        <div style={{ fontSize: '5.5rem' }}>💀</div>
        <h1 style={{ color: '#ff3333', fontSize: '2.8rem', textShadow: '0 0 20px rgba(255,0,0,0.6)', margin: 0 }}>คุณตายแล้ว</h1>
        <p style={{ color: 'white', opacity: 0.85 }}>เป็นวิญญาณเร่ร่อน... ห้ามพูดหรือใบ้คนอื่น 👻</p>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.9rem' }}>คุณจะไม่ถูกปลุกอีก</p>
      </div>
    );
  }

  // banner เข้าคืน
  if (showIntro) {
    return (
      <div className="animate-fade-in" style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', padding: '2rem', background: 'radial-gradient(circle, rgba(60,15,15,0.97) 0%, rgba(0,0,0,1) 100%)' }}>
        <div style={{ fontSize: '5.5rem', filter: 'drop-shadow(0 0 25px rgba(226,43,43,0.7))' }}>🧙‍♀️</div>
        <h1 style={{ color: '#ff6b6b', fontSize: '3.5rem', letterSpacing: '3px', textShadow: '0 0 25px rgba(226,43,43,0.6)', margin: 0 }}>คืนที่ {round}</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>{isModerator ? 'พร้อมคุมเกมไหม?' : 'ทุกคนหลับตา... 😴'}</p>
        {isModerator && (
          <div style={{ width: '100%', maxWidth: '320px', marginTop: '0.5rem' }}>
            <Button onClick={() => setShowIntro(false)} size="lg">👑 เข้าแผงควบคุม</Button>
          </div>
        )}
      </div>
    );
  }

  // --- MODERATOR ---
  if (isModerator) {
    const forceSkip = () => {
      const idx = SALEM_WAKE.indexOf(currentTurn);
      if (idx < SALEM_WAKE.length - 1) update(ref(db, `rooms/${roomId}`), { currentTurn: SALEM_WAKE[idx + 1] });
      else update(ref(db, `rooms/${roomId}`), { status: 'morning' });
    };
    const resetToNight1 = async () => {
      if (!window.confirm('รีเซ็ตกลับคืนที่ 1? (ฟื้นทุกคน ล้างการกระทำ) — สำหรับเทส')) return;
      const updates = {};
      updates[`rooms/${roomId}/round`] = 1;
      updates[`rooms/${roomId}/status`] = 'night';
      updates[`rooms/${roomId}/currentTurn`] = 'witch';
      updates[`rooms/${roomId}/morningResult`] = null;
      updates[`rooms/${roomId}/morningCalcRound`] = null;
      updates[`rooms/${roomId}/winner`] = null;
      updates[`rooms/${roomId}/nightActions`] = { witchVotes: {}, witchTarget: null, constableProtect: null, constableDone: false };
      playersList.forEach(p => { updates[`rooms/${roomId}/players/${p.name}/isDead`] = false; });
      await update(ref(db), updates);
    };
    return (
      <div className="glass-panel animate-fade-in theme-salem" style={{ margin: '2rem 1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h2 className="text-center" style={{ color: '#ff6b6b' }}>👑 แผงควบคุม Moderator (Salem)</h2>
        <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
          <p>สถานะ: <strong>กำลังเป็นคิวของ {currentTurn === 'witch' ? 'แม่มด 🧙‍♀️' : 'สายตรวจ 🔨'}</strong></p>
          <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem', fontSize: '0.9rem' }}>
            <p><strong>แม่มดจะฆ่า:</strong> {nightActions.witchTarget || '— (ยังไม่ตกลงกัน)'}</p>
            <p><strong>สายตรวจปกป้อง:</strong> {nightActions.constableProtect || '—'}</p>
          </div>
        </div>
        <Button onClick={forceSkip} variant="danger">บังคับข้ามคิว</Button>
        <Button onClick={resetToNight1} variant="secondary">🔄 รีเซ็ตเป็นคืน 1 (เทส)</Button>
      </div>
    );
  }

  // --- แม่มด: โหวตฆ่า ---
  if (currentTurn === 'witch' && myRole === 'witch') {
    const witches = playersList.filter(p => p.role === 'witch');
    const targets = livingPlayers.filter(p => p.role !== 'witch');
    const votes = nightActions.witchVotes || {};
    const pick = async (name) => {
      const newName = votes[playerName] === name ? null : name;
      await update(ref(db, `rooms/${roomId}/nightActions/witchVotes`), { [playerName]: newName });
    };
    return (
      <div className="glass-panel animate-fade-in theme-salem" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="🧙‍♀️ แม่มด" desc={witches.length > 1 ? `เลือกคนที่จะฆ่า (แม่มด ${witches.length} คนต้องเลือกตรงกัน)` : 'เลือกคนที่จะฆ่าคืนนี้'} color="#ff6b6b" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.5rem', maxHeight: '320px', overflowY: 'auto' }}>
          {targets.map(p => {
            const voters = Object.entries(votes).filter(([, v]) => v === p.name).map(([k]) => k);
            const mine = votes[playerName] === p.name;
            return (
              <div key={p.name} onClick={() => pick(p.name)} style={{ background: mine ? 'rgba(255,0,0,0.3)' : 'rgba(255,255,255,0.05)', border: mine ? '1px solid red' : '1px solid transparent', padding: '1rem', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }}>
                <span>{p.name}</span>
                <div style={{ display: 'flex', gap: '0.25rem' }}>{voters.map(v => <span key={v}>🧙‍♀️</span>)}</div>
              </div>
            );
          })}
        </div>
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>เลือกแล้วรอแม่มดอีกคน / รอ Mod ดำเนินต่อ — คำตอบถูกซ่อนจากคนอื่น</p>
      </div>
    );
  }

  // --- สายตรวจ: ปกป้อง ---
  if (currentTurn === 'constable' && myRole === 'constable') {
    const submit = async () => {
      await update(ref(db, `rooms/${roomId}/nightActions`), { constableProtect: target || null, constableDone: true });
      setTarget(null);
    };
    return (
      <div className="glass-panel animate-fade-in theme-salem" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="🔨 สายตรวจ" desc="เลือกคนที่จะปกป้อง 1 คน (ถ้าตรงกับเป้าหมายแม่มด คนนั้นจะรอด)" color="#4cc9f0" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.5rem', maxHeight: '320px', overflowY: 'auto' }}>
          {livingPlayers.map(p => {
            const sel = target === p.name;
            return (
              <div key={p.name} onClick={() => setTarget(sel ? null : p.name)} style={{ background: sel ? 'rgba(76,201,240,0.3)' : 'rgba(255,255,255,0.05)', border: sel ? '1px solid #4cc9f0' : '1px solid transparent', padding: '1rem', borderRadius: '12px', textAlign: 'center', cursor: 'pointer' }}>
                {sel ? '🛡️' : '🤍'} {p.name} {p.name === playerName && '(คุณ)'}
              </div>
            );
          })}
        </div>
        <Button onClick={submit} disabled={!target}>🛡️ ปกป้อง {target || ''}</Button>
      </div>
    );
  }

  // คนอื่น (ชาวเมือง / คนบ้า / แม่มดที่ยังไม่ถึงคิว ฯลฯ)
  return <SleepView />;
}
