import React, { useEffect, useState, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ref, onValue, update, remove } from 'firebase/database';
import { db } from '../firebase';
import Button from '../components/Button';
import { playClip, isNarrator } from '../audio';

const WIN_CLIPS = {
  werewolf: 'wf_win_werewolf',
  lone_wolf: 'wf_win_werewolf',
  villager: 'wf_win_villager',
  salem_witch: 'sl_win_witch',
  salem_town: 'sl_win_town',
};

export default function EndGame() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const playerName = searchParams.get('name');
  const navigate = useNavigate();

  const [roomData, setRoomData] = useState(null);
  const spokeRef = useRef(false);

  // เสียงพากย์ประกาศผู้ชนะ (ครั้งเดียว บนเครื่อง narrator)
  useEffect(() => {
    if (!roomData || spokeRef.current || !roomData.winner) return;
    spokeRef.current = true;
    if (!isNarrator(roomData, playerName)) return;
    const mw = roomData.winner.replace('_and_thug', '');
    if (WIN_CLIPS[mw]) playClip(WIN_CLIPS[mw]);
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
        
        // If the host decides to play again, redirect to lobby
        if (data.status === 'waiting') {
          navigate(`/lobby/${roomId}?name=${playerName}`);
        }
      } else {
        navigate('/');
      }
    });

    return () => unsubscribe();
  }, [roomId, playerName, navigate]);

  if (!roomData) return <div className="text-center mt-8">กำลังโหลด...</div>;

  const isHost = roomData.host === playerName;
  const winner = roomData.winner;
  const playersList = Object.values(roomData.players || {}).filter(Boolean);

  const mainWinner = winner ? winner.replace('_and_thug', '') : '';
  const thugWon = winner ? winner.includes('thug') : false;

  let bgColor = 'rgba(0, 0, 0, 0.2)';
  let titleColor = '#ffffff';
  let titleText = 'จบเกม!';
  let emoji = '🏁';

  if (mainWinner === 'werewolf') {
    bgColor = 'rgba(139, 0, 0, 0.2)';
    titleColor = '#ff3333';
    titleText = 'ฝ่ายหมาป่าชนะ!';
    emoji = '🐺';
  } else if (mainWinner === 'villager') {
    bgColor = 'rgba(46, 204, 113, 0.2)';
    titleColor = '#2ecc71';
    titleText = 'ฝ่ายชาวบ้านชนะ!';
    emoji = '😇';
  } else if (mainWinner === 'lone_wolf') {
    bgColor = 'rgba(255, 165, 0, 0.2)';
    titleColor = '#ffa500';
    titleText = 'หมาป่าเดียวดายชนะ (คนเดียว)!';
    emoji = '🐺';
  } else if (mainWinner === 'beggar') {
    bgColor = 'rgba(128, 0, 128, 0.2)';
    titleColor = '#800080';
    titleText = 'ยาจกชนะ! เขาต้องการแค่ถูกกำจัด!';
    emoji = '🥺';
  } else if (mainWinner === 'cult_leader') {
    bgColor = 'rgba(74, 78, 105, 0.2)';
    titleColor = '#4a4e69';
    titleText = 'ลัทธิครอบงำหมู่บ้าน! (เจ้าลัทธิชนะ)';
    emoji = '🕋';
  } else if (mainWinner === 'chupacabra') {
    bgColor = 'rgba(114, 9, 183, 0.2)';
    titleColor = '#7209b7';
    titleText = 'ซูปราคาบราเหลือรอดเป็นคนสุดท้าย!';
    emoji = '🦇';
  } else if (mainWinner === 'salem_witch') {
    bgColor = 'rgba(139, 0, 0, 0.2)';
    titleColor = '#ff3333';
    titleText = 'ฝ่ายแม่มดชนะ! 🧙‍♀️';
    emoji = '🧙‍♀️';
  } else if (mainWinner === 'salem_town') {
    bgColor = 'rgba(46, 204, 113, 0.2)';
    titleColor = '#2ecc71';
    titleText = 'ฝ่ายชาวเมืองชนะ! 🏠';
    emoji = '🏠';
  }

  const playAgain = async () => {
    // Reset room state
    const updates = {
      [`rooms/${roomId}/status`]: 'waiting',
      [`rooms/${roomId}/round`]: null,
      [`rooms/${roomId}/nightActions`]: null,
      [`rooms/${roomId}/morningResult`]: null,
      [`rooms/${roomId}/winner`]: null,
      [`rooms/${roomId}/setupPhase`]: 'deck',
      [`rooms/${roomId}/availableRoles`]: null
    };

    // Reset all players
    playersList.forEach(p => {
      updates[`rooms/${roomId}/players/${p.name}/role`] = 'unassigned';
      updates[`rooms/${roomId}/players/${p.name}/isDead`] = false;
    });

    await update(ref(db), updates);
  };

  const closeRoom = async () => {
    await remove(ref(db, `rooms/${roomId}`));
    navigate('/');
  };

  return (
    <div className={`glass-panel animate-fade-in${roomData.gameType === 'salem' ? ' theme-salem' : ''}`} style={{ margin: '2rem 1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', textAlign: 'center', background: bgColor }}>
      <div style={{ fontSize: '5rem', marginBottom: '1rem' }}>{emoji}</div>
      <h1 style={{ color: titleColor, fontSize: '3rem', textShadow: '2px 2px 10px rgba(0,0,0,0.5)' }}>
        {titleText}
      </h1>
      
      {thugWon && (
        <div style={{ padding: '1rem', background: 'rgba(255,0,0,0.5)', borderRadius: '12px', marginTop: '1rem' }}>
          <h2 style={{ color: 'white' }}>🥷 อันธพาลชนะด้วย! (เป้าหมายตายครบ)</h2>
        </div>
      )}
      
      <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.4)', borderRadius: '12px', textAlign: 'left', marginTop: '1rem' }}>
        <h3 style={{ marginBottom: '1rem', color: 'var(--text-secondary)', textAlign: 'center' }}>เปิดเผยบทบาททั้งหมด</h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {playersList.map(p => (
            <div 
              key={p.name}
              style={{
                background: p.isDead ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.1)',
                padding: '0.75rem',
                borderRadius: '8px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                opacity: p.isDead ? 0.5 : 1
              }}
            >
              <span style={{ textDecoration: p.isDead ? 'line-through' : 'none' }}>
                {p.name} {p.name === playerName && '(คุณ)'}
              </span>
              <span style={{ fontWeight: 'bold', color: p.role === 'werewolf' || p.role === 'lone_wolf' || p.role === 'wolf_cub' ? '#ff3333' : '#2ecc71' }}>
                {p.role}
              </span>
            </div>
          ))}
        </div>
      </div>

      {isHost && (
        <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <Button onClick={closeRoom} variant="danger" size="lg">
            ❌ ปิดห้อง
          </Button>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>อยากเล่นใหม่ ให้ปิดห้องแล้วสร้างห้องใหม่ครับ</p>
        </div>
      )}
      
      {!isHost && (
        <p style={{ marginTop: '2rem', color: 'var(--text-secondary)' }}>รอ Host ตัดสินใจ...</p>
      )}
    </div>
  );
}
