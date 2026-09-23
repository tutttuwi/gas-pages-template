function sheetsParseId(input) {
  var value = String(input || "").trim();
  var fromUrl = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (fromUrl) {
    return fromUrl[1];
  }
  if (/^[a-zA-Z0-9-_]{20,}$/.test(value)) {
    return value;
  }
  throw new Error("スプレッドシートの URL または ID を入力してください。");
}

function sheetsOpen_(spreadsheetId) {
  try {
    return SpreadsheetApp.openById(spreadsheetId);
  } catch (e) {
    throw new Error(
      "スプレッドシートを開けませんでした。URL と共有設定を確認してください。",
    );
  }
}

function sheetsGetSheet(spreadsheetId, sheetName) {
  var spreadsheet = sheetsOpen_(spreadsheetId);
  if (sheetName) {
    var named = spreadsheet.getSheetByName(sheetName);
    if (!named) {
      throw new Error("シート「" + sheetName + "」が見つかりません。");
    }
    return named;
  }
  var first = spreadsheet.getSheets()[0];
  if (!first) {
    throw new Error("スプレッドシートにシートがありません。");
  }
  return first;
}

function sheetsDescribe(spreadsheetUrl) {
  var spreadsheetId = sheetsParseId(spreadsheetUrl);
  var spreadsheet = sheetsOpen_(spreadsheetId);
  return {
    spreadsheetId: spreadsheetId,
    title: spreadsheet.getName(),
    sheets: spreadsheet.getSheets().map(function (sheet) {
      return {
        name: sheet.getName(),
        lastRow: sheet.getLastRow(),
        lastColumn: sheet.getLastColumn(),
      };
    }),
  };
}

function sheetsHeaders(sheet, headerRow, lastColumn) {
  var row = headerRow || 1;
  var columnCount = Math.max(lastColumn || sheet.getLastColumn(), 1);
  var values = sheet.getRange(row, 1, 1, columnCount).getValues()[0];
  var used = {};
  return values.map(function (cell, index) {
    var base = String(cell || "").trim() || "列" + (index + 1);
    var name = base;
    var suffix = 2;
    while (used[name]) {
      name = base + "_" + suffix;
      suffix += 1;
    }
    used[name] = true;
    return name;
  });
}

function sheetsFormatCell(value) {
  if (value === "" || value == null) {
    return "";
  }
  if (
    Object.prototype.toString.call(value) === "[object Date]" &&
    !isNaN(value.getTime())
  ) {
    return Utilities.formatDate(
      value,
      Session.getScriptTimeZone(),
      "yyyy-MM-dd HH:mm:ss",
    );
  }
  return String(value);
}

function sheetsRowToFields(headers, row, extras) {
  var fields = extras ? Object.assign({}, extras) : {};
  headers.forEach(function (header, index) {
    fields[header] = sheetsFormatCell(row[index]);
  });
  return fields;
}

function sheetsDefaultTemplate(headers) {
  var lines = ["**新しい回答**（{{_sourceName}}）"];
  (headers || []).forEach(function (header) {
    lines.push("• " + header + ": {{" + header + "}}");
  });
  return lines.join("\n");
}
