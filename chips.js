// ═══════════════════════════════════════════════════════
// TRECE — chips.js
// Chip system: betting, rewards, HUD, recap
// ═══════════════════════════════════════════════════════
'use strict';

// ══ CHIP SYSTEM ══
const CHIP_START   = 1000;  // chip awal per pemain per sesi
const CHIP_MIN_BET = 50;
const CHIP_MAX_BET = 500;
// Multiplier kemenangan per posisi: [1st, 2nd, 3rd, 4th]
// 1st: dapat chip dari 4 pemain (termasuk diri sendiri) → net +3x
// 2nd: balik modal (tidak kehilangan/menang)
// 3rd: bayar 1x bet
// 4th: bayar 2x bet
const CHIP_RANK_DELTA = [3, 0, -1, -2]; // dalam satuan bet

// State chip sesi (keyed by player id)
let chipSession = {}; // {id: {name, chips, isBot}}
let currentBet  = 100;
let _betPending = false; // host sedang menunggu konfirmasi bet

// Inisialisasi chip sesi (dipanggil host saat room pertama kali dibuat)
function initChipSession(players){
  // Preserve existing chips untuk pemain yang sudah ada
  const next = {};
  players.forEach(p=>{
    if(chipSession[p.id]){
      next[p.id] = chipSession[p.id];
      next[p.id].name = p.name; // update nama
      if(next[p.id].debt === undefined) next[p.id].debt = 0;
    } else {
      next[p.id] = {name: p.name, chips: CHIP_START, debt: 0, isBot: p.isBot};
    }
  });
  chipSession = next;
}

// Terapkan hutang jika chip tidak cukup untuk bid — izinkan saldo negatif
function applyDebtIfNeeded(players, bet){
  players.forEach(p=>{
    if(p.isBot) return;
    const session = chipSession[p.id];
    if(!session) return;
    if(session.chips < bet){
      const shortfall = bet - Math.max(0, session.chips);
      session.debt = (session.debt || 0) + shortfall;
    }
  });
}

// Ambil total hutang player
function getPlayerDebt(pid){
  return chipSession[pid]?.debt ?? 0;
}

// Hitung delta chip dari hasil game
function resolveChips(finished, players, bet){
  // finished: array of pidx in finish order [1st, 2nd, 3rd, 4th]
  const deltas = {}; // pidx → delta
  finished.forEach((pidx, rank)=>{
    const delta = CHIP_RANK_DELTA[rank] * bet;
    deltas[pidx] = delta;
    const p = players[pidx];
    if(p && chipSession[p.id]){
      // Izinkan saldo negatif (hutang) — tidak ada floor di 0
      chipSession[p.id].chips = chipSession[p.id].chips + delta;
    }
  });
  return deltas;
}

// Render chip di lobby slot
function renderSlotChips(pid, el){
  if(!chipSession[pid]) return;
  const c = chipSession[pid].chips;
  const span = document.createElement('div');
  span.className = 'slot-chips';
  span.textContent = `💰 ${c.toLocaleString()}`;
  el.appendChild(span);
}

// Update chip bar di playerArea
function updateChipHud(){
  const bar = document.getElementById('chipBar');
  if(!G || !myId){ if(bar) bar.classList.remove('show'); return; }
  const me = G.players[G.mySlot];
  if(!me || !chipSession[me.id]){ if(bar) bar.classList.remove('show'); return; }

  bar.classList.add('show');
  const chips = chipSession[me.id].chips;
  const debt  = chipSession[me.id].debt || 0;
  const chipValEl = document.getElementById('chipBarVal');
  chipValEl.textContent = chips.toLocaleString();
  // Tandai merah jika saldo negatif (hutang)
  chipValEl.style.color = chips < 0 ? 'var(--red, #e74c3c)' : '';
  // Tampilkan badge hutang jika ada
  let debtBadge = document.getElementById('chipBarDebt');
  if(debt > 0){
    if(!debtBadge){
      debtBadge = document.createElement('span');
      debtBadge.id = 'chipBarDebt';
      debtBadge.className = 'cp-debt';
      document.querySelector('.chip-pill')?.appendChild(debtBadge);
    }
    debtBadge.textContent = '🔴 hutang ' + debt.toLocaleString();
  } else if(debtBadge){
    debtBadge.remove();
  }

  if(currentBet){
    document.getElementById('chipBarBet').textContent = currentBet + ' chip';
    const winDelta = CHIP_RANK_DELTA[0] * currentBet;
    document.getElementById('chipBarWin').textContent = '+' + winDelta;
  } else {
    document.getElementById('chipBarBet').textContent = '—';
    document.getElementById('chipBarWin').textContent = '—';
  }
}

