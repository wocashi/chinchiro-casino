// ── DICE FACES ──
const FACES = ['','⚀','⚁','⚂','⚃','⚄','⚅'];

// ── WEB AUDIO ──
let audioCtx = null;
function getAudioCtx(){
  if(!audioCtx) audioCtx=new(window.AudioContext||window.webkitAudioContext)();
  if(audioCtx.state==='suspended') audioCtx.resume();
  return audioCtx;
}
let _noiseBuf=null;
function getNoiseBuf(ctx){
  if(_noiseBuf) return _noiseBuf;
  const len=ctx.sampleRate*.15, buf=ctx.createBuffer(1,len,ctx.sampleRate), d=buf.getChannelData(0);
  for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
  return(_noiseBuf=buf);
}
function playHit(ctx,delay,vol=.3){
  setTimeout(()=>{
    const s=ctx.createBufferSource(); s.buffer=getNoiseBuf(ctx);
    const f=ctx.createBiquadFilter(); f.type='bandpass'; f.frequency.value=600+Math.random()*600; f.Q.value=.8;
    const g=ctx.createGain(); const t=ctx.currentTime;
    g.gain.setValueAtTime(vol,t); g.gain.exponentialRampToValueAtTime(.001,t+.06);
    s.connect(f); f.connect(g); g.connect(ctx.destination);
    s.start(); s.stop(t+.1);
  },delay);
}
function playRollSound(ms=1400){
  const ctx=getAudioCtx(), n=Math.floor(ms/90);
  for(let i=0;i<n;i++) playHit(ctx, i*90+Math.random()*40, .15+(1-i*90/ms)*.25);
}
function playRevealSound(type){
  const ctx=getAudioCtx(), osc=ctx.createOscillator(), g=ctx.createGain();
  osc.connect(g); g.connect(ctx.destination);
  const t=ctx.currentTime;
  if(type==='pinzoro'){
    osc.type='sine'; osc.frequency.setValueAtTime(660,t); osc.frequency.setValueAtTime(880,t+.1); osc.frequency.setValueAtTime(1100,t+.2);
    g.gain.setValueAtTime(.4,t); g.gain.exponentialRampToValueAtTime(.001,t+.6); osc.start(t); osc.stop(t+.7);
  } else if(type==='win'){
    osc.type='sine'; osc.frequency.setValueAtTime(440,t); osc.frequency.setValueAtTime(550,t+.12);
    g.gain.setValueAtTime(.3,t); g.gain.exponentialRampToValueAtTime(.001,t+.4); osc.start(t); osc.stop(t+.5);
  } else if(type==='lose'){
    osc.type='sawtooth'; osc.frequency.setValueAtTime(300,t); osc.frequency.setValueAtTime(180,t+.2);
    g.gain.setValueAtTime(.2,t); g.gain.exponentialRampToValueAtTime(.001,t+.5); osc.start(t); osc.stop(t+.6);
  } else {
    osc.type='sine'; osc.frequency.setValueAtTime(350,t);
    g.gain.setValueAtTime(.12,t); g.gain.exponentialRampToValueAtTime(.001,t+.3); osc.start(t); osc.stop(t+.4);
  }
}
function playDieLock(freq=880){
  const ctx=getAudioCtx(), osc=ctx.createOscillator(), g=ctx.createGain();
  osc.connect(g); g.connect(ctx.destination); osc.type='sine';
  const t=ctx.currentTime;
  osc.frequency.setValueAtTime(freq,t); osc.frequency.exponentialRampToValueAtTime(freq*.5,t+.08);
  g.gain.setValueAtTime(.35,t); g.gain.exponentialRampToValueAtTime(.001,t+.12);
  osc.start(t); osc.stop(t+.15);
}

// ── 役判定 ──
// 勝者の倍率（敏者のベットに掛ける）
const WIN_MULT  = { pinzoro:3, auto_win:2, triple:1, point:1, auto_lose:1, none:1 };
// 敗者のペナルティ倍率（自分のベットに掛ける）
const LOSE_MULT = { pinzoro:1, auto_win:1, triple:1, point:1, auto_lose:2, none:1 };

