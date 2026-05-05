// ═══════════════════════════════════════════════════════
// TRECE — audio.js
// SFX Engine (Web Audio API) + Poker Intense BGM + UI
// ═══════════════════════════════════════════════════════
'use strict';

// ══ SOUND ENGINE (Web Audio API) ══
const SFX=(()=>{
  let ctx=null;
  function getCtx(){
    if(!ctx)ctx=new(window.AudioContext||window.webkitAudioContext)();
    if(ctx.state==='suspended')ctx.resume();
    return ctx;
  }
  function play(fn){try{fn(getCtx());}catch(e){}}
  function master(ac,vol=0.55){const g=ac.createGain();g.gain.value=vol;g.connect(ac.destination);return g;}
  function osc(ac,freq,type,dur,vol,dest,t=0){
    const o=ac.createOscillator(),g=ac.createGain();
    o.type=type;o.frequency.value=freq;
    g.gain.setValueAtTime(vol,ac.currentTime+t);
    g.gain.exponentialRampToValueAtTime(0.0001,ac.currentTime+t+dur);
    o.connect(g);g.connect(dest);o.start(ac.currentTime+t);o.stop(ac.currentTime+t+dur);
  }
  function noise(ac,dur,vol,dest,t=0,hpFreq=0){
    const buf=ac.createBuffer(1,ac.sampleRate*dur,ac.sampleRate);
    const d=buf.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    const src=ac.createBufferSource(),g=ac.createGain();
    src.buffer=buf;
    if(hpFreq>0){
      const hp=ac.createBiquadFilter();hp.type='highpass';hp.frequency.value=hpFreq;
      src.connect(hp);hp.connect(g);
    }else{src.connect(g);}
    g.gain.setValueAtTime(vol,ac.currentTime+t);
    g.gain.exponentialRampToValueAtTime(0.0001,ac.currentTime+t+dur);
    g.connect(dest);src.start(ac.currentTime+t);
  }
  // Limiter / compressor untuk seluruh output — cegah clipping
  function masterBus(ac,vol=0.55){
    const comp=ac.createDynamicsCompressor();
    comp.threshold.value=-18;comp.knee.value=6;comp.ratio.value=4;
    comp.attack.value=0.003;comp.release.value=0.12;
    comp.connect(ac.destination);
    const g=ac.createGain();g.gain.value=vol;g.connect(comp);return g;
  }

  // ── Card deal thud: paper slap on felt ──
  // Suara "slap" lembut = transient noise (filtered) + low thud
  // Setiap kartu hanya 1 suara, tidak overlap dengan dirinya sendiri karena volume kecil
  let _lastDealT = 0;
  function cardDeal(){
    play(ac=>{
      const now=ac.currentTime;
      // Debounce: jika dipanggil terlalu cepat (<25ms), skip — mencegah double/stacking
      if(now - _lastDealT < 0.025) return;
      _lastDealT = now;

      const m=masterBus(ac,0.28);
      // Transient "slap" noise — paper on felt
      const buf=ac.createBuffer(1,Math.floor(ac.sampleRate*0.055),ac.sampleRate);
      const d=buf.getChannelData(0);
      for(let i=0;i<d.length;i++){
        // Pink-ish noise with attack shape
        const env=Math.pow(1-i/d.length,2.2);
        d[i]=(Math.random()*2-1)*env;
      }
      const src=ac.createBufferSource();src.buffer=buf;
      // Bandpass: paper sound lives in 800–4000 Hz
      const bp=ac.createBiquadFilter();bp.type='bandpass';bp.frequency.value=1800;bp.Q.value=0.7;
      const g=ac.createGain();
      g.gain.setValueAtTime(0.55,now);
      g.gain.exponentialRampToValueAtTime(0.0001,now+0.055);
      src.connect(bp);bp.connect(g);g.connect(m);
      src.start(now);

      // Subtle low thud (felt/table resonance)
      const lo=ac.createOscillator(),lg=ac.createGain();
      lo.type='sine';lo.frequency.setValueAtTime(110,now);
      lo.frequency.exponentialRampToValueAtTime(55,now+0.06);
      lg.gain.setValueAtTime(0.3,now);
      lg.gain.exponentialRampToValueAtTime(0.0001,now+0.07);
      lo.connect(lg);lg.connect(m);lo.start(now);lo.stop(now+0.07);
    });
  }

  // ── Shuffle: riffle sound ──
  let _lastShufT = 0;
  function shuffle(){
    play(ac=>{
      const now=ac.currentTime;
      if(now - _lastShufT < 0.08) return;
      _lastShufT = now;
      const m=masterBus(ac,0.22);
      // Short noise burst — high-pass filtered (paper riffle character)
      const buf=ac.createBuffer(1,Math.floor(ac.sampleRate*0.09),ac.sampleRate);
      const d=buf.getChannelData(0);
      for(let i=0;i<d.length;i++){
        const env=Math.sin((i/d.length)*Math.PI);
        d[i]=(Math.random()*2-1)*env;
      }
      const src=ac.createBufferSource();src.buffer=buf;
      const hp=ac.createBiquadFilter();hp.type='highpass';hp.frequency.value=2200;
      const g=ac.createGain();
      g.gain.setValueAtTime(0.6,now);
      g.gain.exponentialRampToValueAtTime(0.0001,now+0.09);
      src.connect(hp);hp.connect(g);g.connect(m);
      src.start(now);
    });
  }

  return{
    cardSelect(){play(ac=>{const m=masterBus(ac,0.28);osc(ac,900,'sine',0.06,0.35,m);osc(ac,1200,'sine',0.04,0.12,m,0.025);});},
    cardDeselect(){play(ac=>{const m=masterBus(ac,0.18);osc(ac,680,'sine',0.055,0.25,m);});},
    // Suara deal kartu — paper slap satisfying
    cardDeal,
    // Suara shuffle — riffle
    shuffle,
    cardPlay(){play(ac=>{const m=masterBus(ac,0.42);noise(ac,0.04,0.55,m,0,800);osc(ac,300,'triangle',0.11,0.45,m,0.01);osc(ac,160,'sine',0.16,0.35,m,0.02);});},
    skip(){play(ac=>{const m=masterBus(ac,0.22);const o=ac.createOscillator(),g=ac.createGain();o.type='sine';o.frequency.setValueAtTime(480,ac.currentTime);o.frequency.exponentialRampToValueAtTime(140,ac.currentTime+0.18);g.gain.setValueAtTime(0.38,ac.currentTime);g.gain.exponentialRampToValueAtTime(0.0001,ac.currentTime+0.18);o.connect(g);g.connect(m);o.start();o.stop(ac.currentTime+0.18);});},
    bomb(){play(ac=>{const m=masterBus(ac,0.6);osc(ac,58,'sine',0.5,0.85,m);osc(ac,88,'sawtooth',0.28,0.45,m,0.01);noise(ac,0.12,0.75,m,0,0);osc(ac,750,'square',0.07,0.35,m);osc(ac,1500,'square',0.04,0.18,m,0.01);});},
    yourTurn(){play(ac=>{
      const m=masterBus(ac,0.34);
      const now=ac.currentTime;
      // Dua ping pendek naik — karakter berbeda dari gameStart sweep
      // Ping 1
      const p1=ac.createOscillator(),p1g=ac.createGain();
      p1.type='sine';p1.frequency.value=880;
      p1g.gain.setValueAtTime(0.4,now);p1g.gain.exponentialRampToValueAtTime(0.0001,now+0.14);
      p1.connect(p1g);p1g.connect(m);p1.start(now);p1.stop(now+0.14);
      // Ping 2 — lebih tinggi, semangat
      const p2=ac.createOscillator(),p2g=ac.createGain();
      p2.type='sine';p2.frequency.value=1320;
      p2g.gain.setValueAtTime(0.32,now+0.13);p2g.gain.exponentialRampToValueAtTime(0.0001,now+0.30);
      p2.connect(p2g);p2g.connect(m);p2.start(now+0.13);p2.stop(now+0.30);
    });},
    playerFinish(){play(ac=>{const m=masterBus(ac,0.4);[523,659,784,1047].forEach((f,i)=>osc(ac,f,'sine',0.21,0.38,m,i*0.06));});},
    win(){play(ac=>{const m=masterBus(ac,0.5);[523,659,784,1047,784,1047,1319].forEach((f,i)=>osc(ac,f,'sine',0.26,0.45,m,i*0.1));[330,415,523,659,523,659,880].forEach((f,i)=>osc(ac,f,'triangle',0.16,0.32,m,i*0.1+0.02));});},
    lose(){play(ac=>{const m=masterBus(ac,0.36);[440,392,349,294].forEach((f,i)=>osc(ac,f,'sine',0.28,0.36,m,i*0.12));});},
    pokerBombed(){play(ac=>{const m=masterBus(ac,0.65);noise(ac,0.18,0.95,m,0,0);osc(ac,52,'sine',0.6,0.85,m);osc(ac,105,'sawtooth',0.38,0.5,m,0.05);[750,550,370,180].forEach((f,i)=>osc(ac,f,'square',0.1,0.28,m,i*0.06));});},
    newRound(){play(ac=>{const m=masterBus(ac,0.28);const o=ac.createOscillator(),g=ac.createGain();o.type='sine';o.frequency.setValueAtTime(200,ac.currentTime);o.frequency.exponentialRampToValueAtTime(500,ac.currentTime+0.22);g.gain.setValueAtTime(0.0001,ac.currentTime);g.gain.linearRampToValueAtTime(0.48,ac.currentTime+0.05);g.gain.exponentialRampToValueAtTime(0.0001,ac.currentTime+0.22);o.connect(g);g.connect(m);o.start();o.stop(ac.currentTime+0.22);});},
    // gameStart: swoosh + warm thud — satu suara bersih, tidak bentrok dengan yourTurn
    gameStart(){play(ac=>{
      const m=masterBus(ac,0.52);
      const now=ac.currentTime;

      // 1) Swoosh naik — pitch sweep dari rendah ke tinggi
      const sw=ac.createOscillator(),swg=ac.createGain();
      sw.type='sine';
      sw.frequency.setValueAtTime(160,now);
      sw.frequency.exponentialRampToValueAtTime(1400,now+0.38);
      swg.gain.setValueAtTime(0.0001,now);
      swg.gain.linearRampToValueAtTime(0.55,now+0.06);
      swg.gain.exponentialRampToValueAtTime(0.0001,now+0.38);
      sw.connect(swg);swg.connect(m);sw.start(now);sw.stop(now+0.38);

      // 2) Harmonic bawah — beri body
      const sw2=ac.createOscillator(),sw2g=ac.createGain();
      sw2.type='triangle';
      sw2.frequency.setValueAtTime(120,now);
      sw2.frequency.exponentialRampToValueAtTime(900,now+0.38);
      sw2g.gain.setValueAtTime(0.0001,now);
      sw2g.gain.linearRampToValueAtTime(0.22,now+0.08);
      sw2g.gain.exponentialRampToValueAtTime(0.0001,now+0.38);
      sw2.connect(sw2g);sw2g.connect(m);sw2.start(now);sw2.stop(now+0.38);

      // 3) Impact thud saat sweep peak
      const th=ac.createOscillator(),thg=ac.createGain();
      th.type='sine';
      th.frequency.setValueAtTime(220,now+0.34);
      th.frequency.exponentialRampToValueAtTime(55,now+0.72);
      thg.gain.setValueAtTime(0.0001,now+0.34);
      thg.gain.linearRampToValueAtTime(0.7,now+0.36);
      thg.gain.exponentialRampToValueAtTime(0.0001,now+0.72);
      th.connect(thg);thg.connect(m);th.start(now+0.34);th.stop(now+0.72);

      // 4) Sparkle noise singkat saat puncak
      const buf=ac.createBuffer(1,Math.floor(ac.sampleRate*0.08),ac.sampleRate);
      const bd=buf.getChannelData(0);
      for(let i=0;i<bd.length;i++){const env=Math.sin((i/bd.length)*Math.PI);bd[i]=(Math.random()*2-1)*env;}
      const sp=ac.createBufferSource(),spf=ac.createBiquadFilter(),spg=ac.createGain();
      sp.buffer=buf;spf.type='highpass';spf.frequency.value=4000;
      spg.gain.setValueAtTime(0.18,now+0.34);spg.gain.exponentialRampToValueAtTime(0.0001,now+0.42);
      sp.connect(spf);spf.connect(spg);spg.connect(m);sp.start(now+0.34);
    });},
    ready(){play(ac=>{const m=masterBus(ac,0.32);osc(ac,660,'sine',0.12,0.36,m);osc(ac,880,'sine',0.1,0.32,m,0.08);});},
    timerWarn(){play(ac=>{const m=masterBus(ac,0.26);osc(ac,440,'square',0.055,0.26,m);});},
    timerTick(){play(ac=>{const m=masterBus(ac,0.22);osc(ac,580,'square',0.038,0.35,m);});}
  };
})();

