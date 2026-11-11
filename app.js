// 쉽게보는 세금 — 화면 동작
// 일정·체크리스트는 data.js에서 오고, 체크 상태만 이 브라우저(localStorage)에 저장한다.

const STORE_KEY = "easytax-checks-v1";
const SOON_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

// ---------- 날짜 도우미 ----------
function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function todayDate() {
  if (DEMO_TODAY) return parseDate(DEMO_TODAY);
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}
function ymd(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
function korDate(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEK[date.getDay()]})`;
}
function daysLeft(item) {
  return Math.round((parseDate(item.due) - todayDate()) / DAY_MS);
}
function ddayText(n) {
  if (n === 0) return "오늘 마감";
  return n > 0 ? `D-${n}` : `${-n}일 지남`;
}

// ---------- 체크 상태 ----------
let checks = {};
try { checks = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { checks = {}; }
function saveChecks() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(checks)); } catch { /* 저장 불가 환경이면 이번 화면에서만 유지 */ }
}

// '해당 없음'으로 끈 세금 종류
const HIDDEN_KEY = "easytax-hidden-v1";
let hidden = new Set();
try { hidden = new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY)) || []); } catch { hidden = new Set(); }
function setHidden(type, off) {
  if (off) hidden.add(type); else hidden.delete(type);
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hidden])); } catch { /* 이번 화면에서만 유지 */ }
}
function visible() {
  return SCHEDULES.filter((s) => !hidden.has(s.type));
}

// 세금 종류별 '우리 담당자' 메모
const MEMO_KEY = "easytax-contacts-v1";
let memos = {};
try { memos = JSON.parse(localStorage.getItem(MEMO_KEY)) || {}; } catch { memos = {}; }
function saveMemo(type, text) {
  if (text.trim()) memos[type] = text.trim(); else delete memos[type];
  try { localStorage.setItem(MEMO_KEY, JSON.stringify(memos)); } catch { /* 이번 화면에서만 유지 */ }
}

// "031-934-6361~6370 / 6381~6389" → 첫 번호 "031-934-6361"
function firstTel(tel) {
  const m = tel.match(/\d{2,4}-\d{3,4}-\d{4}/);
  return m ? m[0] : null;
}
function telLink(tel) {
  const num = firstTel(tel);
  if (!num) return document.createTextNode(tel);
  const a = el("a", "", tel);
  a.href = `tel:${num.replace(/-/g, "")}`;
  return a;
}

function itemsOf(s) {
  return [...TAX_TYPES[s.type].checklist, ...(s.extra || [])];
}
function isChecked(s, text) {
  // 이 브라우저에서 아직 손대지 않은 일정은 data.js의 done 값을 따른다
  if (!checks[s.id]) return Boolean(s.done);
  return Boolean(checks[s.id][text]);
}
function progress(s) {
  const items = itemsOf(s);
  const done = items.filter((t) => isChecked(s, t)).length;
  return { done, total: items.length, complete: done === items.length };
}
function setChecked(s, text, value) {
  if (!checks[s.id]) {
    // 처음 손댈 때 지금 보이는 상태(done 기본값 포함)를 그대로 옮겨 둔다
    checks[s.id] = {};
    itemsOf(s).forEach((t) => { if (s.done) checks[s.id][t] = true; });
  }
  if (value) checks[s.id][text] = true; else delete checks[s.id][text];
  // done 일정은 '모두 해제'도 기억해야 하므로 빈 상태를 남긴다
  if (Object.keys(checks[s.id]).length === 0 && !s.done) delete checks[s.id];
  saveChecks();
}

// ---------- 그리기 ----------
const soonBox = document.getElementById("soon");
const calBox = document.getElementById("calendar");
const monthTitle = document.getElementById("month-title");
let viewYear = todayDate().getFullYear();
let viewMonth = todayDate().getMonth();
let openId = null;

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}
function colorOf(s) { return TAX_TYPES[s.type].color; }

function renderSoon() {
  const list = visible()
    .filter((s) => !progress(s).complete && daysLeft(s) <= SOON_DAYS)
    .sort((a, b) => a.due.localeCompare(b.due));

  soonBox.replaceChildren();
  if (list.length === 0) {
    soonBox.append(el("p", "empty", "7일 안에 마감되는 일이 없어요. 👍"));
    return;
  }
  for (const s of list) {
    const n = daysLeft(s);
    const p = progress(s);
    const card = el("button", "card" + (n < 0 ? " overdue" : ""));
    card.type = "button";
    card.style.setProperty("--c", colorOf(s));
    card.append(
      el("span", "dday", ddayText(n)),
      el("span", "title", s.title),
      el("span", "meta", `${TAX_TYPES[s.type].name} · ${korDate(parseDate(s.due))} · 체크 ${p.done}/${p.total}`)
    );
    card.addEventListener("click", () => openDetail(s.id));
    soonBox.append(card);
  }
}

function renderCalendar() {
  monthTitle.textContent = `${viewYear}년 ${viewMonth + 1}월`;
  const first = new Date(viewYear, viewMonth, 1);
  const start = new Date(viewYear, viewMonth, 1 - first.getDay());
  const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = Math.ceil((first.getDay() + lastDay) / 7) * 7;
  const todayStr = ymd(todayDate());

  calBox.replaceChildren();
  for (let i = 0; i < cells; i++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const key = ymd(date);
    const cell = el("div", "day");
    if (date.getMonth() !== viewMonth) cell.classList.add("other");
    if (key === todayStr) cell.classList.add("today");

    const num = el("span", "num", String(date.getDate()));
    if (date.getDay() === 0) num.classList.add("sun");
    if (date.getDay() === 6) num.classList.add("sat");
    cell.append(num);

    for (const s of visible().filter((x) => x.due === key)) {
      const p = progress(s);
      const chip = el("button", "chip");
      chip.append(el("span", "chip-title", `${p.complete ? "✓ " : ""}${s.title}`), el("span", "chip-count", `${p.done}/${p.total}`));
      chip.type = "button";
      chip.title = `${s.title} — 체크 ${p.done}/${p.total}`;
      chip.style.setProperty("--c", colorOf(s));
      if (p.complete) chip.classList.add("done");
      else if (daysLeft(s) < 0) chip.classList.add("overdue");
      chip.addEventListener("click", () => openDetail(s.id));
      cell.append(chip);
    }
    calBox.append(cell);
  }
}

function renderStatus() {
  const body = document.getElementById("status");
  body.replaceChildren();
  for (const [type, t] of Object.entries(TAX_TYPES)) {
    const list = SCHEDULES.filter((s) => s.type === type).sort((a, b) => a.due.localeCompare(b.due));
    const doneCount = list.filter((s) => progress(s).complete).length;
    // 다음 기한: 아직 안 끝낸 일정 중 가장 이른 것(기한 지난 것 포함)
    const next = list.find((s) => !progress(s).complete);
    const off = hidden.has(type);

    const tr = el("tr", off ? "off" : "");
    tr.style.setProperty("--c", t.color);

    const name = el("td", "tax", t.name);
    if (t.appliesTo) name.append(el("span", "cond", `해당: ${t.appliesTo}`));
    const officeTd = el("td", "", t.office);
    const orgs = [...new Set((t.contacts || []).map((c) => AGENCIES[c.agency].name))];
    if (orgs.length) officeTd.append(el("span", "cond", `관할: ${orgs.join(", ")}`));
    tr.append(name, el("td", "", t.cycle), officeTd);

    const nextTd = el("td");
    if (next) {
      const n = daysLeft(next);
      const btn = el("button", "next" + (n < 0 ? " overdue" : ""), `${next.due.replace(/-/g, ".")} · ${ddayText(n)}`);
      btn.type = "button";
      btn.title = next.title;
      btn.addEventListener("click", () => openDetail(next.id));
      nextTd.append(btn, el("span", "cond", next.title));
    } else {
      nextTd.textContent = "모두 완료";
    }
    tr.append(nextTd);

    const prog = el("td");
    const bar = el("span", "bar");
    const fill = el("i");
    fill.style.width = `${list.length ? (doneCount / list.length) * 100 : 0}%`;
    bar.append(fill);
    prog.append(bar, document.createTextNode(`${doneCount}/${list.length}건`));
    tr.append(prog);

    const onTd = el("td");
    const box = el("input");
    box.type = "checkbox";
    box.checked = !off;
    box.setAttribute("aria-label", `${t.name} 우리 기관 해당`);
    box.addEventListener("change", () => { setHidden(type, !box.checked); refresh(); });
    onTd.append(box);
    tr.append(onTd);

    body.append(tr);
  }
}

function renderAgencies() {
  const box = document.getElementById("agencies");
  box.replaceChildren();
  for (const a of Object.values(AGENCIES)) {
    const card = el("article", "agency");
    const dl = el("dl");
    const row = (k, v) => {
      if (!v) return;
      const dd = el("dd");
      dd.append(typeof v === "string" ? document.createTextNode(v) : v);
      dl.append(el("dt", "", k), dd);
    };
    row("주소", a.address);
    row("대표전화", telLink(a.tel));
    row("팩스", a.fax);
    row("관할", a.area);

    const links = el("div", "links");
    const home = el("a", "", "홈페이지");
    home.href = a.homepage; home.target = "_blank"; home.rel = "noopener";
    const map = el("a", "", "지도 보기");
    map.href = `https://map.kakao.com/?q=${encodeURIComponent(a.address.replace(/^\(\d+\)\s*/, ""))}`;
    map.target = "_blank"; map.rel = "noopener";
    links.append(home, map);

    card.append(el("h3", "", a.name), el("p", "kind", a.kind), dl, links, el("p", "note", a.note));
    box.append(card);
  }
}

