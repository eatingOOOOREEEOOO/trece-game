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
// 1st: +2x taruhan sendiri  |  2nd: +1x taruhan sendiri
// 3rd: -1x taruhan sendiri  |  4th: -2x taruhan sendiri
const CHIP_RANK_DELTA = [2, 1, -1, -2]; // dalam satuan bet MASING-MASING player

// State chip sesi (keyed by player id)
// Format: { [playerId]: { name, chips, isBot } }
// chips boleh negatif — tidak ada floor, tidak ada field hutang terpisah
let chipSession = {};
let currentBet  = 100;  // default / fallback jika player tidak set
let _betPending = false;

// Taruhan individual per player: { [playerId]: jumlah }
let playerBets = {};
// Tracking siapa sudah submit bet
let _betsReceived = {};  // { [playerId]: amount } — host only
let _betModalOpen = false;

// ── Inisialisasi chip sesi ──
function initChipSession(players){
  const next = {};
  players.forEach(p=>{
    if(chipSession[p.id]){
      next[p.id] = chipSession[p.id];
      next[p.id].name = p.name;
    } else {
      // Jika myId sudah punya entry di chipSession (dibeli power di lobby), pakai itu
      if(p.id === myId && chipSession[myId]){
        next[p.id] = chipSession[myId];
        next[p.id].name = p.name;
      } else {
        next[p.id] = {name: p.name, chips: CHIP_START, isBot: p.isBot};
      }
    }
  });
  chipSession = next;
}

// deductBidFromAll dihapus — sistem bandar tidak potong chip di awal ronde

// ── Hitung dan terapkan hasil chip akhir ronde (sistem bandar) ──
// Tidak ada potongan di awal — saldo langsung +/− sesuai posisi × taruhan sendiri.
// 🥇 +2x | 🥈 +1x | 🥉 −1x | 💀 −2x
function resolveChips(finished, players){
  const deltas = {};
  finished.forEach((pidx, rank)=>{
    const p = players[pidx];
    const bet = playerBets[p.id] || currentBet;
    // Delta = multiplier posisi × taruhan sendiri
    const delta = CHIP_RANK_DELTA[rank] * bet;
    deltas[pidx] = delta;
    if(p && chipSession[p.id]){
      chipSession[p.id].chips += delta;
    }
  });
  return deltas;
}

// ── Render chip di lobby slot ──
function renderSlotChips(pid, el){
  if(!chipSession[pid]) return;
  const c = chipSession[pid].chips;
  const span = document.createElement('div');
  span.className = 'slot-chips';
  span.textContent = `💰 ${c.toLocaleString()}`;
  el.appendChild(span);
}

// ── Update chip bar di playerArea ──
function updateChipHud(){
  const bar = document.getElementById('chipBar');
  if(!G || !myId){ if(bar) bar.classList.remove('show'); return; }
  const me = G.players[G.mySlot];
  if(!me || !chipSession[me.id]){ if(bar) bar.classList.remove('show'); return; }

  bar.classList.add('show');
  const chips = chipSession[me.id].chips;
  const chipValEl = document.getElementById('chipBarVal');
  chipValEl.textContent = chips.toLocaleString();
  // Merah jika saldo negatif
  chipValEl.style.color = chips < 0 ? 'var(--red, #e74c3c)' : '';

  if(currentBet){
    const myBet = playerBets[me.id] || currentBet;
    document.getElementById('chipBarBet').textContent = myBet + ' chip';
    const winDelta  = CHIP_RANK_DELTA[0] * myBet;  // +2x
    const lossDelta = CHIP_RANK_DELTA[3] * myBet;  // −2x
    document.getElementById('chipBarWin').textContent = '+' + winDelta + ' / ' + lossDelta;
  } else {
    document.getElementById('chipBarBet').textContent = '—';
    document.getElementById('chipBarWin').textContent = '—';
  }
}