// ══ POKER INTENSE BACKSOUND ══
// Backsound loop menegangkan tapi halus saat ada Poker (angka 2) di meja
const PokerIntenseBGM = (()=>{
  let ctx2 = null;
  let gainNode = null;
  let nodes = [];
  let running = false;
  let _fadeTimer = null;

  function getCtx(){
    if(!ctx2) ctx2 = new(window.AudioContext||window.webkitAudioContext)();
    if(ctx2.state==='suspended') ctx2.resume();
    return ctx2;
  }

  function start(){
    if(running) return;
    running = true;
    if(_fadeTimer){ clearTimeout(_fadeTimer); _fadeTimer=null; }

    const ac = getCtx();
    const masterG = ac.createGain();
    masterG.gain.setValueAtTime(0, ac.currentTime);
    masterG.gain.linearRampToValueAtTime(0.20, ac.currentTime + 1.2); // versi pertama 0.28, dikecilkan sedikit
    masterG.connect(ac.destination);
    gainNode = masterG;

    const comp = ac.createDynamicsCompressor();
    comp.threshold.value=-18; comp.knee.value=6; comp.ratio.value=4;
    comp.attack.value=0.003; comp.release.value=0.12;
    comp.connect(masterG);

    // 1) Bass drone — sawtooth mendebarkan
    const bass = ac.createOscillator();
    const bassG = ac.createGain();
    bass.type = 'sawtooth';
    bass.frequency.setValueAtTime(55, ac.currentTime);
    const lfo = ac.createOscillator();
    const lfoG = ac.createGain();
    lfo.frequency.value = 0.22;
    lfoG.gain.value = 3.5;
    lfo.connect(lfoG); lfoG.connect(bass.frequency);
    lfo.start();
    bassG.gain.value = 0.55;
    bass.connect(bassG); bassG.connect(comp);
    bass.start();

    // 2) Mid distorted pad — gelap
    const pad = ac.createOscillator();
    const padG = ac.createGain();
    pad.type = 'square';
    pad.frequency.value = 110;
    padG.gain.value = 0.12;
    const padLP = ac.createBiquadFilter();
    padLP.type = 'lowpass'; padLP.frequency.value = 320;
    pad.connect(padLP); padLP.connect(padG); padG.connect(comp);
    pad.start();

    // 3) Heartbeat — thump-thump
    let beatInterval = null;
    const beatBuf = ac.createBuffer(1, Math.floor(ac.sampleRate*0.08), ac.sampleRate);
    const bd = beatBuf.getChannelData(0);
    for(let i=0;i<bd.length;i++){
      const env = Math.pow(1-i/bd.length, 3);
      bd[i] = (Math.random()*2-1)*env;
    }
    function playBeat(){
      if(!running) return;
      try{
        const src = ac.createBufferSource();
        src.buffer = beatBuf;
        const g = ac.createGain();
        const lp = ac.createBiquadFilter();
        lp.type='lowpass'; lp.frequency.value=180;
        g.gain.setValueAtTime(0.7, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime+0.08);
        src.connect(lp); lp.connect(g); g.connect(comp);
        src.start();
      }catch(e){}
    }
    playBeat();
    let beatPhase = 0;
    beatInterval = setInterval(()=>{
      if(!running){ clearInterval(beatInterval); return; }
      beatPhase++;
      if(beatPhase%2===0) playBeat();
      else setTimeout(playBeat, 220);
    }, 900);

    // 4) High tension string tremolo
    const str = ac.createOscillator();
    const strG = ac.createGain();
    str.type = 'triangle';
    str.frequency.value = 220;
    const trem = ac.createOscillator();
    const tremG = ac.createGain();
    trem.frequency.value = 7;
    tremG.gain.value = 0.08;
    trem.connect(tremG); tremG.connect(strG.gain);
    strG.gain.value = 0.09;
    trem.start();
    const strLP = ac.createBiquadFilter();
    strLP.type = 'lowpass'; strLP.frequency.value = 800;
    str.connect(strLP); strLP.connect(strG); strG.connect(comp);
    str.start();

    nodes = [bass, lfo, pad, str, trem, beatInterval, masterG, comp];
  }

  function stop(){
    if(!running) return;
    running = false;
    if(gainNode){
      try{
        const ac2 = getCtx();
        gainNode.gain.setValueAtTime(gainNode.gain.value, ac2.currentTime);
        gainNode.gain.linearRampToValueAtTime(0, ac2.currentTime + 1.5);
      }catch(e){}
    }
    _fadeTimer = setTimeout(()=>{
      nodes.forEach(n=>{
        try{
          if(typeof n === 'number') clearInterval(n);
          else if(n && n.stop) n.stop();
          else if(n && n.disconnect) n.disconnect();
        }catch(e){}
      });
      nodes = [];
      gainNode = null;
    }, 1600);
  }

  return { start, stop };
})();

// ══ POKER INTENSE UI ══
let _pokerIntenseActive = false;

function activatePokerIntense(){
  if(_pokerIntenseActive) return;
  _pokerIntenseActive = true;
  document.getElementById('pokerIntenseOverlay').classList.add('active');
  document.getElementById('pokerIntenseScanlines').classList.add('active');
  document.getElementById('pokerWarnBanner').classList.add('active');
  document.getElementById('felt').classList.add('poker-intense');
  document.getElementById('gameWrap').classList.add('poker-shake-loop');
  PokerIntenseBGM.start();
}

function deactivatePokerIntense(){
  if(!_pokerIntenseActive) return;
  _pokerIntenseActive = false;
  document.getElementById('pokerIntenseOverlay').classList.remove('active');
  document.getElementById('pokerIntenseScanlines').classList.remove('active');
  document.getElementById('pokerWarnBanner').classList.remove('active');
  document.getElementById('felt').classList.remove('poker-intense');
  document.getElementById('gameWrap').classList.remove('poker-shake-loop');
  PokerIntenseBGM.stop();
}
