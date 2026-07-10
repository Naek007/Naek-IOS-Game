import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ref, onValue, update, onDisconnect, remove, get } from 'firebase/database';
import { db } from '../firebase';
import Button from '../components/Button';

export default function Lobby() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const playerName = searchParams.get('name');
  const navigate = useNavigate();
  
  const [roomData, setRoomData] = useState(null);

  useEffect(() => {
    if (!roomId || !playerName) {
      navigate('/');
      return;
    }

    const roomRef = ref(db, `rooms/${roomId}`);
    const playerRef = ref(db, `rooms/${roomId}/players/${playerName}`);

    // Set Firebase to automatically remove this player if they close the tab or lose internet
    onDisconnect(playerRef).remove();

    const unsubscribe = onValue(roomRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        setRoomData(data);
        if (data.status === 'setup') {
          navigate(`/setup/${roomId}?name=${playerName}`);
        }
      } else {
        alert("ห้องถูกปิดไปแล้ว");
        navigate('/');
      }
    });

    return () => {
      unsubscribe();
      // Only cancel the onDisconnect listener on unmount to avoid memory leaks.
      // We removed the manual remove() because React StrictMode triggers it instantly during dev.
      onDisconnect(playerRef).cancel();
    };
  }, [roomId, playerName, navigate]);

  if (!roomData) return <div className="text-center mt-8">กำลังโหลดข้อมูลห้อง...</div>;

  const playersList = Object.values(roomData.players || {});
  const activePlayers = playersList.filter(p => p && p.role !== 'moderator');
  const moderators = playersList.filter(p => p && p.role === 'moderator');
  const isHost = roomData.host === playerName;
  const isModerator = roomData.isModeratorOnly && isHost;

  const leaveRoom = async () => {
    if (isHost) {
      // ถ้า Host ออก ให้ลบห้องทิ้งเลย
      await remove(ref(db, `rooms/${roomId}`));
    } else {
      // ถ้า Guest ออก ให้ลบแค่ชื่อตัวเอง
      const playerRef = ref(db, `rooms/${roomId}/players/${playerName}`);
      await remove(playerRef);
    }
    navigate('/');
  };

  const startGame = async () => {
    await update(ref(db, `rooms/${roomId}`), {
      status: 'setup',
      setupPhase: 'deck'
    });
  };

  const gameName = roomData.gameType === 'werewolf' ? '🐺 Werewolf' : '🧙‍♀️ Salem 1692';

  return (
    <div className={`glass-panel${roomData.gameType === 'salem' ? ' theme-salem' : ''}`} style={{ margin: '2rem 1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="text-center">
        <div style={{ 
          display: 'inline-block', 
          background: 'var(--accent-primary)', 
          color: 'white', 
          padding: '0.25rem 1rem', 
          borderRadius: '20px', 
          fontSize: '0.875rem',
          fontWeight: 'bold',
          marginBottom: '1rem'
        }}>
          เกมที่กำลังจะเล่น: {gameName}
        </div>
        <h2 style={{ fontSize: '1rem', color: 'var(--text-secondary)' }}>ห้องล็อบบี้</h2>
        <h1 style={{ color: 'var(--accent-primary)', fontSize: '3rem', letterSpacing: '4px' }}>{roomId}</h1>
        <p>ให้เพื่อนกรอกรหัสนี้เพื่อเข้ามาในห้อง</p>
      </div>

      <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '12px', padding: '1rem' }}>
        <h3 style={{ marginBottom: '1rem', color: 'var(--text-secondary)' }}>ผู้เล่น ({activePlayers.length}/{roomData.maxPlayers || '?'})</h3>
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {activePlayers.map((p, idx) => (
            <li key={idx} style={{ 
              padding: '0.75rem', 
              background: 'rgba(255,255,255,0.05)', 
              borderRadius: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span>{p.name} {p.name === playerName && '(คุณ)'}</span>
              {p.isHost && <span title="หัวหน้าห้อง">👑</span>}
            </li>
          ))}
        </ul>
        
        {moderators.length > 0 && (
          <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>ผู้คุมเกม (Moderator)</h4>
            <div style={{ padding: '0.5rem', background: 'rgba(0, 200, 255, 0.1)', borderRadius: '8px', color: '#00c8ff' }}>
              👑 {moderators[0].name}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {isHost ? (
          <Button onClick={startGame} size="lg" disabled={activePlayers.length !== (roomData.maxPlayers || activePlayers.length)}>
            {activePlayers.length < (roomData.maxPlayers || 0) ? 'รอเพื่อนเข้าห้องให้ครบ...' : 'เริ่มเกม! 🚀'}
          </Button>
        ) : (
          <div className="text-center" style={{ padding: '1rem', color: 'var(--text-secondary)' }}>
            กำลังรอหัวหน้าห้องกดเริ่มเกม...
          </div>
        )}
        <Button onClick={leaveRoom} variant="danger" size="md">
          ออกจากห้อง
        </Button>
      </div>
    </div>
  );
}
