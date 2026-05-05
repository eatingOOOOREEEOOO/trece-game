// ═══════════════════════════════════════════════════════
// TRECE — game.js
// Game state, turn logic, bid/play/skip, timer, end game
// ═══════════════════════════════════════════════════════
'use strict';

// ══ GAME STATE ══
let G=null;
// Stacked cards on the felt (accumulates within a round, cleared when round resets)
let feltStackedCards=[]; // array of {cards, playerName, isMyPlay}

// ══ REMATCH STATE ══
// Menyimpan data ronde sebelumnya untuk logika "skip bid saat rematch"
// _prevRoundWinnerSlot : slot index (0-3) pemenang ronde terakhir (host perspective)
// _prevRoundPlayerIds  : snapshot sorted player id-list saat ronde terakhir selesai
let _prevRoundWinnerSlot = -1;
let _prevRoundPlayerIds  = [];

// ══ TURN TIMER ══
const TURN_SECONDS=30;
let timerInterval=null;
let timerSecondsLeft=0;

function startTimer(onExpire){
  clearTimer();
  timerSecondsLeft=TURN_SECONDS;
  const wrap=document.getElementById('timerWrap');
  const bar=document.getElementById('timerBar');
  const txt=document.getElementById('timerText');
  wrap.style.display='block';
  bar.style.width='100%';
  bar.className='';
  txt.textContent=TURN_SECONDS;

  timerInterval=setInterval(()=>{
    timerSecondsLeft--;
    const pct=Math.max(0,(timerSecondsLeft/TURN_SECONDS)*100);
    bar.style.width=pct+'%';
    txt.textContent=timerSecondsLeft;
    if(timerSecondsLeft===10){bar.className='warn';SFX.timerWarn();}
    if(timerSecondsLeft<=5&&timerSecondsLeft>0){bar.className='danger';SFX.timerTick();}
    if(timerSecondsLeft<=0){
      clearTimer();
      onExpire();
    }
  },1000);
}

function clearTimer(){
  if(timerInterval){clearInterval(timerInterval);timerInterval=null;}
  const wrap=document.getElementById('timerWrap');
  if(wrap)wrap.style.display='none';
}

// ── Position Announce Queue ──
// Ensures popups are shown one at a time, sequentially, never overlapping.
let _posQueue=[];
let _posShowing=false;
let _posTimer=null;

// Total duration per popup: in(0.5) + hold(2.2) + out(0.6) + gap(0.2) = ~3.5s
const POS_TOTAL_MS = 3500;

function showPositionAnnounce(rank, playerName, isMe){
  _posQueue.push({rank, playerName, isMe});
  _drainPosQueue();
}

function _drainPosQueue(){
  if(_posShowing||_posQueue.length===0)return;
  _posShowing=true;
  const {rank, playerName, isMe}=_posQueue.shift();
  _showOnePosAnnounce(rank, playerName, isMe, ()=>{
    _posShowing=false;
    _drainPosQueue();
  });
}

function _showOnePosAnnounce(rank, playerName, isMe, onDone){
  const medals=['🥇','🥈','🥉','💀'];
  const posLabels=['JUARA 1!','POSISI 2','POSISI 3','TERAKHIR'];
  const el=document.getElementById('posAnnounce');
  const banner=document.createElement('div');
  banner.className=`pos-banner pos-${rank+1}`;
  banner.innerHTML=`${medals[rank]} ${isMe?'KAMU':'<span style="font-size:0.7em">'+playerName+'</span>'}<br><span style="font-size:0.55em;opacity:0.8;letter-spacing:2px">${posLabels[rank]}</span>`;
  el.innerHTML='';
  el.appendChild(banner);
  if(_posTimer)clearTimeout(_posTimer);
  _posTimer=setTimeout(()=>{
    _posTimer=null;
    if(banner.parentNode)banner.remove();
    onDone();
  }, POS_TOTAL_MS);
}

// Fix: operator precedence diperbaiki dengan kurung eksplisit
function posQueueRemainingMs(){
  return ((_posShowing?1:0) + _posQueue.length) * POS_TOTAL_MS + 400;
}

// Cancel semua popup posisi sekaligus (dipanggil saat returnToLobby)
function clearPosQueue(){
  if(_posTimer){clearTimeout(_posTimer);_posTimer=null;}
  _posQueue=[];
  _posShowing=false;
  const el=document.getElementById('posAnnounce');
  if(el)el.innerHTML='';
}
function toggleReady(){
  if(myReady)return; // can't un-ready
  myReady=true;
  readyPlayers.add(myId);
  const btn=document.getElementById('btnReady');
  btn.className='btn btn-ready active';
  btn.textContent='✓ SUDAH SIAP!';
  btn.disabled=true;
  SFX.ready();
  send({type:'player_ready',id:myId});
  renderSlots();
  if(isHost)checkAllReady();
}

