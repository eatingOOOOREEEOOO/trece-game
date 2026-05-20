// ═══════════════════════════════════════════════════════
// TRECE — ui.js
// DOM rendering, card HTML, background canvas, drag & drop
// ═══════════════════════════════════════════════════════
'use strict';

// ══ SIDEBAR: ACTIVITY LOG & CHAT FEED ══
const ACT_MAX = 40;
const CHAT_MAX = 30;

function pushActivityLog(type, who, detail){
  const log = document.getElementById('activityLog');
  if(!log) return;

  const item = document.createElement('div');
  item.className = `act-item act-${type} fresh`;

  let text = '';
  if(type === 'play')   text = `<span class="act-who">${who}</span> main ${detail}`;
  else if(type === 'skip')  text = `<span class="act-who">${who}</span> skip`;
  else if(type === 'bomb')  text = `<span class="act-who">💣 ${who}</span> ${detail}`;
  else if(type === 'finish')text = `<span class="act-who">🎉 ${who}</span> selesai #${detail}`;
  else if(type === 'round') text = `<span class="act-who">↩ ${who}</span> berhak main lagi`;
  else text = `<span class="act-who">${who}</span> ${detail}`;

  item.innerHTML = text;
  // Insert at top (column-reverse makes it appear at bottom visually)
  log.prepend(item);
  // Remove fresh class after animation
  setTimeout(()=>item.classList.remove('fresh'), 1800);
  // Trim old entries
  while(log.children.length > ACT_MAX) log.removeChild(log.lastChild);
}

function pushChatFeed(name, emoji, text, isMe){
  const feed = document.getElementById('chatFeed');
  if(!feed) return;

  const item = document.createElement('div');
  item.className = 'chat-feed-item';

  const initial = (name||'?')[0].toUpperCase();
  const content = emoji ? emoji : (text||'');
  const bubbleCls = isMe ? 'chat-feed-bubble is-me' : 'chat-feed-bubble';

  item.innerHTML = `
    <div class="chat-feed-avatar">${initial}</div>
    <div class="chat-feed-body">
      <div class="chat-feed-name">${isMe ? 'Kamu' : name}</div>
      <div class="${bubbleCls}">${content}</div>
    </div>`;

  feed.prepend(item);
  while(feed.children.length > CHAT_MAX) feed.removeChild(feed.lastChild);
}

