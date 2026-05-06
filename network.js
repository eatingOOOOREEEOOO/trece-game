// ═══════════════════════════════════════════════════════
// TRECE — network.js
// Ably multiplayer: room, lobby, sync, messaging
// ═══════════════════════════════════════════════════════
'use strict';

// ══ NETWORK ══
let ably=null,chan=null,myId='',myName='',roomCode='',isHost=false;
let lobbyPlayers=[];  // always 4 entries
let readyPlayers=new Set(); // ids of players who are ready
let myReady=false;
let gameHasStarted=false; // tracks if at least one game has been played

function genCode(){const c='ABCDEFGHJKLMNPQRSTUVWXYZ';return Array.from({length:4},()=>c[0|Math.random()*c.length]).join('');}
function genId(){return'p'+Math.random().toString(36).slice(2,10);}

function setA(m,err=false){
  const el=document.getElementById('lstA');
  el.textContent=m;el.className='lstat'+(err?' err':'');
}
function setB(m){document.getElementById('lstB').textContent=m;}

function validateInputs(){
  myName=document.getElementById('uname').value.trim();
  if(myName.length<2){setA('⚠ Username minimal 2 karakter!',true);return null;}
  return true;
}

function fetchAblyKey(cb){
  cb('NZMaLg.vHk4fw:FOBMrAp7bdoNYAGJKAKxnmuvPF4OdBPwlXB-191Eixo');
}

function initAbly(key,cb){
  try{
    // Detect iOS
    const isIOS=/iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.MSStream;
    const isAndroid=/Android/.test(navigator.userAgent);
    const isMobile=isIOS||isAndroid;

    // iOS WebKit struggles with native WebSocket in some network conditions.
    // Force fallback transports: try web_socket first, then xhr_streaming, then xhr_polling.
    const opts={
      key,
      clientId:myId,
      // On mobile prefer xhr fallbacks so connection always works
      transports: isMobile
        ? ['web_socket','xhr_streaming','xhr_polling']
        : ['web_socket','xhr_streaming','xhr_polling'],
      // Shorter timeouts so failure is detected quickly
      realtimeRequestTimeout: 10000,
      connectTimeout: 15000,
      disconnectedRetryTimeout: 3000,
      // Needed for iOS background/foreground transitions
      closeOnUnload: false,
    };

    ably=new Ably.Realtime(opts);

    let cbCalled=false;
    let connTimeout=setTimeout(()=>{
      if(!cbCalled){
        setA('⚠ Koneksi timeout — coba lagi atau ganti jaringan',true);
        try{ably.close();}catch(e){}
      }
    },18000);

    ably.connection.on('connected',()=>{
      if(cbCalled)return;
      cbCalled=true;
      clearTimeout(connTimeout);
      cb();
    });

    ably.connection.on('failed',()=>{
      clearTimeout(connTimeout);
      setA('⚠ API Key tidak valid atau koneksi gagal',true);
    });

    ably.connection.on('suspended',()=>{
      setA('⚠ Koneksi tertangguhkan — mencoba ulang...',false);
    });

    ably.connection.on('disconnected',()=>{
      // Only show error if cb already called (was connected before)
      if(cbCalled)setA('⚠ Koneksi terputus — mencoba ulang...',false);
    });

    // iOS: reconnect when app comes back to foreground
    document.addEventListener('visibilitychange',()=>{
      if(document.visibilityState==='visible'&&ably){
        try{
          if(ably.connection.state==='suspended'||ably.connection.state==='disconnected'){
            ably.connect();
          }
        }catch(e){}
      }
    });

  }catch(e){setA('⚠ Error: '+e.message,true);}
}

// ══ PRESENCE: masuk & pantau keluar (dipanggil setelah channel siap) ══
function setupPresence(){
  if(!chan)return;
  chan.presence.enter({id:myId,name:myName}).catch(()=>{});
  chan.presence.subscribe('leave',(member)=>{
    if(!isHost)return;
    const leftId=member.clientId;
    if(!leftId||leftId===myId)return;
    const inLobby=lobbyPlayers.find(p=>p.id===leftId&&!p.isBot);
    if(!inLobby)return;
    if(G&&G.phase!=='end'){
      handlePlayerDisconnectInGame(leftId);
    }else{
      readyPlayers.delete(leftId);
      const rp=lobbyPlayers.filter(p=>p.id!==leftId&&!p.isBot);
      rebuildLobby(rp);
      broadcastLobby();
      renderSlots();
      checkAllReady();
      setB(`⚠ ${inLobby.name} keluar dari room.`);
    }
  });
}

