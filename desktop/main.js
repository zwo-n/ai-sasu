// AI 사수 데스크톱: 화면 아래 캐릭터 + 내 PR 자동 리뷰.
// AI 를 부르는 곳은 두 곳뿐이다: 대화(chat:send)와 PR 리뷰(runReview). 둘 다 claude CLI(구독)로.
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, dialog, Notification, nativeImage, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { execFile, execFileSync } = require('node:child_process');

const { withDefaults, loadJson, saveJson } = require('./lib/config');
const { diffPRs, baselineNote, prLabel, readyCount, seenAfterPick } = require('./lib/prwatch');
const { summarize, bubbleCard } = require('./lib/summary');
const { IMAGE_TYPES, planImport } = require('./lib/character');
const { removeBackground, cutoutMethod } = require('./lib/cutout');
const { greeting, callName, nameReply, needsName } = require('./lib/greeting');
const { LABEL, launchAgentPlist } = require('./lib/autostart');
const { addNotice, unreadCount, groupByDay, closedPRs, closedText, seedFromReviews } = require('./lib/notices');
const { Usage } = require('./lib/usage');
const { runClaude, findSasuScript } = require('./lib/claude');
const { renderMarkdown } = require('./lib/markdown');

// 시험용: SASU_DATA_DIR 로 설정·기록 폴더를 따로 쓴다
if (process.env.SASU_DATA_DIR) app.setPath('userData', process.env.SASU_DATA_DIR);
if (!app.requestSingleInstanceLock()) app.quit();

const DATA = app.getPath('userData');
const CONFIG_FILE = path.join(DATA, 'config.json');
const MY_CHAR_DIR = path.join(DATA, 'character'); // 메뉴에서 고른 내 캐릭터 그림을 복사해 두는 곳
const STATE_FILE = path.join(DATA, 'state.json');
const REVIEW_DIR = path.join(DATA, 'reviews');
// 창 = 대화창 + 둘레(좌우 8px씩, 아래 캐릭터 자리 146px + 위 14px). 대화창 크기는 끌어서 바꾼다.
const PANEL = { w: 364, h: 400, minW: 300, minH: 260, maxW: 900 };
const EDGE_W = 16;
const EDGE_H = 160;
const MOODS = ['idle', 'thinking', 'warn', 'happy', 'sleep'];

let config;
let state;   // { seen: {repo: {PR: sha}}, usage: {days}, sessions: {repo: id}, reviews: [...], notices: [...], dnd }
let usage;
let env;
let sasuScript; // 설치된 sasu.py — claude 에게 이 경로만 python3 로 허용
let chatBusy = false;
let win;
let tray;
let pollTimer;
const queue = [];
const openPRs = {}; // 저장소별 마지막으로 본 내 열린 PR (메뉴에서 고르기용)
let working = false;

const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD (로컬)
const saveState = () => saveJson(STATE_FILE, state);
const send = (ch, data) => win && !win.isDestroyed() && win.webContents.send(ch, data);
const repoName = repo => path.basename(repo);
const myName = () => callName(config.displayName || state.ghLogin); // 사수가 부를 이름

// Finder 에서 켜면 PATH 가 짧아서 claude·gh 를 못 찾는다. 로그인 셸의 PATH 를 빌린다.
function loginEnv() {
  try {
    const p = execFileSync('/bin/zsh', ['-lc', 'printf %s "$PATH"'], { timeout: 5000 }).toString();
    return { ...process.env, PATH: p || process.env.PATH };
  } catch {
    return process.env;
  }
}

function mood(m) {
  send('mood', state.dnd ? 'sleep' : m);
}

// 알림 기록에 남긴다. 방해 금지 중이거나 대화창을 보느라 놓친 것도 나중에 다시 본다.
let noticeSeq = 0;
function remember(item) {
  const id = `n${Date.now()}-${noticeSeq++}`;
  state.notices = addNotice(state.notices, { id, ...item });
  saveState();
  send('notices', unreadCount(state.notices));
  buildTray();
  return id;
}

