// collector.js
console.log("COLLECTOR JS LOADED");

const THRESHOLD = 0.5;        // 필요하면 조정
const USE_ML_WARNING = true;  // ML 경고 켜기/끄기
const USE_PAGE_ALERT = true;  // ✅ 페이지(탭 화면)에 배너 띄우기

const state = {
  samples: [],
  seen: new Set(), // 중복 방지용 key
  counts: { total: 0, kept: 0, suspicious: 0, benign: 0, skipped: 0 },
  lastMlAlert: null, // 최근 ML 경고 메시지
};

function $(id) {
  return document.getElementById(id);
}

function updateStatus(extra = "") {
  const s = state.counts;
  const lines = [
    `Total seen: ${s.total}`,
    `Kept: ${s.kept} (benign: ${s.benign}, suspicious: ${s.suspicious})`,
    `Skipped: ${s.skipped}`,
    `In-memory samples: ${state.samples.length}`,
  ];

  if (USE_ML_WARNING && state.lastMlAlert) {
    lines.push("", `⚠️ ML Alert: ${state.lastMlAlert}`);
  }

  if (extra) lines.push("", extra);
  const el = $("status");
  if (el) el.textContent = lines.join("\n");
}

// 아주 가벼운 해시(중복키 만들기용)
function cheapHash(str) {
  // DJB2
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) + str.charCodeAt(i);
    h |= 0;
  }
  return h >>> 0;
}

/**
 * Rule-based weak labeling (포트폴리오용)
 * label: 0=benign, 1=suspicious
 */
function labelByRules(features) {
  const [
    length, lines, avgLineLen,
    digitRatio, alphaRatio, symbolRatio, entropy,
    kw_eval, kw_atob, kw_fromCharCode, kw_unescape, kw_documentWrite, kw_script, kw_iframe
  ] = features;

  const kwSum = kw_eval + kw_atob + kw_fromCharCode + kw_unescape + kw_documentWrite;

  const hit_keywords = kwSum >= 1;
  const hit_entropy_len = (entropy >= 6.5 && length >= 5000);
  const hit_symbol_obf = (symbolRatio >= 0.28 && alphaRatio <= 0.55 && length >= 2000);
  const hit_iframe_script = (kw_iframe >= 1 && kw_script >= 1);

  const suspicious = hit_keywords || hit_entropy_len || hit_symbol_obf || hit_iframe_script;

  return {
    label: suspicious ? 1 : 0,
    ruleHits: {
      hit_keywords,
      hit_entropy_len,
      hit_symbol_obf,
      hit_iframe_script,
      kwSum,
    }
  };
}

function downloadJSON() {
  const payload = {
    meta: {
      exportedAt: new Date().toISOString(),
      featureDim: 14,
      labeling: "weak_label_rules_v1 (0=benign, 1=suspicious)",
      ml: {
        enabled: USE_ML_WARNING,
        threshold: THRESHOLD,
        note: "mlPred/mlScore added per sample when available"
      },
      pageAlert: {
        enabled: USE_PAGE_ALERT,
        note: "Sends MAL_ALERT message to content script when ML pred=1"
      }
    },
    stats: { ...state.counts },
    data: state.samples,
  };

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `traffic_features_${Date.now()}.json`;
  a.click();

  URL.revokeObjectURL(url);
}

function clearData() {
  state.samples = [];
  state.seen.clear();
  state.counts = { total: 0, kept: 0, suspicious: 0, benign: 0, skipped: 0 };
  state.lastMlAlert = null;
  updateStatus("Cleared.");
}

// ✅ (추가) 페이지에 경고 띄우기 메시지 전송
function sendPageAlert(payload) {
  if (!USE_PAGE_ALERT) return;

  const tabId = chrome.devtools?.inspectedWindow?.tabId;
  if (!tabId) return;

  // background(service worker)로 보내서 -> content_script로 전달
  chrome.runtime.sendMessage({
    type: "MAL_ALERT",
    tabId,
    payload
  });
}

// 버튼 연결(패널 UI가 로드된 후에만 존재)
const btnDownload = $("btnDownload");
const btnClear = $("btnClear");

