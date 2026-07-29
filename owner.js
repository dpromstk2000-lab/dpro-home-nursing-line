"use strict";

(function bootstrapNursingOwner() {
  const api = window.DPRO_API;
  const config = window.DPRO_CONFIG || {};
  const state = {
    staff: [],
    links: [],
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

  const statusLabels = Object.freeze({
    active: "在籍中",
    leave: "休職中",
    inactive: "無効"
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
    return error?.requestId ? `${message}（確認番号: ${error.requestId}）` : message;
  }

  function setBusy(button, busy, label) {
    if (!button) return;
    if (!button.dataset.defaultLabel) button.dataset.defaultLabel = button.textContent.trim();
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
    showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 4200);
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

  function token() {
    return api?.adminToken() || "";
  }

  function authError(error) {
    return error?.status === 401 || error?.status === 403;
  }

  function showAuthenticated(authenticated) {
    const login = one("[data-owner-login-view]");
    const app = one("[data-owner-app]");
    const badge = one("[data-owner-session-badge]");
    if (login) login.hidden = authenticated;
    if (app) app.hidden = !authenticated;
    if (badge) {
      badge.className = `status ${authenticated ? "status--done" : "status--progress"}`;
      badge.textContent = authenticated ? "認証済み" : "未認証";
    }
  }

  function handleExpired(error, target) {
    if (!authError(error)) return false;
    api.clearAdminSession();
    showAuthenticated(false);
    setStatus(
      one("[data-owner-login-status]"),
      "管理者セッションが終了しました。もう一度ログインしてください。",
      "info"
    );
    if (target) setStatus(target, readableError(error), "error");
    return true;
  }

  async function loadDashboard() {
    const status = one("[data-dashboard-status]");
    const badge = one("[data-dashboard-badge]");
    if (!token()) return;
    if (badge) {
      badge.className = "status status--progress";
      badge.textContent = "更新中";
    }
    setStatus(status, "Supabaseの実データ件数を取得しています。", "info");
    try {
      const result = await api.request("/v1/admin/dashboard", { token: token() });
      const counts = result.counts || {};
      setText("[data-count-today-visits]", `${Number(counts.today_visits || 0)}件`);
      setText("[data-count-inquiries]", `${Number(counts.new_inquiries || 0)}件`);
      setText("[data-count-contacts]", `${Number(counts.open_contact_requests || 0)}件`);
      setText("[data-count-reports]", `${Number(counts.pending_family_reports || 0)}件`);
      setText("[data-count-links]", `${Number(counts.pending_line_links || 0)}件`);
      setText("[data-count-instructions]", `${Number(counts.instructions_due_within_30_days || 0)}件`);
      setText("[data-count-active-staff]", `${Number(counts.active_staff || 0)}名`);
      setText("[data-count-login-ready]", `${Number(counts.login_ready_staff || 0)}名`);
      setStatus(status, `${result.date || "本日"}の実データを取得しました。`, "success");
      if (badge) {
        badge.className = "status status--done";
        badge.textContent = "最新";
      }
    } catch (error) {
      if (handleExpired(error, status)) return;
      setStatus(status, readableError(error), "error");
      if (badge) {
        badge.className = "status status--alert";
        badge.textContent = "取得失敗";
      }
    }
  }

  function generateAccessCode(length = 16) {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_";
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
  }

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
      showToast("アクセスコードをコピーしました。");
    } catch (_error) {
      const temporary = document.createElement("textarea");
      temporary.value = value;
      temporary.setAttribute("readonly", "");
      temporary.style.position = "fixed";
      temporary.style.opacity = "0";
      document.body.append(temporary);
      temporary.select();
      document.execCommand("copy");
      temporary.remove();
      showToast("アクセスコードをコピーしました。");
    }
  }

  function staffStatusBadge(staff) {
    const badge = document.createElement("span");
    const className = staff.status === "active" ? "status--done" : staff.status === "leave" ? "status--progress" : "status--alert";
    badge.className = `status ${className}`;
    badge.textContent = statusLabels[staff.status] || staff.status;
    return badge;
  }

  function option(value, label, selected) {
    const node = document.createElement("option");
    node.value = value;
    node.textContent = label;
    node.selected = value === selected;
    return node;
  }

  function field(labelText, control) {
    const wrapper = document.createElement("div");
    wrapper.className = "field";
    const label = document.createElement("label");
    label.textContent = labelText;
    label.append(control);
    wrapper.append(label);
    return wrapper;
  }

  function renderStaff() {
    const list = one("[data-staff-list]");
    if (!list) return;
    list.replaceChildren();
    if (!state.staff.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      const strong = document.createElement("strong");
      strong.textContent = "該当するスタッフはいません";
      empty.append(strong, document.createTextNode("新規登録フォームから追加できます。"));
      list.append(empty);
      return;
    }

    state.staff.forEach((staff) => {
      const card = document.createElement("article");
      card.className = "owner-staff-card";
      card.dataset.staffId = staff.id;

      const header = document.createElement("div");
      header.className = "owner-staff-card__header";
      const titleBox = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = staff.display_name;
      const meta = document.createElement("p");
      meta.className = "owner-staff-card__meta";
      meta.textContent = `${staff.staff_code}／${roleLabels[staff.professional_role] || staff.professional_role}／有効セッション ${Number(staff.active_sessions || 0)}件`;
      titleBox.append(title, meta);
      header.append(titleBox, staffStatusBadge(staff));

      const form = document.createElement("form");
      form.className = "owner-inline-grid";
      form.dataset.staffUpdateForm = staff.id;

      const name = document.createElement("input");
      name.name = "display_name";
      name.value = staff.display_name || "";
      name.maxLength = 100;
      name.required = true;
      form.append(field("表示名", name));

      const kana = document.createElement("input");
      kana.name = "name_kana";
      kana.value = staff.name_kana || "";
      kana.maxLength = 100;
      form.append(field("フリガナ", kana));

      const phone = document.createElement("input");
      phone.name = "phone";
      phone.value = staff.phone || "";
      phone.inputMode = "tel";
      phone.maxLength = 30;
      form.append(field("電話番号", phone));

      const role = document.createElement("select");
      role.name = "professional_role";
      Object.entries(roleLabels).forEach(([value, label]) => role.append(option(value, label, staff.professional_role)));
      form.append(field("職種・権限", role));

      const status = document.createElement("select");
      status.name = "status";
      Object.entries(statusLabels).forEach(([value, label]) => status.append(option(value, label, staff.status)));
      form.append(field("在籍状態", status));

      const login = document.createElement("label");
      login.className = "choice";
      const loginCheck = document.createElement("input");
      loginCheck.type = "checkbox";
      loginCheck.name = "login_enabled";
      loginCheck.checked = staff.login_enabled === true;
      login.append(loginCheck, document.createTextNode(" スタッフログインを許可"));
      const loginWrap = document.createElement("div");
      loginWrap.className = "field";
      loginWrap.append(login);
      form.append(loginWrap);

      const saveWrap = document.createElement("div");
      saveWrap.className = "field field--full";
      const save = document.createElement("button");
      save.type = "submit";
      save.className = "btn btn--secondary";
      save.textContent = "スタッフ情報を更新";
      save.dataset.staffUpdateButton = staff.id;
      const formStatus = document.createElement("div");
      formStatus.className = "form-status";
      formStatus.hidden = true;
      formStatus.dataset.staffUpdateStatus = staff.id;
      formStatus.setAttribute("role", "status");
      saveWrap.append(save, formStatus);
      form.append(saveWrap);

      const secret = document.createElement("div");
      secret.className = "owner-secret-panel";
      const secretTitle = document.createElement("strong");
      secretTitle.textContent = staff.access_code_configured
        ? "アクセスコード：設定済み（再発行可能）"
        : "アクセスコード：未設定";
      secretTitle.className = staff.access_code_configured ? "owner-login-ready" : "owner-login-not-ready";
      const secretRow = document.createElement("div");
      secretRow.className = "owner-secret-row section";
      const secretInput = document.createElement("input");
      secretInput.type = "text";
      secretInput.autocomplete = "new-password";
      secretInput.placeholder = "8文字以上の新しいアクセスコード";
      secretInput.minLength = 8;
      secretInput.maxLength = 128;
      secretInput.dataset.staffSecretInput = staff.id;
      const generate = document.createElement("button");
      generate.type = "button";
      generate.className = "btn btn--secondary btn--small";
      generate.textContent = "自動生成";
      generate.dataset.generateStaffCode = staff.id;
      secretRow.append(secretInput, generate);
      const actions = document.createElement("div");
      actions.className = "owner-secret-actions";
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "btn btn--secondary btn--small";
      copy.textContent = "コピー";
      copy.dataset.copyStaffCode = staff.id;
      const issue = document.createElement("button");
      issue.type = "button";
      issue.className = "btn btn--primary btn--small";
      issue.textContent = staff.access_code_configured ? "アクセスコードを再発行" : "アクセスコードを発行";
      issue.dataset.issueStaffCode = staff.id;
      actions.append(copy, issue);
      const secretStatus = document.createElement("div");
      secretStatus.className = "form-status";
      secretStatus.hidden = true;
      secretStatus.dataset.staffSecretStatus = staff.id;
      secret.append(secretTitle, secretRow, actions, secretStatus);

      card.append(header, form, secret);
      list.append(card);
    });
  }

  async function loadStaff() {
    const status = one("[data-staff-admin-status]");
    if (!token()) return;
    const filter = clean(one("[data-staff-filter]")?.value) || "all";
    setStatus(status, "スタッフ一覧を取得しています。", "info");
    try {
      const result = await api.request(`/v1/admin/staff?status=${encodeURIComponent(filter)}`, { token: token() });
      state.staff = Array.isArray(result.staff) ? result.staff : [];
      renderStaff();
      setStatus(status, `${state.staff.length}名のスタッフを取得しました。`, "success");
    } catch (error) {
      if (handleExpired(error, status)) return;
      setStatus(status, readableError(error), "error");
    }
  }

  function renderLinks() {
    const list = one("[data-link-list]");
    if (!list) return;
    list.replaceChildren();
    if (!state.links.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      const strong = document.createElement("strong");
      strong.textContent = "承認待ち申請はありません";
      empty.append(strong, document.createTextNode("新しい申請が届くとここに表示されます。"));
      list.append(empty);
      return;
    }

    state.links.forEach((link) => {
      const card = document.createElement("article");
      card.className = "owner-link-card";
      const header = document.createElement("div");
      header.className = "owner-link-card__header";
      const box = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = `${link.patient?.patient_number || "番号未確認"} ${link.patient?.full_name || "利用者"}様`;
      const meta = document.createElement("p");
      meta.className = "owner-link-card__meta";
      meta.textContent = `申請者：${link.applicant_name || "－"}様／続柄：${link.relationship || "－"}／申請日時：${formatDateTime(link.created_at)}`;
      const contact = document.createElement("p");
      contact.className = "owner-link-card__meta";
      contact.textContent = link.contact_name ? `登録済み連絡先：${link.contact_name}様` : "本人として申請";
      box.append(title, meta, contact);
      const badge = document.createElement("span");
      badge.className = "status status--progress";
      badge.textContent = "承認待ち";
      header.append(box, badge);
      const row = document.createElement("div");
      row.className = "button-row section";
      const approve = document.createElement("button");
      approve.type = "button";
      approve.className = "btn btn--primary";
      approve.textContent = "照合済みとして承認";
      approve.dataset.approveLink = link.id;
      row.append(approve);
      card.append(header, row);
      list.append(card);
    });
  }

  async function loadLinks() {
    const status = one("[data-link-status]");
    if (!token()) return;
    setStatus(status, "LINE連携の承認待ち申請を取得しています。", "info");
    try {
      const result = await api.request("/v1/admin/line-links?status=pending", { token: token() });
      state.links = Array.isArray(result.line_links) ? result.line_links : [];
      renderLinks();
      setStatus(status, `承認待ち ${state.links.length}件を取得しました。`, "success");
    } catch (error) {
      if (handleExpired(error, status)) return;
      setStatus(status, readableError(error), "error");
    }
  }

  async function loadAll(toast = false) {
    if (!token() || state.loading) return;
    state.loading = true;
    try {
      await Promise.all([loadDashboard(), loadStaff(), loadLinks()]);
      if (toast) showToast("管理画面を最新情報へ更新しました。");
    } finally {
      state.loading = false;
    }
  }

  function setupLogin() {
    const form = one("[data-owner-login-form]");
    if (!form || !api) return;
    const status = one("[data-owner-login-status]", form);
    const button = one("[data-owner-login-button]", form);
    one("[data-owner-clear-code]", form)?.addEventListener("click", () => {
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
        setText("[data-owner-environment]", result.environment === "production" ? "本番環境" : "デモ環境");
        showAuthenticated(true);
        showToast("管理者としてログインしました。");
        await loadAll();
      } catch (error) {
        api.clearAdminSession();
        showAuthenticated(false);
        setStatus(status, readableError(error), "error");
      } finally {
        setBusy(button, false, "");
      }
    });
  }

  function setupCreateStaff() {
    const form = one("[data-staff-create-form]");
    if (!form) return;
    const status = one("[data-staff-create-status]", form);
    const button = one("[data-staff-create-button]", form);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      hideStatus(status);
      if (!form.reportValidity()) return;
      const data = new FormData(form);
      const phone = clean(data.get("phone"));
      if (phone && !/^[0-9０-９+＋()（）\-ー－‐‑‒–—―\s　]{8,30}$/.test(phone)) {
        setStatus(status, "電話番号を正しく入力してください。", "error");
        return;
      }
      setBusy(button, true, "スタッフを登録中…");
      try {
        const result = await api.request("/v1/admin/staff", {
          method: "POST",
          token: token(),
          idempotencyKey: api.idempotencyKey("admin-staff-create"),
          body: {
            staff_code: clean(data.get("staff_code")),
            display_name: clean(data.get("display_name")),
            name_kana: clean(data.get("name_kana")),
            professional_role: clean(data.get("professional_role")),
            phone,
            access_code: clean(data.get("access_code")),
            login_enabled: data.get("login_enabled") === "on"
          }
        });
        const issued = clean(data.get("access_code"));
        form.reset();
        one("[name='login_enabled']", form).checked = true;
        setStatus(status, result.message || "スタッフを登録しました。", "success");
        if (issued) {
          const resultBox = document.createElement("div");
          resultBox.className = "owner-copy-result";
          resultBox.textContent = `今回発行したアクセスコード：${issued}`;
          status.after(resultBox);
        }
        showToast("スタッフを登録しました。");
        await Promise.all([loadStaff(), loadDashboard()]);
      } catch (error) {
        if (handleExpired(error, status)) return;
        setStatus(status, readableError(error), "error");
      } finally {
        setBusy(button, false, "");
      }
    });
  }

  function setupStaffListActions() {
    const list = one("[data-staff-list]");
    if (!list) return;

    list.addEventListener("submit", async (event) => {
      const form = event.target.closest("[data-staff-update-form]");
      if (!form) return;
      event.preventDefault();
      if (!form.reportValidity()) return;
      const staffId = form.dataset.staffUpdateForm;
      const button = one(`[data-staff-update-button='${staffId}']`, form);
      const status = one(`[data-staff-update-status='${staffId}']`, form);
      const data = new FormData(form);
      setBusy(button, true, "更新中…");
      try {
        const result = await api.request(`/v1/admin/staff/${staffId}`, {
          method: "PATCH",
          token: token(),
          idempotencyKey: api.idempotencyKey("admin-staff-update"),
          body: {
            display_name: clean(data.get("display_name")),
            name_kana: clean(data.get("name_kana")),
            phone: clean(data.get("phone")),
            professional_role: clean(data.get("professional_role")),
            status: clean(data.get("status")),
            login_enabled: data.get("login_enabled") === "on"
          }
        });
        setStatus(status, result.message || "スタッフ情報を更新しました。", "success");
        showToast("スタッフ情報を更新しました。");
        await Promise.all([loadStaff(), loadDashboard()]);
      } catch (error) {
        if (handleExpired(error, status)) return;
        setStatus(status, readableError(error), "error");
      } finally {
        setBusy(button, false, "");
      }
    });

    list.addEventListener("click", async (event) => {
      const generate = event.target.closest("[data-generate-staff-code]");
      const copy = event.target.closest("[data-copy-staff-code]");
      const issue = event.target.closest("[data-issue-staff-code]");
      const staffId = generate?.dataset.generateStaffCode || copy?.dataset.copyStaffCode || issue?.dataset.issueStaffCode;
      if (!staffId) return;
      const input = one(`[data-staff-secret-input='${staffId}']`, list);
      if (!input) return;
      if (generate) {
        input.value = generateAccessCode();
        input.focus();
        input.select();
        return;
      }
      if (copy) {
        if (!clean(input.value)) {
          showToast("先にアクセスコードを入力または自動生成してください。");
          return;
        }
        await copyText(input.value);
        return;
      }
      if (issue) {
        const value = clean(input.value);
        const status = one(`[data-staff-secret-status='${staffId}']`, list);
        if (value.length < 8) {
          setStatus(status, "アクセスコードは8文字以上で入力してください。", "error");
          input.focus();
          return;
        }
        if (!window.confirm("アクセスコードを発行します。既存のスタッフログインはすべて無効になります。よろしいですか？")) return;
        setBusy(issue, true, "発行中…");
        try {
          const result = await api.request(`/v1/admin/staff/${staffId}/access-code`, {
            method: "PUT",
            token: token(),
            idempotencyKey: api.idempotencyKey("admin-access-code"),
            body: { access_code: value }
          });
          setStatus(status, `${result.message} 発行したコード：${value}`, "success");
          await copyText(value);
          showToast("アクセスコードを発行し、コピーしました。");
          await Promise.all([loadStaff(), loadDashboard()]);
        } catch (error) {
          if (handleExpired(error, status)) return;
          setStatus(status, readableError(error), "error");
        } finally {
          setBusy(issue, false, "");
        }
      }
    });
  }

  function setupLinkActions() {
    one("[data-link-list]")?.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-approve-link]");
      if (!button) return;
      const id = button.dataset.approveLink;
      if (!window.confirm("登録情報・同意・続柄を照合済みとして、このLINE連携を承認しますか？")) return;
      const status = one("[data-link-status]");
      setBusy(button, true, "承認中…");
      try {
        await api.request(`/v1/admin/line-links/${id}/approve`, {
          method: "POST",
          token: token(),
          idempotencyKey: api.idempotencyKey("admin-line-approve"),
          body: {}
        });
        setStatus(status, "LINE連携を承認しました。", "success");
        showToast("LINE連携を承認しました。");
        await Promise.all([loadLinks(), loadDashboard()]);
      } catch (error) {
        if (handleExpired(error, status)) return;
        setStatus(status, readableError(error), "error");
      } finally {
        setBusy(button, false, "");
      }
    });
  }

  function setupPatientSearch() {
    const form = one("[data-patient-search-form]");
    if (!form) return;
    const status = one("[data-patient-search-status]");
    const button = one("[data-patient-search-button]", form);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      hideStatus(status);
      if (!form.reportValidity()) return;
      const query = clean(new FormData(form).get("query"));
      setBusy(button, true, "検索中…");
      try {
        const result = await api.request(`/v1/admin/patients/search?q=${encodeURIComponent(query)}`, { token: token() });
        const rows = Array.isArray(result.patients) ? result.patients : [];
        const body = one("[data-patient-results-body]");
        const wrap = one("[data-patient-results]");
        body.replaceChildren();
        rows.forEach((patient) => {
          const tr = document.createElement("tr");
          [patient.patient_number, patient.full_name, patient.phone || "－", patient.status, formatDateTime(patient.updated_at)].forEach((value) => {
            const td = document.createElement("td");
            td.textContent = value || "－";
            tr.append(td);
          });
          body.append(tr);
        });
        wrap.hidden = rows.length === 0;
        setStatus(status, `${rows.length}件の利用者が見つかりました。`, rows.length ? "success" : "info");
      } catch (error) {
        if (handleExpired(error, status)) return;
        setStatus(status, readableError(error), "error");
      } finally {
        setBusy(button, false, "");
      }
    });
  }

  function setupGeneralActions() {
    all("[data-generate-target]").forEach((button) => {
      button.addEventListener("click", () => {
        const input = document.getElementById(button.dataset.generateTarget);
        if (!input) return;
        input.value = generateAccessCode();
        input.focus();
        input.select();
      });
    });
    one("[data-owner-refresh]")?.addEventListener("click", () => loadAll(true));
    one("[data-staff-refresh]")?.addEventListener("click", loadStaff);
    one("[data-link-refresh]")?.addEventListener("click", loadLinks);
    one("[data-staff-filter]")?.addEventListener("change", loadStaff);
    one("[data-owner-logout]")?.addEventListener("click", () => {
      api.clearAdminSession();
      state.staff = [];
      state.links = [];
      showAuthenticated(false);
      setStatus(one("[data-owner-login-status]"), "ログアウトしました。", "success");
      showToast("管理者セッションを終了しました。");
      one("[name='admin_code']")?.focus();
    });
  }

  function init() {
    if (!api) {
      setStatus(one("[data-owner-login-status]"), "API機能を読み込めませんでした。画面を再読み込みしてください。", "error");
      return;
    }
    setupLogin();
    setupCreateStaff();
    setupStaffListActions();
    setupLinkActions();
    setupPatientSearch();
    setupGeneralActions();
    if (token()) {
      showAuthenticated(true);
      loadAll();
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
