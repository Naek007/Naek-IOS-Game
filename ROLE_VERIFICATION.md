# ตรวจสอบ Logic ของ Role (Werewolf) — เทียบโค้ด vs Google Sheet "Roles"

ที่มา: เทียบ `moderator-app/src/pages/*.jsx` กับแท็บ **Roles** ในชีต Werewolves Moderator
(คอลัมน์ Role_ID, Team, Night_Skill, Wolf_See, Seer_See, DarkWitch_See, Minion_See, Psychic_See)

---

## 🔴 CRITICAL — ทำให้เกมพังตั้งแต่คืนที่ 2 (ต้องแก้ก่อน)

### 1. `nightActions` ไม่ถูกรีเซ็ตเมื่อขึ้นคืนใหม่
- **อาการ:** คืนที่ 2 เป็นต้นไป **ไม่มีใครตื่นเลย** เกมเด้งข้ามไปตอนเช้าทันที และคำนวณคนตายซ้ำจากเป้าหมายของคืนแรก
- **เหตุผล:** ตอน Day → Night (`Day.jsx` บรรทัด ~229-233) ตั้งแค่ `status='night'`, `round+1`, `currentTurn='doppelganger'` แต่ flag ทั้งหมด (`seerDone`, `witchDone`, `werewolfTarget`, `werewolfVotes`, ...) ยังค้างเป็นค่าเดิม → Host engine เห็นว่า "ทำครบแล้ว" เลยจบคืนทันที
- **จุดเดียวกัน:** `HunterRevenge.jsx` (~195) ตอนนายพรานตายแล้วไปคืนใหม่ ก็ไม่รีเซ็ตเหมือนกัน
- **วิธีแก้:** เวลาเข้าคืนใหม่ ให้เซ็ต `nightActions` กลับเป็นออบเจ็กต์เปล่าชุดเดียวกับใน `Setup.jsx > startNight` (ดึงออกมาเป็นฟังก์ชัน `freshNightActions()` แล้วเรียกใช้ทั้ง 3 ที่)

### 2. `wolvesDisabled` (Infected) ไม่ถูกรีเซ็ต
- **กฎ:** Infected ตายเพราะหมาป่า → คืน **ถัดไป 1 คืน** หมาป่าฆ่าไม่ได้
- **บั๊ก:** ตั้ง `true` ที่ `Morning.jsx:68` แต่ไม่เคยตั้งกลับเป็น `false` → หมาป่าฆ่าไม่ได้ **ตลอดทั้งเกม**
- **แก้:** หลังจบคืนที่หมาป่าโดนปิด ให้รีเซ็ต `wolvesDisabled=false` (ใส่ในชุดรีเซ็ตคืนใหม่)

### 3. `wolvesDoubleKill` (Wolf Cub) ไม่ถูกรีเซ็ต
- **กฎ:** ลูกหมาป่าโดนโหวตออก → คืน **ถัดไป** หมาป่าฆ่าได้ 2 คน (คืนเดียว)
- **บั๊ก:** ตั้ง `true` ที่ `Day.jsx:169` ไม่เคยรีเซ็ต → หมาป่าฆ่าได้ 2 คน **ทุกคืนไปจนจบ**
- **แก้:** ใช้แล้วรีเซ็ตกลับเป็น `false` ในคืนถัดไป

---

## 🟠 LOGIC ผิดจากกฎในชีต

### 4. Seer ส่อง `dark_witch` และ `minion` ได้ผลผิด
- **ชีต:** `dark_witch` → Seer_See = **Bad**, `minion` → Seer_See = **Bad**
- **โค้ด (`Night.jsx` checkSeer):** evil list = `['werewolf','lone_wolf','wolf_cub','dire_wolf']` → ส่อง dark_witch/minion ขึ้น "😇 ฝ่ายดี" (ผิด)
- **แก้:** เพิ่ม `dark_witch` และ `minion` เข้า evil list (wolfman ยังต้องเป็น Good, half_werewolf ยังต้องเป็น Bad — สองตัวนี้โค้ดถูกแล้ว)

### 5. Thug (อันธพาล) เลือกจำนวนเป้าหมายผิด
- **ชีต:** เลือกเป้าหมาย **2 คนเสมอ** ชนะเมื่อทั้ง 2 คนถูกกำจัด
- **โค้ด (`Night.jsx` thug):** `targetsNeeded = totalWolves || 1` → ให้เลือกตาม "จำนวนหมาป่า" ไม่ใช่ 2
- **แก้:** เปลี่ยนเป็น `targetsNeeded = 2`

