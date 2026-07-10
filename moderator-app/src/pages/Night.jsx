import React, { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ref, onValue, update } from 'firebase/database';
import { db } from '../firebase';
import Button from '../components/Button';
import SalemNight from './SalemNight';
import { playClip, isNarrator } from '../audio';

// เรียงตามคอลัมน์ชีต 1-NIGHTS (หมาป่า → ... → เจ้าลัทธิ)
// บทที่ชีตไม่มีคอลัมน์ (ดูข้อมูลเฉยๆ) แทรกไว้ตามตำแหน่งที่เหมาะสม
const WAKE_ORDER = [
  'werewolf',              // [ชีต] หมาป่าจะฆ่าใคร (ลูกหมาป่าตื่นดูด้วย)
  'dark_witch',            // (แทรก) ฝั่งหมาป่า — หา Seer
  'minion',                // (แทรก) ฝั่งหมาป่า — รู้ว่าใครคือหมาป่า
  'dire_wolf',             // (แทรก) ฝั่งหมาป่า — เลือกสหายคืนแรก
  'cupid',                 // [ชีต] Cupid เลือกคู่
  'thug',                  // [ชีต] อันธพาลเลือกเป้าหมาย
  'chupacabra',            // [ชีต] ซูปราคาบราจะฆ่าใคร
  'doppelganger',          // [ชีต] ภูตจำแลงเลือกเป้าหมาย
  'mason',                 // (แทรก) คืนแรก — รู้จักเพื่อนเมสัน
  'magic_eyes',            // (แทรก) คืนแรก — รู้ว่าใครคือ Seer
  'vampire',               // [ชีต] แวมไพร์จะฆ่าใคร
  'mage',                  // [ชีต] จอมเวทเสกใครเป็นใบ้
  'troublemaker',          // [ชีต] ตัวป่วน
  'priest',                // [ชีต] นักบวชให้พร
  'bodyguard',             // [ชีต] บอดี้การ์ดปกป้อง
  'revealer',              // [ชีต] ผู้เผยตัวตน
  'huntress',              // [ชีต] พรานหญิง
  'hag',                   // [ชีต] แม่เฒ่า
  'seer',                  // (แทรก) ส่องดูดี/ร้าย
  'psychic',               // (แทรก) ส่องพลังพิเศษ
  'paranormal_detective',  // (แทรก) นักสืบลี้ลับ
  'witch',                 // [ชีต] แม่มดปกป้อง/ฆ่า (ต้องอยู่หลังหมาป่า)
  'cult_leader',           // [ชีต] เจ้าลัทธิ
  'drunk',                 // (แทรก) คืนที่ 3 รู้บทจริง
  'insomniac'              // (แทรก) ปิดท้าย — เช็คคนซ้าย/ขวาตื่นไหม
];

// All wolf roles that wake up together at night
const WOLF_ROLES = ['werewolf', 'lone_wolf', 'wolf_cub', 'dire_wolf', 'wolfman'];
// Wolf roles that can actually cast a kill vote (wolf_cub CANNOT vote)
const WOLF_VOTERS = ['werewolf', 'lone_wolf', 'dire_wolf', 'wolfman'];
const NON_SPECIAL_ROLES = ['villager', 'werewolf', 'lone_wolf', 'wolf_cub', 'dire_wolf', 'wolfman', 'dark_witch', 'minion'];