// Tampilkan modal taruhan (host only, sebelum game dimulai)
function showBetModal(){
  // Sync chip session untuk semua real players
  const realPlayers = lobbyPlayers.filter(p=>!p.isBot);
  initChipSession(lobbyPlayers);

  // Render daftar pemain + chip mereka
  const list = document.getElementById('betPlayerList');
  list.innerHTML = realPlayers.map(p=>{
    const c = chipSession[p.id]?.chips ?? CHIP_START;
    const debt = chipSession[p.id]?.debt ?? 0;
    const low = c < currentBet;
    const debtHtml = debt > 0
      ? `<span class="bet-pdebt">🔴 Hutang: ${debt.toLocaleString()}</span>`
      : '';
    return `<div class="bet-player-row">
      <span class="bet-pname">${p.name}${p.id===myId?' (Kamu)':''}</span>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;">
        <span class="bet-pchips${low?' low':''}">💰 ${c.toLocaleString()}</span>
        ${debtHtml}
      </div>
    </div>`;
  }).join('');

  setBetDisplay(currentBet);
  document.getElementById('betModal').classList.add('open');
}

function adjustBet(delta){
  const newVal = Math.min(CHIP_MAX_BET, Math.max(CHIP_MIN_BET,
    Math.round((currentBet + delta) / 50) * 50));
  setBetDisplay(newVal);
}

function setBetPreset(val){
  setBetDisplay(val);
}

function setBetDisplay(val){
  currentBet = val;
  document.getElementById('betAmountDisplay').textContent = val;
  // update preset highlights
  document.querySelectorAll('.bet-preset').forEach(el=>{
    el.classList.toggle('active', parseInt(el.textContent) === val);
  });
  // Info pemain yang chipnya kurang (akan berhutang)
  const realPlayers = lobbyPlayers.filter(p=>!p.isBot);
  const brokePlayers = realPlayers.filter(p=> (chipSession[p.id]?.chips??CHIP_START) < val);
  document.getElementById('betSubLabel').textContent = brokePlayers.length > 0
    ? `⚠ ${brokePlayers.length} pemain chipnya kurang — akan berhutang otomatis`
    : 'Pilih jumlah taruhan per pemain';
}

function confirmBet(){
  document.getElementById('betModal').classList.remove('open');
  // Broadcast bet amount then start game
  send({type:'bet_set', bet: currentBet});
  _doBetAndStart();
}

function _doBetAndStart(){
  // Host: proceed to deal
  readyPlayers = new Set();
  myReady = false;
  gameHasStarted = true;

  // ── Terapkan hutang untuk player yang chipnya kurang dari bid ──
  applyDebtIfNeeded(lobbyPlayers, currentBet);

  let deck, hands;
  let attempts = 0;
  do {
    deck = shuffle(mkDeck());
    hands = [];
    for(let i=0;i<4;i++) hands.push(deck.slice(i*13,(i+1)*13));
    attempts++;
    const maxThrees = Math.max(...hands.map(h=>h.filter(c=>c.val===3).length));
    if(maxThrees<=2||attempts>=10) break;
  } while(true);

  // ── Cek apakah ini rematch dengan roster yang SAMA persis ──
  // Ambil real player IDs saat ini (sorted)
  const currentRealIds = lobbyPlayers
    .filter(p=>!p.isBot)
    .map(p=>p.id)
    .sort();

  // Roster dianggap sama jika:
  // 1. Ada data ronde sebelumnya (_prevRoundWinnerSlot >= 0)
  // 2. Jumlah real player identik
  // 3. Semua ID cocok
  const sameRoster = _prevRoundWinnerSlot >= 0
    && currentRealIds.length === _prevRoundPlayerIds.length
    && currentRealIds.every((id,i)=>id === _prevRoundPlayerIds[i]);

  // skipBid: true → langsung fase play, pemenang ronde lalu jadi pemain pertama
  const skipBid = sameRoster;
  // startSlot: slot index pemain pertama di ronde baru
  const startSlot = skipBid ? _prevRoundWinnerSlot : 0;

  const msg = {
    type: 'game_start',
    players: lobbyPlayers,
    handsData: hands.map((h,i)=>({idx:i, cards:h})),
    chipSession,
    currentBet,
    skipBid,
    startSlot
  };
  send(msg);

  beginGame({
    players:lobbyPlayers,
    hands,
    mySlot:lobbyPlayers.findIndex(p=>p.id===myId),
    skipBid,
    startSlot
  });
}

