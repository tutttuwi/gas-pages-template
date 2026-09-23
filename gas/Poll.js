function checkFormResponses() {
  return pollRunAll_(false);
}

function pollRunAll_(manual) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) {
    return { ok: false, checked: 0, notified: 0, errors: ["別のチェックが実行中です。"], manual: !!manual };
  }
  try {
    var destinations = {};
    storeGetDestinations().forEach(function (destination) {
      destinations[destination.id] = destination;
    });
    var rules = storeGetRules();
    var notified = 0;
    var checked = 0;
    var errors = [];
    rules.forEach(function (rule) {
      if (!rule.enabled) {
        return;
      }
      var destination = destinations[rule.destinationId];
      var sources = rule.sources || [];
      if (!destination || !destination.url) {
        checked += 1;
        var missingDestination = "Slack 宛先が見つかりません。";
        rule.lastError = missingDestination;
        rule.lastCheckedAt = new Date().toISOString();
        storeSaveRules(rules);
        storeAddLog({
          ok: false,
          ruleId: rule.id,
          ruleName: rule.name,
          detail: missingDestination,
        });
        errors.push(rule.name + ": " + missingDestination);
        return;
      }
      if (!sources.length) {
        checked += 1;
        var missingSources = "監視対象のスプレッドシートがありません。";
        rule.lastError = missingSources;
        rule.lastCheckedAt = new Date().toISOString();
        storeSaveRules(rules);
        storeAddLog({
          ok: false,
          ruleId: rule.id,
          ruleName: rule.name,
          detail: missingSources,
        });
        errors.push(rule.name + ": " + missingSources);
        return;
      }
      var sourceErrors = [];
      sources.forEach(function (source) {
        checked += 1;
        try {
          notified += pollProcessSource_(rule, source, destination, rules);
        } catch (e) {
          var message = String(e.message || e);
          var label = source.label || source.sheetName || rule.name;
          source.lastError = message;
          source.lastCheckedAt = new Date().toISOString();
          storeSaveRules(rules);
          storeAddLog({
            ok: false,
            ruleId: rule.id,
            ruleName: rule.name + " / " + label,
            detail: message,
          });
          sourceErrors.push(label + ": " + message);
          errors.push(rule.name + " / " + label + ": " + message);
        }
      });
      rule.lastError = sourceErrors.join(" / ");
      rule.lastCheckedAt = new Date().toISOString();
      storeSaveRules(rules);
    });
    return {
      ok: errors.length === 0,
      checked: checked,
      notified: notified,
      errors: errors,
      manual: !!manual,
    };
  } finally {
    lock.releaseLock();
  }
}

function pollProcessSource_(rule, source, destination, rules) {
  var sheet = sheetsGetSheet(source.spreadsheetId, source.sheetName);
  var headerRow = source.headerRow || 1;
  var lastRow = sheet.getLastRow();
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var label = source.label || source.sheetName || rule.name;
  source.lastCheckedAt = new Date().toISOString();
  source.lastError = "";

  // カーソル欠落時は履歴を流さず、現在の最終行を既読にする。
  if (source.lastRow == null || isNaN(Number(source.lastRow))) {
    source.lastRow = lastRow;
    storeSaveRules(rules);
    return 0;
  }

  var cursor = Number(source.lastRow);
  if (lastRow <= cursor) {
    if (lastRow < cursor) {
      source.lastRow = lastRow;
    }
    storeSaveRules(rules);
    return 0;
  }

  var start = Math.max(cursor + 1, headerRow + 1);
  if (start > lastRow) {
    source.lastRow = lastRow;
    storeSaveRules(rules);
    return 0;
  }

  var headers = sheetsHeaders(sheet, headerRow, lastColumn);
  var values = sheet.getRange(start, 1, lastRow - start + 1, lastColumn).getValues();
  var sent = 0;
  for (var i = 0; i < values.length; i++) {
    var rowNumber = start + i;
    var fields = sheetsRowToFields(headers, values[i], {
      _ruleName: rule.name,
      _sourceName: source.label,
      _sheetName: sheet.getName(),
      _rowNumber: rowNumber,
    });
    slackSend(destination.url, slackRender(rule.messageTemplate, fields));
    source.lastRow = rowNumber;
    // 再読込せずメモリ上の rules を書く。送信成功後に進めるので、中断時は at-least-once。
    storeSaveRules(rules);
    sent += 1;
  }
  if (sent > 0) {
    storeAddLog({
      ok: true,
      ruleId: rule.id,
      ruleName: rule.name + " / " + label,
      detail: sent + " 件を通知しました（" + label + " / " + sheet.getName() + "、行 " + start + "–" + source.lastRow + "）。",
    });
  }
  return sent;
}
