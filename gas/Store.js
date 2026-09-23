var STORE_ID_KEY_ = "fs.spreadsheetId";
var STORE_LOG_LIMIT_ = 40;
var STORE_TITLE_ = "GAS Pages 設定";
var STORE_LEGACY_KEYS_ = ["fs.destinations", "fs.rules", "fs.logs", "fs.settings"];

var STORE_TABLES_ = {
  destinations: {
    name: "宛先",
    headers: ["ID", "名前", "Webhook URL"],
  },
  rules: {
    name: "ルール",
    headers: ["ID", "名前", "宛先ID", "通知文", "有効", "最終チェック", "エラー"],
  },
  sources: {
    name: "監視対象",
    headers: ["ID", "ルールID", "名前", "スプレッドシートID", "スプレッドシートURL", "シート名", "ヘッダー行", "最終行", "最終チェック", "エラー"],
  },
  logs: {
    name: "ログ",
    headers: ["日時", "成功", "ルールID", "ルール名", "内容"],
  },
  settings: {
    name: "設定",
    headers: ["項目", "値"],
  },
};

var storeSpreadsheet_ = null;

function storeNormalizeSource_(source, index, rule) {
  return {
    id: source.id || rule.id + "-src-" + index,
    label: String(source.label || "").trim(),
    spreadsheetId: source.spreadsheetId || "",
    spreadsheetUrl: source.spreadsheetUrl || "",
    sheetName: source.sheetName || "",
    headerRow: source.headerRow || 1,
    lastRow: source.lastRow == null || source.lastRow === "" ? null : Number(source.lastRow),
    lastCheckedAt: source.lastCheckedAt || "",
    lastError: source.lastError || "",
  };
}

function storeNormalizeRule_(rule) {
  var sources;
  if (Array.isArray(rule.sources) && rule.sources.length) {
    sources = rule.sources.map(function (source, index) {
      return storeNormalizeSource_(source, index, rule);
    });
  } else if (rule.spreadsheetId || rule.spreadsheetUrl) {
    sources = [
      storeNormalizeSource_(
        {
          label: rule.name || "",
          spreadsheetId: rule.spreadsheetId,
          spreadsheetUrl: rule.spreadsheetUrl,
          sheetName: rule.sheetName,
          headerRow: rule.headerRow || 1,
          lastRow: rule.lastRow,
          lastCheckedAt: rule.lastCheckedAt || "",
          lastError: rule.lastError || "",
        },
        0,
        rule,
      ),
    ];
  } else {
    sources = [];
  }
  return {
    id: rule.id,
    name: rule.name,
    destinationId: rule.destinationId,
    messageTemplate: rule.messageTemplate || "",
    enabled: !!rule.enabled,
    sources: sources,
    lastCheckedAt: rule.lastCheckedAt || "",
    lastError: rule.lastError || "",
  };
}

function storeCell_(value) {
  if (value == null) {
    return "";
  }
  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }
  var text = String(value);
  if (/^[=+\-@]/.test(text)) {
    return "'" + text;
  }
  return text;
}

function storeText_(row, header) {
  var value = row[header];
  if (value == null) {
    return "";
  }
  return String(value).trim();
}

function storeBool_(value) {
  return value === true || value === "TRUE" || value === "true" || value === "1";
}

function storeOptionalNumber_(value) {
  if (value === "" || value == null) {
    return null;
  }
  var number = Number(value);
  return isNaN(number) ? null : number;
}

function storeSheet_(ss, title) {
  var sheet = ss.getSheetByName(title);
  if (!sheet) {
    sheet = ss.insertSheet(title);
  }
  return sheet;
}

function storeReadTable_(sheet) {
  var values = sheet.getDataRange().getValues();
  if (!values.length || !values[0].length) {
    return [];
  }
  var headers = values[0].map(function (cell) {
    return String(cell || "").trim();
  });
  var rows = [];
  for (var r = 1; r < values.length; r++) {
    var blank = values[r].every(function (cell) {
      return cell === "" || cell == null;
    });
    if (blank) {
      continue;
    }
    var row = {};
    headers.forEach(function (header, index) {
      if (header) {
        row[header] = values[r][index];
      }
    });
    rows.push(row);
  }
  return rows;
}

function storeWriteTable_(sheet, headers, rows) {
  var width = headers.length;
  var values = [headers].concat(rows.map(function (row) {
    return headers.map(function (header) {
      return storeCell_(row[header]);
    });
  }));
  if (sheet.getMaxRows() < values.length) {
    sheet.insertRowsAfter(sheet.getMaxRows(), values.length - sheet.getMaxRows());
  }
  var previousLast = sheet.getLastRow();
  var range = sheet.getRange(1, 1, values.length, width);
  range.setNumberFormat("@");
  range.setValues(values);
  if (sheet.getFrozenRows() !== 1) {
    sheet.setFrozenRows(1);
  }
  var clearWidth = Math.max(width, sheet.getLastColumn());
  if (previousLast > values.length) {
    sheet.getRange(values.length + 1, 1, previousLast - values.length, clearWidth).clearContent();
  }
}