function checkAllReady(){
  if(!isHost||!gameHasStarted)return;
  const realPlayers=lobbyPlayers.filter(p=>!p.isBot);
  const allReady=realPlayers.every(p=>readyPlayers.has(p.id));
  const btnStart=document.getElementById('btnStart');
  if(btnStart){
    btnStart.disabled=!allReady;
    if(allReady)setB('Semua pemain siap! Host bisa mulai game.');
    else{
      const notReady=realPlayers.filter(p=>!readyPlayers.has(p.id)).map(p=>p.name);
      setB(`Menunggu: ${notReady.join(', ')}`);
    }
  }
}

function returnToLobby(){
  clearPosQueue();
  deactivatePokerIntense(); // ← pastikan intense hilang saat kembali ke lobby
  // Hide game, show lobby stepB — no reload, no re-login
  G=null;
  feltStackedCards=[];
  document.getElementById('endModal').innerHTML='';
  const lobby=document.getElementById('lobby');
  const game=document.getElementById('game');
  lobby.classList.remove('fade-out','gone');
  game.classList.remove('show');
  showStepB(true);
}

function hostStart(){
  // Inisialisasi chip session untuk semua pemain di lobby
  initChipSession(lobbyPlayers);
  // Tampilkan modal taruhan — game dimulai setelah host konfirmasi
  showBetModal();
}

function receiveStart(d){
  // Sync chip data from host
  if(d.chipSession) chipSession = d.chipSession;
  if(d.currentBet !== undefined) currentBet = d.currentBet;
  const mySlot=d.players.findIndex(p=>p.id===myId);
  beginGame({
    players:d.players,
    hands:d.handsData.map(h=>h.cards),
    mySlot,
    skipBid:  d.skipBid  || false,
    startSlot: d.startSlot != null ? d.startSlot : 0
  });
}

function beginGame({players,hands,mySlot,skipBid=false,startSlot=0}){
  feltStackedCards=[];
  clearPosQueue(); // reset popup queue for new game
  _bidTransitionShown=false; // reset bid transition flag for new game
  initBotPersonas(players); // assign random personas to bots each game

  if(skipBid){
    // ── REMATCH: skip fase bid, langsung mulai dari pemenang ronde lalu ──
    G={
      players,
      hands,
      current: startSlot,   // pemenang ronde lalu langsung jadi pemain pertama
      currentCombo:null,
      prevCombo:null,
      lastPlayedBy:-1,
      skipped:[false,false,false,false],
      finished:[],
      firstTurn:false,
      firstCard:null,
      phase:'play',          // langsung fase play, tanpa bid
      bidPlays:[],
      bidDone:[true,true,true,true], // anggap semua sudah bid (tidak dipakai)
      mySlot,
      selected:[],
      pokerFinishedBy:-1  // slot index pemain yang menang dengan poker sebagai kartu terakhir (-1 = tidak ada)
    };
  } else {
    // ── GAME BARU / ROSTER BERUBAH: fase bid normal ──
    G={
      players,
      hands,
      current:0,  // bid always starts from player 0
      currentCombo:null,
      prevCombo:null,
      lastPlayedBy:-1,
      skipped:[false,false,false,false],
      finished:[],
      firstTurn:false,
      firstCard:null,
      phase:'bid',
      bidPlays:[],
      bidDone:[false,false,false,false],
      mySlot,
      selected:[],
      pokerFinishedBy:-1  // slot index pemain yang menang dengan poker sebagai kartu terakhir (-1 = tidak ada)
    };
  }

  const lobby=document.getElementById('lobby');
  lobby.classList.add('fade-out');
  setTimeout(()=>lobby.classList.add('gone'),500);
  document.getElementById('game').classList.add('show');
  if(!window._bgStarted){window._bgStarted=true;startBgCanvas();}
  updateChipHud();

  if(skipBid){
    // Animasi deal kartu, lalu langsung ke proceedTurn tanpa popup bid
    renderGame();
    runSlideInDeal(hands[mySlot], () => {
      SFX.gameStart();
      // Tampilkan popup singkat: siapa yang mulai (berdasarkan menang ronde lalu)
      const winnerName = players[startSlot].name;
      const isMe = startSlot === mySlot;
      setTimeout(()=>showRematchStartPopup(winnerName, isMe, ()=>{
        proceedTurn();
      }), 900);
    });
  } else {
    // Render tangan dulu (tersembunyi), lalu animasi deal kartu satu per satu
    renderGame();
    runSlideInDeal(hands[mySlot], () => {
      SFX.gameStart();
      setTimeout(() => proceedTurn(), 900);
    });
  }
}


function showFirstPlayerPopup(name,isMe,cardStr,onDone){
  // Legacy wrapper — now delegates to the full sequence
  showThreeRevealSequence([],name,isMe,onDone);
}

