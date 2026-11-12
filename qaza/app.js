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
function formatCardDate(s) { if (!s) return '—'; var p = s.split('-').map(Number); return new Date(p[0],p[1]-1,p[2]).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}); }
function formatShortDate(s) { var p = s.split('-').map(Number); return new Date(p[0],p[1]-1,p[2]).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short',year:'numeric'}); }
function nowMinutes() { var d = new Date(); return d.getHours()*60 + d.getMinutes(); }
function timeToMinutes(t) { if (!t) return null; var p = t.split(':').map(Number); return p[0]*60 + p[1]; }
function formatTime12(mins) { if (mins == null) return ''; var h = Math.floor(mins/60), m = mins%60, ap = h>=12?'PM':'AM'; h = h%12 || 12; return h+':'+String(m).padStart(2,'0')+' '+ap; }
function formatClock(date) { return date.toLocaleTimeString(undefined, { hour:'numeric', minute:'2-digit' }); }
function daysBetween(a,b) { if (!a || !b) return 0; var ap = a.split('-').map(Number), bp = b.split('-').map(Number); var s = Date.UTC(ap[0],ap[1]-1,ap[2]), e = Date.UTC(bp[0],bp[1]-1,bp[2]); return e<s ? 0 : Math.floor((e-s)/86400000)+1; }
function blank() { return { fajr:false, dhuhr:false, asr:false, maghrib:false, isha:false }; }
function isComplete(rec) { return !!rec && PRAYERS.every(function(p){ return rec[p]===true; }); }
function countDone(rec) { return rec ? PRAYERS.filter(function(p){ return rec[p]===true; }).length : 0; }

var MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function AppViewModel() {
  var self = this;

  self.data = ko.observable(null);
  self.version = ko.observable(0);
  function bump() { self.version(self.version()+1); }

  self.activeTab = ko.observable('today');
  self.todaySubTab = ko.observable('missing');
  self.qazaSubTab = ko.observable('notComplete');
  self.loading = ko.observable(false);
  self.error = ko.observable('');
  self.toast = ko.observable('');
  self.tick = ko.observable(0);

  self.todayTimings = ko.observable(null);
  self.todayPrayers = makePrayerSet(onTodayPrayerChange);
  self.activeQazaDate = ko.observable('');
  self.yesterdayPrayers = makePrayerSet(onQazaPrayerChange);

  self.activityLog = ko.observableArray([]);

  self.pendingCurrentStartDate = ko.observable('');
  self.pendingStartDate = ko.observable('');
  self.pendingCity = ko.observable('');
  self.pendingApiUrl = ko.observable('');
  self.cities = AP_CITIES;

  self.todayDate = ko.pureComputed(function() { return todayString(); });
  self.currentStartDate = ko.pureComputed(function() { var d = self.data(); return d ? (d.currentPrayerStartDate || todayString()) : todayString(); });
  self.currentStartLabel = ko.pureComputed(function() { return formatNiceDate(self.currentStartDate()); });

  var initDate = new Date();
  self.calendarYear = ko.observable(initDate.getFullYear());
  self.calendarMonth = ko.observable(initDate.getMonth());

  self._suppressSave = false;
  self._toastTimer = null;
  self._advanceTimer = null;
  self._settingsSheet = null;
  self._calendarSheet = null;
  self._missingPrayersSheet = null;
  self._missingSheet = null;
  self._savedCity = DEFAULT_CITY;
  self._savedCountry = DEFAULT_COUNTRY;
  self._savedApiUrl = null;

  function makePrayerSet(onChange) {
    var set = {};
    PRAYERS.forEach(function(p) {
      set[p] = ko.observable(false);
      set[p].subscribe(function(val) { if (self._suppressSave) return; onChange(p, val); });
    });
    return set;
  }

  /* ---- Helper functions for date & currentPrayers collection ---- */
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
    var today = todayString();
    if (!data) return Object.assign({ date: today }, blank());
    if (!Array.isArray(data.currentPrayers)) data.currentPrayers = [];

    var idx = findCurrentPrayerIndex(today);
    if (idx >= 0) return data.currentPrayers[idx];

    // If today is not in currentPrayers:
    // Check if today was already 100% completed:
    if (data.qazaHistory && isComplete(data.qazaHistory[today])) {
      return { date: today, fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true };
    }

    // Otherwise, create today's tracking object at the start of the day
    var newToday = Object.assign({ date: today }, blank());
    data.currentPrayers.push(newToday);
    return newToday;
  }

  /* ---- Header ---- */
  self.tabTitle = ko.pureComputed(function() { return TITLES[self.activeTab()] || 'Today'; });
  self.showDateInHeader = ko.pureComputed(function() {
    var t = self.activeTab();
    return t === 'today' || t === 'qaza';
  });
  self.headerDateLabel = ko.pureComputed(function() {
    if (self.activeTab() === 'today') {
      return formatShortDate(todayString());
    }
    if (self.activeTab() === 'qaza') {
      var ds = self.activeQazaDate();
      return ds ? formatShortDate(ds) : '';
    }
    return '';
  });
  self.yesterdayDate = ko.pureComputed(function() { return shiftDate(todayString(), -1); });

  /* ---- Today groups (ROBUST: depends only on version, tick, timings) ---- */
  self.todayGroups = ko.pureComputed(function() {
    self.version();
    self.tick();
    var data = self.data();
    if (!data) return { upcoming: [], missing: [], done: [] };
    var todayRec = getTodayRecord();
    var timings = self.todayTimings();
    var now = nowMinutes();
    var order = { fajr:0, dhuhr:1, asr:2, maghrib:3, isha:4 };
    var groups = { upcoming: [], missing: [], done: [] };

    PRAYERS.forEach(function(p) {
      var time = timings ? timings[p] : null;
      var chk = todayRec[p] === true;
      var status = chk ? 'done' : (time !== null && now >= time ? 'missing' : 'upcoming');
      groups[status].push({
        key: p, label: LABELS[p], icon: PRAYER_ICONS[p],
        time: time, timeLabel: formatTime12(time), status: status,
        checkedObs: self.todayPrayers[p]
      });
    });

    function byTime(a, b) { var ta = a.time == null ? 9999 : a.time; var tb = b.time == null ? 9999 : b.time; return ta !== tb ? ta - tb : order[a.key] - order[b.key]; }
    groups.upcoming.sort(byTime); groups.missing.sort(byTime); groups.done.sort(byTime);
    return groups;
  });

  /* ---- Missed Prayers (Derived dynamically from currentPrayers) ---- */
  self.missedPrayerDays = ko.pureComputed(function() {
    self.version();
    var data = self.data();
    if (!data || !Array.isArray(data.currentPrayers)) return [];

    return data.currentPrayers.map(function(item) {
      var dateStr = item.date;
      var doneCount = countDone(item);
      var allDone = doneCount === 5;

      var prayers = PRAYERS.map(function(p) {
        var done = item[p] === true;
        return {
          key: p,
          label: LABELS[p],
          icon: PRAYER_ICONS[p],
          isDone: done,
          statusText: done ? '✓ Done' : '✕ Missed'
        };
      });

      return {
        date: dateStr,
        dateLabel: formatCardDate(dateStr),
        allDone: allDone,
        missedCount: 5 - doneCount,
        prayers: prayers
      };
    });
  });

  self.openMissingSheet = function() {
    if (self._missingPrayersSheet) {
      self._missingPrayersSheet.show();
    }
  };

  self.toggleDayPrayer = function(dayCard, prayerItem) {
    if (!dayCard || !dayCard.date || !prayerItem) return;
    var ds = dayCard.date;
    var data = self.data();
    if (!data || !Array.isArray(data.currentPrayers)) return;

    var idx = findCurrentPrayerIndex(ds);
    if (idx < 0) return;
    var entry = data.currentPrayers[idx];

    var newVal = !entry[prayerItem.key];
    entry[prayerItem.key] = newVal;

    if (ds === todayString()) {
      self._suppressSave = true;
      try {
        self.todayPrayers[prayerItem.key](newVal);
      } finally {
        self._suppressSave = false;
      }
    }

    if (ds === self.activeQazaDate()) {
      self._suppressSave = true;
      try {
        self.yesterdayPrayers[prayerItem.key](newVal);
      } finally {
        self._suppressSave = false;
      }
    }

    if (!data.qazaHistory) data.qazaHistory = {};
    if (isComplete(entry)) {
      data.qazaHistory[ds] = { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true };
      self.logActivity('complete', null, ds);
    } else {
      if (data.qazaHistory[ds] && isComplete(data.qazaHistory[ds])) {
        delete data.qazaHistory[ds];
      }
    }

    self.logActivity('prayer', prayerItem.key, ds, newVal ? 'check' : 'uncheck');
    self.saveData();
    bump();
  };

  /* ---- Qaza groups (ROBUST) ---- */
  self.yesterdayGroups = ko.pureComputed(function() {
    self.version();
    var data = self.data();
    if (!data) return { notComplete: [], complete: [] };
    var ds = self.activeQazaDate();
    var rec = ds ? getRecordForDate(ds) : blank();
    var groups = { notComplete: [], complete: [] };
    PRAYERS.forEach(function(p) {
      var chk = rec[p] === true;
      (chk ? groups.complete : groups.notComplete).push({
        key: p, label: LABELS[p], icon: PRAYER_ICONS[p], checkedObs: self.yesterdayPrayers[p]
      });
    });
    return groups;
  });

  self.yesterdayStatus = ko.pureComputed(function() {
    var dc = self.yesterdayGroups().complete.length;
    return dc === 5 ? '✅ Cleared — moving to previous day…' : dc + ' of 5 prayers completed for this day.';
  });

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
    var start = data.qazaStartDate, end = shiftDate(todayString(), -1);
    var total = daysBetween(start, end), completed = 0;
    Object.keys(data.qazaHistory).forEach(function(k) {
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
    var start = data.qazaStartDate, end = shiftDate(todayString(), -1);
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
    var startStr = data.qazaStartDate;
    var todayStr = todayString();
    var yesterdayStr = shiftDate(todayStr, -1);

    var days = [];
    for (var i = 0; i < firstWeekday; i++) days.push({ empty: true, day: '', dateStr: '', inRange: false, complete: false, partial: false, isToday: false });

    for (var d = 1; d <= daysInMonth; d++) {
      var dateStr = year + '-' + String(month+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
      var clickable = dateStr >= startStr && dateStr <= yesterdayStr;
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
    self.activeQazaDate(day.dateStr);
    self.loadYesterdayPrayers();
    self.activeTab('qaza');
    self._calendarSheet.hide();
  };

  self.openCalendar = function() {
    var ds = self.activeQazaDate();
    if (self.activeTab() === 'qaza' && ds) {
      var parts = ds.split('-').map(Number);
      self.calendarYear(parts[0]);
      self.calendarMonth(parts[1] - 1);
    } else {
      var now = new Date();
      self.calendarYear(now.getFullYear());
      self.calendarMonth(now.getMonth());
    }
    self._calendarSheet.show();
  };

  self.jumpToYesterday = function() {
    self.activeQazaDate(self.computeCursor());
    self.loadYesterdayPrayers();
    self.activeTab('qaza');
    self._calendarSheet.hide();
    self.showToast('Jumped to latest Qaza day.');
  };

  self.jumpToStart = function() {
    var data = self.data(); if (!data) return;
    self.activeQazaDate(data.qazaStartDate);
    self.loadYesterdayPrayers();
    self.activeTab('qaza');
    self._calendarSheet.hide();
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

    var yesterday = shiftDate(todayString(), -1);
    if (parsed.qazaStartDate > yesterday) parsed.qazaStartDate = yesterday;
    ensureCurrentPrayersRange(parsed);
    self.data(parsed);
    self.activityLog(parsed.activityLog.slice());

    try {
      var raw2 = localStorage.getItem(CITY_KEY);
      if (raw2) { var s = JSON.parse(raw2); self._savedCity = s.city || DEFAULT_CITY; self._savedCountry = s.country || DEFAULT_COUNTRY; self._savedApiUrl = s.apiUrl || null; }
    } catch (e) {}

    checkCurrentDate();
    self.loadTodayPrayers();
    self.activeQazaDate(self.computeCursor());
    self.loadYesterdayPrayers();
    bump();
  };

  function checkCurrentDate() {
    var data = self.data(); if (!data) return false;
    var today = todayString();
    var idx = findCurrentPrayerIndex(today);
    if (idx === -1) {
      ensureCurrentPrayersRange(data);
      self.saveData();
      return true;
    }
    return false;
  }

  self.loadTodayPrayers = function() {
    var rec = getTodayRecord();
    self._suppressSave = true;
    try {
      PRAYERS.forEach(function(p) { self.todayPrayers[p](rec[p] === true); });
    } finally {
      self._suppressSave = false;
    }
  };

  self.loadYesterdayPrayers = function() {
    var ds = self.activeQazaDate();
    var rec = ds ? getRecordForDate(ds) : blank();
    self._suppressSave = true;
    try {
      PRAYERS.forEach(function(p) { self.yesterdayPrayers[p](rec[p] === true); });
    } finally {
      self._suppressSave = false;
    }
  };

  self.computeCursor = function() {
    var data = self.data(); if (!data) return shiftDate(todayString(), -1);
    var start = data.qazaStartDate;
    var d = shiftDate(todayString(), -1);
    var guard = 0;
    while (d >= start && isComplete(getRecordForDate(d)) && guard < 20000) {
      d = shiftDate(d, -1);
      guard++;
    }
    return d < start ? start : d;
  };

  self.logActivity = function(type, prayer, date, action) {
    var data = self.data();
    var entry = { type: type, prayer: prayer || null, date: date, timestamp: Date.now() };
    if (action) entry.action = action;
    data.activityLog.push(entry);
    if (data.activityLog.length > 2000) data.activityLog = data.activityLog.slice(-1500);
    self.activityLog(data.activityLog.slice());
  };

  self.showToast = function(msg) { self.toast(msg); clearTimeout(self._toastTimer); self._toastTimer = setTimeout(function(){ self.toast(''); }, 2800); };

  /* ---- Actions ---- */
  function onTodayPrayerChange(prayer, val) {
    var data = self.data(); if (!data) return;
    if (!Array.isArray(data.currentPrayers)) data.currentPrayers = [];

    var today = todayString();
    var idx = findCurrentPrayerIndex(today);
    var todayEntry;

    if (idx >= 0) {
      todayEntry = data.currentPrayers[idx];
    } else {
      // Re-create entry because user unchecked a prayer on a previously completed day
      todayEntry = Object.assign({ date: today }, blank());
      if (data.qazaHistory && isComplete(data.qazaHistory[today])) {
        PRAYERS.forEach(function(p) { todayEntry[p] = true; });
      }
      data.currentPrayers.push(todayEntry);
      idx = data.currentPrayers.length - 1;
    }

    todayEntry[prayer] = (val === true);
    self.logActivity('prayer', prayer, today, val ? 'check' : 'uncheck');

    if (!data.qazaHistory) data.qazaHistory = {};
    if (isComplete(todayEntry)) {
      data.qazaHistory[today] = { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true };
      self.logActivity('complete', null, today);
      self.showToast("Masha'Allah! Today's prayers completed.");
    } else {
      if (data.qazaHistory[today] && isComplete(data.qazaHistory[today])) {
        delete data.qazaHistory[today];
      }
    }

    self.saveData();
    bump();
  }

  function onQazaPrayerChange(prayer, val) {
    var data = self.data(); var ds = self.activeQazaDate();
    if (!ds || !data) return;
    if (!Array.isArray(data.currentPrayers)) data.currentPrayers = [];

    var cpIdx = findCurrentPrayerIndex(ds);
    var wasComplete = false;
    var nowComplete = false;

    if (cpIdx >= 0) {
      var cpEntry = data.currentPrayers[cpIdx];
      wasComplete = isComplete(cpEntry);
      cpEntry[prayer] = (val === true);
      nowComplete = isComplete(cpEntry);

      if (!data.qazaHistory) data.qazaHistory = {};
      if (nowComplete) {
        data.qazaHistory[ds] = { fajr: true, dhuhr: true, asr: true, maghrib: true, isha: true };
        self.logActivity('complete', null, ds);
      } else {
        data.qazaHistory[ds] = Object.assign({}, cpEntry);
        delete data.qazaHistory[ds].date;
      }
    } else {
      if (!data.qazaHistory[ds]) data.qazaHistory[ds] = blank();
      var rec = data.qazaHistory[ds];
      wasComplete = isComplete(rec);
      rec[prayer] = (val === true);
      nowComplete = isComplete(rec);

      if (PRAYERS.every(function(p){ return rec[p] === false; })) {
        delete data.qazaHistory[ds];
      } else if (!nowComplete && ds >= (data.currentPrayerStartDate || todayString())) {
        var newCp = Object.assign({ date: ds }, rec);
        data.currentPrayers.push(newCp);
        ensureCurrentPrayersRange(data);
      }
      if (nowComplete && !wasComplete) self.logActivity('complete', null, ds);
    }

    self.logActivity('prayer', prayer, ds, val ? 'check' : 'uncheck');
    self.saveData();
    bump();

    if (nowComplete && !wasComplete) {
      self.showToast("Masha'Allah! Day cleared.");
      var captured = ds;
      clearTimeout(self._advanceTimer);
      self._advanceTimer = setTimeout(function() {
        if (self.activeQazaDate() !== captured) return;
        self.activeQazaDate(self.computeCursor());
        self.loadYesterdayPrayers();
        bump();
      }, ADVANCE_DELAY);
    }
  }

  self.goToday = function() { self.activeTab('today'); };
  self.goQaza = function() { self.activeTab('qaza'); };
  self.goHistory = function() { self.activeTab('history'); };
  self.goProgress = function() { self.activeTab('progress'); };

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
    self.loadTodayPrayers();
    bump();
    self.showToast('Current prayer start date updated.');

    if (self._currentPrayerDateSheet) self._currentPrayerDateSheet.hide();
    if (self._settingsSheet) self._settingsSheet.show();
  };

  // 2. Qaza Start Prayer Date
  self.saveQazaStartDate = function() {
    var data = self.data();
    var newStart = self.pendingStartDate();
    var yesterday = shiftDate(todayString(), -1);
    if (!newStart) {
      self.showToast('Please select a valid date.');
      return;
    }
    if (newStart > yesterday) {
      self.showToast('Start date cannot be after yesterday.');
      return;
    }

    if (newStart !== data.qazaStartDate) {
      if (!confirm('Change Qaza start date to ' + formatNiceDate(newStart) + '? This will recalculate your Qaza target.')) {
        return;
      }
      data.qazaStartDate = newStart;
      self.logActivity('setting', 'qaza', newStart, 'qaza_start_date');
      self.activeQazaDate(self.computeCursor());
      self.loadYesterdayPrayers();
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
    var missingEl = document.getElementById('missingPrayersSheet') || document.getElementById('missingSheet');
    if (missingEl) {
      self._missingPrayersSheet = bootstrap.Offcanvas.getOrCreateInstance(missingEl);
      self._missingSheet = self._missingPrayersSheet;
    }
    self.loadData();
    self.fetchPrayerTimes();
    self.logDatabaseStats();

    setInterval(function() { self.tick(self.tick()+1); }, 60000);
    setInterval(function() {
      if (checkCurrentDate()) { self.loadTodayPrayers(); self.activeQazaDate(self.computeCursor()); self.loadYesterdayPrayers(); bump(); self.showToast('A new day has begun.'); }
      self.fetchPrayerTimes();
    }, 30*60*1000);
    setInterval(function() {
      if (checkCurrentDate()) { self.loadTodayPrayers(); self.activeQazaDate(self.computeCursor()); self.loadYesterdayPrayers(); bump(); self.fetchPrayerTimes(); self.showToast('A new day has begun.'); }
    }, 30000);
    document.addEventListener('visibilitychange', function() {
      if (!document.hidden && checkCurrentDate()) { self.loadTodayPrayers(); self.activeQazaDate(self.computeCursor()); self.loadYesterdayPrayers(); bump(); self.fetchPrayerTimes(); }
    });
    window.addEventListener('storage', function(e) {
      if (e.key !== STORAGE_KEY) return;
      self.loadData(); self.fetchPrayerTimes();
    });
  };
}

var vm = new AppViewModel();
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
