import React, { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ref, onValue, update } from 'firebase/database';
import { db } from '../firebase';
import Button from '../components/Button';
import { playClip, isNarrator } from '../audio';

export default function HunterRevenge() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const playerName = searchParams.get('name');
  const navigate = useNavigate();

  const [roomData, setRoomData] = useState(null);
  const [target, setTarget] = useState(null);
  const spokeRef = useRef(false);

  // เสียงพากย์ "นายพรานแก้แค้น" (ครั้งเดียว บนเครื่อง narrator)
  useEffect(() => {
    if (!roomData || spokeRef.current) return;
    spokeRef.current = true;
    if (isNarrator(roomData, playerName)) playClip('wf_hunter_revenge');
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
        } else if (data.status === 'night') {
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
  const gameData = roomData.gameData || {};
  const hunterName = gameData.hunterName;
  const isHunter = hunterName === playerName;
  const isModerator = roomData.players[playerName]?.role === 'moderator';
  const livingPlayers = Object.values(roomData.players || {}).filter(Boolean).filter(p => !p.isDead && p.name !== hunterName && p.role !== 'moderator');

  const checkWinCondition = (players) => {
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

  const shootTarget = async () => {
    if (!target) return;

    const updates = {};
    const updatedPlayers = JSON.parse(JSON.stringify(roomData.players));
    const lovers = gameData.lovers || [];

    // 0. Check Beggar Target
    if (updatedPlayers[target].role === 'beggar') {
      updates[`rooms/${roomId}/status`] = 'end';
      updates[`rooms/${roomId}/winner`] = 'beggar';
      await update(ref(db), updates);
      return;
    }

    // 1. Kill the target
    updates[`rooms/${roomId}/players/${target}/isDead`] = true;
    updatedPlayers[target].isDead = true;

    // 2. Lovers Chain Reaction
    if (lovers.length === 2) {
      if (target === lovers[0]) {
        if (updatedPlayers[lovers[1]].role === 'beggar') {
          updates[`rooms/${roomId}/status`] = 'end';
          updates[`rooms/${roomId}/winner`] = 'beggar';
          await update(ref(db), updates);
          return;
        }
        updates[`rooms/${roomId}/players/${lovers[1]}/isDead`] = true;
        updatedPlayers[lovers[1]].isDead = true;
      } else if (target === lovers[1]) {
        if (updatedPlayers[lovers[0]].role === 'beggar') {
          updates[`rooms/${roomId}/status`] = 'end';
          updates[`rooms/${roomId}/winner`] = 'beggar';
          await update(ref(db), updates);
          return;
        }
        updates[`rooms/${roomId}/players/${lovers[0]}/isDead`] = true;
        updatedPlayers[lovers[0]].isDead = true;
      }
    }

    // 3. Check Win Condition
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
      updates[`rooms/${roomId}/status`] = gameData.nextPhaseAfterHunter || 'day';
    }

    await update(ref(db), updates);
  };

  return (
    <div className="glass-panel animate-fade-in" style={{ margin: '2rem 1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', textAlign: 'center' }}>
      <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🏹</div>
      <h2 style={{ color: '#ff9f1c' }}>การแก้แค้นของนายพราน!</h2>
      
      {isModerator ? (
        <div style={{ padding: '2rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
          <p style={{ fontSize: '1.2rem', color: '#00c8ff' }}>👑 คุณคือ Moderator</p>
          <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>
            {hunterName} คือนายพรานที่กำลังจะตาย...<br/>เขากำลังเล็งปืนเตรียมลากคนไปลงนรกด้วย!
          </p>
          <p style={{ marginTop: '1rem', opacity: 0.5 }}>รอให้นายพรานยิงปืนให้เสร็จ...</p>
        </div>
      ) : !isHunter ? (
        <div style={{ padding: '2rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
          <p style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>
            {hunterName} คือนายพรานที่กำลังจะตาย...<br/>เขากำลังเล็งปืนเตรียมลากคนไปลงนรกด้วย!
          </p>
          <p style={{ marginTop: '1rem', opacity: 0.5 }}>รอให้นายพรานยิงปืนให้เสร็จ...</p>
        </div>
      ) : (
        <div style={{ padding: '1rem', background: 'rgba(255,255,255,0.05)', borderRadius: '12px', textAlign: 'left' }}>
          <h3 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>คุณคือนายพราน! เลือกยิงใครสักคนก่อนตาย</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.5rem', maxHeight: '250px', overflowY: 'auto' }}>
            {livingPlayers.map(p => (
              <div 
                key={p.name}
                onClick={() => setTarget(p.name)}
                style={{
                  background: target === p.name ? 'rgba(255, 159, 28, 0.3)' : 'rgba(0,0,0,0.3)',
                  border: target === p.name ? '1px solid #ff9f1c' : '1px solid transparent',
                  padding: '1rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <span>{p.name}</span>
                <span>{target === p.name && '🎯 เล็ง'}</span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '2rem' }}>
            <Button 
              onClick={shootTarget} 
              size="lg"
              disabled={!target}
              style={{ background: '#ff9f1c', width: '100%' }}
            >
              💥 ลั่นไกยิง {target}!
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
