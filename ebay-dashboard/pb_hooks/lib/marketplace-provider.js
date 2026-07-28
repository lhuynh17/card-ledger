"use strict";

const MARKETPLACE_ALGORITHM_VERSION = "marketplace-v1";
const REJECTION = Object.freeze({
  INVALID_CANDIDATE: "invalid_candidate",
  WRONG_MARKETPLACE: "wrong_marketplace",
  MISSING_SOLD_DATE: "missing_sold_date",
  MISSING_PRICE: "missing_price",
  WRONG_GRADER: "wrong_grader",
  WRONG_GRADE: "wrong_grade",
  CARD_IDENTITY_MISMATCH: "card_identity_mismatch",
  REPLICA_OR_REPRINT: "replica_or_reprint",
  DUPLICATE: "duplicate",
  PRICE_OUTLIER: "price_outlier",
});

function text(value, maxLength) {
  return String(value == null ? "" : value).trim().slice(0, maxLength || 2000);
}

function finiteMoney(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? Math.round(number * 100) / 100
    : 0;
}

function normalizedWords(value) {
  return text(value, 2000)
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function normalizeGrade(value) {
  const match = text(value, 30).match(/\d+(?:\.\d+)?/);
  return match ? match[0].replace(/\.0$/, "") : "";
}

function normalizeRequest(input) {
  const request = input || {};
  const query = text(request.query, 500);
  const grader = text(request.grader, 20).toUpperCase();
  const grade = normalizeGrade(request.grade);
  if (!query) throw new Error("A marketplace query is required.");
  if (!grader) throw new Error("A grading company is required.");
  if (!grade) throw new Error("An exact grade is required.");
  return {
    marketplace: text(request.marketplace || "ebay", 30).toLowerCase(),
    query,
    grader,
    grade,
    card_identity: text(request.card_identity || query, 1000),
    sold_only: request.sold_only !== false,
    completed_only: request.completed_only !== false,
    sort: text(request.sort || "sold_desc", 30),
    result_limit: Math.min(100, Math.max(1, Number(request.result_limit) || 50)),
    correlation_id: text(request.correlation_id, 100),
    feature: text(request.feature || "market_modal", 80),
  };
}

function validateCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") return null;
  const total = finiteMoney(candidate.total || (
    Number(candidate.price || 0) + Number(candidate.shipping || 0)
  ));
  const normalized = {
    provider: text(candidate.provider, 50),
    provider_listing_id: text(candidate.provider_listing_id, 200),
    marketplace: text(candidate.marketplace || "ebay", 30).toLowerCase(),
    title: text(candidate.title, 1000),
    sold_at: text(candidate.sold_at, 80),
    price: finiteMoney(candidate.price),
    shipping: Math.max(0, finiteMoney(candidate.shipping)),
    total,
    currency: text(candidate.currency || "USD", 10).toUpperCase(),
    condition: text(candidate.condition, 200),
    seller_summary: text(candidate.seller_summary, 300),
    image_url: text(candidate.image_url, 2000),
    listing_url: text(candidate.listing_url, 2000),
    retrieved_at: text(candidate.retrieved_at, 80),
    raw_reference: text(candidate.raw_reference, 300),
  };
  if (!normalized.provider || !normalized.title || !normalized.total) return null;
  if (!normalized.provider_listing_id && !normalized.listing_url) return null;
  return normalized;
}

