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
      checked += 1;
      try {
        notified += pollProcessRule_(rule, destinations[rule.destinationId], rules);
      } catch (e) {
        var message = String(e.message || e);
        rule.lastError = message;
        rule.lastCheckedAt = new Date().toISOString();
        storeSaveRules(rules);
        storeAddLog({
          ok: false,
          ruleId: rule.id,
          ruleName: rule.name,
          detail: message,
        });
        errors.push(rule.name + ": " + message);
      }
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

function pollProcessRule_(rule, destination, rules) {
  if (!destination || !destination.url) {
    throw new Error("Slack 宛先が見つかりません。");
  }
  var sheet = sheetsGetSheet(rule.spreadsheetId, rule.sheetName);
  var headerRow = rule.headerRow || 1;
  var lastRow = sheet.getLastRow();
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  rule.lastCheckedAt = new Date().toISOString();
  rule.lastError = "";

  // カーソル欠落時は履歴を流さず、現在の最終行を既読にする。
  if (rule.lastRow == null || isNaN(Number(rule.lastRow))) {
    rule.lastRow = lastRow;
    storeSaveRules(rules);
    return 0;
  }

  var cursor = Number(rule.lastRow);
  if (lastRow <= cursor) {
    if (lastRow < cursor) {
      rule.lastRow = lastRow;
    }
    storeSaveRules(rules);
    return 0;
  }

  var start = Math.max(cursor + 1, headerRow + 1);
  if (start > lastRow) {
    rule.lastRow = lastRow;
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
      _sheetName: sheet.getName(),
      _rowNumber: rowNumber,
    });
    slackSend(destination.url, slackRender(rule.messageTemplate, fields));
    rule.lastRow = rowNumber;
    // 再読込せずメモリ上の rules を書く。送信成功後に進めるので、中断時は at-least-once。
    storeSaveRules(rules);
    sent += 1;
  }
  if (sent > 0) {
    storeAddLog({
      ok: true,
      ruleId: rule.id,
      ruleName: rule.name,
      detail: sent + " 件を通知しました（行 " + start + "–" + rule.lastRow + "）。",
    });
  }
  return sent;
}