function renderLegend() {
  const box = document.getElementById("legend");
  box.replaceChildren(
    ...Object.entries(TAX_TYPES).filter(([k]) => !hidden.has(k)).map(([, t]) => {
      const span = el("span", "", t.name);
      span.style.setProperty("--c", t.color);
      return span;
    }),
    el("span", "", "✓ 완료")
  );
  box.lastChild.style.setProperty("--c", "#eceef1");
}

// ---------- 상세(체크리스트) ----------
const dialog = document.getElementById("detail");

function openDetail(id) {
  if (openId !== id) document.getElementById("d-how").open = false;
  openId = id;
  renderDetail();
  if (!dialog.open) dialog.showModal();
}

function renderDetail() {
  const s = SCHEDULES.find((x) => x.id === openId);
  if (!s) return;
  const p = progress(s);
  const n = daysLeft(s);
  dialog.style.setProperty("--c", colorOf(s));

  document.getElementById("d-type").textContent = TAX_TYPES[s.type].name;
  document.getElementById("d-title").textContent = s.title;
  const due = document.getElementById("d-due");
  due.textContent = `기한 ${korDate(parseDate(s.due))} · ${p.complete ? "완료" : ddayText(n)}`;
  due.classList.toggle("overdue", !p.complete && n < 0);
  document.getElementById("d-basis").textContent = s.basis;
  document.getElementById("d-bar").style.width = `${(p.done / p.total) * 100}%`;
  document.getElementById("d-count").textContent = p.complete
    ? `모두 끝냈어요 (${p.done}/${p.total})`
    : `체크 ${p.done}/${p.total}`;

  const contactList = document.getElementById("d-contacts");
  contactList.replaceChildren(
    ...(TAX_TYPES[s.type].contacts || []).map((c) => {
      const li = el("li");
      li.append(
        el("span", "org", `${AGENCIES[c.agency].name} ${c.dept}`),
        document.createTextNode(" · "),
        telLink(c.tel),
        el("span", "work", c.work)
      );
      return li;
    })
  );
  const my = document.getElementById("d-my");
  my.value = memos[s.type] || "";
  my.dataset.type = s.type;

  const how = TAX_TYPES[s.type].howTo;
  const where = document.getElementById("d-where");
  where.textContent = how.where;
  where.href = how.link;
  document.getElementById("d-steps").replaceChildren(...how.steps.map((t) => el("li", "", t)));
  document.getElementById("d-tip").textContent = how.tip || "";
  document.getElementById("d-tip").hidden = !how.tip;

  const list = document.getElementById("d-list");
  list.replaceChildren();
  for (const text of itemsOf(s)) {
    const li = el("li");
    const label = el("label");
    const box = el("input");
    box.type = "checkbox";
    box.checked = isChecked(s, text);
    box.addEventListener("change", () => { setChecked(s, text, box.checked); refresh(); });
    label.append(box, el("span", "", text));
    li.append(label);
    list.append(li);
  }
}

