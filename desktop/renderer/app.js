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
let returnTo = 'chat'; // 리뷰에서 '←' 를 누르면 돌아갈 곳: 대화 또는 지나간 알림
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
// 말풍선 내용. 대화창이 열려 있으면 말풍선 자리가 가려지니, 같은 내용을 대화창 위쪽 알림(#notice)에도 띄운다.
const notice = $('notice');
let bubbleLive = false; // 아직 사라질 시간이 안 된 말풍선이 있나
function fill(target, { text, reviewId, card, noticeId }) {
  if (card) target.replaceChildren(...reviewCard(card));
  else target.textContent = text;
  target.classList.toggle('card', Boolean(card));
  target.classList.toggle('has-review', Boolean(reviewId));
  target.dataset.review = reviewId || '';
  target.dataset.notice = noticeId || '';
}
function showBubble(msg) {
  fill(bubbleEl, msg);
  bubbleLive = true;
  if (panel.hidden) bubbleEl.hidden = false;
  else { fill(notice, msg); notice.hidden = false; }
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(hideBubble, msg.reviewId ? 60000 : 12000);
}
function hideBubble() {
  bubbleLive = false;
  bubbleEl.hidden = true;
  notice.hidden = true;
  if (['warn', 'happy'].includes(buddy.dataset.mood)) setMood('idle');
}
function clickBubble(e) {
  const id = e.currentTarget.dataset.review;
  if (e.currentTarget.dataset.notice) window.sasu.readNotice(e.currentTarget.dataset.notice);
  hideBubble();
  if (id) openReview(id);
  else openPanel();
}
bubbleEl.addEventListener('click', clickBubble);
notice.addEventListener('click', clickBubble);

// ---------- 대화창 ----------
function openPanel() {
  if (bubbleLive && !bubbleEl.hidden) { // 떠 있던 말풍선은 대화창 위쪽 알림으로 옮긴다
    notice.replaceChildren(...[...bubbleEl.childNodes].map(n => n.cloneNode(true)));
    notice.className = bubbleEl.className;
    notice.dataset.review = bubbleEl.dataset.review;
    notice.dataset.notice = bubbleEl.dataset.notice;
    notice.hidden = false;
  }
  panel.hidden = false;
  bubbleEl.hidden = true;
  window.sasu.focus();
  setTimeout(() => input.focus(), 50);
}
function closePanel() {
  panel.hidden = true;
  notice.hidden = true;
  if (bubbleLive) bubbleEl.hidden = false; // 아직 볼 때가 남은 말풍선은 다시 보여 준다
}
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

// ---------- 리뷰 보기: 칸마다 색, 지적은 카드로 ----------
const SECTION = { '잘한 점': 'good', '아쉬운 점': 'soft', '꼭 고칠 점': 'must', '고칠 점': 'soft', '판정': 'verdict', '이번에 익힐 것 하나': 'learn' };
const LEVEL = { 반드시: 'must', 권장: 'soft', 참고: 'note' };

function reviewSummary(c) {
  const box = el('div', 'rv-summary');
  const head = el('div', 'b-head');
  head.append(el('span', 'b-where', c.where), el('span', `chip tone-${c.tone}`, c.verdict));
  const stats = el('div', 'b-stats');
  for (const st of c.stats) {
    const s = el('div', `stat ${st.kind}${st.n ? '' : ' zero'}`);
    s.append(el('b', '', String(st.n)), el('span', '', st.label));
    stats.append(s);
  }
  box.append(head, stats);
  return box;
}

// renderMarkdown 이 만든(이미 이스케이프된) 노드를 옮기기만 한다. 새 HTML 문자열은 넣지 않는다.
function decorateReview(root) {
  const nodes = [...root.childNodes];
  let section = null;
  root.replaceChildren();
  for (const n of nodes) {
    if (n.nodeName === 'H2') {
      const kind = SECTION[n.textContent.trim()] || 'other';
      section = el('section', `rv rv-${kind}`);
      root.append(section);
    }
    (section || root).append(n);
  }
  for (const h of root.querySelectorAll('h3')) {
    const first = h.firstChild;
    const m = first?.nodeType === 3 && first.textContent.match(/^\s*\d+\.\s*\[(반드시|권장|참고)\]\s*/);
    if (m) {
      first.textContent = first.textContent.slice(m[0].length);
      h.prepend(el('span', `pill lv-${LEVEL[m[1]]}`, m[1]));
    }
    // 끝의 " — `파일:줄`" 은 아래 줄로
    const code = h.lastElementChild?.nodeName === 'CODE' ? h.lastElementChild : null;
    if (code) {
      const dash = code.previousSibling;
      if (dash?.nodeType === 3) dash.textContent = dash.textContent.replace(/\s*—\s*$/, '');
      h.append(el('span', 'where', ''));
      h.lastChild.append(code);
    }
    // 제목과 그 아래 목록을 카드 하나로
    const card = el('div', 'finding');
    h.before(card);
    card.append(h);
    while (card.nextSibling && !['H2', 'H3'].includes(card.nextSibling.nodeName) && !card.nextSibling.classList?.contains('finding')) card.append(card.nextSibling);
  }
  // "문제: …" "왜: …" 같은 머리말은 굵게
  for (const li of root.querySelectorAll('.finding li')) {
    const t = li.firstChild;
    const m = t?.nodeType === 3 && t.textContent.match(/^(문제|왜|힌트|배울 것):\s*/);
    if (m) { t.textContent = t.textContent.slice(m[0].length); li.prepend(el('span', 'lbl', m[1])); }
  }
}