function evaluateHand(dice){
  const d=[...dice].sort((a,b)=>a-b), [a,b,c]=d;
  // ピンゾロ → シゴロ → ヒフミ → ゾロ目 → 出目 → 目なしの順番で判定
  if(a===1&&b===1&&c===1) return{name:'ピンゾロ！！',type:'pinzoro', value:2000};
  if(a===4&&b===5&&c===6) return{name:'シゴロ！',  type:'auto_win', value:1000};
  if(a===1&&b===2&&c===3) return{name:'ヒフミ…',  type:'auto_lose',value:-1000};
  if(a===b&&b===c)        return{name:`ゾロ目(${a})`, type:'triple',   value:100+a*10};
  if(a===b) return{name:`出目 ${c}`,type:'point',value:c};
  if(b===c) return{name:`出目 ${a}`,type:'point',value:a};
  if(a===c) return{name:`出目 ${b}`,type:'point',value:b};
  return{name:'目なし',type:'none',value:-500};
}
function handClass(h){
  if(h.type==='pinzoro') return'special';
  if(h.type==='auto_win'||h.type==='triple') return'win';
  if(h.type==='point') return h.value>=4?'win':'neutral';
  if(h.type==='auto_lose') return'lose';
  return'neutral';
}
function dieGlow(h){
  if(h.type==='pinzoro') return'glow-gold';
  if(h.type==='auto_win'||h.type==='triple') return'glow-green';
  if(h.type==='auto_lose') return'glow-red';
  if(h.type==='point') return h.value>=4?'glow-green':'';
  return'';
}

// ── STATE ──
let players=[], coins=[], bets=[], totalRounds=3, currentRound=1;
let currentPlayerIndex=0, rollsLeft=2, currentDice=[0,0,0], roundResults=[], gamePhase='waiting';
let selectedCount=2, selectedRounds=3, selectedCoins=100;
let skillUsed=[];      // 各プレイヤーのスキル使用済みフラグ
let skillActiveNow=false; // 今のロールでスキル発動中

// ── SETUP ──
document.querySelectorAll('.count-btn').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.count-btn').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); selectedCount=parseInt(b.dataset.count); buildNameInputs(selectedCount);
}));
document.querySelectorAll('.round-btn').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.round-btn').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); selectedRounds=parseInt(b.dataset.rounds);
}));
document.querySelectorAll('.coin-btn').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('.coin-btn').forEach(x=>x.classList.remove('active'));
  b.classList.add('active'); selectedCoins=parseInt(b.dataset.coins);
}));

function buildNameInputs(n){
  const c=document.getElementById('player-names-container'); c.innerHTML='';
  for(let i=0;i<n;i++){
    const d=document.createElement('div'); d.className='player-name-input';
    d.innerHTML=`<label>P${i+1}</label><input type="text" placeholder="プレイヤー${i+1}" id="pname-${i}" maxlength="10">`;
    c.appendChild(d);
  }
}
buildNameInputs(2);

document.getElementById('start-btn').addEventListener('click',()=>{
  players=[];
  for(let i=0;i<selectedCount;i++){
    const v=document.getElementById(`pname-${i}`).value.trim();
    players.push(v||`プレイヤー${i+1}`);
  }
  coins=new Array(selectedCount).fill(selectedCoins);
  bets=new Array(selectedCount).fill(0);
  skillUsed=new Array(selectedCount).fill(false); // 全員スキル未使用に
  totalRounds=selectedRounds;
  currentRound=1; currentPlayerIndex=0; roundResults=[];
  document.getElementById('total-rounds').textContent=totalRounds;
  showBetScreen();
});

// ── BET SCREEN ──
function showBetScreen(){
  switchScreen('bet-screen');
  const name=players[currentPlayerIndex];
  const myCoins=coins[currentPlayerIndex];
  document.getElementById('bet-player-name').textContent=name;
  document.getElementById('bet-current-coins').textContent=myCoins;
  const slider=document.getElementById('bet-slider');
  slider.max=myCoins; slider.min=1; slider.value=Math.max(1,Math.floor(myCoins*.1));
  document.getElementById('bet-amount').textContent=slider.value;
}
document.getElementById('bet-slider').addEventListener('input',function(){
  document.getElementById('bet-amount').textContent=this.value;
});
document.querySelectorAll('.bet-preset-btn').forEach(b=>b.addEventListener('click',()=>{
  const pct=parseInt(b.dataset.pct);
  const myCoins=coins[currentPlayerIndex];
  const v=Math.max(1,Math.floor(myCoins*pct/100));
  const sl=document.getElementById('bet-slider'); sl.value=v;
  document.getElementById('bet-amount').textContent=v;
}));
document.getElementById('bet-confirm-btn').addEventListener('click',()=>{
  const amt=parseInt(document.getElementById('bet-amount').textContent);
  bets[currentPlayerIndex]=amt;
  coins[currentPlayerIndex]-=amt; // ベット分を仮押さえ
  switchScreen('game-screen');
  if(currentPlayerIndex===0) updateScoreboard();
  startTurn();
});

