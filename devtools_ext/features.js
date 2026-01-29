// features.js
function safeDiv(a, b) {
  return b === 0 ? 0 : a / b;
}

function clampNumber(x) {
  if (!Number.isFinite(x)) return 0;
  return x;
}

// 문자열에서 간단한 엔트로피(Shannon entropy) 계산
function shannonEntropy(str) {
  if (!str || str.length === 0) return 0;
  const freq = new Map();
  for (const ch of str) freq.set(ch, (freq.get(ch) || 0) + 1);

  let ent = 0;
  const n = str.length;
  for (const c of freq.values()) {
    const p = c / n;
    ent -= p * Math.log2(p);
  }
  return ent;
}

function countRegex(str, regex) {
  const m = str.match(regex);
  return m ? m.length : 0;
}

/**
 * 14-dim feature vector
 * [0] length
 * [1] lines
 * [2] avgLineLen
 * [3] digitRatio
 * [4] alphaRatio
 * [5] symbolRatio
 * [6] entropy
 * [7] kw_eval
 * [8] kw_atob
 * [9] kw_fromCharCode
 * [10] kw_unescape
 * [11] kw_documentWrite
 * [12] kw_script
 * [13] kw_iframe
 */
function extractFeatures(body) {
  // body가 null/undefined일 때 방어
  body = (body ?? "").toString();

  const length = body.length;

  // 줄 수/평균 줄 길이
  const linesArr = body.split(/\r\n|\r|\n/);
  const lines = linesArr.length;
  const avgLineLen = safeDiv(length, lines);

  // 문자 비율
  let digits = 0;
  let alphas = 0;
  let spaces = 0;

  for (let i = 0; i < body.length; i++) {
    const code = body.charCodeAt(i);
    if (code >= 48 && code <= 57) digits++; // 0-9
    else if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) alphas++; // A-Z a-z
    else if (code === 32 || code === 9) spaces++; // space/tab
  }

  const digitRatio = safeDiv(digits, length);
  const alphaRatio = safeDiv(alphas, length);

  // "기호"는 전체 - (숫자+영문+공백)으로 대충 정의
  const symbolCount = Math.max(0, length - (digits + alphas + spaces));
  const symbolRatio = safeDiv(symbolCount, length);

  // 엔트로피 (너무 길면 비용 커서 일부만)
  const entropy = shannonEntropy(body.slice(0, 50000));

  // 키워드 카운트(소문자 기준)
  const lower = body.toLowerCase();
  const kw_eval = countRegex(lower, /\beval\s*\(/g);
  const kw_atob = countRegex(lower, /\batob\s*\(/g);
  const kw_fromCharCode = countRegex(lower, /fromcharcode\s*\(/g);
  const kw_unescape = countRegex(lower, /\bunescape\s*\(/g);
  const kw_documentWrite = countRegex(lower, /document\.write\s*\(/g);
  const kw_script = countRegex(lower, /<\s*script\b/g);
  const kw_iframe = countRegex(lower, /<\s*iframe\b/g);

  const features = [
    length,
    lines,
    avgLineLen,
    digitRatio,
    alphaRatio,
    symbolRatio,
    entropy,
    kw_eval,
    kw_atob,
    kw_fromCharCode,
    kw_unescape,
    kw_documentWrite,
    kw_script,
    kw_iframe,
  ].map(clampNumber);

  return features;
}

// 로딩 확인용(원하면 남겨도 되고 지워도 됨)
console.log("FEATURES JS LOADED");