// Sequential reveal: show each rank-3 card one by one (suit low→high),
// then a final "X mulai!" popup. Each step waits for the previous to finish.
function showThreeRevealSequence(allThrees,startName,isMe,onDone){
  const el=document.getElementById('posAnnounce');
  const SUIT_SYM=['♦','♣','♥','♠'];
  const SUIT_COL=['#e03040','#aaccff','#e03040','#aaccff']; // r/b/r/b

  // Build step list: one entry per card (sorted suit low→high, already sorted)
  // Then a final step: first-player announcement
  const steps=[];

  allThrees.forEach((c,idx)=>{
    const ownerName=c._ownerName||'';
    const sym=SUIT_SYM[c.suit];
    const col=SUIT_COL[c.suit];
    const isLast=idx===allThrees.length-1;
    steps.push({
      html:[
        '<div style="font-size:9px;letter-spacing:3px;color:rgba(0,255,136,0.4);margin-bottom:10px">KARTU 3 DITEMUKAN ('+(idx+1)+'/'+allThrees.length+')</div>',
        '<div style="font-size:36px;margin-bottom:8px">',
          '<span style="font-family:serif;color:'+col+';text-shadow:0 0 18px '+col+'88">3'+sym+'</span>',
        '</div>',
        '<div style="font-size:13px;color:#f0c85a;font-weight:700;margin-bottom:4px">'+ownerName+'</div>',
        isLast
          ? '<div style="font-size:9px;color:rgba(0,255,136,0.5);letter-spacing:2px;margin-top:6px">kartu tertinggi — menentukan giliran</div>'
          : '<div style="font-size:9px;color:rgba(255,255,255,0.25);letter-spacing:1px;margin-top:6px">kartu ini dikeluarkan dari tangan</div>'
      ].join(''),
      dur: isLast ? 2000 : 1600
    });
  });

  // Final step: first player announcement
  steps.push({
    html:[
      '<div style="font-size:9px;letter-spacing:3px;color:rgba(0,255,136,0.45);margin-bottom:14px">GILIRAN PERTAMA</div>',
      '<div style="font-size:'+(isMe?'28':'22')+'px;font-weight:700;color:'+(isMe?'#00ff88':'#f0c85a')+';margin-bottom:10px">',
        isMe?'🎯 Kamu mulai!':'⭐ '+startName+' mulai!',
      '</div>',
      '<div style="font-size:10px;color:rgba(255,255,255,0.3);letter-spacing:1px">Meja reset — bebas pilih kombinasi apa saja</div>'
    ].join(''),
    dur: 2200
  });

  let stepIdx=0;
  function runStep(){
    if(stepIdx>=steps.length){onDone();return;}
    const step=steps[stepIdx++];
    const div=document.createElement('div');
    Object.assign(div.style,{
      background:'rgba(6,13,16,0.97)',
      border:'2px solid rgba(0,255,136,0.45)',
      borderRadius:'18px',
      padding:'22px 32px',
      textAlign:'center',
      fontFamily:'JetBrains Mono,monospace',
      animation:'posIn 0.4s cubic-bezier(0.34,1.4,0.64,1) both',
      maxWidth:'300px',
      boxShadow:'0 0 40px rgba(0,255,136,0.08)'
    });
    div.innerHTML=step.html;
    el.innerHTML='';
    el.appendChild(div);
    setTimeout(()=>{
      div.style.animation='posOut 0.35s ease-in forwards';
      setTimeout(()=>{div.remove();runStep();},350);
    },step.dur);
  }
  runStep();
}

// ══ REMATCH START POPUP ══
// Popup ringkas saat rematch (tanpa fase bid):
// memberi tahu siapa yang mulai berdasarkan pemenang ronde sebelumnya.
function showRematchStartPopup(winnerName, isMe, onDone){
  const el = document.getElementById('posAnnounce');
  const div = document.createElement('div');
  Object.assign(div.style, {
    background: 'rgba(6,13,16,0.97)',
    border: '2px solid rgba(212,168,67,0.55)',
    borderRadius: '18px',
    padding: '22px 32px',
    textAlign: 'center',
    fontFamily: 'JetBrains Mono,monospace',
    animation: 'posIn 0.4s cubic-bezier(0.34,1.4,0.64,1) both',
    maxWidth: '300px',
    boxShadow: '0 0 40px rgba(212,168,67,0.08)'
  });
  div.innerHTML = [
    '<div style="font-size:9px;letter-spacing:3px;color:rgba(212,168,67,0.5);margin-bottom:12px">REMATCH — GILIRAN PERTAMA</div>',
    '<div style="font-size:' + (isMe ? '22' : '18') + 'px;font-weight:700;color:' + (isMe ? '#00ff88' : '#f0c85a') + ';margin-bottom:10px">',
      isMe ? '🏆 Kamu mulai! (menang ronde lalu)' : '🏆 ' + winnerName + ' mulai!',
    '</div>',
    '<div style="font-size:9px;color:rgba(255,255,255,0.3);letter-spacing:1px">' +
      (isMe ? 'Hak istimewa pemenang — bebas pilih kombinasi apa saja' : 'Pemenang ronde sebelumnya memulai') +
    '</div>'
  ].join('');
  el.innerHTML = '';
  el.appendChild(div);
  setTimeout(()=>{
    div.style.animation = 'posOut 0.35s ease-in forwards';
    setTimeout(()=>{ div.remove(); onDone(); }, 350);
  }, 2400);
}