// ── Tampilkan modal taruhan INDIVIDU — setiap player menentukan bet sendiri ──
function showBetModal(){
  const realPlayers = lobbyPlayers.filter(p=>!p.isBot);
  initChipSession(lobbyPlayers);

  // Reset per-player bet state
  _betsReceived = {};
  _betModalOpen = true;

  // Set default bet untuk diri sendiri
  if(!playerBets[myId]) playerBets[myId] = currentBet;

  document.getElementById('betSubLabel').textContent = isHost
    ? 'Tentukan taruhan kamu — semua pemain juga menentukan sendiri'
    : 'Tentukan jumlah taruhan kamu untuk ronde ini';

  // Tampilkan daftar semua real player dengan status "menunggu"
  _renderBetPlayerList(realPlayers);

  setBetDisplay(playerBets[myId] || currentBet);
  document.getElementById('betModal').classList.add('open');

  // Host: broadcast ke semua non-host agar mereka juga buka bet modal
  if(isHost){
    send({type:'show_bet_modal', chipSession});
  }
}

// ── Render daftar player di bet modal ──
function _renderBetPlayerList(realPlayers){
  const list = document.getElementById('betPlayerList');
  list.innerHTML = realPlayers.map(p=>{
    const c = chipSession[p.id]?.chips ?? CHIP_START;
    const isNeg = c < 0;
    const isMe = p.id === myId;
    const betAmt = playerBets[p.id];
    const hasSubmitted = !!betAmt && p.id !== myId;  // others submitted
    const statusHtml = isMe
      ? `<span class="bet-pstatus me">👤 Kamu</span>`
      : (hasSubmitted
          ? `<span class="bet-pstatus ready">✓ ${betAmt}</span>`
          : `<span class="bet-pstatus wait">…</span>`);
    return `<div class="bet-player-row${isMe?' is-me':''}">
      <span class="bet-pname">${p.name}</span>
      <span class="bet-pchips${isNeg?' low':''}">💰 ${c.toLocaleString()}</span>
      ${statusHtml}
    </div>`;
  }).join('');
}

// ── Update tampilan bet modal saat player lain submit ──
function _updateBetPlayerStatus(playerId, amount){
  playerBets[playerId] = amount;
  const realPlayers = lobbyPlayers.filter(p=>!p.isBot);
  _renderBetPlayerList(realPlayers);

  // Cek apakah semua real player sudah submit
  if(isHost){
    const allSubmitted = realPlayers.every(p=>!!playerBets[p.id]);
    if(allSubmitted){
      // Enable tombol start
      const confirmBtn = document.querySelector('#betModal .btn-gold');
      if(confirmBtn){
        confirmBtn.textContent = 'SEMUA SIAP — MULAI GAME →';
        confirmBtn.style.background = 'linear-gradient(135deg,#1a6b3a,#0d4a28)';
      }
    }
  }
}

function adjustBet(delta){
  const cur = playerBets[myId] || currentBet;
  const newVal = Math.min(CHIP_MAX_BET, Math.max(CHIP_MIN_BET,
    Math.round((cur + delta) / 50) * 50));
  setBetDisplay(newVal);
}

function setBetPreset(val){ setBetDisplay(val); }

function setBetDisplay(val){
  playerBets[myId] = val;
  currentBet = val; // local fallback
  document.getElementById('betAmountDisplay').textContent = val;
  document.querySelectorAll('.bet-preset').forEach(el=>{
    el.classList.toggle('active', parseInt(el.textContent) === val);
  });
  // Tampilkan warning jika saldo kurang
  const myChips = chipSession[myId]?.chips ?? CHIP_START;
  document.getElementById('betSubLabel').textContent = myChips < val
    ? `⚠ Saldo kamu ${myChips.toLocaleString()} — bisa minus jika kalah`
    : (isHost
        ? 'Tentukan taruhan kamu — semua pemain juga menentukan sendiri'
        : 'Tentukan jumlah taruhan kamu untuk ronde ini');
}

