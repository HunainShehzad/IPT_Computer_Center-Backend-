/**
 * lib/parseUserAgent.js
 *
 * Accurate, dependency-free User-Agent parser.
 *
 * Returns:
 *   browser        — human-readable name, e.g. "Google Chrome"
 *   browserVersion — major version string, e.g. "125"
 *   os             — e.g. "Windows 11", "macOS 14.4", "Android 14"
 *   deviceType     — "Desktop" | "Mobile" | "Tablet"
 *   deviceName     — same as deviceType (kept for backward compat)
 *
 * Detection order is critical — more-specific tokens must be tested BEFORE
 * their substrings appear in a broader pattern.
 *
 * Reference UA strings used during development:
 *   Chrome 125 Win11 : Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36
 *   Edge 125         : Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0
 *   Firefox 126      : Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0
 *   Safari 17 Mac    : Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15
 *   Opera 110        : Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 OPR/110.0.0.0
 *   Brave            : (same as Chrome but adds "Brave" via JS only — UA is identical to Chrome)
 *   Samsung Internet : Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36
 *   IE 11            : Mozilla/5.0 (Windows NT 10.0; Trident/7.0; rv:11.0) like Gecko
 */

/**
 * Extract the first capture group from a regex applied to a string.
 * Returns null if no match.
 * @param {string} s
 * @param {RegExp} re — must have exactly one capture group
 * @returns {string|null}
 */
function capture(s, re) {
  const m = s.match(re);
  return m ? m[1] : null;
}

/**
 * @param {string} ua
 * @returns {{
 *   browser:        string,
 *   browserVersion: string,
 *   os:             string,
 *   deviceType:     string,
 *   deviceName:     string,
 * }}
 */