function storeWriteDestinations_(ss, destinations) {
  storeWriteTable_(storeSheet_(ss, STORE_TABLES_.destinations.name), STORE_TABLES_.destinations.headers, destinations.map(function (item) {
    return {
      ID: item.id,
      名前: item.name || "",
      "Webhook URL": item.url || "",
    };
  }));
}

function storeWriteRules_(ss, rules) {
  var normalized = rules.map(storeNormalizeRule_);
  storeWriteTable_(storeSheet_(ss, STORE_TABLES_.rules.name), STORE_TABLES_.rules.headers, normalized.map(function (rule) {
    return {
      ID: rule.id,
      名前: rule.name || "",
      宛先ID: rule.destinationId || "",
      通知文: rule.messageTemplate || "",
      有効: !!rule.enabled,
      最終チェック: rule.lastCheckedAt || "",
      エラー: rule.lastError || "",
    };
  }));
  var sources = [];
  normalized.forEach(function (rule) {
    (rule.sources || []).forEach(function (source) {
      sources.push({
        ID: source.id,
        ルールID: rule.id,
        名前: source.label || "",
        スプレッドシートID: source.spreadsheetId || "",
        スプレッドシートURL: source.spreadsheetUrl || "",
        シート名: source.sheetName || "",
        ヘッダー行: source.headerRow || 1,
        最終行: source.lastRow == null ? "" : source.lastRow,
        最終チェック: source.lastCheckedAt || "",
        エラー: source.lastError || "",
      });
    });
  });
  storeWriteTable_(storeSheet_(ss, STORE_TABLES_.sources.name), STORE_TABLES_.sources.headers, sources);
}

function storeWriteLogs_(ss, logs) {
  storeWriteTable_(storeSheet_(ss, STORE_TABLES_.logs.name), STORE_TABLES_.logs.headers, logs.slice(0, STORE_LOG_LIMIT_).map(function (entry) {
    return {
      日時: entry.at || "",
      成功: !!entry.ok,
      ルールID: entry.ruleId || "",
      ルール名: entry.ruleName || "",
      内容: entry.detail || "",
    };
  }));
}

function storeWriteSettings_(ss, settings) {
  storeWriteTable_(storeSheet_(ss, STORE_TABLES_.settings.name), STORE_TABLES_.settings.headers, [
    { 項目: "everyMinutes", 値: settings.everyMinutes || 5 },
  ]);
}

function storeHasLegacy_() {
  var props = PropertiesService.getScriptProperties();
  return STORE_LEGACY_KEYS_.some(function (key) {
    return props.getProperty(key);
  });
}

function storeLegacyJson_(key, fallback) {
  var raw = PropertiesService.getScriptProperties().getProperty(key);
  if (!raw) {
    return fallback;
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error("これまでの保存データを読み取れなかったため、設定シートへ移せませんでした (" + key + ")。");
  }
}

function storeCreate_() {
  var ss = SpreadsheetApp.create(STORE_TITLE_);
  ss.getSheets()[0].setName(STORE_TABLES_.destinations.name);
  [
    STORE_TABLES_.rules.name,
    STORE_TABLES_.sources.name,
    STORE_TABLES_.logs.name,
    STORE_TABLES_.settings.name,
  ].forEach(function (name) {
    ss.insertSheet(name);
  });
  PropertiesService.getScriptProperties().setProperty(STORE_ID_KEY_, ss.getId());
  storeSpreadsheet_ = ss;
  return ss;
}

function storeMigrate_(ss) {
  var destinations = storeLegacyJson_("fs.destinations", []);
  var rules = storeLegacyJson_("fs.rules", []).map(storeNormalizeRule_);
  var logs = storeLegacyJson_("fs.logs", []);
  var settings = storeLegacyJson_("fs.settings", {});
  storeWriteDestinations_(ss, Array.isArray(destinations) ? destinations : []);
  storeWriteRules_(ss, Array.isArray(rules) ? rules : []);
  storeWriteLogs_(ss, Array.isArray(logs) ? logs : []);
  storeWriteSettings_(ss, {
    everyMinutes: settings.everyMinutes || 5,
  });
  var props = PropertiesService.getScriptProperties();
  STORE_LEGACY_KEYS_.forEach(function (key) {
    props.deleteProperty(key);
  });
}

function storeInitEmpty_(ss) {
  storeWriteDestinations_(ss, []);
  storeWriteRules_(ss, []);
  storeWriteLogs_(ss, []);
  storeWriteSettings_(ss, { everyMinutes: 5 });
}

