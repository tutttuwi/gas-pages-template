function apiGetBootstrap() {
  return {
    destinations: storeGetDestinations().map(apiPublicDestination_),
    rules: storeGetRules().map(apiPublicRule_),
    trigger: triggersGetStatus(),
    logs: storeGetLogs(),
  };
}

function apiPublicDestination_(destination) {
  return {
    id: destination.id,
    name: destination.name,
    urlMasked: slackMaskUrl(destination.url),
    hasUrl: !!destination.url,
  };
}

function apiPublicRule_(rule) {
  return {
    id: rule.id,
    name: rule.name,
    spreadsheetId: rule.spreadsheetId,
    spreadsheetUrl: rule.spreadsheetUrl,
    sheetName: rule.sheetName,
    headerRow: rule.headerRow || 1,
    destinationId: rule.destinationId,
    messageTemplate: rule.messageTemplate || "",
    enabled: !!rule.enabled,
    lastRow: rule.lastRow == null ? null : Number(rule.lastRow),
    lastCheckedAt: rule.lastCheckedAt || "",
    lastError: rule.lastError || "",
  };
}

function apiDescribeSpreadsheet(spreadsheetUrl) {
  return sheetsDescribe(spreadsheetUrl);
}

function apiPreviewTemplate(payload) {
  var spreadsheetUrl = payload && payload.spreadsheetUrl;
  var sheetName = payload && payload.sheetName;
  var template = payload && payload.messageTemplate;
  var meta = sheetsDescribe(spreadsheetUrl);
  var sheet = sheetsGetSheet(meta.spreadsheetId, sheetName || (meta.sheets[0] && meta.sheets[0].name));
  var headerRow = 1;
  var lastRow = sheet.getLastRow();
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var headers = sheetsHeaders(sheet, headerRow, lastColumn);
  var sampleRow = lastRow > headerRow
    ? sheet.getRange(lastRow, 1, 1, lastColumn).getValues()[0]
    : headers.map(function () {
        return "";
      });
  var fields = sheetsRowToFields(headers, sampleRow, {
    _ruleName: (payload && payload.ruleName) || "プレビュー",
    _sheetName: sheet.getName(),
    _rowNumber: Math.max(lastRow, headerRow + 1),
  });
  return {
    headers: headers,
    suggestedTemplate: sheetsDefaultTemplate(headers),
    preview: slackRender(template || sheetsDefaultTemplate(headers), fields),
    lastRow: lastRow,
  };
}

function apiSaveDestination(payload) {
  var name = String((payload && payload.name) || "").trim();
  if (!name) {
    throw new Error("宛先名を入力してください。");
  }
  var url = String((payload && payload.url) || "").trim();
  if (url) {
    slackAssertWebhookUrl(url);
  }
  return withScriptLock_(function () {
    var destinations = storeGetDestinations();
    var current = payload && payload.id
      ? destinations.filter(function (item) {
          return item.id === payload.id;
        })[0]
      : null;
    var savedUrl = url || (current && current.url) || "";
    if (!savedUrl) {
      throw new Error("Webhook URL を入力してください。");
    }
    var destination = {
      id: current ? current.id : storeNewId_(),
      name: name,
      url: savedUrl,
    };
    storeSaveDestinations(storeUpsertById_(destinations, destination));
    return apiPublicDestination_(destination);
  });
}

function apiDeleteDestination(id) {
  return withScriptLock_(function () {
    var inUse = storeGetRules().some(function (rule) {
      return rule.destinationId === id;
    });
    if (inUse) {
      throw new Error("この宛先を使っている通知ルールがあるため削除できません。");
    }
    storeSaveDestinations(
      storeGetDestinations().filter(function (item) {
        return item.id !== id;
      }),
    );
    return { ok: true };
  });
}

