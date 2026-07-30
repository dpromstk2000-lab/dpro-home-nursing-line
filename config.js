"use strict";

window.DPRO_CONFIG = Object.freeze({
  systemName: "DPRO 訪問看護ステーション LINE",
  systemCode: "NURSING",
  version: "NURSING-10-FINAL-CHECK-20260730",
  timeZone: "Asia/Tokyo",
  environment: "demo",
  demoMode: true,
  productionGuard: true,
  officeCode: "dpro_home_nursing_demo",
  officeName: "DPRO訪問看護ステーション（デモ）",
  apiBaseUrl: "https://dpro-home-nursing-line-api.dpromstk2000.workers.dev",
  liffId: "2010876527-hXoFHt3R",
  emergencyPhone: "",
  emergencyMessage:
    "緊急時の連絡にはLINEを使用せず、事業所の緊急連絡先または119へ電話してください。",
  scopeNotice:
    "本システムは訪問予定・現場連携・家族連絡を支援するもので、電子カルテ・正式な訪問看護記録・保険請求を置き換えるものではありません。",
  pages: Object.freeze({
    public: "index.html",
    member: "member.html",
    staff: "staff.html",
    owner: "owner.html",
    ownerIpad: "owner-ipad.html",
    systemCheck: "system-check.html"
  })
});

(function loadNursingAssets() {
  const current = document.currentScript?.src || window.location.href;
  const base = new URL(".", current);

  const assets = [
    ["nursing-8-r2-mobile-css", "link", "mobile-r2.css"],
    ["nursing-8-r2-line-link-js", "script", "line-link-r2.js"],
    ["nursing-8-r3-liff-route-js", "script", "liff-route-r3.js"]
  ];

  assets.forEach(([id, type, file]) => {
    if (document.getElementById(id)) return;
    if (type === "link") {
      const link = document.createElement("link");
      link.id = id;
      link.rel = "stylesheet";
      link.href = new URL(file, base).href;
      document.head.append(link);
      return;
    }
    const script = document.createElement("script");
    script.id = id;
    script.src = new URL(file, base).href;
    script.async = false;
    document.head.append(script);
  });
})();
