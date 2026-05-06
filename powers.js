// ═══════════════════════════════════════════════════════
// TRECE — powers.js
// Power Shop: catalog, buy, activate, spy, swap, blackout, etc.
// ═══════════════════════════════════════════════════════
'use strict';

// ══════════════════════════════════════════
//  POWER SHOP SYSTEM
// ══════════════════════════════════════════

// Katalog semua kartu kekuatan
const POWER_CATALOG = [
  {
    id:'shield', name:'Shield', icon:'🛡️', cat:'def', rarity:'rare',
    price:1500, maxOwn:2,
    desc:'Saat kamu pasang Poker (angka 2) dan dilawan Bomb — Shield aktif otomatis. Kamu tidak langsung kalah, permainan berlanjut normal.',
    mechanic:'Sekali pakai · auto-trigger saat di-Bomb'
  },
  {
    id:'mirror', name:'Mirror', icon:'🪞', cat:'def', rarity:'epic',
    price:2500, maxOwn:1,
    desc:'Ketika kamu di-Bomb, efek Bomb berbalik ke pemain yang menyerang. Pemain itu yang langsung ke posisi terakhir.',
    mechanic:'Sekali pakai · auto-trigger saat di-Bomb'
  },
  {
    id:'ghost', name:'Ghost', icon:'👻', cat:'def', rarity:'common',
    price:1200, maxOwn:3,
    desc:'Aktifkan di giliranmu untuk skip satu putaran tanpa dihitung sebagai "skip". Meja tetap terbuka untukmu setelah putaran.',
    mechanic:'Sekali pakai · aktifkan manual saat giliranmu'
  },
  {
    id:'zap', name:'Zap', icon:'⚡', cat:'off', rarity:'rare',
    price:1800, maxOwn:2,
    desc:'Paksa salah satu pemain lain untuk skip giliran mereka berikutnya. Cocok dipakai saat lawan hampir habis kartu.',
    mechanic:'Sekali pakai · pilih target pemain'
  },
  {
    id:'spy', name:'Spy', icon:'🔍', cat:'off', rarity:'common',
    price:1100, maxOwn:3,
    desc:'Intip tangan kartu salah satu pemain lain selama 4 detik. Hanya kamu yang bisa melihat.',
    mechanic:'Sekali pakai · pilih target pemain'
  },
  {
    id:'swap', name:'Swap', icon:'🔀', cat:'off', rarity:'rare',
    price:1600, maxOwn:2,
    desc:'Tukar 1 kartu acak dari tanganmu dengan 1 kartu acak dari tangan pemain lain.',
    mechanic:'Sekali pakai · pilih target pemain'
  },
  {
    id:'timewarp', name:'Time Warp', icon:'⏱️', cat:'util', rarity:'common',
    price:1050, maxOwn:3,
    desc:'Tambah 15 detik ekstra ke timer giliranmu satu kali. Berguna saat perlu waktu menyusun strategi combo.',
    mechanic:'Sekali pakai · aktifkan saat giliranmu'
  },
  {
    id:'wilddraw', name:'Wild Draw', icon:'🃏', cat:'util', rarity:'common',
    price:1300, maxOwn:2,
    desc:'Ambil 2 kartu acak dari sisa dek. Risiko: bisa dapat kartu bagus atau jelek.',
    mechanic:'Sekali pakai · aktifkan kapan saja saat giliranmu'
  },
  {
    id:'joker', name:'Joker', icon:'✨', cat:'util', rarity:'legendary',
    price:4000, maxOwn:1,
    desc:'Kartu liar yang bisa menggantikan satu slot dalam combo (pair, triple, atau sequence) sebagai nilai apa saja.',
    mechanic:'Kartu tambahan di tangan · sekali pakai'
  },
  {
    id:'chaos', name:'Chaos', icon:'🌀', cat:'dis', rarity:'epic',
    price:2200, maxOwn:1,
    desc:'Kocok ulang kartu di tangan semua pemain secara acak. Posisi giliran tidak berubah, hanya kartu yang bertukar.',
    mechanic:'Sekali pakai · efek semua pemain'
  },
  {
    id:'blackout', name:'Blackout', icon:'🌑', cat:'dis', rarity:'epic',
    price:2800, maxOwn:1,
    desc:'Semua pemain lain tidak bisa melihat nilai kartu mereka (tampil "?") selama 1 putaran penuh. Kamu tetap bisa melihat tanganmu normal.',
    mechanic:'Sekali pakai · efek 1 putaran penuh'
  },
  {
    id:'rewind', name:'Rewind', icon:'⏪', cat:'dis', rarity:'rare',
    price:1400, maxOwn:2,
    desc:'Balikkan urutan giliran selama 2 putaran — yang tadinya searah jarum jam jadi berlawanan, lalu kembali normal.',
    mechanic:'Sekali pakai · aktifkan kapan saja saat giliranmu'
  }
];

