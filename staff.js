"use strict";

(function bootstrapNursingStaff() {
  const api = window.DPRO_API;
  const config = window.DPRO_CONFIG || {};

  const TOKEN_KEY = "dpro_nursing_staff_token";
  const EXPIRY_KEY = "dpro_nursing_staff_expires_at";
  const PROFILE_KEY = "dpro_nursing_staff_profile";

  const state = {
    token: "",
    staff: null,
    visits: [],
    selectedVisitId: "",
    loading: false
  };

  const roleLabels = Object.freeze({
    manager: "管理者",
    public_health_nurse: "保健師",
    midwife: "助産師",
    nurse: "看護師",
    assistant_nurse: "准看護師",
    pt: "理学療法士",
    ot: "作業療法士",
    st: "言語聴覚士",
    office: "事務"
  });

  const visitKindLabels = Object.freeze({
    regular: "定期訪問",
    rehabilitation: "訪問リハビリ",
    urgent: "緊急訪問",
    temporary: "臨時訪問",
    other: "訪問予定"
  });

  const statusMeta = Object.freeze({
    scheduled: { label: "予定", className: "status--scheduled" },
    confirmed: { label: "確定", className: "status--scheduled" },
    in_progress: { label: "訪問中", className: "status--progress" },
    completed: { label: "完了", className: "status--done" },
    cancelled: { label: "中止", className: "status--alert" },
    no_visit: { label: "未訪問", className: "status--alert" }
  });

  function one(selector, root = document) {
    return root.querySelector(selector);
  }

  function all(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function text(selector, value) {
    const element = one(selector);
    if (element) element.textContent = value;
  }

  function clean(value) {
    return String(value ?? "").trim();
  }

  function readableError(error) {
    const message = clean(error?.message) || "処理を完了できませんでした。";
    return error?.requestId ? `${message}（確認番号: ${error.requestId}）` : message;
  }

  function setStatus(element, message, type = "info") {
    if (!element) return;
    element.hidden = false;
    element.textContent = message;
    element.className = `form-status form-status--${type}`;
  }

  function hideStatus(element) {
    if (!element) return;
    element.hidden = true;
    element.textContent = "";
  }

  function showToast(message) {
    const toast = one("[data-toast]");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(
      () => toast.classList.remove("is-visible"),
      4000
    );
  }

  function setButtonBusy(button, busy, busyLabel) {
    if (!button) return;
    if (!button.dataset.defaultLabel) {
      button.dataset.defaultLabel = button.textContent.trim();
    }
    button.disabled = busy;
    button.setAttribute("aria-busy", String(busy));
    button.textContent = busy ? busyLabel : button.dataset.defaultLabel;
  }

  function formatTime(value) {
    if (!value) return "－";
    try {
      return new Intl.DateTimeFormat("ja-JP", {
        timeZone: config.timeZone || "Asia/Tokyo",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(value));
    } catch (_error) {
      return "－";
    }
  }

  function formatDate(value) {
    if (!value) return "本日";
    const source = /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? `${value}T00:00:00+09:00`
      : value;
    try {
      return new Intl.DateTimeFormat("ja-JP", {
        timeZone: config.timeZone || "Asia/Tokyo",
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short"
      }).format(new Date(source));
    } catch (_error) {
      return value;
    }
  }

  function saveSession(result) {
    sessionStorage.setItem(TOKEN_KEY, result.token);
    sessionStorage.setItem(EXPIRY_KEY, result.expires_at);
    sessionStorage.setItem(PROFILE_KEY, JSON.stringify(result.staff || {}));
    state.token = result.token;
    state.staff = result.staff || null;
  }

  function clearSession() {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(EXPIRY_KEY);
    sessionStorage.removeItem(PROFILE_KEY);
    state.token = "";
    state.staff = null;
    state.visits = [];
    state.selectedVisitId = "";
  }

  function restoreSession() {
    const token = clean(sessionStorage.getItem(TOKEN_KEY));
    const expiry = Date.parse(sessionStorage.getItem(EXPIRY_KEY) || "");
    if (!token || !Number.isFinite(expiry) || expiry <= Date.now()) {
      clearSession();
      return false;
    }

    let staff = null;
    try {
      staff = JSON.parse(sessionStorage.getItem(PROFILE_KEY) || "null");
    } catch (_error) {
      staff = null;
    }

    state.token = token;
    state.staff = staff;
    return true;
  }

  function setAuthenticatedUi(authenticated) {
    const login = one("[data-staff-login-view]");
    const app = one("[data-staff-app]");
    if (login) login.hidden = authenticated;
    if (app) app.hidden = !authenticated;

    if (authenticated && state.staff) {
      text("[data-staff-session-name]", state.staff.display_name || "スタッフ");
      text(
        "[data-staff-session-role]",
        `${roleLabels[state.staff.professional_role] || state.staff.professional_role || ""}／${state.staff.staff_code || ""}`
      );
      text(
        "[data-staff-heading]",
        `${state.staff.display_name || "スタッフ"}・本日の担当訪問`
      );
    } else {
      text("[data-staff-heading]", "スタッフ・本日の担当訪問");
    }
  }

  function isAuthError(error) {
    return error?.status === 401 || error?.status === 403;
  }

  function statusFor(visit) {
    return statusMeta[visit?.status] || {
      label: clean(visit?.status) || "確認中",
      className: "status--progress"
    };
  }

  function selectVisit(visitId, scroll = false) {
    state.selectedVisitId = visitId;
    all("[data-visit-id]").forEach((card) => {
      card.classList.toggle("is-selected", card.dataset.visitId === visitId);
    });

    const visit = state.visits.find((item) => item.id === visitId);
    const section = one("[data-selected-visit-section]");
    const forms = one("[data-staff-work-forms]");

    if (!visit) {
      if (section) section.hidden = true;
      if (forms) forms.hidden = true;
      return;
    }

    if (section) section.hidden = false;
    if (forms) forms.hidden = false;

    const patient = visit.patient || {};
    const meta = statusFor(visit);
    text("[data-selected-patient]", `${patient.full_name || "利用者"}様`);
    text(
      "[data-selected-planned]",
      `${formatTime(visit.planned_start)}～${formatTime(visit.planned_end)}`
    );
    text("[data-selected-kind]", visitKindLabels[visit.visit_kind] || "訪問予定");
    text("[data-selected-number]", patient.patient_number || "－");
    text("[data-selected-address]", patient.address_line || "住所未登録");
    text("[data-selected-address-note]", patient.address_note || "特記事項なし");
    text("[data-selected-precautions]", patient.visit_precautions || "特記事項なし");

    const badge = one("[data-selected-status]");
    if (badge) {
      badge.className = `status ${meta.className}`;
      badge.textContent = meta.label;
    }

    const handoffList = one("[data-selected-handoffs]");
    if (handoffList) {
      handoffList.replaceChildren();
      const handoffs = Array.isArray(visit.internal_handoffs)
        ? visit.internal_handoffs
        : [];

      if (!handoffs.length) {
        const item = document.createElement("li");
        item.textContent = "未完了の申し送りはありません。";
        handoffList.append(item);
      } else {
        handoffs.forEach((handoff) => {
          const item = document.createElement("li");
          const priority =
            handoff.priority === "urgent"
              ? "【至急】"
              : handoff.priority === "high"
                ? "【重要】"
                : "";
          item.textContent = `${priority}${handoff.message || "申し送り内容なし"}`;
          handoffList.append(item);
        });
      }
    }

    if (scroll && section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function actionButton(visit, type, label, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `btn ${className} btn--small`;
    button.textContent = label;
    button.dataset.visitAction = type;
    button.dataset.visitActionId = visit.id;
    return button;
  }

  function renderVisits() {
    const list = one("[data-staff-visits]");
    if (!list) return;
    list.replaceChildren();

    if (!state.visits.length) {
      const empty = document.createElement("li");
      empty.className = "empty-state";
      const strong = document.createElement("strong");
      strong.textContent = "本日の担当訪問はありません";
      empty.append(
        strong,
        document.createTextNode("割当が追加された場合は、更新ボタンで再取得できます。")
      );
      list.append(empty);
      selectVisit("");
      return;
    }

    state.visits.forEach((visit) => {
      const patient = visit.patient || {};
      const meta = statusFor(visit);
      const item = document.createElement("li");
      item.className = "visit-card staff-visit-card";
      item.dataset.visitId = visit.id;

      const time = document.createElement("div");
      time.className = "visit-card__time";
      time.textContent = formatTime(visit.planned_start);

      const detail = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = `${patient.full_name || "利用者"}様`;

      const subline = document.createElement("p");
      subline.className = "staff-card-subline";
      const actual = visit.actual_start
        ? `・開始 ${formatTime(visit.actual_start)}${visit.actual_end ? `／終了 ${formatTime(visit.actual_end)}` : ""}`
        : "";
      subline.textContent =
        `${visitKindLabels[visit.visit_kind] || "訪問予定"}・予定 ${formatTime(visit.planned_start)}～${formatTime(visit.planned_end)}${actual}`;

      const address = document.createElement("p");
      address.className = "staff-card-address";
      address.textContent = patient.address_line || "住所未登録";
      detail.append(title, subline, address);

      const actions = document.createElement("div");
      actions.className = "staff-card-actions";

      const badge = document.createElement("span");
      badge.className = `status ${meta.className}`;
      badge.textContent = meta.label;
      actions.append(badge);

      const details = actionButton(
        visit,
        "select",
        "詳細・報告",
        "btn--secondary"
      );
      actions.append(details);

      if (visit.status === "scheduled" || visit.status === "confirmed") {
        actions.append(
          actionButton(visit, "started", "訪問開始", "btn--primary")
        );
      } else if (visit.status === "in_progress") {
        actions.append(
          actionButton(visit, "completed", "訪問終了", "btn--primary")
        );
      }

      item.append(time, detail, actions);
      list.append(item);
    });

    const selectedExists = state.visits.some(
      (visit) => visit.id === state.selectedVisitId
    );
    const preferred =
      state.visits.find((visit) => visit.status === "in_progress") ||
      state.visits.find(
        (visit) => visit.status === "scheduled" || visit.status === "confirmed"
      ) ||
      state.visits[0];

    selectVisit(selectedExists ? state.selectedVisitId : preferred.id);
  }

  function renderMetrics(date) {
    const completed = state.visits.filter(
      (visit) => visit.status === "completed"
    ).length;
    const progress = state.visits.filter(
      (visit) => visit.status === "in_progress"
    ).length;
    const upcoming = state.visits.filter(
      (visit) => visit.status === "scheduled" || visit.status === "confirmed"
    );
    text("[data-staff-total]", `${state.visits.length}件`);
    text("[data-staff-completed]", `${completed}件`);
    text("[data-staff-progress]", `${progress}件`);
    text("[data-staff-upcoming]", `${upcoming.length}件`);
    text("[data-staff-date]", formatDate(date));
    text(
      "[data-staff-next-time]",
      upcoming[0] ? `次回 ${formatTime(upcoming[0].planned_start)}` : "次回予定なし"
    );
  }

  async function loadToday(options = {}) {
    if (!state.token || state.loading) return;
    const pageStatus = one("[data-staff-page-status]");
    const badge = one("[data-staff-load-badge]");
    state.loading = true;

    if (badge) {
      badge.className = "status status--progress";
      badge.textContent = "更新中";
    }
    setStatus(pageStatus, "本日の訪問を取得しています。", "info");

    try {
      const result = await api.request("/v1/staff/today", {
        token: state.token
      });
      state.staff = result.staff || state.staff;
      state.visits = Array.isArray(result.visits) ? result.visits : [];
      sessionStorage.setItem(PROFILE_KEY, JSON.stringify(state.staff || {}));
      setAuthenticatedUi(true);
      renderMetrics(result.date);
      renderVisits();
      setStatus(
        pageStatus,
        `本日の担当訪問 ${state.visits.length}件を取得しました。`,
        "success"
      );
      if (badge) {
        badge.className = "status status--done";
        badge.textContent = "最新";
      }
      if (options.toast) showToast("本日の訪問を最新情報へ更新しました。");
    } catch (error) {
      if (isAuthError(error)) {
        clearSession();
        setAuthenticatedUi(false);
        setStatus(
          one("[data-staff-login-status]"),
          "スタッフセッションが終了しました。もう一度ログインしてください。",
          "info"
        );
      } else {
        setStatus(pageStatus, readableError(error), "error");
        if (badge) {
          badge.className = "status status--alert";
          badge.textContent = "取得失敗";
        }
      }
    } finally {
      state.loading = false;
    }
  }

  async function recordVisitEvent(visitId, eventType, button) {
    const visit = state.visits.find((item) => item.id === visitId);
    if (!visit) return;

    const verb = eventType === "started" ? "訪問開始" : "訪問終了";
    const confirmed = window.confirm(
      `${visit.patient?.full_name || "利用者"}様の「${verb}」を現在時刻で登録しますか？`
    );
    if (!confirmed) return;

    setButtonBusy(button, true, `${verb}を登録中…`);
    try {
      await api.request(`/v1/staff/visits/${visitId}/events`, {
        method: "POST",
        token: state.token,
        idempotencyKey: api.idempotencyKey(
          eventType === "started" ? "staff-start" : "staff-complete"
        ),
        body: { event_type: eventType }
      });
      showToast(`${verb}を登録しました。`);
      state.selectedVisitId = visitId;
      await loadToday();
    } catch (error) {
      if (isAuthError(error)) {
        clearSession();
        setAuthenticatedUi(false);
      }
      setStatus(one("[data-staff-page-status]"), readableError(error), "error");
    } finally {
      setButtonBusy(button, false, "");
    }
  }

  function setupVisitList() {
    one("[data-staff-visits]")?.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-visit-action]");
      const card = event.target.closest("[data-visit-id]");
      if (!button && card) {
        selectVisit(card.dataset.visitId, true);
        return;
      }
      if (!button) return;

      const visitId = button.dataset.visitActionId;
      const action = button.dataset.visitAction;
      if (action === "select") {
        selectVisit(visitId, true);
        return;
      }
      if (action === "started" || action === "completed") {
        selectVisit(visitId);
        await recordVisitEvent(visitId, action, button);
      }
    });
  }

  function setupConditionForm() {
    const form = one("[data-condition-form]");
    if (!form) return;
    const status = one("[data-condition-status]", form);
    const button = one("[data-condition-submit]", form);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      hideStatus(status);
      if (!form.reportValidity()) return;

      const visit = state.visits.find(
        (item) => item.id === state.selectedVisitId
      );
      if (!visit) {
        setStatus(status, "訪問を選択してください。", "error");
        return;
      }

      const internalNote = clean(
        new FormData(form).get("internal_note")
      );
      const confirmed = window.confirm(
        `${visit.patient?.full_name || "利用者"}様の状態変化として、事業所内の申し送りへ登録しますか？`
      );
      if (!confirmed) return;

      setButtonBusy(button, true, "状態変化を保存中…");
      try {
        const result = await api.request(
          `/v1/staff/visits/${visit.id}/events`,
          {
            method: "POST",
            token: state.token,
            idempotencyKey: api.idempotencyKey("staff-condition"),
            body: {
              event_type: "condition_change",
              internal_note: internalNote
            }
          }
        );
        setStatus(
          status,
          result.message || "状態変化と内部申し送りを保存しました。",
          "success"
        );
        form.reset();
        showToast("状態変化を事業所内の申し送りへ保存しました。");
        await loadToday();
      } catch (error) {
        setStatus(status, readableError(error), "error");
      } finally {
        setButtonBusy(button, false, "");
      }
    });
  }

  function setupFamilyReportForm() {
    const form = one("[data-family-report-form]");
    if (!form) return;
    const status = one("[data-family-report-status]", form);
    const button = one("[data-family-report-submit]", form);
    const template = one("[data-family-template]", form);
    const textarea = one("[name='report_text']", form);

    template?.addEventListener("change", () => {
      if (template.value && textarea) textarea.value = template.value;
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      hideStatus(status);
      if (!form.reportValidity()) return;

      const visit = state.visits.find(
        (item) => item.id === state.selectedVisitId
      );
      if (!visit) {
        setStatus(status, "訪問を選択してください。", "error");
        return;
      }

      const reportText = clean(new FormData(form).get("report_text"));
      const confirmed = window.confirm(
        `${visit.patient?.full_name || "利用者"}様の家族向け報告案を「承認待ち」で保存しますか？`
      );
      if (!confirmed) return;

      setButtonBusy(button, true, "承認待ちへ保存中…");
      try {
        const result = await api.request(
          `/v1/staff/visits/${visit.id}/family-reports`,
          {
            method: "POST",
            token: state.token,
            idempotencyKey: api.idempotencyKey("staff-family-report"),
            body: { report_text: reportText }
          }
        );
        setStatus(
          status,
          result.message ||
            "家族向け報告案を承認待ちとして保存しました。",
          "success"
        );
        form.reset();
        showToast("家族向け報告案を承認待ちとして保存しました。");
      } catch (error) {
        setStatus(status, readableError(error), "error");
      } finally {
        setButtonBusy(button, false, "");
      }
    });
  }

  function setupLogin() {
    const form = one("[data-staff-login-form]");
    if (!form) return;
    const status = one("[data-staff-login-status]", form);
    const button = one("[data-staff-login-button]", form);
    const deviceInput = one("[name='device_label']", form);

    if (deviceInput && !deviceInput.value) {
      const platform = clean(navigator.userAgentData?.platform);
      deviceInput.value = platform
        ? `訪問看護スタッフ端末（${platform}）`
        : "訪問看護スタッフ端末";
    }

    one("[data-toggle-access-code]", form)?.addEventListener("click", (event) => {
      const toggle = event.currentTarget;
      const input = one("[name='access_code']", form);
      if (!input) return;
      const visible = input.type === "text";
      input.type = visible ? "password" : "text";
      toggle.textContent = visible ? "表示" : "非表示";
      toggle.setAttribute("aria-pressed", String(!visible));
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      hideStatus(status);
      if (!form.reportValidity()) return;

      const data = new FormData(form);
      setButtonBusy(button, true, "スタッフ認証中…");

      try {
        const result = await api.request("/v1/staff/login", {
          method: "POST",
          body: {
            staff_code: clean(data.get("staff_code")),
            access_code: clean(data.get("access_code")),
            device_label: clean(data.get("device_label"))
          }
        });
        saveSession(result);
        one("[name='access_code']", form).value = "";
        setAuthenticatedUi(true);
        showToast("スタッフとしてログインしました。");
        await loadToday();
      } catch (error) {
        clearSession();
        setAuthenticatedUi(false);
        setStatus(status, readableError(error), "error");
      } finally {
        setButtonBusy(button, false, "");
      }
    });
  }

  function setupSessionActions() {
    one("[data-staff-refresh]")?.addEventListener("click", () =>
      loadToday({ toast: true })
    );

    one("[data-staff-logout]")?.addEventListener("click", async () => {
      const token = state.token;
      clearSession();
      setAuthenticatedUi(false);

      if (token) {
        try {
          await api.request("/v1/staff/logout", {
            method: "POST",
            token,
            body: {}
          });
        } catch (_error) {
          // 端末側のセッション破棄を優先する。
        }
      }

      setStatus(
        one("[data-staff-login-status]"),
        "ログアウトしました。",
        "success"
      );
      showToast("スタッフセッションを終了しました。");
      one("[name='staff_code']")?.focus();
    });
  }

  function init() {
    if (!api) {
      setStatus(
        one("[data-staff-login-status]"),
        "API機能を読み込めませんでした。画面を再読み込みしてください。",
        "error"
      );
      return;
    }

    setupLogin();
    setupSessionActions();
    setupVisitList();
    setupConditionForm();
    setupFamilyReportForm();

    if (restoreSession()) {
      setAuthenticatedUi(true);
      loadToday();
    } else {
      setAuthenticatedUi(false);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
