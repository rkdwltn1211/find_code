// predictor.js (ES Module)
// - CSP 때문에 panel.html에 인라인 스크립트 금지 → 여기서 로그/테스트
// - 전역 window.tf 사용 금지
// - tfjs는 node_modules에서 ESM 번들을 import

import * as tf from "./node_modules/@tensorflow/tfjs/dist/tf.fesm.min.js";

let model = null;
let scaler = null;

function appendDebug(msg) {
  const el = document.getElementById("mlDebug");
  if (el) el.textContent += msg + "\n";
  // 콘솔에도 남김
  console.log(msg);
}

async function loadScalerOnce() {
  if (scaler) return scaler;

  const res = await fetch(chrome.runtime.getURL("model/scaler.json"));
  if (!res.ok) throw new Error(`Failed to load scaler.json (${res.status})`);
  scaler = await res.json();

  if (!scaler?.mean || !scaler?.std || scaler.mean.length !== 14 || scaler.std.length !== 14) {
    throw new Error("Invalid scaler.json format (need mean/std length 14)");
  }
  return scaler;
}

async function loadModelOnce() {
  if (model) return model;

  // backend 준비
  if (typeof tf.ready === "function") await tf.ready();

  if (typeof tf.loadLayersModel !== "function") {
    throw new Error("TFJS not loaded (import failed or wrong bundle)");
  }

  const url = chrome.runtime.getURL("model/model.json");
  model = await tf.loadLayersModel(url);
  return model;
}

function scale14(x14, mean, std) {
  if (!Array.isArray(x14) || x14.length !== 14) {
    throw new Error("features must be an array of length 14");
  }
  return x14.map((v, i) => {
    const m = mean[i];
    const s = std[i] || 1;
    return (Number(v) - m) / s;
  });
}

export async function predictScore(features14) {
  const m = await loadModelOnce();
  const sc = await loadScalerOnce();

  const xScaled = scale14(features14, sc.mean, sc.std);

  const x = tf.tensor2d([xScaled], [1, 14]);
  try {
    const y = m.predict(x);
    if (!y || typeof y.data !== "function") {
      throw new Error("Model prediction did not return a Tensor");
    }
    const data = await y.data();
    const score = data[0];

    tf.dispose([x, y]);
    return score;
  } catch (e) {
    tf.dispose([x]);
    throw e;
  }
}

// ---- 디버그: 로딩 확인 ----
(async () => {
  try {
    appendDebug(`[predictor] module loaded`);
    appendDebug(`[predictor] tf.tensor typeof: ${typeof tf.tensor}`);
    appendDebug(`[predictor] tf.loadLayersModel typeof: ${typeof tf.loadLayersModel}`);
    appendDebug(`[predictor] tf backend (if available): ${typeof tf.getBackend === "function" ? tf.getBackend() : "n/a"}`);

    const s = await predictScore(new Array(14).fill(0));
    appendDebug(`[dummy score] ${Number(s).toFixed(4)}`);
  } catch (e) {
    appendDebug(`[predict error] ${e?.message || e}`);
  }
})();


// ✅ 전역 연결 (collector.js가 이걸 찾음)
window.predictScore = predictScore;
window._tf = tf; // optional
console.log("[predictor] exposed window.predictScore =", typeof window.predictScore);