function confirmBet(){
  const myBet = playerBets[myId] || currentBet;
  playerBets[myId] = myBet;

  // Kirim taruhan kita ke semua (host akan kumpulkan)
  send({type:'bet_submit', id:myId, bet:myBet});

  // Tutup modal untuk player yang sudah submit
  document.getElementById('betModal').classList.remove('open');
  _betModalOpen = false;

  if(isHost){
    // Host: catat bet sendiri ke _betsReceived lalu cek apakah semua sudah masuk
    _betsReceived[myId] = myBet;
    _updateBetPlayerStatus(myId, myBet);
    _checkAllBetsReceived();
  } else {
    // Non-host: tandai bet sendiri sudah terkirim, tunggu 'bets_collected' dari host
    showNotif(`✓ Taruhanmu ${myBet} chip sudah dikunci! Menunggu pemain lain...`);
  }
}

// ── Host: cek apakah semua real player sudah submit bet ──
function _checkAllBetsReceived(){
  if(!isHost) return;
  const realPlayers = lobbyPlayers.filter(p=>!p.isBot);
  const allIn = realPlayers.every(p=>_betsReceived[p.id] !== undefined);
  if(allIn){
    // Copy ke playerBets
    Object.assign(playerBets, _betsReceived);
    // Broadcast ke semua player bahwa bet terkumpul + data playerBets lengkap
    send({type:'bets_collected', playerBets});
    _doBetAndStart();
  }
}

