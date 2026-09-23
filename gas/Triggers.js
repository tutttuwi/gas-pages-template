var POLL_HANDLER_ = "checkFormResponses";
var TRIGGER_MINUTES_ = [1, 5, 10, 15, 30, 60];

function triggersListPoll_() {
  return ScriptApp.getProjectTriggers().filter(function (trigger) {
    return trigger.getHandlerFunction() === POLL_HANDLER_;
  });
}

function triggersDeletePoll_() {
  triggersListPoll_().forEach(function (trigger) {
    ScriptApp.deleteTrigger(trigger);
  });
}

function triggersNormalizeMinutes_(everyMinutes) {
  var minutes = Number(everyMinutes);
  if (TRIGGER_MINUTES_.indexOf(minutes) === -1) {
    throw new Error("間隔は 1 / 5 / 10 / 15 / 30 / 60 分のいずれかを指定してください。");
  }
  return minutes;
}

function triggersGetStatus() {
  var existing = triggersListPoll_();
  var settings = storeGetSettings();
  return {
    enabled: existing.length > 0,
    count: existing.length,
    everyMinutes: settings.everyMinutes,
    handler: POLL_HANDLER_,
    allowedMinutes: TRIGGER_MINUTES_.slice(),
  };
}

function triggersSet(enabled, everyMinutes) {
  var minutes = triggersNormalizeMinutes_(everyMinutes);
  triggersDeletePoll_();
  if (enabled) {
    var builder = ScriptApp.newTrigger(POLL_HANDLER_).timeBased();
    if (minutes >= 60) {
      builder.everyHours(Math.round(minutes / 60));
    } else {
      builder.everyMinutes(minutes);
    }
    builder.create();
  }
  storeSaveSettings({ everyMinutes: minutes });
  return triggersGetStatus();
}
