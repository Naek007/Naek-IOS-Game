import React, { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ref, onValue, update } from 'firebase/database';
import { db } from '../firebase';
import Button from '../components/Button';
import { playClip, isNarrator } from '../audio';

export default function Day() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const playerName = searchParams.get('name');
  const navigate = useNavigate();

  const [roomData, setRoomData] = useState(null);
  const [selectedTarget, setSelectedTarget] = useState(null);
  const spokeRef = useRef(false);

  // เสียงพากย์ "ช่วงตัดสิน" เล่นครั้งเดียวบนเครื่อง narrator
  useEffect(() => {
    if (!roomData || spokeRef.current) return;
    spokeRef.current = true;
    if (isNarrator(roomData, playerName)) playClip(roomData.gameType === 'salem' ? 'sl_day' : 'wf_day');
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
        
        if (data.status === 'night') {
          navigate(`/night/${roomId}?name=${playerName}`);
        } else if (data.status === 'end') {
          navigate(`/end/${roomId}?name=${playerName}`);
        }
      } else {
        navigate('/');
      }
    });

    return () => unsubscribe();
  }, [roomId, playerName, navigate]);

  if (!roomData) return <div className="text-center mt-8">กำลังโหลด...</div>;

  const isHost = roomData.host === playerName;
  const isModerator = roomData.players[playerName]?.role === 'moderator';
  const allPlayers = Object.values(roomData.players || {}).filter(Boolean);
  const livingPlayers = allPlayers.filter(p => !p.isDead && p.role !== 'moderator');
  const gameData = roomData.gameData || {};
  const round = roomData.round || 1;

  // Vampire bite: victims die before voting (they can talk but die when voting starts)
  const vampireBites = gameData.vampireBites || {};
  const vampireVictimThisDay = Object.entries(vampireBites)
    .filter(([name, biteRound]) => biteRound === round && !roomData.players[name]?.isDead)
    .map(([name]) => name);
  const hasVampireVictim = vampireVictimThisDay.length > 0;

  // Kill vampire victims before voting (host/moderator action)
  const killVampireVictims = async () => {
    const updates = {};
    vampireVictimThisDay.forEach(name => {
      updates[`rooms/${roomId}/players/${name}/isDead`] = true;
    });
    updates[`rooms/${roomId}/gameData/vampireVictimsKilledRound`] = round;
    await update(ref(db), updates);
  };

  // Helper to check win conditions
  const checkWinCondition = (players) => {
    // === SALEM: แม่มดหมด=ชาวเมืองชนะ / แม่มด>=ชาวเมือง=แม่มดชนะ ===
    if (roomData.gameType === 'salem') {
      const livingS = Object.values(players).filter(Boolean).filter(p => !p.isDead && p.role !== 'moderator');
      const witchesS = livingS.filter(p => p.role === 'witch').length;
      const townS = livingS.length - witchesS;
      if (witchesS === 0) return 'salem_town';
      if (witchesS >= townS) return 'salem_witch';
      return null;
    }

    // Beggar Win (if dead)
    const allP = Object.values(players).filter(Boolean);
    const beggarDead = allP.some(p => p.role === 'beggar' && p.isDead);
    if (beggarDead) return 'beggar';

    const living = allP.filter(p => !p.isDead && p.role !== 'moderator');
    
    // Cult Leader Win
    const cultMembers = gameData.cultMembers || [];
    const allCult = living.every(p => cultMembers.includes(p.name) || p.role === 'cult_leader');
    const cultAlive = living.some(p => p.role === 'cult_leader');
    if (allCult && cultAlive) return 'cult_leader';

    // Chupacabra Win
    if (living.length === 1 && living[0].role === 'chupacabra') return 'chupacabra';

    const wolfRoles = ['werewolf', 'lone_wolf', 'wolf_cub', 'dire_wolf', 'wolfman'];
    const livingWolves = living.filter(p => wolfRoles.includes(p.role));
    const wolvesCount = livingWolves.length;
    const goodCount = living.length - wolvesCount;

    if (wolvesCount === 0) return 'villager';
    if (wolvesCount >= goodCount) {
      if (wolvesCount === 1 && livingWolves[0].role === 'lone_wolf') {
        return 'lone_wolf';
      }
      return 'werewolf';
    }
    return null;
  };

  const handleExecute = async (targetName) => {
   try {
    const updates = {};
    const updatedPlayers = JSON.parse(JSON.stringify(roomData.players));
    const lovers = gameData.lovers || [];
    let someoneDied = false;

    // If someone was executed, update their status
    if (targetName) {
      // 1. Check Prince
      if (updatedPlayers[targetName].role === 'prince' && !gameData.princeRevealed) {
        updates[`rooms/${roomId}/gameData/princeRevealed`] = true;
        await update(ref(db), updates);
        return; // Execution bounces off, day continues (or goes to next phase? Usually ends the day, but they live)
      }

      // 2. Check BEGGAR win condition
      if (updatedPlayers[targetName].role === 'beggar') {
        updates[`rooms/${roomId}/status`] = 'end';
        updates[`rooms/${roomId}/winner`] = 'beggar';
        await update(ref(db), updates);
        return;
      }

      // 3. Kill the target
      updates[`rooms/${roomId}/players/${targetName}/isDead`] = true;
      updatedPlayers[targetName].isDead = true;
      someoneDied = true;

      const deadQueue = [targetName];

      // 4. Cupid Lovers Chain-Reaction
      if (lovers.length === 2) {
        if (targetName === lovers[0]) {
          if (updatedPlayers[lovers[1]].role === 'beggar') {
            updates[`rooms/${roomId}/status`] = 'end';
            updates[`rooms/${roomId}/winner`] = 'beggar';
            await update(ref(db), updates);
            return;
          }
          updates[`rooms/${roomId}/players/${lovers[1]}/isDead`] = true;
          updatedPlayers[lovers[1]].isDead = true;
          deadQueue.push(lovers[1]);
        } else if (targetName === lovers[1]) {
          if (updatedPlayers[lovers[0]].role === 'beggar') {
            updates[`rooms/${roomId}/status`] = 'end';
            updates[`rooms/${roomId}/winner`] = 'beggar';
            await update(ref(db), updates);
            return;
          }
          updates[`rooms/${roomId}/players/${lovers[0]}/isDead`] = true;
          updatedPlayers[lovers[0]].isDead = true;
          deadQueue.push(lovers[0]);
        }
      }

      // Check Doppelganger
      const dgTarget = gameData.doppelgangerTarget;
      deadQueue.forEach(name => {
        if (dgTarget === name) {
          const dgName = Object.values(updatedPlayers).filter(Boolean).find(p => p.role === 'doppelganger')?.name;
          if (dgName && !updatedPlayers[dgName].isDead) {
            updates[`rooms/${roomId}/players/${dgName}/role`] = updatedPlayers[name].role;
            updatedPlayers[dgName].role = updatedPlayers[name].role;
          }
        }
      });

      // 5. Check if Wolf Cub died
      deadQueue.forEach(name => {
        if (roomData.players[name]?.role === 'wolf_cub') {
          updates[`rooms/${roomId}/gameData/wolvesDoubleKillForRound`] = (roomData.round || 1) + 1;
        }
      });

      // 6. Hunter Trigger
      let hunterDied = false;
      let deadHunterName = null;
      deadQueue.forEach(name => {
        if (roomData.players[name]?.role === 'hunter') {
          hunterDied = true;
          deadHunterName = name;
        }
      });

      if (hunterDied) {
        updates[`rooms/${roomId}/status`] = 'hunter_revenge';
        updates[`rooms/${roomId}/gameData/hunterName`] = deadHunterName;
        // Keep checking if Trouble Maker allows another execution
        let nextP = 'night';
        if (gameData.twoExecutions) {
          updates[`rooms/${roomId}/gameData/twoExecutions`] = false; // Used 1
          nextP = 'day'; // Come back to day
        }
        updates[`rooms/${roomId}/gameData/nextPhaseAfterHunter`] = nextP;
        
        if (nextP === 'night') {
          updates[`rooms/${roomId}/round`] = (roomData.round || 1) + 1;
          updates[`rooms/${roomId}/currentTurn`] = 'werewolf';
          updates[`rooms/${roomId}/nightActions`] = { werewolfVotes: {}, werewolfTarget: null };
        }
        await update(ref(db), updates);
        return;
      }
    }

    // Trouble Maker check
    if (gameData.twoExecutions && someoneDied) {
      updates[`rooms/${roomId}/gameData/twoExecutions`] = false; // Consumed 1
      await update(ref(db), updates);
      setSelectedTarget(null);
      return; // Continue Day!
    }

    // Check Win Condition
    let winner = checkWinCondition(updatedPlayers);

    if (winner) {
      // Check Thug win
      const thugTargets = roomData.gameData?.thugTargets || [];
      if (thugTargets.length >= 1) { // Variable length now
        const allTargetsDead = thugTargets.every(t => updatedPlayers[t]?.isDead);
        const thugDead = Object.values(updatedPlayers).filter(Boolean).find(p => p.role === 'thug')?.isDead;
        if (allTargetsDead && !thugDead) {
          winner = winner + '_and_thug';
        }
      }

      updates[`rooms/${roomId}/status`] = 'end';
      updates[`rooms/${roomId}/winner`] = winner;
    } else {
      // Game continues to next night
      updates[`rooms/${roomId}/status`] = 'night';
      updates[`rooms/${roomId}/round`] = (roomData.round || 1) + 1;
      
      // Reset night actions — ล้าง flag คืนก่อน ไม่งั้นคืนใหม่ไม่มีใครตื่น (วนไม่จบ)
      updates[`rooms/${roomId}/currentTurn`] = 'werewolf'; // Reset queue
      updates[`rooms/${roomId}/nightActions`] = { werewolfVotes: {}, werewolfTarget: null };
    }

    await update(ref(db), updates);
   } catch (err) {
     alert('แขวนคอไม่สำเร็จ: ' + (err?.message || err));
     console.error('handleExecute error:', err);
   }
  };

  return (
    <div className={`glass-panel animate-fade-in${roomData.gameType === 'salem' ? ' theme-salem' : ''}`} style={{ margin: '2rem 1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', textAlign: 'center' }}>
      <div style={{ fontSize: '4rem', marginBottom: '0.5rem' }}>⚖️</div>
      <div style={{ alignSelf: 'center', background: 'var(--accent-primary)', color: '#fff', padding: '0.2rem 0.9rem', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 'bold', letterSpacing: '1px' }}>
        {roomData.gameType === 'salem' ? '🧙‍♀️ SALEM 1692' : '🐺 WEREWOLF'}
      </div>
      <h2 style={{ color: 'var(--accent-primary)' }}>ช่วงเวลาตัดสิน</h2>

      {gameData.princeRevealed && (
        <div style={{ padding: '1rem', background: 'rgba(255, 215, 0, 0.2)', borderRadius: '12px', border: '1px solid gold' }}>
          <h3 style={{ color: 'gold' }}>👑 เจ้าชายเปิดเผยตัวตน!</h3>
          <p>เขาจะไม่ตายจากการโหวตแขวนคอ!</p>
        </div>
      )}

      {gameData.twoExecutions && (
        <div style={{ padding: '1rem', background: 'rgba(230, 57, 70, 0.2)', borderRadius: '12px', border: '1px solid #e63946' }}>
          <h3 style={{ color: '#e63946' }}>🌪️ เมืองปั่นป่วน!</h3>
          <p>วันนี้จะมีการโหวตแขวนคอได้ <strong>2 ครั้ง!</strong></p>
        </div>
      )}

      {hasVampireVictim && gameData.vampireVictimsKilledRound !== round && (
        <div style={{ padding: '1.25rem', background: 'rgba(106, 4, 15, 0.4)', borderRadius: '12px', border: '2px solid #9d0208', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🧛</div>
          <h3 style={{ color: '#e85d04', marginBottom: '0.5rem' }}>พิษแวมไพร์กำลังออกฤทธิ์!</h3>
          <p style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>
            ก่อนเริ่มโหวต — ผู้เล่นต่อไปนี้กระอักเลือดตาย:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
            {vampireVictimThisDay.map(name => (
              <div key={name} style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#e85d04' }}>
                ☠️ {name}
              </div>
            ))}
          </div>
          {(isHost || isModerator) && (
            <Button onClick={killVampireVictims} variant="danger">
              ยืนยัน — เอาคนตายออกจากเกม
            </Button>
          )}
          {!isHost && !isModerator && (
            <p style={{ color: '#e85d04', fontSize: '0.9rem' }}>รอ Host/Moderator ยืนยัน...</p>
          )}
        </div>
      )}
      
      {isModerator ? (
        <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', textAlign: 'left' }}>
          <h3 style={{ marginBottom: '1rem', color: '#00c8ff', textAlign: 'center' }}>👑 แผงควบคุม (Moderator)</h3>
          <p style={{ textAlign: 'center', marginBottom: '1rem', color: 'var(--text-secondary)' }}>ให้ผู้เล่นถกเถียงกัน จากนั้นคุณเป็นคนกดประหารตามมติโต๊ะ</p>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {livingPlayers.map(p => {
              const isSilenced = roomData.nightActions?.mageTarget === p.name;
              const isExiled = roomData.nightActions?.hagTarget === p.name;
              return (
                <div 
                  key={p.name}
                  onClick={() => !isExiled && setSelectedTarget(p.name)}
                  style={{
                    background: selectedTarget === p.name ? 'rgba(255, 0, 0, 0.3)' : 'rgba(0,0,0,0.3)',
                    border: selectedTarget === p.name ? '1px solid red' : '1px solid transparent',
                    padding: '1rem',
                    borderRadius: '8px',
                    cursor: isExiled ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    opacity: isExiled ? 0.5 : 1
                  }}
                >
                  <span>{p.name} {isSilenced && '🤐'} {isExiled && '🚪'}</span>
                  <span>{selectedTarget === p.name && '🔥 ประหาร'}</span>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Button 
              onClick={() => handleExecute(selectedTarget)} 
              variant="danger" 
              size="lg"
              disabled={!selectedTarget}
            >
              🔥 ยืนยันแขวนคอ {selectedTarget}
            </Button>
            <Button 
              onClick={() => handleExecute(null)} 
              variant="secondary" 
              size="lg"
            >
              🕊️ ไม่ประหารใคร (ข้ามโหวต)
            </Button>
          </div>
        </div>
      ) : !isHost ? (
        <div style={{ padding: '2rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
          <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
            กำลังปรึกษาและถกเถียงกันว่าใครคือ{roomData.gameType === 'salem' ? 'แม่มด' : 'หมาป่า'}...
          </p>
          <p style={{ marginTop: '1rem', opacity: 0.5 }}>รอให้ Moderator หรือ Host สรุปผลการโหวตประหาร</p>
        </div>
      ) : (
        <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', textAlign: 'left' }}>
          <h3 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>สรุปผลโหวตประหาร (สำหรับ Host)</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {livingPlayers.map(p => {
              const isSilenced = roomData.nightActions?.mageTarget === p.name;
              const isExiled = roomData.nightActions?.hagTarget === p.name;
              return (
                <div 
                  key={p.name}
                  onClick={() => !isExiled && setSelectedTarget(p.name)}
                  style={{
                    background: selectedTarget === p.name ? 'rgba(255, 0, 0, 0.3)' : 'rgba(0,0,0,0.3)',
                    border: selectedTarget === p.name ? '1px solid red' : '1px solid transparent',
                    padding: '1rem',
                    borderRadius: '8px',
                    cursor: isExiled ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    opacity: isExiled ? 0.5 : 1
                  }}
                >
                  <span>{p.name} {isSilenced && '🤐'} {isExiled && '🚪'}</span>
                  <span>{selectedTarget === p.name && '🔥 ประหาร'}</span>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Button 
              onClick={() => handleExecute(selectedTarget)} 
              variant="danger" 
              size="lg"
              disabled={!selectedTarget}
            >
              🔥 ยืนยันแขวนคอ {selectedTarget}
            </Button>
            <Button 
              onClick={() => handleExecute(null)} 
              variant="secondary" 
              size="lg"
            >
              🕊️ ไม่ประหารใคร (ข้ามโหวต)
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