function apiSaveRule(payload) {
  var name = String((payload && payload.name) || "").trim();
  if (!name) {
    throw new Error("ルール名を入力してください。");
  }
  var spreadsheetUrl = String((payload && payload.spreadsheetUrl) || "").trim();
  var meta = sheetsDescribe(spreadsheetUrl);
  var sheetName = String((payload && payload.sheetName) || (meta.sheets[0] && meta.sheets[0].name) || "").trim();
  if (!sheetName) {
    throw new Error("シート名を選択してください。");
  }
  var destinationId = String((payload && payload.destinationId) || "").trim();
  if (!storeGetDestinations().some(function (item) {
    return item.id === destinationId;
  })) {
    throw new Error("Slack 宛先を選択してください。");
  }

  var sheet = sheetsGetSheet(meta.spreadsheetId, sheetName);
  var snapshotRow = sheet.getLastRow();
  var template = String((payload && payload.messageTemplate) || "").trim();
  if (template.length > 4000) {
    throw new Error("通知メッセージは 4000 文字以内にしてください。");
  }
  if (!template) {
    template = sheetsDefaultTemplate(sheetsHeaders(sheet, 1, Math.max(sheet.getLastColumn(), 1)));
  }
  return withScriptLock_(function () {
    var lockedRules = storeGetRules();
    var lockedCurrent = payload && payload.id
      ? lockedRules.filter(function (item) {
          return item.id === payload.id;
        })[0]
      : null;
    var lockedDestination = storeGetDestinations().filter(function (item) {
      return item.id === destinationId;
    })[0];
    if (!lockedDestination) {
      throw new Error("Slack 宛先を選択してください。");
    }
    var rule = {
      id: lockedCurrent ? lockedCurrent.id : storeNewId_(),
      name: name,
      spreadsheetId: meta.spreadsheetId,
      spreadsheetUrl: spreadsheetUrl,
      sheetName: sheetName,
      headerRow: 1,
      destinationId: destinationId,
      messageTemplate: template,
      enabled: payload && payload.enabled === false ? false : true,
      lastRow: lockedCurrent && lockedCurrent.spreadsheetId === meta.spreadsheetId && lockedCurrent.sheetName === sheetName
        ? lockedCurrent.lastRow
        : snapshotRow,
      lastCheckedAt: lockedCurrent ? lockedCurrent.lastCheckedAt : "",
      lastError: "",
    };
    storeSaveRules(storeUpsertById_(lockedRules, rule));
    return apiPublicRule_(rule);
  });
}

function apiDeleteRule(id) {
  return withScriptLock_(function () {
    storeSaveRules(
      storeGetRules().filter(function (item) {
        return item.id !== id;
      }),
    );
    return { ok: true };
  });
}

function apiMarkRead(id) {
  return withScriptLock_(function () {
    var rules = storeGetRules();
    var rule = rules.filter(function (item) {
      return item.id === id;
    })[0];
    if (!rule) {
      throw new Error("ルールが見つかりません。");
    }
    var sheet = sheetsGetSheet(rule.spreadsheetId, rule.sheetName);
    rule.lastRow = sheet.getLastRow();
    rule.lastError = "";
    rule.lastCheckedAt = new Date().toISOString();
    storeSaveRules(rules);
    return apiPublicRule_(rule);
  });
}

function apiTestNotify(id) {
  var rule = storeGetRules().filter(function (item) {
    return item.id === id;
  })[0];
  if (!rule) {
    throw new Error("ルールが見つかりません。");
  }
  var destination = storeGetDestinations().filter(function (item) {
    return item.id === rule.destinationId;
  })[0];
  if (!destination) {
    throw new Error("Slack 宛先が見つかりません。");
  }
  var preview = apiPreviewTemplate({
    spreadsheetUrl: rule.spreadsheetUrl,
    sheetName: rule.sheetName,
    messageTemplate: rule.messageTemplate,
    ruleName: rule.name + "（テスト）",
  });
  slackSend(destination.url, "【テスト通知】\n" + preview.preview);
  storeAddLog({
    ok: true,
    ruleId: rule.id,
    ruleName: rule.name,
    detail: "テスト通知を送信しました。",
  });
  return { ok: true };
}

function apiGetTrigger() {
  return triggersGetStatus();
}

function apiSetTrigger(payload) {
  return withScriptLock_(function () {
    return triggersSet(!!(payload && payload.enabled), payload && payload.everyMinutes);
  });
}

function apiCheckNow() {
  var result = pollRunAll_(true);
  if (result.notified === 0 && result.ok) {
    storeAddLog({
      ok: true,
      ruleId: "",
      ruleName: "",
      detail: result.checked
        ? "手動チェック: 新規回答はありませんでした。"
        : "手動チェック: 有効なルールがありません。",
    });
  }
  return result;
}

function apiListLogs() {
  return storeGetLogs();
}

function apiClearLogs() {
  return withScriptLock_(function () {
    storeClearLogs();
    return [];
  });
}