// ── Hook setGStat → activity log ──
// Dipanggil setelah ui.js dimuat (game.js sudah define setGStat)
window.addEventListener('load', ()=>{
  // Patch setGStat untuk intercept event ke sidebar
  const _origSetGStat = window.setGStat;
  window.setGStat = function(m){
    if(_origSetGStat) _origSetGStat(m);
    if(!m) return;
    // Parse pesan gstat jadi log entry
    if(m.includes('mainkan')){
      const parts = m.split(' mainkan ');
      if(parts.length === 2) pushActivityLog('play', parts[0], parts[1]);
    } else if(m.includes(' skip') && !m.includes('berhak')){
      const who = m.replace(' skip','');
      pushActivityLog('skip', who, '');
    } else if(m.includes('💣')){
      pushActivityLog('bomb', m.replace('💣 ','').split(':')[0], 'BOMB!');
    } else if(m.includes('🎉') && m.includes('selesai')){
      const nm = m.replace('🎉 ','').split(' selesai')[0];
      const rank = m.match(/#(\d)/)?.[1]||'?';
      pushActivityLog('finish', nm, rank);
    } else if(m.includes('berhak main lagi')){
      const nm = m.replace(' berhak main lagi!','');
      pushActivityLog('round', nm, '');
    }
  };

  // Patch showEmoteBubble → chat feed
  const _origShowEmote = window.showEmoteBubble;
  window.showEmoteBubble = function(name, emoji, text, isMe){
    if(_origShowEmote) _origShowEmote(name, emoji, text, isMe);
    pushChatFeed(name, emoji, text, isMe);
  };
});

// ══ RENDER ══
const sc=s=>(s===0||s===2)?'r':'b';
const vd=v=>String(v);

function mkCardHTML(c,idx,selectable,selected,dimmed=false){
  // Joker card special display
  if(c.isJoker){
    const selCls=selected?'sel':'';
    const nhCls=(!selectable||dimmed)?'nh':'';
    const isTouch='ontouchstart' in window;
    const click=(selectable&&!dimmed)?`onclick="toggleCard(${idx})"` :'';
    const zStyle=selected?`style="z-index:${50+idx}"`:`style="z-index:${idx+1}"`;
    const dragAttrs=isTouch?'':`draggable="true" ondragstart="handleCardDragStart(event,${idx})" ondragover="handleCardDragOver(event,${idx})" ondragend="handleCardDragEnd(event)" ondrop="handleCardDrop(event,${idx})"`;
    return `<div class="card b ${selCls} ${nhCls}" ${click} ${zStyle} ${dragAttrs} data-idx="${idx}" title="Joker">
      <div class="ct"><span class="cv" style="color:#cc44ff">★</span><span class="cs" style="color:#cc44ff">J</span></div>
      <span class="cc" style="color:#cc44ff;font-size:22px;">✨</span>
      <div class="cb2"><span class="cv" style="color:#cc44ff">★</span><span class="cs" style="color:#cc44ff">J</span></div>
    </div>`;
  }
  const col=sc(c.suit),sym=SUITS[c.suit],v=vd(c.val);
  const selCls=selected?'sel':'';
  const nhCls=(!selectable||dimmed)?'nh':'';
  const dimStyle=dimmed?'opacity:0.55;filter:brightness(0.3) saturate(0.2);':'';
  const isTouch='ontouchstart' in window;
  // Fix: always attach onclick on both touch & desktop — touch devices need it for card selection
  const click=(selectable&&!dimmed)?`onclick="toggleCard(${idx})"` :'';
  const zStyle=selected?`style="z-index:${50+idx};${dimStyle}"`:`style="z-index:${idx+1};${dimStyle}"`;
  const imgKey=`${c.val}_${c.suit}`;
  const imgSrc=CARD_IMAGES[imgKey]||'';
  // Blackout: sembunyikan nilai kartu LAWAN — pengguna blackout (blackoutCasterSlot) tetap bisa melihat kartunya sendiri
  const _blackoutOn = (typeof activePowers!=='undefined') && activePowers && activePowers.blackout;
  const _isCaster = _blackoutOn && G && activePowers.blackoutCasterSlot === G.mySlot;
  const isBlacked = _blackoutOn && !_isCaster;
  const imgHtml = (imgSrc && !isBlacked)
    ? `<div class="card-img-wrap"><img src="${imgSrc}" alt="${v}${sym}"></div>` : '';
  const hasCls = (imgSrc && !isBlacked) ? ' has-img' : '';
  const displayV = isBlacked ? '?' : v;
  // Drag-to-reorder hanya di desktop; touch device pakai tap-to-select
  const dragAttrs=isTouch?'':`draggable="true"
    ondragstart="handleCardDragStart(event,${idx})"
    ondragover="handleCardDragOver(event,${idx})"
    ondragend="handleCardDragEnd(event)"
    ondrop="handleCardDrop(event,${idx})"`;
  return `<div class="card ${col} ${selCls} ${nhCls}${hasCls}" ${click} ${zStyle}
    ${dragAttrs}
    data-idx="${idx}"
    title="${isBlacked?sym:v+sym}">
    ${imgHtml}
    <div class="ct"><span class="cv">${displayV}</span><span class="cs">${sym}</span></div>
    <span class="cc">${sym}</span>
    <div class="cb2"><span class="cv">${displayV}</span><span class="cs">${sym}</span></div>
  </div>`;
}

function mkGhostHTML(c){
  const col=sc(c.suit),sym=SUITS[c.suit],v=vd(c.val);
  const gImgKey=`${c.val}_${c.suit}`;
  const gImgSrc=CARD_IMAGES[gImgKey]||'';
  const gImgHtml=gImgSrc?`<div class="card-img-wrap"><img src="${gImgSrc}" alt="${v}${sym}"></div>`:'';
  const gHasCls=gImgSrc?' has-img':'';
  return `<div class="ghost-card ${col}${gHasCls}">
    ${gImgHtml}
    <div class="ct"><span class="cv">${v}</span><span class="cs">${sym}</span></div>
    <span class="cc">${sym}</span>
    <div class="cb2"><span class="cv">${v}</span><span class="cs">${sym}</span></div>
  </div>`;
}

let lastComboId='';

function renderFeltCards(cards){
  const fc=document.getElementById('feltCards');
  const badge=document.getElementById('comboBadge');

  // Empty table
  if(!feltStackedCards||!feltStackedCards.length){
    const emptyMsg=G&&G.phase==='bid'?'Fase BID — mainkan kartu 3 untuk menentukan giliran pertama':'Meja kosong — bebas memulai';
    fc.innerHTML=`<div class="empty-msg">${emptyMsg}</div>`;
    badge.style.display='none';
    return;
  }

  fc.innerHTML='';

  // Always render ALL plays stacked on top of each other at center.
  // Earlier plays sit underneath (lower z-index), latest play on top.
  // Each play fans its own cards slightly — NO opacity, NO side-by-side.
  let globalZ=1;
  feltStackedCards.forEach((play, stackIdx)=>{
    const isLatest = stackIdx === feltStackedCards.length - 1;
    const n = play.cards.length;

    // Fan spread for this play's cards
    const spread = Math.min(160, n * 32);
    const step = n > 1 ? spread / (n - 1) : 0;
    const startX = -(spread / 2);

    // Each older play is rotated slightly differently so they peek out
    const baseRot = (stackIdx % 2 === 0 ? 1 : -1) * (stackIdx * 2.5);

    play.cards.forEach((c, i)=>{
      const col = sc(c.suit), sym = SUITS[c.suit], v = vd(c.val);
      const x = n > 1 ? startX + i * step : 0;
      const rot = baseRot + (i - (n - 1) / 2) * 2.2;
      const yOff = Math.abs(i - (n - 1) / 2) * 1.5;

      const div = document.createElement('div');
      div.className = 'felt-stack-card' + (isLatest ? ' animate' : '');
      // No opacity, no scale difference — just z-index layering
      div.style.cssText = [
        `--sf:translateX(${x}px) translateY(${yOff+55}px) rotate(${rot*2}deg)`,
        `--st:translateX(${x}px) translateY(${yOff}px) rotate(${rot}deg)`,
        `animation-delay:${i*50}ms`,
        `z-index:${globalZ++}`
      ].join(';') + ';';

      const imgKey2=`${c.val}_${c.suit}`;
      const imgSrc2=CARD_IMAGES[imgKey2]||'';
      const imgHtml2=imgSrc2?`<div class="card-img-wrap"><img src="${imgSrc2}" alt="${v}${sym}"></div>`:'';
      const hasCls2=imgSrc2?' has-img':'';
      div.innerHTML = `<div class="card ${col} nh${hasCls2}">
        ${imgHtml2}
        <div class="ct"><span class="cv">${v}</span><span class="cs">${sym}</span></div>
        <span class="cc">${sym}</span>
        <div class="cb2"><span class="cv">${v}</span><span class="cs">${sym}</span></div>
      </div>`;
      fc.appendChild(div);
    });
  });

  // Badge shows current combo label
  if(cards && cards.length){
    badge.style.display = 'block';
    const curCombo = G && G.currentCombo;
    badge.textContent = comboLabel(curCombo) || '';
    badge.className = isBomb(curCombo) ? 'bomb' : '';
    badge.id = 'comboBadge';
  } else {
    badge.style.display = 'none';
  }
}

function renderGame(){
  if(!G)return;
  const ms=G.mySlot;
  const isMyTurn=G.current===ms;

  // ── Opponents (the 3 others) ──
  const others=[0,1,2,3].filter(i=>i!==ms);
  document.getElementById('oppBar').innerHTML=others.map(pidx=>{
    const p=G.players[pidx],hand=G.hands[pidx];
    const active=G.current===pidx,done=G.finished.includes(pidx);
    const finRank=G.finished.indexOf(pidx);
    const medals=['🥇','🥈','🥉','💀'];
    const finBadge=done?`<span class="opp-medal">${medals[Math.min(finRank,3)]}</span>`:'';
    const dimCls=(!active&&!done)?' opp-dim':'';
    const activeCls=active?' opp-active':'';
    const doneCls=done?' done':'';
    const oppChips=(typeof chipSession!=='undefined'&&chipSession[p.id]?.chips!=null)
      ?chipSession[p.id].chips
      :null;
    const chipsHtml=oppChips!=null
      ?`<div class="opp-chips">💰 ${oppChips.toLocaleString('id-ID')}</div>`
      :'';
    return `<div class="opp${activeCls}${dimCls}${doneCls}">
      <div class="opp-left">
        ${finBadge}
        <div class="opp-nm">${p.name}</div>
        ${chipsHtml}
      </div>
      <div class="opp-ct">${hand.length}</div>
    </div>`;
  }).join('');

  // ── Turn dots — hidden (replaced by opp card brightness) ──
  document.getElementById('tdots').innerHTML='';

  // ── Felt (re-render if combo changed or stack changed) ──
  const cid=(G.currentCombo?G.currentCombo.cards.map(c=>c.id).join(','):'')+'|'+feltStackedCards.length;
  if(cid!==lastComboId){
    lastComboId=cid;
    renderFeltCards(G.currentCombo?G.currentCombo.cards:null);
  }

  // ── Ghost row ──
  const gr=document.getElementById('ghostRow');
  gr.querySelectorAll('.ghost-card').forEach(el=>el.remove());
  if(G.prevCombo&&G.prevCombo.cards&&G.currentCombo){
    G.prevCombo.cards.forEach(c=>gr.insertAdjacentHTML('beforeend',mkGhostHTML(c)));
    gr.classList.add('vis');
  }else gr.classList.remove('vis');

  // ── Player hand ──
  const hand=G.hands[ms]||[];
  const isBidPhase=G.phase==='bid';
  // Bid phase: player dapat memilih kartu 3 kapan saja selama belum bid
  const myBidDone=isBidPhase&&G.bidDone&&G.bidDone[ms];
  const canSelectBid=isBidPhase&&!myBidDone;
  const canSelect=(isMyTurn&&G.phase!=='end')||canSelectBid;

  // During bid phase: cards that are NOT rank-3 get dimmed (nh = not-hoverable)
  document.getElementById('handInner').innerHTML=
    hand.map((c,i)=>{
      const isBidBlocked=isBidPhase&&c.val!==3;
      const sel=G.selected&&G.selected.includes(i);
      return mkCardHTML(c,i,canSelect&&!isBidBlocked,sel,isBidBlocked);
    }).join('');

  // ── Nameplate ──
  const np=document.getElementById('myplate');
  const bidStatus=isBidPhase?` — FASE BID (${G.bidDone.filter(Boolean).length}/4)`:'';
  np.textContent=`${G.players[ms].name} — ${hand.length} kartu${isMyTurn?' ◀ GILIRAN KAMU':''}${bidStatus}`;
  np.className=isMyTurn?'on':'';

  // ── Buttons ──
  const gameOver=G.phase==='end';
  (() => { const _b=document.getElementById('btnPlay'),_bn=document.getElementById('btnPlayNoTimer'); if(_b)_b.disabled=true; if(_bn)_bn.disabled=true; })();
  const canSkip=!gameOver&&isMyTurn&&(!!G.currentCombo)&&!isBidPhase;
  document.getElementById('btnSkip').disabled=!canSkip;

  // Tombol ⇄ tampil kapan saja selama game belum end
  const btnReorder=document.getElementById('btnReorder');
  if(btnReorder)btnReorder.style.display=gameOver?'none':'flex';
  // Reset reorder mode jika game over
  if(gameOver&&_reorderMode){
    _reorderMode=false;_reorderSel=-1;
    const arrowRow=document.getElementById('arrowRow');
    if(arrowRow)arrowRow.style.display='none';
    if(btnReorder){btnReorder.textContent='⇄';btnReorder.classList.remove('active');}
  }
  // Sync arrowRow visibility
  const arrowRow=document.getElementById('arrowRow');
  if(arrowRow)arrowRow.style.display=_reorderMode?'flex':'none';

  if(!gameOver&&(isMyTurn||canSelectBid))updateComboHint();
  else{
    document.getElementById('comboHint').textContent='menunggu giliran...';
    document.getElementById('comboHint').style.color='rgba(212,168,67,0.18)';
  }
}

let _toggleCardLastIdx=-1,_toggleCardLastTime=0;
function toggleCard(idx){
  if(!G||G.phase==='end')return;
  // Debounce: cegah double-fire dari onclick + touchend pada device tertentu
  const now=Date.now();
  if(idx===_toggleCardLastIdx&&now-_toggleCardLastTime<300)return;
  _toggleCardLastIdx=idx;_toggleCardLastTime=now;

  if(!G.selected)G.selected=[];
  const hand=G.hands[G.mySlot]||[];
  const card=hand[idx];
  const ms=G.mySlot;

  if(G.phase==='bid'){
    // Bid phase: boleh pilih kartu 3 kapan saja, ASALKAN belum bid
    if(G.bidDone&&G.bidDone[ms])return; // sudah bid, tidak bisa pilih lagi
    if(!card||card.val!==3){
      showNotif('Fase BID: hanya kartu 3 yang boleh dipilih!');
      return;
    }
    // boleh pilih kartu 3 kapan saja (tidak perlu giliran)
  }else{
    // Play phase: harus giliran sendiri
    if(G.current!==ms)return;
  }

  const i=G.selected.indexOf(idx);
  if(i>=0){G.selected.splice(i,1);SFX.cardDeselect();}else{G.selected.push(idx);SFX.cardSelect();}
  document.getElementById('handInner').innerHTML=
    hand.map((c,i)=>mkCardHTML(c,i,true,G.selected.includes(i))).join('');
  updateComboHint();
}

// Helper: set disabled state on kedua tombol MAIN (arc + normal)
function setBtnPlayDisabled(val){
  const b1=document.getElementById('btnPlay');
  const b2=document.getElementById('btnPlayNoTimer');
  if(b1)b1.disabled=val;
  if(b2)b2.disabled=val;
}

function updateComboHint(){
  const hint=document.getElementById('comboHint');
  const btnPlay={set disabled(v){setBtnPlayDisabled(v);},get disabled(){return document.getElementById('btnPlay')?.disabled;}};

  // ── BID PHASE hint ──
  if(G.phase==='bid'){
    const ms=G.mySlot;
    // Jika sudah bid, disable semua
    if(G.bidDone&&G.bidDone[ms]){
      hint.textContent='Kartu 3 sudah dimainkan — menunggu pemain lain...';
      hint.style.color='rgba(0,255,136,0.35)';
      btnPlay.disabled=true;return;
    }
    const hand=G.hands[ms]||[];
    const myThrees=hand.filter(c=>c.val===3);
    if(!myThrees.length){
      hint.textContent='Kamu tidak punya kartu 3 — skip otomatis';
      hint.style.color='rgba(255,255,255,0.3)';
      btnPlay.disabled=true;return;
    }
    if(!G.selected||!G.selected.length){
      hint.textContent='Pilih kartu 3 untuk dimainkan di fase BID';
      hint.style.color='rgba(212,168,67,0.45)';
      btnPlay.disabled=true;return;
    }
    const sel=G.selected.map(i=>hand[i]).filter(Boolean);
    if(sel.some(c=>c.val!==3)){
      hint.textContent='Hanya kartu 3 yang boleh dimainkan!';
      hint.style.color='#e03040';btnPlay.disabled=true;return;
    }
    hint.textContent='✓ Mainkan kartu 3 sekarang!';
    hint.style.color='#00e8ff';
    btnPlay.disabled=false;
    return;
  }

  if(!G.selected||!G.selected.length){
    hint.textContent=G.firstTurn&&G.firstCard
      ?`Mainkan 3 ${SUIT_NAMES[G.firstCard.suit]} terlebih dulu (berkilau emas)`
      :'Pilih kartu untuk dimainkan';
    hint.style.color='rgba(212,168,67,0.35)';
    btnPlay.disabled=true;return;
  }
  const hand=G.hands[G.mySlot]||[];
  const sel=G.selected.map(i=>hand[i]);
  const combo=detectCombo(sel);
  if(!combo){
    hint.textContent='Kombinasi tidak valid';hint.style.color='#e03040';btnPlay.disabled=true;
  }else if(!comboBeats(G.currentCombo,combo)){
    hint.textContent=`${comboLabel(combo)} — terlalu kecil`;hint.style.color='#e03040';btnPlay.disabled=true;
  }else{
    hint.textContent=`✓ ${comboLabel(combo)} — siap dimainkan!`;
    hint.style.color=isBomb(combo)?'#cc44ff':'#00e8ff';
    btnPlay.disabled=false;
  }
}

function setGStat(m){const el=document.getElementById('gstat');if(el)el.textContent=m;}

function showNotif(msg,bomb=false){
  const n=document.getElementById('notif');
  const pill=document.createElement('div');
  pill.className='npill'+(bomb?' bomb':'');
  pill.textContent=msg;
  n.appendChild(pill);
  setTimeout(()=>pill.remove(),2300);
}

function showEndModal(){
  if(!G)return;
  const medals=['🥇','🥈','🥉','💀'];
  const clrs=['#d4a843','#aaaaaa','#cd7f32','#8b1a1a'];
  const ms=G.mySlot;

  // ── Resolve chip bets (host only, once) ──
  let deltas = {};
  if(isHost && G.finished.length === 4){
    deltas = resolveChips(G.finished, G.players);
    // Broadcast updated chip session to all
    send({type:'chip_result', deltas, chipSession, playerBets, finished: G.finished});
  }

  // Show chip float animation for local player
  const myPidx = G.finished.indexOf(ms);
  if(myPidx >= 0){
    const me = G.players[ms];
    const myBet = playerBets[me?.id] || currentBet;
    if(myBet > 0){
      const myDelta = CHIP_RANK_DELTA[myPidx] * myBet;
      setTimeout(()=>showChipFloat(myDelta), 400);
      updateChipHud();
    }
  }

  const items=G.finished.map((pidx,rank)=>`
    <li class="ritem" style="animation-delay:${rank*0.08}s">
      <div class="rcircle" style="background:${clrs[rank]}18;color:${clrs[rank]};border:1px solid ${clrs[rank]}44">${medals[rank]}</div>
      <span style="color:${pidx===ms?'var(--neon)':'var(--gold3)'};flex:1">${G.players[pidx].name}${pidx===ms?' (Kamu)':''}</span>
      <span style="font-size:9px;font-family:'JetBrains Mono',monospace;color:rgba(212,168,67,0.4)">${rank===0?'MENANG':rank===3?'KALAH':'#'+(rank+1)}</span>
    </li>`).join('');

  const chipRecapHtml = buildChipRecap(G.finished, G.players, deltas, ms);

  // Host broadcasts play_again signal; non-host just returns
  const mainLagiAction = isHost
    ? `hostInitPlayAgain()`
    : `returnToLobby()`;

  document.getElementById('endModal').innerHTML=`<div class="overlay"><div class="modal">
    <div class="modal-t">${G.finished[0]===ms?'🎉 MENANG!':'GAME SELESAI'}</div>
    <ul class="rlist">${items}</ul>
    ${chipRecapHtml}
    <button class="btn btn-gold" style="font-family:'Outfit',sans-serif;font-size:13px;letter-spacing:2px;" onclick="${mainLagiAction}">MAIN LAGI</button>
  </div></div>`;
}

function hostInitPlayAgain(){
  // Reset ready state
  readyPlayers=new Set();
  myReady=false;
  gameHasStarted=true;

  // Reset bet per player untuk ronde baru (tapi pertahankan preferensi sendiri)
  const myLastBet = playerBets[myId] || currentBet;
  playerBets = {};
  playerBets[myId] = myLastBet;
  _betsReceived = {};

  // ── Simpan data ronde ini untuk logika rematch ──
  // Winner = pemain pertama di G.finished (posisi ke-1)
  if(G && G.finished && G.finished.length > 0){
    _prevRoundWinnerSlot = G.finished[0]; // slot index pemenang
    // Snapshot sorted player IDs (hanya real players) dari ronde yang baru selesai
    _prevRoundPlayerIds = lobbyPlayers
      .filter(p=>!p.isBot)
      .map(p=>p.id)
      .sort();
  } else {
    _prevRoundWinnerSlot = -1;
    _prevRoundPlayerIds  = [];
  }

  // Tell all players to return to lobby (with updated chip session + rematch info)
  const realPlayers=lobbyPlayers.filter(p=>!p.isBot);
  send({
    type:'play_again',
    realPlayers,
    readyIds:[],
    chipSession,
    prevWinnerSlot: _prevRoundWinnerSlot,
    prevPlayerIds:  _prevRoundPlayerIds
  });
  returnToLobby();
}

// ══ BACKGROUND CANVAS ══
function startBgCanvas(){
  const canvas=document.getElementById('bgCanvas');
  if(!canvas)return;
  const ctx=canvas.getContext('2d');
  let W,H,t=0;
  const isMobile=window.innerWidth<=600;

  function resize(){
    W=canvas.width=window.innerWidth;
    H=canvas.height=window.innerHeight;
  }
  resize();
  window.addEventListener('resize',()=>{resize();isMob=window.innerWidth<=600;});

  // ── 2. SUIT SYMBOLS — simbol kartu melayang naik, subtle di background ──
  const SUITS_ARR=['♦','♥','♣','♠'];
  const suits=Array.from({length:isMobile?4:12},(_,i)=>({
    sym:SUITS_ARR[i%4],
    x:Math.random(),       // fraksi layar
    y:Math.random()*1.2,
    vx:(Math.random()-.5)*0.00015,
    vy:-(Math.random()*0.00025+0.00012), // selalu naik perlahan
    sz:Math.random()*(isMobile?14:28)+8,
    op:Math.random()*0.04+0.02,          // opacity sangat rendah di mobile
    rot:Math.random()*360,
    vrot:(Math.random()-.5)*0.15,
    isRed:i%4===0||i%4===1,
    ph:Math.random()*Math.PI*2
  }));

  // ── 3. SPARKLES — bintik berkilau kecil, seperti debu emas ──
  const sparks=Array.from({length:isMobile?10:25},()=>({
    x:Math.random(),
    y:Math.random(),
    vx:(Math.random()-.5)*0.0002,
    vy:-(Math.random()*0.0003+0.00005),
    sz:Math.random()*1.5+0.4,
    op:Math.random()*(isMobile?0.2:0.5)+0.05,
    ph:Math.random()*Math.PI*2,
    spd:Math.random()*0.025+0.012,
    col:Math.random()<0.6?'212,168,67':'200,255,220'
  }));



  function draw(){
    t++;
    ctx.clearRect(0,0,W,H);



    // === LAYER 3: SUIT SYMBOLS ===
    suits.forEach(s=>{
      s.x=(s.x+s.vx+1)%1;
      s.y+=s.vy;
      if(s.y<-0.15){s.y=1.1;s.x=Math.random();}
      s.rot+=s.vrot;
      s.ph+=0.012;
      const pulse=0.75+0.25*Math.sin(s.ph);
      const op=s.op*pulse;
      ctx.save();
      ctx.translate(s.x*W,s.y*H);
      ctx.rotate(s.rot*Math.PI/180);
      ctx.font=`${s.sz}px 'Outfit', sans-serif`;
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      if(s.isRed){
        ctx.fillStyle=`rgba(220,60,80,${op})`;
      }else{
        ctx.fillStyle=`rgba(180,200,255,${op})`;
      }
      ctx.fillText(s.sym,0,0);
      ctx.restore();
    });

    // === LAYER 4: SPARKLES ===
    sparks.forEach(p=>{
      p.x=(p.x+p.vx+1)%1;
      p.y+=p.vy;
      if(p.y<-0.02){p.y=1.02;p.x=Math.random();}
      p.ph+=p.spd;
      const twinkle=Math.pow(Math.max(0,Math.sin(p.ph)),2); // berkedip tajam
      const op=p.op*twinkle;
      if(op<0.01)return;
      ctx.beginPath();
      ctx.arc(p.x*W,p.y*H,p.sz,0,Math.PI*2);
      ctx.fillStyle=`rgba(${p.col},${op})`;
      ctx.fill();
    });



    requestAnimationFrame(draw);
  }
  draw();
}

// ══ MOBILE REORDER MODE (Opsi B+C: tap-to-swap + arrow buttons) ══
let _reorderMode=false;
let _reorderSel=-1;

function toggleReorderMode(){
  _reorderMode=!_reorderMode;
  _reorderSel=-1;
  _syncReorderUI();
}

function _syncReorderUI(){
  const btn=document.getElementById('btnReorder');
  const arrowRow=document.getElementById('arrowRow');
  if(btn){
    if(_reorderMode){btn.textContent='✓ SELESAI';btn.classList.add('active');}
    else{btn.textContent='⇄';btn.classList.remove('active');}
  }
  if(arrowRow)arrowRow.style.display=_reorderMode?'flex':'none';
  _renderReorderHand();
}

function _renderReorderHand(){
  if(!G)return;
  const ms=G.mySlot;
  const hand=G.hands[ms]||[];
  const hint=document.getElementById('comboHint');
  if(_reorderMode){
    document.getElementById('handInner').innerHTML=
      hand.map((c,i)=>_mkReorderCardHTML(c,i,i===_reorderSel)).join('');
    if(hint){
      if(_reorderSel<0){hint.textContent='Tap kartu untuk angkat — tap lagi untuk tukar';hint.style.color='rgba(212,168,67,0.6)';}
      else{hint.textContent='Tap kartu lain untuk tukar, atau pakai ◀ ▶';hint.style.color='var(--neon2)';}
    }
  } else {
    // Kembalikan render normal
    const isBidPhase=G.phase==='bid';
    const myBidDone=isBidPhase&&G.bidDone&&G.bidDone[ms];
    const canSelectBid=isBidPhase&&!myBidDone;
    const isMyTurn=G.current===ms&&G.phase!=='end';
    const canSelect=isMyTurn||canSelectBid;
    document.getElementById('handInner').innerHTML=
      hand.map((c,i)=>{
        const isBidBlocked=isBidPhase&&c.val!==3;
        const sel=G.selected&&G.selected.includes(i);
        return mkCardHTML(c,i,canSelect&&!isBidBlocked,sel,isBidBlocked);
      }).join('');
    if(hint&&!canSelect){hint.textContent='';hint.style.color='rgba(212,168,67,0.35)';}
    else if(hint&&canSelect)updateComboHint();
  }
}

function _mkReorderCardHTML(c,idx,isLifted){
  const col=sc(c.suit),sym=SUITS[c.suit],v=vd(c.val);
  const imgKey=`${c.val}_${c.suit}`;
  const imgSrc=CARD_IMAGES[imgKey]||'';
  const imgHtml=imgSrc?`<div class="card-img-wrap"><img src="${imgSrc}" alt="${v}${sym}"></div>`:'';
  const hasCls=imgSrc?' has-img':'';
  const liftCls=isLifted?' reorder-lifted':'';
  const zStyle=isLifted?'z-index:60':`z-index:${idx+1}`;
  return `<div class="card ${col}${hasCls}${liftCls}" onclick="reorderTapCard(${idx})" style="${zStyle}" data-idx="${idx}">
    ${imgHtml}
    <div class="ct"><span class="cv">${v}</span><span class="cs">${sym}</span></div>
    <span class="cc">${sym}</span>
    <div class="cb2"><span class="cv">${v}</span><span class="cs">${sym}</span></div>
  </div>`;
}

function reorderTapCard(idx){
  if(!_reorderMode||!G)return;
  const hand=G.hands[G.mySlot];
  if(_reorderSel<0){
    _reorderSel=idx;SFX.cardSelect();
  }else if(_reorderSel===idx){
    _reorderSel=-1;SFX.cardDeselect();
  }else{
    // Swap
    const tmp=hand[_reorderSel];hand[_reorderSel]=hand[idx];hand[idx]=tmp;
    if(G.selected){G.selected=G.selected.map(si=>{if(si===_reorderSel)return idx;if(si===idx)return _reorderSel;return si;});}
    _reorderSel=-1;SFX.cardPlay();
  }
  _syncReorderUI();
}

function reorderMoveCard(dir){
  if(!_reorderMode||!G||_reorderSel<0)return;
  const hand=G.hands[G.mySlot];
  const newIdx=_reorderSel+dir;
  if(newIdx<0||newIdx>=hand.length)return;
  const tmp=hand[_reorderSel];hand[_reorderSel]=hand[newIdx];hand[newIdx]=tmp;
  if(G.selected){G.selected=G.selected.map(si=>{if(si===_reorderSel)return newIdx;if(si===newIdx)return _reorderSel;return si;});}
  _reorderSel=newIdx;SFX.cardSelect();
  _syncReorderUI();
}

// ══ CARD DRAG REORDER ══
let dragSrcIdx=null;
let dragClickThreshold=false;

function handleCardDragStart(e,idx){
  dragSrcIdx=idx;
  dragClickThreshold=true;
  e.dataTransfer.effectAllowed='move';
  e.dataTransfer.setData('text/plain',String(idx));
  setTimeout(()=>{
    const el=e.target.closest('.card');
    if(el)el.classList.add('dragging');
  },0);
  const inner=document.getElementById('handInner');
  if(inner)inner.classList.add('drag-active');
}

function handleCardDragOver(e,idx){
  e.preventDefault();
  e.dataTransfer.dropEffect='move';
  // Highlight target
  document.querySelectorAll('#handInner .card').forEach(el=>{
    el.classList.remove('drag-over');
  });
  if(dragSrcIdx!==null&&dragSrcIdx!==idx){
    e.target.closest('.card')?.classList.add('drag-over');
  }
}

function handleCardDrop(e,toIdx){
  e.preventDefault();
  if(dragSrcIdx===null||dragSrcIdx===toIdx)return;
  if(!G)return;
  const ms=G.mySlot;
  const hand=G.hands[ms];

  // Save selected card ids before reorder
  const selIds=new Set((G.selected||[]).map(i=>hand[i]?hand[i].id:null).filter(Boolean));

  // Reorder hand
  const moved=hand.splice(dragSrcIdx,1)[0];
  hand.splice(toIdx,0,moved);

  // Remap selected indices based on card identity
  G.selected=hand.reduce((acc,c,i)=>{if(selIds.has(c.id))acc.push(i);return acc;},[]);

  dragSrcIdx=null;

  // Re-render respecting bid phase and current turn state
  const isBidPhase=G.phase==='bid';
  const myBidDone=isBidPhase&&G.bidDone&&G.bidDone[ms];
  const canSelectBid=isBidPhase&&!myBidDone;
  const isMyTurn=G.current===ms&&G.phase!=='end';
  const canSelect=isMyTurn||canSelectBid;

  document.getElementById('handInner').innerHTML=
    hand.map((c,i)=>{
      const isBidBlocked=isBidPhase&&c.val!==3;
      const sel=G.selected.includes(i);
      return mkCardHTML(c,i,canSelect&&!isBidBlocked,sel,isBidBlocked);
    }).join('');
  if(canSelect)updateComboHint();
}

function handleCardDragEnd(e){
  dragSrcIdx=null;
  document.querySelectorAll('#handInner .card').forEach(el=>{
    el.classList.remove('dragging','drag-over');
  });
  const inner=document.getElementById('handInner');
  if(inner)inner.classList.remove('drag-active');
}

// ══ DRAG SCROLL (only when not dragging a card) ══
(function(){
  let drag=false,sx=0,ss=0;
  const w=document.getElementById('handWrap');
  w.addEventListener('mousedown',e=>{
    if(e.target.closest('.card'))return; // let card handle its own drag
    drag=true;sx=e.pageX;ss=w.scrollLeft;w.style.cursor='grabbing';
  });
  document.addEventListener('mousemove',e=>{if(drag)w.scrollLeft=ss-(e.pageX-sx);});
  document.addEventListener('mouseup',()=>{drag=false;w.style.cursor='grab';});
  w.addEventListener('touchstart',e=>{if(e.target.closest('.card'))return;sx=e.touches[0].pageX;ss=w.scrollLeft;},{passive:true});
  w.addEventListener('touchmove',e=>{w.scrollLeft=ss-(e.touches[0].pageX-sx);},{passive:true});
})();

// ══ TOUCH TAP HANDLER — kartu di smartphone ══
// Beberapa browser iOS tidak fire onclick dengan benar pada elemen dalam scroll container.
// Solusi: pasang touchend listener di handInner untuk deteksi tap (bukan swipe).
(function(){
  const inner=document.getElementById('handInner');
  let _tx=0,_ty=0;
  inner.addEventListener('touchstart',e=>{
    const t=e.touches[0];
    _tx=t.clientX;_ty=t.clientY;
  },{passive:true});
  inner.addEventListener('touchend',e=>{
    const t=e.changedTouches[0];
    const dx=Math.abs(t.clientX-_tx);
    const dy=Math.abs(t.clientY-_ty);
    if(dx>10||dy>10)return;
    const cardEl=e.target.closest('.card[data-idx]');
    if(!cardEl)return;
    const idx=parseInt(cardEl.getAttribute('data-idx'),10);
    if(!isNaN(idx)){
      e.preventDefault();
      if(_reorderMode){reorderTapCard(idx);return;}
      toggleCard(idx);
    }
  });
})();

document.getElementById('joinCode').addEventListener('input',function(){this.value=this.value.toUpperCase();});

// ══ LOAD SAVED USERNAME ══
(function(){
  try{
    const saved=localStorage.getItem('trece_name');
    if(saved&&saved.length>=2){
      document.getElementById('uname').value=saved;
    }
  }catch(e){}
})();
