import React, { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ref, onValue, update } from 'firebase/database';
import { db } from '../firebase';
import Button from '../components/Button';
import { playClip, isNarrator } from '../audio';

export default function Morning() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const playerName = searchParams.get('name');
  const navigate = useNavigate();

  const [roomData, setRoomData] = useState(null);
  const [calculated, setCalculated] = useState(false);
  const spokeRef = useRef(false);

  // เสียงพากย์ "เช้าแล้ว" เล่นครั้งเดียวบนเครื่อง narrator
  useEffect(() => {
    if (!roomData || spokeRef.current) return;
    spokeRef.current = true;
    if (isNarrator(roomData, playerName)) playClip(roomData.gameType === 'salem' ? 'sl_morning' : 'wf_morning');
  }, [roomData, playerName]);

  useEffect(() => {
    if (!roomId || !playerName) {
      navigate('/');
      return;
    }

    const roomRef = ref(db, `rooms/${roomId}`);
    const unsubscribe = onValue(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setRoomData(data);
        
        if (data.status === 'day') {
          navigate(`/day/${roomId}?name=${playerName}`);
        } else if (data.status === 'end') {
          navigate(`/end/${roomId}?name=${playerName}`);
        }
      } else {
        navigate('/');
      }
    });

    return () => unsubscribe();
  }, [roomId, playerName, navigate]);

  // Host Calculation Engine
  useEffect(() => {
    if (!roomData || roomData.host !== playerName || calculated) return;

    const calculateMorning = async () => {
     try {
      // === SALEM: แม่มดฆ่า / สายตรวจป้อง — ถ้าป้องตรงเป้าหมายแม่มด = รอด ===
      if (roomData.gameType === 'salem') {
        const a = roomData.nightActions || {};
        const r = roomData.round || 1;
        const u = {};
        const killed = a.witchTarget;
        const saved = a.constableProtect && a.constableProtect === killed;
        let dead = [];
        if (killed && !saved) {
          dead = [killed];
          u[`rooms/${roomId}/players/${killed}/isDead`] = true;
        }
        u[`rooms/${roomId}/morningResult`] = dead;
        u[`rooms/${roomId}/morningCalcRound`] = r;
        await update(ref(db), u);
        setCalculated(true);
        return;
      }

      const actions = roomData.nightActions || {};
      const gameData = roomData.gameData || {};
      const round = roomData.round || 1;
      
      let pendingDeaths = [];
      let pendingRoleChanges = {}; // For Doppelganger and Cursed
      let updates = {};

      // 1. Wolves
      if (actions.werewolfTarget && actions.werewolfTarget !== 'SKIPPED_DISEASED' && actions.werewolfTarget !== 'SKIP_NIGHT') {
        actions.werewolfTarget.split(',').forEach(target => {
          if (!target) return;
          if (actions.bodyguardTarget === target || actions.witchHeal) return;
          
          const role = roomData.players[target]?.role;
          if (role === 'cursed') {
            pendingRoleChanges[target] = 'werewolf';
          } else if (role === 'tough_guy') {
            updates[`rooms/${roomId}/gameData/toughGuyDiesOnRound`] = round + 1;
            updates[`rooms/${roomId}/gameData/toughGuyName`] = target;
          } else {
            if (role === 'infected') {
              updates[`rooms/${roomId}/gameData/wolvesDisabledForRound`] = round + 1;
            }
            pendingDeaths.push(target);
          }
        });
      }

      // 2. Witch
      if (actions.witchKill) pendingDeaths.push(actions.witchKill);

      // 3. Huntress
      if (actions.huntressKill) pendingDeaths.push(actions.huntressKill);

      // 4. Revealer
      if (actions.revealerTarget) {
        const rRole = roomData.players[actions.revealerTarget]?.role;
        const isWolf = ['werewolf', 'lone_wolf', 'wolf_cub', 'dire_wolf'].includes(rRole) && rRole !== 'wolfman';
        if (isWolf) {
          pendingDeaths.push(actions.revealerTarget);
        } else {
          // Revealer dies. Find revealer name
          const revealerName = Object.values(roomData.players).filter(Boolean).find(p => p.role === 'revealer')?.name;
          if (revealerName) pendingDeaths.push(revealerName);
        }
      }

      // 5. Chupacabra
      if (actions.chupacabraKill) {
        const cRole = roomData.players[actions.chupacabraKill]?.role;
        const isWolf = ['werewolf', 'lone_wolf', 'wolf_cub', 'dire_wolf'].includes(cRole) && cRole !== 'wolfman';
        const totalWolves = Object.values(roomData.players).filter(Boolean).filter(p => !p.isDead && ['werewolf', 'lone_wolf', 'wolf_cub', 'dire_wolf', 'wolfman'].includes(p.role)).length;
        
        if (isWolf || totalWolves === 0) {
          pendingDeaths.push(actions.chupacabraKill);
        }
      }

      // 6. Vampire Bites — victims do NOT die in morning; they die before voting in Day phase
      // (handled in Day.jsx)

      // 7. Tough Guy Delayed Death
      if (gameData.toughGuyDiesOnRound === round && gameData.toughGuyName) {
        pendingDeaths.push(gameData.toughGuyName);
      }

      // Deduplicate pending deaths
      pendingDeaths = [...new Set(pendingDeaths)];

      // Apply Priest Buff
      let finalDead = [];
      let priestBuff = gameData.priestBuff;
      pendingDeaths.forEach(target => {
        if (priestBuff === target) {
          priestBuff = null; // Buff consumed
          updates[`rooms/${roomId}/gameData/priestBuff`] = null;
        } else {
          finalDead.push(target);
        }
      });

      // Cupid Chain Reaction
      const lovers = gameData.lovers || [];
      if (lovers.length === 2) {
        if (finalDead.includes(lovers[0]) && !finalDead.includes(lovers[1])) finalDead.push(lovers[1]);
        else if (finalDead.includes(lovers[1]) && !finalDead.includes(lovers[0])) finalDead.push(lovers[0]);
      }

      // Dire Wolf Chain Reaction
      const direWolfCompanion = gameData.direWolfCompanion;
      if (direWolfCompanion && finalDead.includes(direWolfCompanion)) {
        const dwName = Object.values(roomData.players).filter(Boolean).find(p => p.role === 'dire_wolf')?.name;
        if (dwName && !finalDead.includes(dwName)) finalDead.push(dwName);
      }

      // Update DB for dead players
      let hunterDied = false;
      let deadHunterName = null;
      finalDead.forEach(name => {
        updates[`rooms/${roomId}/players/${name}/isDead`] = true;
        const role = roomData.players[name]?.role;
        if (role === 'hunter') { hunterDied = true; deadHunterName = name; }

        // Check Doppelganger
        const dgTarget = gameData.doppelgangerTarget;
        if (dgTarget === name) {
          const dgName = Object.values(roomData.players).filter(Boolean).find(p => p.role === 'doppelganger')?.name;
          if (dgName && !finalDead.includes(dgName)) {
            pendingRoleChanges[dgName] = role;
          }
        }
      });

      // Apply role changes
      Object.entries(pendingRoleChanges).forEach(([name, newRole]) => {
        updates[`rooms/${roomId}/players/${name}/role`] = newRole;
      });

      // Save the result so everyone sees it
      updates[`rooms/${roomId}/morningResult`] = finalDead;
      // ธงบอกว่าคำนวณรอบนี้เสร็จแล้ว (กันเคสไม่มีคนตาย finalDead=[] → Firebase เก็บเป็น null แล้วค้าง)
      updates[`rooms/${roomId}/morningCalcRound`] = round;
      
      
      
      // If Hunter died, we must trigger their revenge before checking win conditions or moving to Day
      if (hunterDied) {
        updates[`rooms/${roomId}/status`] = 'hunter_revenge';
        updates[`rooms/${roomId}/gameData/hunterName`] = deadHunterName;
        updates[`rooms/${roomId}/gameData/nextPhaseAfterHunter`] = 'day';
      }

      await update(ref(db), updates);
      setCalculated(true);
     } catch (err) {
       alert('คำนวณตอนเช้าไม่สำเร็จ: ' + (err?.message || err));
       console.error('calculateMorning error:', err);
     }
    };

    calculateMorning();
  }, [roomData, playerName, roomId, calculated]);

  if (!roomData) return <div className="text-center mt-8">กำลังคำนวณผลตอนเช้า...</div>;

  const isHost = roomData.host === playerName;
  const isModerator = roomData.players[playerName]?.role === 'moderator';
  const round = roomData.round || 1;
  const calcDone = roomData.morningCalcRound === round;
  const result = roomData.morningResult;
  const amIDeadNow = calcDone && result && result.includes(playerName);

  const nextPhase = async () => {
    // Navigate to day phase
    await update(ref(db, `rooms/${roomId}`), {
      status: 'day'
    });
  };

  // -------------------------
  // SPECIAL DEATH SCREEN FOR VICTIMS
  // -------------------------
  if (amIDeadNow && !isHost) {
    return (
      <div className="animate-fade-in" style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', background: 'radial-gradient(circle, rgba(139,0,0,0.8) 0%, rgba(0,0,0,1) 100%)', padding: '2rem', textAlign: 'center' }}>
        <div style={{ fontSize: '6rem', marginBottom: '1rem' }}>🩸</div>
        <h1 style={{ color: '#ff3333', fontSize: '2.5rem', textShadow: '2px 2px 10px rgba(255,0,0,0.5)', marginBottom: '1rem' }}>
          คุณถูกฆ่าตาย!
        </h1>
        <p style={{ color: 'white', fontSize: '1.2rem', opacity: 0.8 }}>
          กลายเป็นวิญญาณเร่ร่อน... ห้ามพูดหรือใบ้คนอื่นเด็ดขาด! 👻
        </p>
        
        <Button onClick={() => window.location.reload()} variant="secondary" style={{ marginTop: '3rem' }}>
          รับทราบ (เข้าสู่โหมดวิญญาณ)
        </Button>
      </div>
    );
  }

  // -------------------------
  // NORMAL MORNING SCREEN
  // -------------------------
  return (
    <div className={`glass-panel animate-fade-in${roomData.gameType === 'salem' ? ' theme-salem' : ''}`} style={{ margin: '2rem 1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', textAlign: 'center' }}>
      <div style={{ fontSize: '4rem', marginBottom: '0.5rem' }}>☀️</div>
      <div style={{ alignSelf: 'center', background: 'var(--accent-primary)', color: '#fff', padding: '0.2rem 0.9rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold', letterSpacing: '1px' }}>
        {roomData.gameType === 'salem' ? '🧙‍♀️ SALEM 1692' : '🐺 WEREWOLF'}
      </div>
      <h2 style={{ color: 'var(--accent-primary)' }}>เช้าแล้ว...</h2>
      
      <div style={{ padding: '2rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
        {!calcDone ? (
          <p>กำลังคำนวณผลลัพธ์จากค่ำคืนที่ผ่านมา...</p>
        ) : (!result || result.length === 0) ? (
          <div>
            <h3 style={{ color: '#2ecc71', fontSize: '1.5rem' }}>เมื่อคืนผ่านไปอย่างสงบสุข</h3>
            <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary)' }}>ไม่มีใครเสียชีวิต</p>
          </div>
        ) : (
          <div>
            <h3 style={{ color: 'red', fontSize: '1.5rem' }}>มีคนถูกพบเป็นศพ!</h3>
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {result.map(name => (
                <div key={name} style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>☠️ {name}</div>
              ))}
            </div>
          </div>
        )}
      </div>

      {roomData.nightActions?.mageTarget && (
        <div style={{ padding: '1rem', background: 'rgba(157, 78, 221, 0.2)', borderRadius: '12px', border: '1px solid #9d4edd', marginTop: '1rem' }}>
          <h3 style={{ color: '#e0aaff', marginBottom: '0.5rem' }}>🤐 ถูกจอมเวทใบ้:</h3>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white' }}>{roomData.nightActions.mageTarget}</div>
          <p style={{ fontSize: '0.8rem', opacity: 0.8 }}>ห้ามพูด ห้ามออกเสียง และห้ามโหวตในวันนี้</p>
        </div>
      )}

      {roomData.nightActions?.hagTarget && (
        <div style={{ padding: '1rem', background: 'rgba(204, 204, 204, 0.2)', borderRadius: '12px', border: '1px solid #ccc', marginTop: '1rem' }}>
          <h3 style={{ color: '#ccc', marginBottom: '0.5rem' }}>🚪 ถูกแม่เฒ่าไล่ออกจากหมู่บ้าน:</h3>
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white' }}>{roomData.nightActions.hagTarget}</div>
          <p style={{ fontSize: '0.8rem', opacity: 0.8 }}>ห้ามพูด ห้ามโหวต และไม่มีใครโหวตฆ่าเขาได้ในวันนี้</p>
        </div>
      )}

      {(isHost || isModerator) && calcDone && (
        <Button size="lg" onClick={nextPhase}>
          เข้าสู่ช่วงโหวตเผาคน
        </Button>
      )}
    </div>
  );
}