// ── GAME ──
function switchScreen(id){
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function startTurn(){
  rollsLeft=2; currentDice=[0,0,0]; gamePhase='waiting'; skillActiveNow=false;
  document.getElementById('current-round').textContent=currentRound;
  document.getElementById('current-player-name').textContent=players[currentPlayerIndex];
  document.getElementById('rolls-left').textContent=rollsLeft;
  document.getElementById('current-bet').textContent=bets[currentPlayerIndex];
  document.getElementById('hand-result').className='hand-result hidden';
  document.getElementById('roll-btn').disabled=false;
  document.getElementById('next-btn').classList.add('hidden');
  // スキルボタンの状態更新
  const sb=document.getElementById('skill-btn');
  if(skillUsed[currentPlayerIndex]){
    sb.classList.add('used'); sb.disabled=true;
    sb.textContent='⚡ スキル使用済み';
  } else {
    sb.classList.remove('used'); sb.disabled=false;
    sb.textContent='⚡ 必殺スキル！';
  }
  resetDiceDisplay(); updateScoreboard();
}
function resetDiceDisplay(){
  for(let i=0;i<3;i++){
    const d=document.getElementById(`die-${i}`);
    d.querySelector('span').textContent='🎲'; d.className='die';
  }
}

// ── ROLL ──
document.getElementById('roll-btn').addEventListener('click',()=>{
  if(gamePhase==='done') return;
  rollsLeft--;
  document.getElementById('rolls-left').textContent=rollsLeft;
  document.getElementById('roll-btn').disabled=true;
  rollDice();
});

function rollDice(){
  const ROLL_MS=1500;
  document.getElementById('bowl-overlay').classList.remove('hidden');
  document.getElementById('bowl-text').textContent='ガラガラ…';
  const scene=document.getElementById('bowl-scene');
  scene.className='bowl-scene shaking';
  const bDice=[0,1,2].map(i=>document.getElementById(`bdice-${i}`));
  const flicker=setInterval(()=>{ bDice.forEach(d=>{d.textContent=FACES[rand()];}); },80);
  playRollSound(ROLL_MS);

  setTimeout(()=>{
    clearInterval(flicker);
    currentDice=[rand(),rand(),rand()];
    document.getElementById('bowl-text').textContent='じゃーん！';
    scene.className='bowl-scene tipping';

    setTimeout(()=>{
      document.getElementById('bowl-overlay').classList.add('hidden');
      scene.className='bowl-scene';
      const preHand=evaluateHand(currentDice);
      const isSpecial=['pinzoro','auto_win','triple'].includes(preHand.type);
      if(isSpecial){
        dramaticReveal(currentDice,()=>processResult());
      } else {
        [0,1,2].forEach(i=>{
          const d=document.getElementById(`die-${i}`);
          d.className='die appear';
          d.querySelector('span').textContent=FACES[currentDice[i]];
        });
        processResult();
      }
    },500);
  },ROLL_MS);
}

// スロット確定演出
function dramaticReveal(dice, cb){
  const dies=[0,1,2].map(i=>document.getElementById(`die-${i}`));
  dies.forEach(d=>{d.className='die slot-spin'; d.querySelector('span').textContent=FACES[rand()];});
  const flicker=setInterval(()=>{ dies.forEach(d=>{d.querySelector('span').textContent=FACES[rand()];}); },60);
  const dk=document.createElement('div'); dk.className='dramatic-dark';
  dk.innerHTML='<div class="dramatic-label">🎰 確定中…</div>';
  document.querySelector('.dice-arena').appendChild(dk);

  setTimeout(()=>{
    dies[0].querySelector('span').textContent=FACES[dice[0]];
    dies[0].className='die slot-lock'; playDieLock(880);
    dk.querySelector('.dramatic-label').textContent='🎰 ダッ';
  },600);
  setTimeout(()=>{
    dies[1].querySelector('span').textContent=FACES[dice[1]];
    dies[1].className='die slot-lock'; playDieLock(1000);
    dk.querySelector('.dramatic-label').textContent='🎰 ダッダッ';
  },1000);
  setTimeout(()=>{
    clearInterval(flicker);
    dies[2].querySelector('span').textContent=FACES[dice[2]];
    dies[2].className='die slot-lock'; playDieLock(1200);
    dk.querySelector('.dramatic-label').textContent='✨ 確定！✨';
    dk.classList.add('dramatic-flash');
    dies.forEach(d=>d.classList.add('all-locked'));
    setTimeout(()=>{ dk.remove(); dies.forEach(d=>d.className='die glow-gold'); cb(); },600);
  },1450);
}

// 通常サイコロ
function rand(){
  if(skillActiveNow){
    // スキル発動中: 75%の確率で良い目(4-6)
return Math.random()<.75 ? Math.floor(Math.random()*3)+4 : Math.floor(Math.random()*3)+1;
  }
  return Math.floor(Math.random()*6)+1;
}

// スキルボタン
document.getElementById('skill-btn').addEventListener('click',()=>{
  if(skillUsed[currentPlayerIndex]||gamePhase==='done') return;
  activateSkill();
});

function activateSkill(){
  skillUsed[currentPlayerIndex]=true;
  skillActiveNow=true;
  document.getElementById('skill-btn').classList.add('used');
  document.getElementById('skill-btn').disabled=true;
  document.getElementById('roll-btn').disabled=true;

  // 全画オーバーレイ
  const ov=document.createElement('div'); ov.className='skill-overlay';
  ov.innerHTML=`
    <div class="skill-sparks" id="skill-sparks"></div>
    <div class="skill-title">⚡ 必殺スキル ⚡</div>
    <div class="skill-subtitle">🎰 高確率モード発動！</div>
    <div class="skill-bar-wrap"><div class="skill-bar"></div></div>
    <div style="margin-top:20px;color:rgba(255,255,255,.5);font-size:13px;">4・5・6 の目が出やすくなる！</div>
  `;
  document.body.appendChild(ov);

  // スパーク演出
  const sparks=ov.querySelector('#skill-sparks');
  for(let i=0;i<30;i++){
    const sp=document.createElement('div'); sp.className='skill-spark';
    const x=(Math.random()-0.5)*200, y=(Math.random()-0.5)*200;
    sp.style.cssText=`left:${Math.random()*100}%;top:${Math.random()*100}%;`+
      `--dx:${x}px;--dy:${y}px;`+
      `background:hsl(${Math.random()*360},100%,70%);`+
      `animation-duration:${.8+Math.random()*1.2}s;animation-delay:${Math.random()*.5}s;`;
    sparks.appendChild(sp);
  }

  // サウンド: エネルギー上昇
  const ctx=getAudioCtx();
  [0,.5,1,1.5,2].forEach((t,i)=>{
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type='sine'; o.frequency.setValueAtTime(300+i*80, ctx.currentTime+t);
    g.gain.setValueAtTime(.15, ctx.currentTime+t);
    g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime+t+.4);
    o.start(ctx.currentTime+t); o.stop(ctx.currentTime+t+.5);
  });

  // 3秒後にオーバーレイを閉じて自動ロール
  setTimeout(()=>{
    ov.style.opacity='0'; ov.style.transition='opacity .4s';
    setTimeout(()=>{
      ov.remove();
      document.getElementById('roll-btn').disabled=false;
      document.getElementById('roll-btn').textContent='🔥 スキルロール！';
    }, 400);
  }, 3000);
}

