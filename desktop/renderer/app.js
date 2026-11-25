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
  if (asking) return; // 이름을 묻는 중에는 덮지 않는다 (지나간 알림에는 남는다)
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
  if (e.currentTarget === bubbleEl && asking) return; // 이름 칸을 누른 것
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
  setTimeout(() => (log.querySelector('.name-form input') || input).focus(), 50); // 이름을 묻는 중이면 그 칸부터
}
function closePanel() {
  panel.hidden = true;
  notice.hidden = true;
  if (bubbleLive || asking) bubbleEl.hidden = false; // 아직 볼 때가 남은 말풍선·이름 묻기는 다시 보여 준다
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
  $('back').hidden = true;
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
  const keepScroll = log.dataset.mode === 'notices' ? log.scrollTop : 0; // 보던 목록이 새로 그려져도 읽던 자리 그대로
  leaveChat('notices');
  currentReview = null;
  returnTo = 'chat';
  panel.classList.add('reviewing');
  setTitle('최근 7일', '지나간 알림');
  log.replaceChildren(...(groups.length ? groups.flatMap(g => [el('h2', 'nt-day', g.label), ...g.items.map(noticeItem)])
    : [el('p', 'nt-empty', '아직 지나간 알림이 없습니다. 리뷰 결과·머지 소식이 오면 여기에 모입니다.')]));
  log.scrollTop = keepScroll;
  $('review-bar').hidden = true;
  $('back').hidden = false;
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
  $('back').hidden = false;
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

// 답을 기다리는 동안 알림·리뷰로 옮겨 갔으면, 답은 지금 화면이 아니라 치워 둔 대화 쪽에 붙인다
function chatReply(cls, html) {
  if (inChat()) {
    log.querySelector('.msg.wait')?.remove();
    if (cls) add(cls, html);
    return;
  }
  const box = document.createElement('div');
  box.innerHTML = log.dataset.chat || ''; // 우리가 그렸던 대화 내용
  box.querySelector('.msg.wait')?.remove();
  if (cls) {
    const d = el('div', `msg ${cls}`);
    d.innerHTML = html; // main 에서 이스케이프한 마크다운
    box.append(d);
  }
  log.dataset.chat = box.innerHTML;
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
  chatReply(r && (r.isError ? 'sasu err' : 'sasu'), r?.html);
  if (r?.left !== undefined) $('left').textContent = `오늘 남은 AI 호출 ${r.left}`;
  sending = false;
  $('ask').querySelector('button').disabled = false;
  input.focus();
});
input.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('ask').requestSubmit(); }
});
$('close').addEventListener('click', closePanel);
// 리뷰 → (알림에서 왔으면) 알림 → 대화 순서로 한 칸씩 돌아간다
function goBack() {
  if (log.dataset.mode === 'review' && returnTo === 'notices') showNotices();
  else showChat();
}
$('back').addEventListener('click', goBack);
$('notices-btn').addEventListener('click', showNotices);
$('open-pr').addEventListener('click', () => currentReview && window.sasu.openPR(currentReview));
$('new-chat').addEventListener('click', async () => {
  await window.sasu.resetChat(repoSel.value);
  log.innerHTML = '';
  log.dataset.chat = '';
  showChat();
  add('sasu', '<p>새 대화입니다. 무엇이든 물어보십시오.</p>');
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (inChat()) closePanel();
  else goBack();
});

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
  // 첫 인사는 대화가 아직 없을 때만, 지금 저장소 상태에 맞게 다시 쓴다. 이름을 입력하는 중이면 그대로 둔다
  const onlyGreeting = inChat() && [...log.children].every(c => c.classList.contains('greet'));
  if (onlyGreeting && !log.querySelector('.greet .name-form')) {
    log.innerHTML = '';
    const g = addSasuText('sasu greet', info.greeting);
    if (info.askName) g.append(nameForm(reply => addSasuText('sasu', reply))); // 대화창을 먼저 열었을 때
  }
  if (info.askName && !askedOnce) { // 처음 켰을 때: 대화창 없이 말풍선에서 바로 묻는다
    askedOnce = true;
    askInBubble('처음 뵙겠습니다. 사수입니다.\n성함이 어떻게 되십니까?');
  }
}

