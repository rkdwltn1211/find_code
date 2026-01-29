console.log("DEVTOOLS JS LOADED");

chrome.devtools.panels.create(
  "Collector",
  "",
  "panel.html",
  (panel) => {
    console.log("Collector panel created:", panel);
  }
);