function storeOpenConfig_(create) {
  if (storeSpreadsheet_) {
    return storeSpreadsheet_;
  }
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(STORE_ID_KEY_);
  if (id) {
    try {
      storeSpreadsheet_ = SpreadsheetApp.openById(id);
    } catch (e) {
      throw new Error("設定用スプレッドシートを開けませんでした。マイドライブの「" + STORE_TITLE_ + "」が削除されていないか確認してください。");
    }
    if (storeHasLegacy_()) {
      storeMigrate_(storeSpreadsheet_);
    }
    return storeSpreadsheet_;
  }
  if (storeHasLegacy_()) {
    var migrated = storeCreate_();
    storeMigrate_(migrated);
    return migrated;
  }
  if (!create) {
    return null;
  }
  var created = storeCreate_();
  storeInitEmpty_(created);
  return created;
}

function storeGetConfigUrl() {
  var ss = storeOpenConfig_(false);
  if (!ss) {
    return "";
  }
  return "https://docs.google.com/spreadsheets/d/" + ss.getId() + "/edit";
}

function storeGetDestinations() {
  var ss = storeOpenConfig_(false);
  if (!ss) {
    return [];
  }
  return storeReadTable_(storeSheet_(ss, STORE_TABLES_.destinations.name)).map(function (row) {
    return {
      id: storeText_(row, "ID"),
      name: storeText_(row, "名前"),
      url: storeText_(row, "Webhook URL"),
    };
  }).filter(function (item) {
    return item.id;
  });
}

function storeSaveDestinations(destinations) {
  storeWriteDestinations_(storeOpenConfig_(true), destinations);
}

function storeReadSources_(ss) {
  return storeReadTable_(storeSheet_(ss, STORE_TABLES_.sources.name)).map(function (row) {
    return {
      id: storeText_(row, "ID"),
      ruleId: storeText_(row, "ルールID"),
      label: storeText_(row, "名前"),
      spreadsheetId: storeText_(row, "スプレッドシートID"),
      spreadsheetUrl: storeText_(row, "スプレッドシートURL"),
      sheetName: storeText_(row, "シート名"),
      headerRow: storeOptionalNumber_(row["ヘッダー行"]) || 1,
      lastRow: storeOptionalNumber_(row["最終行"]),
      lastCheckedAt: storeText_(row, "最終チェック"),
      lastError: storeText_(row, "エラー"),
    };
  }).filter(function (source) {
    return source.id && source.ruleId;
  });
}

function storeGetRules() {
  var ss = storeOpenConfig_(false);
  if (!ss) {
    return [];
  }
  var sources = storeReadSources_(ss);
  return storeReadTable_(storeSheet_(ss, STORE_TABLES_.rules.name)).map(function (row) {
    var id = storeText_(row, "ID");
    return storeNormalizeRule_({
      id: id,
      name: storeText_(row, "名前"),
      destinationId: storeText_(row, "宛先ID"),
      messageTemplate: row["通知文"] == null ? "" : String(row["通知文"]),
      enabled: storeBool_(row["有効"]),
      lastCheckedAt: storeText_(row, "最終チェック"),
      lastError: storeText_(row, "エラー"),
      sources: sources.filter(function (source) {
        return source.ruleId === id;
      }),
    });
  }).filter(function (rule) {
    return rule.id;
  });
}

function storeSaveRules(rules) {
  storeWriteRules_(storeOpenConfig_(true), rules);
}

function storeGetLogs() {
  var ss = storeOpenConfig_(false);
  if (!ss) {
    return [];
  }
  return storeReadTable_(storeSheet_(ss, STORE_TABLES_.logs.name)).map(function (row) {
    return {
      at: storeText_(row, "日時"),
      ok: storeBool_(row["成功"]),
      ruleId: storeText_(row, "ルールID"),
      ruleName: storeText_(row, "ルール名"),
      detail: row["内容"] == null ? "" : String(row["内容"]),
    };
  }).filter(function (entry) {
    return entry.at;
  });
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
  storeWriteLogs_(storeOpenConfig_(true), logs.slice(0, STORE_LOG_LIMIT_));
}

function storeClearLogs() {
  storeWriteLogs_(storeOpenConfig_(true), []);
}

function storeGetSettings() {
  var ss = storeOpenConfig_(false);
  var everyMinutes = 5;
  if (ss) {
    storeReadTable_(storeSheet_(ss, STORE_TABLES_.settings.name)).forEach(function (row) {
      if (storeText_(row, "項目") === "everyMinutes") {
        everyMinutes = storeOptionalNumber_(row["値"]) || 5;
      }
    });
  }
  return {
    everyMinutes: everyMinutes,
  };
}

function storeSaveSettings(settings) {
  storeWriteSettings_(storeOpenConfig_(true), {
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
