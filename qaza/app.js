(function () {
'use strict';

var STORAGE_KEY = 'namazTrackerData', CITY_KEY = 'namazTrackerCity';
var PRAYERS = ['fajr','dhuhr','asr','maghrib','isha'];
var LABELS = { fajr:'Fajr', dhuhr:'Dhuhr', asr:'Asr', maghrib:'Maghrib', isha:'Isha' };
var PRAYER_ICONS = { fajr:'bi-sunrise', dhuhr:'bi-brightness-high', asr:'bi-sun', maghrib:'bi-sunset', isha:'bi-moon-stars' };
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

  self.pendingStartDate = ko.observable('');
  self.pendingCity = ko.observable('');
  self.pendingApiUrl = ko.observable('');
  self.cities = AP_CITIES;

  var initDate = new Date();
  self.calendarYear = ko.observable(initDate.getFullYear());
  self.calendarMonth = ko.observable(initDate.getMonth());

  self._suppressSave = false;
  self._toastTimer = null;
  self._advanceTimer = null;
  self._settingsSheet = null;
  self._calendarSheet = null;
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

  /* ---- Header ---- */
  self.tabTitle = ko.pureComputed(function() { return TITLES[self.activeTab()] || 'Today'; });
  self.showDateInHeader = ko.pureComputed(function() {
    var t = self.activeTab();
    return t === 'today' || t === 'qaza';
  });
  self.headerDateLabel = ko.pureComputed(function() {
    if (self.activeTab() === 'today') {
      var d = self.data();
      return d ? formatShortDate(d.currentPrayers.date) : '';
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
    var timings = self.todayTimings();
    var now = nowMinutes();
    var order = { fajr:0, dhuhr:1, asr:2, maghrib:3, isha:4 };
    var groups = { upcoming: [], missing: [], done: [] };

    PRAYERS.forEach(function(p) {
      var time = timings ? timings[p] : null;
      var chk = data.currentPrayers[p] === true;
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

  /* ---- Qaza groups (ROBUST) ---- */
  self.yesterdayGroups = ko.pureComputed(function() {
    self.version();
    var data = self.data();
    if (!data) return { notComplete: [], complete: [] };
    var ds = self.activeQazaDate();
    var rec = (ds && data.qazaHistory[ds]) || blank();
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

  /* ---- Today's summary for the missing sheet ---- */
  self.todayShortLabel = ko.pureComputed(function() {
    var d = self.data(); return d ? formatShortDate(d.currentPrayers.date) : '';
  });

  self.todaySummary = ko.pureComputed(function() {
    self.tick();
    self.version();
    var data = self.data();
    if (!data) return { passed:0, completed:0, missing:0, upcoming:0 };
    var timings = self.todayTimings();
    var now = nowMinutes();
    var passed = 0, completed = 0, missing = 0, upcoming = 0;
    PRAYERS.forEach(function(p) {
      var time = timings ? timings[p] : null;
      if (time !== null && now >= time) {
        passed++;
        if (data.currentPrayers[p] === true) completed++; else missing++;
      } else upcoming++;
    });
    return { passed: passed, completed: completed, missing: missing, upcoming: upcoming };
  });

  self.qazaStartLabel = ko.pureComputed(function() {
    var d = self.data(); return d ? formatNiceDate(d.qazaStartDate) : '';
  });

  self.missingDaysCount = ko.pureComputed(function() {
    self.version();
    var data = self.data();
    if (!data) return 0;
    var start = data.qazaStartDate, end = shiftDate(todayString(), -1);
    var total = daysBetween(start, end);
    return Math.max(total - (Number(data.stats.completedQazaDays) || 0), 0);
  });

  self.missingPrayersCount = ko.pureComputed(function() {
    return self.missingDaysCount() * 5;
  });

  self.recentMissingDays = ko.pureComputed(function() {
    self.version();
    var data = self.data();
    if (!data) return [];
    var start = data.qazaStartDate;
    var yesterday = shiftDate(todayString(), -1);
    var result = [];
    var d = yesterday;
    var iterations = 0;
    while (d >= start && result.length < 15 && iterations < 120) {
      iterations++;
      var rec = data.qazaHistory[d];
      var done = countDone(rec);
      if (done < 5) {
        result.push({ date: d, dateLabel: formatShortDate(d), done: done, missing: 5 - done });
      }
      d = shiftDate(d, -1);
    }
    return result;
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

  /* ---- Missing sheet opener ---- */
  self.openMissingSheet = function() { self._missingSheet.show(); };

  /* ---- Data ---- */
  self.saveData = function() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(self.data())); } catch (e) {} };

  self.loadData = function() {
    var parsed = null;
    try { var raw = localStorage.getItem(STORAGE_KEY); if (raw) parsed = JSON.parse(raw); } catch (e) {}
    var base = { currentPrayers: Object.assign({ date: todayString() }, blank()), qazaHistory: {}, qazaStartDate: shiftDate(todayString(), -DEFAULT_QAZA_DAYS), stats: { totalQazaDays: 0, completedQazaDays: 0 }, activityLog: [] };
    if (!parsed || typeof parsed !== 'object') { parsed = base; }
    else {
      parsed = {
        currentPrayers: Object.assign(base.currentPrayers, parsed.currentPrayers && typeof parsed.currentPrayers === 'object' ? parsed.currentPrayers : {}),
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
    if (data.currentPrayers && data.currentPrayers.date !== today) {
      var old = data.currentPrayers;
      var anyOn = PRAYERS.some(function(p){ return old[p] === true; });
      var allOn = PRAYERS.every(function(p){ return old[p] === true; });
      if (anyOn && !allOn && old.date && old.date >= data.qazaStartDate) {
        var existing = data.qazaHistory[old.date] || blank();
        PRAYERS.forEach(function(p){ existing[p] = existing[p] || old[p] === true; });
        data.qazaHistory[old.date] = existing;
      }
      data.currentPrayers = Object.assign({ date: today }, blank());
      self.saveData();
      return true;
    }
    return false;
  }

  self.loadTodayPrayers = function() {
    var data = self.data();
    self._suppressSave = true;
    try { PRAYERS.forEach(function(p){ self.todayPrayers[p](!!data.currentPrayers[p]); }); }
    finally { self._suppressSave = false; }
  };

  self.loadYesterdayPrayers = function() {
    var data = self.data();
    var ds = self.activeQazaDate();
    var rec = (ds && data.qazaHistory[ds]) || blank();
    self._suppressSave = true;
    try { PRAYERS.forEach(function(p){ self.yesterdayPrayers[p](!!rec[p]); }); }
    finally { self._suppressSave = false; }
  };

  self.computeCursor = function() {
    var data = self.data(); if (!data) return shiftDate(todayString(), -1);
    var start = data.qazaStartDate;
    var d = shiftDate(todayString(), -1);
    var guard = 0;
    while (d >= start && isComplete(data.qazaHistory[d]) && guard < 20000) { d = shiftDate(d, -1); guard++; }
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
    data.currentPrayers[prayer] = val;
    self.logActivity('prayer', prayer, data.currentPrayers.date, val?'check':'uncheck');
    self.saveData();
    bump();  /* critical: forces all computeds to recompute */
  }

  function onQazaPrayerChange(prayer, val) {
    var data = self.data(); var ds = self.activeQazaDate();
    if (!ds || !data) return;
    if (!data.qazaHistory[ds]) data.qazaHistory[ds] = blank();
    var rec = data.qazaHistory[ds];
    var wasComplete = isComplete(rec);
    rec[prayer] = val;
    var nowComplete = isComplete(rec);
    if (PRAYERS.every(function(p){ return rec[p] === false; })) delete data.qazaHistory[ds];
    self.logActivity('prayer', prayer, ds, val ? 'check' : 'uncheck');
    if (nowComplete && !wasComplete) self.logActivity('complete', null, ds);
    self.saveData();
    bump();

    if (nowComplete && !wasComplete) {
      self.showToast('🎉 MashaAllah! Day cleared.');
      var captured = ds;
      clearTimeout(self._advanceTimer);
      self._advanceTimer = setTimeout(function() {
        if (self.activeQazaDate() !== captured) return;
        if (!isComplete(data.qazaHistory[captured])) return;
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

  /* ---- Settings ---- */
  self.openSettings = function() {
    var data = self.data();
    self.pendingStartDate(data.qazaStartDate);
    self.pendingCity(self._savedCity);
    self.pendingApiUrl(self._savedApiUrl || '');
    self._settingsSheet.show();
  };

  self.saveSettings = function() {
    var data = self.data();
    var newStart = self.pendingStartDate();
    var newCity = self.pendingCity();
    var newApi = (self.pendingApiUrl() || '').trim();
    var yesterday = shiftDate(todayString(), -1);
    var changed = false;

    if (newStart && newStart !== data.qazaStartDate) {
      if (newStart > yesterday) { self.showToast('Start date cannot be after yesterday.'); return; }
      if (!confirm('Change Qaza start date to ' + formatNiceDate(newStart) + '? This will recalculate your Qaza target.')) return;
      data.qazaStartDate = newStart; changed = true;
    }
    if (newCity && newCity !== self._savedCity) { self._savedCity = newCity; self._savedCountry = 'IN'; changed = true; }
    if ((newApi || null) !== self._savedApiUrl) { self._savedApiUrl = newApi || null; changed = true; }

    if (changed) {
      try { localStorage.setItem(CITY_KEY, JSON.stringify({ city: self._savedCity, country: self._savedCountry, apiUrl: self._savedApiUrl })); } catch (e) {}
      self.activeQazaDate(self.computeCursor());
      self.loadYesterdayPrayers();
      self.saveData(); self.fetchPrayerTimes();
      bump();
      self.showToast('Settings saved.');
    }
    self._settingsSheet.hide();
  };

  /* ---- Init ---- */
  self.init = function() {
    self._settingsSheet = bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('settingsSheet'));
    self._calendarSheet = bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('calendarSheet'));
    self._missingSheet = bootstrap.Offcanvas.getOrCreateInstance(document.getElementById('missingSheet'));
    self.loadData();
    self.fetchPrayerTimes();

    setInterval(function() { self.tick(self.tick()+1); }, 60000);
    setInterval(function() {
      if (checkCurrentDate()) { self.loadTodayPrayers(); self.activeQazaDate(self.computeCursor()); self.loadYesterdayPrayers(); bump(); self.showToast('🌅 A new day has begun.'); }
      self.fetchPrayerTimes();
    }, 30*60*1000);
    setInterval(function() {
      if (checkCurrentDate()) { self.loadTodayPrayers(); self.activeQazaDate(self.computeCursor()); self.loadYesterdayPrayers(); bump(); self.fetchPrayerTimes(); self.showToast('🌅 A new day has begun.'); }
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

})();
