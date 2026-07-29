"use strict";

(function bootstrapNursingOwnerVisits() {
  const api = window.DPRO_API;
  const config = window.DPRO_CONFIG || {};

  const state = {
    patients: [],
    staff: [],
    visits: [],
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
    other: "その他"
  });

  const visitStatusMeta = Object.freeze({
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

  function clean(value) {
    return String(value ?? "").trim();
  }

  function token() {
    return api?.adminToken() || "";
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

  function setBusy(button, busy, busyLabel) {
    if (!button) return;
    if (!button.dataset.defaultLabel) {
      button.dataset.defaultLabel = button.textContent.trim();
    }
    button.disabled = busy;
    button.setAttribute("aria-busy", String(busy));
    button.textContent = busy ? busyLabel : button.dataset.defaultLabel;
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

  function addDays(dateValue, days) {
    const [year, month, day] = dateValue.split("-").map(Number);
    const value = new Date(Date.UTC(year, month - 1, day));
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
  }

  function dateTimeLocalToIso(dateValue, timeValue) {
    const candidate = new Date(`${dateValue}T${timeValue}:00+09:00`);
    if (Number.isNaN(candidate.getTime())) return "";
    return candidate.toISOString();
  }

  function defaultSchedule() {
    const dateInput = one("[data-visit-date]");
    const timeSelect = one("[data-visit-time]");
    const listDate = one("[data-visit-list-date]");
    if (!dateInput || !timeSelect || !listDate) return;

    const now = new Date();
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const today = jstDateString(now);
    let date = today;
    let minutes = jst.getUTCHours() * 60 + jst.getUTCMinutes();
    let nextSlot = Math.ceil((minutes + 30) / 30) * 30;

    if (nextSlot < 7 * 60) {
      nextSlot = 7 * 60;
    } else if (nextSlot > 20 * 60) {
      date = addDays(today, 1);
      nextSlot = 9 * 60;
    }

    const hour = String(Math.floor(nextSlot / 60)).padStart(2, "0");
    const minute = String(nextSlot % 60).padStart(2, "0");
    const time = `${hour}:${minute}`;

    dateInput.min = today;
    dateInput.value = date;
    listDate.value = date;
    timeSelect.value = all("option", timeSelect).some(
      (option) => option.value === time
    ) ? time : "09:00";
  }

  function populateTimeOptions() {
    const select = one("[data-visit-time]");
    if (!select) return;
    select.replaceChildren();
    for (let hour = 7; hour <= 20; hour += 1) {
      for (const minute of [0, 30]) {
        if (hour === 20 && minute === 30) continue;
        const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.append(option);
      }
    }
  }

  function renderPatients() {
    const select = one("[data-visit-patient-select]");
    const summary = one("[data-visit-patient-summary]");
    if (!select) return;

    const previous = select.value;
    select.replaceChildren();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = state.patients.length
      ? "利用者を選択してください"
      : "登録済み利用者がありません";
    select.append(placeholder);

    state.patients.forEach((patient) => {
      const option = document.createElement("option");
      option.value = patient.id;
      option.textContent = `${patient.patient_number || "番号未設定"}　${patient.full_name || "氏名未設定"}様`;
      option.dataset.patientName = patient.full_name || "";
      option.dataset.patientNumber = patient.patient_number || "";
      option.dataset.patientStatus = patient.status || "";
      select.append(option);
    });

    if (state.patients.some((patient) => patient.id === previous)) {
      select.value = previous;
    }

    if (!select.value && summary) summary.hidden = true;
    updatePatientSummary();
  }

  function updatePatientSummary() {
    const select = one("[data-visit-patient-select]");
    const summary = one("[data-visit-patient-summary]");
    if (!select || !summary) return;

    const patient = state.patients.find((item) => item.id === select.value);
    if (!patient) {
      summary.hidden = true;
      summary.textContent = "";
      return;
    }

    summary.hidden = false;
    summary.replaceChildren();

    const title = document.createElement("strong");
    title.textContent = `${patient.patient_number || "番号未設定"}　${patient.full_name || "利用者"}様`;
    const detail = document.createElement("span");
    detail.textContent = `状態：${patient.status || "未設定"}${patient.phone ? `／電話：${patient.phone}` : ""}`;
    summary.append(title, detail);
  }

  function renderStaffOptions() {
    const container = one("[data-visit-staff-options]");
    if (!container) return;
    container.replaceChildren();

    const available = state.staff.filter(
      (staff) => staff.status === "active"
    );

    if (!available.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      const strong = document.createElement("strong");
      strong.textContent = "配置できるスタッフがいません";
      empty.append(
        strong,
        document.createTextNode("スタッフ管理で在籍中のスタッフを登録してください。")
      );
      container.append(empty);
      return;
    }

    available.forEach((staff, index) => {
      const label = document.createElement("label");
      label.className = "owner-visit-staff-option";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "staff_ids";
      checkbox.value = staff.id;
      checkbox.checked =
        staff.staff_code === "DEMO-MANAGER" ||
        (index === 0 && !available.some((item) => item.staff_code === "DEMO-MANAGER"));

      const text = document.createElement("span");
      const name = document.createElement("strong");
      name.textContent = staff.display_name || staff.staff_code;
      const meta = document.createElement("small");
      meta.textContent = `${staff.staff_code}／${roleLabels[staff.professional_role] || staff.professional_role || "職種未設定"}`;
      text.append(name, meta);
      label.append(checkbox, text);
      container.append(label);
    });
  }

  async function loadPatients() {
    if (!token()) return;
    const status = one("[data-visit-master-status]");
    setStatus(status, "利用者とスタッフを取得しています。", "info");
    try {
      const result = await api.request("/v1/admin/patients", {
        token: token()
      });
      state.patients = Array.isArray(result.patients)
        ? result.patients
        : [];
      renderPatients();
      setStatus(
        status,
        `利用者 ${state.patients.length}名を取得しました。`,
        state.patients.length ? "success" : "info"
      );
    } catch (error) {
      setStatus(status, readableError(error), "error");
    }
  }

  async function loadStaffOptions() {
    if (!token()) return;
    try {
      const result = await api.request("/v1/admin/staff?status=active", {
        token: token()
      });
      state.staff = Array.isArray(result.staff) ? result.staff : [];
      renderStaffOptions();
    } catch (error) {
      setStatus(
        one("[data-visit-master-status]"),
        readableError(error),
        "error"
      );
    }
  }

  function visitStatus(visit) {
    return visitStatusMeta[visit.status] || {
      label: clean(visit.status) || "確認中",
      className: "status--progress"
    };
  }

  function renderVisits() {
    const list = one("[data-admin-visit-list]");
    if (!list) return;
    list.hidden = false;
    list.replaceChildren();

    if (!state.visits.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      const strong = document.createElement("strong");
      strong.textContent = "この日の訪問予定はありません";
      empty.append(
        strong,
        document.createTextNode("上のフォームから新しい訪問予定を登録できます。")
      );
      list.append(empty);
      return;
    }

    state.visits.forEach((visit) => {
      const card = document.createElement("article");
      card.className = "owner-visit-card";

      const time = document.createElement("div");
      time.className = "owner-visit-card__time";
      time.textContent = `${formatTime(visit.planned_start)}～${formatTime(visit.planned_end)}`;

      const main = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = `${visit.patient?.patient_number || "番号未設定"}　${visit.patient?.full_name || "利用者"}様`;

      const meta = document.createElement("p");
      meta.className = "owner-visit-card__meta";
      meta.textContent =
        `${visitKindLabels[visit.visit_kind] || "訪問予定"}／訪問番号 ${visit.visit_number || "未採番"}`;

      const staff = document.createElement("div");
      staff.className = "owner-visit-card__staff";
      const assignments = Array.isArray(visit.assignments)
        ? visit.assignments
        : [];

      if (!assignments.length) {
        const chip = document.createElement("span");
        chip.className = "owner-visit-staff-chip";
        chip.textContent = "担当未配置";
        staff.append(chip);
      } else {
        assignments.forEach((assignment) => {
          const chip = document.createElement("span");
          chip.className = "owner-visit-staff-chip";
          chip.textContent =
            assignment.staff?.display_name ||
            assignment.staff?.staff_code ||
            "担当者";
          staff.append(chip);
        });
      }

      main.append(title, meta, staff);

      const side = document.createElement("div");
      side.className = "owner-visit-card__side";
      const status = visitStatus(visit);
      const badge = document.createElement("span");
      badge.className = `status ${status.className}`;
      badge.textContent = status.label;

      const detail = document.createElement("small");
      detail.textContent = visit.actual_start
        ? `開始 ${formatTime(visit.actual_start)}${visit.actual_end ? `／終了 ${formatTime(visit.actual_end)}` : ""}`
        : `更新番号 ${Number(visit.version || 1)}`;
      side.append(badge, detail);

      card.append(time, main, side);
      list.append(card);
    });
  }

  async function loadVisits(showMessage = true) {
    if (!token() || state.loading) return;
    const date = clean(one("[data-visit-list-date]")?.value) || jstDateString();
    const status = one("[data-visit-list-status]");
    const badge = one("[data-visit-list-badge]");
    state.loading = true;

    if (badge) {
      badge.className = "status status--progress";
      badge.textContent = "更新中";
    }
    if (showMessage) {
      setStatus(status, `${date}の訪問予定を取得しています。`, "info");
    }

    try {
      const result = await api.request(
        `/v1/admin/visits?date=${encodeURIComponent(date)}`,
        { token: token() }
      );
      state.visits = Array.isArray(result.visits)
        ? result.visits
        : [];
      renderVisits();
      setStatus(
        status,
        `${date}の訪問予定 ${state.visits.length}件を取得しました。`,
        "success"
      );
      if (badge) {
        badge.className = "status status--done";
        badge.textContent = "最新";
      }
    } catch (error) {
      setStatus(status, readableError(error), "error");
      if (badge) {
        badge.className = "status status--alert";
        badge.textContent = "取得失敗";
      }
    } finally {
      state.loading = false;
    }
  }

  function selectedStaffIds(form) {
    return all("input[name='staff_ids']:checked", form)
      .map((input) => input.value)
      .filter(Boolean);
  }

  function setupVisitCreate() {
    const form = one("[data-visit-create-form]");
    if (!form) return;
    const status = one("[data-visit-create-status]");
    const button = one("[data-visit-create-button]");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      hideStatus(status);
      if (!form.reportValidity()) return;

      const data = new FormData(form);
      const patientId = clean(data.get("patient_id"));
      const staffIds = selectedStaffIds(form);
      const date = clean(data.get("scheduled_date"));
      const time = clean(data.get("start_time"));
      const duration = Number(data.get("duration_minutes"));
      const startIso = dateTimeLocalToIso(date, time);
      const endDate = startIso
        ? new Date(new Date(startIso).getTime() + duration * 60000)
        : null;

      if (!patientId) {
        setStatus(status, "利用者を選択してください。", "error");
        one("[data-visit-patient-select]")?.focus();
        return;
      }
      if (!staffIds.length) {
        setStatus(status, "担当スタッフを1名以上選択してください。", "error");
        return;
      }
      const minimumStaffCount = Number(data.get("minimum_staff_count"));
      if (!Number.isInteger(minimumStaffCount) || minimumStaffCount < 1) {
        setStatus(status, "必要人数を正しく指定してください。", "error");
        return;
      }
      if (minimumStaffCount > staffIds.length) {
        setStatus(
          status,
          "必要人数より多い人数の担当スタッフを選択してください。",
          "error"
        );
        return;
      }
      if (!startIso || !endDate || Number.isNaN(endDate.getTime())) {
        setStatus(status, "訪問日時を正しく指定してください。", "error");
        return;
      }
      if (new Date(startIso).getTime() <= Date.now()) {
        setStatus(status, "開始日時には現在より後の日時を指定してください。", "error");
        return;
      }
      if (!/:00$|:30$/.test(time)) {
        setStatus(status, "開始時刻は30分単位で指定してください。", "error");
        return;
      }

      const patient = state.patients.find((item) => item.id === patientId);
      const staffNames = state.staff
        .filter((item) => staffIds.includes(item.id))
        .map((item) => item.display_name || item.staff_code)
        .join("・");

      if (!window.confirm(
        `${patient?.full_name || "利用者"}様の訪問予定を${date} ${time}から${duration}分、担当 ${staffNames}で登録しますか？`
      )) return;

      setBusy(button, true, "訪問予定を登録中…");
      try {
        const result = await api.request("/v1/admin/visits", {
          method: "POST",
          token: token(),
          idempotencyKey: api.idempotencyKey("admin-visit-create"),
          body: {
            patient_id: patientId,
            staff_ids: staffIds,
            planned_start: startIso,
            planned_end: endDate.toISOString(),
            visit_kind: clean(data.get("visit_kind")),
            insurance_category: clean(data.get("insurance_category")),
            travel_before_minutes: Number(data.get("travel_before_minutes")),
            travel_after_minutes: Number(data.get("travel_after_minutes")),
            minimum_staff_count: minimumStaffCount
          }
        });

        setStatus(
          status,
          result.replayed
            ? "同じ訪問予定はすでに登録済みです。"
            : "訪問予定とスタッフ配置を登録しました。",
          "success"
        );
        showToast("訪問予定とスタッフ配置を登録しました。");

        const listDate = one("[data-visit-list-date]");
        if (listDate) listDate.value = date;
        await loadVisits(false);
        one("[data-owner-refresh]")?.click();
      } catch (error) {
        setStatus(status, readableError(error), "error");
      } finally {
        setBusy(button, false, "");
      }
    });
  }

  async function loadVisitMasters() {
    if (!token()) return;
    await Promise.all([loadPatients(), loadStaffOptions()]);
  }

  function setupDemoPatientPreparation() {
    const button = one("[data-prepare-demo-patient]");
    if (!button) return;

    button.addEventListener("click", async () => {
      const status = one("[data-visit-master-status]");
      if (!token()) {
        setStatus(status, "管理者ログインが必要です。", "error");
        return;
      }
      if (!window.confirm(
        "デモ環境へ検査用利用者「訪問看護 デモ利用者」を準備しますか？"
      )) return;

      setBusy(button, true, "デモ利用者を準備中…");
      try {
        const result = await api.request("/v1/admin/demo/patient", {
          method: "POST",
          token: token(),
          idempotencyKey: api.idempotencyKey("admin-demo-patient"),
          body: {}
        });
        await loadPatients();
        const patientId = result.patient?.id || "";
        const select = one("[data-visit-patient-select]");
        if (select && patientId) {
          select.value = patientId;
          updatePatientSummary();
        }
        setStatus(
          status,
          result.message || "デモ利用者を準備しました。",
          "success"
        );
        showToast("デモ利用者を準備しました。");
      } catch (error) {
        setStatus(status, readableError(error), "error");
      } finally {
        setBusy(button, false, "");
      }
    });
  }

  function setupActions() {
    one("[data-visit-patient-select]")?.addEventListener(
      "change",
      updatePatientSummary
    );

    one("[data-visit-refresh]")?.addEventListener(
      "click",
      () => loadVisits()
    );

    one("[data-visit-list-date]")?.addEventListener(
      "change",
      () => loadVisits()
    );

    one("[data-panel-target='visits-panel']")?.addEventListener(
      "click",
      async () => {
        await loadVisitMasters();
        await loadVisits();
      }
    );

    one("[data-owner-refresh]")?.addEventListener(
      "click",
      () => {
        window.setTimeout(async () => {
          await loadVisitMasters();
          await loadVisits(false);
        }, 50);
      }
    );

    const app = one("[data-owner-app]");
    if (app && "MutationObserver" in window) {
      const observer = new MutationObserver(async () => {
        if (!app.hidden && token()) {
          await loadVisitMasters();
          await loadVisits(false);
        }
      });
      observer.observe(app, { attributes: true, attributeFilter: ["hidden"] });
    }
  }

  function init() {
    if (!api) return;
    populateTimeOptions();
    defaultSchedule();
    setupVisitCreate();
    setupDemoPatientPreparation();
    setupActions();

    if (token()) {
      loadVisitMasters();
      loadVisits(false);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