function _doBetAndStart(){
  readyPlayers = new Set();
  myReady = false;
  gameHasStarted = true;

  // Tidak ada potongan chip di awal — reward/penalti dihitung di akhir ronde

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

  // ── Cek rematch roster yang sama ──
  const currentRealIds = lobbyPlayers
    .filter(p=>!p.isBot).map(p=>p.id).sort();
  const sameRoster = _prevRoundWinnerSlot >= 0
    && currentRealIds.length === _prevRoundPlayerIds.length
    && currentRealIds.every((id,i)=>id === _prevRoundPlayerIds[i]);
  const skipBid  = sameRoster;
  const startSlot = skipBid ? _prevRoundWinnerSlot : 0;

  const msg = {
    type: 'game_start',
    players: lobbyPlayers,
    handsData: hands.map((h,i)=>({idx:i, cards:h})),
    chipSession,
    currentBet,
    playerBets,
    skipBid,
    startSlot
  };
  send(msg);

  beginGame({
    players: lobbyPlayers,
    hands,
    mySlot: lobbyPlayers.findIndex(p=>p.id===myId),
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

// ── Chip float animation ──
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

// ── Rekap chip di end modal ──
function buildChipRecap(finished, players, deltas, mySlot){
  if(!finished || !finished.length) return '';
  const rows = finished.map((pidx,rank)=>{
    const p = players[pidx];
    const delta = deltas[pidx] ?? 0;
    const total = chipSession[p.id]?.chips ?? CHIP_START;
    const isMe  = pidx === mySlot;
    const bet   = playerBets[p.id] || currentBet;
    const sign  = delta > 0 ? '+' : '';
    const cls   = delta > 0 ? 'pos' : delta < 0 ? 'neg' : '';
    const totalStyle = total < 0 ? ' style="color:var(--red,#e74c3c)"' : '';
    const betLabel = p.isBot ? '' : `<span class="chip-recap-bet">(bet ${bet})</span>`;
    return `<div class="chip-recap-row${isMe?' me':''}">
      <span class="chip-recap-name">${p.name}${isMe?' ★':''} ${betLabel}</span>
      <span class="chip-recap-delta ${cls}">${sign}${delta}</span>
      <span class="chip-recap-total"${totalStyle}>= ${total.toLocaleString()}</span>
    </div>`;
  }).join('');
  return `<div class="chip-recap">
    <div class="chip-recap-title">💰 Rekap Ronde</div>
    <div class="chip-recap-legend">🥇+2x &nbsp;🥈+1x &nbsp;🥉−1x &nbsp;💀−2x taruhan sendiri</div>
    ${rows}
  </div>`;
}


// ══ EMOTE SOUND SYSTEM ══
const EMOTE_SOUNDS = {
  'Saya akan lawan':   'sounds/Saya_akan_lawan.mp3',
  'UH kaget':          'sounds/UH_kaget.mp3',
  'What the dog doin': 'sounds/what_the_dog_doin.mp3',
  'Faaah':             'sounds/faaah.mp3',
  'LOL':               'sounds/LOL.mp3',
  'Pepek pepek':       'sounds/Pepek_pepek.mp3',
};
const _emoteSoundCache = {};
function sendEmoteSound(key){
  const src = EMOTE_SOUNDS[key];
  if(!src) return;
  try{
    if(!_emoteSoundCache[key]) _emoteSoundCache[key] = new Audio(src);
    const a = _emoteSoundCache[key];
    a.currentTime = 0;
    a.play().catch(()=>{});
  } catch(e){}
}

// ══ EMOTE SYSTEM ══
const EMOTE_COOLDOWN_MS = 4000;
let _emoteCooldown = false;
let _emotePickerOpen = false;
let _emoteCooldownTimer = null;

function toggleEmotePicker(){
  _emotePickerOpen = !_emotePickerOpen;
  document.getElementById('emotePicker').classList.toggle('open', _emotePickerOpen);
}

document.addEventListener('click', e => {
  if(_emotePickerOpen &&
     !e.target.closest('#emotePicker') &&
     !e.target.closest('#emoteBtn')){
    _emotePickerOpen = false;
    document.getElementById('emotePicker').classList.remove('open');
  }
});

function sendEmote(emoji, text, sound){
  if(_emoteCooldown) return;
  _emotePickerOpen = false;
  document.getElementById('emotePicker').classList.remove('open');

  // Play audio lokal langsung
  if(sound) sendEmoteSound(sound);

  const payload = { type:'emote', id:myId, name:myName, emoji, text: text||null, sound: sound||null };
  showEmoteBubble(myName, emoji, text, true);
  if(chan) chan.publish('m', JSON.stringify(payload));

  _emoteCooldown = true;
  startEmoteCooldownRing(EMOTE_COOLDOWN_MS);
  _emoteCooldownTimer = setTimeout(()=>{ _emoteCooldown=false; }, EMOTE_COOLDOWN_MS);
}

function startEmoteCooldownRing(ms){
  const ring = document.getElementById('emoteCooldownRing');
  const btn  = document.getElementById('emoteBtn');
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
  if(isMe){
    el.style.left = '50%';
    el.style.transform = 'translateX(-50%)';
    el.style.bottom = '160px';
  } else {
    const xPct = 10 + Math.random() * 70;
    el.style.left = xPct + '%';
    el.style.top  = (80 + Math.random()*120) + 'px';
  }
  const nameEl  = `<div class="eb-name">${isMe ? 'Kamu' : name}</div>`;
  const emojiEl = emoji ? `<div class="eb-emoji">${emoji}</div>` : '';
  const textEl  = text  ? `<div class="eb-text">${text}</div>`  : '';
  el.innerHTML  = nameEl + emojiEl + textEl;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), 3400);
}

// Patch handleMsg untuk emote
(function patchHandleMsg(){
  const orig = handleMsg;
  window.handleMsg = function(msg){
    let d;
    try{ d = JSON.parse(msg.data); }catch{ return; }
    if(d.type === 'emote'){
      if(d.id !== myId){
        showEmoteBubble(d.name, d.emoji||null, d.text||null, false);
        if(d.sound) sendEmoteSound(d.sound);
      }
      return;
    }
    orig(msg);
  };
})();

// Show/hide emote button saat game
// Catatan: shopBtn dan renderPowerBar dihandle oleh powers.js (diload setelah chips.js)
const _origBeginGame = beginGame;
window.beginGame = function(opts){
  _origBeginGame(opts);
  document.getElementById('emoteBtn').classList.add('game-open');
  // shopBtn dan renderPowerBar dihandle powers.js — jangan dipanggil di sini
};
const _origReturnToLobby = returnToLobby;
window.returnToLobby = function(){
  _origReturnToLobby();
  document.getElementById('emoteBtn').classList.remove('game-open');
  document.getElementById('emotePicker').classList.remove('open');
  // shopBtn dihandle powers.js
  const bar = document.getElementById('chipBar');
  if(bar) bar.classList.remove('show');
  renderSlots();
};