// ── 結果処理 ──
function processResult(){
  const hand=evaluateHand(currentDice);
  const glow=dieGlow(hand);
  if(hand.type==='none'&&rollsLeft>0){
    showHandResult('目なし…もう一度！','neutral');
    // 目なしは軽いシェイク演出
    [0,1,2].forEach((i,n)=>setTimeout(()=>{
      const d=document.getElementById(`die-${i}`);
      d.style.animation='none'; void d.offsetWidth;
      d.style.animation='dieShake .4s ease-in-out';
    },n*80));
    document.getElementById('roll-btn').disabled=false;
    gamePhase='rolled'; return;
  }
  gamePhase='done';
  document.getElementById('roll-btn').disabled=true;
  const finalHand=(hand.type==='none'&&rollsLeft===0)?{...hand,name:'目なし（引き分け）'}:hand;
  if(glow) for(let i=0;i<3;i++) document.getElementById(`die-${i}`).classList.add(glow);
  showHandResult(finalHand.name,handClass(finalHand));

  // 役に応じた演出
  const sc=handClass(finalHand);
  if(finalHand.type==='pinzoro'){ playRevealSound('pinzoro'); showSpectacular('pinzoro'); }
  else if(finalHand.type==='auto_win'){ playRevealSound('win'); showSpectacular('sigoro'); }
  else if(finalHand.type==='triple'){ playRevealSound('win'); showSpectacular('triple'); }
  else if(sc==='lose'){ playRevealSound('lose'); showSpectacular('lose'); }
  else if(finalHand.type==='point'){
    playRevealSound(finalHand.value>=4?'win':'neutral');
    showNormalEffect(finalHand.value>=4?'good':'neutral', finalHand.name);
  } else {
    playRevealSound('neutral');
    showNormalEffect('neutral', finalHand.name);
  }

  addHistory(players[currentPlayerIndex], finalHand, currentDice);
  roundResults.push({player:players[currentPlayerIndex],playerIndex:currentPlayerIndex,hand:finalHand,dice:[...currentDice],bet:bets[currentPlayerIndex]});
  addLogItem(players[currentPlayerIndex],finalHand,currentDice,bets[currentPlayerIndex]);

  if(currentPlayerIndex===players.length-1){
    document.getElementById('next-btn').textContent='🏆 ラウンド結果を見る';
    document.getElementById('next-btn').onclick=finishRound;
  } else {
    document.getElementById('next-btn').textContent=`次: ${players[currentPlayerIndex+1]} →`;
    document.getElementById('next-btn').onclick=goNextPlayer;
  }
  document.getElementById('next-btn').classList.remove('hidden');
}

