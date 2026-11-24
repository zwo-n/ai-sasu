// 캐릭터·말풍선·대화창. 메인 프로세스와는 window.sasu 로만 주고받는다.
const $ = id => document.getElementById(id);
const buddy = $('buddy');
const bubbleEl = $('bubble');
const panel = $('panel');
const log = $('log');
const input = $('input');
const repoSel = $('repo');

let info = { repos: [], reviews: [] };
let bubbleTimer;
let currentReview = null;
let sending = false;

// ---------- 클릭 통과: 캐릭터·말풍선·대화창 위에서만 마우스를 받는다 ----------
let hovering = 0;
let dragging = false;
document.querySelectorAll('.hit').forEach(el => {
  el.addEventListener('mouseenter', () => { hovering++; window.sasu.interactive(true); });
  el.addEventListener('mouseleave', () => {
    hovering = Math.max(0, hovering - 1);
    if (!hovering && !dragging) window.sasu.interactive(false);
  });
});

// ---------- 표정 ----------
function setMood(m) {
  buddy.dataset.mood = m;
  if (info.character) {
    const img = $('custom');
    img.src = info.character[m] || info.character.idle;
  }
}

// ---------- 끌어서 옮기기 / 눌러서 대화 ----------
let start = null;
buddy.addEventListener('pointerdown', e => {
  start = { x: e.screenX, y: e.screenY, lx: e.screenX, ly: e.screenY };
  dragging = false;
  buddy.setPointerCapture(e.pointerId);
});
buddy.addEventListener('pointermove', e => {
  if (!start) return;
  if (!dragging && Math.hypot(e.screenX - start.x, e.screenY - start.y) > 4) dragging = true;
  if (dragging) {
    window.sasu.drag(e.screenX - start.lx, e.screenY - start.ly);
    start.lx = e.screenX;
    start.ly = e.screenY;
  }
});
buddy.addEventListener('pointerup', () => {
  if (dragging) window.sasu.dragEnd();
  else togglePanel();
  start = null;
  dragging = false;
});

// ---------- 말풍선 ----------
// 리뷰 결과는 카드로: 어디 · 제목 · 판정 칩과 개수 · 먼저 볼 것. 모두 textContent 로 넣는다.
function el(tag, cls, text) {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
}
function reviewCard(c) {
  const head = el('div', 'b-head');
  head.append(el('span', 'b-where', c.where), el('span', `chip tone-${c.tone}`, c.verdict));
  const stats = el('div', 'b-stats');
  for (const st of c.stats) {
    const box = el('div', `stat ${st.kind}${st.n ? '' : ' zero'}`);
    box.append(el('b', '', String(st.n)), el('span', '', st.label));
    stats.append(box);
  }
  const parts = [head, el('div', 'b-title', c.title), stats];
  if (c.top) {
    const top = el('div', 'b-top');
    top.append(el('span', 'b-label', c.topLabel), el('span', 'b-top-text', c.top));
    parts.push(top);
  }
  parts.push(el('div', 'b-more', '눌러서 전체 리뷰 보기'));
  return parts;
}
function showBubble({ text, reviewId, card }) {
  if (card) bubbleEl.replaceChildren(...reviewCard(card));
  else bubbleEl.textContent = text;
  bubbleEl.classList.toggle('card', Boolean(card));
  bubbleEl.classList.toggle('has-review', Boolean(reviewId));
  bubbleEl.dataset.review = reviewId || '';
  bubbleEl.hidden = !panel.hidden; // 대화창이 열려 있으면 말풍선은 숨긴다
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(hideBubble, reviewId ? 60000 : 12000);
}
function hideBubble() {
  bubbleEl.hidden = true;
  if (['warn', 'happy'].includes(buddy.dataset.mood)) setMood('idle');
}
bubbleEl.addEventListener('click', () => {
  hideBubble();
  if (bubbleEl.dataset.review) openReview(bubbleEl.dataset.review);
  else openPanel();
});

// ---------- 대화창 ----------
function openPanel() {
  panel.hidden = false;
  bubbleEl.hidden = true;
  window.sasu.focus();
  setTimeout(() => input.focus(), 50);
}
function closePanel() { panel.hidden = true; }
function togglePanel() { panel.hidden ? openPanel() : closePanel(); }