function reviewCardFor(r) {
  try {
    const md = fs.readFileSync(path.join(REVIEW_DIR, path.basename(r.id) + '.md'), 'utf8');
    return bubbleCard({ repo: repoName(r.repo), number: r.number, title: r.title }, summarize(md));
  } catch {
    return null; // 파일이 없으면 글자로만 보인다
  }
}

// keep: false 는 '보는 중…'처럼 잠깐 보이고 마는 말풍선 (기록하지 않는다)
function bubble(text, reviewId = null, card = null, { keep = true } = {}) {
  const noticeId = keep ? remember({ text, reviewId, card }) : null;
  if (!state.dnd) send('bubble', { text, reviewId, card, noticeId });
}

// ---------- 창 ----------
// 원하는 대화창 크기를 화면에 맞게 줄인 창 크기
function windowSize(p = state.panelSize) {
  const area = screen.getPrimaryDisplay().workArea;
  const clamp = (v, lo, hi) => Math.round(Math.min(Math.max(Number(v) || lo, lo), hi));
  const w = clamp(p?.w ?? PANEL.w, PANEL.minW, Math.min(PANEL.maxW, area.width - EDGE_W - 24));
  const h = clamp(p?.h ?? PANEL.h, PANEL.minH, area.height - EDGE_H);
  return { width: w + EDGE_W, height: h + EDGE_H };
}

function createWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  const { width: W, height: H } = windowSize();
  const pos = state.position || { x: area.x + area.width - W - 12, y: area.y + area.height - H };
  win = new BrowserWindow({
    width: W, height: H, x: pos.x, y: pos.y,
    transparent: true, frame: false, resizable: false, hasShadow: false,
    alwaysOnTop: true, skipTaskbar: true, fullscreenable: false, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true }); // 캐릭터 밖은 클릭이 뒤로 통과
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.showInactive());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', e => e.preventDefault());
}

function resetPosition() {
  delete state.position;
  saveState();
  const area = screen.getPrimaryDisplay().workArea;
  const [W, H] = win.getSize();
  win.setPosition(area.x + area.width - W - 12, area.y + area.height - H);
}

// 캐릭터 그림: characterDir(없으면 기본 엔젤이) 의 idle/thinking/warn/happy/sleep 파일을 data URL 로.
// 그림이 하나도 없으면 renderer 의 SVG 캐릭터를 쓴다.
function characterImages() {
  const dir = config.characterDir || path.join(__dirname, 'characters', 'angel');
  const out = {};
  for (const m of MOODS) {
    for (const [ext, mime] of Object.entries(IMAGE_TYPES)) {
      const f = path.join(dir, m + ext);
      if (fs.existsSync(f)) { out[m] = `data:${mime};base64,${fs.readFileSync(f).toString('base64')}`; break; }
    }
  }
  return out.idle ? out : null; // idle 이 없으면 기본 캐릭터
}

// ---------- 캐릭터 바꾸기 (메뉴) ----------
const hasIdle = dir => Object.keys(IMAGE_TYPES).some(ext => fs.existsSync(path.join(dir, 'idle' + ext)));

function useCharacter(dir) {
  config.characterDir = dir;
  saveJson(CONFIG_FILE, config);
  send('reload');
  buildTray();
}

// 사진 속 주인공만 따기: macOS Vision(사진 앱 '피사체 복사'와 같은 기능)을 osascript 로 부른다. AI·네트워크를 쓰지 않는다.
function liftSubject(src, dst) {
  return new Promise(resolve => {
    execFile('osascript', ['-l', 'JavaScript', path.join(__dirname, 'native', 'lift-subject.js'), src, dst],
      { timeout: 30000 }, (err, stdout) => resolve(!err && stdout.trim() === 'ok' && fs.existsSync(dst)));
  });
}