if (btnDownload) btnDownload.addEventListener("click", downloadJSON);
if (btnClear) btnClear.addEventListener("click", clearData);

updateStatus("Collector started. Refresh pages to collect samples.");

// ---- 네트워크 수집 ----
chrome.devtools.network.onRequestFinished.addListener((request) => {
  try {
    state.counts.total += 1;

    const resp = request.response;
    if (!resp) { state.counts.skipped += 1; updateStatus(); return; }

    const mime = resp.content?.mimeType || "";
    const status = resp.status || 0;

    // 텍스트 계열만 수집
    const allowed = [
      "application/json",
      "text/html",
      "application/javascript",
      "text/javascript",
    ];
    const okType = allowed.some(t => mime.includes(t));
    if (!okType) { state.counts.skipped += 1; updateStatus(); return; }

    // 성공 응답 위주
    if (!(status >= 200 && status < 400)) { state.counts.skipped += 1; updateStatus(); return; }

    request.getContent((body) => {
      try {
        if (!body) { state.counts.skipped += 1; updateStatus(); return; }
        if (body.length < 50) { state.counts.skipped += 1; updateStatus(); return; }

        // feature 추출
        const features = extractFeatures(body);
        if (!Array.isArray(features) || features.length !== 14) {
          console.warn("⚠️ Feature length is not 14:", features);
          state.counts.skipped += 1;
          updateStatus("⚠️ Feature length not 14. Check features.js");
          return;
        }

        // 중복 방지 key
        const url0 = request.request?.url || "";
        const bodyHead = body.slice(0, 2000);
        const key = `${url0}|${mime}|${cheapHash(bodyHead)}`;
        if (state.seen.has(key)) {
          state.counts.skipped += 1;
          updateStatus();
          return;
        }
        state.seen.add(key);

        // 라벨링(rule)
        const { label, ruleHits } = labelByRules(features);

        const sample = {
          ts: new Date().toISOString(),
          url: url0,
          mime,
          status,
          features,
          label,
          ruleHits,
          bodySample: body.slice(0, 200),

          // ML 결과
          mlScore: null,
          mlPred: null,
        };

        state.samples.push(sample);
        state.counts.kept += 1;
        if (label === 1) state.counts.suspicious += 1;
        else state.counts.benign += 1;

        if (label === 1) {
          console.warn("[SUSPICIOUS][RULE]", sample.url, sample.ruleHits, sample.features);
        }

        updateStatus();

        // ---- ML 연결 ----
        // ✅ predictor.js에서 window.predictScore = predictScore; 해줘야 여기서 동작함
        if (USE_ML_WARNING && typeof predictScore === "function") {
          predictScore(features)
            .then((score) => {
              sample.mlScore = score;
              sample.mlPred = score >= THRESHOLD ? 1 : 0;

              if (sample.mlPred === 1) {
                state.lastMlAlert = `${score.toFixed(3)} | ${sample.url}`;
                console.warn("[SUSPICIOUS][ML]", sample.url, "score=", score.toFixed(3));

                // ✅ 페이지(탭 화면)에 배너/토스트 띄우기
                sendPageAlert({
                  score,
                  url: sample.url,
                  mime: sample.mime,
                  ruleHits: sample.ruleHits,
                  threshold: THRESHOLD,
                  ts: sample.ts,
                });
              }

              updateStatus();
            })
            .catch((err) => {
              console.error("❌ ML predict failed:", err);
            });
        } else if (USE_ML_WARNING) {
          // 디버깅용: predictScore가 전역에 안 떠 있을 때
          // (조용히 넘어가고 싶으면 이 블록 지워도 됨)
          console.warn("⚠️ predictScore is not available (window.predictScore not set?)");
        }

      } catch (e) {
        console.error("❌ Error in getContent:", e);
        state.counts.skipped += 1;
        updateStatus("❌ Error in getContent");
      }
    });

  } catch (e) {
    console.error("❌ Error in onRequestFinished:", e);
    state.counts.skipped += 1;
    updateStatus("❌ Error in onRequestFinished");
  }
});