function rejectReason(candidate, request) {
  const titleWords = normalizedWords(candidate.title);
  const title = " " + titleWords.join(" ") + " ";
  if (candidate.marketplace !== request.marketplace) return REJECTION.WRONG_MARKETPLACE;
  if (request.sold_only && !candidate.sold_at) return REJECTION.MISSING_SOLD_DATE;
  if (!candidate.total) return REJECTION.MISSING_PRICE;
  if (!titleWords.includes(request.grader.toLowerCase())) return REJECTION.WRONG_GRADER;
  const gradePattern = new RegExp("(^|\\s)" + request.grade.replace(".", "\\.") + "(\\s|$)");
  if (!gradePattern.test(title)) return REJECTION.WRONG_GRADE;
  if (/\b(replica|reprint|proxy|custom|facsimile|counterfeit|unofficial|metal card)\b/.test(title)) {
    return REJECTION.REPLICA_OR_REPRINT;
  }
  const genericIdentityWords = [
    "psa", "bgs", "sgc", "cgc", "gem", "mint", "pokemon", "baseball",
    "football", "basketball", "hockey", "card", "cards", "trading",
  ];
  const identity = normalizedWords(request.card_identity)
    .filter((word) => (
      (word.length > 2 || /^\d+[a-z]?$/.test(word)) &&
      !/^(?:19|20)\d{2}$/.test(word) &&
      !genericIdentityWords.includes(word)
    ));
  if (identity.length) {
    const overlap = identity.filter((word) => titleWords.includes(word)).length;
    const required = Math.min(3, Math.max(1, identity.length <= 3
      ? identity.length
      : Math.ceil(identity.length * 0.6)));
    if (overlap < required) return REJECTION.CARD_IDENTITY_MISMATCH;
  }
  return "";
}

function median(numbers) {
  if (!numbers.length) return 0;
  const sorted = numbers.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function filterCandidates(rawCandidates, requestInput) {
  const request = normalizeRequest(requestInput);
  const accepted = [];
  const rejected = [];
  const seen = new Set();
  for (const raw of Array.isArray(rawCandidates) ? rawCandidates : []) {
    const candidate = validateCandidate(raw);
    if (!candidate) {
      rejected.push({ reason: REJECTION.INVALID_CANDIDATE });
      continue;
    }
    const identity = candidate.provider_listing_id || candidate.listing_url;
    if (seen.has(identity)) {
      rejected.push({ candidate, reason: REJECTION.DUPLICATE });
      continue;
    }
    seen.add(identity);
    const reason = rejectReason(candidate, request);
    if (reason) rejected.push({ candidate, reason });
    else accepted.push(candidate);
  }

  if (accepted.length >= 4) {
    const center = median(accepted.map((candidate) => candidate.total));
    const deviations = accepted.map((candidate) => Math.abs(candidate.total - center));
    const mad = median(deviations);
    const threshold = Math.max(center * 0.55, mad * 4);
    for (let index = accepted.length - 1; index >= 0; index -= 1) {
      if (Math.abs(accepted[index].total - center) > threshold) {
        rejected.push({ candidate: accepted[index], reason: REJECTION.PRICE_OUTLIER });
        accepted.splice(index, 1);
      }
    }
  }

  accepted.sort((left, right) => String(right.sold_at).localeCompare(String(left.sold_at)));
  return {
    accepted: accepted.slice(0, request.result_limit),
    rejected,
    rejection_counts: rejected.reduce((counts, item) => {
      counts[item.reason] = (counts[item.reason] || 0) + 1;
      return counts;
    }, {}),
    algorithm_version: MARKETPLACE_ALGORITHM_VERSION,
  };
}

function valuationFromCandidates(candidates) {
  const recent = (Array.isArray(candidates) ? candidates : []).slice(0, 3);
  if (!recent.length) return null;
  const totals = recent.map((candidate) => candidate.total).filter((value) => value > 0);
  if (!totals.length) return null;
  const value = Math.round(median(totals) * 100) / 100;
  return {
    market_value: value,
    low: Math.min(...totals),
    high: Math.max(...totals),
    confidence: totals.length >= 3 ? "high" : totals.length === 2 ? "medium" : "low",
    comparables: recent,
  };
}

module.exports = {
  MARKETPLACE_ALGORITHM_VERSION,
  REJECTION,
  filterCandidates,
  normalizeRequest,
  validateCandidate,
  valuationFromCandidates,
};
