// content_script.js
// 페이지 위에 경고 배너를 띄움

function showMalAlert(payload) {
  const id = "tf-mal-alert";
  let box = document.getElementById(id);

  if (!box) {
    box = document.createElement("div");
    box.id = id;
    box.style.cssText = `
      position: fixed;
      top: 12px;
      right: 12px;
      z-index: 2147483647;
      max-width: 420px;
      padding: 10px 12px;
      border-radius: 10px;
      background: rgba(255,255,255,0.96);
      border: 1px solid rgba(0,0,0,0.15);
      box-shadow: 0 10px 30px rgba(0,0,0,0.18);
      font: 13px/1.4 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    `;
    document.documentElement.appendChild(box);
  }

  const { score, url, ruleHits, mime } = payload || {};
  box.innerHTML = `
    <div style="font-weight:700; margin-bottom:6px;">⚠️ 악성 의심 트래픽 탐지</div>
    <div><b>score</b>: ${Number(score).toFixed(3)}</div>
    <div style="word-break:break-all;"><b>url</b>: ${url || ""}</div>
    <div><b>mime</b>: ${mime || ""}</div>
    <div style="margin-top:6px; color:#555; font-size:12px;">
      rule: ${ruleHits ? JSON.stringify(ruleHits) : "-"}
    </div>
    <div style="margin-top:8px; display:flex; gap:8px; justify-content:flex-end;">
      <button id="${id}-close" style="padding:4px 8px; cursor:pointer;">닫기</button>
    </div>
  `;

  const btn = document.getElementById(`${id}-close`);
  if (btn) btn.onclick = () => box.remove();

  // 6초 후 자동 제거(원하면 제거)
  clearTimeout(showMalAlert._t);
  showMalAlert._t = setTimeout(() => {
    const b = document.getElementById(id);
    if (b) b.remove();
  }, 6000);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "MAL_ALERT") {
    showMalAlert(msg.payload);
  }
});
