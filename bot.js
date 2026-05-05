// ═══════════════════════════════════════════════════════
// TRECE — bot.js
// Bot AI — Advanced Strategic Engine
// ═══════════════════════════════════════════════════════
'use strict';

// ══ BOT AI — ADVANCED STRATEGIC ENGINE v2 ══
// Filosofi:
//  • Setiap bot punya "persona" strategis berbeda (agresif / konservatif / adaptif)
//  • Baca situasi: track kartu lawan, tekanan, fase permainan
//  • Simpan kartu kuat; gunakan kartu kecil efisien di awal
//  • Variasi strategi: tidak mudah ditebak, tapi tetap adil
//  • Bomb hanya untuk situasi kritis; jangan buang sembarangan

// ── Persona Bot (diinisialisasi saat game mulai) ──
// Setiap bot dapat persona acak yang mempengaruhi gaya bermain
let _botPersona = {};

function initBotPersonas(players){
  _botPersona = {};
  const styles = ['aggressive','conservative','adaptive','opportunist'];
  players.forEach((p,i)=>{
    if(p.isBot){
      // Randomly assign a style; shuffle ensures bots differ from each other
      _botPersona[i] = styles[(i + Math.floor(Math.random()*styles.length)) % styles.length];
    }
  });
}

function getBotPersona(idx){
  return _botPersona[idx] || 'adaptive';
}

function getCombos(arr,k){
  if(k>arr.length)return[];if(k===arr.length)return[arr];if(k===1)return arr.map(x=>[x]);
  const res=[];for(let i=0;i<=arr.length-k;i++){for(const r of getCombos(arr.slice(i+1),k-1))res.push([arr[i],...r]);}
  return res;
}

// Hitung semua kombinasi valid dari tangan
function getAllCombos(hand){
  const all=[];
  const n=hand.length;
  for(const c of hand){all.push({type:'single',rank:crank(c),cards:[c],len:1});}
  for(let k=2;k<=4;k++){
    for(const sub of getCombos(hand,k)){
      const c=detectCombo(sub);
      if(c)all.push(c);
    }
  }
  for(let k=3;k<=6;k++){
    if(k>n)break;
    for(const sub of getCombos(hand,k)){
      const c=detectCombo(sub);
      if(c&&(c.type==='seri'||c.type==='polo_seri'||c.type==='polo_pair'||c.type==='bomb_seri'))all.push(c);
    }
  }
  return all;
}

function cardValue(c){
  return VORD[c.val]*4+c.suit;
}

function handPotential(hand){
  const combos=getAllCombos(hand);
  let score=0;
  for(const c of combos){
    if(c.type==='bomb_polo')score+=50;
    else if(c.type==='bomb_seri')score+=60;
    else if(c.type==='polo_seri')score+=20;
    else if(c.type==='polo_pair')score+=18;
    else if(c.type==='seri')score+=c.len*3;
    else if(c.type==='triple')score+=8;
    else if(c.type==='double')score+=3;
  }
  return score;
}

function hasPokerCard(hand){return hand.some(c=>c.val===2);}

function hasBomb(hand){
  for(const sub of getCombos(hand,4)){const c=detectCombo(sub);if(c&&c.type==='bomb_polo')return true;}
  for(const sub of getCombos(hand,5)){const c=detectCombo(sub);if(c&&c.type==='bomb_seri')return true;}
  return false;
}

// Hitung minimum kartu lawan aktif (tekanan)
function opponentPressure(G,myIdx){
  if(!G)return 0;
  let minCards=13;
  for(let i=0;i<4;i++){
    if(i===myIdx||G.finished.includes(i))continue;
    minCards=Math.min(minCards,G.hands[i].length);
  }
  if(minCards<=2)return 3;
  if(minCards<=4)return 2;
  if(minCards<=6)return 1;
  return 0;
}

// Estimasi "ancaman" dari pemain tertentu (makin sedikit kartu = ancaman tinggi)
function threatLevel(G, pidx){
  if(!G||G.finished.includes(pidx))return 0;
  const n=G.hands[pidx].length;
  if(n<=2)return 4;
  if(n<=4)return 3;
  if(n<=6)return 2;
  if(n<=9)return 1;
  return 0;
}

