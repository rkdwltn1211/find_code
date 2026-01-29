// panel_bootstrap.js
// 목적:
// 1) CSP 때문에 panel.html에 인라인 스크립트 못 쓰므로 여기서 초기화
// 2) TFJS가 window.tf를 붙일 수 있게 "선점된 tf"를 최대한 제거/우회
// 3) 누가 window.tf를 { }로 만드는지 추적(원인 파악용 로그)

(function () {
  // 로그를 panel 화면에도 남기고 싶으면 이 함수 사용 (없으면 콘솔만)
  function appendDebug(msg) {
    try {
      const el = document.getElementById("mlDebug");
      if (el) el.textContent += msg + "\n";
    } catch (_) {}
    // 콘솔에도 남김
    console.log(msg);
  }

  appendDebug("[bootstrap] loaded (before tf.min.js)");

  // 1) 기존 window.tf가 있으면 가능한 한 제거
  //    - delete가 성공하면 최선
  //    - 실패해도 undefined로 재설정 시도
  try {
    const had = Object.prototype.hasOwnProperty.call(window, "tf");
    if (had) appendDebug("[bootstrap] window.tf existed before TFJS: " + String(window.tf));
  } catch (_) {}

  try { delete window.tf; } catch (e) { /* ignore */ }
  try { window.tf = undefined; } catch (e) { /* ignore */ }

  appendDebug("[bootstrap] cleared window.tf (delete + undefined)");

  // 2) 누가 window.tf를 다시 세팅하는지 추적(문제 해결 후 제거 가능)
  //    - 이 훅은 "앞으로" 발생하는 set만 잡음
  //    - 이미 누가 세팅해놨다면 그건 추적 못함(그래서 위에서 최대한 delete)
/*  
try {
    let _tf = undefined;

    Object.defineProperty(window, "tf", {
      configurable: true,
      enumerable: true,
      get() { return _tf; },
      set(v) {
        // stack trace로 범인 파일/라인 잡기
        console.trace("[bootstrap] window.tf SET ->", v);
        _tf = v;
      }
    });

    appendDebug("[bootstrap] tf setter hook installed");
  } catch (e) {
    appendDebug("[bootstrap] failed to install tf hook: " + (e?.message || e));
  }
*/
  // 3) TFJS 로드 후 상태 확인은 "tf.min.js 다음"에 있는 파일에서 하는 게 맞지만,
  //    panel.html엔 인라인 금지라 여기서 onload 이벤트로 체크를 걸 수도 있음.
  //    다만 tf.min.js가 script 태그로 이미 로드되므로, DOMContentLoaded 후에 확인.
  window.addEventListener("DOMContentLoaded", () => {
    appendDebug("[bootstrap] DOMContentLoaded");

    // tf.min.js가 로드된 뒤면 window.tf가 TFJS 객체여야 정상
    const tf = window.tf;
    const ok = !!(tf && typeof tf.tensor === "function" && typeof tf.loadLayersModel === "function");
    appendDebug("[bootstrap] TFJS ready? " + String(ok));
    appendDebug("[bootstrap] typeof window.tf.tensor = " + typeof (tf && tf.tensor));
    appendDebug("[bootstrap] typeof window.tf.loadLayersModel = " + typeof (tf && tf.loadLayersModel));
    try {
      appendDebug("[bootstrap] tf keys sample = " + (tf ? Object.keys(tf).slice(0, 15).join(",") : "null"));
    } catch (_) {}
  });
})();