// ══ TURN FLOW ══
function proceedTurn(){
  if(!G||G.phase==='end')return;

  // ── BID PHASE ──
  if(G.phase==='bid'){
    proceedBidTurn();
    return;
  }

  const cur=G.current;
  const pl=G.players[cur];

  clearTimer();

  // If current player has already finished, advance
  if(G.finished.includes(cur)){advanceTurn();return;}

  if(pl.isBot){
    // Only host drives bot turns
    if(isHost){
      // Variable delay: simulate "thinking" based on situation complexity
      const hand=G.hands[cur];
      const allCombos=getAllCombos(hand);
      const validMoves=G.currentCombo?allCombos.filter(c=>comboBeats(G.currentCombo,c)):allCombos;
      // More choices = longer "think time"; endgame = shorter (decisive)
      const baseDelay = hand.length<=3 ? 600 : hand.length<=6 ? 900 : 1100;
      const thinkBonus = Math.min(validMoves.length, 10) * 55;
      const randJitter = Math.random()*500 - 100;
      // Occasionally add a longer "hesitation" pause (~15% chance)
      const hesitation = Math.random()<0.15 ? 900+Math.random()*700 : 0;
      const delay = Math.max(500, baseDelay + thinkBonus + randJitter + hesitation);
      setTimeout(()=>doBotTurn(cur), delay);
    }
    // Non-host just waits for state update
  }else if(pl.id===myId){
    if(G.finished.includes(G.mySlot)){
      setGStat('Kamu sudah selesai! Menunggu pemain lain...');
      renderGame();
      return;
    }
    setGStat('Giliran KAMU!');
    SFX.yourTurn();
    renderGame();
    startTimer(()=>{
      setGStat('Waktu habis — otomatis main kartu terkecil!');
      if(G.currentCombo){
        playerSkip();
      }else{
        // Must play something — auto-play lowest card
        const hand=G.hands[G.mySlot];
        if(hand&&hand.length>0){
          const lowest=srtH(hand)[0];
          const combo={type:'single',rank:crank(lowest),cards:[lowest],len:1};
          G.selected=[];
          clearTimer();
          SFX.cardPlay();
          if(isHost){
            applyPlay(G.mySlot,combo);
          }else{
            send({type:'game_action',action:'play',pid:myId,
              combo:{type:combo.type,rank:combo.rank,len:combo.len,cards:combo.cards}});
          }
        }
      }
    });
  }else{
    setGStat(`Menunggu ${pl.name}...`);
    renderGame();
  }
}

// ── BID PHASE LOGIC ──
function proceedBidTurn(){
  if(!G||G.phase!=='bid')return;
  const cur=G.current;
  const pl=G.players[cur];
  clearTimer();

  // HOST drives all bid logic (bots + auto-skips + waiting for non-host actions)
  if(isHost){
    const myThrees=G.hands[cur].filter(c=>c.val===3);
    if(!myThrees.length){
      // No 3s — auto-skip
      setTimeout(()=>applyBid(cur,null),400);
      return;
    }
    if(pl.isBot){
      setTimeout(()=>{
        const bidDelay = 700 + Math.random()*600 + (Math.random()<0.15?800:0);
        setTimeout(()=>{
          const combo=detectCombo(myThrees)||{type:'single',rank:0,cards:[myThrees[0]],len:1};
          applyBid(cur,combo);
        }, bidDelay);
      },0);
    }else if(pl.id===myId){
      // Host is this player
      setGStat('Fase BID: mainkan kartu 3 kamu!');
      SFX.yourTurn();
      renderGame();
      startTimer(()=>{
        const threes=G.hands[G.mySlot].filter(c=>c.val===3);
        const combo=threes.length?(detectCombo(threes)||{type:'single',rank:0,cards:[threes[0]],len:1}):null;
        applyBid(G.mySlot,combo);
      });
    }else{
      // Waiting for non-host player to send bid action
      setGStat(`Menunggu ${pl.name} bid...`);
      renderGame();
    }
  }else{
    // NON-HOST: player bisa bid kapan saja, tidak perlu nunggu giliran resmi
    // Hanya update UI — player sudah bisa pilih dan klik MAIN kapan saja
    const ms=G.mySlot;
    const myBidDone=G.bidDone&&G.bidDone[ms];

    if(myBidDone){
      // Sudah bid, tunggu yang lain
      setGStat(`Menunggu pemain lain bid... (${G.bidDone.filter(Boolean).length}/4)`);
      renderGame();
      return;
    }

    const myThrees=G.hands[ms].filter(c=>c.val===3);
    if(!myThrees.length){
      // Tidak punya kartu 3 — auto-skip langsung
      setTimeout(()=>{
        if(G&&G.phase==='bid'&&!G.bidDone[G.mySlot]){
          G.bidDone[G.mySlot]=true; // mark locally
          send({type:'game_action',action:'bid',pid:myId,combo:null});
          setGStat(`Menunggu pemain lain bid... (${G.bidDone.filter(Boolean).length}/4)`);
          renderGame();
        }
      },400);
      setGStat('Kamu tidak punya kartu 3 — skip otomatis');
      renderGame();
    }else{
      // Punya kartu 3 — minta player pilih dan klik MAIN
      // Tampilkan pesan berbeda tergantung apakah giliran resmi atau belum
      if(cur===ms){
        setGStat('⭐ Giliran kamu BID! Pilih kartu 3 dan tekan MAIN');
        SFX.yourTurn();
      }else{
        setGStat('Fase BID: pilih kartu 3 kamu dan tekan MAIN kapan saja!');
      }
      renderGame();
      // Jika ini giliran resminya, mulai timer
      if(cur===ms){
        startTimer(()=>{
          if(G&&G.phase==='bid'&&!G.bidDone[G.mySlot]){
            const threes=G.hands[G.mySlot].filter(c=>c.val===3);
            const combo=threes.length?(detectCombo(threes)||{type:'single',rank:0,cards:[threes[0]],len:1}):null;
            G.bidDone[G.mySlot]=true;
            if(combo){
              const ids=new Set(combo.cards.map(c=>c.id));
              G.hands[G.mySlot]=G.hands[G.mySlot].filter(c=>!ids.has(c.id));
              feltStackedCards.push({cards:combo.cards,playerName:G.players[G.mySlot].name,isMyPlay:true});
              renderGame();
              send({type:'game_action',action:'bid',pid:myId,
                combo:{type:combo.type,rank:combo.rank||0,len:combo.len,cards:combo.cards}});
            }else{
              send({type:'game_action',action:'bid',pid:myId,combo:null});
            }
          }
          clearTimer();
        });
      }
    }
  }
}

