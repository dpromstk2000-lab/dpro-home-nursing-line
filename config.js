"use strict";

window.DPRO_CONFIG = Object.freeze({
  systemName: "DPRO 訪問看護ステーション LINE",
  systemCode: "NURSING",
  version: "NURSING-4-LINE-LINK-20260728",
  timeZone: "Asia/Tokyo",
  environment: "demo",
  demoMode: true,
  productionGuard: true,
  officeCode: "dpro_home_nursing_demo",
  officeName: "DPRO訪問看護ステーション（デモ）",
  apiBaseUrl: "https://dpro-home-nursing-line-api.dpromstk2000.workers.dev",
  liffId: "",
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
