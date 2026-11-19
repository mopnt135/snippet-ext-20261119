// 준트그래피(Juntgraphy) - 백그라운드 서비스 워커
// 이미지 우클릭 메뉴를 만들고, 선택한 이미지 정보를 chrome.storage.local에 저장한다.

const MENU_ID = "save-to-my-images";
const MAX_IMAGES = 30;  // 최대 저장 개수
const WARN_OVER = 25;   // 이 개수를 넘으면 정리 안내

// 설치·업데이트 시 우클릭 메뉴 등록
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_ID,
      title: chrome.i18n.getMessage("menuSave"), // 한국어: 준트그래피에 저장 / 영어: Save to Juntgraphy
      contexts: ["image"]
    });
  });
});

// 메뉴 클릭 시 이미지 정보 저장
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.srcUrl) return;

  const { images = [] } = await chrome.storage.local.get("images");

  // 같은 이미지는 중복 저장하지 않음
  if (images.some((img) => img.src === info.srcUrl)) {
    showSaveFeedback("중복", ORANGE, "이미 모음에 있는 이미지예요");
    return;
  }

  // 최대 개수를 채웠으면 저장하지 않음
  if (images.length >= MAX_IMAGES) {
    showSaveFeedback("가득", ORANGE, `최대 ${MAX_IMAGES}개까지 저장할 수 있어요. 이미지를 정리해 주세요`);
    return;
  }

  const newImage = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    src: info.srcUrl, // 이미지 주소(URL)
    pageUrl: info.pageUrl || (tab && tab.url) || "",
    pageTitle: (tab && tab.title) || "",
    memo: "",
    savedAt: Date.now()
  };

  images.unshift(newImage); // 최신 항목이 위로
  await chrome.storage.local.set({ images });

  if (images.length > WARN_OVER) {
    // 25개를 넘으면 초록 ✓ 대신 주황색으로 현재 개수를 보여 주며 정리를 안내
    showSaveFeedback(String(images.length), ORANGE,
      `저장 완료 (${images.length}/${MAX_IMAGES}) - 이미지를 정리해 주세요`);
  } else {
    showSaveFeedback("✓", GREEN, `저장 완료 (${images.length}/${MAX_IMAGES})`);
  }
});

// 저장 알림: 툴바 아이콘 위에 배지를 잠깐 띄우고, 아이콘에 마우스를 올리면 결과 문구가 보이게 한다.
// chrome.action 배지는 별도 권한이 필요 없어서 contextMenus·storage 권한만으로 동작한다.
const GREEN = "#1f9d55";
const ORANGE = "#ff7a00";
const DEFAULT_TITLE = chrome.i18n.getMessage("appName"); // _locales 폴더의 앱 이름
let feedbackTimer;

async function showSaveFeedback(text, color, message) {
  clearTimeout(feedbackTimer);
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeTextColor({ color: "#ffffff" });
  await chrome.action.setBadgeText({ text });
  await chrome.action.setTitle({ title: `${DEFAULT_TITLE} - ${message}` });

  feedbackTimer = setTimeout(() => {
    chrome.action.setBadgeText({ text: "" });
    chrome.action.setTitle({ title: DEFAULT_TITLE });
  }, 2500);
}
