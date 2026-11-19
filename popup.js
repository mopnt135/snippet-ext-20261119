// 준트그래피(Juntgraphy) - 팝업 화면
// 저장된 이미지 목록을 보여 주고, 검색·메모 수정·주소 복사·삭제와 정리 안내를 처리한다.

const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const countEl = document.getElementById("count");
const template = document.getElementById("card-template");
const searchEl = document.getElementById("search");
const searchRowEl = document.getElementById("search-row");
const noResultEl = document.getElementById("no-result");
const noticeEl = document.getElementById("notice");
const noticeTitleEl = document.getElementById("notice-title");
const noticeTextEl = document.getElementById("notice-text");
const noticeCloseEl = document.getElementById("notice-close");

const pagerEl = document.getElementById("pager");

const MAX_IMAGES = 30; // background.js와 같은 값
const WARN_OVER = 25;
const PAGE_SIZE = 5;   // 한 페이지에 보여 줄 이미지 수 (30개 ÷ 5 = 최대 6페이지)
let currentPage = 1;

async function getImages() {
  const { images = [] } = await chrome.storage.local.get("images");
  return images;
}

async function updateImage(id, changes) {
  const images = await getImages();
  const target = images.find((img) => img.id === id);
  if (!target) return;
  Object.assign(target, changes);
  await chrome.storage.local.set({ images });
}

async function deleteImage(id) {
  const images = await getImages();
  await chrome.storage.local.set({ images: images.filter((img) => img.id !== id) });
}

// 클립보드에 글자 복사 (권한 추가 없이 버튼 클릭 때 동작)
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // 예비 방법: 숨긴 입력 칸에 넣고 선택해서 복사
    const temp = document.createElement("textarea");
    temp.value = text;
    temp.style.position = "fixed";
    temp.style.opacity = "0";
    document.body.appendChild(temp);
    temp.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    temp.remove();
    return ok;
  }
}

function formatDate(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function sourceLabel(item) {
  if (item.pageTitle) return item.pageTitle;
  try {
    return new URL(item.pageUrl).hostname;
  } catch {
    return "출처 없음";
  }
}

function createCard(item) {
  const card = template.content.firstElementChild.cloneNode(true);

  const thumb = card.querySelector(".thumb");
  thumb.src = item.src;
  thumb.title = "클릭하면 원본 이미지를 새 탭에서 엽니다";
  thumb.addEventListener("click", () => chrome.tabs.create({ url: item.src }));

  const source = card.querySelector(".source");
  source.textContent = sourceLabel(item);
  source.title = item.pageUrl;
  if (item.pageUrl) source.href = item.pageUrl;

  card.querySelector(".date").textContent = formatDate(item.savedAt);

  // 이미지 주소(URL): 저장할 때 background.js가 src에 기록한 값
  const imageUrl = card.querySelector(".image-url");
  if (item.src.startsWith("data:")) {
    // 페이지 안에 직접 들어 있는 이미지는 주소가 매우 길고 새 탭으로 열 수 없어서 안내 문구만 보여 준다
    imageUrl.textContent = "페이지에 직접 들어 있는 이미지 (data URL)";
  } else {
    imageUrl.textContent = item.src;
    imageUrl.title = item.src;
    imageUrl.href = item.src;
  }

  // 이미지 주소 복사 버튼
  const copyBtn = card.querySelector(".copy");
  let copyTimer;
  copyBtn.addEventListener("click", async () => {
    const ok = await copyText(item.src);
    clearTimeout(copyTimer);
    copyBtn.classList.remove("done", "fail");
    copyBtn.classList.add(ok ? "done" : "fail");
    copyBtn.textContent = ok ? "✓ 복사됨" : "복사 실패";
    copyTimer = setTimeout(() => {
      copyBtn.classList.remove("done", "fail");
      copyBtn.textContent = "복사";
    }, 1500);
  });

  // 메모: 입력을 멈추고 0.5초 뒤 자동 저장
  const memo = card.querySelector(".memo");
  const status = card.querySelector(".status");
  memo.value = item.memo || "";
  let timer;
  memo.addEventListener("input", () => {
    clearTimeout(timer);
    status.classList.remove("show");
    timer = setTimeout(async () => {
      await updateImage(item.id, { memo: memo.value });
      status.classList.add("show");
      setTimeout(() => status.classList.remove("show"), 1200);
    }, 500);
  });

  // 삭제: 카드 안에서 한 번 더 확인
  const deleteBtn = card.querySelector(".delete");
  const confirmBox = card.querySelector(".confirm");
  const showConfirm = (on) => {
    deleteBtn.hidden = on;
    confirmBox.hidden = !on;
    (on ? confirmBox.querySelector(".no") : deleteBtn).focus();
  };
  deleteBtn.addEventListener("click", () => showConfirm(true));
  confirmBox.querySelector(".no").addEventListener("click", () => showConfirm(false));
  confirmBox.querySelector(".yes").addEventListener("click", async () => {
    await deleteImage(item.id);
    render();
  });

  return card;
}

// ---------- 검색 ----------
// 메모, 페이지 제목, 페이지 주소, 이미지 주소에서 찾는다 (대소문자 구분 없음).
function matches(item, query) {
  if (!query) return true;
  const text = [item.memo, item.pageTitle, item.pageUrl, item.src.startsWith("data:") ? "" : item.src]
    .join(" ")
    .toLowerCase();
  return query.toLowerCase().split(/\s+/).every((word) => text.includes(word));
}

searchEl.addEventListener("input", () => {
  currentPage = 1; // 검색어가 바뀌면 첫 페이지부터
  render();
});

// ---------- 페이지 나누기 ----------
function renderPager(totalPages) {
  pagerEl.hidden = totalPages <= 1;
  if (totalPages <= 1) {
    pagerEl.replaceChildren();
    return;
  }
  const makeBtn = (label, page, { current = false, disabled = false, aria } = {}) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    btn.disabled = disabled;
    if (aria) btn.setAttribute("aria-label", aria);
    if (current) {
      btn.className = "current";
      btn.setAttribute("aria-current", "page");
    }
    btn.addEventListener("click", () => goToPage(page));
    return btn;
  };
  const buttons = [makeBtn("‹", currentPage - 1, { disabled: currentPage === 1, aria: "이전 페이지" })];
  for (let p = 1; p <= totalPages; p++) {
    buttons.push(makeBtn(String(p), p, { current: p === currentPage, aria: `${p}페이지` }));
  }
  buttons.push(makeBtn("›", currentPage + 1, { disabled: currentPage === totalPages, aria: "다음 페이지" }));
  pagerEl.replaceChildren(...buttons);
}

