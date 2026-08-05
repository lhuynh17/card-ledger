"use strict";

(function expose(root, factory) {
  const adapter = factory();
  if (typeof module === "object" && module.exports) module.exports = adapter;
  root.SlabAltAdapter = adapter;
})(typeof globalThis === "object" ? globalThis : this, () => {
  function compact(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function normalized(value) {
    return compact(value).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
  }

  function cert(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function grade(value) {
    const match = compact(value).toUpperCase().match(/(?:PSA\s*)?(10|[1-9](?:\.5)?)/);
    return match ? match[1] : "";
  }

  function money(value) {
    const match = compact(value).match(/(?:US\s*)?\$([\d,]+(?:\.\d{2})?)/i);
    return match ? Math.round(Number(match[1].replace(/,/g, "")) * 100) / 100 : 0;
  }

  function identityTokens(expected) {
    const subject = normalized(expected.subject || expected.name)
      .split(" ").filter((token) => token.length >= 3 && ![
        "POKEMON", "JAPANESE", "ENGLISH", "HOLO", "CARD", "THE",
      ].includes(token));
    const number = normalized(expected.cardNumber || "").replace(/^0+/, "");
    const year = normalized(expected.year || "");
    return { subject:subject.slice(0, 3), number, year };
  }

  function exactIdentity(identityText, expected) {
    const haystack = normalized(identityText);
    const wantedCert = cert(expected.cert);
    const wantedGrade = grade(expected.grade);
    const tokens = identityTokens(expected);
    const certMatches = wantedCert && cert(identityText).includes(wantedCert);
    const graderMatches = /\bPSA\b/.test(haystack);
    const gradeMatches = wantedGrade && new RegExp(`\\b(?:PSA\\s*)?${wantedGrade.replace(".", "\\.")}\\b`).test(haystack);
    const yearMatches = !tokens.year || haystack.includes(tokens.year);
    const numberMatches = !tokens.number || new RegExp(`(?:#|NO\\.?\\s*)?0*${tokens.number}\\b`).test(haystack);
    const subjectMatches = tokens.subject.length === 0 || tokens.subject.every(
      (token) => haystack.includes(token)
    );
    return {
      exact: Boolean(certMatches && graderMatches && gradeMatches && yearMatches && numberMatches && subjectMatches),
      checks:{ certMatches, graderMatches, gradeMatches, yearMatches, numberMatches, subjectMatches },
    };
  }

  function listing(raw, role) {
    const url = compact(raw.url);
    const price = money(raw.priceText);
    const allowedUrl = (
      /^https:\/\/(?:[a-z0-9-]+\.)?alt\.xyz\//i.test(url)
      || /^https:\/\/www\.ebay\.com\/itm\//i.test(url)
    );
    if (!allowedUrl || price <= 0) return null;
    const result = {
      id:compact(raw.id || url).slice(0, 240),
      title:compact(raw.title).slice(0, 500),
      priceText:compact(raw.priceText).slice(0, 100),
      price,
      url,
      source:"alt",
    };
    if (!result.title) return null;
    if (role === "sold") {
      result.soldText = compact(raw.soldText).slice(0, 200);
      result.soldAt = compact(raw.soldAt).slice(0, 30);
      if (!result.soldText && !result.soldAt) return null;
    }
    return result;
  }

  function normalizeResult(raw, expected) {
    const verification = exactIdentity(raw.identityText, expected);
    if (!verification.exact) {
      return { exact:false, checks:verification.checks, soldItems:[], activeItems:[] };
    }
    const soldItems = (Array.isArray(raw.soldItems) ? raw.soldItems : [])
      .map((item) => listing(item, "sold")).filter(Boolean)
      .sort((a, b) => {
        const right = Date.parse(b.soldAt || b.soldText.replace(/^Sold\s+/i, "")) || 0;
        const left = Date.parse(a.soldAt || a.soldText.replace(/^Sold\s+/i, "")) || 0;
        return right - left;
      })
      .slice(0, 1);
    const activeItems = (Array.isArray(raw.activeItems) ? raw.activeItems : [])
      .map((item) => listing(item, "active")).filter(Boolean)
      .sort((a, b) => a.price - b.price).slice(0, 3);
    return { exact:true, checks:verification.checks, soldItems, activeItems };
  }

  return { compact, normalized, cert, grade, money, exactIdentity, normalizeResult };
});