// ══ BOMB EFFECT ══
function triggerBombEffect(isPokerBomb){
  const wrap = document.getElementById('gameWrap');
  wrap.classList.remove('shake');
  void wrap.offsetWidth;
  wrap.classList.add('shake');
  setTimeout(()=>wrap.classList.remove('shake'), 600);

  const flash = document.getElementById('bombFlashEl');
  flash.classList.remove('active');
  void flash.offsetWidth;
  flash.classList.add('active');
  setTimeout(()=>flash.classList.remove('active'), 750);

  const lbl = document.getElementById('bombLabelEl');
  lbl.textContent = isPokerBomb ? '💣 BOMB!!' : '💣 BOMB!';
  lbl.classList.remove('active');
  void lbl.offsetWidth;
  lbl.classList.add('active');
  setTimeout(()=>lbl.classList.remove('active'), 1500);

  const colors = ['#ff4400','#ff8800','#ffcc00','#cc00ff','#ff0088','#00ffcc','#ffffff'];
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  const count = isPokerBomb ? 70 : 45;
  for(let i = 0; i < count; i++){
    const el = document.createElement('div');
    el.className = 'bomb-particle';
    const angle = (Math.random() * 360) * Math.PI / 180;
    const dist  = 120 + Math.random() * (isPokerBomb ? 340 : 260);
    const px    = Math.cos(angle) * dist;
    const py    = Math.sin(angle) * dist;
    const size  = 4 + Math.random() * (isPokerBomb ? 14 : 10);
    const dur   = 0.6 + Math.random() * 0.7;
    const rot   = (Math.random() * 720 - 360) + 'deg';
    const color = colors[Math.floor(Math.random() * colors.length)];
    const shape = Math.random() > 0.4 ? '50%' : (Math.random() > 0.5 ? '2px' : '0');
    el.style.cssText = `left:${cx}px;top:${cy}px;width:${size}px;height:${size}px;background:${color};border-radius:${shape};box-shadow:0 0 ${size*2}px ${color};--px:${px}px;--py:${py}px;--dur:${dur}s;--pr:${rot};`;
    document.body.appendChild(el);
    setTimeout(()=>el.remove(), dur * 1000 + 100);
  }
}

// Tampilkan chip float animation
function showChipFloat(delta, x, y){
  const el = document.createElement('div');
  el.className = 'chip-float';
  el.style.left = (x ?? window.innerWidth/2 - 30) + 'px';
  el.style.top  = (y ?? window.innerHeight * 0.55) + 'px';
  el.style.color = delta > 0 ? 'var(--neon)' : 'var(--red)';
  el.textContent = (delta>0?'+':'')+delta.toLocaleString()+' 💰';
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 2000);
}

// Tampilkan rekap chip di end modal
function buildChipRecap(finished, players, deltas, mySlot){
  if(!currentBet) return '';
  const rows = finished.map((pidx,rank)=>{
    const p = players[pidx];
    const delta = deltas[pidx] ?? 0;
    const total = chipSession[p.id]?.chips ?? CHIP_START;
    const debt  = chipSession[p.id]?.debt ?? 0;
    const isMe = pidx === mySlot;
    const sign = delta>0?'+':'';
    const cls  = delta>0?'pos':delta<0?'neg':'';
    const debtHtml = debt > 0
      ? `<span class="chip-recap-debt">🔴 hutang ${debt.toLocaleString()}</span>`
      : '';
    const totalCls = total < 0 ? ' style="color:var(--red,#e74c3c)"' : '';
    return `<div class="chip-recap-row${isMe?' me':''}">
      <span class="chip-recap-name">${p.name}${isMe?' ★':''}</span>
      <span class="chip-recap-delta ${cls}">${sign}${delta}</span>
      <span class="chip-recap-total"${totalCls}>= ${total.toLocaleString()}${debtHtml}</span>
    </div>`;
  }).join('');
  return `<div class="chip-recap">
    <div class="chip-recap-title">💰 Taruhan ${currentBet} chip — Rekap Sesi</div>
    ${rows}
  </div>`;
}


