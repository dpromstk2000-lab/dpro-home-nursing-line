"use strict";

(function bootstrapNursingFamilyReportAdmin() {
  const api = window.DPRO_API;
  const config = window.DPRO_CONFIG || {};
  const state = {
    pending: [],
    published: [],
    loading: false
  };

  function one(selector, root = document) {
    return root.querySelector(selector);
  }

  function clean(value) {
    return String(value ?? "").trim();
  }

  function token() {
    return api?.adminToken() || "";
  }

  function setStatus(element, message, type = "info") {
    if (!element) return;
    element.hidden = false;
    element.textContent = message;
    element.className = `form-status form-status--${type}`;
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

  function readableError(error) {
    const message = clean(error?.message) || "処理を完了できませんでした。";
    return error?.requestId
      ? `${message}（確認番号: ${error.requestId}）`
      : message;
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

  function visitKindLabel(value) {
    const labels = {
      regular: "定期訪問",
      rehabilitation: "訪問リハビリ",
      urgent: "緊急訪問",
      temporary: "臨時訪問",
      other: "訪問予定"
    };
    return labels[value] || "訪問";
  }

  function emptyState(titleText, detailText) {
    const container = document.createElement("div");
    container.className = "empty-state";
    const title = document.createElement("strong");
    title.textContent = titleText;
    container.append(title, document.createTextNode(detailText));
    return container;
  }

  function reportTitle(report) {
    const patientNumber = report.patient?.patient_number || "番号未確認";
    const patientName = report.patient?.full_name || "利用者";
    return `${patientNumber} ${patientName}様`;
  }

  function reportVisitMeta(report) {
    const visit = report.visit || {};
    const visitDate = visit.planned_start
      ? formatDateTime(visit.planned_start)
      : "訪問日時未確認";
    return `${visitKindLabel(visit.visit_kind)}／予定 ${visitDate}`;
  }

  function renderPendingReports() {
    const list = one("[data-pending-report-list]");
    const count = one("[data-pending-report-count]");
    if (count) {
      count.className = `status ${
        state.pending.length ? "status--progress" : "status--done"
      }`;
      count.textContent = `${state.pending.length}件`;
    }
    const dashboardCount = one("[data-count-reports]");
    if (dashboardCount) {
      dashboardCount.textContent = `${state.pending.length}件`;
    }
    if (!list) return;
    list.replaceChildren();

    if (!state.pending.length) {
      list.append(
        emptyState(
          "承認待ちの家族向け報告はありません",
          "スタッフが報告案を提出すると、ここに表示されます。"
        )
      );
      return;
    }

    state.pending.forEach((report) => {
      const card = document.createElement("article");
      card.className = "owner-report-card";
      card.dataset.reportId = report.id;

      const header = document.createElement("div");
      header.className = "owner-report-card__header";

      const titleBox = document.createElement("div");
      const title = document.createElement("h4");
      title.textContent = reportTitle(report);
      const meta = document.createElement("p");
      meta.className = "owner-report-card__meta";
      meta.textContent =
        `${reportVisitMeta(report)}／提出 ${formatDateTime(
          report.created_at || report.submitted_at
        )}`;
      titleBox.append(title, meta);

      const badge = document.createElement("span");
      badge.className = "status status--progress";
      badge.textContent = "承認待ち";
      header.append(titleBox, badge);

      const label = document.createElement("label");
      label.className = "field owner-report-text-field";
      const labelText = document.createElement("span");
      labelText.textContent = "家族へ公開する文章";
      const textarea = document.createElement("textarea");
      textarea.value = report.report_text || "";
      textarea.maxLength = 2000;
      textarea.required = true;
      textarea.dataset.reportText = report.id;
      textarea.setAttribute(
        "aria-label",
        `${reportTitle(report)}の家族向け公開文章`
      );
      const hint = document.createElement("small");
      hint.textContent =
        "病名・詳細な看護記録・内部申し送り・第三者情報を含めないでください。";
      label.append(labelText, textarea, hint);

      const actionRow = document.createElement("div");
      actionRow.className = "owner-report-actions";
      const approve = document.createElement("button");
      approve.type = "button";
      approve.className = "btn btn--primary";
      approve.textContent = "確認して家族へ公開";
      approve.dataset.approveFamilyReport = report.id;

      const status = document.createElement("div");
      status.className = "form-status";
      status.hidden = true;
      status.dataset.reportActionStatus = report.id;
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");

      actionRow.append(approve);
      card.append(header, label, actionRow, status);
      list.append(card);
    });
  }

  function renderPublishedReports() {
    const list = one("[data-published-report-list]");
    const count = one("[data-published-report-count]");
    if (count) count.textContent = `${state.published.length}件`;
    if (!list) return;
    list.replaceChildren();

    if (!state.published.length) {
      list.append(
        emptyState(
          "公開済みの家族向け報告はありません",
          "管理者が承認した報告がここに表示されます。"
        )
      );
      return;
    }

    state.published.forEach((report) => {
      const card = document.createElement("article");
      card.className = "owner-report-card owner-report-card--published";

      const header = document.createElement("div");
      header.className = "owner-report-card__header";
      const titleBox = document.createElement("div");
      const title = document.createElement("h4");
      title.textContent = reportTitle(report);
      const meta = document.createElement("p");
      meta.className = "owner-report-card__meta";
      meta.textContent =
        `${reportVisitMeta(report)}／公開 ${formatDateTime(
          report.published_at || report.updated_at
        )}`;
      titleBox.append(title, meta);

      const badge = document.createElement("span");
      badge.className = "status status--done";
      badge.textContent = "公開済み";
      header.append(titleBox, badge);

      const text = document.createElement("p");
      text.className = "owner-report-published-text";
      text.textContent = report.report_text || "公開文章なし";

      card.append(header, text);
      list.append(card);
    });
  }

  async function loadFamilyReports(options = {}) {
    const status = one("[data-report-status]");
    if (!token()) {
      setStatus(
        status,
        "管理者ログイン後に家族向け報告を取得できます。",
        "info"
      );
      return;
    }
    if (state.loading) return;
    state.loading = true;
    setStatus(status, "承認待ち・公開済み報告を取得しています。", "info");

    try {
      const [pendingResult, publishedResult] = await Promise.all([
        api.request("/v1/admin/family-reports?status=pending", {
          token: token()
        }),
        api.request("/v1/admin/family-reports?status=published", {
          token: token()
        })
      ]);
      state.pending = Array.isArray(pendingResult.reports)
        ? pendingResult.reports
        : [];
      state.published = Array.isArray(publishedResult.reports)
        ? publishedResult.reports
        : [];
      renderPendingReports();
      renderPublishedReports();
      setStatus(
        status,
        `承認待ち ${state.pending.length}件、公開済み ${state.published.length}件を取得しました。`,
        "success"
      );
      if (options.toast) {
        showToast("家族向け報告を最新情報へ更新しました。");
      }
    } catch (error) {
      setStatus(status, readableError(error), "error");
    } finally {
      state.loading = false;
    }
  }

  function setupApprovalActions() {
    one("[data-pending-report-list]")?.addEventListener(
      "click",
      async (event) => {
        const button = event.target.closest("[data-approve-family-report]");
        if (!button) return;

        const reportId = button.dataset.approveFamilyReport;
        const textarea = one(`[data-report-text='${reportId}']`);
        const actionStatus = one(
          `[data-report-action-status='${reportId}']`
        );
        const reportText = clean(textarea?.value);

        if (!reportText) {
          setStatus(
            actionStatus,
            "家族へ公開する文章を入力してください。",
            "error"
          );
          textarea?.focus();
          return;
        }

        if (
          !window.confirm(
            "この文章を本人・家族ページへ公開します。病名・内部申し送り・第三者情報が含まれていないことを確認しましたか？"
          )
        ) {
          return;
        }

        setBusy(button, true, "公開承認中…");
        try {
          const result = await api.request(
            `/v1/admin/family-reports/${reportId}/approve`,
            {
              method: "POST",
              token: token(),
              idempotencyKey: api.idempotencyKey(
                "admin-family-report-approve"
              ),
              body: { report_text: reportText }
            }
          );
          setStatus(
            actionStatus,
            result.message || "家族向け報告を公開しました。",
            "success"
          );
          showToast("家族向け報告を本人・家族ページへ公開しました。");
          await loadFamilyReports();
        } catch (error) {
          setStatus(actionStatus, readableError(error), "error");
        } finally {
          setBusy(button, false, "");
        }
      }
    );
  }

  function setupTriggers() {
    one("[data-report-refresh]")?.addEventListener("click", () =>
      loadFamilyReports({ toast: true })
    );

    one("[data-owner-refresh]")?.addEventListener("click", () =>
      loadFamilyReports()
    );

    one("[data-panel-target='reports-panel']")?.addEventListener(
      "click",
      () => loadFamilyReports()
    );
  }

  function init() {
    if (!api) {
      setStatus(
        one("[data-report-status]"),
        "API機能を読み込めませんでした。画面を再読み込みしてください。",
        "error"
      );
      return;
    }
    setupApprovalActions();
    setupTriggers();
    if (token()) loadFamilyReports();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