### 6. Revealer (ผู้เผยตัวตน) เปิด wolfman แล้วตัวเองตาย
- **ชีต:** ยิงโดนหมาป่า = หมาป่าตาย; ยิงผิด(ไม่ใช่หมาป่า) = ตัวเองตาย. `wolfman` เป็น Team = **Wolf**
- **โค้ด (`Morning.jsx`):** `isWolf = [...].includes(rRole) && rRole !== 'wolfman'` → จงใจตัด wolfman ออก ทำให้เปิด wolfman = revealer ตายเอง (ผิด). `dark_witch` (Team Wolf) ก็ไม่ถูกนับเป็นหมาป่าเช่นกัน
- **แก้:** ตัดสินใจให้ชัดว่า wolfman/dark_witch นับเป็น "หมาป่า" สำหรับ Revealer หรือไม่ แล้วทำให้ตรงกับกฎ

### 7. Vampire — หมาป่าฆ่าแวมไพร์ไม่ได้ (ยังไม่ได้ทำ)
- **ชีต:** "หมาป่าจะฆ่าแวมไพร์ไม่ได้ในตอนกลางคืน"
- **โค้ด:** `Morning.jsx` ไม่มีการป้องกัน ถ้าหมาป่าโหวตโดนแวมไพร์ แวมไพร์ตายปกติ
- **แก้:** ตอนคำนวณ wolf kill ให้ข้ามถ้าเป้าหมาย role = `vampire`

---

## 🟡 เสถียรภาพโค้ด

### 8. Thug เรียก `useState` ภายใน `if` (ผิด Rules of Hooks)
- ใน `Night.jsx` บล็อก thug มี `const [thugTargets, setThugTargets] = useState([])` อยู่ **หลัง** early return หลายอัน → React อาจ warning/crash เมื่อสลับ role
- **แก้:** ย้าย `useState` ทั้งหมดขึ้นไปไว้บนสุดของคอมโพเนนต์ (ระดับเดียวกับ target1/target2)

---

## 🟡 Role ที่ "ต้องคุมด้วยมือ" (ชีตระบุเอง / ไม่มี logic) — Mod ต้องรู้

- `insomniac` (คนอดนอน) — ชีตเขียน *(เขียนโค้ดไม่ได้)* ใช้ Mod พยักหน้า/ส่ายหน้า — โค้ดเป็นหน้าจอแนะนำเฉยๆ ✅ ตรงเจตนา
- `paranormal_detective` (นักสืบลี้ลับ) — ชีตเขียน *(เขียนโค้ดไม่ได้)* ให้ถาม Mod ตรงๆ ✅
- `pacifist` (ผู้รักสันติ) / `simpleton` (ไอ้ทึ่ม) — **ไม่มี logic ใดๆ** เป็นแค่การ์ดเลือกได้ Mod ต้องบังคับกติกาการโหวตเอง
- `priest` (นักบวช) — กฎ: ถ้านักบวชตาย พรยังอยู่จนโดนโหวตออกค่อยปกป้องรอบสุดท้าย → โค้ดทำแค่ "พรมต่อคืน" ยังไม่ได้ทำส่วนพรคงอยู่หลังตาย

---

## 🟢 Minor / Edge cases

- **Win condition** (`Day.jsx` / `HunterRevenge.jsx`): นับหมาป่าจาก `['werewolf','lone_wolf','wolf_cub','dire_wolf','wolfman']` → **ไม่นับ** `minion`/`dark_witch` เป็นฝ่ายหมาป่าในการคิดแพ้ชนะ และนับ Neutral (`vampire`,`chupacabra`,`beggar`,`cult_leader`) รวมเป็น "ฝ่ายดี" → อาจคิดเงื่อนไขชนะคลาดเคลื่อนในบางองค์ประกอบ
- **Witch heal:** ถ้าหมาป่าฆ่า 2 คน (double kill) การชุบของแม่มดช่วย **ทั้งคู่** (โค้ด `actions.witchHeal` ครอบทั้ง loop) — ปกติควรช่วยได้คนเดียว
- **Drunk:** กฎว่า Seer เห็น role จริงของขี้เมา — ยังไม่ได้ทำ (Seer จะเห็นเป็น 'drunk')

---

## สรุปลำดับการแก้ที่แนะนำ
1. แก้ข้อ 1–3 ก่อน (reset nightActions + flags ทุกคืน) — ไม่งั้นเทสได้แค่คืนเดียว
2. แก้ข้อ 4–6 (logic Seer / Thug / Revealer ให้ตรงชีต)
3. แก้ข้อ 8 (ย้าย hook) กันหน้า crash
4. ข้อ 7 + Minor ค่อยตามเก็บ
