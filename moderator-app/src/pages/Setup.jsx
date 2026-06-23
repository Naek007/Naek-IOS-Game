import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { ref, onValue, update } from 'firebase/database';
import { db } from '../firebase';
import Button from '../components/Button';

const werewolfRoles = [
  // ฝ่ายชาวบ้าน
  { id: 'villager', name: 'ชาวบ้าน', emoji: '🧑‍🌾' },

  // ฝ่ายสนับสนุนชาวบ้าน
  { id: 'cupid', name: 'คิวปิด', emoji: '👼' },
  { id: 'insomniac', name: 'คนอดนอน', emoji: '🦉' },
  { id: 'mage', name: 'จอมเวท', emoji: '🤐' },
  { id: 'prince', name: 'เจ้าชาย', emoji: '👑' },
  { id: 'psychic', name: 'ญาณทิพย์', emoji: '👁️‍🗨️' },
  { id: 'troublemaker', name: 'ผู้สร้างปัญหา', emoji: '🌪️' },
  { id: 'magic_eyes', name: 'ตาทิพย์', emoji: '👀' },
  { id: 'seer', name: 'ผู้หยั่งรู้', emoji: '🔮' },
  { id: 'priest', name: 'นักบวช', emoji: '✝️' },
  { id: 'paranormal_detective', name: 'คนอวดผี', emoji: '👻🔍' },
  { id: 'hunter', name: 'นายพราน', emoji: '🏹' },
  { id: 'bodyguard', name: 'บอดี้การ์ด', emoji: '🛡️' },
  { id: 'revealer', name: 'ผู้เปิดเผยตัวตน', emoji: '📢' },
  { id: 'pacifist', name: 'ผู้รักสงบ', emoji: '☮️' },
  { id: 'infected', name: 'ผู้ป่วยติดเชื้อ', emoji: '🤒' },
  { id: 'huntress', name: 'พรานหญิง', emoji: '🧝‍♀️' },
  { id: 'mason', name: 'กลุ่มภราดรภาพ', emoji: '🤝' },
  { id: 'hag', name: 'แม่เฒ่า', emoji: '👵' },
  { id: 'witch', name: 'แม่มด', emoji: '🧙‍♀️' },
  { id: 'half_werewolf', name: 'ลูกครึ่งหมาป่า', emoji: '🐶' },
  { id: 'oracle_apprentice', name: 'ศิษย์เทพพยากรณ์', emoji: '👁️' },
  { id: 'tough_guy', name: 'หนุ่มบึ้ก', emoji: '💪' },
  { id: 'thug', name: 'อันธพาล', emoji: '🥷' },
  { id: 'simpleton', name: 'ไอ้ทึ่ม', emoji: '🤪' },

  // ฝ่ายหมาป่า
  { id: 'werewolf', name: 'หมาป่า', emoji: '🐺' },
  { id: 'dark_witch', name: 'แม่หมอมนตร์ดำ', emoji: '🦹‍♀️' },
  { id: 'wolf_cub', name: 'ลูกหมาป่า', emoji: '🐾' },
  { id: 'minion', name: 'สมุนรับใช้', emoji: '🧟' },
  { id: 'lone_wolf', name: 'หมาป่าเดียวดาย', emoji: '🐺' },
  { id: 'wolfman', name: 'มนุษย์หมาป่า', emoji: '🐺🧔' },
  { id: 'dire_wolf', name: 'หมาป่าโลกันตร์', emoji: '🔥' },

  // ฝ่ายที่สาม / เป็นกลาง
  { id: 'cult_leader', name: 'ผู้นำลัทธิ', emoji: '🕋' },
  { id: 'chupacabra', name: 'ชูปากาบรัส', emoji: '🦇' },
  { id: 'beggar', name: 'ยาจก', emoji: '🥺' },

  // สลับการ์ด (Switcher)
  { id: 'drunk', name: 'คนเมา', emoji: '🍺' },
  { id: 'cursed', name: 'ผู้โดนสาป', emoji: '🧟‍♂️' },
  { id: 'doppelganger', name: 'ด็อพเพิลเก็งเงอร์', emoji: '👥' },

  // แวมไพร์
  { id: 'vampire', name: 'แวมไพร์', emoji: '🧛' },
];

const salemRoles = [
  { id: 'townsfolk', name: 'ชาวเมือง', emoji: '🏠' },
  { id: 'witch', name: 'แม่มด', emoji: '🧹' },
  { id: 'constable', name: 'สายตรวจ', emoji: '🔨' },
  { id: 'asylum', name: 'คนบ้า', emoji: '🤪' }
];