function applyBid(pidx,combo){
  if(!G||G.phase!=='bid')return;
  if(G.bidDone[pidx])return;
  // Only host (or self for local UI) should run this
  // Non-host must NOT call this for other players — state comes via receiveState
  if(!isHost&&pidx!==G.mySlot)return;
  G.bidDone[pidx]=true;

  if(combo){
    // Remove bid cards from hand, record play
    const ids=new Set(combo.cards.map(c=>c.id));
    G.hands[pidx]=G.hands[pidx].filter(c=>!ids.has(c.id));
    G.bidPlays.push({pidx,cards:combo.cards});
    // Place on felt
    feltStackedCards.push({cards:combo.cards,playerName:G.players[pidx].name,isMyPlay:pidx===G.mySlot});
    setGStat(`${G.players[pidx].name} memainkan kartu 3`);
    SFX.cardPlay();
  }else{
    setGStat(`${G.players[pidx].name} tidak punya kartu 3 — skip`);
  }

  if(isHost){
    bcastState();
    // Check if all 4 players have bid
    if(G.bidDone.every(Boolean)){
      setTimeout(()=>finishBidPhase(),600);
      return;
    }
    // Advance to next player who hasn't bid
    let next=(pidx+1)%4;
    let tries=0;
    while(G.bidDone[next]&&tries<4){next=(next+1)%4;tries++;}
    G.current=next;
    renderGame();
    proceedTurn();
  }else{
    // Non-host: just update local UI; wait for host state update to drive next turn
    renderGame();
  }
}

function finishBidPhase(){
  if(!G)return;
  // Determine startP: player who played the highest-suit 3
  // bidPlays contains {pidx, cards[]}
  let startP=0,highestSuit=-1,topCard=null;
  const allThrees=[];
  for(const bp of G.bidPlays){
    for(const c of bp.cards){
      allThrees.push(Object.assign({},c,{_owner:bp.pidx,_ownerName:G.players[bp.pidx].name}));
      if(c.suit>highestSuit){highestSuit=c.suit;startP=bp.pidx;topCard=c;}
    }
  }
  // If nobody played any 3 (edge case), start from player 0
  if(highestSuit===-1)startP=0;

  // Reset to play phase
  G.phase='play';
  G.current=startP;
  G.currentCombo=null;
  G.prevCombo=null;
  G.lastPlayedBy=-1;
  G.skipped=[false,false,false,false];
  // Reset felt — clear 3s for fresh start
  feltStackedCards=[];
  // Broadcast final bid result (startP) to all clients BEFORE popup
  if(isHost)bcastState();

  // Show sequential reveal then start game
  const isMe=startP===G.mySlot;
  const nm=G.players[startP].name;
  allThrees.sort((a,b)=>a.suit-b.suit);
  renderGame();
  showThreeRevealSequence(allThrees,nm,isMe,()=>{
    proceedTurn();
  });
}

function doBotTurn(pidx){
  if(!isHost||!G||G.phase==='end'||G.current!==pidx)return;
  const play=botDecide(G.hands[pidx],G.currentCombo,false,null,G,pidx);
  if(play&&comboBeats(G.currentCombo,play)){
    applyPlay(pidx,play);
  }else{
    applySkip(pidx);
  }
}

function isPokerCombo(combo){
  // Untuk cek "apakah combo ini bisa di-bomb" — tetap mencakup single/double/triple angka 2
  if(!combo)return false;
  if(combo.type==='single'||combo.type==='double'||combo.type==='triple'){
    return combo.cards.every(c=>c.val===2);
  }
  return false;
}

function isSinglePoker(combo){
  // Efek intense HANYA saat kartu tunggal angka 2 (poker single)
  if(!combo)return false;
  return combo.type==='single' && combo.cards.length===1 && combo.cards[0].val===2;
}

