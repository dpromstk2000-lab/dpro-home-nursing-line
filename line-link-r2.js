"use strict";

(function bootstrapNursingLineLinkR2() {
  const STORAGE_KEY = "dpro_nursing_line_link_pending_r2";
  const MAX_AGE_MS = 15 * 60 * 1000;
  const MAX_AUTO_ATTEMPTS = 2;
  let submitting = false;

  function one(selector, root = document) {
    return root.querySelector(selector);
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

  function readableError(error) {
    const message = error?.message || "処理を完了できませんでした。";
    return error?.requestId
      ? `${message}（確認番号: ${error.requestId}）`
      : message;
  }

  function setBusy(button, busy, label = "LINE認証を確認中…") {
    if (!button) return;
    if (!button.dataset.r2DefaultLabel) {
      button.dataset.r2DefaultLabel = button.textContent.trim();
    }
    button.disabled = busy;
    button.setAttribute("aria-busy", String(busy));
    button.textContent = busy
      ? label
      : button.dataset.r2DefaultLabel;
  }

  function closeMobileNavigation() {
    const nav = one("[data-global-nav]");
    const toggle = one("[data-nav-toggle]");
    nav?.classList.remove("is-open");
    if (toggle) {
      toggle.setAttribute("aria-expanded", "false");
      toggle.textContent = "メニュー";
    }
  }

  function focusLineLink(target) {
    closeMobileNavigation();
    const section = one("#line-link");
    if (window.location.hash !== "#line-link") {
      history.replaceState(null, "", `${window.location.pathname}${window.location.search}#line-link`);
    }
    window.requestAnimationFrame(() => {
      (target || section)?.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    });
  }

  function readPending() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (
        !data ||
        !Number.isFinite(data.savedAt) ||
        Date.now() - data.savedAt > MAX_AGE_MS
      ) {
        sessionStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return data;
    } catch (_error) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  function savePending(data) {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        memberNumber: data.memberNumber,
        memberPhone: data.memberPhone,
        linkedPersonType: data.linkedPersonType,
        relationship: data.relationship,
        savedAt: Date.now(),
        autoAttempts: Number(data.autoAttempts || 0),
        autoResume: data.autoResume !== false
      })
    );
  }

  function clearPending() {
    sessionStorage.removeItem(STORAGE_KEY);
  }

  function restoreForm(form, pending) {
    if (!pending) return;
    const number = one("[name='member_number']", form);
    const phone = one("[name='member_phone']", form);
    const relationship = one("[name='link_relationship']", form);

    if (number) number.value = pending.memberNumber || "";
    if (phone) phone.value = pending.memberPhone || "";
    if (
      relationship &&
      [...relationship.options].some(
        (option) => option.value === pending.linkedPersonType
      )
    ) {
      relationship.value = pending.linkedPersonType;
    }
  }

  function payloadFromForm(form, api) {
    const data = new FormData(form);
    const memberNumber = String(data.get("member_number") || "")
      .trim()
      .toUpperCase();
    const memberPhone = api.normalizePhone(
      String(data.get("member_phone") || "")
    );
    const relationshipSelect = one(
      "[name='link_relationship']",
      form
    );
    const linkedPersonType = relationshipSelect?.value || "patient";
    const relationship =
      relationshipSelect?.selectedOptions[0]?.textContent.trim() ||
      (linkedPersonType === "patient" ? "本人" : "家族・親族");

    return {
      memberNumber,
      memberPhone,
      linkedPersonType,
      relationship
    };
  }

  async function submitLineLink(form, status, button, options = {}) {
    const api = window.DPRO_API;
    if (!api || submitting) return;

    hideStatus(status);
    if (!form.reportValidity()) {
      focusLineLink(form);
      return;
    }

    const payload = payloadFromForm(form, api);
    if (!/^[0-9]{8,15}$/.test(payload.memberPhone)) {
      setStatus(
        status,
        "電話番号を市外局番から正しく入力してください。",
        "error"
      );
      one("[name='member_phone']", form)?.focus();
      focusLineLink(status);
      return;
    }

    const previous = readPending();
    const autoAttempts = options.auto
      ? Number(previous?.autoAttempts || 0)
      : 0;

    savePending({
      ...payload,
      autoAttempts,
      autoResume: true
    });

    submitting = true;
    setBusy(
      button,
      true,
      options.auto
        ? "LINE連携を自動再開中…"
        : "LINE認証を確認中…"
    );
    focusLineLink(status);

    try {
      const token = await api.lineIdToken();
      setBusy(button, true, "LINE連携を申請中…");

      const result = await api.request("/v1/member/link-request", {
        method: "POST",
        token,
        body: {
          member_number: payload.memberNumber,
          member_phone: payload.memberPhone,
          link_relationship: payload.relationship,
          linked_person_type: payload.linkedPersonType
        }
      });

      clearPending();
      setStatus(
        status,
        result.message ||
          "LINE連携申請を登録しました。管理者の承認をお待ちください。",
        result.status === "approved" ? "success" : "success"
      );
      form.reset();
      focusLineLink(status);
    } catch (error) {
      if (error?.code === "LIFF_LOGIN_REDIRECT") {
        setStatus(
          status,
          "LINE認証へ移動します。入力内容は保存済みです。認証後に申請を自動再開します。",
          "info"
        );
        return;
      }

      const pending = readPending();
      if (pending) {
        savePending({
          ...pending,
          autoResume: false
        });
      }
      setStatus(status, readableError(error), "error");
      focusLineLink(status);
    } finally {
      submitting = false;
      setBusy(button, false);
    }
  }

  function init() {
    const form = one("[data-line-link-form]");
    const api = window.DPRO_API;
    if (!form || !api || form.dataset.r2Bound === "true") return;

    form.dataset.r2Bound = "true";
    const status = one("[data-line-link-status]", form);
    const button = one("[data-submit-button]", form);

    /*
     * captureフェーズで既存app.jsのsubmit処理より先に受け取り、
     * 認証リダイレクト後も入力内容と申請処理を維持する。
     */
    form.addEventListener(
      "submit",
      (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        submitLineLink(form, status, button);
      },
      true
    );

    const pending = readPending();
    if (!pending) return;

    restoreForm(form, pending);
    focusLineLink(status);

    if (
      pending.autoResume &&
      pending.autoAttempts < MAX_AUTO_ATTEMPTS
    ) {
      savePending({
        ...pending,
        autoAttempts: pending.autoAttempts + 1,
        autoResume: true
      });
      setStatus(
        status,
        "LINE認証後の申請を自動再開しています。画面を閉じずにお待ちください。",
        "info"
      );
      window.setTimeout(
        () => submitLineLink(form, status, button, { auto: true }),
        500
      );
      return;
    }

    setStatus(
      status,
      "入力内容を復元しました。下の「LINE連携を申請する」を1回押してください。",
      "info"
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, {
      once: true
    });
  } else {
    init();
  }
})();