// 通常演出（出目・目なし）
function showNormalEffect(level, handName){
  const arena=document.querySelector('.dice-arena');

  // ダイスが1つずつポップ
  [0,1,2].forEach((i,n)=>setTimeout(()=>{
    const d=document.getElementById(`die-${i}`);
    d.style.animation='none'; void d.offsetWidth;
    d.style.animation='dieAppear .45s cubic-bezier(.17,.67,.3,1.4) both';
  },n*120));

  // levelに応じたリップル
  const color = level==='good'?'rgba(76,218,128,':'rgba(136,144,176,';
  const ripple=document.createElement('div');
  ripple.style.cssText=`position:absolute;inset:0;border-radius:20px;pointer-events:none;`+
    `animation:rippleOut .6s ease-out forwards;background:${color}.15);`;
  arena.appendChild(ripple);
  setTimeout(()=>ripple.remove(), 700);
}

function showHandResult(text,cls){
  const el=document.getElementById('hand-result');
  el.textContent=text; el.className=`hand-result ${cls}`;
}

function addLogItem(name,hand,dice,bet){
  const log=document.getElementById('round-log');
  const sc=handClass(hand);
  const coinChange=sc==='win'||sc==='special'?`+${Math.floor(bet*hand.payout)}💰`:sc==='lose'?`-${bet}💰`:'±0';
  const coinCls=sc==='win'||sc==='special'?'gain':sc==='lose'?'loss':'';
  const item=document.createElement('div'); item.className='log-item';
  item.innerHTML=`<span class="log-name">${name}</span><span class="log-dice">${dice.map(d=>FACES[d]).join(' ')}</span><span class="log-hand">${hand.name}</span><span class="log-coin ${coinCls}">${coinChange}</span>`;
  log.appendChild(item);
}

function addHistory(name,hand,dice){
  const h=document.getElementById('dice-history');
  const sc=handClass(hand);
  const cls=sc==='special'?'h-special':sc==='win'?'h-win':sc==='lose'?'h-lose':'';
  const item=document.createElement('div'); item.className=`history-item ${cls}`;
  item.innerHTML=`<span class="history-player">${name}</span><span class="history-dice">${dice.map(d=>FACES[d]).join('')}</span><span class="history-hand">${hand.name}</span>`;
  h.insertBefore(item,h.firstChild);
}

function goNextPlayer(){
  currentPlayerIndex++;
  showBetScreen(); // 次の人のベット画面へ
}