function triggerPokerBombEnd(pokerIdx,bombIdx,bombCombo){
  G.phase='end';
  clearTimer();
  feltStackedCards.push({cards:bombCombo.cards,playerName:G.players[bombIdx].name,isMyPlay:bombIdx===G.mySlot});
  const bombNm=G.players[bombIdx].name;
  const pokerNm=G.players[pokerIdx].name;
  deactivatePokerIntense(); // intense hilang — bomb meledak
  SFX.pokerBombed();
  triggerBombEffect(true);
  showNotif(`💣 ${bombNm} BOMB! ${pokerNm} LANGSUNG KALAH!`,true);
  setGStat(`💣 ${bombNm} melawan Poker dengan Bomb! ${pokerNm} kalah!`);
  // Rank 1: Bomb player; Rank 4: Poker player; Rank 2&3: remaining by fewest cards
  const others=[0,1,2,3].filter(p=>p!==bombIdx&&p!==pokerIdx&&!G.finished.includes(p));
  others.sort((a,b)=>G.hands[a].length-G.hands[b].length);
  G.finished=[bombIdx,...others,pokerIdx];
  // Queue all position announcements — they show sequentially via the queue
  G.finished.forEach((p,rank)=>{
    showPositionAnnounce(rank,G.players[p].name,p===G.mySlot);
  });
  if(G.finished[0]===G.mySlot)showWinCelebration();
  if(isHost)bcastState();
  renderGame();
  // Show end modal only after all position popups have finished
  setTimeout(showEndModal, posQueueRemainingMs());
}

function applyPlay(pidx,combo){
  // Remove played cards from hand
  const ids=new Set(combo.cards.map(c=>c.id));
  G.hands[pidx]=G.hands[pidx].filter(c=>!ids.has(c.id));

  // ── POKER vs BOMB RESOLUTION ──
  // Kondisi 1: Poker dimainkan saat masih ada sisa kartu (bukan kartu terakhir),
  //   lalu pemain berikutnya melawan dengan Bomb → Bomb sah, game LANGSUNG BERAKHIR,
  //   pemenang adalah pemain yang memainkan Bomb.
  //
  // Kondisi 2: Poker dimainkan sebagai kartu TERAKHIR (pemain sudah masuk G.finished
  //   ATAU baru saja habis kartunya di giliran ini) → Bomb tetap sah dimainkan,
  //   tapi TIDAK memicu poker-bomb-end; permainan berlanjut normal.
  //
  // Cara membedakan: kita simpan pokerFinishedBy di state G saat poker dimainkan
  // sebagai kartu terakhir. Jika pokerFinishedBy === lastPlayedBy, berarti Kondisi 2.

  const prevWasSinglePoker = G.currentCombo && isSinglePoker(G.currentCombo);
  const curIsBomb = isBomb(combo);

  if(prevWasSinglePoker && curIsBomb){
    // Cek apakah poker player sudah masuk finished list (via G.finished)
    // ATAU sudah ditandai pokerFinishedBy (kartu habis di giliran yang sama)
    const pokerPlayerIdx = G.lastPlayedBy;
    const pokerFinishedNormally = G.finished.includes(pokerPlayerIdx)
      || G.pokerFinishedBy === pokerPlayerIdx;

    if(!pokerFinishedNormally){
      // Kondisi 1: Poker masih punya sisa kartu → Bomb mengakhiri game
      triggerPokerBombEnd(pokerPlayerIdx, pidx, combo);
      return;
    }
    // Kondisi 2: Poker adalah kartu terakhir → Bomb sah tapi game tidak berakhir
    // Reset flag dan lanjutkan normal
    G.pokerFinishedBy = -1;
  }

  G.prevCombo=G.currentCombo;
  G.currentCombo=combo;
  G.lastPlayedBy=pidx;
  G.skipped=[false,false,false,false];

  // Push to stacked cards (accumulate within a round)
  feltStackedCards.push({cards:combo.cards,playerName:G.players[pidx].name,isMyPlay:pidx===G.mySlot});

  const nm=G.players[pidx].name;
  if(G.hands[pidx].length===0){
    const rank=G.finished.length;
    G.finished.push(pidx);
    setGStat(`🎉 ${nm} selesai! Posisi #${G.finished.length}`);
    showNotif(`🎉 ${nm} selesai!`);
    showPositionAnnounce(rank,nm,pidx===G.mySlot);
    SFX.playerFinish();
    // Jika kartu yang baru saja dihabiskan adalah poker single → tandai pokerFinishedBy
    // agar giliran berikutnya tahu bahwa poker ini sudah selesai (Kondisi 2)
    if(isSinglePoker(combo)){
      G.pokerFinishedBy = pidx;
    }
    // Deactivate intense (kartu sudah habis, tidak ada lagi ancaman poker)
    deactivatePokerIntense();
  }else{
    setGStat(`${nm} mainkan ${comboLabel(combo)}`);
    if(isBomb(combo)){showNotif(`💣 ${nm}: ${comboLabel(combo)}!`,true);SFX.bomb();triggerBombEffect(false);}
    // Activate intense HANYA jika poker tunggal (satu kartu angka 2)
    if(isSinglePoker(combo)) activatePokerIntense();
    else deactivatePokerIntense();
  }

  checkEnd();
  if(G.phase!=='end')advanceTurn();
  if(isHost)bcastState();
  renderGame();
}

