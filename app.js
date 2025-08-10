(() => {
  // ---------- helpers ----------
  const $ = s => document.querySelector(s);
  const fmt = s => {
    s = Math.max(0, Math.round(s));
    return String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0');
  };

  const saveBadge = $('#saveState');
  const touchSave = () => { if(!saveBadge) return; saveBadge.textContent='保存済み'; setTimeout(()=>saveBadge.textContent='未保存',1000); };

  // ---------- model (ブラウザを閉じても保持) ----------
  const KEY = 'coreTimer.v3';
  let playlist = [];

  function load(){
    try { playlist = JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch { playlist = []; }
  }
  function persist(){
    localStorage.setItem(KEY, JSON.stringify(playlist));
    touchSave();
    renderList();
    refreshPlayerMeta();
  }
  window.addEventListener('beforeunload', () => {
    // 念のため終了前にも保存（localStorageは即時反映だが安全策）
    try { localStorage.setItem(KEY, JSON.stringify(playlist)); } catch {}
  });

  // ---------- playlist UI ----------
  const listEl = $('#list');

  function renderList(){
    if(!listEl) return;
    listEl.innerHTML = '';
    if (!playlist.length){
      listEl.innerHTML = '<div class="muted">（まだメニューがありません）</div>';
      return;
    }
    playlist.forEach((it, idx)=>{
      const row = document.createElement('div');
      row.className = 'item';
      row.innerHTML = `
        <input class="name" type="text" value="${it.name}">
        <div class="nums">
          <label>回<input class="rep" type="number" min="1" value="${it.repeats}"></label>
          <label>秒<input class="work" type="number" min="5" step="5" value="${it.work}"></label>
          <label>セット休<input class="setInt" type="number" min="0" step="5" value="${it.setInterval}"></label>
          <label>次まで<input class="intv" type="number" min="0" step="5" value="${it.interval}"></label>
        </div>
        <div class="actions">
          <button data-a="up">↑</button>
          <button data-a="down">↓</button>
          <button data-a="dup">複製</button>
          <button data-a="del">削除</button>
        </div>
      `;
      row.querySelector('.name').onchange = e => { it.name = e.target.value.trim() || '種目'; persist(); };
      row.querySelector('.rep').onchange  = e => { it.repeats = Math.max(1, +e.target.value||1); persist(); };
      row.querySelector('.work').onchange = e => { it.work = Math.max(5, +e.target.value||5); persist(); };
      row.querySelector('.setInt').onchange = e => { it.setInterval = Math.max(0, +e.target.value||0); persist(); };
      row.querySelector('.intv').onchange = e => { it.interval = Math.max(0, +e.target.value||0); persist(); };

      row.querySelectorAll('[data-a]').forEach(btn => btn.onclick = ()=>{
        const a = btn.dataset.a;
        if (a==='up' && idx>0) [playlist[idx-1], playlist[idx]] = [playlist[idx], playlist[idx-1]];
        if (a==='down' && idx<playlist.length-1) [playlist[idx+1], playlist[idx]] = [playlist[idx], playlist[idx+1]];
        if (a==='dup') playlist.splice(idx+1, 0, {...it});
        if (a==='del') playlist.splice(idx, 1);
        persist();
      });

      listEl.appendChild(row);
    });
  }

  // add / sample / clear
  $('#add')?.addEventListener('click', ()=>{
    playlist.push({
      name: $('#name').value.trim() || '種目',
      repeats: +$('#repeats').value || 1,
      work: +$('#work').value || 30,
      setInterval: +$('#setInterval').value || 15,   // 既定15秒
      interval: +$('#interval').value || 20
    });
    persist();
    $('#name').value = '';
  });
  $('#sample')?.addEventListener('click', ()=>{
    playlist = [
      { name:'プランク', repeats:3, work:30, setInterval:15, interval:20 },
      { name:'サイドプランク（右）', repeats:2, work:25, setInterval:15, interval:15 },
      { name:'サイドプランク（左）', repeats:2, work:25, setInterval:15, interval:30 },
      { name:'バードドッグ', repeats:3, work:20, setInterval:15, interval:20 }
    ];
    persist();
  });
  $('#clear')?.addEventListener('click', ()=>{
    if (confirm('すべて削除しますか？')) { playlist = []; persist(); }
  });

  // ---------- audio (iOS対応：ユーザー操作後に初期化) ----------
  let audioCtx = null;
  let unlocked = false;
  function initAudio() {
    if (audioCtx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();
    // iOS対策：一度短い無音を鳴らしてアンロック
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    g.gain.value = 0.0001;
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.01);
    unlocked = true;
  }
  function beepOnce(freq=880, len=0.15) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + len);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t0); o.stop(t0 + len + 0.02);
  }
  function chime(kind='phase') {
    // kind: 'phase'（各フェーズ終了） / 'done'（全体完了）
    if (!audioCtx) return;
    if (kind === 'done') {
      // 2トーン上昇
      beepOnce(660, 0.12);
      setTimeout(()=>beepOnce(990, 0.14), 140);
    } else {
      // 単発ビープ
      beepOnce(880, 0.12);
    }
  }

  // ---------- player ----------
  const digits = $('#digits'), phaseEl = $('#phaseLabel'), nowName = $('#nowName'),
        nextName = $('#nextName'), subInfo = $('#subInfo'), bar = $('#bar');
  const btnStart = $('#start'), btnPause = $('#pause'), btnResume = $('#resume'), btnStop = $('#stop');

  let timer = null;
  let state = { running:false, paused:false, phase:'idle', i:0, rep:1, left:0, limit:0 };

  function refreshPlayerMeta(){
    if (!nextName || !subInfo) return;
    nextName.textContent = playlist[0] ? `次：${playlist[0].name}` : '次：—';
    subInfo.textContent = `メニュー 0 / ${playlist.length} ・ セット 0 / 0`;
  }

  function start(){
    if (!playlist.length){ alert('メニューを追加してください'); return; }
    // 音の初期化（ユーザー操作中）
    initAudio();

    state = { running:true, paused:false, phase:'work', i:0, rep:1, left:playlist[0].work, limit:playlist[0].work };
    btnStart.disabled = true; btnPause.disabled = false; btnStop.disabled = true;
    setTimeout(()=>btnStop.disabled=false, 2000);
    btnResume.style.display = 'none'; btnPause.style.display = '';
    tickDraw();
    timer = setInterval(tick, 250);
  }

  function pause(){
    if (!state.running || state.paused) return;
    state.paused = true;
    clearInterval(timer); timer = null;
    btnPause.disabled = true; btnResume.style.display = ''; btnPause.style.display = 'none';
    phaseEl.textContent = '一時停止中';
  }

  function resume(){
    if (!state.running || !state.paused) return;
    state.paused = false;
    btnPause.disabled = false; btnResume.style.display = 'none'; btnPause.style.display = '';
    timer = setInterval(tick, 250);
  }

  function stop(){
    clearInterval(timer); timer = null;
    state = { running:false, paused:false, phase:'idle', i:0, rep:1, left:0, limit:0 };
    btnStart.disabled = false; btnPause.disabled = true; btnStop.disabled = true;
    btnResume.style.display = 'none'; btnPause.style.display = '';
    if (digits) digits.textContent = '00:00';
    if (bar) bar.style.width = '0%';
    if (phaseEl) phaseEl.textContent = '待機中';
    if (nowName) nowName.textContent = '—';
    refreshPlayerMeta();
  }

  function finish(){
    clearInterval(timer); timer = null;
    state.running = false; state.phase = 'done';
    if (phaseEl) phaseEl.textContent = '完了！おつかれさま';
    if (nowName) nowName.textContent = '—'; if (nextName) nextName.textContent = '次：—';
    btnStart.disabled = false; btnPause.disabled = true; btnStop.disabled = true;
    btnResume.style.display = 'none'; btnPause.style.display = '';
    chime('done');
  }

  function moveToNextPhase(){
    const cur = playlist[state.i];
    // いまのフェーズが終了したので音
    chime('phase');

    if (state.phase === 'work'){
      if (state.rep < cur.repeats){
        // セット間休憩 → 次セット
        if (cur.setInterval > 0){
          state.phase = 'setRest';
          state.left = cur.setInterval; state.limit = cur.setInterval;
        } else {
          state.rep += 1; state.phase = 'work';
          state.left = cur.work; state.limit = cur.work;
        }
      } else {
        // 最終セット完 → メニュー間インターバル or 次メニュー
        if (state.i < playlist.length - 1 && cur.interval > 0){
          state.phase = 'interval';
          state.left = cur.interval; state.limit = cur.interval;
        } else {
          state.i += 1;
          if (state.i >= playlist.length) { finish(); return; }
          state.rep = 1; state.phase = 'work';
          state.left = playlist[state.i].work; state.limit = playlist[state.i].work;
        }
      }
    } else if (state.phase === 'setRest'){
      // 次セットへ
      state.rep += 1; state.phase = 'work';
      state.left = cur.work; state.limit = cur.work;
    } else if (state.phase === 'interval'){
      // 次メニューの1セット目へ
      state.i += 1;
      if (state.i >= playlist.length) { finish(); return; }
      state.rep = 1; state.phase = 'work';
      state.left = playlist[state.i].work; state.limit = playlist[state.i].work;
    }
  }

  function tick(){
    if (!state.running || state.paused) return;
    state.left -= 0.25;
    if (state.left <= 0) moveToNextPhase();
    tickDraw();
  }

  function tickDraw(){
    const cur = playlist[state.i];
    const next = playlist[state.i+1];
    if (state.phase === 'work'){
      phaseEl.textContent = 'トレーニング中';
      nowName.textContent = cur?.name ?? '—';
      nextName.textContent = next ? `次：${next.name}` : '次：—';
      subInfo.textContent = `メニュー ${state.i+1} / ${playlist.length} ・ セット ${state.rep} / ${cur?.repeats ?? 0}`;
    } else if (state.phase === 'setRest'){
      phaseEl.textContent = 'セット休憩';
      nowName.textContent = cur?.name ?? '—';
      nextName.textContent = cur ? `次：${cur.name}（セット${state.rep+1}）` : '次：—';
      subInfo.textContent = `メニュー ${state.i+1} / ${playlist.length} ・ 次セット ${state.rep+1} / ${cur?.repeats ?? 0}`;
    } else if (state.phase === 'interval'){
      phaseEl.textContent = 'インターバル';
      nowName.textContent = next ? next.name : '—（終了）';
      nextName.textContent = next ? `次：${next.name} を開始` : '次：—';
      subInfo.textContent = `メニュー ${state.i+1} / ${playlist.length} ・ セット 完了`;
    } else if (state.phase === 'done'){
      if (digits) digits.textContent = '00:00';
      if (bar) bar.style.width = '0%';
      return;
    }
    if (digits) digits.textContent = fmt(state.left);
    const p = state.limit ? Math.max(0, Math.min(1, 1 - (state.left/state.limit))) : 0;
    if (bar) bar.style.width = `${p*100}%`;
  }

  // buttons
  $('#start')?.addEventListener('click', start);
  $('#pause')?.addEventListener('click', pause);
  $('#resume')?.addEventListener('click', resume);
  $('#stop')?.addEventListener('click', stop);

  // init
  load();
  renderList();
  refreshPlayerMeta();
})();