document.getElementById("d-all").addEventListener("click", () => {
  const s = SCHEDULES.find((x) => x.id === openId);
  itemsOf(s).forEach((t) => setChecked(s, t, true));
  refresh();
});
document.getElementById("d-reset").addEventListener("click", () => {
  const s = SCHEDULES.find((x) => x.id === openId);
  itemsOf(s).forEach((t) => setChecked(s, t, false));
  refresh();
});
// 담당자 메모는 입력하는 대로 저장 (같은 세금 종류의 다른 일정에도 똑같이 보임)
document.getElementById("d-my").addEventListener("input", (e) => {
  saveMemo(e.target.dataset.type, e.target.value);
});
// 바깥(어두운 부분)을 누르면 닫기
dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });

// ---------- 달 이동 ----------
function moveMonth(delta) {
  const d = new Date(viewYear, viewMonth + delta, 1);
  viewYear = d.getFullYear();
  viewMonth = d.getMonth();
  renderCalendar();
}
document.getElementById("prev").addEventListener("click", () => moveMonth(-1));
document.getElementById("next").addEventListener("click", () => moveMonth(1));
document.getElementById("this-month").addEventListener("click", () => {
  viewYear = todayDate().getFullYear();
  viewMonth = todayDate().getMonth();
  renderCalendar();
});

function refresh() {
  renderSoon();
  renderStatus();
  renderCalendar();
  renderLegend();
  if (dialog.open) renderDetail();
}

document.getElementById("today").textContent =
  `오늘 ${korDate(todayDate())}` + (DEMO_TODAY ? " · 시험용 날짜" : "");
renderAgencies();
refresh();

// 바로가기 주소: index.html#month=2027-03 (그 달 달력) / #item=일정id (체크리스트 창) / #soon, #status, #calendar (그 칸으로 이동)
function openFromHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (!h) return;
  const [key, value] = h.split("=");
  if (key === "month" && /^\d{4}-\d{2}$/.test(value)) {
    const [y, m] = value.split("-").map(Number);
    viewYear = y; viewMonth = m - 1;
    renderCalendar();
    document.getElementById("calendar-box").scrollIntoView();
  } else if (key === "item" && SCHEDULES.some((s) => s.id === value)) {
    openDetail(value);
  } else {
    const target = document.getElementById({ soon: "soon-title", status: "status-title", calendar: "calendar-box", agency: "agency-title" }[key]);
    if (target) target.scrollIntoView();
  }
}
window.addEventListener("hashchange", openFromHash);
openFromHash();