const EMOTE_COOLDOWN_MS = 4000;
let _emoteCooldown = false;
let _emotePickerOpen = false;
let _emoteCooldownTimer = null;

function toggleEmotePicker(){
  _emotePickerOpen = !_emotePickerOpen;
  document.getElementById('emotePicker').classList.toggle('open', _emotePickerOpen);
}

// Close picker when clicking outside
document.addEventListener('click', e => {
  if(_emotePickerOpen &&
     !e.target.closest('#emotePicker') &&
     !e.target.closest('#emoteBtn')){
    _emotePickerOpen = false;
    document.getElementById('emotePicker').classList.remove('open');
  }
});

function sendEmote(emoji, text){
  if(_emoteCooldown) return;
  _emotePickerOpen = false;
  document.getElementById('emotePicker').classList.remove('open');

  const payload = { type:'emote', id:myId, name:myName, emoji, text: text||null };
  // Show locally immediately
  showEmoteBubble(myName, emoji, text, true);
  // Broadcast to others
  if(chan) chan.publish('m', JSON.stringify(payload));

  // Cooldown
  _emoteCooldown = true;
  startEmoteCooldownRing(EMOTE_COOLDOWN_MS);
  _emoteCooldownTimer = setTimeout(()=>{ _emoteCooldown=false; }, EMOTE_COOLDOWN_MS);
}

function startEmoteCooldownRing(ms){
  const ring = document.getElementById('emoteCooldownRing');
  const btn = document.getElementById('emoteBtn');
  btn.style.opacity = '0.5';
  let start = null;
  function frame(ts){
    if(!start) start=ts;
    const pct = Math.min(1, (ts-start)/ms);
    ring.style.background = `conic-gradient(rgba(212,168,67,0.5) ${pct*360}deg, transparent ${pct*360}deg)`;
    if(pct < 1) requestAnimationFrame(frame);
    else { ring.style.background='none'; btn.style.opacity='1'; }
  }
  requestAnimationFrame(frame);
}

function showEmoteBubble(name, emoji, text, isMe){
  const el = document.createElement('div');
  el.className = 'emote-bubble';

  // Position: own emotes appear bottom-center, others appear at random top position
  if(isMe){
    el.style.left = '50%';
    el.style.transform = 'translateX(-50%)';
    el.style.bottom = '160px';
  } else {
    // Random horizontal spread in upper area
    const xPct = 10 + Math.random() * 70;
    el.style.left = xPct + '%';
    el.style.top = (80 + Math.random()*120) + 'px';
  }

  const nameEl = `<div class="eb-name">${isMe ? 'Kamu' : name}</div>`;
  const emojiEl = emoji ? `<div class="eb-emoji">${emoji}</div>` : '';
  const textEl  = text  ? `<div class="eb-text">${text}</div>` : '';
  el.innerHTML = nameEl + emojiEl + textEl;

  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 3400);
}

// Handle incoming emote messages (already routed through handleMsg)
// We patch handleMsg via the switch — add 'emote' case:
const _origHandleMsg = handleMsg;
// Override: we need to add emote handling inside handleMsg's switch
// Since handleMsg is defined above, we wrap it:
(function patchHandleMsg(){
  const orig = handleMsg;
  window.handleMsg = function(msg){
    let d;
    try{ d = JSON.parse(msg.data); }catch{ return; }
    if(d.type === 'emote'){
      // Only show if it's from someone else (we already showed ours locally)
      if(d.id !== myId){
        showEmoteBubble(d.name, d.emoji||null, d.text||null, false);
      }
      return;
    }
    orig(msg);
  };
  // Re-subscribe with new handler after channel is set up
  // (channel subscription happens in doCreate/doJoin — we store ref)
})();

// Show/hide emote button with game visibility
const _origBeginGame = beginGame;
window.beginGame = function(opts){
  _origBeginGame(opts);
  document.getElementById('emoteBtn').classList.add('game-open');
  document.getElementById('shopBtn').classList.add('game-open');
  renderPowerBar();
};
const _origReturnToLobby = returnToLobby;
window.returnToLobby = function(){
  _origReturnToLobby();
  document.getElementById('emoteBtn').classList.remove('game-open');
  document.getElementById('emotePicker').classList.remove('open');
  document.getElementById('shopBtn').classList.remove('game-open');
  document.getElementById('powerBar').classList.remove('show');
  const bar = document.getElementById('chipBar');
  if(bar) bar.classList.remove('show');
  renderSlots();
};
