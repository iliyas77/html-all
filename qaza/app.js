(function () {
'use strict';

var STORAGE_KEY = 'namazTrackerData', CITY_KEY = 'namazTrackerCity';
var PRAYERS = ['fajr','dhuhr','asr','maghrib','isha'];
var LABELS = { fajr:'Fajr', dhuhr:'Dhuhr', asr:'Asr', maghrib:'Maghrib', isha:'Isha' };
var PRAYER_ICONS = { fajr:'bi-sunrise', dhuhr:'bi-brightness-high', asr:'bi-sun', maghrib:'bi-sunset', isha:'bi-moon' };
var TITLES = { today:'Today', qaza:'Qaza', history:'History', progress:'Progress' };
var API_BASE = 'https://api.aladhan.com/v1';
var DEFAULT_CITY = 'Guntur', DEFAULT_COUNTRY = 'IN';
var DEFAULT_QAZA_DAYS = 7300, ADVANCE_DELAY = 750;

var AP_CITIES = [
  'Guntur','Vijayawada','Visakhapatnam','Tirupati','Nellore','Kurnool','Rajahmundry','Kakinada',
  'Anantapur','Kadapa','Chittoor','Ongole','Eluru','Machilipatnam','Srikakulam','Vizianagaram',
  'Nandyal','Adoni','Tenali','Bapatla','Mangalagiri','Amaravati','Ponnur','Bhimavaram',
  'Tadepalligudem','Dharmavaram','Gudivada','Narasaraopet','Chilakaluripet','Proddatur',
  'Hindupur','Madanapalle','Puttur','Tuni','Samalkot','Palasa'
];

function toDateString(d) { return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function todayString() { return toDateString(new Date()); }
function shiftDate(s, days) { var p = s.split('-').map(Number); var dt = new Date(p[0], p[1]-1, p[2]); dt.setDate(dt.getDate()+days); return toDateString(dt); }
function formatNiceDate(s) { if (!s) return '—'; var p = s.split('-').map(Number); return new Date(p[0],p[1]-1,p[2]).toLocaleDateString(undefined,{weekday:'long',year:'numeric',month:'long',day:'numeric'}); }
function formatStandardDate(s) { if (!s) return ''; var p = s.split('-').map(Number); return new Date(p[0],p[1]-1,p[2]).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}); }
function formatCardDate(s) { return formatStandardDate(s); }
function formatShortDate(s) { var p = s.split('-').map(Number); return new Date(p[0],p[1]-1,p[2]).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short',year:'numeric'}); }
function getCalendarDayDiff(dateStr, baseDateStr) {
  if (!dateStr) return 0;
  var b = baseDateStr || todayString();
  var ap = dateStr.split('-').map(Number);
  var bp = b.split('-').map(Number);
  var dtA = Date.UTC(ap[0], ap[1]-1, ap[2]);
  var dtB = Date.UTC(bp[0], bp[1]-1, bp[2]);
  return Math.round((dtB - dtA) / 86400000);
}
function formatRelativeDayTitle(dateStr, baseDateStr) {
  if (!dateStr) return { relative: '', bracketDate: '', formattedDate: '', full: '' };
  var diff = getCalendarDayDiff(dateStr, baseDateStr);
  var rel;
  if (diff === 0) {
    rel = 'Today';
  } else if (diff === 1) {
    rel = 'Yesterday';
  } else if (diff > 1) {
    rel = diff + ' days ago';
  } else {
    rel = Math.abs(diff) === 1 ? 'Tomorrow' : Math.abs(diff) + ' days ahead';
  }
  var dateFormatted = formatStandardDate(dateStr);
  var bracket = '(' + dateFormatted + ')';
  return {
    relative: rel,
    bracketDate: bracket,
    formattedDate: dateFormatted,
    full: rel + ' ' + bracket
  };
}
function nowMinutes() { var d = new Date(); return d.getHours()*60 + d.getMinutes(); }
function timeToMinutes(t) { if (!t) return null; var p = t.split(':').map(Number); return p[0]*60 + p[1]; }
function formatTime12(mins) { if (mins == null) return ''; var h = Math.floor(mins/60), m = mins%60, ap = h>=12?'PM':'AM'; h = h%12 || 12; return h+':'+String(m).padStart(2,'0')+' '+ap; }
function formatClock(date) { return date.toLocaleTimeString(undefined, { hour:'numeric', minute:'2-digit' }); }
function daysBetween(a,b) { if (!a || !b) return 0; var ap = a.split('-').map(Number), bp = b.split('-').map(Number); var s = Date.UTC(ap[0],ap[1]-1,ap[2]), e = Date.UTC(bp[0],bp[1]-1,bp[2]); return e<s ? 0 : Math.floor((e-s)/86400000)+1; }
function blank() { return { fajr:false, dhuhr:false, asr:false, maghrib:false, isha:false }; }
function isComplete(rec) { return !!rec && PRAYERS.every(function(p){ return rec[p]===true; }); }
function countDone(rec) { return rec ? PRAYERS.filter(function(p){ return rec[p]===true; }).length : 0; }

var MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

var SECTION_ORDER = ['missed', 'upcoming', 'done'];
var SECTION_CONFIG = {
  missed: { title: 'Missed', badgeClass: 'badge-missed', titleClass: 'text-danger' },
  upcoming: { title: 'Upcoming', badgeClass: 'badge-upcoming', titleClass: 'text-secondary' },
  done: { title: 'Done', badgeClass: 'badge-done', titleClass: 'text-success' }
};
var TODAY_GRID_COLUMNS = 3;

function isDayCardEnabled(dateStr, trackingStartDate) {
  if (!dateStr) return false;
  var today = todayString();
  // Disabled: future days
  if (dateStr > today) return false;
  // Disabled: any day before user's tracking start date
  if (trackingStartDate && dateStr < trackingStartDate) return false;
  // Enabled: today and past days on/after tracking start date
  return true;
}

function groupDayPrayers(dateStr, rec, timings, now, isInteractive) {
  var isCurrentDay = (dateStr === todayString());
  var groups = { missed: [], upcoming: [], done: [] };

  PRAYERS.forEach(function(p) {
    var isDone = rec ? (rec[p] === true) : false;
    var time = (isCurrentDay && timings) ? timings[p] : null;
    var status;

    if (isDone) {
      status = 'done';
    } else if (isCurrentDay) {
      status = (time !== null && now >= time ? 'missed' : 'upcoming');
    } else {
      status = 'missed';
    }

    var canToggle = isInteractive && (status !== 'upcoming');
    var timeLabel = '';
    if (isCurrentDay && time != null) {
      timeLabel = formatTime12(time);
    } else if (isDone) {
      timeLabel = 'Done';
    } else if (status === 'missed') {
      timeLabel = 'Missed';
    }

    var itemClass = '';
    if (isDone) {
      itemClass = 'is-checked';
    } else if (status === 'missed') {
      itemClass = 'is-missing';
    } else if (status === 'upcoming') {
      itemClass = 'is-upcoming';
    }

    var tileClass = itemClass;
    var statusIcon = '';
    var statusText = '';
    if (isDone) {
      statusIcon = 'bi-check-circle-fill';
      statusText = 'Done';
    } else if (status === 'missed') {
      statusIcon = 'bi-x-circle-fill';
      statusText = 'Missed';
    } else if (status === 'upcoming') {
      statusIcon = 'bi-clock';
      statusText = timeLabel || 'Upcoming';
    }

    groups[status].push({
      date: dateStr,
      key: p,
      label: LABELS[p],
      icon: PRAYER_ICONS[p],
      status: status,
      statusIcon: statusIcon,
      statusText: statusText,
      isDone: ko.observable(isDone),
      canToggle: canToggle,
      time: time,
      timeLabel: timeLabel,
      itemClass: itemClass,
      tileClass: tileClass
    });
  });

  var order = { fajr: 0, dhuhr: 1, asr: 2, maghrib: 3, isha: 4 };
  function byTime(a, b) {
    var ta = a.time == null ? 9999 : a.time;
    var tb = b.time == null ? 9999 : b.time;
    return ta !== tb ? ta - tb : order[a.key] - order[b.key];
  }
  groups.missed.sort(byTime);
  groups.upcoming.sort(byTime);
  groups.done.sort(byTime);

  var result = [];
  SECTION_ORDER.forEach(function(secKey) {
    var list = groups[secKey];
    if (list && list.length > 0) {
      var cfg = SECTION_CONFIG[secKey];
      result.push({
        id: secKey,
        title: cfg.title,
        titleClass: cfg.titleClass,
        badgeClass: cfg.badgeClass,
        count: list.length,
        prayers: list
      });
    }
  });

  return result;
}

function buildDayCard(dateStr, rec, opts) {
  opts = opts || {};
  var todayStr = todayString();
  var isLocked = Boolean(opts.isLocked);
  var isEnabled = !isLocked && isDayCardEnabled(dateStr, opts.trackingStartDate);
  var titleInfo = formatRelativeDayTitle(dateStr, todayStr);
  var isNavigatable = (opts.mode === 'navigation');
  var isInteractive = !isLocked && (opts.mode === 'interactive');
  var isGrid = Boolean(opts.isGrid);

  var disabledReason = '';
  if (isLocked) {
    disabledReason = opts.lockedReason || 'Locked until active day is completed';
  } else if (!isEnabled) {
    if (dateStr > todayStr) {
      disabledReason = 'Future date — cannot record future prayers';
    } else if (opts.trackingStartDate && dateStr < opts.trackingStartDate) {
      disabledReason = 'Prior to tracking start date (' + formatStandardDate(opts.trackingStartDate) + ')';
    } else {
      disabledReason = 'Disabled';
    }
  }

  var hasRecords = false;
  if (rec && typeof rec === 'object') {
    hasRecords = PRAYERS.some(function(p) { return typeof rec[p] === 'boolean'; });
  }

  var sections = [];
  if ((isEnabled || isLocked) && hasRecords) {
    sections = groupDayPrayers(dateStr, rec, opts.timings, opts.now, isInteractive);
  }

  return {
    date: dateStr,
    cardId: (opts.screenPrefix || 'card') + '-' + dateStr,
    relativeLabel: titleInfo.relative,
    bracketDate: titleInfo.bracketDate,
    fullTitle: titleInfo.full,
    isEnabled: isEnabled,
    isLocked: isLocked,
    disabledReason: disabledReason,
    isHighlighted: Boolean(opts.isHighlighted),
    isNavigatable: isNavigatable,
    isInteractive: isInteractive,
    isGrid: isGrid,
    hasRecords: hasRecords,
    sections: sections
  };
}

function AppViewModel() {
  var self = this;

  self.data = ko.observable(null);
  self.version = ko.observable(0);
  function bump() { self.version(self.version()+1); }

  self.activeTab = ko.observable('today');
  self.todaySubTab = ko.observable('current');
  self.loading = ko.observable(false);
  self.error = ko.observable('');
  self.toast = ko.observable('');
  self.tick = ko.observable(0);

  self.todayTimings = ko.observable(null);
  self.selectedTodayDate = ko.observable(todayString());
  self.selectedQazaDate = ko.observable('');
  self.isViewingCustomDate = ko.pureComputed(function() {
    return self.selectedTodayDate() !== todayString();
  });

  self.todayDisplayLimit = ko.observable(25);
  self.qazaDisplayLimit = ko.observable(25);

  self.activityLog = ko.observableArray([]);

  self.pendingCurrentStartDate = ko.observable('');
  self.pendingStartDate = ko.observable('');
  self.pendingCity = ko.observable('');
  self.pendingApiUrl = ko.observable('');
  self.cities = AP_CITIES;

  self.todayDate = ko.pureComputed(function() { return todayString(); });
  self.currentStartDate = ko.pureComputed(function() { var d = self.data(); return d ? (d.currentPrayerStartDate || todayString()) : todayString(); });
  self.currentStartLabel = ko.pureComputed(function() { return formatNiceDate(self.currentStartDate()); });
  self.qazaMaxDate = ko.pureComputed(function() { return shiftDate(self.currentStartDate(), -1); });

  var initDate = new Date();
  self.calendarYear = ko.observable(initDate.getFullYear());
  self.calendarMonth = ko.observable(initDate.getMonth());

  self._suppressSave = false;
  self._toastTimer = null;
  self._advanceTimer = null;
  self._settingsSheet = null;
  self._calendarSheet = null;
  self._savedCity = DEFAULT_CITY;
  self._savedCountry = DEFAULT_COUNTRY;
  self._savedApiUrl = null;
  self._navigating = false;
  self._scrollPositions = { today: 0, qaza: 0, history: 0, progress: 0 };

  /* ---- Helper functions for date & currentPrayers collection ---- */
  function getQazaDateRange(data) {
    if (!data) return { start: '', end: '' };
    var currentStart = data.currentPrayerStartDate || todayString();
    var end = shiftDate(currentStart, -1);
    var start = data.qazaStartDate || shiftDate(todayString(), -DEFAULT_QAZA_DAYS);
    return { start: start, end: end };
  }

  function ensureCurrentPrayersRange(data) {
    if (!data) return;
    if (!Array.isArray(data.currentPrayers)) data.currentPrayers = [];
    var startDate = data.currentPrayerStartDate || todayString();
    var endDate = todayString();
    if (startDate > endDate) startDate = endDate;
    data.currentPrayerStartDate = startDate;

    var existingMap = {};
    data.currentPrayers.forEach(function(item) {
      if (item && item.date) existingMap[item.date] = item;
    });

    var cur = startDate;
    var newArray = [];
    while (cur <= endDate) {
      if (existingMap[cur]) {
        newArray.push(existingMap[cur]);
      } else if (data.qazaHistory && isComplete(data.qazaHistory[cur])) {
        // Completed day already removed from currentPrayers; do not re-add
      } else {
        newArray.push(Object.assign({ date: cur }, blank()));
      }
      cur = shiftDate(cur, 1);
    }
    data.currentPrayers = newArray;
  }

  function findCurrentPrayerIndex(dateStr) {
    var data = self.data();
    if (!data || !Array.isArray(data.currentPrayers)) return -1;
    for (var i = 0; i < data.currentPrayers.length; i++) {
      if (data.currentPrayers[i].date === dateStr) return i;
    }
    return -1;
  }

  function getRecordForDate(dateStr) {
    var data = self.data();
    if (!data || !dateStr) return blank();
    var idx = findCurrentPrayerIndex(dateStr);
    if (idx >= 0) return data.currentPrayers[idx];
    if (data.qazaHistory && data.qazaHistory[dateStr]) return data.qazaHistory[dateStr];
    return blank();
  }

  function getTodayRecord() {
    var data = self.data();
    var curDate = self.selectedTodayDate ? self.selectedTodayDate() : todayString();
    if (!data) return Object.assign({ date: curDate }, blank());
    if (!Array.isArray(data.currentPrayers)) data.currentPrayers = [];

    var idx = findCurrentPrayerIndex(curDate);
    if (idx >= 0) return data.currentPrayers[idx];

    // Check if date was already recorded in qazaHistory:
    if (data.qazaHistory && data.qazaHistory[curDate]) {
      return Object.assign({ date: curDate }, data.qazaHistory[curDate]);
    }

    // If today is not in currentPrayers:
    if (curDate === todayString()) {
      var newToday = Object.assign({ date: curDate }, blank());
      data.currentPrayers.push(newToday);
      return newToday;
    }

    // Custom date with no record
    return null;
  }

  /* ---- Header ---- */
  self.tabTitle = ko.pureComputed(function() {
    if (self.activeTab() === 'today') {
      if (self.isViewingCustomDate()) {
        return formatNiceDate(self.selectedTodayDate());
      }
      return 'Today';
    }
    return TITLES[self.activeTab()] || 'Today';
  });
  self.showDateInHeader = ko.pureComputed(function() {
    var t = self.activeTab();
    return t === 'today' || t === 'qaza';
  });
  self.headerDateLabel = ko.pureComputed(function() {
    if (self.activeTab() === 'today') {
      return formatShortDate(self.selectedTodayDate());
    }
    if (self.activeTab() === 'qaza') {
      var ds = self.selectedQazaDate() || self.computeCursor();
      return ds ? formatShortDate(ds) : '';
    }
    return '';
  });
  self.yesterdayDate = ko.pureComputed(function() { return shiftDate(todayString(), -1); });

  /* ---- 1. Today Cards (Current Day vs Missed/Remaining Sub-tabs) ---- */
  self.todayCard = ko.pureComputed(function() {
    self.version();
    self.tick();
    var todayStr = todayString();
    var data = self.data();
    var startDate = data ? (data.currentPrayerStartDate || todayStr) : todayStr;
    var timings = self.todayTimings();
    var now = nowMinutes();
    var rec = getRecordForDate(todayStr);

    return buildDayCard(todayStr, rec, {
      trackingStartDate: startDate,
      mode: 'interactive',
      screenPrefix: 'today-current',
      isGrid: true,
      isHighlighted: false,
      isLocked: false,
      timings: timings,
      now: now
    });
  });

  self.missedRemainingDates = ko.pureComputed(function() {
    self.version();
    var data = self.data();
    if (!data || !Array.isArray(data.currentPrayers)) return [];
    var todayStr = todayString();
    var dates = [];
    data.currentPrayers.forEach(function(item) {
      if (item && item.date && item.date < todayStr) {
        dates.push(item.date);
      }
    });
    dates.sort(function(a, b) {
      var tA = Date.parse(a) || 0;
      var tB = Date.parse(b) || 0;
      return tB - tA;
    });
    return dates;
  });

  self.missedRemainingCards = ko.pureComputed(function() {
    self.version();
    self.tick();
    var dates = self.missedRemainingDates();
    var data = self.data();
    var todayStr = todayString();
    var startDate = data ? (data.currentPrayerStartDate || todayStr) : todayStr;
    var now = nowMinutes();

    return dates.map(function(d) {
      var rec = getRecordForDate(d);
      return buildDayCard(d, rec, {
        trackingStartDate: startDate,
        mode: 'interactive',
        screenPrefix: 'today-missed',
        isGrid: true,
        isHighlighted: false,
        isLocked: false,
        timings: null,
        now: now
      });
    });
  });

  /* ---- 2. Qaza Cards (Lazy List: Active Day + Next 4 Upcoming) ---- */
  self.computeActiveQazaDate = function() {
    var data = self.data();
    if (!data) return '';
    var range = getQazaDateRange(data);
    var start = range.start, end = range.end;
    if (!start || !end || start > end) return '';

    var cur = end;
    var guard = 0;
    while (cur >= start && guard < 30000) {
      var rec = getRecordForDate(cur);
      if (!isComplete(rec)) {
        return cur;
      }
      cur = shiftDate(cur, -1);
      guard++;
    }
    return '';
  };

  self.computeCursor = self.computeActiveQazaDate;

  self.qazaCards = ko.pureComputed(function() {
    self.version();
    self.tick();
    var data = self.data();
    if (!data) return [];
    var range = getQazaDateRange(data);
    var start = range.start, end = range.end;
    if (!start || !end || start > end) return [];

    var activeDate = self.computeActiveQazaDate();
    if (!activeDate) return [];

    var now = nowMinutes();
    var cards = [];

    // 1. Active Day Card (interactive & unlocked)
    var activeRec = getRecordForDate(activeDate);
    cards.push(buildDayCard(activeDate, activeRec, {
      trackingStartDate: start,
      mode: 'interactive',
      screenPrefix: 'qaza',
      isGrid: false,
      isHighlighted: true,
      isLocked: false,
      timings: null,
      now: now
    }));

    // 2. Next 4 upcoming day cards (previous in date order, locked/dimmed)
    var cur = shiftDate(activeDate, -1);
    var loaded = 0;
    while (cur >= start && loaded < 4) {
      var rec = getRecordForDate(cur);
      cards.push(buildDayCard(cur, rec, {
        trackingStartDate: start,
        mode: 'interactive',
        screenPrefix: 'qaza',
        isGrid: false,
        isHighlighted: false,
        isLocked: true,
        lockedReason: 'Locked — complete ' + formatStandardDate(activeDate) + ' to unlock',
        timings: null,
        now: now
      }));
      cur = shiftDate(cur, -1);
      loaded++;
    }

    return cards;
  });

  self.handleCardClick = function(card, event) {
    // Non-active cards are locked and not clickable
  };

  self.openDateInToday = function(targetDate) {
    if (self._navigating) return;
    self._navigating = true;
    setTimeout(function() { self._navigating = false; }, 400);
    self.goToday(targetDate);
  };

  self.qazaStartLabel = ko.pureComputed(function() {
    var d = self.data(); return d ? formatNiceDate(d.qazaStartDate) : '';
  });

  self.locationTimeLabel = ko.pureComputed(function() {
    self.version();
    var city = self._savedCity || DEFAULT_CITY;
    var custom = self._savedApiUrl ? ' (Custom API)' : '';
    return city + ', ' + (self._savedCountry || DEFAULT_COUNTRY) + custom;
  });

  /* ---- Stats ---- */
  self.stats = ko.pureComputed(function() {
    self.version();
    var data = self.data();
    if (!data) return { total:0, completed:0, remaining:0, percent:0 };
    var range = getQazaDateRange(data);
    var start = range.start, end = range.end;
    if (!start || !end || start > end) {
      return { total: 0, completed: 0, remaining: 0, percent: 0 };
    }
    var total = daysBetween(start, end), completed = 0;
    Object.keys(data.qazaHistory || {}).forEach(function(k) {
      if (k < start || k > end) return;
      if (isComplete(data.qazaHistory[k])) completed++;
    });
    var remaining = Math.max(total - completed, 0);
    var percent = total > 0 ? Math.min(completed/total*100, 100) : 0;
    return { total: total, completed: completed, remaining: remaining, percent: percent };
  });

  self.progressPercentLabel = ko.pureComputed(function() {
    var p = self.stats().percent;
    if (p > 0 && p < 1) return p.toFixed(2)+'%';
    if (p > 0 && p < 10) return p.toFixed(1)+'%';
    return Math.round(p)+'%';
  });

  self.breakdown = ko.pureComputed(function() {
    var s = self.stats(); var doneDays = s.completed;
    return [
      { label:'Days Completed',    value: doneDays.toLocaleString(),        color:'#094E3A' },
      { label:'Months Completed',  value: (doneDays/30).toFixed(1),          color:'#094E3A' },
      { label:'Years Completed',   value: (doneDays/365).toFixed(2),         color:'#094E3A' },
      { label:'Prayers Completed', value: (doneDays*5).toLocaleString(),     color:'#094E3A' },
      { label:'Days Remaining',    value: s.remaining.toLocaleString(),      color:'#dc2626' },
      { label:'Prayers Remaining', value: (s.remaining*5).toLocaleString(),  color:'#dc2626' },
      { label:'Total Prayers',     value: (s.total*5).toLocaleString(),      color:'#334155' }
    ];
  });

  /* ---- History ---- */
  self.filteredHistory = ko.pureComputed(function() {
    self.version();
    var data = self.data(); if (!data) return [];
    var range = getQazaDateRange(data);
    var start = range.start, end = range.end;
    var entries = self.activityLog().filter(function(a) {
      return a.date >= start && a.date <= end;
    }).sort(function(a,b) { return b.timestamp - a.timestamp; });

    return entries.map(function(a) {
      var isCompleteEvt = a.type === 'complete';
      var icon = isCompleteEvt ? 'bi-check-circle-fill' : (PRAYER_ICONS[a.prayer] || 'bi-question-circle');
      var iconClass = isCompleteEvt ? 'complete' : (a.action === 'check' ? 'check' : 'uncheck');
      var label = isCompleteEvt ? 'Day Completed' : (LABELS[a.prayer] || a.prayer) + ' ' + (a.action === 'check' ? 'completed' : 'unchecked');
      var when = new Date(a.timestamp);
      var dateLabel = formatShortDate(a.date) + ' · ' + formatClock(when);
      var badge, badgeBg, badgeColor;
      if (isCompleteEvt)             { badge='✓'; badgeBg='#094E3A'; badgeColor='#fff'; }
      else if (a.action === 'check') { badge='✓'; badgeBg='#E8F5E9'; badgeColor='#094E3A'; }
      else                           { badge='✗'; badgeBg='#f1f5f9'; badgeColor='#64748b'; }
      return { label: label, dateLabel: dateLabel, icon: icon, iconClass: iconClass, badge: badge, badgeBg: badgeBg, badgeColor: badgeColor };
    });
  });

  /* ---- Calendar ---- */
  self.monthOptions = MONTH_NAMES.map(function(name, i) { return { name: name, value: i }; });

  self.yearOptions = ko.pureComputed(function() {
    var data = self.data();
    var currentYear = new Date().getFullYear();
    var startYear = data ? parseInt(data.qazaStartDate.split('-')[0], 10) : currentYear;
    var minYear = Math.min(startYear, currentYear - 5);
    var result = [];
    for (var y = currentYear; y >= minYear; y--) result.push(y);
    return result;
  });

  self.calendarLabel = ko.pureComputed(function() {
    return MONTH_NAMES[self.calendarMonth()] + ' ' + self.calendarYear();
  });

  self.calendarDays = ko.pureComputed(function() {
    self.tick();
    self.version();
    var year = self.calendarYear(), month = self.calendarMonth();
    var data = self.data(); if (!data) return [];

    var firstWeekday = new Date(year, month, 1).getDay();
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var range = getQazaDateRange(data);
    var startStr = range.start;
    var endStr = range.end;
    var todayStr = todayString();

    var days = [];
    for (var i = 0; i < firstWeekday; i++) days.push({ empty: true, day: '', dateStr: '', inRange: false, complete: false, partial: false, isToday: false });

    for (var d = 1; d <= daysInMonth; d++) {
      var dateStr = year + '-' + String(month+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
      var clickable = dateStr >= startStr && dateStr <= endStr;
      var rec = data.qazaHistory[dateStr];
      var complete = isComplete(rec);
      var partial  = !complete && rec && countDone(rec) > 0;
      var isToday  = dateStr === todayStr;
      days.push({
        empty: false, day: d, dateStr: dateStr,
        inRange: clickable,
        complete: complete, partial: partial, isToday: isToday
      });
    }
    return days;
  });

  self.monthCompletedCount = ko.pureComputed(function() {
    var c = 0;
    self.calendarDays().forEach(function(d) { if (d.complete) c++; });
    return c;
  });

  self.selectCalendarDate = function(day) {
    if (!day || day.empty || !day.inRange) return;
    self.goQaza(day.dateStr);
    if (self._calendarSheet) self._calendarSheet.hide();
  };

  self.openCalendar = function() {
    var ds = self.selectedQazaDate() || self.computeCursor();
    if (self.activeTab() === 'qaza' && ds) {
      var parts = ds.split('-').map(Number);
      self.calendarYear(parts[0]);
      self.calendarMonth(parts[1] - 1);
    } else {
      var now = new Date();
      self.calendarYear(now.getFullYear());
      self.calendarMonth(now.getMonth());
    }
    if (self._calendarSheet) self._calendarSheet.show();
  };

  self.jumpToYesterday = function() {
    self.goQaza(self.computeCursor());
    if (self._calendarSheet) self._calendarSheet.hide();
    self.showToast('Jumped to latest Qaza day.');
  };

  self.jumpToStart = function() {
    var data = self.data(); if (!data) return;
    self.goQaza(data.qazaStartDate);
    if (self._calendarSheet) self._calendarSheet.hide();
    self.showToast('Jumped to start date.');
  };

  /* ---- Data ---- */
  self.saveData = function() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(self.data()));
      console.log('💾 Database saved to localStorage [' + STORAGE_KEY + ']:', self.data());
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
  };

  self.logDatabaseStats = function() {
    var d = self.data();
    if (!d) return;
    var qazaDates = Object.keys(d.qazaHistory || {});
    var totalQazaPrayers = 0;
    qazaDates.forEach(function(k) {
      totalQazaPrayers += countDone(d.qazaHistory[k]);
    });
    var todayRec = getTodayRecord();
    var todayDone = countDone(todayRec);
    var activeCurrentDates = Array.isArray(d.currentPrayers) ? d.currentPrayers.map(function(item) { return item.date; }) : [];

    console.group('%c🕌 Namaz & Qaza Tracker — Database Overview', 'color:#094E3A;font-weight:bold;font-size:13px;');
    console.table({
      'Today Date': { Value: todayString() },
      "Today's Prayers Completed": { Value: todayDone + ' / 5' },
      'Active Dates in currentPrayers': { Value: activeCurrentDates.length + ' active date(s) [' + activeCurrentDates.join(', ') + ']' },
      'Current Prayer Start Date': { Value: d.currentPrayerStartDate || 'N/A' },
      'Qaza Start Date': { Value: d.qazaStartDate },
      'Qaza History Days Recorded': { Value: qazaDates.length + ' days' },
      'Total Qaza Prayers Cleared': { Value: totalQazaPrayers },
      'Activity Log Entries': { Value: (d.activityLog ? d.activityLog.length : 0) + ' events' },
      'City / Country': { Value: (self._savedCity || 'Default') + ', ' + (self._savedCountry || 'IN') },
      'LocalStorage Keys': { Value: STORAGE_KEY + ', ' + CITY_KEY }
    });
    console.log('📋 currentPrayers collection (active incomplete dates):', d.currentPrayers);
    console.log('📦 Raw Database Object:', d);
    console.log('📜 Activity Log (last 10):', (d.activityLog || []).slice(-10));
    console.groupEnd();
  };

  self.loadData = function() {
    var parsed = null;
    try { var raw = localStorage.getItem(STORAGE_KEY); if (raw) parsed = JSON.parse(raw); } catch (e) {}
    var base = {
      currentPrayers: [
        Object.assign({ date: todayString() }, blank())
      ],
      currentPrayerStartDate: todayString(),
      qazaHistory: {},
      qazaStartDate: shiftDate(todayString(), -DEFAULT_QAZA_DAYS),
      stats: { totalQazaDays: 0, completedQazaDays: 0 },
      activityLog: []
    };

    if (!parsed || typeof parsed !== 'object') {
      parsed = base;
    } else {
      var cpArray = [];
      if (Array.isArray(parsed.currentPrayers)) {
        parsed.currentPrayers.forEach(function(item) {
          if (item && typeof item === 'object' && item.date) {
            var cleanItem = Object.assign({ date: item.date }, blank());
            PRAYERS.forEach(function(p) { cleanItem[p] = item[p] === true; });
            cpArray.push(cleanItem);
          }
        });
      } else if (parsed.currentPrayers && typeof parsed.currentPrayers === 'object') {
        var oldDate = parsed.currentPrayers.date || todayString();
        var oldClean = Object.assign({ date: oldDate }, blank());
        PRAYERS.forEach(function(p) { oldClean[p] = parsed.currentPrayers[p] === true; });
        cpArray.push(oldClean);
      }

      parsed = {
        currentPrayers: cpArray,
        currentPrayerStartDate: (typeof parsed.currentPrayerStartDate === 'string' && parsed.currentPrayerStartDate) ? parsed.currentPrayerStartDate : (parsed.currentPrayers && parsed.currentPrayers.date ? parsed.currentPrayers.date : todayString()),
        qazaHistory: parsed.qazaHistory && typeof parsed.qazaHistory === 'object' ? parsed.qazaHistory : {},
        qazaStartDate: (typeof parsed.qazaStartDate === 'string' && parsed.qazaStartDate) ? parsed.qazaStartDate : base.qazaStartDate,
        stats: Object.assign(base.stats, parsed.stats && typeof parsed.stats === 'object' ? parsed.stats : {}),
        activityLog: Array.isArray(parsed.activityLog) ? parsed.activityLog : []
      };

      Object.keys(parsed.qazaHistory).forEach(function(k) {
        var rec = parsed.qazaHistory[k];
        if (!rec || typeof rec !== 'object') { delete parsed.qazaHistory[k]; return; }
        var clean = blank();
        PRAYERS.forEach(function(p) { clean[p] = rec[p] === true; });
        parsed.qazaHistory[k] = clean;
      });
    }

    var range = getQazaDateRange(parsed);
    if (parsed.qazaStartDate > range.end) parsed.qazaStartDate = range.end;
    ensureCurrentPrayersRange(parsed);
    self.data(parsed);
    self.activityLog(parsed.activityLog.slice());

    try {
      var raw2 = localStorage.getItem(CITY_KEY);
      if (raw2) { var s = JSON.parse(raw2); self._savedCity = s.city || DEFAULT_CITY; self._savedCountry = s.country || DEFAULT_COUNTRY; self._savedApiUrl = s.apiUrl || null; }
    } catch (e) {}

    checkCurrentDate();
    self.selectedQazaDate(self.computeActiveQazaDate());
    bump();
  };

  function checkCurrentDate() {
    var data = self.data(); if (!data) return false;
    var today = todayString();
    var idx = findCurrentPrayerIndex(today);
    if (idx === -1 && !(data.qazaHistory && isComplete(data.qazaHistory[today]))) {
      ensureCurrentPrayersRange(data);
      self.saveData();
      return true;
    }
    return false;
  }

  self.logActivity = function(type, prayer, date, action) {
    var data = self.data();
    var entry = { type: type, prayer: prayer || null, date: date, timestamp: Date.now() };
    if (action) entry.action = action;
    data.activityLog.push(entry);
    if (data.activityLog.length > 2000) data.activityLog = data.activityLog.slice(-1500);
    self.activityLog(data.activityLog.slice());
  };

  self.showToast = function(msg) { self.toast(msg); clearTimeout(self._toastTimer); self._toastTimer = setTimeout(function(){ self.toast(''); }, 2800); };

  /* ---- Unified Prayer Toggle & Status Updates ---- */
  self.onPrayerToggle = function(arg1, arg2, event) {
    var ev = event || (arg2 && (arg2.target || arg2.type) ? arg2 : null);
    if (ev && ev.stopPropagation) {
      ev.stopPropagation();
    }
    var prayer, card;
    if (arg2 && arg2.key) {
      card = arg1;
      prayer = arg2;
    } else {
      prayer = arg1;
    }
    if (!prayer || !prayer.canToggle || prayer.status === 'upcoming') return false;
    var dateStr = prayer.date || (card && card.date);
    if (!dateStr) return false;

    var isCheckbox = Boolean(ev && ev.target && ev.target.type === 'checkbox');
    var newDone = isCheckbox ? ev.target.checked : !prayer.isDone();
    var ok = self.updatePrayerStatus(dateStr, prayer.key, newDone);
    if (!ok && isCheckbox && ev.target) {
      ev.target.checked = !newDone;
    }
    return isCheckbox;
  };

  self.updatePrayerStatus = function(dateStr, prayer, isDone) {
    var data = self.data();
    if (!data || !dateStr) return false;
    if (!Array.isArray(data.currentPrayers)) data.currentPrayers = [];

    var cpIdx = findCurrentPrayerIndex(dateStr);
    var rec;

    if (cpIdx >= 0) {
      rec = data.currentPrayers[cpIdx];
      var wasComplete = isComplete(rec);
      var willBeComplete = PRAYERS.every(function(p) {
        return p === prayer ? (isDone === true) : (rec[p] === true);
      });

      // Auto-remove completed days: confirmation dialog
      if (!wasComplete && willBeComplete) {
        var confirmed = window.confirm("All prayers for this day are completed. This entry will be removed.");
        if (!confirmed) {
          // On cancel, keep the entry unchanged
          bump();
          return false;
        }

        // On confirm, delete that day's object from currentPrayers array and persist in store
        rec[prayer] = true;
        data.currentPrayers.splice(cpIdx, 1);
        if (!data.qazaHistory) data.qazaHistory = {};
        data.qazaHistory[dateStr] = { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true };
        self.logActivity('complete', null, dateStr);
        self.logActivity('prayer', prayer, dateStr, 'check');
        self.showToast(dateStr === todayString() ? "Masha'Allah! Today's prayers completed." : "Masha'Allah! Prayers completed.");
        self.saveData();
        bump();
        return true;
      }

      rec[prayer] = (isDone === true);
      var nowComplete = isComplete(rec);

      if (!data.qazaHistory) data.qazaHistory = {};
      if (nowComplete) {
        data.qazaHistory[dateStr] = { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true };
        self.logActivity('complete', null, dateStr);
        self.showToast(dateStr === todayString() ? "Masha'Allah! Today's prayers completed." : "Masha'Allah! Prayers completed.");
      } else {
        if (data.qazaHistory[dateStr] && isComplete(data.qazaHistory[dateStr])) {
          delete data.qazaHistory[dateStr];
        }
      }

      self.logActivity('prayer', prayer, dateStr, isDone ? 'check' : 'uncheck');
      self.saveData();
      bump();
      return true;
    } else {
      if (!data.qazaHistory) data.qazaHistory = {};
      if (!data.qazaHistory[dateStr]) data.qazaHistory[dateStr] = blank();
      rec = data.qazaHistory[dateStr];
      var wasComplete2 = isComplete(rec);
      rec[prayer] = (isDone === true);
      var nowComplete2 = isComplete(rec);

      if (PRAYERS.every(function(p){ return rec[p] === false; })) {
        delete data.qazaHistory[dateStr];
      } else if (!nowComplete2 && dateStr >= (data.currentPrayerStartDate || todayString())) {
        var newCp = Object.assign({ date: dateStr }, rec);
        data.currentPrayers.push(newCp);
        ensureCurrentPrayersRange(data);
      }
      if (nowComplete2 && !wasComplete2) {
        self.logActivity('complete', null, dateStr);
        self.showToast("Masha'Allah! Day cleared.");
      }

      self.logActivity('prayer', prayer, dateStr, isDone ? 'check' : 'uncheck');
      self.saveData();
      bump();
      return true;
    }
  };

  self.goToday = function(targetDate) {
    var d = (typeof targetDate === 'string' && targetDate) ? targetDate : todayString();
    self.selectedTodayDate(d);
    self.activeTab('today');
    if (d === todayString()) {
      self.todaySubTab('current');
    } else {
      self.todaySubTab('remaining');
    }
    bump();
    setTimeout(function() {
      var el = document.getElementById('today-current-' + d) || document.getElementById('today-missed-' + d);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
  };

  self.goQaza = function(targetDate) {
    var d = (typeof targetDate === 'string' && targetDate) ? targetDate : self.computeActiveQazaDate();
    self.selectedQazaDate(d);
    self.activeTab('qaza');
    bump();
    setTimeout(function() {
      var el = document.getElementById('qaza-' + d);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
  };

  self.goHistory = function() { self.activeTab('history'); bump(); };
  self.goProgress = function() { self.activeTab('progress'); bump(); };

  self.deleteHistory = function() {
    var data = self.data();
    if (!data || !Array.isArray(data.activityLog) || data.activityLog.length === 0) {
      self.showToast('No history to delete.');
      return;
    }
    if (!confirm('Delete all ' + data.activityLog.length + ' history entries?\n\nQaza records and progress will be preserved.')) return;
    data.activityLog = [];
    self.activityLog([]);
    self.saveData();
    bump();
    self.showToast('History deleted.');
  };

  /* ---- Prayer times ---- */
  self.fetchPrayerTimes = function() {
    self.loading(true); self.error('');
    var url = self._savedApiUrl || (API_BASE + '/timingsByCity/' + todayString() + '?city=' + encodeURIComponent(self._savedCity) + '&country=' + encodeURIComponent(self._savedCountry) + '&school=1');
    fetch(url).then(function(res) {
      if (!res.ok) throw new Error('HTTP '+res.status);
      return res.json();
    }).then(function(json) {
      if (!json || !json.data || !json.data.timings) throw new Error('Bad response');
      var t = json.data.timings;
      self.todayTimings({ fajr: timeToMinutes(t.Fajr), dhuhr: timeToMinutes(t.Dhuhr), asr: timeToMinutes(t.Asr), maghrib: timeToMinutes(t.Maghrib), isha: timeToMinutes(t.Isha) });
    }).catch(function() {
      self.error('Could not fetch prayer times. Using defaults.');
      if (!self.todayTimings()) self.todayTimings({ fajr:300, dhuhr:720, asr:930, maghrib:1080, isha:1170 });
    }).finally(function() { self.loading(false); });
  };

  /* ---- Settings Navigation ---- */
  self.openSettings = function() {
    var data = self.data();
    self.pendingCurrentStartDate(data.currentPrayerStartDate || todayString());
    self.pendingStartDate(data.qazaStartDate);
    self.pendingCity(self._savedCity);
    self.pendingApiUrl(self._savedApiUrl || '');
    if (self._settingsSheet) self._settingsSheet.show();
  };

  self.backToSettings = function() {
    if (self._currentPrayerDateSheet) self._currentPrayerDateSheet.hide();
    if (self._qazaDateSheet) self._qazaDateSheet.hide();
    if (self._locationTimeSheet) self._locationTimeSheet.hide();
    if (self._settingsSheet) self._settingsSheet.show();
  };

  self.openCurrentPrayerDateSheet = function() {
    var data = self.data();
    self.pendingCurrentStartDate(data.currentPrayerStartDate || todayString());
    if (self._settingsSheet) self._settingsSheet.hide();
    if (self._currentPrayerDateSheet) self._currentPrayerDateSheet.show();
  };

  self.openQazaDateSheet = function() {
    var data = self.data();
    self.pendingStartDate(data.qazaStartDate);
    if (self._settingsSheet) self._settingsSheet.hide();
    if (self._qazaDateSheet) self._qazaDateSheet.show();
  };

  self.openLocationTimeSheet = function() {
    self.pendingCity(self._savedCity);
    self.pendingApiUrl(self._savedApiUrl || '');
    if (self._settingsSheet) self._settingsSheet.hide();
    if (self._locationTimeSheet) self._locationTimeSheet.show();
  };

  /* ---- Independent Settings Handlers ---- */

  // 1. Current Prayer Starting Date
  self.saveCurrentPrayerStartDate = function() {
    var data = self.data();
    var newCurrentStart = self.pendingCurrentStartDate();
    if (!newCurrentStart) {
      self.showToast('Please select a valid date.');
      return;
    }
    if (newCurrentStart > todayString()) {
      self.showToast('Current prayer start date cannot be in the future.');
      return;
    }
    if (!confirm('Rebuild current prayers tracking from ' + formatNiceDate(newCurrentStart) + ' through today? All prayer tracking in this range will be reset to incomplete.')) {
      return;
    }

    data.currentPrayerStartDate = newCurrentStart;

    // Rebuild currentPrayers from newCurrentStart to todayString() initialized to false
    var prayers = [];
    var cur = newCurrentStart;
    var today = todayString();
    while (cur <= today) {
      prayers.push({
        date: cur,
        fajr: false,
        dhuhr: false,
        asr: false,
        maghrib: false,
        isha: false
      });
      cur = shiftDate(cur, 1);
    }
    data.currentPrayers = prayers;

    self.logActivity('setting', 'current_prayer', newCurrentStart, 'current_prayer_start_date');
    self.saveData();
    bump();
    self.showToast('Current prayer start date updated.');

    if (self._currentPrayerDateSheet) self._currentPrayerDateSheet.hide();
    if (self._settingsSheet) self._settingsSheet.show();
  };

  // 2. Qaza Start Prayer Date
  self.saveQazaStartDate = function() {
    var data = self.data();
    var newStart = self.pendingStartDate();
    var range = getQazaDateRange(data);
    if (!newStart) {
      self.showToast('Please select a valid date.');
      return;
    }
    if (newStart > range.end) {
      self.showToast('Start date cannot be after ' + formatNiceDate(range.end) + '.');
      return;
    }

    if (newStart !== data.qazaStartDate) {
      if (!confirm('Change Qaza start date to ' + formatNiceDate(newStart) + '? This will recalculate your Qaza target.')) {
        return;
      }
      data.qazaStartDate = newStart;
      self.logActivity('setting', 'qaza', newStart, 'qaza_start_date');
      self.selectedQazaDate(self.computeActiveQazaDate());
      self.saveData();
      bump();
    }

    self.showToast('Qaza start date updated.');
    if (self._qazaDateSheet) self._qazaDateSheet.hide();
    if (self._settingsSheet) self._settingsSheet.show();
  };

  // 3. Location & Time
  self.saveLocationTime = function() {
    var newCity = self.pendingCity();
    var newApi = (self.pendingApiUrl() || '').trim();
    var changed = false;

    if (newCity && newCity !== self._savedCity) {
      self._savedCity = newCity;
      self._savedCountry = 'IN';
      changed = true;
    }
    if ((newApi || null) !== self._savedApiUrl) {
      self._savedApiUrl = newApi || null;
      changed = true;
    }

    if (changed) {
      try {
        localStorage.setItem(CITY_KEY, JSON.stringify({ city: self._savedCity, country: self._savedCountry, apiUrl: self._savedApiUrl }));
      } catch (e) {}
      self.fetchPrayerTimes();
      bump();
    }

    self.showToast('Location and time settings updated.');
    if (self._locationTimeSheet) self._locationTimeSheet.hide();
    if (self._settingsSheet) self._settingsSheet.show();
  };

  /* ---- Init ---- */
  self.init = function() {
    self._settingsSheet = bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('settingsSheet'));
    self._calendarSheet = bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('calendarSheet'));
    self._currentPrayerDateSheet = bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('currentPrayerDateSheet'));
    self._qazaDateSheet = bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('qazaDateSheet'));
    self._locationTimeSheet = bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('locationTimeSheet'));
    self.loadData();
    self.fetchPrayerTimes();
    self.logDatabaseStats();

    // Preserve scroll position when switching tabs
    window.addEventListener('scroll', function() {
      var tab = self.activeTab();
      if (tab) {
        self._scrollPositions[tab] = window.scrollY || window.pageYOffset || 0;
      }
    }, { passive: true });

    self.activeTab.subscribe(function(newTab) {
      setTimeout(function() {
        var pos = self._scrollPositions[newTab] || 0;
        window.scrollTo({ top: pos, behavior: 'instant' });
      }, 10);
    });

    setInterval(function() { self.tick(self.tick()+1); }, 60000);
    setInterval(function() {
      if (checkCurrentDate()) { bump(); self.showToast('A new day has begun.'); }
      self.fetchPrayerTimes();
    }, 30*60*1000);
    setInterval(function() {
      if (checkCurrentDate()) { bump(); self.fetchPrayerTimes(); self.showToast('A new day has begun.'); }
    }, 30000);
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden && checkCurrentDate()) { bump(); self.fetchPrayerTimes(); }
    });
    window.addEventListener('storage', function(e) {
      if (e.key !== STORAGE_KEY) return;
      self.loadData(); self.fetchPrayerTimes();
    });
  };
}

var vm = new AppViewModel();
window.vm = vm;
vm.init();
ko.applyBindings(vm);

// Global console helper
window.qazaDb = {
  get: function() { return vm.data(); },
  log: function() { vm.logDatabaseStats(); },
  clear: function() {
    if (confirm('Clear all localStorage data for Namaz Tracker?')) {
      localStorage.removeItem('namazTrackerData');
      localStorage.removeItem('namazTrackerCity');
      location.reload();
    }
  }
};

})();