// 사수의 글자 답. 이름이 들어가니 글자로만 넣고, 눌러야 할 메뉴 이름만 굵게
const MENU_KEYS = ['사수 → 저장소 추가…', '사수 → 부를 이름 바꾸기…'];
function addSasuText(cls, text) {
  const d = add(cls, text, true);
  const parts = text.split(/(사수 → 저장소 추가…|사수 → 부를 이름 바꾸기…)/);
  d.firstChild.replaceChildren(...parts.map(p => (MENU_KEYS.includes(p) ? el('b', '', p) : p)));
  return d;
}

// 이름 묻기 칸: 입력하면 그 이름, 건너뛰면(빈 칸) GitHub 계정명으로 부른다. 사수의 답은 onReply 로
let askedOnce = false;
let asking = false; // 말풍선에서 이름을 묻는 중
function nameForm(onReply) {
  const form = el('form', 'name-form');
  const box = el('input', '');
  box.maxLength = 20;
  box.placeholder = '예: 지원';
  const ok = el('button', 'primary', '확인');
  ok.type = 'submit';
  const skip = el('button', 'skip', '건너뛰기');
  skip.type = 'button';
  form.append(box, ok, skip);
  const done = async name => {
    form.remove();
    const r = await window.sasu.setName(name);
    if (!r) return;
    endAsking();
    await load();
    onReply(r.reply);
  };
  form.addEventListener('submit', e => { e.preventDefault(); done(box.value.trim()); });
  skip.addEventListener('click', () => done(''));
  // 캐릭터 창은 평소 포커스를 받지 않으니, 칸을 누르면 창부터 깨운다
  box.addEventListener('pointerdown', () => { window.sasu.focus(); setTimeout(() => box.focus(), 30); });
  setTimeout(() => box.isConnected && !box.closest('[hidden]') && box.focus(), 80);
  return form;
}

function askInBubble(text) {
  asking = true;
  bubbleLive = false;
  clearTimeout(bubbleTimer);
  bubbleEl.classList.remove('card', 'has-review');
  bubbleEl.classList.add('asking');
  bubbleEl.dataset.review = '';
  bubbleEl.dataset.notice = '';
  bubbleEl.replaceChildren(el('div', 'ask-text', text), nameForm(reply => showBubble({ text: reply })));
  if (panel.hidden) { bubbleEl.hidden = false; window.sasu.focus(); }
}

function endAsking() {
  log.querySelectorAll('.name-form').forEach(f => f.remove());
  if (!asking) return;
  asking = false;
  bubbleEl.classList.remove('asking');
  bubbleEl.hidden = true;
}

window.sasu.on('mood', setMood);
window.sasu.on('bubble', showBubble);
window.sasu.on('open-review', id => openReview(id));
window.sasu.on('open-notices', showNotices);
window.sasu.on('ask-name', () => { // 메뉴 '부를 이름 바꾸기…': 대화창이 닫혀 있으면 말풍선에서, 열려 있으면 대화창에서
  endAsking();
  if (panel.hidden) { askInBubble('어떻게 불러 드리면 되겠습니까?'); return; }
  if (!inChat()) showChat();
  addSasuText('sasu', '어떻게 불러 드리면 되겠습니까?').append(nameForm(reply => addSasuText('sasu', reply)));
});
window.sasu.on('notices', n => {
  setBadge(n);
  if (n && log.dataset.mode === 'notices') showNotices(); // 보고 있는 목록에 새 알림을 바로 넣는다
});
window.sasu.on('dnd', on => setMood(on ? 'sleep' : 'idle'));
window.sasu.on('reload', load);
load();
