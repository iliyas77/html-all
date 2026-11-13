(function () {
'use strict';

var STORAGE_KEY = 'namazTrackerData', CITY_KEY = 'namazTrackerCity';
var PRAYERS = ['fajr','dhuhr','asr','maghrib','isha'];
var LABELS = { fajr:'Fajr', dhuhr:'Dhuhr', asr:'Asr', maghrib:'Maghrib', isha:'Isha' };
var PRAYER_ICONS = { fajr:'bi-sunrise', dhuhr:'bi-brightness-high', asr:'bi-sun', maghrib:'bi-sunset', isha:'bi-moon' };
var TITLES = { today:'Today', qaza:'Qaza', history:'History', settings:'Settings' };
var API_BASE = 'https://api.aladhan.com/v1';
var DEFAULT_CITY = 'Guntur', DEFAULT_COUNTRY = 'IN';
var ADVANCE_DELAY = 750;

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

function formatTimeHMS(d) {
  d = d || new Date();
  var h = String(d.getHours()).padStart(2, '0');
  var m = String(d.getMinutes()).padStart(2, '0');
  var s = String(d.getSeconds()).padStart(2, '0');
  return h + ':' + m + ':' + s;
}

function isAppDarkMode() {
  if (typeof document === 'undefined') return false;
  var htmlTheme = document.documentElement.getAttribute('data-bs-theme');
  if (htmlTheme === 'dark') return true;
  if (document.body && (document.body.classList.contains('dark') || document.body.classList.contains('dark-theme'))) return true;
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return true;
  return false;
}

function fallbackCopyText(text, onSuccess, onFailure) {
  try {
    var textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.top = '-9999px';
    textArea.style.left = '-9999px';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    var ok = document.execCommand('copy');
    document.body.removeChild(textArea);
    if (ok) {
      onSuccess();
    } else {
      onFailure(new Error('execCommand returned false'));
    }
  } catch (e) {
    onFailure(e);
  }
}

function renderFallbackJsonTree(container, obj, defaultDepth, isDark) {
  container.innerHTML = '';
  var root = document.createElement('div');
  root.className = 'json-formatter-row' + (isDark ? ' json-formatter-dark' : '');

  function createNode(val, key, currentDepth) {
    var row = document.createElement('div');
    row.className = 'json-formatter-row';

    var isObject = val !== null && typeof val === 'object';
    var isArr = Array.isArray(val);

    if (isObject) {
      var keys = Object.keys(val);
      var togglerLink = document.createElement('a');
      togglerLink.className = 'json-formatter-toggler-link';
      togglerLink.style.cursor = 'pointer';

      var toggler = document.createElement('span');
      toggler.className = 'json-formatter-toggler';
      togglerLink.appendChild(toggler);

      if (key !== undefined) {
        var keySpan = document.createElement('span');
        keySpan.className = 'json-formatter-key';
        keySpan.textContent = key + ': ';
        togglerLink.appendChild(keySpan);
      }

      var valueSpan = document.createElement('span');
      valueSpan.className = 'json-formatter-value';
      var constrName = document.createElement('span');
      constrName.className = 'json-formatter-constructor-name';
      constrName.textContent = isArr ? ('Array[' + keys.length + ']') : 'Object';
      valueSpan.appendChild(constrName);
      togglerLink.appendChild(valueSpan);

      row.appendChild(togglerLink);

      var children = document.createElement('div');
      children.className = 'json-formatter-children' + (isArr ? ' json-formatter-array' : ' json-formatter-object');

      var isOpen = currentDepth < defaultDepth;
      if (isOpen) {
        row.classList.add('json-formatter-open');
        buildChildren();
      }

      function buildChildren() {
        if (children.children.length > 0) return;
        keys.forEach(function(k) {
          children.appendChild(createNode(val[k], k, currentDepth + 1));
        });
      }

      togglerLink.addEventListener('click', function(e) {
        e.preventDefault();
        var open = row.classList.toggle('json-formatter-open');
        if (open) {
          buildChildren();
          children.style.display = '';
        } else {
          children.style.display = 'none';
        }
      });

      row.appendChild(children);
    } else {
      var leafSpan = document.createElement('span');
      if (key !== undefined) {
        var kSpan = document.createElement('span');
        kSpan.className = 'json-formatter-key';
        kSpan.textContent = key + ': ';
        leafSpan.appendChild(kSpan);
      }

      var valSpan = document.createElement('span');
      var type = typeof val;
      if (val === null) {
        valSpan.className = 'json-formatter-null';
        valSpan.textContent = 'null';
      } else if (type === 'string') {
        valSpan.className = 'json-formatter-string';
        valSpan.textContent = JSON.stringify(val);
      } else if (type === 'number') {
        valSpan.className = 'json-formatter-number';
        valSpan.textContent = String(val);
      } else if (type === 'boolean') {
        valSpan.className = 'json-formatter-boolean';
        valSpan.textContent = String(val);
      } else {
        valSpan.className = 'json-formatter-' + type;
        valSpan.textContent = String(val);
      }
      leafSpan.appendChild(valSpan);
      row.appendChild(leafSpan);
    }
    return row;
  }

  var rootNode = createNode(obj, undefined, 0);
  root.appendChild(rootNode);
  container.appendChild(root);
}
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

function groupDayPrayers(dateStr, rec, timings, now, isInteractive, isQaza) {
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
      isQaza: Boolean(isQaza),
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
  var isQaza = opts.screenPrefix === 'qaza' || Boolean(opts.isQaza);

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
    sections = groupDayPrayers(dateStr, rec, opts.timings, opts.now, isInteractive, isQaza);
  }

  return {
    date: dateStr,
    cardId: (opts.screenPrefix || 'card') + '-' + dateStr,
    screenPrefix: opts.screenPrefix,
    isQaza: isQaza,
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
  function bump() {
    self.version(self.version() + 1);
    if (self.data && self.data.valueHasMutated) {
      self.data.valueHasMutated();
    }
    if (self.dbLastUpdated) {
      self.dbLastUpdated(formatTimeHMS(new Date()));
    }
  }

  self.dbLastUpdated = ko.observable(formatTimeHMS(new Date()));
  self.dbCopyStatus = ko.observable('');
  self.dbCopyStatusClass = ko.observable('bg-success');
  self._copyStatusTimer = null;
  self.isViewingStorageSnapshot = ko.observable(false);
  self.storageSnapshotData = ko.observable(null);
  self.dbExpandDepth = ko.observable(1);
  self.isDbDarkMode = ko.observable(isAppDarkMode());

  self.dbEntryCounts = ko.pureComputed(function() {
    self.version();
    var d = self.isViewingStorageSnapshot() ? self.storageSnapshotData() : self.data();
    var cpCount = (d && Array.isArray(d.currentPrayers)) ? d.currentPrayers.length : 0;
    var qhCount = (d && Array.isArray(d.qazaHistory)) ? d.qazaHistory.length : 0;
    return 'currentPrayers: ' + cpCount + ' entries, qazaHistory: ' + qhCount + ' entries';
  });

  self.dbJsonSummaryLabel = ko.pureComputed(function() {
    self.version();
    var d = self.data();
    var cpCount = (d && Array.isArray(d.currentPrayers)) ? d.currentPrayers.length : 0;
    var qhCount = (d && Array.isArray(d.qazaHistory)) ? d.qazaHistory.length : 0;
    return cpCount + ' current, ' + qhCount + ' qaza entries';
  });

  self.version.subscribe(function() {
    if (self.dbLastUpdated) {
      self.dbLastUpdated(formatTimeHMS(new Date()));
    }
    if (!self.isViewingStorageSnapshot()) {
      self.renderJsonTree();
    }
  });

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
  self.pendingEndDate = ko.observable('');
  self.pendingCity = ko.observable('');
  self.pendingApiUrl = ko.observable('');
  self.cities = AP_CITIES;

  self.todayDate = ko.pureComputed(function() { return todayString(); });
  self.currentStartDate = ko.pureComputed(function() {
    self.version();
    var d = self.data();
    return d ? (d.currentPrayerStartDate || todayString()) : todayString();
  });
  self.currentStartLabel = ko.pureComputed(function() { return formatNiceDate(self.currentStartDate()); });
  self.qazaStartDate = ko.pureComputed(function() {
    self.version();
    var d = self.data();
    return d ? (d.qazaStartDate || '') : '';
  });
  self.qazaEndDate = ko.pureComputed(function() {
    self.version();
    var d = self.data();
    return d ? (d.qazaEndDate || '') : '';
  });
  self.hasQazaDates = ko.pureComputed(function() {
    self.version();
    return Boolean(self.qazaStartDate() && self.qazaEndDate());
  });
  self.hasQazaStartDate = self.hasQazaDates;

  self.isSettingsOpen = ko.observable(false);

  self.qazaDateError = ko.pureComputed(function() {
    var start = self.pendingStartDate();
    var end = self.pendingEndDate();
    var maxDate = self.yesterdayDate();
    if (start && start > maxDate) {
      return 'Start date cannot be today or a future date.';
    }
    if (end && end > maxDate) {
      return 'End date cannot be today or a future date.';
    }
    if (start && end && end < start) {
      return 'End date must be on or after start date.';
    }
    return '';
  });

  self.isQazaDateValid = ko.pureComputed(function() {
    var start = self.pendingStartDate();
    var end = self.pendingEndDate();
    var maxDate = self.yesterdayDate();
    if (!start || !end) return false;
    if (start > maxDate || end > maxDate) return false;
    return end >= start;
  });

  self._isLoaded = false;
  self._isInternalSave = false;
  self._suppressSave = false;
  self._toastTimer = null;
  self._advanceTimer = null;
  self._settingsSheet = null;
  self._savedCity = DEFAULT_CITY;
  self._savedCountry = DEFAULT_COUNTRY;
  self._savedApiUrl = null;
  self._navigating = false;
  self._scrollPositions = { today: 0, qaza: 0, history: 0 };

  /* ---- Helper functions for date & prayer collections ---- */
  function getQazaDateRange(data) {
    if (!data || !data.qazaStartDate || !data.qazaEndDate) return { start: '', end: '' };
    return { start: data.qazaStartDate, end: data.qazaEndDate };
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

  function findQazaPrayerIndex(dateStr) {
    var data = self.data();
    if (!data || !Array.isArray(data.qazaHistory)) return -1;
    for (var i = 0; i < data.qazaHistory.length; i++) {
      if (data.qazaHistory[i] && data.qazaHistory[i].date === dateStr) return i;
    }
    return -1;
  }

  function getRecordForDate(dateStr) {
    var data = self.data();
    if (!data || !dateStr) return blank();
    var idx = findCurrentPrayerIndex(dateStr);
    if (idx >= 0) return data.currentPrayers[idx];
    var qIdx = findQazaPrayerIndex(dateStr);
    if (qIdx >= 0) return data.qazaHistory[qIdx];
    return blank();
  }

  function getTodayRecord() {
    var data = self.data();
    var curDate = self.selectedTodayDate ? self.selectedTodayDate() : todayString();
    if (!data) return Object.assign({ date: curDate }, blank());
    if (!Array.isArray(data.currentPrayers)) data.currentPrayers = [];

    var idx = findCurrentPrayerIndex(curDate);
    if (idx >= 0) return data.currentPrayers[idx];

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
    if (t === 'today') return true;
    if (t === 'qaza') return self.hasQazaStartDate() && Boolean(self.headerDateLabel());
    return false;
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

  /* ---- 2. Qaza Cards (Active Day + Next 4 Upcoming) ---- */
  self.computeActiveQazaDate = function() {
    var data = self.data();
    if (!data || !data.qazaStartDate || !data.qazaEndDate || !Array.isArray(data.qazaHistory) || data.qazaHistory.length === 0) return '';
    return data.qazaHistory[0].date;
  };

  self.computeCursor = self.computeActiveQazaDate;

  self.qazaCards = ko.pureComputed(function() {
    self.version();
    self.tick();
    var data = self.data();
    if (!data || !data.qazaStartDate || !data.qazaEndDate || !Array.isArray(data.qazaHistory) || data.qazaHistory.length === 0) return [];

    var now = nowMinutes();
    var cards = [];

    // 1. Active Day Card (newest pending day in qazaHistory)
    var activeEntry = data.qazaHistory[0];
    cards.push(buildDayCard(activeEntry.date, activeEntry, {
      trackingStartDate: data.qazaStartDate,
      mode: 'interactive',
      screenPrefix: 'qaza',
      isGrid: true,
      isHighlighted: false,
      isLocked: false,
      timings: null,
      now: now
    }));

    // 2. Next 4 upcoming day cards (locked/dimmed)
    for (var i = 1; i < Math.min(5, data.qazaHistory.length); i++) {
      var entry = data.qazaHistory[i];
      cards.push(buildDayCard(entry.date, entry, {
        trackingStartDate: data.qazaStartDate,
        mode: 'interactive',
        screenPrefix: 'qaza',
        isGrid: true,
        isHighlighted: false,
        isLocked: true,
        lockedReason: 'Locked — complete ' + formatStandardDate(activeEntry.date) + ' to unlock',
        timings: null,
        now: now
      }));
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

  self.qazaDateRangeLabel = ko.pureComputed(function() {
    self.version();
    var start = self.qazaStartDate();
    var end = self.qazaEndDate();
    if (start && end) return formatStandardDate(start) + ' – ' + formatStandardDate(end);
    if (start) return formatStandardDate(start);
    return 'Not set';
  });
  self.qazaStartLabel = self.qazaDateRangeLabel;

  self.locationTimeLabel = ko.pureComputed(function() {
    self.version();
    var city = self._savedCity || DEFAULT_CITY;
    var custom = self._savedApiUrl ? ' (Custom API)' : '';
    return city + ', ' + (self._savedCountry || DEFAULT_COUNTRY) + custom;
  });

  /* ---- History ---- */
  self.filteredHistory = ko.pureComputed(function() {
    self.version();
    var data = self.data(); if (!data) return [];
    var qStart = data.qazaStartDate;
    var cStart = data.currentPrayerStartDate || todayString();
    var minStart = qStart ? (qStart < cStart ? qStart : cStart) : cStart;
    var end = todayString();
    var entries = self.activityLog().filter(function(a) {
      return a.date >= minStart && a.date <= end;
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

  /* ---- Data ---- */
  function flattenPrayerRows(list) {
    if (!Array.isArray(list)) return [];
    return list.map(function(item) {
      return {
        date: item.date,
        fajr: item.fajr ? 'done' : 'pending',
        dhuhr: item.dhuhr ? 'done' : 'pending',
        asr: item.asr ? 'done' : 'pending',
        maghrib: item.maghrib ? 'done' : 'pending',
        isha: item.isha ? 'done' : 'pending'
      };
    });
  }

  self.logDatabaseState = function(actionLabel) {
    var d = self.data();
    if (!d) return;
    var suffix = actionLabel ? ' (' + actionLabel + ')' : '';

    console.log('[DB] Settings' + suffix);
    console.table({
      qazaStartDate: d.qazaStartDate || 'Not set',
      qazaEndDate: d.qazaEndDate || 'Not set',
      currentPrayerStartDate: d.currentPrayerStartDate || 'Not set'
    });

    console.log('[DB] qazaHistory' + suffix);
    console.table(flattenPrayerRows(d.qazaHistory));

    console.log('[DB] currentPrayers' + suffix);
    console.table(flattenPrayerRows(d.currentPrayers));
  };
  self.logDatabaseStats = self.logDatabaseState;

  self.saveData = function(actionLabel) {
    if (!self._isLoaded) {
      console.warn('[DB] Save skipped: data has not finished loading on startup.');
      return;
    }
    var d = self.data();
    if (!d) return;
    try {
      self._isInternalSave = true;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
      if (self.dbLastUpdated) self.dbLastUpdated(formatTimeHMS(new Date()));
      console.log('[DB] saved');
      console.table({
        qazaStartDate: d.qazaStartDate || 'Not set',
        qazaEndDate: d.qazaEndDate || 'Not set',
        currentPrayerStartDate: d.currentPrayerStartDate || 'Not set'
      });
      self.logDatabaseState(actionLabel);
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    } finally {
      setTimeout(function() { self._isInternalSave = false; }, 50);
    }
  };

  self.loadData = function() {
    var parsed = null;
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) parsed = JSON.parse(raw);
    } catch (e) {
      console.error('Failed to load from localStorage:', e);
    }

    var base = {
      currentPrayers: [
        Object.assign({ date: todayString() }, blank())
      ],
      currentPrayerStartDate: todayString(),
      qazaHistory: [],
      qazaStartDate: '',
      qazaEndDate: '',
      activityLog: []
    };

    var loaded = Object.assign({}, base);
    var needsCleanup = false;

    if (parsed && typeof parsed === 'object') {
      // One-time cleanup of legacy completed fields from persisted data
      if ('completedCurrentPrayers' in parsed) {
        delete parsed.completedCurrentPrayers;
        needsCleanup = true;
      }
      if ('completedQazaDays' in parsed) {
        delete parsed.completedQazaDays;
        needsCleanup = true;
      }

      // Merge stored values over defaults (never the reverse)
      if (typeof parsed.qazaStartDate === 'string') loaded.qazaStartDate = parsed.qazaStartDate;
      if (typeof parsed.qazaEndDate === 'string') loaded.qazaEndDate = parsed.qazaEndDate;
      if (typeof parsed.currentPrayerStartDate === 'string' && parsed.currentPrayerStartDate) {
        loaded.currentPrayerStartDate = parsed.currentPrayerStartDate;
      }
      if (Array.isArray(parsed.activityLog)) {
        loaded.activityLog = parsed.activityLog;
      }

      if (Array.isArray(parsed.currentPrayers)) {
        var cpArray = [];
        parsed.currentPrayers.forEach(function(item) {
          if (item && typeof item === 'object' && item.date) {
            var cleanItem = Object.assign({ date: item.date }, blank());
            PRAYERS.forEach(function(p) { cleanItem[p] = item[p] === true; });
            cpArray.push(cleanItem);
          }
        });
        loaded.currentPrayers = cpArray;
      } else if (parsed.currentPrayers && typeof parsed.currentPrayers === 'object') {
        var oldDate = parsed.currentPrayers.date || todayString();
        var oldClean = Object.assign({ date: oldDate }, blank());
        PRAYERS.forEach(function(p) { oldClean[p] = parsed.currentPrayers[p] === true; });
        loaded.currentPrayers = [oldClean];
      }

      // Preserve existing qazaHistory entries - never overwrite or reset on startup
      if (Array.isArray(parsed.qazaHistory)) {
        var qHistoryArray = [];
        parsed.qazaHistory.forEach(function(item) {
          if (item && typeof item === 'object' && item.date) {
            var cleanItem = Object.assign({ id: item.id || ('qaza-' + item.date), date: item.date }, blank());
            PRAYERS.forEach(function(p) { cleanItem[p] = item[p] === true; });
            qHistoryArray.push(cleanItem);
          }
        });
        loaded.qazaHistory = qHistoryArray;
      }
    }

    if (loaded.qazaHistory.length > 0) {
      loaded.qazaHistory.sort(function(a, b) {
        return b.date.localeCompare(a.date);
      });
    }

    ensureCurrentPrayersRange(loaded);
    self.data(loaded);
    self.activityLog(loaded.activityLog.slice());
    self.pendingStartDate(loaded.qazaStartDate || '');
    self.pendingEndDate(loaded.qazaEndDate || '');
    self.pendingCurrentStartDate(loaded.currentPrayerStartDate || todayString());

    try {
      var raw2 = localStorage.getItem(CITY_KEY);
      if (raw2) {
        var s = JSON.parse(raw2);
        self._savedCity = s.city || DEFAULT_CITY;
        self._savedCountry = s.country || DEFAULT_COUNTRY;
        self._savedApiUrl = s.apiUrl || null;
      }
    } catch (e) {}

    self.selectedQazaDate(self.computeActiveQazaDate());
    self._isLoaded = true;
    if (needsCleanup) {
      self.saveData('cleanup legacy completed keys');
    }

    console.log('[DB] loaded on startup');
    console.table({
      qazaStartDate: loaded.qazaStartDate || 'Not set',
      qazaEndDate: loaded.qazaEndDate || 'Not set',
      currentPrayerStartDate: loaded.currentPrayerStartDate || 'Not set'
    });

    checkCurrentDate();
    bump();
  };

  function checkCurrentDate() {
    var data = self.data(); if (!data) return false;
    var today = todayString();
    var idx = findCurrentPrayerIndex(today);
    if (idx === -1) {
      ensureCurrentPrayersRange(data);
      self.saveData('after add');
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

    var isQaza = Boolean(prayer.isQaza || (card && card.isQaza) || self.activeTab() === 'qaza');
    var isCheckbox = Boolean(ev && ev.target && ev.target.type === 'checkbox');
    var newDone = isCheckbox ? ev.target.checked : !prayer.isDone();
    var ok = self.updatePrayerStatus(dateStr, prayer.key, newDone, isQaza);
    if (!ok && isCheckbox && ev.target) {
      ev.target.checked = !newDone;
    }
    return isCheckbox;
  };

  self.updatePrayerStatus = function(dateStr, prayer, isDone, isQaza) {
    var data = self.data();
    if (!data || !dateStr) return false;
    if (!Array.isArray(data.currentPrayers)) data.currentPrayers = [];
    if (!Array.isArray(data.qazaHistory)) data.qazaHistory = [];

    var targetQaza = (typeof isQaza === 'boolean') ? isQaza : (self.activeTab() === 'qaza');

    function applyCurrentPrayer(cpIdx) {
      var rec = data.currentPrayers[cpIdx];
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
        var removed = data.currentPrayers.splice(cpIdx, 1)[0];
        console.log('Removed completed entry:', removed);
        self.logActivity('complete', null, dateStr);
        self.logActivity('prayer', prayer, dateStr, 'check');
        self.showToast(dateStr === todayString() ? "Masha'Allah! Today's prayers completed." : "Masha'Allah! Prayers completed.");
        self.saveData('after remove');
        bump();
        return true;
      }

      rec[prayer] = (isDone === true);
      self.logActivity('prayer', prayer, dateStr, isDone ? 'check' : 'uncheck');
      self.saveData('after toggle');
      bump();
      return true;
    }

    function applyQaza(qIdx) {
      var qRec = data.qazaHistory[qIdx];
      var qWasComplete = isComplete(qRec);
      var qWillBeComplete = PRAYERS.every(function(p) {
        return p === prayer ? (isDone === true) : (qRec[p] === true);
      });

      // Auto-remove completed days: confirmation dialog
      if (!qWasComplete && qWillBeComplete) {
        var qConfirmed = window.confirm("All prayers for this day are completed. This entry will be permanently removed from your history.");
        if (!qConfirmed) {
          // On cancel, keep the entry unchanged
          bump();
          return false;
        }

        // On confirm, delete that entry from qazaHistory, persist it
        qRec[prayer] = true;
        var removed = data.qazaHistory.splice(qIdx, 1)[0];
        console.log('Removed completed entry:', removed);
        data.qazaHistory = data.qazaHistory.slice();

        self.selectedQazaDate(self.computeActiveQazaDate());
        self.logActivity('complete', null, dateStr);
        self.logActivity('prayer', prayer, dateStr, 'check');
        self.showToast("Masha'Allah! Qaza day completed.");
        self.saveData('after remove');
        bump();
        return true;
      }

      qRec[prayer] = (isDone === true);
      data.qazaHistory = data.qazaHistory.slice();
      self.logActivity('prayer', prayer, dateStr, isDone ? 'check' : 'uncheck');
      self.saveData('after toggle');
      bump();
      return true;
    }

    if (targetQaza) {
      var qIdx = findQazaPrayerIndex(dateStr);
      if (qIdx >= 0) return applyQaza(qIdx);
      var cpFallback = findCurrentPrayerIndex(dateStr);
      if (cpFallback >= 0) return applyCurrentPrayer(cpFallback);
      return false;
    } else {
      var cpIdx = findCurrentPrayerIndex(dateStr);
      if (cpIdx >= 0) return applyCurrentPrayer(cpIdx);
      var qFallback = findQazaPrayerIndex(dateStr);
      if (qFallback >= 0) return applyQaza(qFallback);
      return false;
    }
  };

  self.closeAllSheets = function() {
    if (self._settingsSheet) self._settingsSheet.hide();
    if (self._currentPrayerDateSheet) self._currentPrayerDateSheet.hide();
    if (self._qazaDateSheet) self._qazaDateSheet.hide();
    if (self._locationTimeSheet) self._locationTimeSheet.hide();
    self.isSettingsOpen(false);
  };

  self.goToday = function(targetDate) {
    self.closeAllSheets();
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
    self.closeAllSheets();
    var d = (typeof targetDate === 'string' && targetDate) ? targetDate : self.computeActiveQazaDate();
    self.selectedQazaDate(d);
    self.activeTab('qaza');
    bump();
    setTimeout(function() {
      var el = document.getElementById('qaza-' + d);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
  };

  self.goHistory = function() {
    self.closeAllSheets();
    self.activeTab('history');
    bump();
  };

  self.goSettings = function() {
    self.openSettings();
  };

  self.deleteHistory = function() {
    var data = self.data();
    if (!data || !Array.isArray(data.activityLog) || data.activityLog.length === 0) {
      self.showToast('No history to delete.');
      return;
    }
    if (!confirm('Delete all ' + data.activityLog.length + ' history entries?\n\nQaza records will be preserved.')) return;
    data.activityLog = [];
    self.activityLog([]);
    self.saveData('after delete');
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
    if (data) {
      self.pendingCurrentStartDate(data.currentPrayerStartDate || todayString());
      self.pendingStartDate(data.qazaStartDate || '');
      self.pendingEndDate(data.qazaEndDate || '');
    }
    self.pendingCity(self._savedCity);
    self.pendingApiUrl(self._savedApiUrl || '');
    self.isSettingsOpen(true);
    if (self._settingsSheet) self._settingsSheet.show();
  };

  self.backToSettings = function() {
    if (self._currentPrayerDateSheet) self._currentPrayerDateSheet.hide();
    if (self._qazaDateSheet) self._qazaDateSheet.hide();
    if (self._locationTimeSheet) self._locationTimeSheet.hide();
    if (self._databaseJsonSheet) self._databaseJsonSheet.hide();
    if (window.location.hash === '#database-json') {
      try {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch (e) {
        window.location.hash = '';
      }
    }
    if (self._settingsSheet) self._settingsSheet.show();
  };

  self.openDatabaseJsonSheet = function() {
    self.isViewingStorageSnapshot(false);
    self.dbExpandDepth(1);
    self.isDbDarkMode(isAppDarkMode());
    if (self._settingsSheet) self._settingsSheet.hide();
    if (self._databaseJsonSheet) self._databaseJsonSheet.show();
    setTimeout(function() {
      self.renderJsonTree();
    }, 50);
    if (window.location.hash !== '#database-json') {
      try {
        history.pushState(null, '', '#database-json');
      } catch (e) {
        window.location.hash = '#database-json';
      }
    }
  };

  self.renderJsonTree = function() {
    var container = document.getElementById('dbJsonTreeViewer');
    if (!container) return;

    var dataToRender = self.isViewingStorageSnapshot() ? self.storageSnapshotData() : self.data();
    if (!dataToRender) {
      container.innerHTML = '<div class="text-secondary small fst-italic p-2">Database is empty or not loaded yet.</div>';
      return;
    }

    container.innerHTML = '';
    var depth = (typeof self.dbExpandDepth() === 'number') ? self.dbExpandDepth() : 1;
    var isDark = isAppDarkMode();
    self.isDbDarkMode(isDark);

    if (typeof JSONFormatter !== 'undefined') {
      try {
        var formatter = new JSONFormatter(dataToRender, depth, {
          theme: isDark ? 'dark' : undefined,
          hoverPreviewEnabled: true
        });
        self._jsonFormatterInstance = formatter;
        container.appendChild(formatter.render());
        return;
      } catch (e) {
        console.warn('JSONFormatter render failed, using fallback:', e);
      }
    }

    renderFallbackJsonTree(container, dataToRender, depth, isDark);
  };

  self.expandAllJson = function() {
    self.dbExpandDepth(Infinity);
    if (self._jsonFormatterInstance && typeof self._jsonFormatterInstance.openAtDepth === 'function') {
      self._jsonFormatterInstance.openAtDepth(Infinity);
    } else {
      self.renderJsonTree();
    }
  };

  self.collapseAllJson = function() {
    self.dbExpandDepth(0);
    if (self._jsonFormatterInstance && typeof self._jsonFormatterInstance.openAtDepth === 'function') {
      self._jsonFormatterInstance.openAtDepth(0);
    } else {
      self.renderJsonTree();
    }
  };

  self.copyDbJson = function() {
    var d = self.isViewingStorageSnapshot() ? self.storageSnapshotData() : self.data();
    var jsonStr = '';
    try {
      jsonStr = JSON.stringify(d, null, 2);
    } catch (err) {
      self.dbCopyStatus('Error: Stringify failed');
      self.dbCopyStatusClass('bg-danger');
      return;
    }

    function handleSuccess() {
      self.dbCopyStatus('Copied!');
      self.dbCopyStatusClass('bg-success');
      self.showToast('JSON copied to clipboard.');
      clearTimeout(self._copyStatusTimer);
      self._copyStatusTimer = setTimeout(function() {
        self.dbCopyStatus('');
      }, 2500);
    }

    function handleFailure(err) {
      var msg = (err && err.message) ? err.message : 'Copy failed';
      self.dbCopyStatus('Error: ' + msg);
      self.dbCopyStatusClass('bg-danger');
      self.showToast('Failed to copy: ' + msg);
      clearTimeout(self._copyStatusTimer);
      self._copyStatusTimer = setTimeout(function() {
        self.dbCopyStatus('');
      }, 3500);
    }

    if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(jsonStr).then(handleSuccess).catch(function() {
        fallbackCopyText(jsonStr, handleSuccess, handleFailure);
      });
    } else {
      fallbackCopyText(jsonStr, handleSuccess, handleFailure);
    }
  };

  self.refreshDbFromStorage = function() {
    var parsed = null;
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        parsed = JSON.parse(raw);
      }
    } catch (e) {
      console.error('Failed to read from localStorage:', e);
    }

    self.isViewingStorageSnapshot(true);
    self.storageSnapshotData(parsed || {});
    self.dbLastUpdated(formatTimeHMS(new Date()) + ' (storage snapshot)');
    self.renderJsonTree();
    self.showToast('Re-read persisted data from storage.');
  };

  self.showLiveDbState = function() {
    self.isViewingStorageSnapshot(false);
    self.storageSnapshotData(null);
    self.dbLastUpdated(formatTimeHMS(new Date()));
    self.renderJsonTree();
    self.showToast('Switched to live database view.');
  };

  self.openCurrentPrayerDateSheet = function() {
    var data = self.data();
    self.pendingCurrentStartDate(data.currentPrayerStartDate || todayString());
    if (self._settingsSheet) self._settingsSheet.hide();
    if (self._currentPrayerDateSheet) self._currentPrayerDateSheet.show();
  };

  self.openQazaDateSheet = function() {
    var data = self.data();
    if (data) {
      self.pendingStartDate(data.qazaStartDate || '');
      self.pendingEndDate(data.qazaEndDate || '');
    }
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
    self.saveData('after date change');
    bump();
    self.showToast('Current prayer start date updated.');

    if (self._currentPrayerDateSheet) self._currentPrayerDateSheet.hide();
    if (self._settingsSheet) self._settingsSheet.show();
  };

  // 2. Qaza Prayer Dates (Start & End)
  self.saveQazaDates = function() {
    var data = self.data();
    if (!data) return;
    var newStart = self.pendingStartDate();
    var newEnd = self.pendingEndDate();
    var maxDate = self.yesterdayDate();
    if (!newStart || !newEnd) {
      self.showToast('Please select both start and end dates.');
      return;
    }
    if (newStart > maxDate) {
      self.showToast('Start date cannot be today or a future date.');
      return;
    }
    if (newEnd > maxDate) {
      self.showToast('End date cannot be today or a future date.');
      return;
    }
    if (newEnd < newStart) {
      self.showToast('End date must be on or after start date.');
      return;
    }

    if (!Array.isArray(data.qazaHistory)) {
      data.qazaHistory = [];
    }

    if (data.qazaStartDate === newStart && data.qazaEndDate === newEnd) {
      var qSheet = document.getElementById('qazaDateSheet');
      if (qSheet && qSheet.classList.contains('show')) {
        if (self._qazaDateSheet) self._qazaDateSheet.hide();
        if (self._settingsSheet) self._settingsSheet.show();
      }
      return;
    }

    var outsideEntries = data.qazaHistory.filter(function(e) {
      return e.date < newStart || e.date > newEnd;
    });

    if (outsideEntries.length > 0) {
      var confirmMsg = outsideEntries.length + ' Qaza entries are outside the new range (' + formatStandardDate(newStart) + ' to ' + formatStandardDate(newEnd) + ') and will be removed. Do you want to proceed?';
      if (!confirm(confirmMsg)) {
        return;
      }
    }

    var existingMap = {};
    data.qazaHistory.forEach(function(e) {
      if (e && e.date) {
        existingMap[e.date] = e;
      }
    });

    var newHistory = [];
    var cur = newEnd;
    while (cur >= newStart) {
      if (existingMap[cur]) {
        newHistory.push(existingMap[cur]);
      } else {
        newHistory.push({
          id: 'qaza-' + cur,
          date: cur,
          fajr: false,
          dhuhr: false,
          asr: false,
          maghrib: false,
          isha: false
        });
      }
      cur = shiftDate(cur, -1);
    }

    newHistory.sort(function(a, b) {
      return b.date.localeCompare(a.date);
    });

    data.qazaStartDate = newStart;
    data.qazaEndDate = newEnd;
    data.qazaHistory = newHistory;

    self.logActivity('setting', 'qaza', newStart + ' to ' + newEnd, 'qaza_dates');
    self.selectedQazaDate(self.computeActiveQazaDate());
    self.saveData('after date change');
    bump();

    self.showToast('Qaza dates updated.');
    var qSheetEl = document.getElementById('qazaDateSheet');
    if (qSheetEl && qSheetEl.classList.contains('show')) {
      if (self._qazaDateSheet) self._qazaDateSheet.hide();
      if (self._settingsSheet) self._settingsSheet.show();
    }
  };
  self.saveQazaStartDate = self.saveQazaDates;

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
    self._currentPrayerDateSheet = bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('currentPrayerDateSheet'));
    self._qazaDateSheet = bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('qazaDateSheet'));
    self._locationTimeSheet = bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('locationTimeSheet'));
    self._databaseJsonSheet = bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('databaseJsonSheet'));

    var settingsEl = document.getElementById('settingsSheet');
    if (settingsEl) {
      settingsEl.addEventListener('show.bs.offcanvas', function() { self.isSettingsOpen(true); });
      settingsEl.addEventListener('hidden.bs.offcanvas', function() {
        setTimeout(function() {
          var anyOpen = document.querySelector('.offcanvas.show');
          if (!anyOpen) self.isSettingsOpen(false);
        }, 50);
      });
    }
    ['currentPrayerDateSheet', 'qazaDateSheet', 'locationTimeSheet', 'databaseJsonSheet'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) {
        el.addEventListener('hidden.bs.offcanvas', function() {
          if (id === 'databaseJsonSheet' && window.location.hash === '#database-json') {
            try {
              history.replaceState(null, '', window.location.pathname + window.location.search);
            } catch (e) {
              window.location.hash = '';
            }
          }
          setTimeout(function() {
            var anyOpen = document.querySelector('.offcanvas.show');
            if (!anyOpen) self.isSettingsOpen(false);
          }, 50);
        });
      }
    });

    var dbJsonEl = document.getElementById('databaseJsonSheet');
    if (dbJsonEl) {
      dbJsonEl.addEventListener('shown.bs.offcanvas', function() {
        self.renderJsonTree();
      });
    }

    if (window.matchMedia) {
      var colorSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
      var handleThemeChange = function() {
        self.isDbDarkMode(isAppDarkMode());
        self.renderJsonTree();
      };
      if (colorSchemeQuery.addEventListener) {
        colorSchemeQuery.addEventListener('change', handleThemeChange);
      } else if (colorSchemeQuery.addListener) {
        colorSchemeQuery.addListener(handleThemeChange);
      }
    }

    window.addEventListener('hashchange', function() {
      if (window.location.hash === '#database-json') {
        self.openDatabaseJsonSheet();
      } else {
        var dbEl = document.getElementById('databaseJsonSheet');
        if (dbEl && dbEl.classList.contains('show') && self._databaseJsonSheet) {
          self._databaseJsonSheet.hide();
        }
      }
    });

    if (window.location.hash === '#database-json') {
      setTimeout(function() {
        self.openDatabaseJsonSheet();
      }, 100);
    }

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
    // Save state on backgrounding, hiding, or page unloading (protects against fold/unfold recreation or process kill)
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) {
        self.saveData('page hidden');
      } else if (checkCurrentDate()) {
        bump();
        self.fetchPrayerTimes();
      }
    });
    window.addEventListener('pagehide', function() {
      self.saveData('pagehide');
    });
    window.addEventListener('beforeunload', function() {
      self.saveData('beforeunload');
    });

    // Window resize and orientation handlers are strictly UI-only and never mutate or reset data state
    window.addEventListener('resize', function() {
      // UI-only layout update
    }, { passive: true });
    window.addEventListener('orientationchange', function() {
      // UI-only layout update
    }, { passive: true });

    window.addEventListener('storage', function(e) {
      if (e.key !== STORAGE_KEY || self._isInternalSave) return;
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
