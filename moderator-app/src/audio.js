// ตัวช่วยเล่นเสียงพากย์ — เล่นทีละคลิป ถ้าไฟล์ไม่มี/เล่นไม่ได้ก็เงียบ (ไม่พัง)
let current = null;

export function playClip(name) {
  if (!name) return;
  try {
    if (current) {
      try { current.pause(); current.currentTime = 0; } catch { /* ignore */ }
    }
    const audio = new Audio(`/audio/${name}.mp3`);
    current = audio;
    // play() อาจถูก block ก่อน user interact หรือไฟล์ 404 — จับ error ทิ้งไป
    const p = audio.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch {
    /* ignore */
  }
}

export function isNarrator(roomData, playerName) {
  if (!roomData) return false;
  return roomData.host === playerName
    || roomData.players?.[playerName]?.role === 'moderator';
}