const RARITY_LABEL = {common:'Biasa', rare:'Langka', epic:'Epik', legendary:'Legendaris'};

// State power untuk player ini (persisten selama sesi)
// Format: { [cardId]: qty }
let myPowers = {};
// Counter total kartu kekuatan yang dibeli dalam 1 game (maks 3)
let myPowersBought = 0;
const MAX_POWERS_PER_GAME = 3;
// State efek aktif di game
let activePowers = {
  blackout: false,           // apakah blackout sedang aktif
  blackoutCasterSlot: -1,    // slot pengguna blackout (dia sendiri immune)
  _blackoutTimer: null,      // referensi setTimeout untuk auto-end blackout
  zapTarget: -1,             // slot pemain yang kena zap (skip next turn)
  rewindActive: false,       // urutan giliran terbalik
  rewindRounds: 0,           // sisa putaran rewind
  ghostActive: false,        // ghost aktif untuk giliran ini
};
let _shopFilter = 'all';
let _pendingPower = null; // power yang sedang menunggu target

// ── Hitung chip saat ini milik player ──
function getMyChips(){
  if(!G||!myId) return chipSession[myId]?.chips ?? 1000;
  const me = G.players[G.mySlot];
  return chipSession[me?.id]?.chips ?? chipSession[myId]?.chips ?? 1000;
}

// ── Buka/tutup shop ──
function openShop(){
  renderShopBody();
  document.getElementById('shopChipDisp').textContent = getMyChips().toLocaleString();
  document.getElementById('shopModal').classList.add('open');
}
function closeShop(){
  document.getElementById('shopModal').classList.remove('open');
}

// ── Filter tab ──
function filterShop(cat){
  _shopFilter = cat;
  document.querySelectorAll('.stab').forEach(t=>{
    t.classList.toggle('active', t.textContent.toLowerCase().includes(
      cat==='all'?'semua':cat==='def'?'defensif':cat==='off'?'ofensif':cat==='util'?'utilitas':'gangguan'
    ));
  });
  renderShopBody();
}

