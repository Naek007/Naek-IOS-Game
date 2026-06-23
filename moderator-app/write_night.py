import os

content = """import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ref, onValue, update } from 'firebase/database';
import { db } from '../firebase';
import Button from '../components/Button';

const WAKE_ORDER = [
  'doppelganger', 'mason', 'beholder', 'ghost', 'hoodlum', 'cupid', 'dire_wolf', 'minion',
  'bodyguard', 'old_woman', 'spellcaster', 'cult_leader', 'chupacabra', 'vampire',
  'werewolf', 'sorceress', 'aura_seer', 'seer', 'revealer', 'paranormal_investigator',
  'huntress', 'priest', 'witch', 'detective', 'drunk', 'insomniac'
];

const WOLF_ROLES = ['werewolf', 'lone_wolf', 'wolf_cub', 'dire_wolf', 'wolf_man'];
const NON_SPECIAL_ROLES = ['villager', 'werewolf', 'lone_wolf', 'wolf_cub', 'dire_wolf', 'wolf_man'];

export default function Night() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const playerName = searchParams.get('name');
  const navigate = useNavigate();

  const [roomData, setRoomData] = useState(null);
  
  // Local States for Inputs
  const [target1, setTarget1] = useState(null);
  const [target2, setTarget2] = useState(null);
  const [localHeal, setLocalHeal] = useState(false);
  const [localText, setLocalText] = useState('');
  const [checkResult, setCheckResult] = useState(null);
  const [myWolfVotes, setMyWolfVotes] = useState([]);

  useEffect(() => {
    if (!roomId || !playerName) { navigate('/'); return; }
    const unsubscribe = onValue(ref(db, `rooms/${roomId}`), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setRoomData(data);
        if (data.status === 'morning') navigate(`/morning/${roomId}?name=${playerName}`);
      } else navigate('/');
    });
    return () => unsubscribe();
  }, [roomId, playerName, navigate]);

  // --- HOST ENGINE ---
  useEffect(() => {
    if (!roomData || roomData.host !== playerName) return;

    const currentTurn = roomData.currentTurn || WAKE_ORDER[0];
    const playersList = Object.values(roomData.players || {});
    const livingPlayers = playersList.filter(p => !p.isDead && p.role !== 'moderator');
    const nightActions = roomData.nightActions || {};
    const gameData = roomData.gameData || {};
    const round = roomData.round || 1;

    const advanceTurn = async (nextTurn) => {
      await update(ref(db, `rooms/${roomId}`), { currentTurn: nextTurn });
    };
    const finishNight = async () => {
      await update(ref(db, `rooms/${roomId}`), { status: 'morning' });
    };

    // Generic check for roles
    const handleTurn = (roleName, isNightOneOnly, customCheck = null) => {
      if (isNightOneOnly && round !== 1) return false;
      const actors = playersList.filter(p => p.role === roleName && (!p.isDead || roleName === 'ghost'));
      if (actors.length === 0 || nightActions[`${roleName}Done`]) return false;
      if (customCheck && !customCheck()) return false;
      return true; // Wait for them
    };

    const processQueue = async () => {
      const idx = WAKE_ORDER.indexOf(currentTurn);
      for (let i = idx; i < WAKE_ORDER.length; i++) {
        const role = WAKE_ORDER[i];
        let shouldWait = false;

        if (role === 'doppelganger') shouldWait = handleTurn('doppelganger', true);
        else if (role === 'mason') shouldWait = handleTurn('mason', true);
        else if (role === 'beholder') shouldWait = handleTurn('beholder', true);
        else if (role === 'ghost') shouldWait = handleTurn('ghost', false);
        else if (role === 'hoodlum') shouldWait = handleTurn('hoodlum', true);
        else if (role === 'cupid') shouldWait = handleTurn('cupid', true);
        else if (role === 'dire_wolf') shouldWait = handleTurn('dire_wolf', true);
        else if (role === 'minion') shouldWait = handleTurn('minion', true);
        else if (role === 'bodyguard') shouldWait = handleTurn('bodyguard', false);
        else if (role === 'old_woman') shouldWait = handleTurn('old_woman', false);
        else if (role === 'spellcaster') shouldWait = handleTurn('spellcaster', false);
        else if (role === 'cult_leader') shouldWait = handleTurn('cult_leader', false);
        else if (role === 'chupacabra') shouldWait = handleTurn('chupacabra', false);
        else if (role === 'vampire') shouldWait = handleTurn('vampire', false);
        else if (role === 'werewolf') {
          const wolves = livingPlayers.filter(p => WOLF_ROLES.includes(p.role));
          if (wolves.length === 0) shouldWait = false;
          else {
            if (gameData.wolvesDisabled) {
              shouldWait = false; // Disabled by Diseased
            } else {
              // Check Unanimous Vote
              const votes = nightActions.werewolfVotes || {};
              const voteCounts = Object.values(votes).reduce((acc, targetsStr) => {
                acc[targetsStr] = (acc[targetsStr] || 0) + 1;
                return acc;
              }, {});
              shouldWait = true;
              for (const [targetsStr, count] of Object.entries(voteCounts)) {
                if (count === wolves.length) {
                  await update(ref(db, `rooms/${roomId}/nightActions`), { werewolfTarget: targetsStr });
                  shouldWait = false;
                  break;
                }
              }
            }
          }
        }
        else if (role === 'sorceress') shouldWait = handleTurn('sorceress', false);
        else if (role === 'aura_seer') shouldWait = handleTurn('aura_seer', false);
        else if (role === 'seer') {
          const seersAlive = livingPlayers.some(p => p.role === 'seer');
          const apprenticeAlive = livingPlayers.some(p => p.role === 'apprentice_seer');
          if (!seersAlive && !apprenticeAlive) shouldWait = false;
          else if (nightActions.seerDone) shouldWait = false;
          else shouldWait = true;
        }
        else if (role === 'revealer') shouldWait = handleTurn('revealer', false);
        else if (role === 'paranormal_investigator') shouldWait = handleTurn('paranormal_investigator', false);
        else if (role === 'huntress') shouldWait = handleTurn('huntress', false, () => gameData.huntressAvailable);
        else if (role === 'priest') shouldWait = handleTurn('priest', false, () => gameData.priestAvailable);
        else if (role === 'witch') shouldWait = handleTurn('witch', false);
        else if (role === 'detective') shouldWait = handleTurn('detective', false, () => gameData.detectiveAvailable);
        else if (role === 'drunk') {
          if (round !== 3 || nightActions.drunkDone) shouldWait = false;
          else {
            // Auto-resolve Drunk: assign random unpicked role
            const drunks = playersList.filter(p => p.role === 'drunk' && !p.isDead);
            if (drunks.length > 0) {
              const unpicked = gameData.unpickedRoles || [];
              if (unpicked.length > 0) {
                const randomRole = unpicked[Math.floor(Math.random() * unpicked.length)];
                const newUnpicked = unpicked.filter(r => r !== randomRole);
                const updates = { 
                  [`rooms/${roomId}/gameData/unpickedRoles`]: newUnpicked,
                  [`rooms/${roomId}/nightActions/drunkDone`]: true
                };
                drunks.forEach(d => {
                  updates[`rooms/${roomId}/players/${d.name}/role`] = randomRole;
                });
                await update(ref(db), updates);
              } else {
                await update(ref(db, `rooms/${roomId}/nightActions/drunkDone`), true);
              }
            }
            shouldWait = false;
          }
        }
        else if (role === 'insomniac') shouldWait = handleTurn('insomniac', false);

        if (shouldWait) {
          if (currentTurn !== role) await advanceTurn(role);
          return;
        }
      }
      
      // If loop finishes without shouldWait, night is over
      await finishNight();
    };

    processQueue();

  }, [roomData, playerName, roomId]);

  if (!roomData || !roomData.currentTurn) return <div className="text-center mt-8">กำลังโหลด...</div>;

  const currentTurn = roomData.currentTurn;
  const myPlayerInfo = roomData.players[playerName] || {};
  const myRole = myPlayerInfo.role;
  const isDead = myPlayerInfo.isDead;
  const isModerator = myRole === 'moderator';
  const playersList = Object.values(roomData.players || {});
  const livingPlayers = playersList.filter(p => !p.isDead && p.role !== 'moderator');
  const nightActions = roomData.nightActions || {};
  const gameData = roomData.gameData || {};
  const round = roomData.round || 1;

  const confirmAction = async (updates) => {
    await update(ref(db, `rooms/${roomId}`), updates);
    setTarget1(null); setTarget2(null); setCheckResult(null); setLocalText('');
  };

  const renderSleep = (msg = "หลับตา... 😴") => (
    <div className="text-center animate-fade-in" style={{ padding: '3rem 1rem' }}>
      <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🌙</div>
      <h2 style={{ color: 'var(--text-secondary)' }}>{msg}</h2>
    </div>
  );

  const Title = ({ title, desc, color }) => (
    <div className="text-center">
      <h2 style={{ color }}>{title}</h2>
      {desc && <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{desc}</p>}
    </div>
  );

  const PlayerList = ({ players, onSelect, isSelected, isDisabled = () => false, icon = '👁️' }) => (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.5rem', maxHeight: '250px', overflowY: 'auto' }}>
      {players.map(p => {
        const disabled = isDisabled(p);
        const selected = isSelected(p);
        return (
          <div key={p.name} onClick={() => !disabled && onSelect(p)} style={{
            background: disabled ? 'rgba(255,0,0,0.1)' : selected ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)',
            border: selected ? '1px solid white' : '1px solid transparent',
            padding: '1rem', borderRadius: '8px', cursor: disabled ? 'not-allowed' : 'pointer',
            textAlign: 'center', opacity: disabled ? 0.5 : 1
          }}>
            {selected ? icon : '🤍'} {p.name} {disabled && '(ห้ามเลือก)'}
          </div>
        );
      })}
    </div>
  );

  // --- MODERATOR VIEW ---
  if (isModerator) {
    const forceSkip = () => {
      const idx = WAKE_ORDER.indexOf(currentTurn);
      if (idx < WAKE_ORDER.length - 1) update(ref(db, `rooms/${roomId}`), { currentTurn: WAKE_ORDER[idx + 1] });
      else update(ref(db, `rooms/${roomId}`), { status: 'morning' });
    };
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '2rem 1rem', display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '85vh', overflowY: 'auto' }}>
        <h2 className="text-center" style={{ color: '#00c8ff' }}>👑 แผงควบคุม Moderator</h2>
        <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
          <p>สถานะ: <strong>กำลังเป็นคิวของ {currentTurn}</strong></p>
          <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem', fontSize: '0.85rem' }}>
            <p><strong>คำใบ้ผี:</strong> {nightActions.ghostHint || '-'}</p>
            <p><strong>เป้าหมายหมาป่า:</strong> {nightActions.werewolfTarget || '-'}</p>
            <p><strong>แวมไพร์กัด:</strong> {nightActions.vampireKill || '-'}</p>
            <p><strong>ชูปากาบรัสฆ่า:</strong> {nightActions.chupacabraKill || '-'}</p>
            <p><strong>แม่มดพิษ/ชุบ:</strong> {nightActions.witchKill || '-'} / {nightActions.witchHeal ? 'Yes' : 'No'}</p>
            <p><strong>นักบวชพรมน้ำมนต์:</strong> {nightActions.priestMark || '-'}</p>
            <p><strong>ผู้ร่ายเวทใบ้:</strong> {nightActions.spellcasterTarget || '-'}</p>
            <p><strong>หญิงแก่ไล่:</strong> {nightActions.oldWomanTarget || '-'}</p>
          </div>
        </div>
        <Button onClick={forceSkip} variant="danger">บังคับข้ามคิว</Button>
      </div>
    );
  }

  // Active Role Check
  if (isDead && myRole !== 'ghost') return renderSleep("คุณตายแล้ว เป็นวิญญาณเร่ร่อน... 👻");

  // --- INDIVIDUAL ROLE VIEWS ---

  if (currentTurn === 'doppelganger' && myRole === 'doppelganger') {
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="👥 ด็อพเพิลเก็งเงอร์" desc="เลือก 1 คน ถ้าเขาตาย คุณจะได้บทบาทเขาแทน" color="#a2d2ff" />
        <PlayerList players={livingPlayers.filter(p=>p.name!==playerName)} onSelect={p=>setTarget1(p.name)} isSelected={p=>p.name===target1} />
        <Button onClick={() => confirmAction({'gameData/doppelgangerTarget': target1, 'nightActions/doppelgangerDone': true})} disabled={!target1}>ยืนยัน</Button>
      </div>
    );
  }

  if (currentTurn === 'mason' && myRole === 'mason') {
    const masons = playersList.filter(p => p.role === 'mason');
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="🤝 กลุ่มภราดรภาพ" desc="นี่คือเพื่อน Mason ของคุณ" color="#bde0fe" />
        <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', textAlign: 'center' }}>
          {masons.map(m => <div key={m.name}>{m.name}</div>)}
        </div>
        <Button onClick={() => confirmAction({'nightActions/masonDone': true})}>รับทราบ</Button>
      </div>
    );
  }

  if (currentTurn === 'beholder' && myRole === 'beholder') {
    const seers = playersList.filter(p => p.role === 'seer');
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="👀 ผู้เฝ้ามอง" desc="นี่คือผู้หยั่งรู้ประจำหมู่บ้าน" color="#ffd6a5" />
        <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', textAlign: 'center' }}>
          {seers.length > 0 ? seers.map(m => <div key={m.name}>🔮 {m.name}</div>) : "ไม่มีผู้หยั่งรู้ในเกมนี้"}
        </div>
        <Button onClick={() => confirmAction({'nightActions/beholderDone': true})}>รับทราบ</Button>
      </div>
    );
  }

  if (currentTurn === 'ghost' && myRole === 'ghost') {
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="👻 ผี" desc="พิมพ์ตัวอักษร 1 ตัวเป็นคำใบ้บนกำแพง" color="#aaa" />
        <input type="text" maxLength={1} value={localText} onChange={e => setLocalText(e.target.value)} style={{ padding: '1rem', fontSize: '2rem', textAlign: 'center', borderRadius: '8px' }} />
        <Button onClick={() => confirmAction({'nightActions/ghostHint': localText, 'nightActions/ghostDone': true})} disabled={!localText}>ส่งคำใบ้</Button>
      </div>
    );
  }

  if (currentTurn === 'hoodlum' && myRole === 'hoodlum') {
    const toggleHoodlum = (name) => {
      if (target1 === name) setTarget1(null);
      else if (target2 === name) setTarget2(null);
      else if (!target1) setTarget1(name);
      else if (!target2) setTarget2(name);
    };
    const totalWolves = playersList.filter(p => WOLF_ROLES.includes(p.role)).length;
    const targetsNeeded = totalWolves || 1;
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="🥷 อันธพาล" desc={`เลือกเป้าหมาย ${targetsNeeded} คน (ต้องตายก่อนคุณถึงจะชนะ)`} color="#ff4d4d" />
        <PlayerList players={playersList.filter(p=>p.role!=='moderator')} onSelect={p=>toggleHoodlum(p.name)} isSelected={p=>target1===p.name||target2===p.name} icon="🎯" />
        <Button onClick={() => confirmAction({'gameData/hoodlumTargets': [target1, target2].filter(x=>x), 'nightActions/hoodlumDone': true})}>ยืนยัน</Button>
      </div>
    );
  }

  if (currentTurn === 'cupid' && myRole === 'cupid') {
    const toggleLover = (name) => {
      if (target1 === name) setTarget1(null); else if (target2 === name) setTarget2(null);
      else if (!target1) setTarget1(name); else if (!target2) setTarget2(name);
    };
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="👼 คิวปิด" desc="เลือกจับคู่รัก 2 คน" color="#ffb3c6" />
        <PlayerList players={livingPlayers} onSelect={p=>toggleLover(p.name)} isSelected={p=>target1===p.name||target2===p.name} icon="💖" />
        <Button onClick={() => confirmAction({'gameData/lovers': [target1, target2], 'nightActions/cupidDone': true})} disabled={!target1||!target2}>ยิงศรรัก!</Button>
      </div>
    );
  }

  if (currentTurn === 'dire_wolf' && myRole === 'dire_wolf') {
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="🔥 หมาป่าโลกันตร์" desc="เลือกสหาย 1 คน (ถ้าเขาตาย คุณตาย)" color="#ff5400" />
        <PlayerList players={livingPlayers.filter(p=>p.name!==playerName)} onSelect={p=>setTarget1(p.name)} isSelected={p=>target1===p.name} icon="🔥" />
        <Button onClick={() => confirmAction({'gameData/direWolfCompanion': target1, 'nightActions/direWolfDone': true})} disabled={!target1}>ยืนยันสหาย</Button>
      </div>
    );
  }

  if (currentTurn === 'minion' && myRole === 'minion') {
    const wolves = playersList.filter(p => WOLF_ROLES.includes(p.role));
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="🧟 สมุนรับใช้" desc="เจ้านายหมาป่าของคุณคือ..." color="#888" />
        <div style={{ padding: '1rem', background: 'rgba(255,0,0,0.1)', borderRadius: '8px', textAlign: 'center' }}>
          {wolves.map(w => <div key={w.name}>🐺 {w.name}</div>)}
        </div>
        <Button onClick={() => confirmAction({'nightActions/minionDone': true})}>หลับตา</Button>
      </div>
    );
  }

  if (currentTurn === 'bodyguard' && myRole === 'bodyguard') {
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="🛡️ บอดี้การ์ด" desc="เลือกคุ้มครอง 1 คน (ห้ามตัวเอง และห้ามซ้ำคืนติด)" color="#00b4d8" />
        <PlayerList players={livingPlayers} onSelect={p=>setTarget1(p.name)} isSelected={p=>target1===p.name} isDisabled={p=>p.name===playerName || p.name===gameData.lastProtected} icon="🛡️" />
        <Button onClick={() => confirmAction({'gameData/lastProtected': target1, 'nightActions/bodyguardTarget': target1, 'nightActions/bodyguardDone': true})} disabled={!target1}>ยืนยันคุ้มครอง</Button>
      </div>
    );
  }

  if (currentTurn === 'old_woman' && myRole === 'old_woman') {
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="👵 หญิงแก่" desc="ไล่ 1 คนออกจากหมู่บ้านในวันพรุ่งนี้ (เขาจะปลอดภัยแต่โหวตไม่ได้)" color="#ccc" />
        <PlayerList players={livingPlayers} onSelect={p=>setTarget1(p.name)} isSelected={p=>target1===p.name} isDisabled={p=>p.name===playerName || p.name===gameData.lastOldWomanTarget} icon="🚪" />
        <Button onClick={() => confirmAction({'gameData/lastOldWomanTarget': target1, 'nightActions/oldWomanTarget': target1, 'nightActions/oldWomanDone': true})} disabled={!target1}>ยืนยัน</Button>
      </div>
    );
  }

  if (currentTurn === 'spellcaster' && myRole === 'spellcaster') {
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="🤐 ผู้ร่ายเวท" desc="ใบ้ 1 คน ห้ามพูดและห้ามโหวตในวันรุ่งขึ้น" color="#9d4edd" />
        <PlayerList players={livingPlayers.filter(p=>p.name!==playerName)} onSelect={p=>setTarget1(p.name)} isSelected={p=>target1===p.name} icon="🤐" />
        <Button onClick={() => confirmAction({'nightActions/spellcasterTarget': target1, 'nightActions/spellcasterDone': true})} disabled={!target1}>ยืนยัน</Button>
      </div>
    );
  }

  if (currentTurn === 'cult_leader' && myRole === 'cult_leader') {
    const cultMembers = gameData.cultMembers || [];
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="🕋 ผู้นำลัทธิ" desc="ชวน 1 คนเข้าลัทธิ" color="#4a4e69" />
        <PlayerList players={livingPlayers.filter(p=>p.name!==playerName)} onSelect={p=>setTarget1(p.name)} isSelected={p=>target1===p.name} isDisabled={p=>cultMembers.includes(p.name)} icon="🙏" />
        <Button onClick={() => confirmAction({'gameData/cultMembers': [...cultMembers, target1], 'nightActions/cultLeaderDone': true})} disabled={!target1}>ชวนเข้าลัทธิ</Button>
      </div>
    );
  }

  if (currentTurn === 'chupacabra' && myRole === 'chupacabra') {
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="🦇 ชูปากาบรัส" desc="ฆ่า 1 คน (ถ้ามีหมาป่าอยู่ จะฆ่าได้เฉพาะหมาป่าเท่านั้น!)" color="#7209b7" />
        <PlayerList players={livingPlayers.filter(p=>p.name!==playerName)} onSelect={p=>setTarget1(p.name)} isSelected={p=>target1===p.name} icon="🦇" />
        <Button onClick={() => confirmAction({'nightActions/chupacabraKill': target1, 'nightActions/chupacabraDone': true})} disabled={!target1}>ฆ่า!</Button>
      </div>
    );
  }

  if (currentTurn === 'vampire' && myRole === 'vampire') {
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="🧛 แวมไพร์" desc="กัด 1 คน (เป้าหมายจะตายในเช้าของ 2 วันถัดไป)" color="#6a040f" />
        <PlayerList players={livingPlayers.filter(p=>p.name!==playerName)} onSelect={p=>setTarget1(p.name)} isSelected={p=>target1===p.name} icon="🧛" />
        <Button onClick={() => confirmAction({'nightActions/vampireKill': target1, 'nightActions/vampireDone': true})} disabled={!target1}>กัด!</Button>
      </div>
    );
  }

  if (currentTurn === 'werewolf' && WOLF_ROLES.includes(myRole)) {
    if (gameData.wolvesDisabled) {
      return (
        <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Title title="🐺 แก๊งหมาป่า" desc="คืนนี้พวกคุณติดโรคจาก Diseased 🤒 ห้ามฆ่าใคร!" color="red" />
          <Button onClick={() => confirmAction({'nightActions/werewolfTarget': 'SKIPPED_DISEASED'})}>หลับตา</Button>
        </div>
      );
    }
    const maxTargets = gameData.wolvesDoubleKill ? 2 : 1;
    const toggleWolfTarget = async (id) => {
      let newV = [...myWolfVotes];
      if (newV.includes(id)) newV = newV.filter(v=>v!==id);
      else { if(newV.length<maxTargets) newV.push(id); else { newV.shift(); newV.push(id); } }
      setMyWolfVotes(newV);
      await update(ref(db, `rooms/${roomId}/nightActions/werewolfVotes`), { [playerName]: newV.sort().join(',') });
    };
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="🐺 แก๊งหมาป่า" desc={`โหวตฆ่า ${maxTargets} คน (ต้องโหวตตรงกันทุกคน)`} color="red" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto' }}>
          {livingPlayers.filter(p=>!WOLF_ROLES.includes(p.role)).map(p => {
            const voters = Object.entries(nightActions.werewolfVotes || {}).filter(([k,v]) => v.includes(p.name)).map(([k])=>k);
            const isMyVote = myWolfVotes.includes(p.name);
            return (
              <div key={p.name} onClick={()=>toggleWolfTarget(p.name)} style={{ background: isMyVote ? 'rgba(255,0,0,0.3)' : 'rgba(255,255,255,0.05)', border: isMyVote ? '1px solid red' : '1px solid transparent', padding: '1rem', borderRadius: '12px', display: 'flex', justifyContent: 'space-between' }}>
                <span>{p.name}</span>
                <div style={{ display: 'flex', gap: '0.25rem' }}>{voters.map(v => <span key={v}>🐺</span>)}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (currentTurn === 'sorceress' && myRole === 'sorceress') {
    const checkSorceress = async (target) => {
      const isSeer = target.role === 'seer' || target.role === 'apprentice_seer';
      setCheckResult({ name: target.name, text: isSeer ? 'ใช่ ผู้หยั่งรู้!' : 'ไม่ใช่' });
    };
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="🦹‍♀️ นางปีศาจ" desc="ส่องหาผู้หยั่งรู้ 1 คน" color="#ff6b6b" />
        {!checkResult ? <PlayerList players={livingPlayers.filter(p=>p.name!==playerName)} onSelect={checkSorceress} isSelected={()=>false} />
         : <div className="text-center" style={{ padding: '2rem' }}><h3>{checkResult.name} คือ</h3><div style={{ fontSize: '2rem' }}>{checkResult.text}</div></div>}
        <Button onClick={() => confirmAction({'nightActions/sorceressDone': true})} disabled={!checkResult}>หลับตา</Button>
      </div>
    );
  }

  if (currentTurn === 'aura_seer' && myRole === 'aura_seer') {
    const checkAura = async (target) => {
      const isSpecial = !NON_SPECIAL_ROLES.includes(target.role);
      setCheckResult({ name: target.name, text: isSpecial ? '👍 มีออร่า (บทพิเศษ)' : '👎 ไม่มีออร่า (ชาวบ้าน/หมาป่าธรรมดา)' });
    };
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="✨ ผู้หยั่งรู้ออร่า" desc="เช็คว่ามีบทบาทพิเศษหรือไม่" color="#fee440" />
        {!checkResult ? <PlayerList players={livingPlayers.filter(p=>p.name!==playerName)} onSelect={checkAura} isSelected={()=>false} />
         : <div className="text-center" style={{ padding: '2rem' }}><h3>{checkResult.name} คือ</h3><div style={{ fontSize: '1.5rem' }}>{checkResult.text}</div></div>}
        <Button onClick={() => confirmAction({'nightActions/auraSeerDone': true})} disabled={!checkResult}>หลับตา</Button>
      </div>
    );
  }

  const isRealSeerAlive = playersList.some(p => p.role === 'seer' && !p.isDead);
  const isMySeerTurn = (myRole === 'seer') || (myRole === 'apprentice_seer');
  
  if (currentTurn === 'seer' && isMySeerTurn) {
    if (myRole === 'apprentice_seer' && isRealSeerAlive) {
      return (
        <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Title title="👁️ ผู้หยั่งรู้ฝึกหัด" desc="รอผู้หยั่งรู้ตัวจริงส่อง..." color="#48cae4" />
          {nightActions.seerCheck && <div className="text-center" style={{ padding: '2rem' }}>ผู้หยั่งรู้ส่อง {nightActions.seerCheck}!</div>}
        </div>
      );
    }
    const checkSeer = async (target) => {
      const isWolf = ['werewolf', 'lone_wolf', 'wolf_cub', 'dire_wolf'].includes(target.role) && target.role !== 'wolf_man';
      const text = isWolf ? '🐺 หมาป่า!' : '😇 ไม่ใช่หมาป่า';
      setCheckResult({ name: target.name, text });
      await update(ref(db, `rooms/${roomId}/nightActions`), { seerCheck: target.name });
    };
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="🔮 ผู้หยั่งรู้" desc="ส่องดูฝ่าย 1 คน" color="#48cae4" />
        {!checkResult ? <PlayerList players={livingPlayers.filter(p=>p.name!==playerName)} onSelect={checkSeer} isSelected={()=>false} />
         : <div className="text-center" style={{ padding: '2rem' }}><h3>{checkResult.name} คือ</h3><div style={{ fontSize: '2rem' }}>{checkResult.text}</div></div>}
        <Button onClick={() => confirmAction({'nightActions/seerDone': true})} disabled={!checkResult}>หลับตา</Button>
      </div>
    );
  }

  if (currentTurn === 'revealer' && myRole === 'revealer') {
    const confirmRevealer = async () => {
      await update(ref(db, `rooms/${roomId}`), { 'nightActions/revealerTarget': target1, 'nightActions/revealerDone': true });
    };
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="📢 ผู้เปิดเผยตัวตน" desc="เลือก 1 คน ถ้าเขาเป็นหมาป่า เขาจะตาย ถ้าไม่ใช่ คุณจะตายเอง!" color="#f4a261" />
        <PlayerList players={livingPlayers.filter(p=>p.name!==playerName)} onSelect={p=>setTarget1(p.name===target1?null:p.name)} isSelected={p=>target1===p.name} icon="📢" />
        <Button onClick={confirmRevealer} variant={target1 ? 'danger' : 'secondary'}>{target1 ? 'เปิดเผยตัวตน!' : 'ไม่ใช้ หลับตา'}</Button>
      </div>
    );
  }

  if (currentTurn === 'paranormal_investigator' && myRole === 'paranormal_investigator') {
    const confirmPI = async () => {
      if (target1) {
        const tRole = playersList.find(p=>p.name===target1)?.role;
        if (WOLF_ROLES.includes(tRole)) {
          await update(ref(db, `rooms/${roomId}/players/${playerName}`), { role: 'werewolf' });
        }
      }
      await update(ref(db, `rooms/${roomId}/nightActions/piDone`), true);
    };
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="👻🔍 คนอวดผี" desc="ส่อง 1 คน ถ้าเขาเป็นหมาป่า คุณจะกลายเป็นหมาป่าทันที!" color="#2a9d8f" />
        <PlayerList players={livingPlayers.filter(p=>p.name!==playerName)} onSelect={p=>setTarget1(p.name===target1?null:p.name)} isSelected={p=>target1===p.name} icon="🔍" />
        <Button onClick={confirmPI} variant={target1 ? 'primary' : 'secondary'}>{target1 ? 'พิสูจน์!' : 'ไม่ใช้ หลับตา'}</Button>
      </div>
    );
  }

  if (currentTurn === 'huntress' && myRole === 'huntress') {
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="🧝‍♀️ พรานหญิง" desc="ยิง 1 คน (ใช้ได้ 1 ครั้งในเกม)" color="#e76f51" />
        <PlayerList players={livingPlayers.filter(p=>p.name!==playerName)} onSelect={p=>setTarget1(p.name===target1?null:p.name)} isSelected={p=>target1===p.name} icon="🏹" />
        <Button onClick={() => confirmAction({'nightActions/huntressKill': target1, 'nightActions/huntressDone': true, 'gameData/huntressAvailable': !target1})} variant={target1 ? 'danger' : 'secondary'}>{target1 ? 'ยิงปืน!' : 'ไม่ใช้ หลับตา'}</Button>
      </div>
    );
  }

  if (currentTurn === 'priest' && myRole === 'priest') {
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="✝️ นักบวช" desc="อวยพร 1 คนให้เป็นอมตะ 1 ครั้ง (ใช้ได้ 1 ครั้งในเกม)" color="#fffb00" />
        <PlayerList players={livingPlayers.filter(p=>p.name!==playerName)} onSelect={p=>setTarget1(p.name===target1?null:p.name)} isSelected={p=>target1===p.name} icon="✝️" />
        <Button onClick={() => confirmAction({'gameData/priestBuff': target1, 'nightActions/priestDone': true, 'gameData/priestAvailable': !target1})} variant={target1 ? 'primary' : 'secondary'}>{target1 ? 'อวยพร' : 'ไม่ใช้ หลับตา'}</Button>
      </div>
    );
  }

  if (currentTurn === 'witch' && myRole === 'witch') {
    const wolfTarget = nightActions.werewolfTarget || "";
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="🧙‍♀️ แม่มด" color="#c77dff" />
        <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
          <p>เหยื่อหมาป่า: <strong style={{ color: 'red', fontSize: '1.2rem' }}>{wolfTarget || 'ไม่มี'}</strong></p>
          {gameData.witchHealAvailable && wolfTarget && <Button onClick={()=>setLocalHeal(!localHeal)} variant={localHeal?'primary':'secondary'} style={{width:'100%',marginTop:'1rem',background:localHeal?'#2ecc71':''}}>{localHeal?'💚 ใช้ยารักษา':'🤍 ชุบชีวิต?'}</Button>}
        </div>
        {gameData.witchPoisonAvailable && (
          <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
            <p>ใช้ยาพิษใครไหม?</p>
            <PlayerList players={livingPlayers.filter(p=>p.name!==playerName)} onSelect={p=>setTarget1(p.name===target1?null:p.name)} isSelected={p=>target1===p.name} icon="☠️" />
          </div>
        )}
        <Button onClick={() => confirmAction({'nightActions/witchDone': true, 'nightActions/witchHeal': localHeal, 'nightActions/witchKill': target1, ...(localHeal && {'gameData/witchHealAvailable': false}), ...(target1 && {'gameData/witchPoisonAvailable': false})})}>เสร็จสิ้น</Button>
      </div>
    );
  }

  if (currentTurn === 'detective' && myRole === 'detective') {
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="🕵️ นักสืบ" desc="ส่องดูบทบาทเป๊ะๆ 1 คน (ใช้ได้ 1 ครั้ง)" color="#ffb703" />
        {!checkResult ? <PlayerList players={livingPlayers.filter(p=>p.name!==playerName)} onSelect={p=>setCheckResult({name:p.name, text:p.role})} isSelected={()=>false} />
         : <div className="text-center" style={{ padding: '2rem' }}><h3>{checkResult.name} คือ</h3><div style={{ fontSize: '2rem' }}>{checkResult.text}</div></div>}
        <Button onClick={() => confirmAction({'nightActions/detectiveDone': true, 'gameData/detectiveAvailable': !checkResult})} disabled={!checkResult && gameData.detectiveAvailable}>{!checkResult ? 'ไม่ใช้ หลับตา' : 'หลับตา'}</Button>
      </div>
    );
  }

  if (currentTurn === 'insomniac' && myRole === 'insomniac') {
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="🦉 คนนอนไม่หลับ" desc="เช็คว่าโดนสลับการ์ดหรือไม่" color="#e0aaff" />
        <div className="text-center" style={{ padding: '2rem' }}>
          <h3>บทบาทปัจจุบันของคุณคือ</h3>
          <div style={{ fontSize: '2rem' }}>{myRole === 'insomniac' ? '🦉 คนนอนไม่หลับ (ไม่โดนสลับ)' : myRole}</div>
        </div>
        <Button onClick={() => confirmAction({'nightActions/insomniacDone': true})}>หลับตา</Button>
      </div>
    );
  }

  return renderSleep();
}
