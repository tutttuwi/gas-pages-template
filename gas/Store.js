var STORE_KEYS_ = {
  destinations: "fs.destinations",
  rules: "fs.rules",
  logs: "fs.logs",
  settings: "fs.settings",
};

var STORE_LOG_LIMIT_ = 40;

function storeGetJson_(key, fallback) {
  var raw = PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error("保存データの読み込みに失敗しました (" + key + ")。");
  }
}

function storeSetJson_(key, value) {
  var payload = JSON.stringify(value);
  if (payload.length > 8500) {
    throw new Error("保存データが大きすぎます。ルールやログを減らしてください。");
  }
  PropertiesService.getScriptProperties().setProperty(key, payload);
}

function storeGetDestinations() {
  return storeGetJson_(STORE_KEYS_.destinations, []);
}

function storeSaveDestinations(destinations) {
  storeSetJson_(STORE_KEYS_.destinations, destinations);
}

function storeGetRules() {
  return storeGetJson_(STORE_KEYS_.rules, []);
}

function storeSaveRules(rules) {
  storeSetJson_(STORE_KEYS_.rules, rules);
}

function storeUpsertById_(items, item) {
  var found = false;
  var next = items.map(function (current) {
    if (current.id === item.id) {
      found = true;
      return item;
    }
    return current;
  });
  if (!found) {
    next.push(item);
  }
  return next;
}

function storeGetLogs() {
  return storeGetJson_(STORE_KEYS_.logs, []);
}

function storeAddLog(entry) {
  var logs = storeGetLogs();
  logs.unshift({
    at: new Date().toISOString(),
    ok: !!entry.ok,
    ruleId: entry.ruleId || "",
    ruleName: entry.ruleName || "",
    detail: String(entry.detail || ""),
  });
  storeSetJson_(STORE_KEYS_.logs, logs.slice(0, STORE_LOG_LIMIT_));
}

function storeClearLogs() {
  storeSetJson_(STORE_KEYS_.logs, []);
}

function storeGetSettings() {
  var settings = storeGetJson_(STORE_KEYS_.settings, {});
  return {
    everyMinutes: settings.everyMinutes || 5,
  };
}

function storeSaveSettings(settings) {
  storeSetJson_(STORE_KEYS_.settings, {
    everyMinutes: settings.everyMinutes || 5,
  });
}

function storeNewId_() {
  return Utilities.getUuid();
}

function withScriptLock_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    throw new Error("別の処理が実行中です。しばらくしてから再試行してください。");
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}