// ── ラウンド終了 ──
function finishRound(){
  const sorted=[...roundResults].sort((a,b)=>b.hand.value-a.hand.value);
  const allSame=sorted[0].hand.value===sorted[sorted.length-1].hand.value;

  // 全員のベットを返却（ここから勝敗による差引を計算）
  roundResults.forEach(r=>{ coins[r.playerIndex]+=r.bet; });

  if(allSame){
    showRoundMsg('全員引き分け！コイン返却');
  } else {
    const winners=sorted.filter(r=>r.hand.value===sorted[0].hand.value);
    const losers =sorted.filter(r=>r.hand.value!==sorted[0].hand.value);
    const transfers=[];

    winners.forEach(w=>{
      const wMult=WIN_MULT[w.hand.type]||1; // 勝者の倍率
      losers.forEach(l=>{
        const lMult=LOSE_MULT[l.hand.type]||1; // 敗者ペナルティ（ヒフミは×2）
        // 移転額 = 敗者のベット × 敗者ペナルティ × 勝者倍率 ÷ 勝者人数
        const raw=Math.floor(l.bet*lMult*wMult/winners.length);
        const steal=Math.min(raw, coins[l.playerIndex]);
        coins[l.playerIndex]-=steal;
        coins[w.playerIndex]+=steal;
        if(steal>0) transfers.push({from:l.playerIndex,to:w.playerIndex,amount:steal});
      });
    });

    setTimeout(()=>showTransferAnims(transfers), 200);
    const w0=winners[0];
    const total=transfers.reduce((s,t)=>t.to===w0.playerIndex?s+t.amount:s,0);
    showRoundMsg(`🏆 ${players[w0.playerIndex]}の勝利！${total}コイン獅得`);
  }

  updateScoreboard();
  const delay=allSame?500:2200;
  setTimeout(()=>{
    if(currentRound>=totalRounds){ showResult(); return; }
    currentRound++; currentPlayerIndex=0;
    roundResults=[]; document.getElementById('round-log').innerHTML='';
    showBetScreen();
  }, delay);
}

function showRoundMsg(msg){
  const el=document.createElement('div');
  el.style.cssText='position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(13,15,26,.95);border:2px solid #f0c040;border-radius:16px;padding:20px 36px;font-size:20px;font-weight:900;color:#f0c040;z-index:300;text-align:center;animation:popIn .4s cubic-bezier(.17,.67,.4,1.3)';
  el.textContent=msg; document.body.appendChild(el);
  setTimeout(()=>{ el.style.opacity='0'; el.style.transition='opacity .4s'; setTimeout(()=>el.remove(),400); },2000);
}

function showTransferAnims(transfers){
  transfers.forEach(({from,to,amount})=>{
    // 勝者にプラス表示
    showFloatCoin(`+${amount}💰`, '#4cda80', to);
    // 敛者にマイナス表示
    showFloatCoin(`-${amount}💰`, '#e05c5c', from);
  });
}

function showFloatCoin(text, color, playerIdx){
  // スコアボードの対応アイテムに対してフロート
  const items=document.querySelectorAll('.score-item');
  const target=items[playerIdx];
  if(!target) return;
  const rect=target.getBoundingClientRect();
  const el=document.createElement('div');
  el.style.cssText=`position:fixed;left:${rect.left+rect.width/2}px;top:${rect.top}px;color:${color};font-size:18px;font-weight:900;pointer-events:none;z-index:400;transform:translateX(-50%);animation:floatUp 1.2s ease-out forwards;text-shadow:0 2px 8px rgba(0,0,0,.8);`;
  el.textContent=text;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(),1300);
}

// ── スコアボード ──
function updateScoreboard(){
  const list=document.getElementById('score-list'); list.innerHTML='';
  players.forEach((name,i)=>{
    const item=document.createElement('div');
    item.className=`score-item ${i===currentPlayerIndex?'current-turn':''}`;
    item.innerHTML=`<span class="p-name">${name}</span><span class="p-score">${coins[i]}💰</span>`;
    list.appendChild(item);
  });
}

