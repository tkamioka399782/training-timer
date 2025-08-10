(() => {
  // ---------- helpers ----------
  const $ = s => document.querySelector(s);
  const fmt = s => {
    s = Math.max(0, Math.round(s));
    return String(Math.floor(s/60)).padStart(2,'0') + ':' + String(s%60).padStart(2,'0');
  };

  const saveBadge = $('#saveState');
  const touchSave = () => { saveBadge.textContent='保存済み'; setTimeout(()=>saveBadge.textContent='未保存',1000); };

  // ---------- model ----------
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

  // ---------- playlist UI ----------
  const listEl = $('#list');

  function renderList(){
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
  $('#add').onclick = ()=>{
    playlist.push({
      name: $('#name').value.trim() || '種目',
      repeats: +$('#repeats').value || 1,
      work: +$('#work').value || 30,
      setInterval: +$('#setInterval').value || 15,   // デフォルト15秒
      interval: +$('#interval').value || 20
    });
    persist();
    $('#name').value = '';
  };
  $('#sample').onclick = ()=>{
    playlist = [
      { name:'プランク', repeats:3, work:30, setInterval:15, interval:20 },
      { name:'サイドプランク（右）', repeats:2, work:25, setInterval:15, interval:15 },
      { name:'サイドプランク（左）', repeats:2, work:25, setInterval:15, interval:30 },
      { name:'バードドッグ', repeats:3, work:20, setInterval:15, interval:20 }
    ];
    persist();
  };
  $('#clear').onclick = ()=>{ if (confirm('すべて削除しますか？')) { playlist = []; persist(); } };

  // ---------- player ----------
  const digits = $('#digits'), phaseEl = $('#phaseLabel'), nowName = $('#nowName'),
        nextName = $('#nextName'), subInfo = $('#subInfo'), bar = $('#bar');
  const btnStart = $('#start'), btnPause = $('#pause'), btnResume = $('#resume'), btnStop = $('#stop');

  let timer = null;
  let state = { running:false, paused:false, phase:'idle', i:0, rep:1, left:0, limit:0 };

  function refreshPlayerMeta(){
    nextName.textContent = playlist[0] ? `次：${playlist[0].name}` : '次：—';
    subInfo.textContent = `メニュー 0 / ${playlist.length} ・ セット 0 / 0`;
  }

  function start(){
    if (!playlist.length){ alert('メニューを追加してください'); return; }
    state = { running:true, paused:false, phase:'work', i:0, rep:1, left:playlist[0].work, limit:playlist[0].work };
    btnStart.disabled = true; btnPause.disabled = false; btnStop.disabled = true; // Stopを2秒後に有効化（誤操作防止）
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
    digits.textContent = '00:00'; bar.style.width = '0%';
    phaseEl.textContent = '待機中';
    nowName.textContent = '—';
    refreshPlayerMeta();
  }

  function finish(){
    clearInterval(timer); timer = null;
    state.running = false; state.phase = 'done';
    phaseEl.textContent = '完了！おつかれさま';
    nowName.textContent = '—'; nextName.textContent = '次：—';
    btnStart.disabled = false; btnPause.disabled = true; btnStop.disabled = true;
    btnResume.style.display = 'none'; btnPause.style.display = '';
  }

  function moveToNextPhase(){
    const cur = playlist[state.i];
    if (state.phase === 'work'){
      if (state.rep < cur.repeats){
        // まだ同じ種目の途中 → セット間休憩 or 次セットへ
        if (cur.setInterval > 0){
          state.phase = 'setRest';
          state.left = cur.setInterval; state.limit = cur.setInterval;
        } else {
          state.rep += 1; state.phase = 'work';
          state.left = cur.work; state.limit = cur.work;
        }
      } else {
        // 最終セット完了 → 次メニュー前インターバル or 直行
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
      digits.textContent = '00:00'; bar.style.width = '0%';
      return;
    } else {
      // idle
    }
    digits.textContent = fmt(state.left);
    const p = state.limit ? Math.max(0, Math.min(1, 1 - (state.left/state.limit))) : 0;
    bar.style.width = `${p*100}%`;
  }

  // buttons
  $('#start').onclick = start;
  $('#pause').onclick = pause;
  $('#resume').onclick = resume;
  $('#stop').onclick = stop;

  // init
  load();
  renderList();
  refreshPlayerMeta();
})();