export function parseUserAgent(ua = "") {
  const s = ua || "";

  // ── Operating System ───────────────────────────────────────────────────
  let os = "Unknown OS";

  if (/Windows/i.test(s)) {
    // Windows NT version map
    // NT 10.0 can be Win 10 or Win 11 — we can't reliably tell from UA alone
    // without the Sec-CH-UA-Platform-Version hint, so we label it "Windows 10/11"
    const ntVer = capture(s, /Windows NT ([\d.]+)/i);
    if      (ntVer === "10.0") os = "Windows 10/11";
    else if (ntVer === "6.3")  os = "Windows 8.1";
    else if (ntVer === "6.2")  os = "Windows 8";
    else if (ntVer === "6.1")  os = "Windows 7";
    else if (ntVer === "6.0")  os = "Windows Vista";
    else if (ntVer === "5.2")  os = "Windows XP x64";
    else if (ntVer === "5.1")  os = "Windows XP";
    else                       os = "Windows";
  }
  else if (/CrOS/i.test(s)) {
    os = "ChromeOS";
  }
  else if (/iPhone/i.test(s)) {
    const v = capture(s, /iPhone OS ([\d_]+)/i);
    os = v ? `iOS ${v.replace(/_/g, ".")}` : "iOS";
  }
  else if (/iPad/i.test(s)) {
    const v = capture(s, /OS ([\d_]+)/i);
    os = v ? `iPadOS ${v.replace(/_/g, ".")}` : "iPadOS";
  }
  else if (/Android/i.test(s)) {
    const v = capture(s, /Android ([\d.]+)/i);
    os = v ? `Android ${v}` : "Android";
  }
  else if (/Mac OS X/i.test(s)) {
    const v = capture(s, /Mac OS X ([\d_.]+)/i);
    os = v ? `macOS ${v.replace(/_/g, ".")}` : "macOS";
  }
  else if (/Linux/i.test(s)) {
    os = "Linux";
  }

  // ── Device type ────────────────────────────────────────────────────────
  // Must be determined before browser so we can refine Android tablet detection.
  let deviceType = "Desktop";

  if (/iPad/i.test(s)) {
    deviceType = "Tablet";
  }
  else if (/Android/i.test(s) && !/Mobile/i.test(s)) {
    // Android without "Mobile" token → tablet
    deviceType = "Tablet";
  }
  else if (
    /Mobi|iPhone|iPod|Android.*Mobile|BlackBerry|IEMobile|Opera Mini|webOS/i.test(s)
  ) {
    deviceType = "Mobile";
  }

  // ── Browser ────────────────────────────────────────────────────────────
  // Detection order is intentional:
  //   1. Internet Explorer  (Trident / MSIE)
  //   2. Edge               (Edg/ token — Chromium Edge)
  //   3. Edge Legacy        (Edge/ token — EdgeHTML)
  //   4. Opera              (OPR/ token in modern builds)
  //   5. Opera Legacy       (Opera/ token)
  //   6. Samsung Internet   (SamsungBrowser/)
  //   7. Firefox / Waterfox / Pale Moon  (Gecko-family)
  //   8. Chrome (must come AFTER Edge/Opera/Samsung, all contain "Chrome/")
  //   9. Safari  (must come AFTER Chrome — Chrome UAs also contain "Safari/")
  //  10. Generic WebKit fallback

  let browser        = "Unknown Browser";
  let browserVersion = "";

  if (/Trident\/|MSIE /i.test(s)) {
    // Internet Explorer 11 uses "Trident/7.0; rv:11.0"
    // Older IE uses "MSIE X.0"
    const v = capture(s, /(?:MSIE |rv:)([\d.]+)/i);
    browser        = "Internet Explorer";
    browserVersion = v ? v.split(".")[0] : "";
  }
  else if (/Edg\/([\d.]+)/i.test(s)) {
    // Chromium-based Edge (Windows, macOS, Linux, mobile)
    const v = capture(s, /Edg\/([\d.]+)/i);
    browser        = "Microsoft Edge";
    browserVersion = v ? v.split(".")[0] : "";
  }
  else if (/Edge\/([\d.]+)/i.test(s)) {
    // Legacy EdgeHTML-based Edge
    const v = capture(s, /Edge\/([\d.]+)/i);
    browser        = "Microsoft Edge";
    browserVersion = v ? v.split(".")[0] : "";
  }
  else if (/OPR\/([\d.]+)/i.test(s)) {
    const v = capture(s, /OPR\/([\d.]+)/i);
    browser        = "Opera";
    browserVersion = v ? v.split(".")[0] : "";
  }
  else if (/Opera\/([\d.]+)/i.test(s)) {
    const v = capture(s, /Opera\/([\d.]+)/i);
    browser        = "Opera";
    browserVersion = v ? v.split(".")[0] : "";
  }
  else if (/SamsungBrowser\/([\d.]+)/i.test(s)) {
    const v = capture(s, /SamsungBrowser\/([\d.]+)/i);
    browser        = "Samsung Internet";
    browserVersion = v ? v.split(".")[0] : "";
  }
  else if (/Firefox\/([\d.]+)/i.test(s)) {
    const v = capture(s, /Firefox\/([\d.]+)/i);
    browser        = "Mozilla Firefox";
    browserVersion = v ? v.split(".")[0] : "";
  }
  else if (/Chrome\/([\d.]+)/i.test(s)) {
    // Brave has an identical UA to Chrome — the only way to detect it in
    // server-side UA parsing is via the Sec-CH-UA header which says "Brave".
    const secCHUA = ""; // placeholder; actual header read happens in route
    // We check the Sec-CH-UA hint that callers can inject by passing the
    // already-parsed hint as part of `ua` using the separator " [brave]"
    if (/\[brave\]/i.test(s)) {
      const v = capture(s, /Chrome\/([\d.]+)/i);
      browser        = "Brave";
      browserVersion = v ? v.split(".")[0] : "";
    } else {
      const v = capture(s, /Chrome\/([\d.]+)/i);
      browser        = "Google Chrome";
      browserVersion = v ? v.split(".")[0] : "";
    }
  }
  else if (/Safari\/([\d.]+)/i.test(s)) {
    // Safari reports its version via "Version/X.Y", not "Safari/X.Y"
    const v = capture(s, /Version\/([\d.]+)/i);
    browser        = "Safari";
    browserVersion = v ? v.split(".")[0] : "";
  }
  else if (/AppleWebKit\/([\d.]+)/i.test(s)) {
    browser        = "WebKit Browser";
    browserVersion = "";
  }

  // Backward-compatible alias
  const deviceName = deviceType;

  return { browser, browserVersion, os, deviceType, deviceName };
}

/**
 * Build the device fingerprint — the dedup key used to identify
 * "same browser on same device" re-logins.
 *
 * We intentionally exclude IP address from the fingerprint so a user
 * roaming between WiFi networks isn't treated as a new device.
 *
 * @param {{ browser: string, browserVersion: string, os: string, deviceType: string }} parsed
 * @returns {string}
 */
export function buildDeviceFingerprint({ browser, browserVersion, os, deviceType }) {
  // Normalise to lowercase and strip whitespace to make matching robust
  const parts = [
    (browser        ?? "").toLowerCase().trim(),
    (browserVersion ?? "").toLowerCase().trim(),
    (os             ?? "").toLowerCase().trim(),
    (deviceType     ?? "").toLowerCase().trim(),
  ];
  return parts.join("|");
}
