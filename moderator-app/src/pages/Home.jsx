import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ref, set, get, child } from 'firebase/database';
import { db } from '../firebase';
import Button from '../components/Button';

// รหัสสร้างห้องเริ่มต้น (เปลี่ยนได้ที่ Firebase: config/hostPassword)
const HOST_CODE_FALLBACK = 'nanasuaymak007';

export default function Home() {
  const [joinCode, setJoinCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [gameType, setGameType] = useState('werewolf');
  const [maxPlayers, setMaxPlayers] = useState(5);
  const [isModeratorOnly, setIsModeratorOnly] = useState(false);
  const [hostPassword, setHostPassword] = useState('');
  const [unlocked, setUnlocked] = useState(() => {
    try { return localStorage.getItem('nf_host_unlocked') === '1'; } catch { return false; }
  });
  const navigate = useNavigate();

  const createRoom = async () => {
    if (!playerName) {
      alert("กรุณาใส่ชื่อของคุณก่อนสร้างห้อง");
      return;
    }
    
    // Sanitize playerName for Firebase keys
    const safeName = playerName.replace(/[.#$\[\]]/g, '').trim();
    if (!safeName) {
      alert("กรุณาใส่ชื่อที่ไม่มีอักขระพิเศษ");
      return;
    }

    // ต้องปลดล็อกด้วยรหัสจากแอดมินก่อน (ปลดล็อกครั้งเดียว จำไว้ในเครื่อง)
    if (!unlocked) {
      let validCode = HOST_CODE_FALLBACK;
      try {
        const snap = await get(child(ref(db), 'config/hostPassword'));
        if (snap.exists()) validCode = String(snap.val());
      } catch {
        // อ่าน config ไม่ได้ ใช้รหัสเริ่มต้นแทน
      }
      if (hostPassword.trim() !== validCode) {
        alert("รหัสสร้างห้องไม่ถูกต้อง — ต้องได้รับรหัสจากแอดมินก่อน");
        return;
      }
      setUnlocked(true);
      try { localStorage.setItem('nf_host_unlocked', '1'); } catch { /* ignore */ }
    }

    try {
      // Generate a 4-letter room code
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      let roomId = '';
      for (let i = 0; i < 4; i++) roomId += chars.charAt(Math.floor(Math.random() * chars.length));
      
      const roomRef = ref(db, `rooms/${roomId}`);
      await set(roomRef, {
      status: 'waiting',
      gameType: gameType,
      maxPlayers: parseInt(maxPlayers) || 5,
      isModeratorOnly: isModeratorOnly,
      host: playerName,
      players: {
        [playerName]: { name: playerName, role: isModeratorOnly ? 'moderator' : 'unassigned', isHost: true }
      }
    });
    
      navigate(`/lobby/${roomId}?name=${safeName}`);
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการสร้างห้อง: " + err.message);
    }
  };

  const joinRoom = async () => {
    const safeName = playerName.replace(/[.#$\[\]]/g, '').trim();
    if (!safeName || !joinCode) {
      alert("กรุณาใส่ชื่อและรหัสห้องที่ถูกต้อง");
      return;
    }
    
    try {
      const roomId = joinCode.toUpperCase().trim();
    const dbRef = ref(db);
    const snapshot = await get(child(dbRef, `rooms/${roomId}`));
    
    if (snapshot.exists()) {
      const roomData = snapshot.val();
      if (roomData.status !== 'waiting') {
        alert("เกมนี้เริ่มไปแล้ว!");
        return;
      }

      // ป้องกันการใช้ชื่อซ้ำในห้องเดียวกัน
      if (roomData.players && roomData.players[playerName]) {
        alert(`ชื่อ "${playerName}" มีคนใช้แล้วในห้องนี้ กรุณาเปลี่ยนชื่อครับ`);
        return;
      }
      
      
      const playerRef = ref(db, `rooms/${roomId}/players/${safeName}`);
      await set(playerRef, { name: safeName, role: 'unassigned', isHost: false });
      
      navigate(`/lobby/${roomId}?name=${safeName}`);
    } else {
      alert("ไม่พบห้องนี้!");
    }
    } catch (err) {
      alert("เกิดข้อผิดพลาดในการเข้าร่วมห้อง: " + err.message);
    }
  };

  return (
    <div className={`glass-panel${gameType === 'salem' ? ' theme-salem' : ''}`} style={{ margin: '2rem 1rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div className="text-center">
        <h1 style={{ color: 'var(--accent-primary)', letterSpacing: '2px' }}>NIGHTFALL</h1>
        <p style={{ letterSpacing: '1px', opacity: 0.85 }}>เมื่อราตรีมาเยือน เกมจึงเริ่มต้น</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <input 
          type="text" 
          placeholder="ชื่อของคุณ (เช่น หลิว, นานะ)" 
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          style={{ padding: '1rem', borderRadius: '12px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'white', fontSize: '1rem' }}
        />

        <div style={{ height: '1px', background: 'var(--glass-border)', margin: '1rem 0' }}></div>

        {!isJoining ? (
          <>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <Button 
                variant={gameType === 'werewolf' ? 'primary' : 'secondary'} 
                onClick={() => setGameType('werewolf')}
                size="sm"
              >
                🐺 Werewolf
              </Button>
              <Button 
                variant={gameType === 'salem' ? 'primary' : 'secondary'} 
                onClick={() => setGameType('salem')}
                size="sm"
              >
                🧙‍♀️ Salem 1692
              </Button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
              <label style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>จำนวนผู้เล่นทั้งหมด (รวม Host)</label>
              <input 
                type="number" 
                min="3" 
                max="20"
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(e.target.value)}
                style={{ padding: '0.75rem', borderRadius: '12px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'white', fontSize: '1rem', textAlign: 'center' }}
              />
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '12px' }}>
              <input 
                type="checkbox" 
                id="modToggle" 
                checked={isModeratorOnly} 
                onChange={(e) => setIsModeratorOnly(e.target.checked)} 
                style={{ width: '1.5rem', height: '1.5rem' }}
              />
              <label htmlFor="modToggle" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                ฉันจะเป็นแค่ Moderator (พนักงานคุมเกม) ไม่ลงเล่น
              </label>
            </div>

            {!unlocked ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '1rem' }}>
                <label style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>🔑 รหัสสร้างห้อง (ขอจากแอดมิน)</label>
                <input
                  type="password"
                  placeholder="ใส่รหัสเพื่อปลดล็อกการสร้างห้อง"
                  value={hostPassword}
                  onChange={(e) => setHostPassword(e.target.value)}
                  style={{ padding: '0.75rem', borderRadius: '12px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'white', fontSize: '1rem' }}
                />
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', background: 'rgba(52,199,89,0.12)', border: '1px solid rgba(52,199,89,0.4)', padding: '0.6rem 0.9rem', borderRadius: '12px' }}>
                <span style={{ color: '#34c759', fontSize: '0.9rem' }}>✅ ปลดล็อกการสร้างห้องแล้ว</span>
                <button
                  onClick={() => { setUnlocked(false); try { localStorage.removeItem('nf_host_unlocked'); } catch { /* ignore */ } }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline' }}
                >ล็อก</button>
              </div>
            )}

            <Button onClick={createRoom} size="lg">👑 สร้างห้องใหม่</Button>
            <Button onClick={() => setIsJoining(true)} variant="secondary" size="lg">👥 เข้าห้องเพื่อน</Button>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }} className="animate-fade-in">
            <input 
              type="text" 
              placeholder="รหัสห้อง 4 ตัวอักษร" 
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              maxLength={4}
              style={{ padding: '1rem', borderRadius: '12px', border: 'none', background: 'rgba(255,255,255,0.1)', color: 'white', fontSize: '1.25rem', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '4px' }}
            />
            <Button onClick={joinRoom} size="lg">เข้าห้องเลย 🚀</Button>
            <Button onClick={() => setIsJoining(false)} variant="secondary" size="sm" style={{ marginTop: '0.5rem' }}>กลับ</Button>
          </div>
        )}
      </div>
    </div>
  );
}
