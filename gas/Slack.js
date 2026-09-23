function slackAssertWebhookUrl(url) {
  if (!/^https:\/\/hooks\.slack\.com\//.test(String(url || ""))) {
    throw new Error("Slack Incoming Webhook の URL（https://hooks.slack.com/ ...）を入力してください。");
  }
}

function slackRender(template, fields) {
  var source = String(template || "").trim();
  if (!source) {
    source = Object.keys(fields || {})
      .filter(function (key) {
        return key.charAt(0) !== "_";
      })
      .map(function (key) {
        return key + ": " + (fields[key] == null ? "" : fields[key]);
      })
      .join("\n");
  }
  return source.replace(/\{\{\s*([^}]+)\s*\}\}/g, function (_, rawKey) {
    var key = String(rawKey || "").trim();
    if (!key || !Object.prototype.hasOwnProperty.call(fields, key) || fields[key] == null) {
      return "";
    }
    return String(fields[key]);
  });
}

function slackSend(url, text) {
  slackAssertWebhookUrl(url);
  var body = String(text || "").trim() || "(空の通知)";
  if (body.length > 39000) {
    body = body.slice(0, 39000) + "\n…";
  }
  var response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ text: body }),
    muteHttpExceptions: true,
    followRedirects: false,
  });
  var code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error("Slack への送信に失敗しました (" + code + "): " + response.getContentText());
  }
}

function slackMaskUrl(url) {
  var value = String(url || "");
  if (value.length < 12) {
    return "********";
  }
  return value.slice(0, 24) + "…" + value.slice(-4);
}
