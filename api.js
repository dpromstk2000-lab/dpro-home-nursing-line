"use strict";

(function exposeDproApi() {
  const config = window.DPRO_CONFIG || {};
  const ADMIN_TOKEN_KEY = "dpro_nursing_admin_token";
  const ADMIN_EXPIRY_KEY = "dpro_nursing_admin_expires_at";
  const REQUEST_TIMEOUT_MS = 15000;
  let liffInitPromise = null;

  class DproApiError extends Error {
    constructor(message, status = 0, code = "REQUEST_FAILED", requestId = "") {
      super(message);
      this.name = "DproApiError";
      this.status = status;
      this.code = code;
      this.requestId = requestId;
    }
  }

  function apiBaseUrl() {
    const value = String(config.apiBaseUrl || "").trim().replace(/\/+$/, "");
    if (!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(value)) {
      throw new DproApiError(
        "API接続先が未設定です。管理者へご連絡ください。",
        0,
        "API_NOT_CONFIGURED"
      );
    }
    return value;
  }

  function idempotencyKey(prefix = "request") {
    const random = typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    return `${prefix}-${random}`;
  }

  function normalizePhone(value) {
    let text = String(value || "").normalize("NFKC").replace(/[\s\u3000()]/g, "");
    text = text.replace(/[‐‑‒–—―ー－]/g, "-").replace(/-/g, "");
    if (text.startsWith("+81")) {
      text = `0${text.slice(3)}`;
    } else if (text.startsWith("0081")) {
      text = `0${text.slice(4)}`;
    }
    return text.replace(/\D/g, "");
  }

  async function request(path, options = {}) {
    if (!String(path).startsWith("/")) {
      throw new DproApiError("APIパスが正しくありません。", 0, "INVALID_API_PATH");
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const headers = new Headers(options.headers || {});
    headers.set("Accept", "application/json");

    const init = {
      method: options.method || "GET",
      headers,
      cache: "no-store",
      signal: controller.signal
    };

    if (options.token) {
      headers.set("Authorization", `Bearer ${options.token}`);
    }
    if (options.idempotencyKey) {
      headers.set("Idempotency-Key", options.idempotencyKey);
    }
    if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
      init.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(`${apiBaseUrl()}${path}`, init);
      const requestId = response.headers.get("x-request-id") || "";
      let data = null;

      try {
        data = await response.json();
      } catch (_error) {
        data = null;
      }

      if (!response.ok) {
        throw new DproApiError(
          data?.error?.message || statusMessage(response.status),
          response.status,
          data?.error?.code || `HTTP_${response.status}`,
          requestId
        );
      }
      return data || {};
    } catch (error) {
      if (error instanceof DproApiError) {
        throw error;
      }
      if (error?.name === "AbortError") {
        throw new DproApiError(
          "通信がタイムアウトしました。接続を確認して再度お試しください。",
          0,
          "REQUEST_TIMEOUT"
        );
      }
      throw new DproApiError(
        "通信できませんでした。インターネット接続を確認して再度お試しください。",
        0,
        "NETWORK_ERROR"
      );
    } finally {
      window.clearTimeout(timer);
    }
  }

  function statusMessage(status) {
    if (status === 401) return "認証情報を確認できません。もう一度ログインしてください。";
    if (status === 403) return "この操作を行う権限がないか、連携承認が完了していません。";
    if (status === 404) return "対象データが見つかりません。画面を更新してください。";
    if (status === 409) return "同じ内容の処理と競合しました。最新の状態を確認してください。";
    if (status === 422) return "入力内容を確認してください。";
    if (status === 429) return "短時間に送信が集中しました。少し待ってから再度お試しください。";
    if (status >= 500) return "サーバーで処理できませんでした。時間をおいて再度お試しください。";
    return "処理を完了できませんでした。";
  }

  function lineConfigured() {
    return Boolean(String(config.liffId || "").trim());
  }

  async function initializeLiff() {
    if (!lineConfigured()) {
      throw new DproApiError(
        "LINE連携は現在設定準備中です。LINE設定完了後に利用できます。",
        0,
        "LIFF_NOT_CONFIGURED"
      );
    }
    if (!window.liff) {
      throw new DproApiError(
        "LINE機能を読み込めませんでした。画面を再読み込みしてください。",
        0,
        "LIFF_SDK_UNAVAILABLE"
      );
    }

    if (!liffInitPromise) {
      liffInitPromise = window.liff.init({
        liffId: String(config.liffId).trim(),
        withLoginOnExternalBrowser: true
      });
    }

    try {
      await liffInitPromise;
    } catch (_error) {
      liffInitPromise = null;
      throw new DproApiError(
        "LINEの初期化に失敗しました。画面を閉じて、LINEから開き直してください。",
        0,
        "LIFF_INITIALIZE_FAILED"
      );
    }

    if (!window.liff.isLoggedIn()) {
      window.liff.login({ redirectUri: window.location.href });
      throw new DproApiError(
        "LINEログイン画面へ移動します。",
        0,
        "LIFF_LOGIN_REDIRECT"
      );
    }
  }

  async function lineIdToken() {
    await initializeLiff();
    const token = window.liff.getIDToken();
    if (!token) {
      throw new DproApiError(
        "LINE認証情報を取得できません。画面を閉じて、LINEから開き直してください。",
        0,
        "LINE_ID_TOKEN_UNAVAILABLE"
      );
    }
    return token;
  }

  function saveAdminSession(token, expiresAt) {
    sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    sessionStorage.setItem(ADMIN_EXPIRY_KEY, expiresAt);
  }

  function clearAdminSession() {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    sessionStorage.removeItem(ADMIN_EXPIRY_KEY);
  }

  function adminToken() {
    const token = sessionStorage.getItem(ADMIN_TOKEN_KEY) || "";
    const expiry = sessionStorage.getItem(ADMIN_EXPIRY_KEY) || "";
    const expiresAt = Date.parse(expiry);
    if (!token || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      clearAdminSession();
      return "";
    }
    return token;
  }

  window.DPRO_API = Object.freeze({
    DproApiError,
    request,
    idempotencyKey,
    normalizePhone,
    lineConfigured,
    lineIdToken,
    saveAdminSession,
    clearAdminSession,
    adminToken
  });
})();