// ── 結果画面 ──
function showResult(){
  switchScreen('result-screen');
  const sorted=players.map((name,i)=>({name,coins:coins[i],i})).sort((a,b)=>b.coins-a.coins);
  const winner=sorted[0];
  document.getElementById('winner-display').innerHTML=`<div class="winner-crown">🏆</div><div class="winner-name">${winner.name}</div><div class="winner-sub">の優勝！コイン ${winner.coins}枚</div>`;
  const fl=document.getElementById('final-score-list'); fl.innerHTML='';
  sorted.forEach((p,rank)=>{
    const item=document.createElement('div');
    item.className=`final-score-item rank-${rank+1}`;
    const medal=rank===0?'🥇':rank===1?'🥈':rank===2?'🥉':`${rank+1}位`;
    item.innerHTML=`<span>${medal}</span><span>${p.name}</span><span class="final-coin">${p.coins}💰</span>`;
    fl.appendChild(item);
  });
  playRevealSound('pinzoro');
}

document.getElementById('restart-btn').addEventListener('click',()=>{ switchScreen('setup-screen'); });

// ── 豪華演出 ──
const SPEC_CFG={
  pinzoro:{emoji:'🎊',text:'ピンゾロ！！\n最強ダ！！',colors:['#f0c040','#ff8c00','#fff176','#ffd700'],bg:'rgba(240,192,64,.12)',count:70},
  sigoro: {emoji:'💯',text:'シゴロ！\n自動勝利！',  colors:['#4cda80','#00e676','#b9f6ca','#69f0ae'],bg:'rgba(76,218,128,.1)', count:45},
  triple: {emoji:'🔥',text:'ゾロ目！',             colors:['#7c4dff','#e040fb','#40c4ff','#fff'],   bg:'rgba(124,77,255,.1)',count:45},
  lose:   {emoji:'💨',text:'ヒフミ…\n自動敗北',   colors:['#e05c5c','#ff1744','#ff6b6b','#ffc'],   bg:'rgba(224,92,92,.08)',count:20},
};
function showSpectacular(type){
  const cfg=SPEC_CFG[type]; if(!cfg) return;
  const ov=document.createElement('div'); ov.className='spectacular-overlay';
  ov.style.background=cfg.bg; document.body.appendChild(ov);
  const bt=document.createElement('div'); bt.className='spectacular-text';
  bt.innerHTML=`<span class="spec-emoji">${cfg.emoji}</span>${cfg.text.replace('\n','<br>')}`;
  bt.style.color=cfg.colors[0]; ov.appendChild(bt);
  for(let i=0;i<cfg.count;i++){
    setTimeout(()=>{
      const p=document.createElement('div'); p.className='confetti-piece';
      p.style.left=Math.random()*100+'vw';
      p.style.background=cfg.colors[Math.floor(Math.random()*cfg.colors.length)];
      p.style.width=(6+Math.random()*8)+'px'; p.style.height=(6+Math.random()*8)+'px';
      p.style.animationDuration=(.8+Math.random()*1.2)+'s';
      p.style.animationDelay=(Math.random()*.3)+'s';
      if(Math.random()>.5) p.style.borderRadius='50%';
      ov.appendChild(p);
    },i*25);
  }
  if(type==='lose') ov.style.animation='loseFlash .4s ease-in-out 3';
  // 5秒演出: 2波コンフェッティ
  const dur=type==='pinzoro'?5000:4000;
  // 2波目のコンフェッティ（dur/2後）
  setTimeout(()=>{
    for(let i=0;i<cfg.count;i++){
      setTimeout(()=>{
        const p=document.createElement('div'); p.className='confetti-piece';
        p.style.left=Math.random()*100+'vw';
        p.style.background=cfg.colors[Math.floor(Math.random()*cfg.colors.length)];
        p.style.width=(8+Math.random()*10)+'px'; p.style.height=(8+Math.random()*10)+'px';
        p.style.animationDuration=(1+Math.random()*1.4)+'s';
        if(Math.random()>.5) p.style.borderRadius='50%';
        ov.appendChild(p);
      },i*18);
    }
  }, dur/2);
  setTimeout(()=>{ ov.style.opacity='0'; ov.style.transition='opacity .6s'; setTimeout(()=>ov.remove(),600); },dur);
}

// ── ルールモーダル ──
document.getElementById('show-rules-btn').addEventListener('click',()=>document.getElementById('rules-modal').classList.remove('hidden'));
document.getElementById('close-rules').addEventListener('click',()=>document.getElementById('rules-modal').classList.add('hidden'));
document.querySelector('.modal-overlay').addEventListener('click',()=>document.getElementById('rules-modal').classList.add('hidden'));