export default function Setup() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const playerName = searchParams.get('name');
  const navigate = useNavigate();
  
  const [roomData, setRoomData] = useState(null);
  const [selectedRole, setSelectedRole] = useState('');
  
  // State for Host to select active roles in the deck
  const [activeDeckRoles, setActiveDeckRoles] = useState([]);

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
        }
      } else {
        navigate('/');
      }
    });

    return () => unsubscribe();
  }, [roomId, playerName, navigate]);

  if (!roomData) return <div className="text-center mt-8">กำลังโหลด...</div>;

  const isHost = roomData.host === playerName;
  const gameType = roomData.gameType || 'werewolf';
  const setupPhase = roomData.setupPhase || 'deck';
  const allRoles = gameType === 'werewolf' ? werewolfRoles : salemRoles;

  // -------------------------
  // PHASE 1: DECK SETUP (HOST)
  // -------------------------
  if (setupPhase === 'deck') {
    if (!isHost) {
      return (
        <div className="glass-panel" style={{ margin: '2rem 1rem', textAlign: 'center', padding: '3rem 1rem' }}>
          <h2>รอหัวหน้าห้องจัดกองไพ่...</h2>
          <p style={{ color: 'var(--text-secondary)' }}>Host กำลังเลือกบทบาทที่จะเล่นในตานี้</p>
        </div>
      );
    }

    const toggleDeckRole = (roleId) => {
      if (activeDeckRoles.includes(roleId)) {
        setActiveDeckRoles(activeDeckRoles.filter(r => r !== roleId));
      } else {
        setActiveDeckRoles([...activeDeckRoles, roleId]);
      }
    };

    const confirmDeck = async () => {
      if (activeDeckRoles.length === 0) {
        alert("กรุณาเลือกอย่างน้อย 1 บทบาท");
        return;
      }
      await update(ref(db, `rooms/${roomId}`), {
        setupPhase: 'roles',
        availableRoles: activeDeckRoles
      });
    };

    return (
      <div className="glass-panel animate-fade-in" style={{ margin: '2rem 1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="text-center mb-2">
          <h2 style={{ color: 'var(--accent-primary)' }}>จัดกองไพ่</h2>
          <p style={{ color: 'var(--text-secondary)' }}>เลือกบทบาทที่จะเล่นในตานี้</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', maxHeight: '60vh', overflowY: 'auto' }}>
          {allRoles.map(r => {
            const isSelected = activeDeckRoles.includes(r.id);
            return (
              <div 
                key={r.id} 
                onClick={() => toggleDeckRole(r.id)}
                style={{
                  background: isSelected ? 'rgba(138, 43, 226, 0.4)' : 'rgba(255,255,255,0.05)',
                  border: isSelected ? '2px solid var(--accent-primary)' : '2px solid transparent',
                  padding: '0.75rem',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  cursor: 'pointer'
                }}
              >
                <span>{isSelected ? '✅' : '⬜'}</span>
                <span>{r.emoji} {r.name}</span>
              </div>
            );
          })}
        </div>
        <Button onClick={confirmDeck} size="lg" className="mt-4">
          ยืนยันกองไพ่
        </Button>
      </div>
    );
  }

  // -------------------------
  // PHASE 2: ROLE SELECTION
  // -------------------------
  const myPlayerData = roomData.players[playerName] || {};
  const isModerator = myPlayerData.role === 'moderator';
  const playersList = Object.values(roomData.players || {});
  const activePlayers = playersList.filter(p => p.role !== 'moderator');
  const readyPlayers = activePlayers.filter(p => p.role !== 'unassigned');
  const isReady = myPlayerData.role !== 'unassigned';

  const confirmRole = async () => {
    if (!selectedRole) return;
    await update(ref(db, `rooms/${roomId}/players/${playerName}`), {
      role: selectedRole
    });
  };

  const startNight = async () => {
    const updates = {};
    updates[`rooms/${roomId}/status`] = 'night';
    updates[`rooms/${roomId}/round`] = 1;
    
    // Default starting turn
    updates[`rooms/${roomId}/currentTurn`] = 'doppelganger';
    
    // Calculate unassigned roles for Drunk
    const assignedRoles = activePlayers.map(p => p.role);
    const unpickedRoles = roomData.availableRoles.filter(r => !assignedRoles.includes(r));
    updates[`rooms/${roomId}/gameData/unpickedRoles`] = unpickedRoles;

    updates[`rooms/${roomId}/nightActions`] = {
      werewolfVotes: {},
      werewolfTarget: null,
      witchDone: false,
      witchHeal: false,
      witchKill: null,
      seerCheck: null,
      seerDone: false,
      cupidDone: false,
      bodyguardDone: false,
      bodyguardTarget: null,
      thugDone: false,
      minionDone: false,
      darkWitchCheck: null,
      darkWitchDone: false,
      priestDone: false,
      priestMark: null,
      psychicDone: false,
      psychicCheck: null,
      doppelgangerDone: false,
      masonDone: false,
      magicEyesDone: false,
      direWolfDone: false,
      cultLeaderDone: false,
      chupacabraKill: null,
      chupacabraDone: false,
      vampireKill: null,
      vampireDone: false,
      hagTarget: null,
      hagDone: false,
      mageTarget: null,
      mageDone: false,
      revealerTarget: null,
      revealerDone: false,
      piDone: false,
      huntressKill: null,
      huntressDone: false,
      troublemakerDone: false,
      drunkDone: false,
      insomniacDone: false
    };

    updates[`rooms/${roomId}/gameData/witchHealAvailable`] = true;
    updates[`rooms/${roomId}/gameData/witchPoisonAvailable`] = true;
    updates[`rooms/${roomId}/gameData/priestAvailable`] = true;
    updates[`rooms/${roomId}/gameData/huntressAmmo`] = true;
    updates[`rooms/${roomId}/gameData/troublemakerAvailable`] = true;
    
    updates[`rooms/${roomId}/gameData/wolvesDoubleKill`] = false;
    updates[`rooms/${roomId}/gameData/wolvesDisabled`] = false;
    updates[`rooms/${roomId}/gameData/twoExecutions`] = false;

    updates[`rooms/${roomId}/gameData/cultMembers`] = [];
    updates[`rooms/${roomId}/gameData/vampireBites`] = {}; // { targetName: deathMorningRoundNum }
    updates[`rooms/${roomId}/gameData/toughGuyPoisoned`] = null; // targetName
    updates[`rooms/${roomId}/gameData/priestBuff`] = null; // targetName

    await update(ref(db), updates);
  };

  return (
    <div className="glass-panel animate-fade-in" style={{ margin: '2rem 1rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div className="text-center">
        <h2 style={{ color: 'var(--accent-primary)', textTransform: 'uppercase' }}>เลือกบทบาทของคุณ</h2>
        <p style={{ color: 'var(--text-secondary)' }}>คุณจั่วได้การ์ดอะไรบนโต๊ะ?</p>
      </div>

      {isModerator ? (
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <h3 style={{ color: 'var(--text-secondary)' }}>คุณคือผู้คุมเกม (Moderator)</h3>
          <p style={{ marginTop: '0.5rem', opacity: 0.7 }}>กรุณารอให้ผู้เล่นทุกคนเลือกบทบาทให้ครบ</p>
        </div>
      ) : !isReady ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', maxHeight: '60vh', overflowY: 'auto' }}>
          {allRoles.filter(r => (roomData.availableRoles || []).includes(r.id)).map(r => (
            <div 
              key={r.id}
              onClick={() => setSelectedRole(r.id)}
              style={{
                background: selectedRole === r.id ? 'rgba(138, 43, 226, 0.4)' : 'rgba(255,255,255,0.05)',
                border: selectedRole === r.id ? '2px solid var(--accent-primary)' : '2px solid transparent',
                padding: '1rem',
                borderRadius: '12px',
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{r.emoji}</div>
              <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{r.name}</div>
            </div>
          ))}
          <Button onClick={confirmRole} size="lg" disabled={!selectedRole} style={{ gridColumn: '1 / -1', marginTop: '1rem' }}>
            ยืนยันบทบาท
          </Button>
        </div>
      ) : (
        <div className="text-center" style={{ padding: '2rem 0' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
          <h3>รอเพื่อนคนอื่นเลือกบทบาท...</h3>
          <p style={{ marginTop: '1rem', color: 'var(--text-secondary)' }}>เลือกแล้ว: {readyPlayers.length} / {activePlayers.length} คน</p>
        </div>
      )}

      {isHost && (
        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--glass-border)' }}>
          <Button onClick={startNight} variant="danger" size="lg" disabled={readyPlayers.length < activePlayers.length}>
            {readyPlayers.length < activePlayers.length ? 'รอทุกคนพร้อม...' : 'เข้าสู่ค่ำคืนแรก 🌙'}
          </Button>
        </div>
      )}
    </div>
  );
}