function applySkip(pidx){
  G.skipped[pidx]=true;
  setGStat(`${G.players[pidx].name} skip`);

  // Check if all OTHER active players (not lastPlayedBy) have skipped
  const active=[0,1,2,3].filter(p=>!G.finished.includes(p)&&p!==G.lastPlayedBy);
  const allSkipped=active.length>0&&active.every(p=>G.skipped[p]);

  if(allSkipped&&G.lastPlayedBy>=0){
    // Round over — lastPlayedBy leads again, clear the felt stack
    G.prevCombo=null;
    G.currentCombo=null;
    G.skipped=[false,false,false,false];
    G.current=G.lastPlayedBy;
    G.lastPlayedBy=-1;
    G.pokerFinishedBy=-1; // reset flag saat round baru dimulai
    feltStackedCards=[]; // clear stacked cards for new round
    lastComboId='_clear_'; // force re-render
    SFX.newRound();
    deactivatePokerIntense(); // ← round baru, intense hilang
    setGStat(`${G.players[G.current].name} berhak main lagi!`);
    if(isHost)bcastState();
    renderGame();
    proceedTurn();
    return;
  }
  advanceTurn();
  if(isHost)bcastState();
  renderGame();
}

function advanceTurn(){
  if(G.phase==='end'||G.phase==='bid')return;
  let next=(G.current+1)%4,tries=0;
  while(G.finished.includes(next)&&tries<4){next=(next+1)%4;tries++;}
  if(G.finished.includes(next))return; // everyone done
  G.current=next;
  proceedTurn();
}

function showWinCelebration(){
  // Win popup removed — handled by position announce queue instead
  SFX.win();
}

function checkEnd(){
  const rem=[0,1,2,3].filter(p=>!G.finished.includes(p));
  if(rem.length<=1){
    G.phase='end';
    clearTimer();
    if(rem.length===1){
      const lastP=rem[0];
      const rank=G.finished.length;
      G.finished.push(lastP);
      showPositionAnnounce(rank,G.players[lastP].name,lastP===G.mySlot);
    }
    // Re-sort queue: local player's popup shows first, then others in rank order
    _posQueue.sort((a,b)=>{
      if(a.isMe&&!b.isMe)return-1;
      if(!a.isMe&&b.isMe)return 1;
      return a.rank-b.rank;
    });
    // Show win celebration if local player is the winner
    if(G.finished.length>0&&G.finished[0]===G.mySlot){
      showWinCelebration();
    }else{
      SFX.lose();
    }
    if(isHost)bcastState();
    // Wait for all position announce popups to finish before showing end modal
    setTimeout(showEndModal, posQueueRemainingMs());
  }
}

function bcastState(){
  if(!isHost)return;
  const stateWithStack=JSON.parse(JSON.stringify(G));
  stateWithStack._feltStack=feltStackedCards;
  stateWithStack._lobbyPlayers=lobbyPlayers;
  send({type:'game_state',state:stateWithStack});
}

// Track bid→play transition to prevent double popup on non-host
let _bidTransitionShown = false;

function receiveState(state){
  const ms=G?G.mySlot:0;
  // Sync felt stack from host
  if(state._feltStack!==undefined){
    feltStackedCards=state._feltStack;
    delete state._feltStack;
  }
  // Sync lobby players (bot replacements on disconnect)
  if(state._lobbyPlayers!==undefined){
    lobbyPlayers=state._lobbyPlayers;
    delete state._lobbyPlayers;
  }

  // ── Preserve local hand order ──
  const localHand = G ? [...(G.hands[ms]||[])] : null;

  const wasEnd=G&&G.phase==='end';
  const wasBid=G&&G.phase==='bid';
  G=state;
  G.mySlot=ms;
  G.selected=G.selected||[];
  G.bidDone=G.bidDone||[false,false,false,false];
  G.bidPlays=G.bidPlays||[];
  if(G.pokerFinishedBy===undefined)G.pokerFinishedBy=-1;

  // Restore local order: keep only cards still present in host's authoritative hand
  if(localHand){
    const hostHandIds=new Set((G.hands[ms]||[]).map(c=>c.id));
    const preserved=localHand.filter(c=>hostHandIds.has(c.id));
    const preservedIds=new Set(preserved.map(c=>c.id));
    const extra=(G.hands[ms]||[]).filter(c=>!preservedIds.has(c.id));
    G.hands[ms]=[...preserved,...extra];
  }

  lastComboId=''; // force felt re-render with synced stack
  renderGame();

  // ── Poker Intense: sync efek berdasarkan state dari host ──
  if(G.phase==='play'||G.phase==='bid'){
    if(isSinglePoker(G.currentCombo)) activatePokerIntense();
    else deactivatePokerIntense();
  } else {
    deactivatePokerIntense();
  }

  const isBidToPlayTransition = wasBid && G.phase==='play';

  if(G.phase==='end'){
    if(!wasEnd){
      if(G.finished.length>0&&G.finished[0]===G.mySlot){
        showWinCelebration();
      }
      setTimeout(showEndModal, posQueueRemainingMs());
    }
  }else if(G.phase==='bid'){
    // Bid phase: update UI. Player bisa bid kapan saja (tidak tergantung G.current)
    if(!G.bidDone[G.mySlot]){
      // Belum bid — panggil proceedBidTurn untuk update UI dan timer jika perlu
      proceedBidTurn();
    }else{
      setGStat(`Menunggu pemain lain bid... (${G.bidDone.filter(Boolean).length}/4)`);
      renderGame();
    }
  }else if(isBidToPlayTransition&&!_bidTransitionShown){
    // Bid phase just ended — show reveal sequence then start play (only once)
    _bidTransitionShown=true;
    const allThrees=[];
    for(const bp of G.bidPlays){
      for(const c of bp.cards){
        allThrees.push(Object.assign({},c,{_owner:bp.pidx,_ownerName:G.players[bp.pidx].name}));
      }
    }
    allThrees.sort((a,b)=>a.suit-b.suit);
    const startP=G.current;
    const isMe=startP===ms;
    const nm=G.players[startP].name;
    clearTimer();
    showThreeRevealSequence(allThrees,nm,isMe,()=>{
      _bidTransitionShown=false;
      proceedTurn();
    });
  }else{
    proceedTurn();
  }
}

