"use strict";

(function bootstrapNursingFinalCheck() {
  const api = window.DPRO_API;
  const config = window.DPRO_CONFIG || {};

  const labels = Object.freeze({
    frontend_config: "フロント共通設定",
    frontend_timezone: "画面タイムゾーン",
    frontend_production_guard: "画面production_guard",
    frontend_pages: "必須画面リンク",
    frontend_font_size: "本文文字サイズ",
    frontend_liff_id: "LIFF ID",
    frontend_api_url: "Worker API URL",
    worker: "Workerバージョン",
    supabase: "Supabase接続",
    office: "事業所設定",
    timezone: "事業所タイムゾーン",
    production_guard: "本番・デモ区分",
    cors: "CORS許可元",
    admin_secret: "管理コード",
    auth_secret: "管理者セッション署名",
    staff_secret: "スタッフコード保護",
    session_ttl: "セッション有効期限",
    service_role_hidden: "service_role非公開",
    rate_limit: "送信回数制限",
    idempotency: "重複送信防止",
    phone_normalization: "電話番号正規化",
    line_login: "LINE Login",
    family_portal_setting: "本人・家族ポータル",
    line_link_approval_setting: "LINE連携承認必須",
    family_report_approval_setting: "家族報告承認必須",
    line_link_retry: "LINE連携再申請",
    member_report_publish: "公開済み報告表示",
    member_contact: "本人・家族からの連絡",
    database_step2: "NURSING-2データベース検査",
    manager_actor: "承認担当管理者",
    active_patient: "有効利用者",
    active_staff: "有効スタッフ",
    login_ready_staff: "スタッフログイン準備",
    future_visit: "今後の訪問予定",
    inquiry_api: "新規相談受付",
    staff_management_api: "スタッフ管理",
    staff_today_api: "スタッフ当日画面",
    visit_management_api: "訪問予定・配置",
    visit_event_api: "訪問開始・終了",
    family_report_management: "家族報告承認",
    line_link_api: "LINE連携承認",
    contact_request_management: "家族連絡管理",
    ipad_operations: "管理者iPad",
    internal_handoff: "内部申し送り",
    demo_prepare: "デモデータ準備"
  });

  function one(selector, root = document) {
    return root.querySelector(selector);
  }

  function all(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }

  function clean(value) {
    return String(value ?? "").trim();
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

  function adminCode(form) {
    return clean(new FormData(form).get("admin_code"));
  }

  async function login(form) {
    const result = await api.request("/v1/admin/login", {
      method: "POST",
      body: { admin_code: adminCode(form) }
    });
    return result.token;
  }

  function localChecks() {
    const minimumFont = Number.parseFloat(
      window.getComputedStyle(document.body).fontSize
    );
    const requiredPages = [
      "index.html",
      "member.html",
      "staff.html",
      "owner.html",
      "owner-ipad.html",
      "system-check.html"
    ];
    const links = all("[data-nav-link]").map(
      (link) => link.getAttribute("href")
    );

    return [
      {
        id: "frontend_config",
        category: "フロント",
        status:
          window.DPRO_CONFIG &&
          config.systemCode === "NURSING"
            ? "pass"
            : "fail",
        detail: `DPRO_CONFIG / ${config.systemCode || "未設定"}`
      },
      {
        id: "frontend_timezone",
        category: "フロント",
        status:
          config.timeZone === "Asia/Tokyo" ? "pass" : "fail",
        detail: config.timeZone || "未設定"
      },
      {
        id: "frontend_production_guard",
        category: "フロント",
        status:
          config.productionGuard === true ? "pass" : "fail",
        detail: String(config.productionGuard)
      },
      {
        id: "frontend_pages",
        category: "フロント",
        status:
          requiredPages.every((page) => links.includes(page))
            ? "pass"
            : "fail",
        detail:
          `${requiredPages.filter((page) => links.includes(page)).length}` +
          `/${requiredPages.length}`
      },
      {
        id: "frontend_font_size",
        category: "フロント",
        status: minimumFont >= 16 ? "pass" : "fail",
        detail: `${minimumFont}px`
      },
      {
        id: "frontend_liff_id",
        category: "フロント",
        status: api?.lineConfigured() ? "pass" : "pending",
        detail: api?.lineConfigured()
          ? "LIFF ID設定済み"
          : "LIFF ID未設定"
      },
      {
        id: "frontend_api_url",
        category: "フロント",
        status:
          /^https:\/\/.+\.workers\.dev$/i.test(
            clean(config.apiBaseUrl)
          )
            ? "pass"
            : "fail",
        detail: config.apiBaseUrl || "未設定"
      }
    ];
  }

  function badge(item) {
    const element = document.createElement("span");
    if (item.status === "pass") {
      element.className = "status status--done";
      element.textContent = "合格";
    } else if (item.status === "pending") {
      element.className = "status status--progress";
      element.textContent = "要確認";
    } else {
      element.className = "status status--alert";
      element.textContent = "不合格";
    }
    return element;
  }

  function renderChecks(items) {
    const container = one("[data-check-categories]");
    if (!container) return;
    container.replaceChildren();

    const grouped = items.reduce((map, item) => {
      const category = item.category || "その他";
      if (!map.has(category)) map.set(category, []);
      map.get(category).push(item);
      return map;
    }, new Map());

    grouped.forEach((rows, category) => {
      const section = document.createElement("section");
      section.className = "final-check-category";

      const heading = document.createElement("div");
      heading.className = "final-check-category__heading";
      const title = document.createElement("h3");
      title.textContent = category;
      const count = document.createElement("span");
      count.className = "final-check-category__count";
      count.textContent = String(rows.length);
      heading.append(title, count);

      const list = document.createElement("ul");
      list.className = "final-check-list";

      rows.forEach((item) => {
        const row = document.createElement("li");
        const text = document.createElement("div");
        text.className = "final-check-list__text";
        const name = document.createElement("strong");
        name.textContent = labels[item.id] || item.id;
        const detail = document.createElement("div");
        detail.className = "final-check-list__detail";
        detail.textContent = item.detail || "";
        text.append(name, detail);
        row.append(text, badge(item));
        list.append(row);
      });

      section.append(heading, list);
      container.append(section);
    });

    setText(
      "[data-check-pass]",
      String(items.filter((item) => item.status === "pass").length)
    );
    setText(
      "[data-check-pending]",
      String(items.filter((item) => item.status === "pending").length)
    );
    setText(
      "[data-check-fail]",
      String(items.filter((item) => item.status === "fail").length)
    );
  }

  function renderReadiness(result, allItems) {
    const card = one("[data-readiness-card]");
    const title = one("[data-readiness-title]");
    const detail = one("[data-readiness-detail]");
    const icon = one("[data-readiness-icon]");
    const badgeElement = one("[data-final-check-badge]");

    const failed = allItems.filter(
      (item) => item.status === "fail"
    ).length;
    const pending = allItems.filter(
      (item) => item.status === "pending"
    ).length;

    let state = result?.readiness || "blocked";
    if (failed > 0) state = "blocked";
    else if (pending > 0) state = "needs_review";
    else state = "ready";

    if (card) card.dataset.state = state;

    if (state === "ready") {
      if (icon) icon.textContent = "✓";
      if (title) title.textContent = "営業デモ実施可能です";
      if (detail) {
        detail.textContent =
          "自動検査に不合格・要確認はありません。実機操作済みの流れを使って営業デモを実施できます。";
      }
      if (badgeElement) {
        badgeElement.className = "status status--done";
        badgeElement.textContent = "準備完了";
      }
      return;
    }

    if (state === "needs_review") {
      if (icon) icon.textContent = "!";
      if (title) title.textContent = "要確認項目があります";
      if (detail) {
        detail.textContent =
          `不合格はありませんが、要確認が${pending}件あります。内容を確認してから公開してください。`;
      }
      if (badgeElement) {
        badgeElement.className = "status status--progress";
        badgeElement.textContent = "要確認";
      }
      return;
    }

    if (icon) icon.textContent = "×";
    if (title) title.textContent = "公開を停止してください";
    if (detail) {
      detail.textContent =
        `不合格が${failed}件あります。該当項目を修正して再検査してください。`;
    }
    if (badgeElement) {
      badgeElement.className = "status status--alert";
      badgeElement.textContent = "不合格";
    }
  }

  async function prepareDemo(form) {
    const button = one("[data-demo-prepare-button]", form);
    const status = one("[data-demo-prepare-status]", form);
    hideStatus(status);

    if (!form.reportValidity()) return;
    setBusy(button, true, "デモデータを準備中…");
    setStatus(
      status,
      "デモ利用者・管理者・翌日の訪問予定を確認しています。",
      "info"
    );

    try {
      const token = await login(form);
      const result = await api.request("/v1/admin/demo/prepare", {
        method: "POST",
        token,
        idempotencyKey: api.idempotencyKey("nursing10-demo-prepare"),
        body: {}
      });

      setStatus(
        status,
        `${result.message} 利用者番号：${result.credentials?.patient_number || "DEMO-PATIENT-01"}／` +
          `電話番号：${result.credentials?.patient_phone || "09000000000"}／` +
          `訪問日：${result.visit?.scheduled_date || "翌日"}`,
        "success"
      );
    } catch (error) {
      setStatus(status, readableError(error), "error");
    } finally {
      setBusy(button, false, "");
    }
  }

  async function runCheck(form) {
    const button = one("[data-final-check-button]", form);
    const status = one("[data-final-check-status]", form);
    const items = localChecks();
    hideStatus(status);
    renderChecks(items);

    if (!form.reportValidity()) return;

    setBusy(button, true, "最終検査中…");
    setStatus(
      status,
      "Worker・Supabase・LINE・主要機能を検査しています。",
      "info"
    );

    try {
      const [health, publicConfig, token] = await Promise.all([
        api.request("/health"),
        api.request("/v1/config"),
        login(form)
      ]);

      items.push(
        {
          id: "worker",
          category: "基盤",
          status:
            health.ok &&
            health.database === "connected" &&
            health.final_system_check === true
              ? "pass"
              : "fail",
          detail:
            `${health.version || "未確認"} / ` +
            `${health.database || "未接続"}`
        },
        {
          id: "supabase",
          category: "基盤",
          status:
            health.database === "connected" ? "pass" : "fail",
          detail: health.database || "未接続"
        },
        {
          id: "office",
          category: "基盤",
          status: publicConfig.ok ? "pass" : "fail",
          detail:
            `${publicConfig.office?.code || "未確認"} / ` +
            `${publicConfig.office?.name || "未確認"}`
        }
      );

      const server = await api.request("/v1/system-check", {
        token
      });

      const duplicateIds = new Set(
        items.map((item) => item.id)
      );
      (server.checks || []).forEach((item) => {
        if (!duplicateIds.has(item.id)) {
          items.push(item);
          duplicateIds.add(item.id);
        }
      });

      renderChecks(items);
      renderReadiness(server, items);
      setText(
        "[data-final-check-time]",
        new Intl.DateTimeFormat("ja-JP", {
          timeZone: "Asia/Tokyo",
          year: "numeric",
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        }).format(new Date(server.checked_at || Date.now()))
      );

      const failed = items.filter(
        (item) => item.status === "fail"
      ).length;
      const pending = items.filter(
        (item) => item.status === "pending"
      ).length;

      setStatus(
        status,
        failed
          ? `不合格が${failed}件あります。公開せず、内容を修正してください。`
          : pending
            ? `不合格はありません。要確認が${pending}件あります。`
            : "NURSING-10の全自動検査に合格しました。",
        failed ? "error" : pending ? "info" : "success"
      );
    } catch (error) {
      items.push({
        id: "worker",
        category: "基盤",
        status: "fail",
        detail: readableError(error)
      });
      renderChecks(items);
      renderReadiness(
        { readiness: "blocked" },
        items
      );
      setStatus(status, readableError(error), "error");
    } finally {
      setBusy(button, false, "");
    }
  }

  function init() {
    const form = one("[data-nursing10-check-form]");
    if (!form || !api) return;

    one("[data-nursing10-clear-code]", form)?.addEventListener(
      "click",
      () => {
        const input = one("[name='admin_code']", form);
        if (input) {
          input.value = "";
          input.focus();
        }
      }
    );

    one("[data-demo-prepare-button]", form)?.addEventListener(
      "click",
      () => prepareDemo(form)
    );

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      runCheck(form);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, {
      once: true
    });
  } else {
    init();
  }
})();
