"use strict";

(function bootstrapNursingLiffRouteR3() {
  const MAX_WAIT_MS = 12000;
  const WAIT_INTERVAL_MS = 100;
  let started = false;

  function hasLiffState() {
    return new URLSearchParams(window.location.search).has("liff.state");
  }

  function isEntryPage() {
    const file = (window.location.pathname || "").split("/").pop();
    return !file || file === "index.html";
  }

  function showRoutingStatus(message, type = "info") {
    let status = document.querySelector("[data-liff-route-status]");
    if (!status) {
      const main = document.querySelector("#main");
      if (!main) return;
      status = document.createElement("div");
      status.dataset.liffRouteStatus = "";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      main.prepend(status);
    }
    status.className = `form-status form-status--${type}`;
    status.textContent = message;
  }

  async function initializeForRoute() {
    if (started || !hasLiffState() || !isEntryPage()) return;
    started = true;

    showRoutingStatus(
      "本人・家族ページを開いています。画面を閉じずにお待ちください。"
    );

    const startedAt = Date.now();
    while (
      (!window.DPRO_API || typeof window.DPRO_API.lineIdToken !== "function") &&
      Date.now() - startedAt < MAX_WAIT_MS
    ) {
      await new Promise((resolve) =>
        window.setTimeout(resolve, WAIT_INTERVAL_MS)
      );
    }

    if (!window.DPRO_API?.lineIdToken) {
      showRoutingStatus(
        "LINE画面の準備に時間がかかっています。画面を閉じて、もう一度開いてください。",
        "error"
      );
      return;
    }

    try {
      await window.DPRO_API.lineIdToken();

      if (hasLiffState() && isEntryPage()) {
        showRoutingStatus(
          "画面の切り替えを完了できませんでした。LINE画面を閉じ、本人・家族用URLをもう一度開いてください。",
          "error"
        );
      }
    } catch (error) {
      if (error?.code === "LIFF_LOGIN_REDIRECT") {
        showRoutingStatus(
          "LINE認証後、自動的に本人・家族ページへ移動します。",
          "info"
        );
        return;
      }

      showRoutingStatus(
        error?.message ||
          "本人・家族ページを開けませんでした。画面を閉じて再度お試しください。",
        "error"
      );
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeForRoute, {
      once: true
    });
  } else {
    initializeForRoute();
  }
})();