// ── Render isi shop ──
function renderShopBody(){
  const chips = getMyChips();
  const list = _shopFilter==='all' ? POWER_CATALOG : POWER_CATALOG.filter(p=>p.cat===_shopFilter);
  const quotaFull = myPowersBought >= MAX_POWERS_PER_GAME;
  const sisaBeli = MAX_POWERS_PER_GAME - myPowersBought;
  document.getElementById('shopBody').innerHTML =
    `<div style="text-align:center;font-family:'JetBrains Mono',monospace;font-size:10px;margin-bottom:10px;padding:6px 10px;border-radius:8px;background:rgba(0,0,0,0.3);border:1px solid ${quotaFull?'rgba(231,76,60,0.4)':'rgba(212,168,67,0.2)'}; color:${quotaFull?'#e74c3c':'rgba(212,168,67,0.7)'};">
      🛒 Kuota Pembelian: <b>${myPowersBought}/${MAX_POWERS_PER_GAME}</b>${quotaFull?' — <span style="color:#e74c3c">HABIS</span>':` — sisa <b>${sisaBeli}</b>`}
    </div>` +
    list.map(p=>{
    const owned = myPowers[p.id]||0;
    const canBuy = chips >= p.price && owned < p.maxOwn && !quotaFull;
    const maxed = owned >= p.maxOwn;
    const noQuota = !maxed && quotaFull;
    return `<div class="pitem">
      <div class="pitem-icon">${p.icon}</div>
      <div class="pitem-body">
        <div class="pitem-name">
          ${p.name}
          <span class="pitem-rarity r-${p.rarity}">${RARITY_LABEL[p.rarity]}</span>
        </div>
        <div class="pitem-desc">${p.desc}</div>
        <div class="pitem-mechanic">${p.mechanic}</div>
        <div class="pitem-footer">
          <span class="pitem-price">💰 ${p.price.toLocaleString()} chip</span>
          <div style="display:flex;align-items:center;gap:6px;">
            ${owned>0?`<span class="pitem-owned">Punya: ${owned}/${p.maxOwn}</span>`:''}
            <button class="pbuy-btn ${maxed?'owned':noQuota?'owned':''}" onclick="buyPower('${p.id}')"
              ${(!canBuy&&!maxed)||maxed||noQuota?'disabled':''}>
              ${maxed?'PENUH':noQuota?'KUOTA':canBuy?'BELI':'KURANG'}
            </button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── Beli power ──
function buyPower(id){
  const p = POWER_CATALOG.find(x=>x.id===id);
  if(!p) return;
  const chips = getMyChips();
  const owned = myPowers[id]||0;
  if(chips < p.price || owned >= p.maxOwn) return;
  // Batas maksimal 3 kartu kekuatan per game
  if(myPowersBought >= MAX_POWERS_PER_GAME){
    showNotif(`⛔ Batas pembelian tercapai! Maks ${MAX_POWERS_PER_GAME} kartu kekuatan per game.`);
    return;
  }

  // Kurangi chip
  const pid = G ? G.players[G.mySlot]?.id : myId;
  if(chipSession[pid]) chipSession[pid].chips -= p.price;
  else if(chipSession[myId]) chipSession[myId].chips -= p.price;

  myPowers[id] = (myPowers[id]||0) + 1;
  myPowersBought++;
  const sisaBeli = MAX_POWERS_PER_GAME - myPowersBought;
  const sisaInfo = sisaBeli > 0 ? ` (sisa ${sisaBeli} pembelian)` : ' (kuota habis!)';
  SFX.ready();
  showNotif(`${p.icon} ${p.name} dibeli!${sisaInfo}`, false);
  document.getElementById('shopChipDisp').textContent = getMyChips().toLocaleString();
  updateChipHud();
  renderShopBody();
  renderPowerBar();
  updateShopBadge();
}

// ── Render power bar di in-game ──
function renderPowerBar(){
  const bar = document.getElementById('powerBar');
  if(!bar) return;
  const owned = POWER_CATALOG.filter(p=>(myPowers[p.id]||0)>0);
  if(!owned.length){ bar.classList.remove('show'); return; }
  bar.classList.add('show');
  bar.innerHTML = owned.map(p=>`
    <div class="power-chip" onclick="activatePower('${p.id}')" title="${p.desc}">
      <span class="pc-icon">${p.icon}</span>
      <span class="pc-name">${p.name.toUpperCase()}</span>
      <span class="pc-qty">${myPowers[p.id]}</span>
    </div>`).join('');
}

// ── Badge angka di shopBtn ──
function updateShopBadge(){
  const total = Object.values(myPowers).reduce((a,b)=>a+b,0);
  const badge = document.getElementById('shopBtnBadge');
  if(!badge) return;
  if(total>0){ badge.textContent=total; badge.classList.add('show'); }
  else badge.classList.remove('show');
}

// ── Aktifkan power card ──
function activatePower(id){
  if(!G||G.phase==='end') return;
  const p = POWER_CATALOG.find(x=>x.id===id);
  if(!p || !(myPowers[id]>0)) return;

  // Power yang butuh giliran sendiri
  const needsMyTurn = ['ghost','timewarp','wilddraw','rewind','chaos','blackout'];
  if(needsMyTurn.includes(id) && G.current !== G.mySlot){
    showNotif('⚠ Hanya bisa dipakai saat giliranmu!'); return;
  }

  // Power yang butuh target
  const needsTarget = ['zap','spy','swap'];
  if(needsTarget.includes(id)){
    openTargetPicker(id); return;
  }

  // Langsung aktif
  _usePower(id, -1);
}

// ── Target picker ──
let _targetCallback = null;
function openTargetPicker(powerId){
  if(!G) return;
  _pendingPower = powerId;
  const p = POWER_CATALOG.find(x=>x.id===powerId);
  document.getElementById('targetTitle').textContent = `${p.icon} GUNAKAN ${p.name.toUpperCase()}`;
  document.getElementById('targetSub').textContent = 'Pilih pemain target';
  const btns = document.getElementById('targetBtns');
  const others = [0,1,2,3].filter(i=>i!==G.mySlot && !G.finished.includes(i));
  btns.innerHTML = others.map(i=>`
    <button class="target-btn" onclick="confirmTarget(${i})">
      <span style="font-size:16px;">${G.players[i].isBot?'🤖':'👤'}</span>
      <span>${G.players[i].name}</span>
      <span style="font-size:10px;color:rgba(204,68,255,0.5);margin-left:auto;">${G.hands[i].length} kartu</span>
    </button>`).join('');
  document.getElementById('targetPicker').classList.add('open');
}
function closeTargetPicker(){
  _pendingPower = null;
  document.getElementById('targetPicker').classList.remove('open');
}
function confirmTarget(slot){
  closeTargetPicker();
  if(_pendingPower) _usePower(_pendingPower, slot);
}

// ── Eksekusi power ──
function _usePower(id, targetSlot){
  if(!(myPowers[id]>0)) return;
  myPowers[id]--;
  if(myPowers[id]<=0) delete myPowers[id];
  renderPowerBar();
  updateShopBadge();

  const ms = G.mySlot;
  const myName = G.players[ms].name;

  switch(id){

    case 'shield':
      // Shield dipasang otomatis — ditandai di state
      activePowers.shieldActive = true;
      showNotif('🛡️ Shield aktif! Kamu terlindungi dari Bomb sekali.',false);
      if(chan) chan.publish('m', JSON.stringify({type:'power_use',power:'shield',from:myId,fromSlot:ms}));
      break;

    case 'mirror':
      activePowers.mirrorActive = true;
      showNotif('🪞 Mirror siap! Bomb berikutnya akan berbalik.',false);
      if(chan) chan.publish('m', JSON.stringify({type:'power_use',power:'mirror',from:myId,fromSlot:ms}));
      break;

    case 'ghost':
      activePowers.ghostActive = true;
      showNotif('👻 Ghost aktif! Skip giliran ini tidak terhitung.',false);
      // Auto-skip untuk giliran ini
      if(G.current===ms) playerSkip();
      break;

    case 'timewarp':
      extendTimer(15);
      showNotif('⏱️ +15 detik waktu tambahan!',false);
      break;

    case 'wilddraw':{
      // Ambil 2 kartu acak dari "sisa dek" — simulasi: kartu acak dari nilai yang belum ada di tangan
      const allVals = [3,4,5,6,7,8,9,10,11,12,13,1,2];
      const allSuits = [0,1,2,3];
      const myHand = G.hands[ms];
      const myIds = new Set(myHand.map(c=>`${c.val}_${c.suit}`));
      const pool = [];
      allVals.forEach(v=>allSuits.forEach(s=>{
        const k=`${v}_${s}`;
        if(!myIds.has(k)) pool.push({val:v,suit:s,id:`wild_${v}_${s}_${Date.now()}`});
      }));
      for(let i=0;i<2&&pool.length;i++){
        const idx=Math.floor(Math.random()*pool.length);
        const card=pool.splice(idx,1)[0];
        G.hands[ms].push(card);
      }
      renderGame();
      showNotif('🃏 2 kartu baru ditambahkan ke tanganmu!',false);
      break;
    }

    case 'chaos':
      // Kocok ulang kartu semua pemain
      if(isHost){
        _applyChaosShuffle();
        if(chan) chan.publish('m', JSON.stringify({type:'power_chaos',from:myId,fromSlot:ms,hands:G.hands}));
      } else {
        if(chan) chan.publish('m', JSON.stringify({type:'power_req',power:'chaos',from:myId,fromSlot:ms}));
      }
      showNotif('🌀 CHAOS! Semua kartu dikocok ulang!',true);
      break;

    case 'blackout':{
      activePowers.blackout = true;
      activePowers.blackoutCasterSlot = ms; // pengguna blackout immune terhadap efeknya sendiri
      // Timer 60 detik — setelah itu blackout otomatis berakhir
      if(activePowers._blackoutTimer) clearTimeout(activePowers._blackoutTimer);
      activePowers._blackoutTimer = setTimeout(()=>{
        activePowers.blackout = false;
        activePowers.blackoutCasterSlot = -1;
        activePowers._blackoutTimer = null;
        showNotif('🌑 Blackout selesai — kartu kembali normal.');
        renderGame();
        // Broadcast ke semua bahwa blackout berakhir
        if(chan) chan.publish('m', JSON.stringify({type:'power_blackout_end'}));
      }, 60000);
      applyBlackoutEffect(true, ms);
      showNotif('🌑 BLACKOUT! Pemain lain tidak bisa melihat nilai kartunya selama 60 detik!',true);
      if(chan) chan.publish('m', JSON.stringify({type:'power_use',power:'blackout',from:myId,fromSlot:ms}));
      break;
    }

    case 'rewind':
      activePowers.rewindActive = true;
      activePowers.rewindRounds = 2;
      showNotif('⏪ REWIND! Urutan giliran terbalik selama 2 putaran!',true);
      if(chan) chan.publish('m', JSON.stringify({type:'power_use',power:'rewind',from:myId,fromSlot:ms}));
      break;

    case 'zap':
      activePowers.zapTarget = targetSlot;
      showNotif(`⚡ ZAP! ${G.players[targetSlot].name} akan di-skip giliran berikutnya!`,false);
      if(chan) chan.publish('m', JSON.stringify({type:'power_use',power:'zap',from:myId,fromSlot:ms,target:targetSlot}));
      break;

    case 'spy':{
      const tNameSpy = G.players[targetSlot].name;
      showNotif(`🔍 Mengintip tangan ${tNameSpy}...`,false);
      if(isHost){
        _showSpyOverlay(tNameSpy, G.hands[targetSlot]);
      } else {
        if(chan) chan.publish('m', JSON.stringify({
          type:'power_req', power:'spy',
          from:myId, fromSlot:ms, target:targetSlot
        }));
        _showSpyOverlayLoading(tNameSpy);
      }
      break;
    }

    case 'swap':{
      if(!isHost){
        if(chan) chan.publish('m', JSON.stringify({type:'power_req',power:'swap',from:myId,fromSlot:ms,target:targetSlot}));
        // Notif akan muncul saat host broadcast state kembali
      } else {
        _applySwap(ms, targetSlot);
      }
      break;
    }

    case 'joker':{
      // Tambah 1 kartu joker ke tangan
      const jokerCard = {val:99, suit:0, id:'joker_'+Date.now(), isJoker:true};
      G.hands[ms].push(jokerCard);
      renderGame();
      showNotif('✨ Kartu Joker ditambahkan ke tanganmu!',false);
      break;
    }
  }

  SFX.bomb && id==='chaos' ? SFX.bomb() : SFX.cardPlay();
}

// ── Chaos shuffle ──
function _applyChaosShuffle(){
  if(!G||!isHost) return;
  // Kumpulkan semua kartu lalu bagi ulang secara acak
  const allCards = [];
  const counts = G.hands.map(h=>h.length);
  G.hands.forEach(h=>allCards.push(...h));
  // Fisher-Yates shuffle
  for(let i=allCards.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [allCards[i],allCards[j]]=[allCards[j],allCards[i]];
  }
  let idx=0;
  G.hands.forEach((h,i)=>{ G.hands[i]=allCards.slice(idx,idx+counts[i]); idx+=counts[i]; });
  bcastState();
  renderGame();
}

// ── Swap kartu ──
function _applySwap(fromSlot, toSlot){
  if(!G||!isHost) return;
  const fHand = G.hands[fromSlot];
  const tHand = G.hands[toSlot];
  if(!fHand.length||!tHand.length) return;
  const fi = Math.floor(Math.random()*fHand.length);
  const ti = Math.floor(Math.random()*tHand.length);

  // Simpan info kartu untuk notif
  const cardFrom = fHand[fi]; // kartu milik fromSlot yang dikirim ke toSlot
  const cardTo   = tHand[ti]; // kartu milik toSlot yang dikirim ke fromSlot

  // Lakukan tukar
  fHand[fi] = cardTo;
  tHand[ti] = cardFrom;

  const fromName = G.players[fromSlot].name;
  const toName   = G.players[toSlot].name;
  const vFrom = vd(cardFrom.val) + SUITS[cardFrom.suit];
  const vTo   = vd(cardTo.val) + SUITS[cardTo.suit];

  bcastState();
  renderGame();

  // Broadcast notif swap ke semua client dengan info kartu
  if(chan) chan.publish('m', JSON.stringify({
    type:'power_swap_result',
    fromSlot, toSlot,
    fromName, toName,
    // Hanya beritahu masing-masing pemain kartu yang mereka terima
    cardReceivedByFrom: {val: cardTo.val, suit: cardTo.suit},   // fromSlot menerima ini
    cardReceivedByTo:   {val: cardFrom.val, suit: cardFrom.suit} // toSlot menerima ini
  }));

  // Notif lokal untuk host (yang bisa saja adalah fromSlot atau bukan)
  if(G.mySlot === fromSlot){
    showNotif(`🔀 SWAP berhasil! Kamu dapat ${vTo} dari ${toName}!`, false);
  } else if(G.mySlot === toSlot){
    showNotif(`🔀 ${fromName} menukar kartu denganmu! Kamu dapat ${vFrom}!`, false);
  } else {
    showNotif(`🔀 ${fromName} menukar kartu dengan ${toName}!`, false);
  }
}

// ── Spy overlay ──
function _showSpyOverlay(name, hand){
  // Hapus overlay spy lama jika ada
  const old = document.getElementById('spyOverlay');
  if(old) old.remove();

  const ov = document.createElement('div');
  ov.id = 'spyOverlay';
  ov.style.cssText=`position:fixed;inset:0;z-index:300;background:rgba(0,0,0,0.88);
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;
    pointer-events:none;animation:fadeIn 0.3s ease;`;
  ov.innerHTML=`
    <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:3px;color:#cc44ff;margin-bottom:4px;">
      🔍 TANGAN ${name.toUpperCase()}
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;max-width:360px;padding:0 12px;">
      ${hand.map(c=>{
        const col=(c.suit===0||c.suit===2)?'r':'b';
        const sym=SUITS[c.suit];
        const v=vd(c.val);
        const imgKey=`${c.val}_${c.suit}`;
        const imgSrc=CARD_IMAGES[imgKey]||'';
        const imgHtml=imgSrc?`<div class="card-img-wrap"><img src="${imgSrc}" alt="${v}${sym}"></div>`:'';
        return `<div class="card ${col} nh${imgSrc?' has-img':''}" style="width:46px;height:68px;pointer-events:none;flex-shrink:0;">
          ${imgHtml}
          <div class="ct"><span class="cv">${v}</span><span class="cs">${sym}</span></div>
          <span class="cc">${sym}</span>
          <div class="cb2"><span class="cv">${v}</span><span class="cs">${sym}</span></div>
        </div>`;
      }).join('')}
    </div>
    <div style="font-family:'JetBrains Mono',monospace;font-size:9px;color:rgba(204,68,255,0.4);margin-top:6px;">
      Menghilang dalam 5 detik...
    </div>`;
  document.body.appendChild(ov);
  setTimeout(()=>ov.remove(), 5000);
}

// ── Spy overlay loading (untuk non-host menunggu data dari host) ──
function _showSpyOverlayLoading(name){
  const old = document.getElementById('spyOverlay');
  if(old) old.remove();

  const ov = document.createElement('div');
  ov.id = 'spyOverlay';
  ov.style.cssText=`position:fixed;inset:0;z-index:300;background:rgba(0,0,0,0.88);
    display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;
    pointer-events:none;animation:fadeIn 0.3s ease;`;
  ov.innerHTML=`
    <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:3px;color:#cc44ff;margin-bottom:4px;">
      🔍 TANGAN ${name.toUpperCase()}
    </div>
    <div style="color:rgba(204,68,255,0.5);font-family:'JetBrains Mono',monospace;font-size:11px;">
      Memuat data kartu...
    </div>`;
  document.body.appendChild(ov);
  // Auto-remove setelah 6 detik jika tidak ada respons
  setTimeout(()=>ov.remove(), 6000);
}

// ── Blackout effect: sembunyikan nilai kartu lawan ──
function applyBlackoutEffect(active, casterSlot){
  activePowers.blackout = active;
  if(active && casterSlot !== undefined) activePowers.blackoutCasterSlot = casterSlot;
  if(!active){ activePowers.blackoutCasterSlot = -1; activePowers._blackoutTimer = null; }
  renderGame();
}

// ── Intercept advanceTurn untuk handle rewind + zap + blackout countdown ──
const _origAdvanceTurn = advanceTurn;
window.advanceTurn = function(){
  if(!G||G.phase==='end') return;

  // Rewind: balik arah giliran
  if(activePowers.rewindActive){
    let prev = (G.current - 1 + 4) % 4;
    let tries = 0;
    while(G.finished.includes(prev) && tries<4){ prev=(prev-1+4)%4; tries++; }
    if(!G.finished.includes(prev)){
      G.current = prev;
      // Cek apakah satu putaran selesai (kembali ke lastPlayedBy atau semua sudah jalan)
      proceedTurn();
      return;
    }
  }

  // Zap: skip giliran pemain yang kena zap
  if(activePowers.zapTarget >= 0){
    const next = _getNextPlayer(G.current);
    if(next === activePowers.zapTarget){
      activePowers.zapTarget = -1;
      showNotif(`⚡ ${G.players[next].name} di-ZAP! Skip giliran!`);
      G.skipped[next] = true;
      G.current = next;
      // langsung advance lagi
      _origAdvanceTurn();
      return;
    }
  }

  _origAdvanceTurn();
};

function _getNextPlayer(cur){
  let next=(cur+1)%4, tries=0;
  while(G.finished.includes(next)&&tries<4){next=(next+1)%4;tries++;}
  return next;
}

// ── Intercept applySkip untuk handle Ghost ──
const _origApplySkip = applySkip;
window.applySkip = function(pidx){
  if(pidx === G.mySlot && activePowers.ghostActive){
    activePowers.ghostActive = false;
    // Skip tidak dihitung — tidak set G.skipped[pidx], langsung advance
    showNotif('👻 Ghost! Skip tidak terhitung.');
    advanceTurn();
    if(isHost) bcastState();
    renderGame();
    return;
  }
  _origApplySkip(pidx);
};

// ── Intercept triggerPokerBombEnd untuk Shield & Mirror ──
const _origTriggerPokerBombEnd = triggerPokerBombEnd;
window.triggerPokerBombEnd = function(pokerIdx, bombIdx, bombCombo){
  // Shield: melindungi poker player dari Bomb
  if(pokerIdx === G.mySlot && activePowers.shieldActive){
    activePowers.shieldActive = false;
    showNotif('🛡️ SHIELD! Bomb diblokir — permainan berlanjut!', true);
    // Reset poker intense, clear combo, lanjut
    G.currentCombo = null;
    G.prevCombo = null;
    G.skipped = [false,false,false,false];
    G.lastPlayedBy = -1;
    feltStackedCards = [];
    deactivatePokerIntense();
    if(isHost){ bcastState(); advanceTurn(); }
    renderGame();
    return;
  }
  // Mirror: balik bomb ke penyerang
  if(pokerIdx === G.mySlot && activePowers.mirrorActive){
    activePowers.mirrorActive = false;
    showNotif('🪞 MIRROR! Bomb berbalik — ' + G.players[bombIdx].name + ' yang kalah!', true);
    // Swap: bomb player jadi kalah duluan
    _origTriggerPokerBombEnd(bombIdx, pokerIdx, bombCombo);
    return;
  }
  _origTriggerPokerBombEnd(pokerIdx, bombIdx, bombCombo);
};

// ── Handle pesan power dari network ──
const _origHandleMsgForPower = window.handleMsg;
window.handleMsg = function(msg){
  let d;
  try{ d=JSON.parse(msg.data); }catch{ return; }

  if(d.type==='power_use'){
    // Notifikasi ke semua client tentang power yang dipakai
    const pDef = POWER_CATALOG.find(x=>x.id===d.power);
    if(!pDef) { _origHandleMsgForPower(msg); return; }
    if(d.from !== myId){
      showNotif(`${pDef.icon} ${G?.players[d.fromSlot]?.name||'Pemain'} menggunakan ${pDef.name}!`);
      // Sync efek ke semua client
      if(d.power==='blackout'){
        // Simpan casterSlot agar pengguna blackout immune di sisi client lain
        activePowers.blackout = true;
        activePowers.blackoutCasterSlot = d.fromSlot;
        // Timer 60 detik sisi client (sync dengan host)
        if(activePowers._blackoutTimer) clearTimeout(activePowers._blackoutTimer);
        activePowers._blackoutTimer = setTimeout(()=>{
          activePowers.blackout = false;
          activePowers.blackoutCasterSlot = -1;
          activePowers._blackoutTimer = null;
          showNotif('🌑 Blackout selesai — kartu kembali normal.');
          renderGame();
        }, 60000);
        renderGame();
      }
      if(d.power==='rewind'){
        activePowers.rewindActive=true; activePowers.rewindRounds=2;
      }
      if(d.power==='zap' && d.target===G?.mySlot){
        showNotif('⚡ Kamu kena ZAP! Giliran berikutmu di-skip!');
        activePowers.zapTarget = d.target;
      }
    }
    return;
  }

  // Blackout berakhir — broadcast dari caster ke semua client
  if(d.type==='power_blackout_end'){
    if(activePowers._blackoutTimer){ clearTimeout(activePowers._blackoutTimer); activePowers._blackoutTimer=null; }
    activePowers.blackout = false;
    activePowers.blackoutCasterSlot = -1;
    showNotif('🌑 Blackout selesai — kartu kembali normal.');
    renderGame();
    return;
  }

  if(d.type==='power_chaos' && d.from!==myId){
    // Terima state tangan baru dari host
    if(d.hands && G){ G.hands=d.hands; renderGame(); }
    showNotif('🌀 CHAOS! Kartu semua pemain dikocok ulang!', true);
    return;
  }

  if(d.type==='power_req' && isHost){
    if(d.power==='chaos') _applyChaosShuffle();
    if(d.power==='swap') _applySwap(d.fromSlot, d.target);
    if(d.power==='spy'){
      // Host kirim data tangan target HANYA ke pemain yang request (via broadcast + filter di client)
      const targetHand = G ? G.hands[d.target] : [];
      const targetName = G ? G.players[d.target].name : '';
      if(chan) chan.publish('m', JSON.stringify({
        type:'power_spy_result',
        to: d.from,          // hanya penerima yang boleh lihat
        toSlot: d.fromSlot,
        targetName,
        hand: targetHand
      }));
      // Notif ke semua bahwa spy digunakan
      if(chan) chan.publish('m', JSON.stringify({
        type:'power_use', power:'spy',
        from:d.from, fromSlot:d.fromSlot
      }));
    }
    return;
  }

  // Terima hasil spy (hanya untuk pemain yang request)
  if(d.type==='power_spy_result' && d.to === myId){
    // Hapus overlay loading dan tampilkan kartu sebenarnya
    const old = document.getElementById('spyOverlay');
    if(old) old.remove();
    _showSpyOverlay(d.targetName, d.hand);
    return;
  }

  // Terima hasil swap (notif personal)
  if(d.type==='power_swap_result'){
    if(!G) { _origHandleMsgForPower(msg); return; }
    if(G.mySlot === d.fromSlot){
      const c = d.cardReceivedByFrom;
      showNotif(`🔀 SWAP berhasil! Kamu dapat ${vd(c.val)}${SUITS[c.suit]} dari ${d.toName}!`, false);
    } else if(G.mySlot === d.toSlot){
      const c = d.cardReceivedByTo;
      showNotif(`🔀 ${d.fromName} menukar kartu denganmu! Kamu dapat ${vd(c.val)}${SUITS[c.suit]}!`, false);
    } else {
      showNotif(`🔀 ${d.fromName} menukar kartu dengan ${d.toName}!`, false);
    }
    return;
  }

  _origHandleMsgForPower(msg);
};

// ── applyPlay intercept (round-based blackout countdown dihapus — diganti timer 60 detik) ──
const _origApplyPlay_power = applyPlay;
window.applyPlay = function(pidx, combo){
  _origApplyPlay_power(pidx, combo);
};

// ── Timer extend (Time Warp) ──
function extendTimer(extraSeconds){
  // Akses timer yang sedang berjalan dan tambah waktu
  if(typeof _timerEnd !== 'undefined') _timerEnd += extraSeconds * 1000;
}

// ── Reset power state saat game baru ──
const _origBeginGamePower = window.beginGame || function(){};
window.beginGame = function(opts){
  _origBeginGamePower(opts);
  // Bersihkan timer blackout sebelumnya jika ada
  if(activePowers && activePowers._blackoutTimer) clearTimeout(activePowers._blackoutTimer);
  activePowers = {shieldActive:false, mirrorActive:false, blackout:false,
    blackoutCasterSlot:-1, _blackoutTimer:null,
    zapTarget:-1, rewindActive:false, rewindRounds:0, ghostActive:false};
  myPowersBought = 0; // Reset kuota pembelian per game
  document.getElementById('shopBtn').classList.add('game-open');
  renderPowerBar();
  updateShopBadge();
};