// 그림 한 장을 내 캐릭터 폴더에 넣는다. 화면에는 240×264 로 보이니 높이 528px 로 줄여 png 로 저장한다.
// 누끼: 단색 배경 그림은 색으로 지우고, 사진은 맥 Vision 으로 주인공만 딴다. 못 따면 원본을 그대로 쓴다.
// gif·svg 는 그대로 복사한다. 배경을 지웠으면 true.
async function cutout(src, destNoExt) {
  const ext = path.extname(src).toLowerCase();
  let img = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext) ? nativeImage.createFromPath(src) : null;
  if (!img || img.isEmpty()) { fs.copyFileSync(src, destNoExt + ext); return false; }
  const fit = im => (im.getSize().height > 528 ? im.resize({ height: 528, quality: 'best' }) : im);
  img = fit(img); // 큰 사진을 원래 크기로 계산하면 메인 스레드(메뉴·말풍선)가 멈춘다
  const { width, height } = img.getSize();
  const bitmap = { width, height, data: img.toBitmap() };
  const method = cutoutMethod(bitmap);
  let out = img;
  let changed = false;
  if (method === 'flat') {
    const r = removeBackground(bitmap);
    if (r.changed) { out = nativeImage.createFromBitmap(r.data, { width: r.width, height: r.height }); changed = true; }
  } else if (method === 'photo') {
    const lifted = destNoExt + '.lift.png';
    if (await liftSubject(src, lifted)) {
      const li = nativeImage.createFromPath(lifted);
      if (!li.isEmpty()) { out = fit(li); changed = true; }
    }
    fs.rmSync(lifted, { force: true });
  }
  fs.writeFileSync(destNoExt + '.png', out.toPNG());
  return changed;
}

// 누끼에 사진마다 최대 30초가 걸린다. 그동안 또 누르면 두 작업이 같은 .new 폴더를 쓰니 하나씩만 한다.
let picking = false;
async function pickCharacter() {
  if (picking) return;
  picking = true;
  buildTray();
  try { await replaceCharacter(); } finally { picking = false; buildTray(); }
}

// 그림을 골라 표정별로 나눠 내 캐릭터 폴더에 복사한다. 원본을 옮기거나 지워도 그대로 보이게.
async function replaceCharacter() {
  const r = await dialog.showOpenDialog({
    title: '캐릭터 그림 고르기',
    message: '한 장이면 모든 표정에 씁니다. 여러 장이면 파일 이름(idle·thinking·warn·happy·sleep 또는 기본·생각·놀람·신남·졸림)으로 나눕니다.',
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: '그림', extensions: Object.keys(IMAGE_TYPES).map(e => e.slice(1)) }],
  });
  if (r.canceled || !r.filePaths.length) return;
  const { plan, skipped } = planImport(r.filePaths.map(p => ({ path: p, size: fs.statSync(p).size })));
  const why = skipped.map(x => `· ${path.basename(x.file)}: ${x.reason}`).join('\n');
  if (!plan) { dialog.showErrorBox('캐릭터를 바꾸지 못했습니다', why || '쓸 수 있는 그림이 없습니다.'); return; }
  // 새 폴더를 옆에 다 만든 뒤 갈아 끼운다: 기존 것을 .old 로 옮기고 → 새것을 넣고 → .old 정리.
  // 어느 단계에서 실패해도 기존 캐릭터가 남는다.
  const tmp = MY_CHAR_DIR + '.new';
  const old = MY_CHAR_DIR + '.old';
  let cut = 0;
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.mkdirSync(tmp, { recursive: true });
    for (const [mood, src] of Object.entries(plan)) cut += (await cutout(src, path.join(tmp, mood))) ? 1 : 0;
    fs.rmSync(old, { recursive: true, force: true });
    if (fs.existsSync(MY_CHAR_DIR)) fs.renameSync(MY_CHAR_DIR, old);
    try {
      fs.renameSync(tmp, MY_CHAR_DIR);
    } catch (e) {
      if (fs.existsSync(old)) fs.renameSync(old, MY_CHAR_DIR); // 되돌리기
      throw e;
    }
  } catch (e) {
    fs.rmSync(tmp, { recursive: true, force: true });
    dialog.showErrorBox('캐릭터를 바꾸지 못했습니다', `그림을 처리하다 문제가 생겼습니다. 지금 캐릭터는 그대로입니다.\n${e.message}`);
    return;
  }
  try { fs.rmSync(old, { recursive: true, force: true }); } catch { /* 새 캐릭터는 이미 들어갔다. 남은 .old 는 다음에 지운다 */ }
  useCharacter(MY_CHAR_DIR);
  const n = Object.keys(plan).length;
  bubble(`새 모습입니다! 표정 ${n}개를 넣었습니다.${cut ? ` 배경 ${cut}장을 지웠습니다.` : ''}${n < 5 ? ' 없는 표정은 평소 그림으로 보입니다.' : ''}${why ? '\n건너뛴 그림:\n' + why : ''}`, null, null, { keep: false });
}