// ══ Handle pemain disconnect saat game berjalan (host only) ══
function handlePlayerDisconnectInGame(leftId){
  if(!G||!isHost)return;
  const pidx=G.players.findIndex(p=>p.id===leftId);
  if(pidx<0)return;
  const leftName=G.players[pidx].name;
  const usedNames=G.players.map(p=>p.name);
  const botName=BOT_NAMES.find(n=>!usedNames.includes(n))||'Bot';
  G.players[pidx]={id:'bot_dc_'+pidx,name:botName,isBot:true};
  const lpIdx=lobbyPlayers.findIndex(p=>p.id===leftId);
  if(lpIdx>=0)lobbyPlayers[lpIdx]={id:'bot_dc_'+pidx,name:botName,isBot:true};
  readyPlayers.delete(leftId);
  showNotif(`⚠ ${leftName} disconnect — digantikan bot ${botName}`);
  setGStat(`${leftName} terputus — bot mengambil alih`);
  // Roster berubah (real player diganti bot) — batalkan logika rematch skip-bid
  _prevRoundWinnerSlot = -1;
  _prevRoundPlayerIds  = [];
  if(G.current===pidx&&G.phase==='play'){
    clearTimer();
    setTimeout(()=>{if(G&&G.phase!=='end'&&G.current===pidx)doBotTurn(pidx);},800);
  }else if(G.current===pidx&&G.phase==='bid'){
    clearTimer();
    setTimeout(()=>{if(G&&G.phase==='bid'&&!G.bidDone[pidx])applyBid(pidx,null);},500);
  }
  bcastState();
  renderGame();
}


function rebuildLobby(realPlayers){
  lobbyPlayers=realPlayers.slice(); // copy real players
  const botCount=4-lobbyPlayers.length;
  for(let i=0;i<botCount;i++){
    lobbyPlayers.push({id:'bot'+i,name:BOT_NAMES[i],isBot:true});
  }
}

function showJoinForm(){document.getElementById('joinWrap').style.display='block';}

function doCreate(){
  if(!validateInputs())return;
  myId=genId();isHost=true;roomCode=genCode();
  setA('Menghubungkan...');
  fetchAblyKey(key=>{
    initAbly(key,()=>{
      chan=ably.channels.get('trece-'+roomCode);
      chan.subscribe(msg=>window.handleMsg(msg));
      setupPresence();
      rebuildLobby([{id:myId,name:myName,isBot:false}]);
      broadcastLobby();
      showStepB();
    });
  });
}

function doJoin(){
  if(!validateInputs())return;
  const code=document.getElementById('joinCode').value.trim().toUpperCase();
  if(code.length!==4){setA('⚠ Kode harus 4 huruf',true);return;}
  myId=genId();isHost=false;roomCode=code;
  setA('Bergabung...');
  fetchAblyKey(key=>{
    initAbly(key,()=>{
      chan=ably.channels.get('trece-'+roomCode);
      chan.subscribe(msg=>window.handleMsg(msg));
      setupPresence();
      setTimeout(()=>{
        send({type:'join_req',id:myId,name:myName});
        setA('Menunggu host...');
      },600);
      setTimeout(()=>{
        if(document.getElementById('stepB').style.display==='none')
          setA('⚠ Room tidak ditemukan atau sudah dimulai',true);
      },7000);
    });
  });
}

function doLeave(){
  send({type:'leave',id:myId});
  if(chan)chan.presence.leave().catch(()=>{});
  if(ably)ably.close();
  location.reload();
}

function showStepB(isReturnToLobby=false){
  document.getElementById('stepA').style.display='none';
  document.getElementById('stepB').style.display='block';
  document.getElementById('rcodeDisp').textContent=roomCode;
  renderSlots();
  if(isReturnToLobby){
    // Post-game: show ready button for all, start only for host
    document.getElementById('roomHint').textContent='Main lagi? Tekan Siap!';
    document.getElementById('btnReady').style.display='block';
    const btnReady=document.getElementById('btnReady');
    btnReady.className='btn btn-ready';
    btnReady.textContent='✓ SIAP MAIN';
    btnReady.disabled=false;
    myReady=false;
    if(isHost){
      document.getElementById('btnStart').style.display='block';
      document.getElementById('btnStart').disabled=true;
      setB('Tunggu semua pemain siap...');
    }else{
      document.getElementById('btnStart').style.display='none';
      setB('Tunggu semua pemain siap dan host mulai...');
    }
  }else{
    // First time lobby
    document.getElementById('roomHint').textContent='Bagikan kode ini ke teman';
    document.getElementById('btnReady').style.display='none';
    if(isHost){
      document.getElementById('btnStart').style.display='block';
      document.getElementById('btnStart').disabled=false;
      setB('Menunggu pemain... (bot mengisi slot kosong)');
    }else{
      document.getElementById('btnStart').style.display='none';
      setB('Menunggu host memulai game...');
    }
  }
}

function renderSlots(){
  document.getElementById('pslots').innerHTML=lobbyPlayers.map((p,i)=>{
    const isReadyP=p.isBot?true:readyPlayers.has(p.id);
    const readyCls=(gameHasStarted&&isReadyP)?' ready':'';
    const chipData = chipSession[p.id];
    const chipHtml = (chipData && !p.isBot)
      ? (() => {
          const chips = chipData.chips;
          const col = chips < 0 ? ' style="color:#e74c3c"' : '';
          return `<div class="slot-chips"${col}>💰 ${chips.toLocaleString()}</div>`;
        })()
      : '';
    return `<div class="pslot${!p.isBot?' filled':''}${readyCls}">
      <div class="slot-av">${p.isBot?'🤖':p.name[0].toUpperCase()}</div>
      <div class="slot-info">
        <div class="slot-nm${p.isBot?' slot-bot':''}">${p.name}</div>
        ${p.id===myId?'<div class="slot-you">KAMU</div>':''}
        ${p.isBot?'<div style="font-size:7px;color:rgba(212,168,67,0.25);font-family:\'JetBrains Mono\',monospace">bot</div>':''}
        ${chipHtml}
      </div>
      ${gameHasStarted&&isReadyP?'<div class="slot-ready-badge">✓ SIAP</div>':''}
    </div>`;
  }).join('');
}

