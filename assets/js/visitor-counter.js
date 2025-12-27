(function () {
  "use strict";

  /**
   * Contract
   * - Input: #visitor-counter element with data-api="..." and children [data-key=today|total]
   * - Output: fills those elements with formatted numbers
   * - Failure: keeps placeholder("-") and fails silently (console.warn)
   */

  const root = document.getElementById("visitor-counter");
  if (!root) return;

  const todayEl = root.querySelector('[data-key="today"]');
  const totalEl = root.querySelector('[data-key="total"]');
  const hintEl = root.querySelector('.ide-kpi__hint');

  // If the site does not provide a server API (removed), show placeholders and a short message.
  if (!root.hasAttribute('data-api')) {
    if (todayEl) todayEl.textContent = "-";
    if (totalEl) totalEl.textContent = "-";
    if (hintEl) hintEl.textContent = "방문자 통계는 제거되었습니다.";
    // stop further processing
    return;
  }

  const apiUrl = root.getAttribute("data-api");

  const LS_KEY = "visitor-counter:cache:v1";
  const CACHE_TTL_MS = 5 * 60 * 1000; // client-side TTL (server should also cache)

  function formatNumber(n) {
    if (typeof n !== "number" || !Number.isFinite(n)) return "-";
    try {
      return n.toLocaleString();
    } catch {
      return String(n);
    }
  }

  function setValue(el, value) {
    if (!el) return;
    el.textContent = value;
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      if (typeof parsed.ts !== "number") return null;
      if (Date.now() - parsed.ts > CACHE_TTL_MS) return null;
      if (typeof parsed.today !== "number" || typeof parsed.total !== "number") return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function writeCache(today, total) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ ts: Date.now(), today, total }));
    } catch {
      // ignore
    }
  }

  async function fetchStats(signal) {
    const res = await fetch(apiUrl, {
      method: "GET",
      credentials: "omit",
      signal,
      headers: {
        "Accept": "application/json"
      }
    });

    if (!res.ok) {
      throw new Error(`visitor-counter: HTTP ${res.status}`);
    }

    const data = await res.json();
    // expected: { today: number, total: number } (optionally lastUpdated)
    const today = Number(data?.today);
    const total = Number(data?.total);

    if (!Number.isFinite(today) || !Number.isFinite(total)) {
      throw new Error("visitor-counter: invalid payload");
    }

    return { today, total };
  }

  async function updateOnce() {
    const cached = readCache();
    if (cached) {
      setValue(todayEl, formatNumber(cached.today));
      setValue(totalEl, formatNumber(cached.total));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);

    try {
      const { today, total } = await fetchStats(controller.signal);
      setValue(todayEl, formatNumber(today));
      setValue(totalEl, formatNumber(total));
      writeCache(today, total);
    } catch (err) {
      // cached 표시가 있으면 그대로 두고, 없으면 placeholder 유지
      // 개발 중 디버깅을 돕기 위해 warn만 남김
      if (!cached) {
        setValue(todayEl, todayEl?.textContent || "-");
        setValue(totalEl, totalEl?.textContent || "-");
      }
      try {
        // eslint-disable-next-line no-console
        console.warn(String(err));
      } catch {
        // ignore
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  // first run
  updateOnce();

  // periodic refresh (lightweight)
  setInterval(updateOnce, 10 * 60 * 1000);
})();