function characterMenu() {
  const dir = config.characterDir;
  const custom = dir && dir !== MY_CHAR_DIR; // 설정 파일에 직접 적은 폴더
  return [
    { label: '엔젤이 (기본)', type: 'radio', checked: !dir, click: () => useCharacter(null) },
    { label: '내 캐릭터', type: 'radio', checked: dir === MY_CHAR_DIR, enabled: hasIdle(MY_CHAR_DIR), click: () => useCharacter(MY_CHAR_DIR) },
    ...(custom ? [{ label: `설정 파일의 폴더 (${path.basename(dir)})`, type: 'radio', checked: true }] : []),
    { type: 'separator' },
    { label: picking ? '그림 처리 중…' : '그림 골라서 바꾸기…', enabled: !picking, click: pickCharacter },
    { label: '내 캐릭터 폴더 열기', enabled: fs.existsSync(MY_CHAR_DIR), click: () => shell.openPath(MY_CHAR_DIR) },
  ];
}

// ---------- AI 호출 한도 ----------
function takeQuota() {
  if (usage.take(today())) { saveState(); return true; }
  bubble(`오늘 AI 호출 한도(${config.dailyLimit}번)를 다 썼습니다. 내일 다시 보겠습니다.`);
  return false;
}

// ---------- PR 감시 (gh 만 씀, AI 아님) ----------
function ghPRs(repo) {
  return new Promise(resolve => {
    execFile(config.ghPath || 'gh', ['pr', 'list', '--author', '@me', '--state', 'open', '--json', 'number,title,headRefOid,url,isDraft'],
      { cwd: repo, env, timeout: 30000 }, (err, stdout, stderr) => {
        if (err) return resolve({ error: (stderr || err.message).trim().split('\n')[0] });
        try { resolve({ prs: JSON.parse(stdout) }); } catch { resolve({ error: 'gh 출력을 읽지 못함' }); }
      });
  });
}

// only: 이 저장소만 확인. force: 이미 본 PR 도 다시 리뷰
async function poll({ only = null, force = false } = {}) {
  const notes = [];
  for (const repo of only ? [only] : config.repos) {
    const r = await ghPRs(repo);
    state.errors = state.errors || {};
    const first = !state.seen?.[repo]; // 처음 보는 저장소
    if (r.error) {
      state.errors[repo] = r.error;
      if (only) notes.push(`${repoName(repo)} PR 목록을 못 읽었습니다: ${r.error.slice(0, 100)}`);
      continue;
    }
    delete state.errors[repo];
    for (const n of closedPRs(state.seen?.[repo], r.prs)) tellClosed(repo, n);
    openPRs[repo] = r.prs;
    const { toReview, seen } = diffPRs(force ? {} : (state.seen?.[repo] ?? null), r.prs, { reviewDrafts: config.reviewDrafts });
    state.seen = { ...state.seen, [repo]: seen };
    if (first && !force) notes.push(baselineNote(repoName(repo), seen)); // 처음엔 기준만 잡고 무엇을 건너뛰었는지 알린다
    for (const item of toReview) enqueue(repo, item.pr, item.reason);
  }
  saveState();
  buildTray();
  // 직접 누른 확인(only)의 결과는 늘 보여 준다. 자동 확인은 곧 뜰 리뷰 말풍선을 덮지 않게 큐가 빌 때만
  if (notes.length && (only || !queue.length)) bubble(notes.join('\n'));
  work();
}

// 지켜보던 PR 이 목록에서 사라지면 머지됐는지 닫혔는지 물어 알린다 (gh 만 씀)
function tellClosed(repo, number) {
  execFile(config.ghPath || 'gh', ['pr', 'view', String(number), '--json', 'state,title'], { cwd: repo, env, timeout: 30000 }, (err, stdout) => {
    let pr;
    try { pr = JSON.parse(stdout); } catch { return; }
    const text = !err && closedText(repoName(repo), number, pr, myName());
    if (text) bubble(text);
  });
}