function setTitle(small, main) {
  const t = $('panel-title');
  t.replaceChildren();
  if (small) t.append(el('span', 'pt-small', small));
  t.append(el('span', 'pt-main', main));
}

// 대화 내용은 리뷰·알림을 보는 동안 잠깐 치워 두었다가 돌아오면 되살린다
const inChat = () => (log.dataset.mode || 'chat') === 'chat';
function leaveChat(mode) {
  if (inChat()) log.dataset.chat = log.innerHTML;
  log.dataset.mode = mode;
}

function showChat() {
  currentReview = null;
  returnTo = 'chat';
  panel.classList.remove('reviewing');
  setTitle(null, '사수와 대화');
  $('review-bar').hidden = true;
  $('ask').hidden = false;
  if (!inChat()) log.innerHTML = log.dataset.chat || '';
  log.dataset.mode = 'chat';
  log.scrollTop = log.scrollHeight;
}

// ---------- 지나간 알림: 날짜별, 리뷰는 눌러서 다시 열기 ----------
function noticeItem(n) {
  const item = el('div', `nt-item${n.reviewId ? ' has-review' : ''}${n.read ? '' : ' unread'}`);
  const time = new Date(n.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  if (n.card) {
    const c = n.card;
    const head = el('div', 'b-head');
    head.append(el('span', 'b-where', `${time} · ${c.where}`), el('span', `chip tone-${c.tone}`, c.verdict));
    item.append(head, el('div', 'b-title', c.title), el('div', 'nt-line', c.stats.map(st => `${st.label} ${st.n}`).join(' · ')));
  } else {
    item.append(el('div', 'b-where', time), el('div', 'nt-text', n.text));
  }
  if (n.reviewId) item.addEventListener('click', () => openReview(n.reviewId, 'notices'));
  return item;
}

async function showNotices() {
  const groups = await window.sasu.notices();
  if (!groups) return;
  leaveChat('notices');
  currentReview = null;
  returnTo = 'chat';
  panel.classList.add('reviewing');
  setTitle('최근 7일', '지나간 알림');
  log.replaceChildren(...(groups.length ? groups.flatMap(g => [el('h2', 'nt-day', g.label), ...g.items.map(noticeItem)])
    : [el('p', 'nt-empty', '아직 지나간 알림이 없습니다. 리뷰 결과·머지 소식이 오면 여기에 모입니다.')]));
  log.scrollTop = 0;
  $('review-bar').hidden = false;
  $('open-pr').hidden = true;
  $('back').textContent = '← 대화로';
  $('ask').hidden = true;
  window.sasu.readNotice(null); // 목록을 봤으면 모두 읽음
  if (panel.hidden) openPanel();
}

function setBadge(n) {
  const b = $('badge');
  b.textContent = n > 9 ? '9+' : String(n || 0);
  b.hidden = !n;
}

async function openReview(id, from = 'chat') {
  const r = await window.sasu.review(id);
  if (!r) return;
  leaveChat('review');
  returnTo = from === 'notices' ? 'notices' : 'chat';
  $('back').textContent = returnTo === 'notices' ? '← 알림으로' : '← 대화로';
  $('open-pr').hidden = false;
  currentReview = id;
  panel.classList.add('reviewing');
  setTitle(r.meta ? `리뷰 · PR #${r.meta.number}` : '리뷰', r.meta ? r.meta.title : '');
  log.innerHTML = r.html; // main 에서 이스케이프한 마크다운
  decorateReview(log);
  if (r.card) log.prepend(reviewSummary(r.card));
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
$('back').addEventListener('click', () => (log.dataset.mode === 'review' && returnTo === 'notices' ? showNotices() : showChat()));
$('notices-btn').addEventListener('click', showNotices);
$('open-pr').addEventListener('click', () => currentReview && window.sasu.openPR(currentReview));
$('new-chat').addEventListener('click', async () => {
  await window.sasu.resetChat(repoSel.value);
  log.innerHTML = '';
  log.dataset.chat = '';
  showChat();
  add('sasu', '<p>새 대화입니다. 무엇이든 물어보십시오.</p>');
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
  setBadge(info.unread);
  // 첫 인사는 대화가 아직 없을 때만, 지금 저장소 상태에 맞게 다시 쓴다
  const onlyGreeting = inChat() && [...log.children].every(c => c.classList.contains('greet'));
  if (onlyGreeting) {
    log.innerHTML = '';
    const span = add('sasu greet', info.greeting, true).firstChild; // 이름이 들어가니 글자로만 넣는다
    const key = '사수 → 저장소 추가…'; // 눌러야 할 메뉴는 굵게
    const at = info.greeting.indexOf(key);
    if (at >= 0) span.replaceChildren(info.greeting.slice(0, at), el('b', '', key), info.greeting.slice(at + key.length));
  }
}

window.sasu.on('mood', setMood);
window.sasu.on('bubble', showBubble);
window.sasu.on('open-review', id => openReview(id));
window.sasu.on('open-notices', showNotices);
window.sasu.on('notices', n => {
  setBadge(n);
  if (n && log.dataset.mode === 'notices') showNotices(); // 보고 있는 목록에 새 알림을 바로 넣는다
});
window.sasu.on('dnd', on => setMood(on ? 'sleep' : 'idle'));
window.sasu.on('reload', load);
load();