async function goToPage(page) {
  currentPage = page;
  await render();
  window.scrollTo(0, 0);
}

// ---------- 정리 안내 ----------
// 이미지나 메모가 25개를 넘으면 안내창을 띄운다. '닫기'를 누르면 팝업을 다시 열 때까지 숨긴다.
let noticeClosed = false;
noticeCloseEl.addEventListener("click", () => {
  noticeClosed = true;
  noticeEl.hidden = true;
});

function updateNotice(images) {
  const memoCount = images.filter((img) => (img.memo || "").trim()).length;
  const over = images.length > WARN_OVER || memoCount > WARN_OVER;
  noticeEl.hidden = !over || noticeClosed;
  if (!over) return;

  const full = images.length >= MAX_IMAGES;
  noticeTitleEl.textContent = full ? "저장 공간이 가득 찼어요" : "이미지 정리가 필요해요";
  noticeTextEl.textContent = full
    ? `최대 ${MAX_IMAGES}개를 모두 채워서 더 저장할 수 없어요. 필요 없는 이미지를 지워 주세요.`
    : `이미지 ${images.length}개, 메모 ${memoCount}개를 저장했어요. 최대 ${MAX_IMAGES}개까지 저장할 수 있으니 필요 없는 이미지를 지워 정리해 주세요.`;
}

async function render() {
  const images = await getImages();
  const query = searchEl.value.trim();
  const shown = images.filter((item) => matches(item, query));

  // 5개씩 나눠 현재 페이지만 보여 준다. 삭제로 페이지가 줄면 마지막 페이지로 맞춘다.
  const totalPages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  currentPage = Math.min(Math.max(1, currentPage), totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  listEl.replaceChildren(...shown.slice(start, start + PAGE_SIZE).map(createCard));
  renderPager(totalPages);
  countEl.textContent = `${images.length}/${MAX_IMAGES}`;

  emptyEl.hidden = images.length > 0;
  searchRowEl.hidden = images.length === 0;
  noResultEl.hidden = images.length === 0 || shown.length > 0;
  if (!noResultEl.hidden) noResultEl.textContent = `‘${query}’와(과) 일치하는 이미지가 없어요.`;

  updateNotice(images);
}

// ---------- 상단 버전 · 하단 문의 ----------
// 버전은 manifest.json의 version 값을 그대로 보여 준다 (한 곳만 고치면 됨).
document.getElementById("version").textContent = `v${chrome.runtime.getManifest().version}`;

// 팝업 안의 링크는 새 탭으로 연다 (별도 권한 필요 없음). 문의 창구: GitHub Issues
const contactEl = document.getElementById("contact");
contactEl.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: contactEl.href });
});

render();