// 메뉴에서 고른 PR 하나만 리뷰 (최신 커밋 기준)
async function reviewOne(repo, number) {
  const r = await ghPRs(repo);
  if (r.prs) { openPRs[repo] = r.prs; buildTray(); } // 고르는 김에 메뉴 목록도 새로 고친다
  const pr = r.prs?.find(p => p.number === number);
  if (!pr) {
    bubble(r.error ? `${repoName(repo)} PR 목록을 못 읽었습니다: ${r.error.slice(0, 100)}` : `${repoName(repo)} PR #${number}을 찾지 못했습니다. 닫혔을 수 있습니다.`);
    return;
  }
  state.seen = { ...state.seen, [repo]: seenAfterPick(state.seen?.[repo], r.prs, pr, { reviewDrafts: config.reviewDrafts }) };
  saveState();
  enqueue(repo, pr, 'manual');
  work();
}

function enqueue(repo, pr, reason) {
  const dup = queue.findIndex(q => q.repo === repo && q.pr.number === pr.number);
  if (dup >= 0) queue.splice(dup, 1); // 같은 PR 은 최신 푸시만 본다
  queue.push({ repo, pr, reason });
}

async function work() {
  if (working || state.dnd) return;
  working = true;
  while (queue.length && !state.dnd) {
    if (!takeQuota()) { queue.length = 0; break; }
    await runReview(queue.shift());
  }
  working = false;
  // 표정은 되돌리지 않는다. 리뷰 결과 표정(경고·칭찬)은 말풍선이 사라질 때 화면 쪽에서 평소로 돌린다.
}

// ---------- AI ① PR 리뷰 ----------
const REASON = { new: ' 새 PR', updated: ' 새 푸시', manual: '' };
async function runReview({ repo, pr, reason }) {
  mood('thinking');
  bubble(`${repoName(repo)} PR #${pr.number}${REASON[reason] || ''} 보는 중…`, null, null, { keep: false });
  const r = await runClaude({ prompt: `/sasu:review ${pr.number}`, name: myName(), model: config.reviewModel, cwd: repo, claudePath: config.claudePath || 'claude', env, sasuScript });
  const id = `${repoName(repo)}-${pr.number}-${pr.headRefOid.slice(0, 7)}`;
  fs.mkdirSync(REVIEW_DIR, { recursive: true });
  fs.writeFileSync(path.join(REVIEW_DIR, id + '.md'), r.text);
  if (r.isError) {
    bubble(`PR #${pr.number} 리뷰를 못 했습니다: ${r.text.slice(0, 120)}`);
    mood('idle');
    return;
  }
  const s = summarize(r.text);
  state.reviews = [{ id, repo, number: pr.number, title: pr.title, url: pr.url, line: s.line, date: new Date().toISOString() },
    ...(state.reviews || []).filter(x => x.id !== id)].slice(0, 30);
  saveState();
  buildTray();
  mood(s.mood);
  const text = `PR #${pr.number} ${pr.title}\n${s.line}${s.top ? `\n· ${s.top}` : ''}`;
  bubble(text, id, bubbleCard({ repo: repoName(repo), number: pr.number, title: pr.title }, s));
  if (Notification.isSupported()) {
    const n = new Notification({ title: `사수 리뷰: ${repoName(repo)} #${pr.number}`, body: s.line, silent: true });
    n.on('click', () => send('open-review', id));
    n.show();
  }
}

// ---------- 화면과 주고받기 ----------
// 우리 창(로컬 파일)에서 온 요청만 받는다.
const fromApp = e => win && e.sender === win.webContents && (e.senderFrame?.url || '').startsWith('file://');
const on = (ch, fn) => ipcMain.on(ch, (e, ...a) => { if (fromApp(e)) fn(...a); });
const handle = (ch, fn) => ipcMain.handle(ch, (e, ...a) => (fromApp(e) ? fn(...a) : null));
const MAX_CHAT = 4000;