function send(data){if(chan)chan.publish('m',JSON.stringify(data));}

function broadcastLobby(){
  const realPlayers=lobbyPlayers.filter(p=>!p.isBot);
  send({type:'lobby',realPlayers,readyIds:[...readyPlayers],gameHasStarted});
}

function handleMsg(msg){
  let d;
  try{d=JSON.parse(msg.data);}catch{return;}

  // Ignore own messages for lobby events (Ably echoes to self too)
  switch(d.type){
    case 'join_req': {
      if(!isHost)break;
      const realPlayers=lobbyPlayers.filter(p=>!p.isBot);
      if(realPlayers.length>=4){
        send({type:'join_denied',tid:d.id,reason:'Room penuh (4/4)'});
        break;
      }
      // Add new real player, rebuilding with bots
      realPlayers.push({id:d.id,name:d.name,isBot:false});
      rebuildLobby(realPlayers);
      broadcastLobby();
      renderSlots();
      // Roster berubah — batalkan logika rematch skip-bid
      _prevRoundWinnerSlot = -1;
      _prevRoundPlayerIds  = [];
      break;
    }
    case 'join_denied':
      if(d.tid===myId)setA('⚠ '+d.reason,true);
      break;
    case 'lobby': {
      // Non-host receives real players list and rebuilds
      if(isHost)break;
      const rp=d.realPlayers||[];
      rebuildLobby(rp);
      // sync ready state
      if(d.readyIds)readyPlayers=new Set(d.readyIds);
      if(d.gameHasStarted!==undefined)gameHasStarted=d.gameHasStarted;
      const isMeIn=lobbyPlayers.find(p=>p.id===myId);
      if(isMeIn&&document.getElementById('stepB').style.display==='none')showStepB(gameHasStarted);
      else renderSlots();
      break;
    }
    case 'leave': {
      if(!isHost)break;
      const rp=lobbyPlayers.filter(p=>p.id!==d.id&&!p.isBot);
      // remove from ready
      readyPlayers.delete(d.id);
      rebuildLobby(rp);
      broadcastLobby();
      renderSlots();
      checkAllReady();
      // Roster berubah — batalkan logika rematch skip-bid
      _prevRoundWinnerSlot = -1;
      _prevRoundPlayerIds  = [];
      break;
    }
    case 'player_ready': {
      readyPlayers.add(d.id);
      renderSlots();
      if(isHost){
        broadcastLobby();
        checkAllReady();
      }
      break;
    }
    case 'play_again': {
      // Non-host: return to lobby in same room
      if(!isHost){
        gameHasStarted=true;
        readyPlayers=new Set(d.readyIds||[]);
        rebuildLobby(d.realPlayers||[]);
        if(d.chipSession) chipSession = d.chipSession;
        // Simpan rematch state dari host
        if(d.prevWinnerSlot !== undefined) _prevRoundWinnerSlot = d.prevWinnerSlot;
        if(d.prevPlayerIds  !== undefined) _prevRoundPlayerIds  = d.prevPlayerIds;
        returnToLobby();
      }
      break;
    }
    case 'bet_set': {
      // Non-host receives the bet amount set by host
      if(!isHost){
        currentBet = d.bet;
      }
      break;
    }
    case 'chip_result': {
      // Non-host: receive resolved chip session from host
      if(!isHost){
        if(d.chipSession) chipSession = d.chipSession;
        // Show float animation for local player
        if(G && d.finished){
          const myPidx = d.finished.indexOf(G.mySlot);
          if(myPidx >= 0 && currentBet > 0){
            const myDelta = CHIP_RANK_DELTA[myPidx] * currentBet;
            setTimeout(()=>showChipFloat(myDelta), 400);
            updateChipHud();
          }
          // Rebuild end modal with chip recap
          setTimeout(()=>{
            const deltas = d.deltas || {};
            const chipRecapHtml = buildChipRecap(d.finished, G.players, deltas, G.mySlot);
            const modal = document.querySelector('#endModal .modal');
            if(modal){
              // Inject recap after rlist
              const existing = modal.querySelector('.chip-recap');
              if(!existing){
                const rlist = modal.querySelector('.rlist');
                if(rlist){
                  const div = document.createElement('div');
                  div.innerHTML = chipRecapHtml;
                  rlist.after(div.firstChild);
                }
              }
            }
          }, 600);
        }
      }
      break;
    }
    case 'game_start':
      receiveStart(d);
      break;
    case 'game_action':
      if(isHost)hostReceiveAction(d);
      break;
    case 'game_state':
      if(!isHost)receiveState(d.state);
      break;
  }
}