// คอมโพเนนต์ย่อยอยู่ระดับโมดูล (identity คงที่) เพื่อไม่ให้ scroll เด้งเวลากดเลือก
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
  const [thugTargets, setThugTargets] = useState([]);
  const [showIntro, setShowIntro] = useState(false);
  const [introRound, setIntroRound] = useState(0);
  const spokenTurnRef = useRef(null);

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

  // แสดง banner "คืนที่ X" ตอนเข้าคืนใหม่ (คนทั่วไป ~2.2 วิ, moderator รอกดปุ่มเอง)
  // NOTE: ห้ามใส่ introRound ใน deps ไม่งั้น effect รันซ้ำแล้ว clear timer ทำให้ banner ค้าง
  useEffect(() => {
    if (roomData?.status === 'night' && roomData?.round && roomData.round !== introRound) {
      setIntroRound(roomData.round);
      setShowIntro(true);
      spokenTurnRef.current = null; // รีเซ็ตให้พากย์ role คืนใหม่ได้
      if (isNarrator(roomData, playerName)) playClip('wf_night'); // เสียงประกาศเข้าคืน
      const amMod = roomData?.players?.[playerName]?.role === 'moderator';
      if (!amMod) {
        const t = setTimeout(() => setShowIntro(false), 2200);
        return () => clearTimeout(t);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomData?.round, roomData?.status, playerName]);

  // เสียงพากย์ตอนเปลี่ยนคิว role (เล่นบนเครื่อง narrator, หลังปิด banner แล้ว)
  useEffect(() => {
    if (!roomData || roomData.status !== 'night' || showIntro) return;
    if (!isNarrator(roomData, playerName)) return;
    const turn = roomData.currentTurn;
    if (turn && turn !== spokenTurnRef.current) {
      spokenTurnRef.current = turn;
      playClip('wf_' + turn); // เล่น wf_<role>.mp3 ถ้ามี (ไม่มีก็ข้าม)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomData?.currentTurn, roomData?.status, showIntro, playerName]);

  // --- HOST ENGINE (Werewolf เท่านั้น) ---
  useEffect(() => {
    if (!roomData || roomData.host !== playerName || roomData.gameType === 'salem') return;

    const currentTurn = roomData.currentTurn || WAKE_ORDER[0];
    const playersList = Object.values(roomData.players || {}).filter(Boolean);
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
        else if (role === 'magic_eyes') shouldWait = handleTurn('magic_eyes', true);
        else if (role === 'thug') shouldWait = handleTurn('thug', true);
        else if (role === 'cupid') shouldWait = handleTurn('cupid', true);
        else if (role === 'dire_wolf') shouldWait = handleTurn('dire_wolf', true);
        else if (role === 'minion') shouldWait = handleTurn('minion', true);
        else if (role === 'bodyguard') shouldWait = handleTurn('bodyguard', false);
        else if (role === 'hag') shouldWait = handleTurn('hag', false);
        else if (role === 'mage') shouldWait = handleTurn('mage', false);
        else if (role === 'cult_leader') shouldWait = handleTurn('cult_leader', false);
        else if (role === 'chupacabra') shouldWait = handleTurn('chupacabra', false);
        else if (role === 'vampire') shouldWait = handleTurn('vampire', false);
        else if (role === 'werewolf') {
          // All wolf roles wake; wolf_cub sees but CANNOT vote
          const wolves = livingPlayers.filter(p => WOLF_ROLES.includes(p.role));
          const voters = livingPlayers.filter(p => WOLF_VOTERS.includes(p.role));
          if (wolves.length === 0) shouldWait = false;
          else {
            if (gameData.wolvesDisabledForRound === round) {
              shouldWait = false; // Disabled by Infected
            } else if (voters.length === 0) {
              // Only wolf_cub(s) alive — skip vote
              shouldWait = false;
            } else {
              // Check unanimity among voters only
              const votes = nightActions.werewolfVotes || {};
              const voteCounts = Object.values(votes).reduce((acc, targetsStr) => {
                acc[targetsStr] = (acc[targetsStr] || 0) + 1;
                return acc;
              }, {});
              shouldWait = true;
              for (const [targetsStr, count] of Object.entries(voteCounts)) {
                if (count === voters.length) {
                  await update(ref(db, `rooms/${roomId}/nightActions`), { werewolfTarget: targetsStr });
                  shouldWait = false;
                  break;
                }
              }
            }
          }
        }
        else if (role === 'dark_witch') shouldWait = handleTurn('dark_witch', false);
        else if (role === 'seer') {
          const seersAlive = livingPlayers.some(p => p.role === 'seer');
          const apprenticeAlive = livingPlayers.some(p => p.role === 'oracle_apprentice');
          if (!seersAlive && !apprenticeAlive) shouldWait = false;
          else if (nightActions.seerDone) shouldWait = false;
          else shouldWait = true;
        }
        else if (role === 'psychic') shouldWait = handleTurn('psychic', false);
        else if (role === 'revealer') shouldWait = handleTurn('revealer', false);
        else if (role === 'paranormal_detective') shouldWait = handleTurn('paranormal_detective', false);
        // Huntress wakes EVERY night — she can choose to shoot or pass
        else if (role === 'huntress') shouldWait = handleTurn('huntress', false);
        else if (role === 'troublemaker') shouldWait = handleTurn('troublemaker', false, () => gameData.troublemakerAvailable);
        // Priest wakes EVERY night — selects someone to bless (can change each night)
        else if (role === 'priest') shouldWait = handleTurn('priest', false);
        else if (role === 'witch') shouldWait = handleTurn('witch', false);
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

  // Salem ใช้หน้า/เอนจินแยก
  if (roomData.gameType === 'salem') return <SalemNight />;

  const currentTurn = roomData.currentTurn;
  const myPlayerInfo = roomData.players[playerName] || {};
  const myRole = myPlayerInfo.role;
  const isDead = myPlayerInfo.isDead;
  const isModerator = myRole === 'moderator';
  const playersList = Object.values(roomData.players || {}).filter(Boolean);
  const livingPlayers = playersList.filter(p => !p.isDead && p.role !== 'moderator');
  const nightActions = roomData.nightActions || {};
  const gameData = roomData.gameData || {};
  const round = roomData.round || 1;

  // --- คนตาย: banner แดงค้างไว้ (ไม่ถูกปลุก เว้นแต่ถูกชุบชีวิต) ---
  if (isDead && !isModerator) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem',
        textAlign: 'center', padding: '2rem',
        background: 'radial-gradient(circle, rgba(139,0,0,0.88) 0%, rgba(0,0,0,1) 100%)'
      }}>
        <div style={{ fontSize: '5.5rem' }}>💀</div>
        <h1 style={{ color: '#ff3333', fontSize: '2.8rem', textShadow: '0 0 20px rgba(255,0,0,0.6)', margin: 0 }}>คุณตายแล้ว</h1>
        <p style={{ color: 'white', opacity: 0.85, fontSize: '1.1rem' }}>เป็นวิญญาณเร่ร่อน... ห้ามพูดหรือใบ้คนอื่น 👻</p>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.9rem' }}>คุณจะไม่ถูกปลุกอีก (เว้นแต่ถูกชุบชีวิต)</p>
      </div>
    );
  }

  // --- BANNER เข้าคืนใหม่ ---
  if (showIntro) {
    return (
      <div className="animate-fade-in" style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem',
        background: 'radial-gradient(circle, rgba(25,20,60,0.97) 0%, rgba(0,0,0,1) 100%)', padding: '2rem'
      }}>
        <div style={{ fontSize: '5.5rem', filter: 'drop-shadow(0 0 25px rgba(138,43,226,0.7))' }}>🌙</div>
        <h1 style={{ color: '#c8b6ff', fontSize: '3.5rem', letterSpacing: '3px', textShadow: '0 0 25px rgba(138,43,226,0.6)', margin: 0 }}>
          คืนที่ {round}
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
          {isModerator ? 'พร้อมคุมเกมไหม?' : 'ทุกคนหลับตา... 😴'}
        </p>
        {isModerator && (
          <div style={{ width: '100%', maxWidth: '320px', marginTop: '0.5rem' }}>
            <Button onClick={() => setShowIntro(false)} size="lg">
              👑 เข้าแผงควบคุม (เช็คแต่ละ role)
            </Button>
          </div>
        )}
      </div>
    );
  }

  const confirmAction = async (updates) => {
    await update(ref(db, `rooms/${roomId}`), updates);
    setTarget1(null); setTarget2(null); setCheckResult(null); setLocalText('');
  };

  // --- MODERATOR VIEW ---
  if (isModerator) {
    const forceSkip = () => {
      const idx = WAKE_ORDER.indexOf(currentTurn);
      if (idx < WAKE_ORDER.length - 1) update(ref(db, `rooms/${roomId}`), { currentTurn: WAKE_ORDER[idx + 1] });
      else update(ref(db, `rooms/${roomId}`), { status: 'morning' });
    };
    // เทส: รีเซ็ตกลับคืน 1 (ฟื้นทุกคน บทเดิม ล้าง flag) เพื่อให้บท "คืนแรกเท่านั้น" ถูกถามอีก
    const resetToNight1 = async () => {
      if (!window.confirm('รีเซ็ตกลับคืนที่ 1? (คนเดิม บทเดิม ฟื้นทุกคน ล้างการกระทำ) — สำหรับเทส')) return;
      const updates = {};
      updates[`rooms/${roomId}/round`] = 1;
      updates[`rooms/${roomId}/status`] = 'night';
      updates[`rooms/${roomId}/currentTurn`] = 'werewolf';
      updates[`rooms/${roomId}/morningResult`] = null;
      updates[`rooms/${roomId}/winner`] = null;
      updates[`rooms/${roomId}/nightActions`] = { werewolfVotes: {} };
      playersList.forEach(p => { updates[`rooms/${roomId}/players/${p.name}/isDead`] = false; });
      updates[`rooms/${roomId}/gameData/witchHealAvailable`] = true;
      updates[`rooms/${roomId}/gameData/witchPoisonAvailable`] = true;
      updates[`rooms/${roomId}/gameData/priestAvailable`] = true;
      updates[`rooms/${roomId}/gameData/huntressAmmo`] = true;
      updates[`rooms/${roomId}/gameData/troublemakerAvailable`] = true;
      updates[`rooms/${roomId}/gameData/wolvesDoubleKillForRound`] = 0;
      updates[`rooms/${roomId}/gameData/wolvesDisabledForRound`] = 0;
      updates[`rooms/${roomId}/gameData/twoExecutions`] = false;
      updates[`rooms/${roomId}/gameData/cultMembers`] = [];
      updates[`rooms/${roomId}/gameData/vampireBites`] = {};
      updates[`rooms/${roomId}/gameData/lovers`] = null;
      updates[`rooms/${roomId}/gameData/doppelgangerTarget`] = null;
      updates[`rooms/${roomId}/gameData/direWolfCompanion`] = null;
      updates[`rooms/${roomId}/gameData/thugTargets`] = null;
      updates[`rooms/${roomId}/gameData/princeRevealed`] = false;
      updates[`rooms/${roomId}/gameData/priestBuff`] = null;
      updates[`rooms/${roomId}/gameData/lastProtected`] = null;
      updates[`rooms/${roomId}/gameData/lastHagTarget`] = null;
      updates[`rooms/${roomId}/gameData/toughGuyDiesOnRound`] = null;
      updates[`rooms/${roomId}/gameData/toughGuyName`] = null;
      await update(ref(db), updates);
    };
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '2rem 1rem', display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '85vh', overflowY: 'auto' }}>
        <h2 className="text-center" style={{ color: '#00c8ff' }}>👑 แผงควบคุม Moderator</h2>
        <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
          <p>สถานะ: <strong>กำลังเป็นคิวของ {currentTurn}</strong></p>
          <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem', fontSize: '0.85rem' }}>
            <p><strong>เป้าหมายหมาป่า:</strong> {nightActions.werewolfTarget || '-'}</p>
            <p><strong>แวมไพร์กัด:</strong> {nightActions.vampireKill || '-'}</p>
            <p><strong>ซูปราคาบราฆ่า:</strong> {nightActions.chupacabraKill || '-'}</p>
            <p><strong>แม่มดพิษ/ชุบ:</strong> {nightActions.witchKill || '-'} / {nightActions.witchHeal ? 'Yes' : 'No'}</p>
            <p><strong>นักบวชพรมน้ำมนต์:</strong> {nightActions.priestMark || '-'}</p>
            <p><strong>ผู้ร่ายเวทใบ้:</strong> {nightActions.mageTarget || '-'}</p>
            <p><strong>หญิงแก่ไล่:</strong> {nightActions.hagTarget || '-'}</p>
          </div>
        </div>
        <Button onClick={forceSkip} variant="danger">บังคับข้ามคิว</Button>
        <Button onClick={resetToNight1} variant="secondary">🔄 รีเซ็ตเป็นคืน 1 (เทส)</Button>
      </div>
    );
  }

  // Active Role Check (คนตายถูกจัดการด้วย banner แดงด้านบนแล้ว)

  // --- INDIVIDUAL ROLE VIEWS ---

  if (currentTurn === 'doppelganger' && myRole === 'doppelganger') {
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="👥 ภูตจำแลง" desc="เลือก 1 คน ถ้าเขาตาย คุณจะได้บทบาทเขาแทน" color="#a2d2ff" />
        <PlayerList players={livingPlayers.filter(p=>p.name!==playerName)} onSelect={p=>setTarget1(p.name)} isSelected={p=>p.name===target1} />
        <Button onClick={() => confirmAction({'gameData/doppelgangerTarget': target1, 'nightActions/doppelgangerDone': true})} disabled={!target1}>ยืนยัน</Button>
      </div>
    );
  }

  if (currentTurn === 'mason' && myRole === 'mason') {
    const masons = playersList.filter(p => p.role === 'mason');
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="🤝 ภราดรแห่งเมสัน" desc="นี่คือเพื่อน Mason ของคุณ" color="#bde0fe" />
        <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', textAlign: 'center' }}>
          {masons.map(m => <div key={m.name}>{m.name}</div>)}
        </div>
        <Button onClick={() => confirmAction({'nightActions/masonDone': true})}>รับทราบ</Button>
      </div>
    );
  }

  if (currentTurn === 'magic_eyes' && myRole === 'magic_eyes') {
    const seers = playersList.filter(p => p.role === 'seer');
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="👀 ตาทิพย์" desc="นี่คือเทพพยากรณ์ประจำหมู่บ้าน" color="#ffd6a5" />
        <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', textAlign: 'center' }}>
          {seers.length > 0 ? seers.map(m => <div key={m.name}>🔮 {m.name}</div>) : "ไม่มีเทพพยากรณ์ในเกมนี้"}
        </div>
        <Button onClick={() => confirmAction({'nightActions/magic_eyesDone': true})}>รับทราบ</Button>
      </div>
    );
  }

  if (currentTurn === 'thug' && myRole === 'thug') {
    const targetsNeeded = 2; // อันธพาลเลือกเป้าหมาย 2 คนเสมอ (ตามชีต)
    const toggleTarget = (name) => {
      if (thugTargets.includes(name)) setThugTargets(thugTargets.filter(n=>n!==name));
      else if (thugTargets.length < targetsNeeded) setThugTargets([...thugTargets, name]);
    };
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="🥷 อันธพาล" desc={`เลือกเป้าหมาย ${targetsNeeded} คน (ต้องตายก่อนคุณถึงจะชนะ)`} color="#ff4d4d" />
        <PlayerList players={playersList.filter(p=>p.role!=='moderator')} onSelect={p=>toggleTarget(p.name)} isSelected={p=>thugTargets.includes(p.name)} icon="🎯" />
        <Button onClick={() => confirmAction({'gameData/thugTargets': thugTargets, 'nightActions/thugDone': true})} disabled={thugTargets.length!==targetsNeeded}>ยืนยัน</Button>
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
        <Title title="👼 กามเทพ" desc="เลือกจับคู่รัก 2 คน" color="#ffb3c6" />
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
        <Button onClick={() => confirmAction({'gameData/direWolfCompanion': target1, 'nightActions/dire_wolfDone': true})} disabled={!target1}>ยืนยันสหาย</Button>
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

  if (currentTurn === 'hag' && myRole === 'hag') {
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="👵 แม่เฒ่า" desc="ไล่ 1 คนออกจากหมู่บ้านในวันพรุ่งนี้ (เขาจะปลอดภัยแต่โหวตไม่ได้)" color="#ccc" />
        <PlayerList players={livingPlayers} onSelect={p=>setTarget1(p.name)} isSelected={p=>target1===p.name} isDisabled={p=>p.name===playerName || p.name===gameData.lastHagTarget} icon="🚪" />
        <Button onClick={() => confirmAction({'gameData/lastHagTarget': target1, 'nightActions/hagTarget': target1, 'nightActions/hagDone': true})} disabled={!target1}>ยืนยัน</Button>
      </div>
    );
  }

  if (currentTurn === 'mage' && myRole === 'mage') {
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="🤐 จอมเวท" desc="ใบ้ 1 คน ห้ามพูดและห้ามโหวตในวันรุ่งขึ้น" color="#9d4edd" />
        <PlayerList players={livingPlayers.filter(p=>p.name!==playerName)} onSelect={p=>setTarget1(p.name)} isSelected={p=>target1===p.name} icon="🤐" />
        <Button onClick={() => confirmAction({'nightActions/mageTarget': target1, 'nightActions/mageDone': true})} disabled={!target1}>ยืนยัน</Button>
      </div>
    );
  }

  if (currentTurn === 'cult_leader' && myRole === 'cult_leader') {
    const cultMembers = gameData.cultMembers || [];
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="🕋 เจ้าลัทธิ" desc="ชวน 1 คนเข้าลัทธิ" color="#4a4e69" />
        <PlayerList players={livingPlayers.filter(p=>p.name!==playerName)} onSelect={p=>setTarget1(p.name)} isSelected={p=>target1===p.name} isDisabled={p=>cultMembers.includes(p.name)} icon="🙏" />
        <Button onClick={() => confirmAction({'gameData/cultMembers': [...cultMembers, target1], 'nightActions/cult_leaderDone': true})} disabled={!target1}>ชวนเข้าลัทธิ</Button>
      </div>
    );
  }

  if (currentTurn === 'chupacabra' && myRole === 'chupacabra') {
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="🦇 ซูปราคาบรา" desc="ฆ่า 1 คน (ถ้ามีหมาป่าอยู่ จะฆ่าได้เฉพาะหมาป่าเท่านั้น!)" color="#7209b7" />
        <PlayerList players={livingPlayers.filter(p=>p.name!==playerName)} onSelect={p=>setTarget1(p.name)} isSelected={p=>target1===p.name} icon="🦇" />
        <Button onClick={() => confirmAction({'nightActions/chupacabraKill': target1, 'nightActions/chupacabraDone': true})} disabled={!target1}>ฆ่า!</Button>
      </div>
    );
  }

  if (currentTurn === 'vampire' && myRole === 'vampire') {
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="🧛 แวมไพร์" desc="กัด 1 คน — เหยื่อจะไม่ตายตอนเช้า แต่จะตายก่อนโหวตตอนกลางวัน! (หมาป่าฆ่าแวมไพร์คืนนี้ไม่ได้)" color="#6a040f" />
        <PlayerList players={livingPlayers.filter(p=>p.name!==playerName)} onSelect={p=>setTarget1(p.name)} isSelected={p=>target1===p.name} icon="🧛" />
        <Button onClick={() => {
          const bites = gameData.vampireBites || {};
          bites[target1] = round; // dies before voting this day phase
          confirmAction({'gameData/vampireBites': bites, 'nightActions/vampireKill': target1, 'nightActions/vampireDone': true});
        }} disabled={!target1}>กัด!</Button>
      </div>
    );
  }

  if (currentTurn === 'werewolf' && WOLF_ROLES.includes(myRole)) {
    const isWolfCub = myRole === 'wolf_cub';
    if (gameData.wolvesDisabledForRound === round) {
      return (
        <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Title title="🐺 แก๊งหมาป่า" desc="คืนนี้พวกคุณติดโรคจาก Infected 🤒 ห้ามฆ่าใคร!" color="red" />
          {isWolfCub && <div style={{padding:'0.75rem',background:'rgba(255,165,0,0.1)',borderRadius:'8px',textAlign:'center',color:'orange'}}>⚠️ ลูกหมาป่าไม่มีสิทธิ์โหวตอยู่แล้ว</div>}
          <Button onClick={() => confirmAction({'nightActions/werewolfTarget': 'SKIPPED_DISEASED'})}>หลับตา</Button>
        </div>
      );
    }
    if (isWolfCub) {
      return (
        <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Title title="🐾 ลูกหมาป่า" desc="คุณตื่นพร้อมฝูง แต่ยังเด็กเกินไปที่จะโหวตได้ — ดูเพื่อนเลือกเหยื่อ" color="#ff9500" />
          <div style={{padding:'1rem',background:'rgba(255,255,255,0.05)',borderRadius:'12px'}}>
            <p style={{color:'var(--text-secondary)',textAlign:'center',marginBottom:'0.5rem'}}>คะแนนโหวตจากฝูง:</p>
            <div style={{display:'flex',flexDirection:'column',gap:'0.5rem'}}>
              {livingPlayers.filter(p=>!WOLF_ROLES.includes(p.role)).map(p => {
                const votes = Object.entries(nightActions.werewolfVotes || {}).filter(([k,v]) => v.includes(p.name)).map(([k])=>k);
                return (
                  <div key={p.name} style={{background:'rgba(255,255,255,0.05)',padding:'0.75rem',borderRadius:'8px',display:'flex',justifyContent:'space-between'}}>
                    <span>{p.name}</span>
                    <div style={{display:'flex',gap:'0.25rem'}}>{votes.map(v=><span key={v}>🐺</span>)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    }
    const maxTargets = gameData.wolvesDoubleKillForRound === round ? 2 : 1;
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

  if (currentTurn === 'dark_witch' && myRole === 'dark_witch') {
    const checkDarkWitch = async (target) => {
      const isSeer = target.role === 'seer' || target.role === 'oracle_apprentice';
      setCheckResult({ name: target.name, text: isSeer ? 'ใช่ เทพพยากรณ์!' : 'ไม่ใช่' });
    };
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="🦹‍♀️ แม่หมอมนตร์ดำ" desc="ส่องหาเทพพยากรณ์ 1 คน" color="#ff6b6b" />
        {!checkResult ? <PlayerList players={livingPlayers.filter(p=>p.name!==playerName)} onSelect={checkDarkWitch} isSelected={()=>false} />
         : <div className="text-center" style={{ padding: '2rem' }}><h3>{checkResult.name} คือ</h3><div style={{ fontSize: '2rem' }}>{checkResult.text}</div></div>}
        <Button onClick={() => confirmAction({'nightActions/dark_witchDone': true})} disabled={!checkResult}>หลับตา</Button>
      </div>
    );
  }

  if (currentTurn === 'psychic' && myRole === 'psychic') {
    const checkPsychic = async (target) => {
      const isSpecial = !NON_SPECIAL_ROLES.includes(target.role);
      setCheckResult({ name: target.name, text: isSpecial ? '👍 มีพลังพิเศษ!' : '👎 ไม่มีพลังพิเศษ (ชาวบ้าน/หมาป่าธรรมดา)' });
    };
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="👁️‍🗨️ ญานทิพย์" desc="เช็คว่ามีพลังพิเศษหรือไม่" color="#fee440" />
        {!checkResult ? <PlayerList players={livingPlayers.filter(p=>p.name!==playerName)} onSelect={checkPsychic} isSelected={()=>false} />
         : <div className="text-center" style={{ padding: '2rem' }}><h3>{checkResult.name} คือ</h3><div style={{ fontSize: '1.5rem' }}>{checkResult.text}</div></div>}
        <Button onClick={() => confirmAction({'nightActions/psychicDone': true})} disabled={!checkResult}>หลับตา</Button>
      </div>
    );
  }

  const isRealSeerAlive = playersList.some(p => p.role === 'seer' && !p.isDead);
  const isMySeerTurn = (myRole === 'seer') || (myRole === 'oracle_apprentice');
  
  if (currentTurn === 'seer' && isMySeerTurn) {
    if (myRole === 'oracle_apprentice' && isRealSeerAlive) {
      return (
        <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <Title title="👁️ ศิษย์เทพพยากรณ์" desc="รอเทพพยากรณ์ตัวจริงส่อง..." color="#48cae4" />
          {nightActions.seerCheck && <div className="text-center" style={{ padding: '2rem' }}>เทพพยากรณ์ส่อง {nightActions.seerCheck}!</div>}
        </div>
      );
    }
    const checkSeer = async (target) => {
      // wolfman appears GOOD to Seer (Seer_See = Good in spreadsheet)
      // half_werewolf appears BAD/Evil to Seer (Seer_See = Bad in spreadsheet)
      let isEvil;
      if (target.role === 'wolfman') {
        isEvil = false; // looks like villager
      } else if (target.role === 'half_werewolf') {
        isEvil = true; // looks like werewolf
      } else {
        isEvil = ['werewolf', 'lone_wolf', 'wolf_cub', 'dire_wolf'].includes(target.role);
      }
      const text = isEvil ? '🐺 ฝ่ายร้าย!' : '😇 ฝ่ายดี';
      setCheckResult({ name: target.name, text });
      await update(ref(db, `rooms/${roomId}/nightActions`), { seerCheck: target.name });
    };
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="🔮 เทพพยากรณ์" desc="ส่องดูว่าใครคือฝ่ายดีหรือฝ่ายร้าย" color="#48cae4" />
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
        <Title title="📢 ผู้เผยตัวตน" desc="เลือก 1 คน ถ้าเขาเป็นหมาป่า เขาจะตาย ถ้าไม่ใช่ คุณจะตายเอง!" color="#f4a261" />
        <PlayerList players={livingPlayers.filter(p=>p.name!==playerName)} onSelect={p=>setTarget1(p.name===target1?null:p.name)} isSelected={p=>target1===p.name} icon="📢" />
        <Button onClick={confirmRevealer} variant={target1 ? 'danger' : 'secondary'}>{target1 ? 'เปิดเผยตัวตน!' : 'ไม่ใช้ หลับตา'}</Button>
      </div>
    );
  }

  if (currentTurn === 'paranormal_detective' && myRole === 'paranormal_detective') {
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="👻🔍 นักสืบเรื่องลี้ลับ" desc="คุณสามารถถามว่าคุณและคนข้างๆ 2 คน มีใครเป็นหมาป่าหรือไม่ (ใช้ได้ 1 ครั้ง/เกม) ให้ถาม Moderator โดยตรง" color="#2a9d8f" />
        <Button onClick={() => confirmAction({'nightActions/paranormal_detectiveDone': true})}>รับทราบ หลับตา</Button>
      </div>
    );
  }

  if (currentTurn === 'huntress' && myRole === 'huntress') {
    const hasAmmo = gameData.huntressAmmo !== false;
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="🧝‍♀️ พรานหญิง" desc={hasAmmo ? 'ตื่นทุกคืน — เลือกยิงหรือไม่ก็ได้ (ยิงได้ 1 ครั้งตลอดเกม)' : '🏹 หมดกระสุนแล้ว'} color="#e76f51" />
        {hasAmmo ? (
          <>
            <PlayerList players={livingPlayers.filter(p=>p.name!==playerName)} onSelect={p=>setTarget1(p.name===target1?null:p.name)} isSelected={p=>target1===p.name} icon="🏹" />
            <Button onClick={() => confirmAction({'nightActions/huntressKill': target1 || null, 'nightActions/huntressDone': true, ...(target1 && {'gameData/huntressAmmo': false})})} variant={target1 ? 'danger' : 'secondary'}>{target1 ? '🏹 ยิง!' : 'ไม่ยิงคืนนี้ หลับตา'}</Button>
          </>
        ) : (
          <Button onClick={() => confirmAction({'nightActions/huntressDone': true})} variant="secondary">หมดกระสุนแล้ว หลับตา</Button>
        )}
      </div>
    );
  }

  if (currentTurn === 'troublemaker' && myRole === 'troublemaker') {
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="🌪️ ตัวป่วน" desc="ทำให้การโหวตตอนเช้า สามารถแขวนคอได้ 2 คน! (ใช้ได้ 1 ครั้ง)" color="#e63946" />
        <Button onClick={() => confirmAction({'gameData/twoExecutions': true, 'nightActions/troublemakerDone': true, 'gameData/troublemakerAvailable': false})} variant="danger" style={{ padding: '2rem' }}>กวนเมือง! (โหวตตาย 2 คน)</Button>
        <Button onClick={() => confirmAction({'nightActions/troublemakerDone': true})} variant="secondary">ไม่ใช้ หลับตา</Button>
      </div>
    );
  }

  if (currentTurn === 'priest' && myRole === 'priest') {
    const prevBlessed = gameData.priestBuff;
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="✝️ นักบวช" desc="ตื่นทุกคืน — เลือกพรมน้ำมนต์คุ้มครอง 1 คน (ห้ามตัวเอง) พรจะเปลี่ยนทุกคืนตามที่เลือก" color="#fffb00" />
        {prevBlessed && <div style={{padding:'0.5rem',background:'rgba(255,251,0,0.1)',borderRadius:'8px',textAlign:'center',fontSize:'0.85rem',color:'#fffb00'}}>พรมคืนที่แล้ว: {prevBlessed}</div>}
        <PlayerList players={livingPlayers.filter(p=>p.name!==playerName)} onSelect={p=>setTarget1(p.name===target1?null:p.name)} isSelected={p=>target1===p.name} icon="✝️" />
        <Button onClick={() => confirmAction({'gameData/priestBuff': target1 || null, 'nightActions/priestMark': target1 || null, 'nightActions/priestDone': true})} variant={target1 ? 'primary' : 'secondary'}>{target1 ? `✝️ พรมน้ำมนต์ ${target1}` : 'ไม่พรมคืนนี้ หลับตา'}</Button>
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

  if (currentTurn === 'insomniac' && myRole === 'insomniac') {
    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Title title="🦉 คนอดนอน" desc="เช็คว่าคนนั่งซ้าย-ขวาของคุณตื่นมาทำกิจกรรมคืนนี้หรือเปล่า" color="#e0aaff" />
        <div style={{ padding: '1.25rem', background: 'rgba(224,170,255,0.1)', borderRadius: '12px', border: '1px solid rgba(224,170,255,0.3)' }}>
          <p style={{ color: '#e0aaff', fontWeight: 'bold', marginBottom: '0.5rem' }}>📋 วิธีใช้สิทธิ์:</p>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>
            หันไปถาม Moderator เบาๆ ว่า<br/>
            <strong style={{color:'white'}}>&ldquo;คนซ้ายผมตื่นไหม?&rdquo;</strong> และ <strong style={{color:'white'}}>&ldquo;คนขวาผมตื่นไหม?&rdquo;</strong><br/>
            Moderator จะพยักหน้าหรือส่ายหน้าเบาๆ ตอบให้
          </p>
        </div>
        <Button onClick={() => confirmAction({'nightActions/insomniacDone': true})}>รับทราบ หลับตา</Button>
      </div>
    );
  }

  return renderSleep();
}
