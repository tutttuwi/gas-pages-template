(function () {
  var MOCK_KEY = "gas-pages-form-slack-mock-v1";
  var isLocal = !(window.google && google.script && google.script.run);

  Array.prototype.forEach.call(document.querySelectorAll("[data-local-banner]"), function (el) {
    el.hidden = !isLocal;
  });

  function gasRun(name) {
    var args = Array.prototype.slice.call(arguments, 1);
    return new Promise(function (resolve, reject) {
      if (!isLocal) {
        var runner = google.script.run
          .withSuccessHandler(resolve)
          .withFailureHandler(reject);
        runner[name].apply(runner, args);
        return;
      }
      try {
        resolve(mockRun(name, args));
      } catch (error) {
        reject(error);
      }
    });
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatTime(iso) {
    if (!iso) {
      return "未実行";
    }
    var date = new Date(iso);
    if (isNaN(date.getTime())) {
      return iso;
    }
    return date.toLocaleString("ja-JP");
  }

  function showStatus(root, message, isError) {
    var el = root.querySelector("[data-status]");
    if (!el) {
      return;
    }
    el.hidden = !message;
    el.textContent = message || "";
    el.classList.toggle("is-error", !!isError);
  }

  function setDisabled(root, disabled) {
    Array.prototype.forEach.call(root.querySelectorAll("button, input, select, textarea"), function (el) {
      el.disabled = disabled;
    });
  }

  function maskUrl(url) {
    var value = String(url || "");
    if (value.length < 12) {
      return "********";
    }
    return value.slice(0, 24) + "…" + value.slice(-4);
  }

  function mockState() {
    var empty = {
      destinations: [],
      rules: [],
      logs: [],
      settings: { everyMinutes: 5 },
      triggerEnabled: false,
    };
    var raw = window.localStorage.getItem(MOCK_KEY);
    if (!raw) {
      return empty;
    }
    try {
      return JSON.parse(raw);
    } catch (error) {
      window.localStorage.removeItem(MOCK_KEY);
      return empty;
    }
  }

  function mockSave(state) {
    window.localStorage.setItem(MOCK_KEY, JSON.stringify(state));
  }

  function mockId() {
    return "mock-" + Math.random().toString(36).slice(2, 10);
  }

  function mockPublicDestination(item) {
    return {
      id: item.id,
      name: item.name,
      urlMasked: maskUrl(item.url),
      hasUrl: !!item.url,
    };
  }

  function mockPublicRule(item) {
    return {
      id: item.id,
      name: item.name,
      spreadsheetId: item.spreadsheetId,
      spreadsheetUrl: item.spreadsheetUrl,
      sheetName: item.sheetName,
      headerRow: 1,
      destinationId: item.destinationId,
      messageTemplate: item.messageTemplate,
      enabled: !!item.enabled,
      lastRow: item.lastRow,
      lastCheckedAt: item.lastCheckedAt || "",
      lastError: item.lastError || "",
    };
  }

  function mockDescribe(url) {
    var value = String(url || "").trim();
    var matched = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    var id = matched ? matched[1] : value;
    if (!id) {
      throw new Error("スプレッドシートの URL または ID を入力してください。");
    }
    return {
      spreadsheetId: id,
      title: "ローカルプレビュー",
      sheets: [
        { name: "Form Responses 1", lastRow: 4, lastColumn: 3 },
        { name: "Sheet1", lastRow: 1, lastColumn: 1 },
      ],
    };
  }

  function mockPreview(payload) {
    var headers = ["Timestamp", "氏名", "メール"];
    var template = (payload && payload.messageTemplate) || mockDefaultTemplate(headers);
    var fields = {
      Timestamp: "2026-09-21 16:00:00",
      氏名: "山田 太郎",
      メール: "taro@example.com",
      _ruleName: (payload && payload.ruleName) || "プレビュー",
      _sheetName: (payload && payload.sheetName) || "Form Responses 1",
      _rowNumber: 4,
    };
    return {
      headers: headers,
      suggestedTemplate: mockDefaultTemplate(headers),
      preview: mockRender(template, fields),
      lastRow: 4,
    };
  }

  function mockDefaultTemplate(headers) {
    return ["*新しい回答*（{{_ruleName}}）"].concat(
      headers.map(function (header) {
        return "• " + header + ": {{" + header + "}}";
      }),
    ).join("\n");
  }

  function mockRender(template, fields) {
    return String(template || "").replace(/\{\{\s*([^}]+)\s*\}\}/g, function (_, key) {
      var name = String(key || "").trim();
      return fields[name] == null ? "" : String(fields[name]);
    });
  }

  function mockAssertSlack(url) {
    if (!/^https:\/\/hooks\.slack\.com\//.test(String(url || ""))) {
      throw new Error("Slack Incoming Webhook の URL（https://hooks.slack.com/ ...）を入力してください。");
    }
  }

  function mockRun(name, args) {
    var state = mockState();
    var payload = args[0];
    if (name === "apiGetBootstrap") {
      return {
        destinations: state.destinations.map(mockPublicDestination),
        rules: state.rules.map(mockPublicRule),
        trigger: {
          enabled: state.triggerEnabled,
          count: state.triggerEnabled ? 1 : 0,
          everyMinutes: state.settings.everyMinutes,
          handler: "checkFormResponses",
          allowedMinutes: [1, 5, 10, 15, 30, 60],
        },
        logs: state.logs,
      };
    }
    if (name === "apiDescribeSpreadsheet") {
      return mockDescribe(payload);
    }
    if (name === "apiPreviewTemplate") {
      return mockPreview(payload);
    }
    if (name === "apiSaveDestination") {
      var destName = String((payload && payload.name) || "").trim();
      if (!destName) {
        throw new Error("宛先名を入力してください。");
      }
      var currentDest = state.destinations.filter(function (item) {
        return item.id === payload.id;
      })[0];
      var url = String((payload && payload.url) || "").trim();
      if (url) {
        mockAssertSlack(url);
      } else if (currentDest) {
        url = currentDest.url;
      }
      if (!url) {
        throw new Error("Webhook URL を入力してください。");
      }
      var destination = {
        id: currentDest ? currentDest.id : mockId(),
        name: destName,
        url: url,
      };
      state.destinations = state.destinations.filter(function (item) {
        return item.id !== destination.id;
      }).concat([destination]);
      mockSave(state);
      return mockPublicDestination(destination);
    }
    if (name === "apiDeleteDestination") {
      var destId = args[0];
      if (state.rules.some(function (rule) { return rule.destinationId === destId; })) {
        throw new Error("この宛先を使っている通知ルールがあるため削除できません。");
      }
      state.destinations = state.destinations.filter(function (item) {
        return item.id !== destId;
      });
      mockSave(state);
      return { ok: true };
    }
    if (name === "apiSaveRule") {
      var ruleName = String((payload && payload.name) || "").trim();
      if (!ruleName) {
        throw new Error("ルール名を入力してください。");
      }
      var meta = mockDescribe(payload.spreadsheetUrl);
      var destinationId = String((payload && payload.destinationId) || "");
      if (!state.destinations.some(function (item) { return item.id === destinationId; })) {
        throw new Error("Slack 宛先を選択してください。");
      }
      var currentRule = state.rules.filter(function (item) {
        return item.id === payload.id;
      })[0];
      var sheetName = String((payload && payload.sheetName) || "Form Responses 1");
      var rule = {
        id: currentRule ? currentRule.id : mockId(),
        name: ruleName,
        spreadsheetId: meta.spreadsheetId,
        spreadsheetUrl: payload.spreadsheetUrl,
        sheetName: sheetName,
        destinationId: destinationId,
        messageTemplate: String((payload && payload.messageTemplate) || mockDefaultTemplate(["Timestamp", "氏名", "メール"])),
        enabled: !(payload && payload.enabled === false),
        lastRow: currentRule && currentRule.spreadsheetId === meta.spreadsheetId && currentRule.sheetName === sheetName
          ? currentRule.lastRow
          : 4,
        lastCheckedAt: currentRule ? currentRule.lastCheckedAt : "",
        lastError: "",
      };
      state.rules = state.rules.filter(function (item) {
        return item.id !== rule.id;
      }).concat([rule]);
      mockSave(state);
      return mockPublicRule(rule);
    }
    if (name === "apiDeleteRule") {
      state.rules = state.rules.filter(function (item) {
        return item.id !== args[0];
      });
      mockSave(state);
      return { ok: true };
    }
    if (name === "apiMarkRead") {
      var markRule = state.rules.filter(function (item) {
        return item.id === args[0];
      })[0];
      if (!markRule) {
        throw new Error("ルールが見つかりません。");
      }
      var meta = mockDescribe(markRule.spreadsheetUrl);
      var sheet = meta.sheets.filter(function (item) {
        return item.name === markRule.sheetName;
      })[0] || meta.sheets[0];
      markRule.lastRow = sheet ? sheet.lastRow : 0;
      markRule.lastCheckedAt = new Date().toISOString();
      markRule.lastError = "";
      mockSave(state);
      return mockPublicRule(markRule);
    }
    if (name === "apiTestNotify") {
      var testRule = state.rules.filter(function (item) {
        return item.id === args[0];
      })[0];
      if (!testRule) {
        throw new Error("ルールが見つかりません。");
      }
      state.logs.unshift({
        at: new Date().toISOString(),
        ok: true,
        ruleId: testRule.id,
        ruleName: testRule.name,
        detail: "テスト通知を送信しました。（ローカルモック）",
      });
      mockSave(state);
      return { ok: true };
    }
    if (name === "apiGetTrigger") {
      return mockRun("apiGetBootstrap", []).trigger;
    }
    if (name === "apiSetTrigger") {
      state.triggerEnabled = !!(payload && payload.enabled);
      state.settings.everyMinutes = Number(payload && payload.everyMinutes) || 5;
      mockSave(state);
      return mockRun("apiGetBootstrap", []).trigger;
    }
    if (name === "apiCheckNow") {
      var enabledRules = state.rules.filter(function (rule) { return rule.enabled; });
      state.logs.unshift({
        at: new Date().toISOString(),
        ok: true,
        ruleId: "",
        ruleName: "",
        detail: enabledRules.length
          ? "手動チェック: 新規回答はありませんでした。（ローカルモック）"
          : "手動チェック: 有効なルールがありません。",
      });
      mockSave(state);
      return { ok: true, checked: enabledRules.length, notified: 0, errors: [], manual: true };
    }
    if (name === "apiListLogs") {
      return state.logs;
    }
    if (name === "apiClearLogs") {
      state.logs = [];
      mockSave(state);
      return [];
    }
    throw new Error("未対応の API です: " + name);
  }

  function errorMessage(error) {
    return (error && (error.message || error.details)) || String(error);
  }

  function renderDestinationOptions(select, destinations, selectedId) {
    select.innerHTML = '<option value="">選択してください</option>' + destinations.map(function (item) {
      return '<option value="' + escapeHtml(item.id) + '"' + (item.id === selectedId ? " selected" : "") + ">" + escapeHtml(item.name) + "</option>";
    }).join("");
  }

  function initRulesPage(root) {
    var destForm = root.querySelector("[data-destination-form]");
    var ruleForm = root.querySelector("[data-rule-form]");
    var destList = root.querySelector("[data-destination-list]");
    var ruleList = root.querySelector("[data-rule-list]");
    var preview = root.querySelector("[data-preview]");
    var destHint = root.querySelector("[data-destination-url-hint]");
    var bootstrap = { destinations: [], rules: [] };

    function refresh() {
      return gasRun("apiGetBootstrap").then(function (data) {
        bootstrap = data;
        renderDestinations();
        renderRules();
        renderDestinationOptions(ruleForm.destinationId, data.destinations, ruleForm.destinationId.value);
      });
    }

    function renderDestinations() {
      if (!bootstrap.destinations.length) {
        destList.innerHTML = '<p class="empty-inline">まだ宛先がありません。</p>';
        return;
      }
      destList.innerHTML = '<ul class="item-list">' + bootstrap.destinations.map(function (item) {
        return '<li><div><strong>' + escapeHtml(item.name) + '</strong><span class="meta">' + escapeHtml(item.urlMasked) + '</span></div>' +
          '<div class="row-actions">' +
          '<button type="button" class="btn" data-edit-destination="' + escapeHtml(item.id) + '">編集</button>' +
          '<button type="button" class="btn" data-delete-destination="' + escapeHtml(item.id) + '">削除</button>' +
          "</div></li>";
      }).join("") + "</ul>";
    }

    function renderRules() {
      if (!bootstrap.rules.length) {
        ruleList.innerHTML = '<p class="empty-inline">まだルールがありません。</p>';
        return;
      }
      var destNames = {};
      bootstrap.destinations.forEach(function (item) {
        destNames[item.id] = item.name;
      });
      ruleList.innerHTML = '<ul class="item-list">' + bootstrap.rules.map(function (item) {
        var status = item.enabled ? "有効" : "停止";
        var error = item.lastError ? '<span class="meta is-error">' + escapeHtml(item.lastError) + "</span>" : "";
        return '<li><div><strong>' + escapeHtml(item.name) + "</strong>" +
          '<span class="meta">' + escapeHtml(status) + " / " + escapeHtml(destNames[item.destinationId] || "宛先なし") + " / 最終行 " + escapeHtml(item.lastRow == null ? "-" : item.lastRow) + "</span>" +
          '<span class="meta">最終チェック: ' + escapeHtml(formatTime(item.lastCheckedAt)) + "</span>" + error +
          "</div><div class='row-actions'>" +
          '<button type="button" class="btn" data-edit-rule="' + escapeHtml(item.id) + '">編集</button>' +
          '<button type="button" class="btn" data-test-rule="' + escapeHtml(item.id) + '">テスト通知</button>' +
          '<button type="button" class="btn" data-read-rule="' + escapeHtml(item.id) + '">現在行まで既読</button>' +
          '<button type="button" class="btn" data-delete-rule="' + escapeHtml(item.id) + '">削除</button>' +
          "</div></li>";
      }).join("") + "</ul>";
    }

    function fillSheetSelect(sheets, selected) {
      var list = root.querySelector("#sheet-options");
      list.innerHTML = (sheets || []).map(function (sheet) {
        var name = sheet.name || sheet;
        return '<option value="' + escapeHtml(name) + '"></option>';
      }).join("");
      if (selected) {
        ruleForm.sheetName.value = selected;
      }
    }

    destForm.addEventListener("submit", function (event) {
      event.preventDefault();
      showStatus(root, "", false);
      setDisabled(root, true);
      gasRun("apiSaveDestination", {
        id: destForm.id.value,
        name: destForm.name.value,
        url: destForm.url.value,
      }).then(function () {
        destForm.reset();
        destHint.hidden = true;
        showStatus(root, "宛先を保存しました。", false);
        return refresh();
      }).catch(function (error) {
        showStatus(root, errorMessage(error), true);
      }).then(function () {
        setDisabled(root, false);
      });
    });

    ruleForm.addEventListener("submit", function (event) {
      event.preventDefault();
      showStatus(root, "", false);
      setDisabled(root, true);
      gasRun("apiSaveRule", {
        id: ruleForm.id.value,
        name: ruleForm.name.value,
        destinationId: ruleForm.destinationId.value,
        spreadsheetUrl: ruleForm.spreadsheetUrl.value,
        sheetName: ruleForm.sheetName.value,
        messageTemplate: ruleForm.messageTemplate.value,
        enabled: ruleForm.enabled.checked,
      }).then(function () {
        ruleForm.reset();
        ruleForm.enabled.checked = true;
        preview.hidden = true;
        showStatus(root, "ルールを保存しました。既存行は既読です。", false);
        return refresh();
      }).catch(function (error) {
        showStatus(root, errorMessage(error), true);
      }).then(function () {
        setDisabled(root, false);
      });
    });

    root.addEventListener("click", function (event) {
      var button = event.target.closest("button");
      if (!button) {
        return;
      }
      var action = button.getAttribute("data-action");
      if (action === "reset-destination") {
        destForm.reset();
        destHint.hidden = true;
        return;
      }
      if (action === "reset-rule") {
        ruleForm.reset();
        ruleForm.enabled.checked = true;
        preview.hidden = true;
        return;
      }
      if (action === "load-sheets") {
        showStatus(root, "", false);
        setDisabled(root, true);
        gasRun("apiDescribeSpreadsheet", ruleForm.spreadsheetUrl.value).then(function (meta) {
          fillSheetSelect(meta.sheets, ruleForm.sheetName.value);
          showStatus(root, "シート一覧を読み込みました（" + meta.title + "）。", false);
        }).catch(function (error) {
          showStatus(root, errorMessage(error), true);
        }).then(function () {
          setDisabled(root, false);
        });
        return;
      }
      if (action === "fill-template" || action === "preview-template") {
        showStatus(root, "", false);
        setDisabled(root, true);
        gasRun("apiPreviewTemplate", {
          spreadsheetUrl: ruleForm.spreadsheetUrl.value,
          sheetName: ruleForm.sheetName.value,
          messageTemplate: ruleForm.messageTemplate.value,
          ruleName: ruleForm.name.value || "プレビュー",
        }).then(function (result) {
          if (action === "fill-template" || !ruleForm.messageTemplate.value.trim()) {
            ruleForm.messageTemplate.value = result.suggestedTemplate;
          }
          preview.hidden = false;
          preview.textContent = result.preview;
        }).catch(function (error) {
          showStatus(root, errorMessage(error), true);
        }).then(function () {
          setDisabled(root, false);
        });
        return;
      }

      var editDest = button.getAttribute("data-edit-destination");
      if (editDest) {
        var destination = bootstrap.destinations.filter(function (item) { return item.id === editDest; })[0];
        if (!destination) {
          return;
        }
        destForm.id.value = destination.id;
        destForm.name.value = destination.name;
        destForm.url.value = "";
        destHint.hidden = false;
        destForm.name.focus();
        return;
      }
      var deleteDest = button.getAttribute("data-delete-destination");
      if (deleteDest) {
        if (!window.confirm("この宛先を削除しますか？")) {
          return;
        }
        setDisabled(root, true);
        gasRun("apiDeleteDestination", deleteDest).then(function () {
          showStatus(root, "宛先を削除しました。", false);
          return refresh();
        }).catch(function (error) {
          showStatus(root, errorMessage(error), true);
        }).then(function () {
          setDisabled(root, false);
        });
        return;
      }
      var editRule = button.getAttribute("data-edit-rule");
      if (editRule) {
        var rule = bootstrap.rules.filter(function (item) { return item.id === editRule; })[0];
        if (!rule) {
          return;
        }
        ruleForm.id.value = rule.id;
        ruleForm.name.value = rule.name;
        ruleForm.spreadsheetUrl.value = rule.spreadsheetUrl;
        fillSheetSelect([{ name: rule.sheetName }], rule.sheetName);
        ruleForm.destinationId.value = rule.destinationId;
        ruleForm.messageTemplate.value = rule.messageTemplate;
        ruleForm.enabled.checked = !!rule.enabled;
        gasRun("apiDescribeSpreadsheet", rule.spreadsheetUrl).then(function (meta) {
          fillSheetSelect(meta.sheets, rule.sheetName);
        }).catch(function () {});
        ruleForm.name.focus();
        return;
      }
      var testRule = button.getAttribute("data-test-rule");
      if (testRule) {
        setDisabled(root, true);
        gasRun("apiTestNotify", testRule).then(function () {
          showStatus(root, "テスト通知を送りました。", false);
        }).catch(function (error) {
          showStatus(root, errorMessage(error), true);
        }).then(function () {
          setDisabled(root, false);
        });
        return;
      }
      var readRule = button.getAttribute("data-read-rule");
      if (readRule) {
        setDisabled(root, true);
        gasRun("apiMarkRead", readRule).then(function () {
          showStatus(root, "現在の最終行まで既読にしました。", false);
          return refresh();
        }).catch(function (error) {
          showStatus(root, errorMessage(error), true);
        }).then(function () {
          setDisabled(root, false);
        });
        return;
      }
      var deleteRule = button.getAttribute("data-delete-rule");
      if (deleteRule) {
        if (!window.confirm("このルールを削除しますか？")) {
          return;
        }
        setDisabled(root, true);
        gasRun("apiDeleteRule", deleteRule).then(function () {
          showStatus(root, "ルールを削除しました。", false);
          return refresh();
        }).catch(function (error) {
          showStatus(root, errorMessage(error), true);
        }).then(function () {
          setDisabled(root, false);
        });
      }
    });

    refresh().catch(function (error) {
      showStatus(root, errorMessage(error), true);
    });
  }

  function initTriggerPage(root) {
    var form = root.querySelector("[data-trigger-form]");
    var summary = root.querySelector("[data-trigger-summary]");

    function render(status) {
      form.everyMinutes.innerHTML = (status.allowedMinutes || [5]).map(function (minutes) {
        return '<option value="' + escapeHtml(String(minutes)) + '"' + (Number(status.everyMinutes) === minutes ? " selected" : "") + ">" + escapeHtml(String(minutes)) + "分</option>";
      }).join("");
      form.enabled.checked = !!status.enabled;
      summary.textContent = status.enabled
        ? "現在は " + status.everyMinutes + " 分ごとにチェックしています。"
        : "定期チェックは停止中です。";
    }

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      setDisabled(root, true);
      gasRun("apiSetTrigger", {
        enabled: form.enabled.checked,
        everyMinutes: Number(form.everyMinutes.value),
      }).then(function (status) {
        render(status);
        showStatus(root, status.enabled ? "トリガーを保存しました。" : "定期チェックを停止しました。", false);
      }).catch(function (error) {
        showStatus(root, errorMessage(error), true);
      }).then(function () {
        setDisabled(root, false);
      });
    });

    root.addEventListener("click", function (event) {
      var button = event.target.closest("[data-action='check-now']");
      if (!button) {
        return;
      }
      setDisabled(root, true);
      gasRun("apiCheckNow").then(function (result) {
        var extra = result.errors && result.errors.length ? " / " + result.errors.join(" ") : "";
        showStatus(root, "チェック完了: " + result.checked + " 件中 " + result.notified + " 件通知" + extra, !result.ok);
      }).catch(function (error) {
        showStatus(root, errorMessage(error), true);
      }).then(function () {
        setDisabled(root, false);
      });
    });

    gasRun("apiGetTrigger").then(render).catch(function (error) {
      showStatus(root, errorMessage(error), true);
    });
  }

  function initLogsPage(root) {
    var list = root.querySelector("[data-log-list]");

    function render(logs) {
      if (!logs || !logs.length) {
        list.innerHTML = '<p class="empty-inline">ログはまだありません。</p>';
        return;
      }
      list.innerHTML = '<ul class="item-list">' + logs.map(function (item) {
        return "<li><div><strong>" + (item.ok ? "成功" : "失敗") + "</strong>" +
          '<span class="meta">' + escapeHtml(formatTime(item.at)) + (item.ruleName ? " / " + escapeHtml(item.ruleName) : "") + "</span>" +
          '<span class="meta' + (item.ok ? "" : " is-error") + '">' + escapeHtml(item.detail) + "</span></div></li>";
      }).join("") + "</ul>";
    }

    root.addEventListener("click", function (event) {
      var button = event.target.closest("button");
      if (!button) {
        return;
      }
      if (button.getAttribute("data-action") === "reload-logs") {
        setDisabled(root, true);
        gasRun("apiListLogs").then(render).catch(function (error) {
          showStatus(root, errorMessage(error), true);
        }).then(function () {
          setDisabled(root, false);
        });
        return;
      }
      if (button.getAttribute("data-action") === "clear-logs") {
        if (!window.confirm("ログをすべて消しますか？")) {
          return;
        }
        setDisabled(root, true);
        gasRun("apiClearLogs").then(render).catch(function (error) {
          showStatus(root, errorMessage(error), true);
        }).then(function () {
          setDisabled(root, false);
        });
      }
    });

    gasRun("apiListLogs").then(render).catch(function (error) {
      showStatus(root, errorMessage(error), true);
    });
  }

  document.querySelectorAll("[data-page]").forEach(function (page) {
    if (page.querySelector("[data-destination-form]")) {
      initRulesPage(page);
    }
    if (page.querySelector("[data-trigger-form]")) {
      initTriggerPage(page);
    }
    if (page.querySelector("[data-log-list]")) {
      initLogsPage(page);
    }
  });
})();
