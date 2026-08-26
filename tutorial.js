"use strict";

(function bootstrapDproNursingTutorialR3() {
  const scriptUrl = document.currentScript?.src || window.location.href;
  const baseUrl = new URL(".", scriptUrl);
  const contentUrl = new URL("CONTENT_PACKAGE.json", baseUrl).href;
  const STORAGE_KEY = "dpro_tutorial_nursing_first10_v1_1";
  const CARD_MARGIN = 8;
  const BLOCK_DRAG_SELECTOR = "button,a,input,select,textarea,label,[contenteditable='true']";

  const state = {
    content: null,
    steps: [],
    index: 0,
    open: false,
    drag: null,
    cardPosition: null,
    target: null,
    skipped: false,
    mode: "first10"
  };

  const ui = {};

  function currentRoute() {
    const file = (window.location.pathname || "").split("/").pop() || "index.html";
    return `${file}${window.location.hash || ""}`;
  }

  function routeBase(route) {
    return String(route || "index.html").split("#")[0] || "index.html";
  }

  function canonicalRouteFor(step) {
    return String(step?.route || "index.html");
  }

  function safeRouteHref(route) {
    const normalized = String(route || "index.html").trim();
    if (!/^[a-z0-9-]+\.html(?:#[A-Za-z0-9_-]+)?$/i.test(normalized)) return "index.html";
    return new URL(normalized, baseUrl).href;
  }

  function loadProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (!saved || saved.version !== "1.1") return;
      const found = state.steps.findIndex((step) => step.id === saved.stepId);
      if (found >= 0) state.index = found;
      state.skipped = saved.skipped === true;
    } catch (_error) {
      // Invalid local progress is ignored. No business data is stored here.
    }
  }

  function saveProgress() {
    const step = state.steps[state.index];
    const payload = {
      version: "1.1",
      stepId: step?.id || state.steps[0]?.id || "",
      skipped: state.skipped === true
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch (_error) {}
  }

  function clearProgress() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (_error) {}
    state.index = 0;
    state.skipped = false;
  }

  function create(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text != null) element.textContent = text;
    return element;
  }

  function buildUi() {
    ui.launcher = create("button", "dpro-tutorial-launcher", "操作ガイド");
    ui.launcher.type = "button";
    ui.launcher.setAttribute("aria-haspopup", "dialog");
    ui.launcher.setAttribute("aria-controls", "dpro-tutorial-card");

    ui.backdrop = create("div", "dpro-tutorial-backdrop");
    ui.backdrop.hidden = true;

    ui.highlight = create("div", "dpro-tutorial-highlight");
    ui.highlight.hidden = true;
    ui.highlight.setAttribute("aria-hidden", "true");

    ui.card = create("section", "dpro-tutorial-card");
    ui.card.id = "dpro-tutorial-card";
    ui.card.hidden = true;
    ui.card.setAttribute("role", "dialog");
    ui.card.setAttribute("aria-modal", "false");
    ui.card.setAttribute("aria-label", "操作ガイド First10");

    ui.handle = create("div", "dpro-tutorial-drag-handle", "ガイドを移動");
    ui.handle.tabIndex = 0;
    ui.handle.setAttribute("role", "button");
    ui.handle.setAttribute("aria-label", "ガイドカードを移動。矢印キーでも移動できます");
    ui.body = create("div", "dpro-tutorial-body");
    ui.card.append(ui.handle, ui.body);
    document.body.append(ui.backdrop, ui.highlight, ui.card, ui.launcher);

    ui.launcher.addEventListener("click", () => {
      openGuideCenter();
    });

    ui.handle.addEventListener("pointerdown", onDragStart);
    ui.handle.addEventListener("keydown", onHandleKeydown);
    window.addEventListener("pointermove", onDragMove, { passive: false });
    window.addEventListener("pointerup", onDragEnd);
    window.addEventListener("pointercancel", onDragEnd);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", refreshHighlight, { passive: true });
    document.addEventListener("keydown", onGlobalKeydown);
  }

  function defaultCardPosition() {
    const width = ui.card.offsetWidth || Math.min(430, window.innerWidth - 24);
    const height = ui.card.offsetHeight || 360;
    return {
      left: Math.max(CARD_MARGIN, window.innerWidth - width - 18),
      top: Math.max(CARD_MARGIN, Math.min(110, window.innerHeight - height - 18))
    };
  }

  function clampPosition(left, top) {
    const rect = ui.card.getBoundingClientRect();
    const width = rect.width || Math.min(430, window.innerWidth - 24);
    const height = rect.height || 360;
    return {
      left: Math.min(Math.max(CARD_MARGIN, left), Math.max(CARD_MARGIN, window.innerWidth - width - CARD_MARGIN)),
      top: Math.min(Math.max(CARD_MARGIN, top), Math.max(CARD_MARGIN, window.innerHeight - height - CARD_MARGIN))
    };
  }

  function applyCardPosition(position) {
    const next = clampPosition(Number(position?.left) || CARD_MARGIN, Number(position?.top) || CARD_MARGIN);
    state.cardPosition = next;
    ui.card.style.left = `${Math.round(next.left)}px`;
    ui.card.style.top = `${Math.round(next.top)}px`;
    ui.card.style.right = "auto";
    ui.card.style.bottom = "auto";
  }

  function onDragStart(event) {
    if (!state.open || event.button > 0) return;
    if (event.target.closest(BLOCK_DRAG_SELECTOR)) return;
    const rect = ui.card.getBoundingClientRect();
    state.drag = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    try { ui.handle.setPointerCapture(event.pointerId); } catch (_error) {}
    event.preventDefault();
  }

  function onDragMove(event) {
    if (!state.drag || event.pointerId !== state.drag.pointerId) return;
    applyCardPosition({
      left: event.clientX - state.drag.offsetX,
      top: event.clientY - state.drag.offsetY
    });
    event.preventDefault();
  }

  function onDragEnd(event) {
    if (!state.drag || event.pointerId !== state.drag.pointerId) return;
    state.drag = null;
  }

  function onHandleKeydown(event) {
    if (!state.open) return;
    const move = event.shiftKey ? 32 : 16;
    let dx = 0;
    let dy = 0;
    if (event.key === "ArrowLeft") dx = -move;
    if (event.key === "ArrowRight") dx = move;
    if (event.key === "ArrowUp") dy = -move;
    if (event.key === "ArrowDown") dy = move;
    if (!dx && !dy) return;
    const rect = ui.card.getBoundingClientRect();
    applyCardPosition({ left: rect.left + dx, top: rect.top + dy });
    event.preventDefault();
  }

  function onGlobalKeydown(event) {
    if (!state.open) return;
    if (event.key === "Escape") {
      closeTutorial();
      event.preventDefault();
      return;
    }
    if (state.mode !== "first10") return;
    if (event.altKey && event.key === "ArrowRight") {
      goToIndex(state.index + 1);
      event.preventDefault();
    } else if (event.altKey && event.key === "ArrowLeft") {
      goToIndex(state.index - 1);
      event.preventDefault();
    }
  }

  function onViewportChange() {
    if (!state.open) return;
    const rect = ui.card.getBoundingClientRect();
    applyCardPosition({ left: rect.left, top: rect.top });
    refreshHighlight();
  }

  function findTarget(step) {
    for (const selector of step.target_selectors || []) {
      try {
        const found = document.querySelector(selector);
        if (found) return found;
      } catch (_error) {}
    }
    return null;
  }

  function refreshHighlight() {
    if (!state.open || !state.target || !document.contains(state.target)) {
      ui.highlight.hidden = true;
      return;
    }
    const rect = state.target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || rect.bottom < 0 || rect.top > window.innerHeight) {
      ui.highlight.hidden = true;
      return;
    }
    const pad = 5;
    ui.highlight.hidden = false;
    ui.highlight.style.left = `${Math.max(0, rect.left - pad)}px`;
    ui.highlight.style.top = `${Math.max(0, rect.top - pad)}px`;
    ui.highlight.style.width = `${Math.min(window.innerWidth, rect.width + pad * 2)}px`;
    ui.highlight.style.height = `${Math.min(window.innerHeight, rect.height + pad * 2)}px`;
  }

  function appendAction(label, options = {}) {
    const button = create("button", options.primary ? "dpro-tutorial-primary" : options.quiet ? "dpro-tutorial-quiet" : "", label);
    button.type = "button";
    if (options.disabled) button.disabled = true;
    if (options.onClick) button.addEventListener("click", options.onClick);
    ui.actions.append(button);
    return button;
  }

  function samePageFor(step) {
    const currentBase = routeBase(currentRoute());
    return currentBase === routeBase(canonicalRouteFor(step));
  }

  function renderStep() {
    const step = state.steps[state.index];
    if (!step) return;
    saveProgress();
    state.target = samePageFor(step) ? findTarget(step) : null;

    ui.body.replaceChildren();
    ui.body.append(create("p", "dpro-tutorial-eyebrow", `FIRST10 / ${step.id}`));
    ui.body.append(create("h2", "", step.title));
    ui.body.append(create("p", "dpro-tutorial-copy", step.copy));

    if (!samePageFor(step)) {
      const routeNote = create("p", "dpro-tutorial-fallback", `このステップは「${canonicalRouteFor(step)}」で確認します。画面を開くまでは説明だけ表示します。`);
      ui.body.append(routeNote);
    } else if (!state.target) {
      ui.body.append(create("p", "dpro-tutorial-fallback", step.fallback));
    }

    ui.body.append(create("p", "dpro-tutorial-progress", `${state.index + 1} / ${state.steps.length}`));
    ui.body.append(create("p", "dpro-tutorial-route", `対象: ${canonicalRouteFor(step)} / 役割: ${step.role}`));

    ui.actions = create("div", "dpro-tutorial-actions");
    appendAction("戻る", { disabled: state.index === 0, onClick: () => goToIndex(state.index - 1) });

    if (!samePageFor(step)) {
      appendAction("この画面を開く", {
        primary: true,
        onClick: () => {
          saveProgress();
          window.location.href = safeRouteHref(canonicalRouteFor(step));
        }
      });
    } else if (state.index < state.steps.length - 1) {
      appendAction("次へ", { primary: true, onClick: () => goToIndex(state.index + 1) });
    } else {
      appendAction("完了", { primary: true, onClick: () => finishFirst10() });
    }

    appendAction("ガイド一覧", { quiet: true, onClick: openGuideCenter });
    appendAction("スキップ", { quiet: true, onClick: skipFirst10 });
    ui.body.append(ui.actions);

    requestAnimationFrame(() => {
      if (!state.cardPosition) applyCardPosition(defaultCardPosition());
      else applyCardPosition(state.cardPosition);
      refreshHighlight();
      if (state.target && typeof state.target.scrollIntoView === "function") {
        const rect = state.target.getBoundingClientRect();
        if (rect.top < 0 || rect.bottom > window.innerHeight) {
          state.target.scrollIntoView({ behavior: "smooth", block: "center" });
          window.setTimeout(refreshHighlight, 350);
        }
      }
    });
  }

  function goToIndex(index) {
    const nextIndex = Math.min(Math.max(0, index), state.steps.length - 1);
    const next = state.steps[nextIndex];
    state.index = nextIndex;
    state.skipped = false;
    saveProgress();

    const currentBase = routeBase(currentRoute());
    const nextBase = routeBase(canonicalRouteFor(next));
    if (currentBase !== nextBase) {
      window.location.href = safeRouteHref(canonicalRouteFor(next));
      return;
    }
    renderStep();
  }

  function openFirst10(options = {}) {
    if (!state.steps.length) return;
    if (!options.resume) state.index = 0;
    state.open = true;
    state.mode = "first10";
    state.skipped = false;
    ui.card.hidden = false;
    ui.backdrop.hidden = false;
    ui.launcher.textContent = "ガイドを開く";
    renderStep();
    window.setTimeout(() => ui.card.focus?.(), 0);
  }

  function closeTutorial() {
    state.open = false;
    state.target = null;
    state.drag = null;
    ui.card.hidden = true;
    ui.backdrop.hidden = true;
    ui.highlight.hidden = true;
    ui.launcher.textContent = state.skipped ? "ガイドを再開" : "操作ガイド";
    saveProgress();
    ui.launcher.focus();
  }

  function skipFirst10() {
    state.skipped = true;
    saveProgress();
    closeTutorial();
    ui.launcher.textContent = "操作ガイド";
  }

  function finishFirst10() {
    const lastId = state.steps[state.steps.length - 1]?.id || "";
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: "1.1", stepId: lastId, skipped: false, completed: true }));
    } catch (_error) {}
    openGuideCenter();
  }


  function roleContext() {
    const file = routeBase(currentRoute());
    const badge = document.querySelector(".role-badge")?.textContent?.trim() || "";
    const map = {
      "index.html": { label: badge || "相談窓口", recommended: ["GC-01", "GC-02", "GC-07"] },
      "member.html": { label: badge || "本人・家族", recommended: ["GC-03", "GC-07", "GC-08"] },
      "staff.html": { label: badge || "スタッフ", recommended: ["GC-04", "GC-07", "GC-08"] },
      "owner.html": { label: badge || "管理者PC", recommended: ["GC-05", "GC-07", "GC-08"] },
      "owner-ipad.html": { label: badge || "管理者iPad", recommended: ["GC-06", "GC-07", "GC-08"] }
    };
    return map[file] || { label: badge || "現在の画面", recommended: ["GC-01", "GC-07", "GC-08"] };
  }

  function categoryRoute(categoryId) {
    return {
      "GC-01": "index.html",
      "GC-02": "index.html",
      "GC-03": "member.html",
      "GC-04": "staff.html",
      "GC-05": "owner.html",
      "GC-06": "owner-ipad.html"
    }[categoryId] || "";
  }

  function openGuideCenter() {
    if (!state.content) return;
    state.open = true;
    state.mode = "guide";
    state.target = null;
    state.drag = null;
    ui.highlight.hidden = true;
    ui.card.hidden = false;
    ui.backdrop.hidden = false;
    ui.card.setAttribute("aria-label", "操作ガイド Guide Center");
    ui.launcher.textContent = "操作ガイド";
    renderGuideCenter();
    requestAnimationFrame(() => {
      if (!state.cardPosition) applyCardPosition(defaultCardPosition());
      else applyCardPosition(state.cardPosition);
    });
  }

  function renderGuideCenter() {
    const guide = state.content?.guide_center;
    const categories = Array.isArray(guide?.categories) ? guide.categories : [];
    const role = roleContext();
    ui.body.replaceChildren();

    const home = create("div", "dpro-guide-home");
    home.append(create("p", "dpro-tutorial-eyebrow", "GUIDE CENTER / STANDARD V1.1"));
    home.append(create("h2", "", "操作ガイド"));
    home.append(create("p", "dpro-guide-intro", `現在: ${role.label}。このガイドは説明と安全な画面移動だけを行い、送信・保存・承認・状態変更は自動実行しません。`));

    const first10Actions = create("div", "dpro-tutorial-actions");
    const resume = create("button", "dpro-tutorial-primary", state.skipped ? "First10を再開" : "First10を開始・再開");
    resume.type = "button";
    resume.addEventListener("click", () => { state.skipped = false; openFirst10({ resume: true }); });
    const replay = create("button", "", "First10を最初から");
    replay.type = "button";
    replay.addEventListener("click", replayFirst10);
    const close = create("button", "dpro-tutorial-quiet", "閉じる");
    close.type = "button";
    close.addEventListener("click", closeTutorial);
    first10Actions.append(resume, replay, close);
    home.append(first10Actions);

    const list = create("div", "dpro-guide-category-list");
    categories.forEach((category) => {
      const details = create("details", "dpro-guide-category");
      const recommended = role.recommended.includes(category.id);
      if (recommended) details.classList.add("is-recommended");
      if (recommended && !list.querySelector("details[open]")) details.open = true;
      const summary = create("summary", "", category.title);
      const items = create("ol", "dpro-guide-items");
      (category.items || []).forEach((item, itemIndex) => {
        const li = create("li", "", item);
        const meta = create("span", "dpro-guide-meta", `${category.id}-${String(itemIndex + 1).padStart(2, "0")}`);
        li.append(meta);
        items.append(li);
      });
      details.append(summary, items);

      const route = categoryRoute(category.id);
      if (route) {
        const routeRow = create("div", "dpro-tutorial-actions");
        routeRow.style.padding = "0 13px 13px";
        const link = create("a", "", "関連画面を開く");
        link.href = safeRouteHref(route);
        link.textContent = "関連画面を開く";
        routeRow.append(link);
        details.append(routeRow);
      }
      list.append(details);
    });
    home.append(list);
    ui.body.append(home);
  }

  function replayFirst10() {
    clearProgress();
    openFirst10({ resume: false });
  }

  async function init() {
    const approvedHosts = new Set(["index.html", "member.html", "staff.html", "owner.html", "owner-ipad.html"]);
    if (!approvedHosts.has(routeBase(currentRoute()))) return;
    try {
      const response = await fetch(contentUrl, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error(`Tutorial content HTTP ${response.status}`);
      const content = await response.json();
      if (!Array.isArray(content.first10) || content.first10.length !== 10) {
        throw new Error("First10 canonical count is not 10");
      }
      state.content = content;
      state.steps = content.first10.slice();
      buildUi();
      loadProgress();
      window.DPRO_TUTORIAL = Object.freeze({
        version: "NURSING-TUTORIAL-R4-STANDARD-1.1",
        openGuide: openGuideCenter,
        openFirst10: () => openFirst10({ resume: true }),
        replayFirst10,
        close: closeTutorial,
        contentIds: Object.freeze(state.steps.map((step) => step.id))
      });
      document.dispatchEvent(new CustomEvent("dpro:tutorial-ready", { detail: { first10Count: state.steps.length } }));
    } catch (error) {
      console.error("[DPRO Tutorial] initialization failed", error);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