on('ui:interactive', v => win.setIgnoreMouseEvents(!v, { forward: true }));
on('ui:drag', d => {
  const dx = Number(d?.dx);
  const dy = Number(d?.dy);
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) > 500 || Math.abs(dy) > 500) return;
  const [x, y] = win.getPosition();
  win.setPosition(Math.round(x + dx), Math.round(y + dy));
});
on('ui:drag-end', () => {
  const [x, y] = win.getPosition();
  state.position = { x, y };
  saveState();
});
on('ui:focus', () => win.focus());

// 대화창 크기: 오른쪽 아래(캐릭터 자리)는 그대로 두고 왼쪽·위로 늘리고 줄인다
function resizePanel(p) {
  const { width, height } = windowSize(p);
  const b = win.getBounds();
  win.setBounds({ x: b.x + b.width - width, y: b.y + b.height - height, width, height });
}
on('ui:resize', p => resizePanel({ w: p?.w, h: p?.h }));
on('ui:resize-end', () => {
  const b = win.getBounds();
  state.panelSize = { w: b.width - EDGE_W, h: b.height - EDGE_H };
  state.position = { x: b.x, y: b.y };
  saveState();
});
on('ui:resize-reset', () => {
  delete state.panelSize;
  resizePanel(null);
  const [x, y] = win.getPosition();
  state.position = { x, y };
  saveState();
});

// 인사말에 쓸 GitHub 계정명. 한 번 알아내면 state 에 둔다 (gh 만 씀, AI 아님)
function loadGhLogin() {
  execFile(config.ghPath || 'gh', ['api', 'user', '--jq', '.login'], { env, timeout: 15000 }, (err, stdout) => {
    const login = !err && stdout.trim();
    if (login && /^[A-Za-z0-9-]{1,39}$/.test(login) && login !== state.ghLogin) {
      state.ghLogin = login;
      saveState();
      send('reload');
    }
  });
}

handle('app:info', () => ({
  greeting: greeting({ me: myName(), hasRepos: config.repos.length > 0, askName: needsName(config) }),
  askName: needsName(config),
  repos: config.repos.map(r => ({ path: r, name: repoName(r) })),
  left: usage.left(today()),
  dnd: Boolean(state.dnd),
  character: characterImages(),
  reviews: state.reviews || [],
  unread: unreadCount(state.notices),
}));

// 지나간 알림: 날짜별로. 리뷰 기록이 남아 있는 것만 눌러서 열 수 있다.
handle('notices:get', () => {
  const live = new Set((state.reviews || []).map(r => r.id));
  return groupByDay((state.notices || []).map(n => ({ ...n, reviewId: live.has(n.reviewId) ? n.reviewId : null })));
});

// 읽음 표시: id 하나, 또는 없으면 모두
on('notices:read', id => {
  if (!state.notices?.length) return;
  state.notices = state.notices.map(n => (!id || n.id === id ? { ...n, read: true } : n));
  saveState();
  send('notices', unreadCount(state.notices));
  buildTray();
});

// 부를 이름 저장. 빈 값이면 '건너뜀'으로 남겨 다시 묻지 않고 GitHub 계정명을 쓴다
handle('name:set', raw => {
  if (typeof raw !== 'string') return null;
  config.displayName = callName(raw);
  saveJson(CONFIG_FILE, config);
  buildTray();
  return { reply: nameReply(myName(), Boolean(config.displayName)) };
});

// ---------- AI ② 대화 ----------
handle('chat:send', async msg => {
  const text = typeof msg?.text === 'string' ? msg.text.trim().slice(0, MAX_CHAT) : '';
  if (!text) return null;
  if (chatBusy) return { html: renderMarkdown('앞 질문에 답하는 중입니다. 조금만 기다려 주십시오.'), isError: true };
  const cwd = config.repos.includes(msg.repo) ? msg.repo : (config.repos[0] || app.getPath('home'));
  if (!takeQuota()) return { html: renderMarkdown('오늘 한도를 다 썼습니다.'), isError: true };
  chatBusy = true;
  mood('thinking');
  state.sessions = state.sessions || {};
  const r = await runClaude({
    prompt: text, name: myName(), model: config.chatModel, agent: 'sasu:senior-dev', resume: state.sessions[cwd],
    cwd, claudePath: config.claudePath || 'claude', env, sasuScript,
  });
  chatBusy = false;
  if (!r.isError && r.sessionId) { state.sessions[cwd] = r.sessionId; saveState(); }
  mood('idle');
  return { html: renderMarkdown(r.text || '(빈 답)'), isError: r.isError, left: usage.left(today()) };
});

