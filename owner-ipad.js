"use strict";

(function bootstrapNursingOwnerIpad() {
  const api = window.DPRO_API;
  const config = window.DPRO_CONFIG || {};
  const state = {
    overview: null,
    loading: false
  };

  const visitKinds = Object.freeze({
    regular: "定期訪問",
    rehabilitation: "訪問リハビリ",
    urgent: "緊急訪問",
    temporary: "臨時訪問",
    other: "その他"
  });

  const visitStatuses = Object.freeze({
    scheduled: ["予定", "status--scheduled"],
    confirmed: ["確定", "status--scheduled"],
    in_progress: ["訪問中", "status--progress"],
    completed: ["完了", "status--done"],
    cancelled: ["中止", "status--alert"],
    no_visit: ["未訪問", "status--alert"]
  });

  const contactKinds = Object.freeze({
    schedule_change: "訪問日時の変更希望",
    absence: "今回の訪問を休みたい",
    callback: "事業所から電話がほしい",
    non_urgent_consultation: "その他の相談",
    other: "その他"
  });

  function one(selector, root = document) {
    return root.querySelector(selector);
  }

  function clean(value) {
    return String(value ?? "").trim();
  }

  function token() {
    return api?.adminToken() || "";
  }

  function setText(selector, value) {
    const element = one(selector);
    if (element) element.textContent = value;
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

  function readableError(error) {
    const message = clean(error?.message) || "処理を完了できませんでした。";
    return error?.requestId
      ? `${message}（確認番号: ${error.requestId}）`
      : message;
  }

  function setBusy(button, busy, label) {
    if (!button) return;
    if (!button.dataset.defaultLabel) {
      button.dataset.defaultLabel = button.textContent.trim();
    }
    button.disabled = busy;
    button.setAttribute("aria-busy", String(busy));
    button.textContent = busy ? label : button.dataset.defaultLabel;
  }

  function showToast(message) {
    const toast = one("[data-toast]");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(
      () => toast.classList.remove("is-visible"),
      4200
    );
  }

  function jstDateString(date = new Date()) {
    return new Intl.DateTimeFormat("sv-SE", {
      timeZone: config.timeZone || "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(date);
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

  function formatDateTime(value) {
    if (!value) return "－";
    try {
      return new Intl.DateTimeFormat("ja-JP", {
        timeZone: config.timeZone || "Asia/Tokyo",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(value));
    } catch (_error) {
      return "－";
    }
  }

  function authError(error) {
    return error?.status === 401 || error?.status === 403;
  }

  function showAuthenticated(authenticated) {
    const login = one("[data-ipad-login-view]");
    const app = one("[data-ipad-app]");
    const badge = one("[data-ipad-session-badge]");
    if (login) login.hidden = authenticated;
    if (app) app.hidden = !authenticated;
    if (badge) {
      badge.className = `status ${
        authenticated ? "status--done" : "status--progress"
      }`;
      badge.textContent = authenticated ? "認証済み" : "未認証";
    }
  }

  function handleExpired(error, target) {
    if (!authError(error)) return false;
    api.clearAdminSession();
    showAuthenticated(false);
    setStatus(
      one("[data-ipad-login-status]"),
      "管理者セッションが終了しました。もう一度ログインしてください。",
      "info"
    );
    if (target) setStatus(target, readableError(error), "error");
    return true;
  }

  function emptyState(titleText, detailText) {
    const container = document.createElement("div");
    container.className = "empty-state";
    const title = document.createElement("strong");
    title.textContent = titleText;
    container.append(title, document.createTextNode(detailText));
    return container;
  }

  function badge(label, className = "status--progress") {
    const element = document.createElement("span");
    element.className = `status ${className}`;
    element.textContent = label;
    return element;
  }

  function createCard(options = {}) {
    const card = document.createElement("article");
    card.className = `ipad-operation-card${
      options.tone ? ` ipad-operation-card--${options.tone}` : ""
    }`;

    const header = document.createElement("div");
    header.className = "ipad-operation-card__header";

    const time = document.createElement("div");
    time.className = "ipad-operation-card__time";
    time.textContent = options.time || "";

    const main = document.createElement("div");
    const title = document.createElement("h3");
    title.textContent = options.title || "確認項目";
    const meta = document.createElement("p");
    meta.className = "ipad-operation-card__meta";
    meta.textContent = options.meta || "";
    main.append(title, meta);

    header.append(time, main, options.badge || badge("確認中"));
    card.append(header);

    if (options.message) {
      const message = document.createElement("p");
      message.className = "ipad-operation-card__message";
      message.textContent = options.message;
      card.append(message);
    }

    return { card, main };
  }

  function actionRow(card) {
    const row = document.createElement("div");
    row.className = "ipad-operation-card__actions";
    card.append(row);
    return row;
  }

  function actionStatus(card, key) {
    const status = document.createElement("div");
    status.className = "form-status";
    status.hidden = true;
    status.dataset.ipadActionStatus = key;
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    card.append(status);
    return status;
  }

  function renderMetrics() {
    const counts = state.overview?.counts || {};
    const alertCount =
      Number(counts.open_handoffs || 0) +
      Number(counts.instructions_due_within_30_days || 0);

    setText("[data-ipad-count-visits]", `${Number(counts.today_visits || 0)}件`);
    setText("[data-ipad-count-unassigned]", `${Number(counts.unassigned_visits || 0)}件`);
    setText("[data-ipad-count-progress]", `${Number(counts.in_progress_visits || 0)}件`);
    setText("[data-ipad-count-completed]", `${Number(counts.completed_visits || 0)}件`);
    setText("[data-ipad-count-contacts]", `${Number(counts.open_contact_requests || 0)}件`);
    setText("[data-ipad-count-alerts]", `${alertCount}件`);

    setText("[data-tab-count-visits]", String(Number(counts.today_visits || 0)));
    setText("[data-tab-count-contacts]", String(Number(counts.open_contact_requests || 0)));
    setText(
      "[data-tab-count-approvals]",
      String(
        Number(counts.pending_family_reports || 0) +
        Number(counts.pending_line_links || 0)
      )
    );
    setText("[data-tab-count-alerts]", String(alertCount));
  }

  function renderVisits() {
    const list = one("[data-ipad-visit-list]");
    const visits = state.overview?.visits || [];
    if (!list) return;
    list.replaceChildren();

    if (!visits.length) {
      list.append(
        emptyState(
          "この日の訪問予定はありません",
          "表示日を変更するか、管理者PCで訪問予定を登録してください。"
        )
      );
      return;
    }

    visits.forEach((visit) => {
      const statusMeta = visitStatuses[visit.status] || [
        clean(visit.status) || "確認中",
        "status--progress"
      ];
      const unassigned = !Array.isArray(visit.assignments) ||
        visit.assignments.length === 0;

      const { card } = createCard({
        time: `${formatTime(visit.planned_start)}～${formatTime(visit.planned_end)}`,
        title: `${visit.patient?.patient_number || "番号未設定"}　${visit.patient?.full_name || "利用者"}様`,
        meta:
          `${visitKinds[visit.visit_kind] || "訪問"}／` +
          `${visit.patient?.address_line || "住所未登録"}`,
        badge: badge(
          unassigned ? "未配置" : statusMeta[0],
          unassigned ? "status--alert" : statusMeta[1]
        ),
        tone: unassigned ? "alert" : ""
      });

      const assignments = document.createElement("div");
      assignments.className = "ipad-assignment-list";
      if (unassigned) {
        const item = document.createElement("span");
        item.className = "ipad-assignment";
        item.textContent = "担当スタッフが配置されていません";
        assignments.append(item);
      } else {
        visit.assignments.forEach((assignment) => {
          const item = document.createElement("span");
          item.className = "ipad-assignment";
          item.textContent =
            assignment.staff?.display_name ||
            assignment.staff?.staff_code ||
            "スタッフ";
          assignments.append(item);
        });
      }
      card.append(assignments);

      const actual = document.createElement("p");
      actual.className = "ipad-operation-card__meta";
      actual.textContent =
        `実績：開始 ${formatTime(visit.actual_start)}／終了 ${formatTime(visit.actual_end)}`;
      card.append(actual);

      const row = actionRow(card);
      const detail = document.createElement("a");
      detail.className = "btn btn--secondary";
      detail.href = "owner.html#visits-panel";
      detail.textContent = unassigned ? "配置画面を開く" : "管理者PCで詳細確認";
      row.append(detail);

      list.append(card);
    });
  }

  function renderContacts() {
    const list = one("[data-ipad-contact-list]");
    const contacts = state.overview?.contact_requests || [];
    if (!list) return;
    list.replaceChildren();

    if (!contacts.length) {
      list.append(
        emptyState(
          "未対応の連絡はありません",
          "本人・家族ページから新しい連絡が届くと表示されます。"
        )
      );
      return;
    }

    contacts.forEach((item) => {
      const isNew = item.status === "new";
      const { card } = createCard({
        time: formatDateTime(item.created_at),
        title:
          `${item.patient?.patient_number || "番号未確認"}　` +
          `${item.patient?.full_name || "利用者"}様`,
        meta:
          `${contactKinds[item.request_type] || "連絡"}／` +
          `希望時間：${item.desired_time_window || "指定なし"}`,
        message: item.message || "詳しいメッセージはありません。",
        badge: badge(
          isNew ? "新規" : "確認中",
          isNew ? "status--alert" : "status--progress"
        ),
        tone: isNew ? "warning" : ""
      });

      const row = actionRow(card);
      if (isNew) {
        const reviewing = document.createElement("button");
        reviewing.type = "button";
        reviewing.className = "btn btn--secondary";
        reviewing.textContent = "対応開始";
        reviewing.dataset.contactStatus = item.id;
        reviewing.dataset.nextStatus = "reviewing";
        row.append(reviewing);
      }

      const resolved = document.createElement("button");
      resolved.type = "button";
      resolved.className = "btn btn--primary";
      resolved.textContent = "対応済みにする";
      resolved.dataset.contactStatus = item.id;
      resolved.dataset.nextStatus = "resolved";
      row.append(resolved);

      const schedule = document.createElement("a");
      schedule.className = "btn btn--secondary";
      schedule.href = "owner.html#visits-panel";
      schedule.textContent = "訪問予定を確認";
      row.append(schedule);

      actionStatus(card, `contact-${item.id}`);
      list.append(card);
    });
  }

  function renderReports() {
    const list = one("[data-ipad-report-list]");
    const reports = state.overview?.family_reports || [];
    if (!list) return;
    list.replaceChildren();

    if (!reports.length) {
      list.append(
        emptyState(
          "承認待ち報告はありません",
          "スタッフが提出すると表示されます。"
        )
      );
      return;
    }

    reports.forEach((report) => {
      const { card } = createCard({
        time: formatDateTime(report.created_at || report.submitted_at),
        title:
          `${report.patient?.patient_number || "番号未確認"}　` +
          `${report.patient?.full_name || "利用者"}様`,
        meta: "家族向け報告・公開前",
        message: report.report_text || "報告文章なし",
        badge: badge("承認待ち", "status--progress")
      });

      const row = actionRow(card);
      const approve = document.createElement("button");
      approve.type = "button";
      approve.className = "btn btn--primary";
      approve.textContent = "確認して家族へ公開";
      approve.dataset.approveReport = report.id;
      approve.dataset.reportText = report.report_text || "";
      row.append(approve);

      const pc = document.createElement("a");
      pc.className = "btn btn--secondary";
      pc.href = "owner.html#reports-panel";
      pc.textContent = "文章を修正する";
      row.append(pc);

      actionStatus(card, `report-${report.id}`);
      list.append(card);
    });
  }

  function renderLinks() {
    const list = one("[data-ipad-link-list]");
    const links = state.overview?.line_links || [];
    if (!list) return;
    list.replaceChildren();

    if (!links.length) {
      list.append(
        emptyState(
          "承認待ち申請はありません",
          "本人・家族のLINE連携申請が届くと表示されます。"
        )
      );
      return;
    }

    links.forEach((link) => {
      const { card } = createCard({
        time: formatDateTime(link.created_at),
        title:
          `${link.patient?.patient_number || "番号未確認"}　` +
          `${link.patient?.full_name || "利用者"}様`,
        meta:
          `申請者：${link.applicant_name || "－"}様／` +
          `続柄：${link.relationship || "－"}`,
        message: link.contact_name
          ? `登録済み連絡先：${link.contact_name}様`
          : "本人として申請",
        badge: badge("承認待ち", "status--progress")
      });

      const row = actionRow(card);
      const approve = document.createElement("button");
      approve.type = "button";
      approve.className = "btn btn--primary";
      approve.textContent = "照合済みとして承認";
      approve.dataset.approveLink = link.id;
      row.append(approve);

      actionStatus(card, `link-${link.id}`);
      list.append(card);
    });
  }

  function renderHandoffs() {
    const list = one("[data-ipad-handoff-list]");
    const handoffs = state.overview?.handoffs || [];
    if (!list) return;
    list.replaceChildren();

    if (!handoffs.length) {
      list.append(
        emptyState(
          "未完了の内部申し送りはありません",
          "状態変化などが記録されると表示されます。"
        )
      );
      return;
    }

    handoffs.forEach((handoff) => {
      const high = ["high", "urgent"].includes(handoff.priority);
      const { card } = createCard({
        time: formatDateTime(handoff.created_at),
        title:
          `${handoff.patient?.patient_number || "番号未確認"}　` +
          `${handoff.patient?.full_name || "利用者"}様`,
        meta:
          handoff.visit
            ? `訪問 ${formatTime(handoff.visit.planned_start)}～${formatTime(handoff.visit.planned_end)}`
            : "訪問指定なし",
        message: handoff.message || "申し送り内容なし",
        badge: badge(
          high ? "最優先" : "要確認",
          "status--alert"
        ),
        tone: "alert"
      });
      list.append(card);
    });
  }

  function renderInstructions() {
    const list = one("[data-ipad-instruction-list]");
    const rows = state.overview?.instructions || [];
    if (!list) return;
    list.replaceChildren();

    if (!rows.length) {
      list.append(
        emptyState(
          "30日以内の期限対象はありません",
          "期限が近づくと表示されます。"
        )
      );
      return;
    }

    rows.forEach((item) => {
      const validUntil =
        item.valid_until ||
        item.expiration_date ||
        item.due_date ||
        "期限未確認";
      const { card } = createCard({
        time: validUntil,
        title:
          `${item.patient?.patient_number || "番号未確認"}　` +
          `${item.patient?.full_name || "利用者"}様`,
        meta: `状態：${item.status || "確認中"}`,
        message:
          item.note ||
          item.memo ||
          "指示書の原本・更新状況を事業所の管理方法で確認してください。",
        badge: badge("期限確認", "status--alert"),
        tone: "warning"
      });
      list.append(card);
    });
  }

  function renderAll() {
    renderMetrics();
    renderVisits();
    renderContacts();
    renderReports();
    renderLinks();
    renderHandoffs();
    renderInstructions();
  }

  async function loadOverview(options = {}) {
    const status = one("[data-ipad-overview-status]");
    const latest = one("[data-ipad-latest-badge]");
    const date = one("[data-ipad-date]")?.value || jstDateString();

    if (!token() || state.loading) return;
    state.loading = true;
    if (latest) {
      latest.className = "status status--progress";
      latest.textContent = "更新中";
    }
    setStatus(status, `${date}の当日運用データを取得しています。`, "info");

    try {
      const result = await api.request(
        `/v1/admin/ipad-overview?date=${encodeURIComponent(date)}`,
        { token: token() }
      );
      state.overview = result;
      renderAll();
      setStatus(
        status,
        `${result.date || date}の実データを取得しました。`,
        "success"
      );
      if (latest) {
        latest.className = "status status--done";
        latest.textContent = "最新";
      }
      if (options.toast) {
        showToast("管理者iPad画面を最新情報へ更新しました。");
      }
    } catch (error) {
      if (handleExpired(error, status)) return;
      setStatus(status, readableError(error), "error");
      if (latest) {
        latest.className = "status status--alert";
        latest.textContent = "取得失敗";
      }
    } finally {
      state.loading = false;
    }
  }

  async function updateContact(button) {
    const id = button.dataset.contactStatus;
    const nextStatus = button.dataset.nextStatus;
    const status = one(`[data-ipad-action-status='contact-${id}']`);
    const label =
      nextStatus === "resolved" ? "対応済み" : "確認中";

    if (
      nextStatus === "resolved" &&
      !window.confirm(
        "事業所内で必要な対応・連絡を完了したことを確認し、対応済みにしますか？"
      )
    ) {
      return;
    }

    setBusy(button, true, "更新中…");
    try {
      const result = await api.request(`/v1/admin/contact-requests/${id}`, {
        method: "PATCH",
        token: token(),
        idempotencyKey: api.idempotencyKey("admin-contact-status"),
        body: { status: nextStatus }
      });
      setStatus(
        status,
        result.message || `連絡を${label}へ更新しました。`,
        "success"
      );
      showToast(`家族からの連絡を${label}へ更新しました。`);
      await loadOverview();
    } catch (error) {
      if (handleExpired(error, status)) return;
      setStatus(status, readableError(error), "error");
    } finally {
      setBusy(button, false, "");
    }
  }

  async function approveReport(button) {
    const id = button.dataset.approveReport;
    const reportText = button.dataset.reportText;
    const status = one(`[data-ipad-action-status='report-${id}']`);

    if (
      !window.confirm(
        "病名・内部申し送り・第三者情報が含まれていないことを確認し、本人・家族ページへ公開しますか？"
      )
    ) {
      return;
    }

    setBusy(button, true, "公開中…");
    try {
      const result = await api.request(
        `/v1/admin/family-reports/${id}/approve`,
        {
          method: "POST",
          token: token(),
          idempotencyKey: api.idempotencyKey("ipad-report-approve"),
          body: { report_text: reportText }
        }
      );
      setStatus(
        status,
        result.message || "家族向け報告を公開しました。",
        "success"
      );
      showToast("家族向け報告を公開しました。");
      await loadOverview();
    } catch (error) {
      if (handleExpired(error, status)) return;
      setStatus(status, readableError(error), "error");
    } finally {
      setBusy(button, false, "");
    }
  }

  async function approveLink(button) {
    const id = button.dataset.approveLink;
    const status = one(`[data-ipad-action-status='link-${id}']`);

    if (
      !window.confirm(
        "本人・家族の同意、登録電話番号、続柄、閲覧許可を照合済みとして承認しますか？"
      )
    ) {
      return;
    }

    setBusy(button, true, "承認中…");
    try {
      const result = await api.request(
        `/v1/admin/line-links/${id}/approve`,
        {
          method: "POST",
          token: token(),
          idempotencyKey: api.idempotencyKey("ipad-line-approve"),
          body: {}
        }
      );
      setStatus(
        status,
        result.message || "LINE連携を承認しました。",
        "success"
      );
      showToast("LINE連携を承認しました。");
      await loadOverview();
    } catch (error) {
      if (handleExpired(error, status)) return;
      setStatus(status, readableError(error), "error");
    } finally {
      setBusy(button, false, "");
    }
  }

  function setupLogin() {
    const form = one("[data-ipad-login-form]");
    if (!form || !api) return;
    const status = one("[data-ipad-login-status]", form);
    const button = one("[data-ipad-login-button]", form);

    one("[data-ipad-clear-code]", form)?.addEventListener("click", () => {
      const input = one("[name='admin_code']", form);
      if (input) {
        input.value = "";
        input.focus();
      }
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      hideStatus(status);
      if (!form.reportValidity()) return;

      const adminCode = clean(new FormData(form).get("admin_code"));
      setBusy(button, true, "管理者認証中…");

      try {
        const result = await api.request("/v1/admin/login", {
          method: "POST",
          body: { admin_code: adminCode }
        });
        api.saveAdminSession(result.token, result.expires_at);
        one("[name='admin_code']", form).value = "";
        setText(
          "[data-ipad-environment]",
          result.environment === "production" ? "本番環境" : "デモ環境"
        );
        showAuthenticated(true);
        showToast("管理者iPad画面へログインしました。");
        await loadOverview();
      } catch (error) {
        api.clearAdminSession();
        showAuthenticated(false);
        setStatus(status, readableError(error), "error");
      } finally {
        setBusy(button, false, "");
      }
    });
  }

  function setupActions() {
    one("[data-ipad-refresh]")?.addEventListener(
      "click",
      () => loadOverview({ toast: true })
    );

    one("[data-ipad-date]")?.addEventListener(
      "change",
      () => loadOverview()
    );

    one("[data-ipad-logout]")?.addEventListener("click", () => {
      api.clearAdminSession();
      state.overview = null;
      showAuthenticated(false);
      setStatus(
        one("[data-ipad-login-status]"),
        "ログアウトしました。",
        "success"
      );
      showToast("管理者セッションを終了しました。");
      one("[name='admin_code']")?.focus();
    });

    document.addEventListener("click", (event) => {
      const contact = event.target.closest("[data-contact-status]");
      const report = event.target.closest("[data-approve-report]");
      const link = event.target.closest("[data-approve-link]");
      if (contact) updateContact(contact);
      if (report) approveReport(report);
      if (link) approveLink(link);
    });
  }

  function init() {
    const date = one("[data-ipad-date]");
    if (date) date.value = jstDateString();

    if (!api) {
      setStatus(
        one("[data-ipad-login-status]"),
        "API機能を読み込めませんでした。画面を再読み込みしてください。",
        "error"
      );
      return;
    }

    setupLogin();
    setupActions();

    if (token()) {
      showAuthenticated(true);
      loadOverview();
    } else {
      showAuthenticated(false);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