// ══ PLAYER ACTIONS ══
function playerPlay(){
  if(!G||G.phase==='end')return;
  // Bid phase: boleh submit kapan saja (tidak perlu nunggu giliran)
  // Play phase: harus giliran sendiri
  if(G.phase!=='bid'&&G.current!==G.mySlot)return;
  const hand=G.hands[G.mySlot];
  const selCards=(G.selected||[]).map(i=>hand[i]);

  // ── BID PHASE: hanya kartu 3 yang boleh dimainkan ──
  if(G.phase==='bid'){
    if(!selCards.length)return;
    if(selCards.some(c=>c.val!==3)){
      showNotif('Fase BID: hanya kartu 3 yang boleh dimainkan!');
      return;
    }
    if(G.bidDone[G.mySlot])return; // already bid
    const combo=detectCombo(selCards)||{type:'single',rank:0,cards:selCards,len:selCards.length};
    G.selected=[];
    clearTimer();
    SFX.cardPlay();
    if(isHost){
      applyBid(G.mySlot,combo);
    }else{
      // Mark locally to prevent double-submit (host will confirm via state)
      G.bidDone[G.mySlot]=true;
      // Remove bid cards from local hand for immediate visual feedback
      const ids=new Set(combo.cards.map(c=>c.id));
      G.hands[G.mySlot]=G.hands[G.mySlot].filter(c=>!ids.has(c.id));
      feltStackedCards.push({cards:combo.cards,playerName:G.players[G.mySlot].name,isMyPlay:true});
      renderGame();
      setGStat('Kartu 3 dimainkan — menunggu pemain lain...');
      send({type:'game_action',action:'bid',pid:myId,
        combo:{type:combo.type,rank:combo.rank||0,len:combo.len,cards:combo.cards}});
    }
    return;
  }

  const combo=detectCombo(selCards);
  if(!combo||!comboBeats(G.currentCombo,combo))return;

  G.selected=[];
  clearTimer();
  SFX.cardPlay();
  if(isHost){
    applyPlay(G.mySlot,combo);
  }else{
    send({type:'game_action',action:'play',pid:myId,
      combo:{type:combo.type,rank:combo.rank,len:combo.len,cards:combo.cards}});
  }
}

function playerSkip(){
  if(!G||G.phase==='end'||G.current!==G.mySlot)return;
  if(!G.currentCombo)return; // meja kosong — harus main sesuatu
  G.selected=[];
  clearTimer();
  SFX.skip();
  if(isHost){
    applySkip(G.mySlot);
  }else{
    send({type:'game_action',action:'skip',pid:myId});
  }
}

function hostReceiveAction(d){
  if(!isHost)return;
  const pidx=G.players.findIndex(p=>p.id===d.pid);
  if(pidx<0||G.players[pidx].isBot)return;
  if(pidx!==G.current)return;
  if(G.phase==='bid'){
    if(d.action==='bid'){
      // Validate: all cards must be rank 3
      if(d.combo&&d.combo.cards&&d.combo.cards.some(c=>c.val!==3))return;
      // Guard: must be this player's turn and not already bid
      if(G.bidDone[pidx])return;
      if(G.current!==pidx)return;
      applyBid(pidx,d.combo||null);
    }
    return;
  }
  if(d.action==='play'){
    if(comboBeats(G.currentCombo,d.combo)){
      if(G.firstTurn)G.firstTurn=false;
      applyPlay(pidx,d.combo);
    }
  }else if(d.action==='skip'){
    applySkip(pidx);
  }
}