handle('chat:reset', repo => {
  if (state.sessions && config.repos.includes(repo)) delete state.sessions[repo];
  saveState();
  return true;
});

handle('review:get', id => {
  const meta = (state.reviews || []).find(r => r.id === id);
  if (!meta) return null; // 기록에 있는 리뷰만 연다
  const f = path.join(REVIEW_DIR, path.basename(id) + '.md');
  if (!fs.existsSync(f)) return null;
  return { meta, html: renderMarkdown(fs.readFileSync(f, 'utf8')), card: reviewCardFor(meta) };
});

on('review:open-pr', id => {
  const meta = (state.reviews || []).find(r => r.id === id);
  if (meta && /^https:\/\/github\.com\//.test(meta.url)) shell.openExternal(meta.url);
});

// ---------- 맥 켤 때 사수도 켜기 ----------
// 고른 캐릭터·설정은 앱을 껐다 켜도 남는다. 맥을 다시 켰을 때 앱이 안 떠 있으면 안 보일 뿐이라, 로그인할 때 켜 준다.
const AGENT_FILE = path.join(app.getPath('home'), 'Library', 'LaunchAgents', `${LABEL}.plist`);
const autoStartOn = () => fs.existsSync(AGENT_FILE);
function setAutoStart(on) {
  try {
    if (on) {
      fs.mkdirSync(path.dirname(AGENT_FILE), { recursive: true });
      fs.writeFileSync(AGENT_FILE, launchAgentPlist(process.execPath, app.isPackaged ? [] : [app.getAppPath()]));
    } else {
      fs.rmSync(AGENT_FILE, { force: true });
    }
  } catch (e) {
    dialog.showErrorBox('설정을 바꾸지 못했습니다', e.message);
  }
  buildTray();
}

// ---------- 트레이 메뉴 ----------
async function addRepo() {
  const r = await dialog.showOpenDialog({ title: '지켜볼 저장소 폴더', properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return;
  const repo = r.filePaths[0];
  if (!fs.existsSync(path.join(repo, '.git'))) {
    dialog.showErrorBox('git 저장소가 아닙니다', `${repo} 에 .git 폴더가 없습니다.`);
    return;
  }
  if (!config.repos.includes(repo)) config.repos.push(repo);
  saveJson(CONFIG_FILE, config);
  send('reload'); // 대화창 저장소 목록 새로 고침
  await poll({ only: repo }); // 처음엔 기준만 잡고, 건너뛴 PR 을 말풍선으로 알린다
}

function removeRepo(repo) {
  config.repos = config.repos.filter(r => r !== repo);
  if (state.seen) delete state.seen[repo];
  delete openPRs[repo];
  saveJson(CONFIG_FILE, config);
  saveState();
  send('reload');
  buildTray();
}

function setDnd(on) {
  state.dnd = on;
  saveState();
  mood(on ? 'sleep' : 'idle');
  send('dnd', on);
  if (!on) work();
  buildTray();
}

function prItems(repo) {
  const prs = openPRs[repo];
  if (!prs) return [{ label: 'PR 목록 확인 전', enabled: false }];
  if (!prs.length) return [{ label: '열린 내 PR 없음', enabled: false }];
  const ready = readyCount(prs, { reviewDrafts: config.reviewDrafts });
  return [
    { label: '리뷰할 PR 고르기', submenu: prs.map(pr => ({ label: prLabel(pr), click: () => reviewOne(repo, pr.number) })) },
    { label: `열린 내 PR 모두 리뷰 (${ready}개)`, enabled: ready > 0, click: () => poll({ only: repo, force: true }) },
  ];
}

function buildTray() {
  if (!tray) return;
  const errors = state.errors || {};
  const menu = Menu.buildFromTemplate([
    { label: `오늘 남은 AI 호출 ${usage.left(today())} / ${config.dailyLimit}`, enabled: false },
    { type: 'separator' },
    { label: '지켜보는 저장소', submenu: config.repos.length ? config.repos.map(r => ({
      label: `${repoName(r)}${errors[r] ? ' ⚠' : ''}`,
      submenu: [
        ...(errors[r] ? [{ label: errors[r].slice(0, 60), enabled: false }] : []),
        ...prItems(r),
        { label: '빼기', click: () => removeRepo(r) },
      ],
    })) : [{ label: '없음', enabled: false }] },
    { label: '저장소 추가…', click: addRepo },
    { label: '지금 PR 확인', click: () => poll() },
    { type: 'separator' },
    { label: `지나간 알림 보기${unreadCount(state.notices) ? ` (새 알림 ${unreadCount(state.notices)})` : ''}`, click: () => send('open-notices') },
    { label: '최근 리뷰', submenu: (state.reviews || []).length ? state.reviews.slice(0, 10).map(r => ({
      label: `${repoName(r.repo)} #${r.number} · ${r.line}`, click: () => send('open-review', r.id),
    })) : [{ label: '없음', enabled: false }] },
    { label: '캐릭터', submenu: characterMenu() },
    { label: `부를 이름 바꾸기…${myName() ? ` (지금: ${myName()}님)` : ''}`, click: () => send('ask-name') },
    { label: '방해 금지', type: 'checkbox', checked: Boolean(state.dnd), click: m => setDnd(m.checked) },
    { label: '캐릭터 숨기기', type: 'checkbox', checked: !win.isVisible(), click: m => (m.checked ? win.hide() : win.showInactive()) },
    { label: '캐릭터 위치 처음으로', click: resetPosition },
    { label: '맥 켤 때 사수도 켜기', type: 'checkbox', checked: autoStartOn(), click: m => setAutoStart(m.checked) },
    { type: 'separator' },
    { label: '설정 파일 열기', click: () => shell.openPath(CONFIG_FILE) },
    { label: '설정 다시 읽기', click: reloadConfig },
    { label: '종료', role: 'quit' },
  ]);
  tray.setContextMenu(menu);
}

function reloadConfig() {
  config = withDefaults(loadJson(CONFIG_FILE, {}));
  saveJson(CONFIG_FILE, config);
  usage = new Usage(state.usage, config.dailyLimit);
  clearInterval(pollTimer);
  pollTimer = setInterval(poll, config.pollSeconds * 1000);
  send('reload');
  buildTray();
}

app.whenReady().then(() => {
  config = withDefaults(loadJson(CONFIG_FILE, {}));
  saveJson(CONFIG_FILE, config); // 처음 켜면 기본 설정 파일을 만든다
  state = loadJson(STATE_FILE, {});
  state.usage = state.usage || {};
  if (!state.notices) state.notices = seedFromReviews(state.reviews, reviewCardFor);
  usage = new Usage(state.usage, config.dailyLimit);
  env = loginEnv();
  sasuScript = config.sasuScript
    || findSasuScript(loadJson(path.join(app.getPath('home'), '.claude', 'plugins', 'installed_plugins.json'), null), fs.existsSync);
  if (app.dock) app.dock.hide();

  createWindow();
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle('사수');
  tray.setToolTip('AI 사수');
  buildTray();

  pollTimer = setInterval(poll, config.pollSeconds * 1000);
  setTimeout(poll, 3000);
  loadGhLogin();

  // 미리보기: SASU_DEMO=1 npm start → 표정 다섯 가지와 말풍선을 차례로 보여 준다 (AI 안 씀)
  if (process.env.SASU_DEMO) {
    let i = 0;
    const lines = ['안녕하십니까, 사수입니다.', 'PR #12 보는 중…', 'PR #12 환불 처리\n막힘 · 반드시 2 · 권장 1\n· 환불이 실패해도 "환불됨"으로 처리됩니다', 'PR #13 머지 가능 · 깔끔합니다!', '방해 금지 중입니다 zZ'];
    setInterval(() => { win.webContents.send('mood', MOODS[i % 5]); win.webContents.send('bubble', { text: lines[i % 5] }); i++; }, 2500);
  }
});

app.on('window-all-closed', e => e.preventDefault());
