"use strict";

(function bootstrapDproNursing() {
  const config = window.DPRO_CONFIG || {};
  const api = window.DPRO_API || null;
  let toastTimer = null;
  let memberLineToken = "";

  function all(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function one(selector, root = document) {
    return root.querySelector(selector);
  }

  function setText(selector, value) {
    all(selector).forEach((element) => {
      element.textContent = value;
    });
  }

  function currentFileName() {
    const fileName = (window.location.pathname || "").split("/").pop();
    return fileName || "index.html";
  }

  function formatTokyoDate(value = new Date(), withTime = false) {
    try {
      const options = {
        timeZone: config.timeZone || "Asia/Tokyo",
        year: "numeric",
        month: "numeric",
        day: "numeric",
        weekday: "short"
      };
      if (withTime) {
        options.hour = "2-digit";
        options.minute = "2-digit";
      }
      return new Intl.DateTimeFormat("ja-JP", options).format(new Date(value));
    } catch (_error) {
      return "日時を取得できません";
    }
  }

  function showToast(message) {
    const toast = one("[data-toast]");
    if (!toast) return;
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 4200);
  }

  function setStatus(target, message, type = "info") {
    if (!target) return;
    target.hidden = false;
    target.textContent = message;
    target.className = `form-status form-status--${type}`;
  }

  function hideStatus(target) {
    if (!target) return;
    target.hidden = true;
    target.textContent = "";
  }

  function setBusy(form, busy, busyLabel = "送信中…") {
    const button = one("[data-submit-button]", form);
    if (!button) return;
    if (!button.dataset.defaultLabel) {
      button.dataset.defaultLabel = button.textContent.trim();
    }
    button.disabled = busy;
    button.setAttribute("aria-busy", String(busy));
    button.textContent = busy ? busyLabel : button.dataset.defaultLabel;
  }

  function readableError(error) {
    const message = error?.message || "処理を完了できませんでした。";
    return error?.requestId ? `${message}（確認番号: ${error.requestId}）` : message;
  }

  function formValue(form, name) {
    return String(new FormData(form).get(name) || "").trim();
  }

  function setupNavigation() {
    const current = currentFileName();
    all("[data-nav-link]").forEach((link) => {
      if (link.getAttribute("href") === current) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });

    const toggle = one("[data-nav-toggle]");
    const nav = one("[data-global-nav]");
    if (!toggle || !nav) return;

    toggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(isOpen));
      toggle.textContent = isOpen ? "閉じる" : "メニュー";
    });
  }

  function setupClearButtons() {
    all("[data-clear-target]").forEach((button) => {
      button.addEventListener("click", () => {
        const target = document.getElementById(button.dataset.clearTarget);
        if (!target) return;
        target.value = "";
        target.focus();
        showToast("入力内容を削除しました。");
      });
    });
  }

  function setupPanels() {
    all("[data-panel-target]").forEach((button) => {
      button.addEventListener("click", () => {
        const group = button.closest("[data-panel-group]");
        const root = group ? group.parentElement : document;
        all("[data-panel-target]", group || document).forEach((item) => {
          item.setAttribute("aria-selected", String(item === button));
        });
        all("[data-panel]", root).forEach((panel) => {
          const active = panel.id === button.dataset.panelTarget;
          panel.classList.toggle("is-active", active);
          panel.hidden = !active;
        });
      });
    });
  }

  function setupPreviewActions() {
    all("[data-preview-form]").forEach((form) => {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        showToast("この機能は後続STEPでAPIへ接続します。");
      });
    });
    all("[data-preview-action]").forEach((button) => {
      button.addEventListener("click", () => {
        showToast(button.dataset.previewMessage || "この操作は後続STEPで接続します。");
      });
    });
  }

  function sourceTypeForRelationship(relationship) {
    if (relationship === "本人") return "patient";
    if (relationship === "家族・親族") return "family";
    if (relationship === "病院・診療所") return "hospital";
    if (relationship === "ケアマネジャー") return "care_manager";
    return "supporter";
  }

  function setupConsultationForm() {
    const form = one("[data-consultation-form]");
    if (!form || !api) return;
    const status = one("[data-consultation-status]", form);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      hideStatus(status);
      if (!form.reportValidity()) return;

      const phone = api.normalizePhone(formValue(form, "consultant_phone"));
      if (!/^[0-9]{8,15}$/.test(phone)) {
        setStatus(status, "電話番号を市外局番から正しく入力してください。", "error");
        one("[name='consultant_phone']", form)?.focus();
        return;
      }

      const relationship = formValue(form, "relationship");
      form.dataset.idempotencyKey ||= api.idempotencyKey("inquiry");
      setBusy(form, true, "相談を送信中…");

      try {
        const result = await api.request("/v1/inquiries", {
          method: "POST",
          idempotencyKey: form.dataset.idempotencyKey,
          body: {
            consultant_name: formValue(form, "consultant_name"),
            consultant_phone: phone,
            relationship,
            source_type: sourceTypeForRelationship(relationship),
            consultation_type: formValue(form, "consultation_type"),
            consultation_summary: formValue(form, "consultation_summary")
          }
        });
        delete form.dataset.idempotencyKey;
        setStatus(
          status,
          `${result.message} 受付番号は「${result.inquiry_number}」です。`,
          "success"
        );
        form.reset();
        showToast("新規相談を受け付けました。");
      } catch (error) {
        setStatus(status, readableError(error), "error");
      } finally {
        setBusy(form, false);
      }
    });
  }

  function setupLineLinkForm() {
    const form = one("[data-line-link-form]");
    if (!form || !api) return;
    const status = one("[data-line-link-status]", form);
    const button = one("[data-submit-button]", form);

    if (!api.lineConfigured()) {
      button.disabled = true;
      setStatus(
        status,
        "LINE連携は現在設定準備中です。LIFF ID設定後に申請できるようになります。",
        "info"
      );
      return;
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      hideStatus(status);
      if (!form.reportValidity()) return;

      const phone = api.normalizePhone(formValue(form, "member_phone"));
      if (!/^[0-9]{8,15}$/.test(phone)) {
        setStatus(status, "電話番号を市外局番から正しく入力してください。", "error");
        one("[name='member_phone']", form)?.focus();
        return;
      }

      const relationshipSelect = one("[name='link_relationship']", form);
      const linkedPersonType = relationshipSelect.value;
      const relationship = relationshipSelect.selectedOptions[0]?.textContent.trim() || "";
      setBusy(form, true, "LINE認証を確認中…");

      try {
        const token = await api.lineIdToken();
        const result = await api.request("/v1/member/link-request", {
          method: "POST",
          token,
          body: {
            member_number: formValue(form, "member_number"),
            member_phone: phone,
            link_relationship: relationship,
            linked_person_type: linkedPersonType
          }
        });
        setStatus(status, result.message, "success");
        form.reset();
        showToast("LINE連携申請を受け付けました。");
      } catch (error) {
        setStatus(
          status,
          readableError(error),
          error?.code === "LIFF_LOGIN_REDIRECT" ? "info" : "error"
        );
      } finally {
        setBusy(form, false);
      }
    });
  }

  function visitKindLabel(value) {
    const labels = {
      regular: "定期訪問",
      rehabilitation: "訪問リハビリ",
      urgent: "緊急訪問",
      temporary: "臨時訪問",
      other: "訪問予定"
    };
    return labels[value] || "訪問予定";
  }

  function renderMemberVisits(visits) {
    const list = one("[data-member-visits]");
    if (!list) return;
    list.replaceChildren();

    if (!visits.length) {
      list.append(emptyState("今後の訪問予定はありません", "予定が決まり次第、こちらに表示されます。"));
      return;
    }

    visits.forEach((visit) => {
      const item = document.createElement("li");
      item.className = "visit-card";
      const time = document.createElement("div");
      time.className = "visit-card__time";
      time.textContent = formatTokyoDate(visit.planned_start, true);
      const detail = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = visitKindLabel(visit.visit_kind);
      const meta = document.createElement("p");
      meta.className = "visit-card__meta";
      meta.textContent = `終了予定 ${formatTokyoDate(visit.planned_end, true)}`;
      detail.append(title, meta);
      const actions = document.createElement("div");
      actions.className = "visit-card__actions";
      const badge = document.createElement("span");
      badge.className = "status status--scheduled";
      badge.textContent = "予定";
      actions.append(badge);
      item.append(time, detail, actions);
      list.append(item);
    });
  }

  function renderMemberReports(reports) {
    const list = one("[data-member-reports]");
    if (!list) return;
    list.replaceChildren();

    if (!reports.length) {
      list.append(emptyState("公開済み報告はありません", "管理者が公開を承認した報告だけが表示されます。"));
      return;
    }

    reports.forEach((report) => {
      const article = document.createElement("article");
      article.className = "notice-card";
      const eyebrow = document.createElement("p");
      eyebrow.className = "eyebrow";
      eyebrow.textContent = "訪問完了報告";
      const title = document.createElement("h3");
      title.textContent = formatTokyoDate(report.published_at, true);
      const text = document.createElement("p");
      text.textContent = report.report_text;
      article.append(eyebrow, title, text);
      list.append(article);
    });
  }

  function emptyState(titleText, detailText) {
    const container = document.createElement("div");
    container.className = "empty-state";
    const title = document.createElement("strong");
    title.textContent = titleText;
    const detail = document.createTextNode(detailText);
    container.append(title, detail);
    return container;
  }

  async function loadMemberHome() {
    const authState = one("[data-member-auth-state]");
    const submit = one("[data-member-contact-form] [data-submit-button]");
    if (!authState || !api) return;

    if (!api.lineConfigured()) {
      setStatus(
        authState,
        "LINE設定準備中です。LIFF ID設定後、承認済みの本人・ご家族だけが利用できます。",
        "info"
      );
      renderMemberVisits([]);
      renderMemberReports([]);
      return;
    }

    try {
      memberLineToken = await api.lineIdToken();
      const result = await api.request("/v1/member/home", { token: memberLineToken });
      setStatus(authState, "LINE連携を確認しました。公開が承認された情報を表示しています。", "success");
      setText("[data-member-heading]", `${result.patient.full_name}様の訪問予定`);
      const badge = one("[data-member-link-status]");
      if (badge) {
        badge.className = "status status--done";
        badge.textContent = "連携承認済み";
      }
      renderMemberVisits(result.next_visits || []);
      renderMemberReports(result.family_reports || []);
      if (submit) submit.disabled = false;
    } catch (error) {
      setStatus(
        authState,
        readableError(error),
        error?.code === "LIFF_LOGIN_REDIRECT" ? "info" : "error"
      );
      renderMemberVisits([]);
      renderMemberReports([]);
    }
  }

  function setupMemberContactForm() {
    const form = one("[data-member-contact-form]");
    if (!form || !api) return;
    const status = one("[data-member-contact-status]", form);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      hideStatus(status);
      if (!form.reportValidity()) return;
      if (!memberLineToken) {
        setStatus(status, "LINE連携の承認状態を確認できません。画面を再読み込みしてください。", "error");
        return;
      }

      form.dataset.idempotencyKey ||= api.idempotencyKey("member-contact");
      setBusy(form, true, "事業所へ送信中…");
      try {
        const result = await api.request("/v1/member/contact-requests", {
          method: "POST",
          token: memberLineToken,
          idempotencyKey: form.dataset.idempotencyKey,
          body: {
            request_kind: formValue(form, "request_kind"),
            callback_window: formValue(form, "callback_window"),
            request_message: formValue(form, "request_message")
          }
        });
        delete form.dataset.idempotencyKey;
        setStatus(status, result.message, "success");
        form.reset();
        showToast("事業所への連絡を受け付けました。");
      } catch (error) {
        setStatus(status, readableError(error), "error");
      } finally {
        setBusy(form, false);
      }
    });
  }

  function setAdminUi(authenticated) {
    const badge = one("[data-admin-session-badge]");
    const refresh = one("[data-refresh-line-links]");
    const logout = one("[data-admin-logout]");
    if (badge) {
      badge.className = `status ${authenticated ? "status--done" : "status--progress"}`;
      badge.textContent = authenticated ? "認証済み" : "未認証";
    }
    if (refresh) refresh.disabled = !authenticated;
    if (logout) logout.hidden = !authenticated;
  }

  function renderLineLinks(links) {
    const list = one("[data-line-link-list]");
    if (!list) return;
    list.replaceChildren();

    if (!links.length) {
      list.append(emptyState("承認待ち申請はありません", "新しい申請が届くとここに表示されます。"));
      return;
    }

    links.forEach((link) => {
      const article = document.createElement("article");
      article.className = "notice-card";
      const badge = document.createElement("span");
      badge.className = "status status--progress";
      badge.textContent = "LINE連携・承認待ち";
      const title = document.createElement("h3");
      title.className = "section";
      title.textContent = `${link.patient.patient_number} ${link.patient.full_name}様`;
      const applicant = document.createElement("p");
      applicant.textContent = `申請者：${link.applicant_name}様／関係：${link.relationship}`;
      const reference = document.createElement("p");
      reference.className = "visit-card__meta";
      reference.textContent = link.contact_name
        ? `登録済み連絡先：${link.contact_name}様`
        : "本人として申請";
      const date = document.createElement("p");
      date.className = "visit-card__meta";
      date.textContent = `申請日時：${formatTokyoDate(link.created_at, true)}`;
      const row = document.createElement("div");
      row.className = "button-row";
      const approve = document.createElement("button");
      approve.type = "button";
      approve.className = "btn btn--primary";
      approve.textContent = "照合済みとして承認";
      approve.dataset.approveLineLink = link.id;
      row.append(approve);
      article.append(badge, title, applicant, reference, date, row);
      list.append(article);
    });
  }

  async function loadPendingLineLinks() {
    const token = api?.adminToken();
    const status = one("[data-line-link-admin-status]");
    if (!token) {
      setAdminUi(false);
      setStatus(status, "管理者ログイン後に承認待ち申請を取得できます。", "info");
      return;
    }

    setStatus(status, "承認待ち申請を取得しています。", "info");
    try {
      const result = await api.request("/v1/admin/line-links?status=pending", { token });
      renderLineLinks(result.line_links || []);
      setStatus(status, `承認待ち ${result.count || 0}件を取得しました。`, "success");
      setAdminUi(true);
    } catch (error) {
      if ([401, 403].includes(error?.status)) {
        api.clearAdminSession();
        setAdminUi(false);
      }
      setStatus(status, readableError(error), "error");
    }
  }

  function setupAdmin() {
    const form = one("[data-admin-login-form]");
    if (!form || !api) return;
    const loginStatus = one("[data-admin-login-status]", form);
    const refresh = one("[data-refresh-line-links]");
    const logout = one("[data-admin-logout]");

    setAdminUi(Boolean(api.adminToken()));
    if (api.adminToken()) loadPendingLineLinks();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      hideStatus(loginStatus);
      if (!form.reportValidity()) return;
      setBusy(form, true, "認証中…");
      try {
        const result = await api.request("/v1/admin/login", {
          method: "POST",
          body: { admin_code: formValue(form, "admin_code") }
        });
        api.saveAdminSession(result.token, result.expires_at);
        one("[name='admin_code']", form).value = "";
        setAdminUi(true);
        setStatus(loginStatus, "管理者認証に成功しました。", "success");
        one("[data-panel-target='approval-panel']")?.click();
        await loadPendingLineLinks();
      } catch (error) {
        setAdminUi(false);
        setStatus(loginStatus, readableError(error), "error");
      } finally {
        setBusy(form, false);
      }
    });

    refresh?.addEventListener("click", loadPendingLineLinks);
    logout?.addEventListener("click", () => {
      api.clearAdminSession();
      setAdminUi(false);
      renderLineLinks([]);
      setStatus(loginStatus, "管理者セッションを終了しました。", "info");
    });

    one("[data-line-link-list]")?.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-approve-line-link]");
      if (!button) return;
      const token = api.adminToken();
      if (!token) {
        setStatus(loginStatus, "管理者ログインをやり直してください。", "error");
        return;
      }
      button.disabled = true;
      button.textContent = "承認処理中…";
      const status = one("[data-line-link-admin-status]");
      try {
        await api.request(`/v1/admin/line-links/${button.dataset.approveLineLink}/approve`, {
          method: "POST",
          token,
          idempotencyKey: api.idempotencyKey("approve-line-link"),
          body: {}
        });
        setStatus(status, "LINE連携を承認しました。", "success");
        await loadPendingLineLinks();
      } catch (error) {
        button.disabled = false;
        button.textContent = "照合済みとして承認";
        setStatus(status, readableError(error), "error");
      }
    });
  }

  function localCheckItems() {
    const minimumFont = Number.parseFloat(window.getComputedStyle(document.body).fontSize);
    const requiredPages = [
      "index.html",
      "member.html",
      "staff.html",
      "owner.html",
      "owner-ipad.html",
      "system-check.html"
    ];
    const links = all("[data-nav-link]").map((link) => link.getAttribute("href"));
    return [
      {
        id: "frontend_config",
        status: window.DPRO_CONFIG && config.systemCode === "NURSING" ? "pass" : "fail",
        detail: "DPRO_CONFIG / NURSING"
      },
      {
        id: "frontend_timezone",
        status: config.timeZone === "Asia/Tokyo" ? "pass" : "fail",
        detail: config.timeZone || "未設定"
      },
      {
        id: "frontend_production_guard",
        status: config.productionGuard === true ? "pass" : "fail",
        detail: String(config.productionGuard)
      },
      {
        id: "frontend_pages",
        status: requiredPages.every((page) => links.includes(page)) ? "pass" : "fail",
        detail: `${requiredPages.filter((page) => links.includes(page)).length}/${requiredPages.length}`
      },
      {
        id: "frontend_font_size",
        status: minimumFont >= 16 ? "pass" : "fail",
        detail: `${minimumFont}px`
      },
      {
        id: "frontend_liff_id",
        status: api?.lineConfigured() ? "pass" : "pending",
        detail: api?.lineConfigured() ? "LIFF ID設定済み" : "config.jsのLIFF ID未設定"
      }
    ];
  }

  function checkLabel(id) {
    const labels = {
      frontend_config: "フロント共通設定",
      frontend_timezone: "画面タイムゾーン",
      frontend_production_guard: "画面production_guard",
      frontend_pages: "必須画面リンク",
      frontend_font_size: "本文文字サイズ",
      frontend_liff_id: "LIFF ID",
      health: "Worker・Supabase疎通",
      public_config: "公開設定API",
      worker: "Workerバージョン",
      supabase: "Supabase接続",
      office: "事業所設定",
      production_guard: "本番・デモ区分",
      cors: "CORS許可元",
      line_login: "LINE Login Channel ID",
      database_step2: "NURSING-2データベース",
      manager_actor: "承認担当管理者",
      line_link_api: "LINE連携承認API"
    };
    return labels[id] || id;
  }

  function renderChecks(items) {
    const list = one("[data-check-list]");
    if (!list) return;
    list.replaceChildren();
    items.forEach((item) => {
      const row = document.createElement("li");
      const text = document.createElement("div");
      const title = document.createElement("strong");
      const detail = document.createElement("div");
      const badge = document.createElement("span");
      title.textContent = checkLabel(item.id);
      detail.textContent = item.detail || "";
      detail.className = "visit-card__meta";
      text.append(title, detail);
      if (item.status === "pass") {
        badge.textContent = "合格";
        badge.className = "status status--done";
      } else if (item.status === "pending") {
        badge.textContent = "保留";
        badge.className = "status status--progress";
      } else {
        badge.textContent = "不合格";
        badge.className = "status status--alert";
      }
      row.append(text, badge);
      list.append(row);
    });
    setText("[data-check-pass]", String(items.filter((item) => item.status === "pass").length));
    setText("[data-check-pending]", String(items.filter((item) => item.status === "pending").length));
    setText("[data-check-fail]", String(items.filter((item) => item.status === "fail").length));
  }

  function setupSystemCheck() {
    const form = one("[data-system-check-form]");
    if (!form || !api) return;
    const status = one("[data-system-check-status]", form);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const items = localCheckItems();
      renderChecks(items);
      setBusy(form, true, "一括検査中…");
      setStatus(status, "Workerとデータベースを検査しています。", "info");

      try {
        const [health, publicConfig] = await Promise.all([
          api.request("/health"),
          api.request("/v1/config")
        ]);
        items.push({
          id: "health",
          status: health.ok && health.database === "connected" ? "pass" : "fail",
          detail: `${health.version} / ${health.database || "未接続"}`
        });
        items.push({
          id: "public_config",
          status: publicConfig.ok ? "pass" : "fail",
          detail: `${publicConfig.office?.code || "事業所未確認"} / LINE ${publicConfig.line_login_configured ? "設定済み" : "未設定"}`
        });

        const login = await api.request("/v1/admin/login", {
          method: "POST",
          body: { admin_code: formValue(form, "admin_code") }
        });
        const server = await api.request("/v1/system-check", { token: login.token });
        items.push(...(server.checks || []));
        renderChecks(items);

        const failed = items.filter((item) => item.status === "fail").length;
        const pending = items.filter((item) => item.status === "pending").length;
        setStatus(
          status,
          failed
            ? `検査に${failed}件の不合格があります。内容を確認してください。`
            : pending
              ? `不合格はありません。未設定による保留が${pending}件あります。`
              : "NURSING-4の全検査に合格しました。",
          failed ? "error" : pending ? "info" : "success"
        );
      } catch (error) {
        items.push({ id: "worker", status: "fail", detail: readableError(error) });
        renderChecks(items);
        setStatus(status, readableError(error), "error");
      } finally {
        setBusy(form, false);
      }
    });
  }

  async function loadPublicConfiguration() {
    if (!api) return;
    try {
      const result = await api.request("/v1/config");
      if (result.office?.name) setText("[data-office-name]", result.office.name);
      if (result.office?.code) setText("[data-office-code]", result.office.code);
      if (result.emergency_notice) setText("[data-emergency-message]", result.emergency_notice);
      if (result.scope_notice) setText("[data-scope-notice]", result.scope_notice);
    } catch (_error) {
      // 個別フォームまたはsystem-checkで、利用者が対処できる日本語エラーを表示する。
    }
  }

  function applyConfiguration() {
    setText("[data-system-name]", config.systemName || "DPRO 訪問看護ステーション LINE");
    setText("[data-version]", config.version || "未設定");
    setText("[data-office-name]", config.officeName || "事業所名未設定");
    setText("[data-office-code]", config.officeCode || "未設定");
    setText("[data-current-date]", formatTokyoDate());
    setText(
      "[data-emergency-message]",
      config.emergencyMessage || "緊急時は事業所または119へ電話してください。"
    );
    setText("[data-scope-notice]", config.scopeNotice || "");
    all("[data-demo-only]").forEach((element) => {
      element.classList.toggle("is-hidden", config.demoMode !== true);
    });
  }

  function init() {
    applyConfiguration();
    setupNavigation();
    setupClearButtons();
    setupPanels();
    setupPreviewActions();
    setupConsultationForm();
    setupLineLinkForm();
    setupMemberContactForm();
    setupAdmin();
    setupSystemCheck();
    loadPublicConfiguration();
    if (one("[data-member-auth-state]")) loadMemberHome();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
