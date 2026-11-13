/**
 * HANSALEHLAK V8 — Provider Request Domain Module
 * ------------------------------------------------
 * Business logic layer for provider service requests.
 * Pure logic only: no DOM, no storage, no network, no globals pollution.
 * Runs in Node.js (via require) and in browser as a classic script.
 *
 * Exposes: globalThis.HSProviderRequestDomain (frozen)
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ *
   * Constants
   * ------------------------------------------------------------------ */

  var GROUPS = Object.freeze({
    NEW: 'new',
    ACCEPTED: 'accepted',
    PROGRESS: 'progress',
    QUOTE: 'quote',
    DONE: 'done',
    CANCELLED: 'cancelled'
  });

  var GROUP_KEYS = Object.freeze([
    GROUPS.NEW,
    GROUPS.ACCEPTED,
    GROUPS.PROGRESS,
    GROUPS.QUOTE,
    GROUPS.DONE,
    GROUPS.CANCELLED
  ]);

  var ASSIGNMENT_STATUS = Object.freeze({
    OFFERED: 'offered',
    ACCEPTED: 'accepted',
    REJECTED: 'rejected',
    WITHDRAWN: 'withdrawn'
  });

  var REQUEST_STATUS = Object.freeze({
    COMPLETED: 'completed',
    CLOSED: 'closed',
    CANCELLED: 'cancelled',
    FAILED: 'failed',
    QUOTE: 'quote',
    ENROUTE: 'enroute',
    ARRIVED: 'arrived',
    STARTED: 'started',
    ACCEPTED: 'accepted',
    SCHEDULED: 'scheduled'
  });

  var DEFAULT_UPCOMING_LIMIT = 5;
  var DEFAULT_PRIORITY_LIMIT = 4;
  var UPCOMING_PAST_WINDOW_MS = 24 * 60 * 60 * 1000;

  /* ------------------------------------------------------------------ *
   * Small internal helpers (pure)
   * ------------------------------------------------------------------ */

  function asArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function isObject(value) {
    return value !== null && typeof value === 'object';
  }

  function safeString(value) {
    if (value === null || value === undefined) return '';
    return String(value);
  }

  function toFiniteNumber(value) {
    if (typeof value === 'number' && isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      var n = Number(value);
      return isFinite(n) ? n : 0;
    }
    return 0;
  }

  function parseDate(value) {
    if (value === null || value === undefined || value === '') return null;
    var t = Date.parse(value);
    return isFinite(t) ? t : null;
  }

  function lowerTrim(value) {
    return safeString(value).toLowerCase().trim();
  }

  /* ------------------------------------------------------------------ *
   * getRequestGroup — the state machine
   * ------------------------------------------------------------------ */

  /**
   * Classify a single request/assignment pair into one of the six groups.
   * Order of rules is fixed by the spec and must not be changed.
   *
   * @param {Object|null|undefined} request
   * @param {Object|null|undefined} assignment
   * @returns {'new'|'accepted'|'progress'|'quote'|'done'|'cancelled'}
   */
  function getRequestGroup(request, assignment) {
    if (!isObject(request) || !isObject(assignment)) {
      return GROUPS.NEW;
    }

    var aStatus = safeString(assignment.status);
    if (aStatus === ASSIGNMENT_STATUS.OFFERED) return GROUPS.NEW;
    if (aStatus === ASSIGNMENT_STATUS.REJECTED ||
        aStatus === ASSIGNMENT_STATUS.WITHDRAWN) {
      return GROUPS.CANCELLED;
    }
    if (aStatus !== ASSIGNMENT_STATUS.ACCEPTED) return GROUPS.NEW;

    var rStatus = safeString(request.status);

    if (rStatus === REQUEST_STATUS.COMPLETED ||
        rStatus === REQUEST_STATUS.CLOSED) {
      return GROUPS.DONE;
    }
    if (rStatus === REQUEST_STATUS.CANCELLED ||
        rStatus === REQUEST_STATUS.FAILED) {
      return GROUPS.CANCELLED;
    }
    if (rStatus === REQUEST_STATUS.QUOTE) return GROUPS.QUOTE;
    if (rStatus === REQUEST_STATUS.ENROUTE ||
        rStatus === REQUEST_STATUS.ARRIVED ||
        rStatus === REQUEST_STATUS.STARTED) {
      return GROUPS.PROGRESS;
    }
    if (rStatus === REQUEST_STATUS.ACCEPTED ||
        rStatus === REQUEST_STATUS.SCHEDULED) {
      return GROUPS.ACCEPTED;
    }
    return GROUPS.ACCEPTED;
  }

  /* ------------------------------------------------------------------ *
   * groupProviderRequests
   * ------------------------------------------------------------------ */

  /**
   * Build a grouping object for a specific provider.
   * Each group is an array of { request, assignment }, sorted newest first
   * by request.createdAt. Invalid dates are pushed to the end.
   *
   * @param {Object} database
   * @param {string} providerId
   * @returns {{new:Array, accepted:Array, progress:Array, quote:Array, done:Array, cancelled:Array}}
   */
  function groupProviderRequests(database, providerId) {
    var result = {};
    for (var i = 0; i < GROUP_KEYS.length; i++) {
      result[GROUP_KEYS[i]] = [];
    }

    if (!isObject(database) || !providerId) return result;

    var requests = asArray(database.serviceRequests);
    var assignments = asArray(database.assignments);

    // Index requests by id (first-wins to keep determinism).
    var requestById = Object.create(null);
    for (var r = 0; r < requests.length; r++) {
      var req = requests[r];
      if (isObject(req) && req.id && !(req.id in requestById)) {
        requestById[req.id] = req;
      }
    }

    // Deduplicate assignments by id, filter by provider, and ignore orphans.
    var seenAssignmentIds = Object.create(null);
    var items = [];

    for (var a = 0; a < assignments.length; a++) {
      var asg = assignments[a];
      if (!isObject(asg)) continue;
      if (asg.providerId !== providerId) continue;
      if (asg.id) {
        if (seenAssignmentIds[asg.id]) continue;
        seenAssignmentIds[asg.id] = true;
      }
      var linked = requestById[asg.reqId];
      if (!linked) continue;
      items.push({ request: linked, assignment: asg });
    }

    for (var k = 0; k < items.length; k++) {
      var group = getRequestGroup(items[k].request, items[k].assignment);
      if (result[group]) {
        result[group].push(items[k]);
      }
    }

    for (var g = 0; g < GROUP_KEYS.length; g++) {
      result[GROUP_KEYS[g]].sort(compareByCreatedAtDesc);
    }

    return result;
  }

  function compareByCreatedAtDesc(a, b) {
    var ta = parseDate(a.request.createdAt);
    var tb = parseDate(b.request.createdAt);
    if (ta === null && tb === null) return 0;
    if (ta === null) return 1;
    if (tb === null) return -1;
    return tb - ta;
  }

  /* ------------------------------------------------------------------ *
   * getProviderRequestStats
   * ------------------------------------------------------------------ */

  function getProviderRequestStats(database, providerId) {
    var groups = groupProviderRequests(database, providerId);
    var stats = {
      totalRequests: 0,
      newRequests: groups[GROUPS.NEW].length,
      acceptedRequests: groups[GROUPS.ACCEPTED].length,
      progressRequests: groups[GROUPS.PROGRESS].length,
      quoteRequests: groups[GROUPS.QUOTE].length,
      completedRequests: groups[GROUPS.DONE].length,
      cancelledRequests: groups[GROUPS.CANCELLED].length,
      pendingActions: 0
    };
    stats.totalRequests =
      stats.newRequests +
      stats.acceptedRequests +
      stats.progressRequests +
      stats.quoteRequests +
      stats.completedRequests +
      stats.cancelledRequests;
    stats.pendingActions =
      stats.newRequests +
      stats.acceptedRequests +
      stats.progressRequests +
      stats.quoteRequests;
    return stats;
  }

  /* ------------------------------------------------------------------ *
   * getProviderFinancialSummary
   * ------------------------------------------------------------------ */

  function getProviderFinancialSummary(database, providerId) {
    var summary = {
      transactionCount: 0,
      grossValue: 0,
      totalCommission: 0,
      netEarnings: 0,
      averageTransactionValue: 0
    };
    if (!isObject(database) || !providerId) return summary;

    var txs = asArray(database.transactions);
    for (var i = 0; i < txs.length; i++) {
      var tx = txs[i];
      if (!isObject(tx)) continue;
      if (tx.providerId !== providerId) continue;

      var value = toFiniteNumber(tx.value);
      var commission = toFiniteNumber(tx.commission);
      var net = toFiniteNumber(tx.net);

      summary.transactionCount += 1;
      summary.grossValue += value;
      summary.totalCommission += commission;
      summary.netEarnings += net;
    }

    if (summary.transactionCount > 0) {
      summary.averageTransactionValue =
        summary.grossValue / summary.transactionCount;
    }

    return summary;
  }

  /* ------------------------------------------------------------------ *
   * getProviderRatingSummary
   * ------------------------------------------------------------------ */

  function getProviderRatingSummary(database, providerId) {
    var summary = {
      reviewCount: 0,
      averageRating: null,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    };
    if (!isObject(database) || !providerId) return summary;

    var reviews = asArray(database.reviews);
    var sum = 0;
    var count = 0;

    for (var i = 0; i < reviews.length; i++) {
      var rev = reviews[i];
      if (!isObject(rev)) continue;
      if (rev.providerId !== providerId) continue;

      var stars = rev.stars;
      if (typeof stars !== 'number' || !isFinite(stars)) continue;
      if (stars !== Math.floor(stars)) continue;
      if (stars < 1 || stars > 5) continue;

      summary.ratingDistribution[stars] += 1;
      sum += stars;
      count += 1;
    }

    summary.reviewCount = count;
    if (count > 0) {
      summary.averageRating = sum / count;
    }
    return summary;
  }

  /* ------------------------------------------------------------------ *
   * getUpcomingAppointments
   * ------------------------------------------------------------------ */

  function getUpcomingAppointments(database, providerId, now, limit) {
    var nowMs = resolveNowMs(now);
    var max = (typeof limit === 'number' && isFinite(limit) && limit > 0)
      ? Math.floor(limit)
      : DEFAULT_UPCOMING_LIMIT;

    var groups = groupProviderRequests(database, providerId);
    var pool = groups[GROUPS.ACCEPTED].concat(groups[GROUPS.PROGRESS]);

    var cutoff = nowMs - UPCOMING_PAST_WINDOW_MS;
    var collected = [];

    for (var i = 0; i < pool.length; i++) {
      var item = pool[i];
      var appointmentRaw = pickAppointmentSource(item.request);
      var appointmentMs = parseDate(appointmentRaw);
      if (appointmentMs === null) continue;
      if (appointmentMs < cutoff) continue;
      collected.push({
        request: item.request,
        assignment: item.assignment,
        appointmentAt: appointmentRaw,
        _ms: appointmentMs
      });
    }

    collected.sort(function (a, b) { return a._ms - b._ms; });

    var out = [];
    for (var j = 0; j < collected.length && out.length < max; j++) {
      out.push({
        request: collected[j].request,
        assignment: collected[j].assignment,
        appointmentAt: collected[j].appointmentAt
      });
    }
    return out;
  }

  function pickAppointmentSource(request) {
    if (!isObject(request)) return null;
    if (isNonEmpty(request.agreedAt)) return request.agreedAt;
    if (isNonEmpty(request.when)) return request.when;
    if (isObject(request.proposal) && isNonEmpty(request.proposal.at)) {
      return request.proposal.at;
    }
    return null;
  }

  function isNonEmpty(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim() !== '';
    return true;
  }

  function resolveNowMs(now) {
    if (now instanceof Date) {
      var t = now.getTime();
      return isFinite(t) ? t : Date.now();
    }
    if (typeof now === 'number' && isFinite(now)) return now;
    if (typeof now === 'string' && now.trim() !== '') {
      var p = Date.parse(now);
      if (isFinite(p)) return p;
    }
    return Date.now();
  }

  /* ------------------------------------------------------------------ *
   * getProviderPriorityActions
   * ------------------------------------------------------------------ */

  var PRIORITY_ORDER = Object.freeze({
    quote: 1,
    new: 2,
    accepted: 3,
    progress: 4
  });

  var PRIORITY_TEMPLATES = Object.freeze({
    quote: {
      title: 'موافقة العميل على عرض السعر',
      description: 'العميل في مرحلة مراجعة عرض السعر، تابع للحصول على الموافقة.'
    },
    'new': {
      title: 'طلب جديد',
      description: 'لديك طلب جديد ينتظر قبولك أو رفضه.'
    },
    accepted: {
      title: 'تأكيد الموعد',
      description: 'تم قبول التكليف، أكّد الموعد أو اقترح موعدًا بديلًا.'
    },
    progress: {
      title: 'استكمال تنفيذ الخدمة',
      description: 'الخدمة قيد التنفيذ، تابع حتى الإنجاز.'
    }
  });

  function getProviderPriorityActions(database, providerId, limit) {
    var max = (typeof limit === 'number' && isFinite(limit) && limit > 0)
      ? Math.floor(limit)
      : DEFAULT_PRIORITY_LIMIT;

    var groups = groupProviderRequests(database, providerId);
    var collected = [];

    var actionable = [GROUPS.QUOTE, GROUPS.NEW, GROUPS.ACCEPTED, GROUPS.PROGRESS];
    for (var g = 0; g < actionable.length; g++) {
      var gName = actionable[g];
      var bucket = groups[gName];
      for (var i = 0; i < bucket.length; i++) {
        var item = bucket[i];
        var tmpl = PRIORITY_TEMPLATES[gName];
        collected.push({
          requestId: safeString(item.request.id),
          requestNumber: item.request.no,
          serviceName: safeString(item.request.serviceName),
          group: gName,
          title: tmpl.title,
          description: tmpl.description,
          priority: PRIORITY_ORDER[gName],
          _sortMs: parseDate(item.request.createdAt)
        });
      }
    }

    collected.sort(function (a, b) {
      if (a.priority !== b.priority) return a.priority - b.priority;
      var ta = a._sortMs;
      var tb = b._sortMs;
      if (ta === null && tb === null) return 0;
      if (ta === null) return 1;
      if (tb === null) return -1;
      return tb - ta;
    });

    var out = [];
    for (var k = 0; k < collected.length && out.length < max; k++) {
      out.push({
        requestId: collected[k].requestId,
        requestNumber: collected[k].requestNumber,
        serviceName: collected[k].serviceName,
        group: collected[k].group,
        title: collected[k].title,
        description: collected[k].description,
        priority: collected[k].priority
      });
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * filterProviderRequests
   * ------------------------------------------------------------------ */

  function filterProviderRequests(items, options) {
    var list = asArray(items);
    if (!isObject(options)) return list.slice();

    var group = options.group ? safeString(options.group) : '';
    var search = lowerTrim(options.search);
    var fromMs = parseDate(options.fromDate);
    var toMs = parseDate(options.toDate);

    return list.filter(function (item) {
      if (!isObject(item) || !isObject(item.request)) return false;
      var req = item.request;

      if (group) {
        var g = getRequestGroup(req, item.assignment);
        if (g !== group) return false;
      }

      if (search) {
        var haystack = [
          safeString(req.no),
          safeString(req.serviceName),
          safeString(req.desc),
          safeString(req.gov),
          safeString(req.area)
        ].join(' ').toLowerCase();
        if (haystack.indexOf(search) === -1) return false;
      }

      if (fromMs !== null || toMs !== null) {
        var createdMs = parseDate(req.createdAt);
        if (createdMs === null) return false;
        if (fromMs !== null && createdMs < fromMs) return false;
        if (toMs !== null && createdMs > toMs) return false;
      }

      return true;
    });
  }

  /* ------------------------------------------------------------------ *
   * Public API
   * ------------------------------------------------------------------ */

  var api = Object.freeze({
    GROUPS: GROUPS,
    getRequestGroup: getRequestGroup,
    groupProviderRequests: groupProviderRequests,
    getProviderRequestStats: getProviderRequestStats,
    getProviderFinancialSummary: getProviderFinancialSummary,
    getProviderRatingSummary: getProviderRatingSummary,
    getUpcomingAppointments: getUpcomingAppointments,
    getProviderPriorityActions: getProviderPriorityActions,
    filterProviderRequests: filterProviderRequests
  });

  global.HSProviderRequestDomain = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
