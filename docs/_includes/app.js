(function () {
  var MOCK_KEY = "gas-pages-form-slack-mock-v1";
  var isLocal = !(window.google && google.script && google.script.run);

  Array.prototype.forEach.call(
    document.querySelectorAll("[data-local-banner]"),
    function (el) {
      el.hidden = !isLocal;
    },
  );

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

  var activePendingToast = null;

  function toastHost() {
    return document.querySelector("[data-toast-host]");
  }

  function dismissToast(toast) {
    if (!toast) {
      return;
    }
    if (toast._timer) {
      clearTimeout(toast._timer);
    }
    if (activePendingToast === toast) {
      activePendingToast = null;
    }
    toast.remove();
  }

  function paintToast(toast, message, kind) {
    var label = kind === "pending" ? "処理中" : kind === "error" ? "失敗" : "成功";
    toast.className = "toast is-" + kind;
    toast.setAttribute("role", kind === "error" ? "alert" : "status");
    toast.querySelector("[data-toast-label]").textContent = label;
    toast.querySelector("[data-toast-message]").textContent = message;
    if (toast._timer) {
      clearTimeout(toast._timer);
      toast._timer = null;
    }
    if (kind === "success") {
      toast._timer = setTimeout(function () {
        dismissToast(toast);
      }, 4200);
    } else if (kind === "error") {
      toast._timer = setTimeout(function () {
        dismissToast(toast);
      }, 8000);
    }
  }

  function createToast(message, kind) {
    var toast = document.createElement("div");
    toast.innerHTML =
      '<div class="toast-body"><span class="toast-mark" aria-hidden="true"></span><div><p class="toast-label" data-toast-label></p><p class="toast-message" data-toast-message></p></div></div>' +
      '<button type="button" class="toast-close" aria-label="閉じる">×</button>';
    toast.setAttribute("aria-atomic", "true");
    toast.querySelector(".toast-close").addEventListener("click", function () {
      dismissToast(toast);
    });
    paintToast(toast, message, kind);
    toastHost().appendChild(toast);
    return toast;
  }

  function beginPendingToast() {
    if (activePendingToast) {
      return activePendingToast;
    }
    activePendingToast = createToast("処理しています…", "pending");
    return activePendingToast;
  }

  function showStatus(root, message, isError) {
    if (!message) {
      beginPendingToast();
      return;
    }
    var kind = isError ? "error" : "success";
    if (activePendingToast) {
      paintToast(activePendingToast, message, kind);
      activePendingToast = null;
      return;
    }
    createToast(message, kind);
  }

  function setDisabled(root, disabled) {
    Array.prototype.forEach.call(
      root.querySelectorAll("button, input, select, textarea"),
      function (el) {
        el.disabled = disabled;
      },
    );
    if (disabled) {
      beginPendingToast();
      return;
    }
    if (activePendingToast) {
      dismissToast(activePendingToast);
    }
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
      var state = JSON.parse(raw);
      state.rules = (state.rules || []).map(mockNormalizeRule);
      return state;
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

  function mockNormalizeSource(source, index, rule) {
    return {
      id: source.id || rule.id + "-src-" + index,
      label: String(source.label || "").trim(),
      spreadsheetId: source.spreadsheetId || "",
      spreadsheetUrl: source.spreadsheetUrl || "",
      sheetName: source.sheetName || "",
      lastRow:
        source.lastRow == null || source.lastRow === ""
          ? null
          : Number(source.lastRow),
      lastCheckedAt: source.lastCheckedAt || "",
      lastError: source.lastError || "",
    };
  }

  function mockNormalizeRule(rule) {
    var sources;
    if (Array.isArray(rule.sources) && rule.sources.length) {
      sources = rule.sources.map(function (source, index) {
        return mockNormalizeSource(source, index, rule);
      });
    } else if (rule.spreadsheetId || rule.spreadsheetUrl) {
      sources = [
        mockNormalizeSource(
          {
            label: rule.name || "",
            spreadsheetId: rule.spreadsheetId,
            spreadsheetUrl: rule.spreadsheetUrl,
            sheetName: rule.sheetName,
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

  function mockPublicRule(item) {
    return mockNormalizeRule(item);
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
    var template =
      (payload && payload.messageTemplate) || mockDefaultTemplate(headers);
    var fields = {
      Timestamp: "2026-09-21 16:00:00",
      氏名: "山田 太郎",
      メール: "taro@example.com",
      _ruleName: (payload && payload.ruleName) || "プレビュー",
      _sourceName: (payload && payload.sourceName) || "",
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

  function placeholderToken(name) {
    // このファイルは HTML に include される。波括弧を2つ続けると Nunjucks が変数として消す。
    return "{" + "{" + String(name) + "}" + "}";
  }

  function mockDefaultTemplate(headers) {
    return ["**新しい回答**（" + placeholderToken("_sourceName") + "）"]
      .concat(
        headers.map(function (header) {
          return "• " + header + ": " + placeholderToken(header);
        }),
      )
      .join("\n");
  }

  function copyText(text) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "0";
    area.style.left = "0";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.focus();
    area.select();
    var copied = false;
    try {
      copied = document.execCommand("copy");
    } catch (error) {
      copied = false;
    }
    area.remove();
    if (copied) {
      return Promise.resolve();
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return Promise.reject(
      new Error("クリップボードにコピーできませんでした。"),
    );
  }

  function mockPlain(value) {
    return String(value == null ? "" : value).replace(/</g, "<\u200b");
  }

  function mockRender(template, fields) {
    return String(template || "").replace(
      /\{\{\s*([^}]+)\s*\}\}/g,
      function (_, key) {
        var name = String(key || "").trim();
        return fields[name] == null ? "" : mockPlain(fields[name]);
      },
    );
  }

  function mockAssertSlack(url) {
    if (!/^https:\/\/hooks\.slack\.com\//.test(String(url || ""))) {
      throw new Error(
        "Slack Incoming Webhook の URL（https://hooks.slack.com/ ...）を入力してください。",
      );
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
        configUrl: "",
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
      state.destinations = state.destinations
        .filter(function (item) {
          return item.id !== destination.id;
        })
        .concat([destination]);
      mockSave(state);
      return mockPublicDestination(destination);
    }
    if (name === "apiDeleteDestination") {
      var destId = args[0];
      if (
        state.rules.some(function (rule) {
          return rule.destinationId === destId;
        })
      ) {
        throw new Error(
          "この宛先を使っている通知ルールがあるため削除できません。",
        );
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
      var destinationId = String((payload && payload.destinationId) || "");
      if (
        !state.destinations.some(function (item) {
          return item.id === destinationId;
        })
      ) {
        throw new Error("Slack 宛先を選択してください。");
      }
      var rawSources = payload && payload.sources;
      if (!Array.isArray(rawSources) || !rawSources.length) {
        throw new Error(
          "監視対象のスプレッドシートを1件以上追加してください。",
        );
      }
      if (rawSources.length > 20) {
        throw new Error("監視対象は 20 件までです。");
      }
      var currentRule = state.rules.filter(function (item) {
        return item.id === payload.id;
      })[0];
      var seenSources = {};
      var sources = rawSources.map(function (item, index) {
        var label = String((item && item.label) || "").trim();
        if (!label) {
          throw new Error(
            "監視対象 " + (index + 1) + " の名前を入力してください。",
          );
        }
        var meta = mockDescribe(item && item.spreadsheetUrl);
        var sheetName = String((item && item.sheetName) || "").trim();
        if (!sheetName) {
          throw new Error(label + ": シート名を選択してください。");
        }
        var key = meta.spreadsheetId + "\n" + sheetName;
        if (seenSources[key]) {
          throw new Error(
            label + ": 同じスプレッドシートの同じシートが重複しています。",
          );
        }
        seenSources[key] = true;
        var previous =
          currentRule && item.id
            ? currentRule.sources.filter(function (source) {
                return source.id === item.id;
              })[0]
            : null;
        var sameTarget =
          previous &&
          previous.spreadsheetId === meta.spreadsheetId &&
          previous.sheetName === sheetName;
        return {
          id: previous ? previous.id : mockId(),
          label: label,
          spreadsheetId: meta.spreadsheetId,
          spreadsheetUrl: String(item.spreadsheetUrl || "").trim(),
          sheetName: sheetName,
          lastRow: sameTarget ? previous.lastRow : 4,
          lastCheckedAt: sameTarget ? previous.lastCheckedAt || "" : "",
          lastError: "",
        };
      });
      var rule = {
        id: currentRule ? currentRule.id : mockId(),
        name: ruleName,
        destinationId: destinationId,
        messageTemplate: String(
          (payload && payload.messageTemplate) ||
            mockDefaultTemplate(["Timestamp", "氏名", "メール"]),
        ),
        enabled: !(payload && payload.enabled === false),
        sources: sources,
        lastCheckedAt: currentRule ? currentRule.lastCheckedAt : "",
        lastError: "",
      };
      state.rules = state.rules
        .filter(function (item) {
          return item.id !== rule.id;
        })
        .concat([rule]);
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
      if (!markRule.sources.length) {
        throw new Error("監視対象のスプレッドシートがありません。");
      }
      markRule.sources.forEach(function (source) {
        var meta = mockDescribe(source.spreadsheetUrl);
        var sheet =
          meta.sheets.filter(function (item) {
            return item.name === source.sheetName;
          })[0] || meta.sheets[0];
        source.lastRow = sheet ? sheet.lastRow : 0;
        source.lastCheckedAt = new Date().toISOString();
        source.lastError = "";
      });
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
      if (!testRule.sources.length) {
        throw new Error("監視対象のスプレッドシートがありません。");
      }
      testRule.sources.forEach(function (source) {
        state.logs.unshift({
          at: new Date().toISOString(),
          ok: true,
          ruleId: testRule.id,
          ruleName: testRule.name + " / " + source.label,
          detail:
            source.label + " のテスト通知を送信しました。（ローカルモック）",
        });
      });
      mockSave(state);
      return { ok: true, sent: testRule.sources.length };
    }
    if (name === "apiGetTrigger") {
      return mockRun("apiGetBootstrap", []).trigger;
    }
    if (name === "apiSetTrigger") {
      state.triggerEnabled = !!(payload && payload.enabled);
      state.settings.everyMinutes =
        Number(payload && payload.everyMinutes) || 5;
      mockSave(state);
      return mockRun("apiGetBootstrap", []).trigger;
    }
    if (name === "apiCheckNow") {
      var enabledRules = state.rules.filter(function (rule) {
        return rule.enabled;
      });
      var checkedSources = enabledRules.reduce(function (count, rule) {
        return count + ((rule.sources && rule.sources.length) || 0);
      }, 0);
      state.logs.unshift({
        at: new Date().toISOString(),
        ok: true,
        ruleId: "",
        ruleName: "",
        detail: checkedSources
          ? "手動チェック: 新規回答はありませんでした。（ローカルモック）"
          : "手動チェック: 有効なルールがありません。",
      });
      mockSave(state);
      return {
        ok: true,
        checked: checkedSources,
        notified: 0,
        errors: [],
        manual: true,
      };
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
    select.innerHTML =
      '<option value="">選択してください</option>' +
      destinations
        .map(function (item) {
          return (
            '<option value="' +
            escapeHtml(item.id) +
            '"' +
            (item.id === selectedId ? " selected" : "") +
            ">" +
            escapeHtml(item.name) +
            "</option>"
          );
        })
        .join("");
  }

  function initRulesPage(root) {
    var destForm = root.querySelector("[data-destination-form]");
    var ruleForm = root.querySelector("[data-rule-form]");
    var destList = root.querySelector("[data-destination-list]");
    var ruleList = root.querySelector("[data-rule-list]");
    var preview = root.querySelector("[data-preview]");
    var destHint = root.querySelector("[data-destination-url-hint]");
    var placeholderList = root.querySelector("[data-placeholder-list]");
    var placeholderLabel = root.querySelector("[data-placeholder-label]");
    var copyAllPlaceholders = root.querySelector(
      "[data-action='copy-all-placeholders']",
    );
    var bootstrap = { destinations: [], rules: [] };

    function syncDestinationEditor() {
      var editing = !!destForm.id.value;
      var submit = root.querySelector("[data-destination-submit]");
      var reset = root.querySelector("[data-action='reset-destination']");
      submit.textContent = editing ? "変更を保存" : "宛先を保存";
      reset.textContent = editing ? "編集をやめる" : "入力をやり直す";
      destHint.hidden = !editing;
      destHint.textContent = editing
        ? "「" +
          (destForm.name.value || "無題") +
          "」を編集しています。URL を空のまま保存すると、保存済みの値を維持します。"
        : "";
      Array.prototype.forEach.call(
        root.querySelectorAll("[data-destination-id]"),
        function (item) {
          item.classList.toggle(
            "is-editing",
            item.getAttribute("data-destination-id") === destForm.id.value,
          );
        },
      );
    }

    function syncRuleEditor() {
      var editing = !!ruleForm.id.value;
      var banner = root.querySelector("[data-rule-editing]");
      var submit = root.querySelector("[data-rule-submit]");
      var reset = root.querySelector("[data-action='reset-rule']");
      submit.textContent = editing ? "変更を保存" : "ルールを保存";
      reset.textContent = editing ? "編集をやめる" : "入力をやり直す";
      banner.hidden = !editing;
      banner.textContent = editing
        ? "「" +
          (ruleForm.name.value || "無題") +
          "」を編集しています。保存するまで一覧は変わりません。"
        : "";
      Array.prototype.forEach.call(
        root.querySelectorAll("[data-rule-id]"),
        function (item) {
          item.classList.toggle(
            "is-editing",
            item.getAttribute("data-rule-id") === ruleForm.id.value,
          );
        },
      );
    }

    function insertPlaceholder(textarea, token) {
      var value = textarea.value;
      var start = textarea.selectionStart;
      var end = textarea.selectionEnd;
      if (start == null || end == null) {
        start = value.length;
        end = value.length;
      }
      textarea.value = value.slice(0, start) + token + value.slice(end);
      var cursor = start + token.length;
      textarea.focus();
      textarea.selectionStart = cursor;
      textarea.selectionEnd = cursor;
    }

    function refresh() {
      return gasRun("apiGetBootstrap").then(function (data) {
        bootstrap = data;
        renderDestinations();
        renderRules();
        renderConfigLink(data.configUrl);
        renderDestinationOptions(
          ruleForm.destinationId,
          data.destinations,
          ruleForm.destinationId.value,
        );
      });
    }

    function renderConfigLink(configUrl) {
      var el = root.querySelector("[data-config-link]");
      if (!el || isLocal) {
        if (el) {
          el.hidden = true;
        }
        return;
      }
      el.hidden = false;
      if (configUrl) {
        el.innerHTML =
          '設定は <a href="' +
          escapeHtml(configUrl) +
          '" target="_blank" rel="noopener">GAS Pages 設定</a> に保存しています。デプロイしたアカウントのマイドライブにあり、Webhook URL が入るので共有しないでください。';
        return;
      }
      el.textContent =
        "最初の保存で、マイドライブに「GAS Pages 設定」を作ります。Webhook URL が入るので、そのファイルは共有しないでください。";
    }

    function renderDestinations() {
      if (!bootstrap.destinations.length) {
        destList.innerHTML =
          '<p class="empty-inline">まだ宛先がありません。</p>';
        return;
      }
      destList.innerHTML =
        '<ul class="item-list">' +
        bootstrap.destinations
          .map(function (item) {
            var editing = item.id === destForm.id.value ? " is-editing" : "";
            return (
              '<li class="' +
              editing.trim() +
              '" data-destination-id="' +
              escapeHtml(item.id) +
              '"><div><strong>' +
              escapeHtml(item.name) +
              '</strong><span class="meta">' +
              escapeHtml(item.urlMasked) +
              "</span></div>" +
              '<div class="row-actions">' +
              '<button type="button" class="btn" data-edit-destination="' +
              escapeHtml(item.id) +
              '">編集</button>' +
              '<button type="button" class="btn btn-danger" data-delete-destination="' +
              escapeHtml(item.id) +
              '">削除</button>' +
              "</div></li>"
            );
          })
          .join("") +
        "</ul>";
    }

    function renderRules() {
      if (!bootstrap.rules.length) {
        ruleList.innerHTML =
          '<p class="empty-inline">まだルールがありません。</p>';
        return;
      }
      var destNames = {};
      bootstrap.destinations.forEach(function (item) {
        destNames[item.id] = item.name;
      });
      ruleList.innerHTML =
        '<ul class="item-list">' +
        bootstrap.rules
          .map(function (item) {
            var status = item.enabled ? "有効" : "停止";
            var badgeClass = item.enabled ? "badge" : "badge is-off";
            var sources = item.sources || [];
            var sourceHtml = sources.length
              ? '<ul class="source-summary">' +
                sources
                  .map(function (source) {
                    var error = source.lastError
                      ? '<span class="meta is-error">' +
                        escapeHtml(source.lastError) +
                        "</span>"
                      : "";
                    var row = source.lastRow == null ? "-" : source.lastRow;
                    return (
                      '<li title="' +
                      escapeHtml(source.spreadsheetUrl || "") +
                      '"><span>' +
                      escapeHtml(source.label || "（名前なし）") +
                      " → " +
                      escapeHtml(source.sheetName || "（シート未設定）") +
                      "（最終行 " +
                      escapeHtml(row) +
                      "）</span>" +
                      error +
                      "</li>"
                    );
                  })
                  .join("") +
                "</ul>"
              : '<span class="meta">監視対象なし</span>';
            var sourceHasError = sources.some(function (source) {
              return source.lastError;
            });
            var error =
              !sourceHasError && item.lastError
                ? '<span class="meta is-error">' +
                  escapeHtml(item.lastError) +
                  "</span>"
                : "";
            var editing = item.id === ruleForm.id.value ? " is-editing" : "";
            return (
              '<li class="is-stacked' +
              editing +
              '" data-rule-id="' +
              escapeHtml(item.id) +
              '"><div><div class="rule-card-title"><strong>' +
              escapeHtml(item.name) +
              '</strong><span class="' +
              badgeClass +
              '">' +
              escapeHtml(status) +
              "</span></div>" +
              '<span class="meta">' +
              escapeHtml(destNames[item.destinationId] || "宛先なし") +
              " / 監視対象 " +
              escapeHtml(sources.length) +
              " 件</span>" +
              sourceHtml +
              '<span class="meta">最終チェック: ' +
              escapeHtml(formatTime(item.lastCheckedAt)) +
              "</span>" +
              error +
              "</div><div class='row-actions'>" +
              '<button type="button" class="btn" data-edit-rule="' +
              escapeHtml(item.id) +
              '">編集</button>' +
              '<button type="button" class="btn" data-test-rule="' +
              escapeHtml(item.id) +
              '">テスト通知</button>' +
              '<button type="button" class="btn" data-read-rule="' +
              escapeHtml(item.id) +
              '" title="現在の最終行までを通知済みにします">既読にする</button>' +
              '<button type="button" class="btn btn-danger" data-delete-rule="' +
              escapeHtml(item.id) +
              '">削除</button>' +
              "</div></li>"
            );
          })
          .join("") +
        "</ul>";
    }

    var sourceFieldSeq = 0;

    function renderSourceFields(sources) {
      var items = sources && sources.length ? sources : [{}];
      var container = root.querySelector("[data-source-fields]");
      container.innerHTML = items.map(sourceCardHtml).join("");
      updateSourceCards(0);
    }

    function sourceCardHtml(source) {
      sourceFieldSeq += 1;
      var listId = "sheet-options-" + sourceFieldSeq;
      var sheetName = (source && source.sheetName) || "";
      var option = sheetName
        ? '<option value="' + escapeHtml(sheetName) + '"></option>'
        : "";
      return (
        '<div class="source-card" data-source-card role="tabpanel">' +
        '<div class="source-card-head"><span class="hint" data-source-title>監視対象</span>' +
        '<button type="button" class="btn btn-danger" data-action="remove-source">この対象を外す</button></div>' +
        '<input type="hidden" data-source-id value="' +
        escapeHtml((source && source.id) || "") +
        '" />' +
        '<label class="field"><span>名前</span>' +
        '<input data-source-label placeholder="問い合わせフォームA" value="' +
        escapeHtml((source && source.label) || "") +
        '" /></label>' +
        '<label class="field"><span>スプレッドシートの URL または ID</span>' +
        '<input data-source-url placeholder="https://docs.google.com/spreadsheets/d/..." value="' +
        escapeHtml((source && source.spreadsheetUrl) || "") +
        '" /></label>' +
        '<div class="sheet-row"><label class="field"><span>シート</span>' +
        '<input data-source-sheet list="' +
        listId +
        '" placeholder="フォームの回答 1" value="' +
        escapeHtml(sheetName) +
        '" />' +
        '<datalist id="' +
        listId +
        '" data-sheet-options>' +
        option +
        "</datalist></label>" +
        '<button type="button" class="btn" data-action="load-sheets">シートを読み込む</button></div>' +
        "</div>"
      );
    }

    function sourceCards() {
      return root.querySelectorAll("[data-source-card]");
    }

    function sourceTabLabel(card, index) {
      var label = card.querySelector("[data-source-label]").value.trim();
      return label || "監視対象 " + (index + 1);
    }

    function updateSourceCards(activeIndex) {
      var cards = sourceCards();
      var tabs = root.querySelector("[data-source-tabs]");
      var current = activeIndex;
      if (current == null) {
        current = 0;
        Array.prototype.forEach.call(cards, function (card, index) {
          if (!card.hidden) {
            current = index;
          }
        });
      }
      if (current >= cards.length) {
        current = cards.length - 1;
      }
      if (current < 0) {
        current = 0;
      }
      tabs.innerHTML = Array.prototype.map
        .call(cards, function (card, index) {
          var selected = index === current;
          var panelId = "source-panel-" + index;
          card.id = panelId;
          return (
            '<button type="button" class="btn source-tab' +
            (selected ? " is-selected" : "") +
            '" role="tab" id="' +
            panelId +
            '-tab" aria-selected="' +
            (selected ? "true" : "false") +
            '" aria-controls="' +
            panelId +
            '" data-action="select-source" data-source-index="' +
            index +
            '">' +
            escapeHtml(sourceTabLabel(card, index)) +
            "</button>"
          );
        })
        .join("");
      Array.prototype.forEach.call(cards, function (card, index) {
        var selected = index === current;
        card.hidden = !selected;
        card.setAttribute("aria-labelledby", "source-panel-" + index + "-tab");
        card.querySelector("[data-source-title]").textContent = sourceTabLabel(
          card,
          index,
        );
        card.querySelector("[data-action='remove-source']").hidden =
          cards.length < 2;
      });
      var selectedTab = tabs.querySelector('[aria-selected="true"]');
      if (activeIndex != null && selectedTab) {
        selectedTab.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }

    function fillSheetOptions(card, sheets, selected) {
      var list = card.querySelector("[data-sheet-options]");
      list.innerHTML = (sheets || [])
        .map(function (sheet) {
          var name = sheet.name || sheet;
          return '<option value="' + escapeHtml(name) + '"></option>';
        })
        .join("");
      var input = card.querySelector("[data-source-sheet]");
      if (selected) {
        input.value = selected;
      } else if (!input.value && sheets && sheets[0]) {
        input.value = sheets[0].name || sheets[0];
      }
    }

    function collectSources() {
      return Array.prototype.map.call(sourceCards(), function (card) {
        return {
          id: card.querySelector("[data-source-id]").value,
          label: card.querySelector("[data-source-label]").value.trim(),
          spreadsheetUrl: card.querySelector("[data-source-url]").value.trim(),
          sheetName: card.querySelector("[data-source-sheet]").value.trim(),
        };
      });
    }

    function sourceValidationError(sources) {
      if (!sources.length) {
        return {
          index: -1,
          message: "監視対象のスプレッドシートを1件以上追加してください。",
        };
      }
      if (sources.length > 20) {
        return { index: -1, message: "監視対象は 20 件までです。" };
      }
      var seen = {};
      for (var i = 0; i < sources.length; i++) {
        var source = sources[i];
        if (!source.label || !source.spreadsheetUrl || !source.sheetName) {
          return {
            index: i,
            message:
              "監視対象の名前、スプレッドシート、シートをすべて入力してください。",
          };
        }
        var key = source.spreadsheetUrl + "\n" + source.sheetName;
        if (seen[key]) {
          return {
            index: i,
            message: "同じスプレッドシートの同じシートが重複しています。",
          };
        }
        seen[key] = true;
      }
      return null;
    }

    function clearPlaceholders() {
      placeholderList.innerHTML = "";
      placeholderLabel.textContent =
        "列名を取得すると、クリックでメッセージへ挿入できます。";
      copyAllPlaceholders.hidden = true;
    }

    function renderPlaceholders(headers, sourceLabel) {
      var names = (headers || [])
        .map(function (header) {
          return String(header || "").trim();
        })
        .filter(Boolean);
      if (!names.length) {
        clearPlaceholders();
        showStatus(root, "列名が見つかりませんでした。", true);
        return;
      }
      placeholderList.innerHTML = names
        .map(function (name) {
          var token = placeholderToken(name);
          return (
            '<button type="button" class="btn placeholder-chip" data-action="copy-placeholder" data-placeholder="' +
            escapeHtml(token) +
            '">' +
            escapeHtml(token) +
            "</button>"
          );
        })
        .join("");
      placeholderLabel.textContent =
        (sourceLabel ? sourceLabel + " の" : "") +
        "列名です。クリックするとメッセージに挿入します。";
      copyAllPlaceholders.hidden = false;
    }

    function markCopiedPlaceholder(button) {
      Array.prototype.forEach.call(
        placeholderList.querySelectorAll(".is-copied"),
        function (el) {
          el.classList.remove("is-copied");
        },
      );
      if (button) {
        button.classList.add("is-copied");
      }
    }

    function resetRuleForm() {
      ruleForm.reset();
      ruleForm.enabled.checked = true;
      renderSourceFields([]);
      preview.hidden = true;
      clearPlaceholders();
      syncRuleEditor();
    }

    renderSourceFields([]);

    ruleForm.addEventListener("input", function (event) {
      if (event.target.matches("[data-source-label]")) {
        updateSourceCards();
      }
    });

    root
      .querySelector("[data-source-tabs]")
      .addEventListener("keydown", function (event) {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
          return;
        }
        var buttons = root.querySelectorAll(
          "[data-source-tabs] [data-action='select-source']",
        );
        var current = 0;
        Array.prototype.forEach.call(buttons, function (tab, index) {
          if (tab.getAttribute("aria-selected") === "true") {
            current = index;
          }
        });
        var next = event.key === "ArrowRight" ? current + 1 : current - 1;
        if (next < 0) {
          next = buttons.length - 1;
        }
        if (next >= buttons.length) {
          next = 0;
        }
        updateSourceCards(next);
        var selected = root.querySelector(
          "[data-source-tabs] [aria-selected='true']",
        );
        if (selected) {
          selected.focus();
        }
        event.preventDefault();
      });

    destForm.addEventListener("submit", function (event) {
      event.preventDefault();
      showStatus(root, "", false);
      setDisabled(root, true);
      gasRun("apiSaveDestination", {
        id: destForm.id.value,
        name: destForm.name.value,
        url: destForm.url.value,
      })
        .then(function () {
          destForm.reset();
          destHint.hidden = true;
          syncDestinationEditor();
          showStatus(root, "宛先を保存しました。", false);
          return refresh();
        })
        .catch(function (error) {
          showStatus(root, errorMessage(error), true);
        })
        .then(function () {
          setDisabled(root, false);
        });
    });

    ruleForm.addEventListener("submit", function (event) {
      event.preventDefault();
      showStatus(root, "", false);
      var sources = collectSources();
      var validationError = sourceValidationError(sources);
      if (validationError) {
        if (validationError.index >= 0) {
          updateSourceCards(validationError.index);
        }
        showStatus(root, validationError.message, true);
        return;
      }
      setDisabled(root, true);
      gasRun("apiSaveRule", {
        id: ruleForm.id.value,
        name: ruleForm.name.value,
        destinationId: ruleForm.destinationId.value,
        sources: sources,
        messageTemplate: ruleForm.messageTemplate.value,
        enabled: ruleForm.enabled.checked,
      })
        .then(function () {
          resetRuleForm();
          showStatus(
            root,
            "ルールを保存しました。新しく追加した監視対象の既存行は既読です。",
            false,
          );
          return refresh();
        })
        .catch(function (error) {
          showStatus(root, errorMessage(error), true);
        })
        .then(function () {
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
        syncDestinationEditor();
        return;
      }
      if (action === "reset-rule") {
        resetRuleForm();
        return;
      }
      if (action === "add-source") {
        var fields = root.querySelector("[data-source-fields]");
        fields.insertAdjacentHTML("beforeend", sourceCardHtml({}));
        var added = sourceCards();
        updateSourceCards(added.length - 1);
        added[added.length - 1].querySelector("[data-source-label]").focus();
        return;
      }
      if (action === "select-source") {
        updateSourceCards(Number(button.getAttribute("data-source-index")));
        return;
      }
      if (action === "remove-source") {
        var cards = sourceCards();
        if (cards.length < 2) {
          return;
        }
        var card = button.closest("[data-source-card]");
        var index = Array.prototype.indexOf.call(cards, card);
        card.remove();
        updateSourceCards(Math.min(index, sourceCards().length - 1));
        return;
      }
      if (action === "load-sheets") {
        var loadCard = button.closest("[data-source-card]");
        if (!loadCard) {
          return;
        }
        showStatus(root, "", false);
        setDisabled(root, true);
        gasRun(
          "apiDescribeSpreadsheet",
          loadCard.querySelector("[data-source-url]").value,
        )
          .then(function (meta) {
            fillSheetOptions(
              loadCard,
              meta.sheets,
              loadCard.querySelector("[data-source-sheet]").value,
            );
            showStatus(
              root,
              "シート一覧を読み込みました（" + meta.title + "）。",
              false,
            );
          })
          .catch(function (error) {
            showStatus(root, errorMessage(error), true);
          })
          .then(function () {
            setDisabled(root, false);
          });
        return;
      }
      if (action === "load-placeholders") {
        var headerSource = collectSources()[0] || {};
        if (!headerSource.spreadsheetUrl || !headerSource.sheetName) {
          showStatus(
            root,
            "先頭の監視対象にスプレッドシートとシートを入力してください。",
            true,
          );
          return;
        }
        showStatus(root, "", false);
        setDisabled(root, true);
        gasRun("apiPreviewTemplate", {
          spreadsheetUrl: headerSource.spreadsheetUrl,
          sheetName: headerSource.sheetName,
          messageTemplate: ruleForm.messageTemplate.value,
          ruleName: ruleForm.name.value || "プレビュー",
          sourceName: headerSource.label,
        })
          .then(function (result) {
            renderPlaceholders(result.headers, headerSource.label);
            if (placeholderList.children.length) {
              showStatus(root, "列名を読み込みました。", false);
            }
          })
          .catch(function (error) {
            showStatus(root, errorMessage(error), true);
          })
          .then(function () {
            setDisabled(root, false);
          });
        return;
      }
      if (action === "copy-placeholder") {
        var token = button.getAttribute("data-placeholder");
        if (!token) {
          showStatus(root, "先に列名を取得してください。", true);
          return;
        }
        insertPlaceholder(ruleForm.messageTemplate, token);
        markCopiedPlaceholder(button);
        copyText(token)
          .then(function () {
            showStatus(
              root,
              token + " をメッセージに挿入し、コピーしました。",
              false,
            );
          })
          .catch(function () {
            showStatus(root, token + " をメッセージに挿入しました。", false);
          });
        return;
      }
      if (action === "copy-all-placeholders") {
        var tokens = Array.prototype.map
          .call(
            placeholderList.querySelectorAll("[data-placeholder]"),
            function (chip) {
              return chip.getAttribute("data-placeholder");
            },
          )
          .filter(Boolean);
        if (!tokens.length) {
          showStatus(root, "先に列名を取得してください。", true);
          return;
        }
        copyText(tokens.join("\n"))
          .then(function () {
            markCopiedPlaceholder(null);
            showStatus(
              root,
              "すべてのプレースホルダーをコピーしました。",
              false,
            );
          })
          .catch(function (error) {
            showStatus(root, errorMessage(error), true);
          });
        return;
      }
      if (action === "fill-template" || action === "preview-template") {
        var previewSource = collectSources()[0] || {};
        if (!previewSource.spreadsheetUrl || !previewSource.sheetName) {
          showStatus(
            root,
            "先頭の監視対象にスプレッドシートとシートを入力してください。",
            true,
          );
          return;
        }
        showStatus(root, "", false);
        setDisabled(root, true);
        gasRun("apiPreviewTemplate", {
          spreadsheetUrl: previewSource.spreadsheetUrl,
          sheetName: previewSource.sheetName,
          messageTemplate: ruleForm.messageTemplate.value,
          ruleName: ruleForm.name.value || "プレビュー",
          sourceName: previewSource.label,
        })
          .then(function (result) {
            if (
              action === "fill-template" ||
              !ruleForm.messageTemplate.value.trim()
            ) {
              ruleForm.messageTemplate.value = result.suggestedTemplate;
            }
            preview.hidden = false;
            preview.textContent = result.preview;
          })
          .catch(function (error) {
            showStatus(root, errorMessage(error), true);
          })
          .then(function () {
            setDisabled(root, false);
          });
        return;
      }

      var editDest = button.getAttribute("data-edit-destination");
      if (editDest) {
        var destination = bootstrap.destinations.filter(function (item) {
          return item.id === editDest;
        })[0];
        if (!destination) {
          return;
        }
        destForm.id.value = destination.id;
        destForm.name.value = destination.name;
        destForm.url.value = "";
        syncDestinationEditor();
        destForm.scrollIntoView({ behavior: "smooth", block: "start" });
        destForm.name.focus();
        return;
      }
      var deleteDest = button.getAttribute("data-delete-destination");
      if (deleteDest) {
        if (!window.confirm("この宛先を削除しますか？")) {
          return;
        }
        setDisabled(root, true);
        gasRun("apiDeleteDestination", deleteDest)
          .then(function () {
            showStatus(root, "宛先を削除しました。", false);
            return refresh();
          })
          .catch(function (error) {
            showStatus(root, errorMessage(error), true);
          })
          .then(function () {
            setDisabled(root, false);
          });
        return;
      }
      var editRule = button.getAttribute("data-edit-rule");
      if (editRule) {
        var rule = bootstrap.rules.filter(function (item) {
          return item.id === editRule;
        })[0];
        if (!rule) {
          return;
        }
        ruleForm.id.value = rule.id;
        ruleForm.name.value = rule.name;
        ruleForm.destinationId.value = rule.destinationId;
        ruleForm.messageTemplate.value = rule.messageTemplate;
        ruleForm.enabled.checked = !!rule.enabled;
        renderSourceFields(rule.sources);
        preview.hidden = true;
        clearPlaceholders();
        syncRuleEditor();
        Array.prototype.forEach.call(
          root.querySelectorAll("[data-source-card]"),
          function (card) {
            var selectedSheet = card.querySelector("[data-source-sheet]").value;
            gasRun(
              "apiDescribeSpreadsheet",
              card.querySelector("[data-source-url]").value,
            )
              .then(function (meta) {
                fillSheetOptions(card, meta.sheets, selectedSheet);
              })
              .catch(function () {});
          },
        );
        ruleForm.scrollIntoView({ behavior: "smooth", block: "start" });
        ruleForm.name.focus();
        return;
      }
      var testRule = button.getAttribute("data-test-rule");
      if (testRule) {
        var testTarget = bootstrap.rules.filter(function (item) {
          return item.id === testRule;
        })[0];
        var testCount =
          testTarget && testTarget.sources ? testTarget.sources.length : 0;
        if (
          testCount > 1 &&
          !window.confirm(
            "監視対象 " + testCount + " 件へテスト通知を送ります。",
          )
        ) {
          return;
        }
        setDisabled(root, true);
        gasRun("apiTestNotify", testRule)
          .then(function (result) {
            showStatus(
              root,
              result && result.sent > 1
                ? "テスト通知を " + result.sent + " 件送りました。"
                : "テスト通知を送りました。",
              false,
            );
          })
          .catch(function (error) {
            showStatus(root, errorMessage(error), true);
          })
          .then(function () {
            setDisabled(root, false);
          });
        return;
      }
      var readRule = button.getAttribute("data-read-rule");
      if (readRule) {
        setDisabled(root, true);
        gasRun("apiMarkRead", readRule)
          .then(function () {
            showStatus(root, "現在の最終行まで既読にしました。", false);
            return refresh();
          })
          .catch(function (error) {
            showStatus(root, errorMessage(error), true);
          })
          .then(function () {
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
        gasRun("apiDeleteRule", deleteRule)
          .then(function () {
            showStatus(root, "ルールを削除しました。", false);
            return refresh();
          })
          .catch(function (error) {
            showStatus(root, errorMessage(error), true);
          })
          .then(function () {
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
      form.everyMinutes.innerHTML = (status.allowedMinutes || [5])
        .map(function (minutes) {
          return (
            '<option value="' +
            escapeHtml(String(minutes)) +
            '"' +
            (Number(status.everyMinutes) === minutes ? " selected" : "") +
            ">" +
            escapeHtml(String(minutes)) +
            "分</option>"
          );
        })
        .join("");
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
      })
        .then(function (status) {
          render(status);
          showStatus(
            root,
            status.enabled
              ? "トリガーを保存しました。"
              : "定期チェックを停止しました。",
            false,
          );
        })
        .catch(function (error) {
          showStatus(root, errorMessage(error), true);
        })
        .then(function () {
          setDisabled(root, false);
        });
    });

    root.addEventListener("click", function (event) {
      var button = event.target.closest("[data-action='check-now']");
      if (!button) {
        return;
      }
      setDisabled(root, true);
      gasRun("apiCheckNow")
        .then(function (result) {
          var extra =
            result.errors && result.errors.length
              ? " / " + result.errors.join(" ")
              : "";
          showStatus(
            root,
            "チェック完了: " +
              result.checked +
              " 件中 " +
              result.notified +
              " 件通知" +
              extra,
            !result.ok,
          );
        })
        .catch(function (error) {
          showStatus(root, errorMessage(error), true);
        })
        .then(function () {
          setDisabled(root, false);
        });
    });

    gasRun("apiGetTrigger")
      .then(render)
      .catch(function (error) {
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
      list.innerHTML =
        '<ul class="item-list">' +
        logs
          .map(function (item) {
            return (
              "<li><div><strong>" +
              (item.ok ? "成功" : "失敗") +
              "</strong>" +
              '<span class="meta">' +
              escapeHtml(formatTime(item.at)) +
              (item.ruleName ? " / " + escapeHtml(item.ruleName) : "") +
              "</span>" +
              '<span class="meta' +
              (item.ok ? "" : " is-error") +
              '">' +
              escapeHtml(item.detail) +
              "</span></div></li>"
            );
          })
          .join("") +
        "</ul>";
    }

    function loadLogs() {
      return gasRun("apiListLogs")
        .then(render)
        .catch(function (error) {
          showStatus(root, errorMessage(error), true);
        });
    }

    root.addEventListener("click", function (event) {
      var button = event.target.closest("button");
      if (!button) {
        return;
      }
      if (button.getAttribute("data-action") === "reload-logs") {
        setDisabled(root, true);
        loadLogs().then(function () {
          setDisabled(root, false);
        });
        return;
      }
      if (button.getAttribute("data-action") === "clear-logs") {
        if (!window.confirm("ログをすべて消しますか？")) {
          return;
        }
        setDisabled(root, true);
        gasRun("apiClearLogs")
          .then(render)
          .catch(function (error) {
            showStatus(root, errorMessage(error), true);
          })
          .then(function () {
            setDisabled(root, false);
          });
      }
    });

    window.addEventListener("hashchange", function () {
      if (!root.hidden) {
        loadLogs();
      }
    });

    loadLogs();
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