function add(cls, html, isText = false) {
  const d = document.createElement('div');
  d.className = `msg ${cls}`;
  if (isText) { const s = document.createElement('span'); s.textContent = html; d.append(s); }
  else d.innerHTML = html; // main 에서 이스케이프한 마크다운만 들어온다
  log.append(d);
  log.scrollTop = log.scrollHeight;
  return d;
}

function showChat() {
  currentReview = null;
  $('panel-title').textContent = '사수와 대화';
  $('review-bar').hidden = true;
  $('ask').hidden = false;
  if (log.dataset.mode === 'review') { log.innerHTML = log.dataset.chat || ''; }
  log.dataset.mode = 'chat';
  log.scrollTop = log.scrollHeight;
}

async function openReview(id) {
  const r = await window.sasu.review(id);
  if (!r) return;
  if (log.dataset.mode !== 'review') log.dataset.chat = log.innerHTML;
  log.dataset.mode = 'review';
  currentReview = id;
  $('panel-title').textContent = r.meta ? `리뷰 · #${r.meta.number} ${r.meta.title}` : '리뷰';
  log.innerHTML = r.html;
  log.scrollTop = 0;
  $('review-bar').hidden = false;
  $('ask').hidden = true;
  openPanel();
}

$('ask').addEventListener('submit', async e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || sending) return;
  sending = true;
  $('ask').querySelector('button').disabled = true;
  input.value = '';
  add('me', text, true);
  const wait = add('wait', '사수가 보는 중…');
  const r = await window.sasu.chat(text, repoSel.value);
  wait.remove();
  if (r) {
    add(r.isError ? 'sasu err' : 'sasu', r.html);
    if (r.left !== undefined) $('left').textContent = `오늘 남은 AI 호출 ${r.left}`;
  }
  sending = false;
  $('ask').querySelector('button').disabled = false;
  input.focus();
});
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('ask').requestSubmit(); }
});
$('close').addEventListener('click', closePanel);
$('back').addEventListener('click', showChat);
$('open-pr').addEventListener('click', () => currentReview && window.sasu.openPR(currentReview));
$('new-chat').addEventListener('click', async () => {
  await window.sasu.resetChat(repoSel.value);
  log.innerHTML = '';
  log.dataset.chat = '';
  showChat();
  add('sasu', '<p>새 대화예요. 무엇이든 물어보세요.</p>');
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });

// ---------- 시작 ----------
async function load() {
  info = await window.sasu.info();
  const picked = repoSel.value; // 다시 채워도 사용자가 고른 저장소는 유지
  repoSel.innerHTML = '';
  for (const r of info.repos) {
    const o = document.createElement('option');
    o.value = r.path;
    o.textContent = r.name;
    repoSel.append(o);
  }
  if (info.repos.some(r => r.path === picked)) repoSel.value = picked;
  repoSel.hidden = info.repos.length === 0;
  $('left').textContent = `오늘 남은 AI 호출 ${info.left}`;
  const custom = $('custom');
  custom.hidden = !info.character;
  $('sasu').style.display = info.character ? 'none' : '';
  setMood(info.dnd ? 'sleep' : 'idle');
  // 첫 인사는 대화가 아직 없을 때만, 지금 저장소 상태에 맞게 다시 쓴다
  const onlyGreeting = log.dataset.mode !== 'review' && [...log.children].every(c => c.classList.contains('greet'));
  if (onlyGreeting) {
    log.innerHTML = '';
    add('sasu greet', info.repos.length
      ? '<p>안녕하세요, 사수예요. 코드 얘기면 뭐든 물어보세요. 내 PR이 올라오면 제가 먼저 볼게요.</p>'
      : '<p>안녕하세요, 사수예요. 메뉴 막대의 <strong>사수 → 저장소 추가…</strong>로 지켜볼 저장소를 알려 주세요.</p>');
  }
}

window.sasu.on('mood', setMood);
window.sasu.on('bubble', showBubble);
window.sasu.on('open-review', openReview);
window.sasu.on('dnd', on => setMood(on ? 'sleep' : 'idle'));
window.sasu.on('reload', load);
load();