// Apakah bot (myIdx) sedang dalam posisi yang berpotensi menang (kartu sedikit)?
function isWinningPosition(hand, G, myIdx){
  if(hand.length<=3)return true;
  // Am I the player with fewest cards?
  let myCount=hand.length, minOther=13;
  for(let i=0;i<4;i++){
    if(i===myIdx||G.finished.includes(i))continue;
    minOther=Math.min(minOther,G.hands[i].length);
  }
  return myCount<minOther;
}

// Skor combo berdasarkan persona bot
function scoreCombo(combo, hand, curCombo, pressure, persona){
  let score=0;
  persona = persona||'adaptive';

  // Utama: lebih banyak kartu dibuang = lebih baik
  score += combo.len * 20;

  const avgRank = combo.cards.reduce((s,c)=>s+cardValue(c),0)/combo.len;

  // Persona: aggressive — suka mainkan kartu tinggi, kendalikan meja
  // conservative — hemat kartu kuat, buang kartu kecil dulu
  // adaptive — seimbang, baca situasi
  // opportunist — mainkan combo besar kalau bisa habiskan banyak
  if(persona==='aggressive'){
    // Sedikit lebih rela pakai kartu kuat untuk kontrol meja
    score -= avgRank * 0.4;
    if(combo.type==='triple'||combo.type==='polo_pair')score+=10;
  } else if(persona==='conservative'){
    // Hindari pakai kartu kuat kecuali perlu
    score -= avgRank * 1.1;
    if(combo.cards.some(c=>cardValue(c)>30))score-=15;
  } else if(persona==='opportunist'){
    // Fokus habiskan banyak kartu sekaligus
    score += combo.len * 10;
    score -= avgRank * 0.6;
  } else {
    // adaptive: standar
    score -= avgRank * 0.8;
  }

  // Bonus habiskan semua kartu
  if(combo.len===hand.length) score+=300;

  // Penalti Bomb kecuali situasi tepat
  if(combo.type==='bomb_polo'||combo.type==='bomb_seri'){
    if(hand.length>5&&pressure<2) score-=130;
    else if(pressure>=3) score+=40;
    else if(pressure>=2) score+=20;
    else score-=70;
    // Aggressive bots sedikit lebih mau pakai bomb
    if(persona==='aggressive'&&pressure>=2)score+=25;
  }

  if(combo.type==='seri') score+=combo.len*5;
  if(combo.type==='polo_seri') score+=15;
  if(combo.type==='polo_pair') score+=14;

  if(combo.type==='triple'){
    const hasOtherBig=hand.filter(c=>!combo.cards.includes(c)).length>=4;
    if(!hasOtherBig)score-=12;
  }

  // Penalti kartu 2 (poker) kecuali mau habis
  if(combo.cards.some(c=>c.val===2)&&hand.length>3){
    score -= (persona==='aggressive') ? 30 : 55;
  }

  // Bonus kecil untuk variasi: sedikit noise acak agar pola tidak mudah ditebak
  score += (Math.random()-0.5)*6;

  return score;
}

// Putuskan apakah bot harus SKIP
function shouldSkip(hand, curCombo, cands, G, myIdx, persona){
  if(!curCombo)return false;
  if(!cands.length)return true;
  persona=persona||'adaptive';

  const pressure=opponentPressure(G,myIdx);
  const winning=isWinningPosition(hand,G,myIdx);

  // Kalau tangan hampir habis, jangan skip
  if(hand.length<=3)return false;
  if(pressure>=3)return false;

  // Kalau sedang menang (kartu paling sedikit), jangan skip sembarangan
  if(winning&&hand.length<=5)return false;

  const best=cands.slice().sort((a,b)=>scoreCombo(b,hand,curCombo,pressure,persona)-scoreCombo(a,hand,curCombo,pressure,persona))[0];

  if(isBomb(best)&&hand.length>4&&pressure<2)return true;

  const handAfter=hand.filter(c=>!best.cards.some(bc=>bc.id===c.id));
  const potBefore=handPotential(hand);
  const potAfter=handPotential(handAfter);

  // Conservative: lebih rela skip untuk jaga tangan
  const skipThreshold = persona==='conservative' ? 25 : persona==='aggressive' ? 55 : 40;
  if(potBefore-potAfter>skipThreshold&&pressure<1&&hand.length>7)return true;

  if(best.type==='single'&&best.cards[0].val===2&&hand.length>4&&pressure<2)return true;

  // Opportunist: skip kalau hanya bisa mainkan single kartu biasa saat meja ramai
  if(persona==='opportunist'&&best.type==='single'&&best.len===1&&hand.length>6&&pressure<1){
    // Skip 30% of the time to wait for better opening
    if(Math.random()<0.30)return true;
  }

  // Aggressive: lebih jarang skip, suka kontrol meja
  if(persona==='aggressive'&&pressure>=1)return false;

  return false;
}

function botDecide(hand, curCombo, isFirstTurn, firstCard, G, myIdx){
  const h=srtH(hand);
  const pressure=G?opponentPressure(G,myIdx):0;
  const persona=getBotPersona(myIdx);

  if(!curCombo){
    return botOpenTable(h, G, myIdx, pressure, persona);
  }

  if(isPokerCombo(curCombo)){
    // Bomb hanya bisa melawan poker SINGLE
    if(isSinglePoker(curCombo)){
      const bomb=findBestBomb(h,curCombo);
      if(bomb)return bomb;
      return null; // tidak ada bomb, skip
    }
    // Poker double/triple: Bomb tidak boleh dipakai, tapi combo normal tetap bisa melawan
    // Lanjut ke logic normal di bawah (filter cands pakai comboBeats yang sudah diblock bombnya)
  }

  const allCombos=getAllCombos(h);
  const cands=allCombos.filter(c=>comboBeats(curCombo,c));

  if(shouldSkip(h,curCombo,cands,G,myIdx,persona))return null;
  if(!cands.length)return null;

  // Strategi kontekstual berdasarkan persona
  cands.sort((a,b)=>scoreCombo(b,h,curCombo,pressure,persona)-scoreCombo(a,h,curCombo,pressure,persona));

  // Kalau aggressive & ada combo yang beat dengan margin tipis, coba pakai combo lebih besar untuk "menindas"
  if(persona==='aggressive'&&pressure>=2&&cands.length>1){
    // 40% chance pilih combo kedua (lebih dominan)
    if(Math.random()<0.40)return cands[Math.min(1,cands.length-1)];
  }

  return cands[0];
}

// Buka meja dengan strategi
function botOpenTable(hand, G, myIdx, pressure, persona){
  const n=hand.length;
  persona=persona||'adaptive';

  if(n<=4){
    const allC=getAllCombos(hand);
    const finish=allC.filter(c=>c.len===n);
    if(finish.length){
      finish.sort((a,b)=>b.len-a.len);
      return finish[0];
    }
    allC.sort((a,b)=>b.len-a.len);
    return allC[0];
  }

  const allC=getAllCombos(hand);
  const nonBombs=allC.filter(c=>!isBomb(c));
  const pool=nonBombs.length?nonBombs:allC;

  pool.sort((a,b)=>scoreCombo(b,hand,null,pressure,persona)-scoreCombo(a,hand,null,pressure,persona));

  const topN = persona==='opportunist' ? 7 : 5;
  const top=pool.slice(0,topN);

  let best=top[0];
  let bestScore=-Infinity;
  for(const c of top){
    const after=hand.filter(h=>!c.cards.some(cc=>cc.id===h.id));
    const pot=handPotential(after);
    // Persona influences how much weight is given to future potential
    const potWeight = persona==='conservative' ? 0.5 : persona==='aggressive' ? 0.15 : 0.3;
    const s=scoreCombo(c,hand,null,pressure,persona)+pot*potWeight;
    if(s>bestScore){bestScore=s;best=c;}
  }

  // Opportunist: occasionally open with a big combo to surprise
  if(persona==='opportunist'&&pressure>=1&&Math.random()<0.25){
    const bigCombos=pool.filter(c=>c.len>=3&&!isBomb(c));
    if(bigCombos.length)return bigCombos[0];
  }

  return best;
}

// Cari Bomb terbaik untuk lawan Poker
function findBestBomb(hand,curCombo){
  const bombs=[];
  for(const sub of getCombos(hand,4)){
    const c=detectCombo(sub);
    if(c&&c.type==='bomb_polo'&&comboBeats(curCombo,c))bombs.push(c);
  }
  for(const sub of getCombos(hand,5)){
    const c=detectCombo(sub);
    if(c&&c.type==='bomb_seri'&&comboBeats(curCombo,c))bombs.push(c);
  }
  if(!bombs.length)return null;
  bombs.sort((a,b)=>a.rank-b.rank);
  return bombs[0];
}
