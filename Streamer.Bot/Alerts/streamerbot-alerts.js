// == Sound file paths (add your own .mp3/.ogg files to this folder) ==
const ALERT_SOUNDS = {
  sub: "sub.mp3",
  resub: "resub.mp3",
  cheer: "cheer.mp3",
  donation: "donation.mp3",
  raid: "raid.mp3",
  subgift: "subgift.mp3",
  communitygift: "communitygift.mp3"
};

(function () {
  const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()_+";
  const TYPE_CLASSES = [
    "type-sub",
    "type-resub",
    "type-cheer",
    "type-donation",
    "type-raid",
    "type-subgift",
    "type-communitygift"
  ];

  const DEFAULT_DURATIONS = {
    sub: 4500,
    resub: 4500,
    cheer: 9000,
    donation: 9000,
    raid: 6000,
    subgift: 5000,
    communitygift: 5000
  };

  const root = document.getElementById("alert-root");
  const prefixText = document.getElementById("prefix-text");
  const secondaryText = document.getElementById("secondary-text");
  const nameText = document.getElementById("name-text");
  const dataBlock = document.getElementById("data-block");
  const dataLabel = document.getElementById("data-label");
  const dataValue = document.getElementById("data-value");
  const dataUnit = document.getElementById("data-unit");
  const messageFeed = document.getElementById("message-feed");
  const feedLabel = document.getElementById("feed-label");
  const tickerItem = document.getElementById("ticker-item");
  const msgFallback = document.getElementById("msg-fallback");
  const statusLeft = document.getElementById("status-left");
  const statusMiddle = document.getElementById("status-middle");
  const statusRight = document.getElementById("status-right");
  const hashValue = document.getElementById("hash-value");

  const queue = [];
  const activeIntervals = [];
  const activeTimeouts = [];
  const recentIds = new Map();
  const RECENT_ID_TTL_MS = 15000;
  let currentJitterInterval = null;
  let playing = false;
  let wsClient = null;
  let wsReconnectTimer = null;
  let wsManualStop = false;
  let sbClient = null;
  let sbConfig = {
    enabled: true,
    host: "127.0.0.1",
    port: 8080,
    endpoint: "/",
    password: "",
    subscribe: "*"
  };
  let wsConfig = {
    enabled: false,
    url: "",
    reconnectMs: 3000,
    retry: true
  };

  function addInterval(id) {
    activeIntervals.push(id);
    return id;
  }

  function addTimeout(id) {
    activeTimeouts.push(id);
    return id;
  }

  function clearAllTimers() {
    while (activeIntervals.length) {
      clearInterval(activeIntervals.pop());
    }
    while (activeTimeouts.length) {
      clearTimeout(activeTimeouts.pop());
    }
    if (currentJitterInterval) {
      clearInterval(currentJitterInterval);
      currentJitterInterval = null;
    }
  }

  function generateAuthHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) {
      hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
    }
    return (hash >>> 0).toString(16).toUpperCase().padStart(8, "0");
  }

  function normalizeType(rawType) {
    const value = String(rawType || "").trim().toLowerCase();
    if (value === "tip") return "donation";
    if (value === "community" || value === "community-gift" || value === "communitygift") return "communitygift";
    if (value === "sub-gift" || value === "gift" || value === "subgift") return "subgift";
    return value;
  }

  function asNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function normalizePayload(input) {
    const payload = input && typeof input === "object" ? input : {};
    const type = normalizeType(payload.type);
    if (!DEFAULT_DURATIONS[type]) {
      return null;
    }

    return {
      id: payload.id || String(Date.now()),
      type,
      name: String(payload.name || "UNKNOWN_USER"),
      sender: String(payload.sender || payload.name || "UNKNOWN_USER"),
      recipient: String(payload.recipient || payload.target || payload.name || "UNKNOWN_USER"),
      amount: asNumber(payload.amount, 0),
      tier: String(payload.tier || "1"),
      senderCount: asNumber(payload.senderCount, asNumber(payload.amount, 1)),
      message: typeof payload.message === "string" ? payload.message : "",
      currencySymbol: String(payload.currencySymbol || "$"),
      durationMs: asNumber(payload.durationMs, DEFAULT_DURATIONS[type])
    };
  }

  function parseBoolean(value, fallback) {
    if (value === undefined || value === null || value === "") {
      return fallback;
    }
    const normalized = String(value).trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
      return true;
    }
    if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
      return false;
    }
    return fallback;
  }

  function extractPayloadFromMessage(eventData) {
    if (!eventData || typeof eventData !== "object") {
      return null;
    }

    if (eventData.source === "streamerbot" && eventData.payload) {
      return normalizePayload(eventData.payload);
    }

    if (eventData.event === "streamerbot-alert" && eventData.payload) {
      return normalizePayload(eventData.payload);
    }

    if (eventData.type && DEFAULT_DURATIONS[normalizeType(eventData.type)]) {
      return normalizePayload(eventData);
    }

    return null;
  }

  function decodeBase64Json(input) {
    try {
      return JSON.parse(atob(input));
    } catch (error) {
      return null;
    }
  }

  function parsePayloadFromUrl() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("type") && !params.has("payload") && !params.has("payload64")) {
      return null;
    }

    if (params.has("payload64")) {
      const decoded = decodeBase64Json(params.get("payload64") || "");
      return normalizePayload(decoded);
    }

    if (params.has("payload")) {
      try {
        return normalizePayload(JSON.parse(params.get("payload") || "{}"));
      } catch (error) {
        return null;
      }
    }

    return normalizePayload({
      type: params.get("type"),
      name: params.get("name"),
      sender: params.get("sender"),
      recipient: params.get("recipient"),
      amount: params.get("amount"),
      senderCount: params.get("senderCount"),
      tier: params.get("tier"),
      message: params.get("message"),
      currencySymbol: params.get("currencySymbol"),
      durationMs: params.get("durationMs"),
      id: params.get("id")
    });
  }

  function parseWsConfigFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const url = params.get("wsUrl") || params.get("ws") || "";
    return {
      enabled: parseBoolean(params.get("wsEnabled") || params.get("wsAuto"), Boolean(url)),
      url: url,
      reconnectMs: Math.max(500, asNumber(params.get("wsReconnectMs"), 3000)),
      retry: parseBoolean(params.get("wsRetry"), true)
    };
  }

  function parseSbConfigFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const host = params.get("sbHost") || "127.0.0.1";
    const endpoint = params.get("sbEndpoint") || "/";
    return {
      enabled: parseBoolean(params.get("sbEnabled"), true),
      host: host,
      port: Math.max(1, asNumber(params.get("sbPort"), 8080)),
      endpoint: endpoint,
      password: params.get("sbPassword") || "",
      subscribe: params.get("sbSubscribe") || "*"
    };
  }

  function getValueByPath(obj, path) {
    if (!obj || !path) {
      return undefined;
    }
    const parts = String(path).split(".");
    let current = obj;
    for (let i = 0; i < parts.length; i += 1) {
      if (current && Object.prototype.hasOwnProperty.call(current, parts[i])) {
        current = current[parts[i]];
      } else {
        return undefined;
      }
    }
    return current;
  }

  function firstDefined(obj, keys, fallback) {
    for (let i = 0; i < keys.length; i += 1) {
      const value = getValueByPath(obj, keys[i]);
      if (value !== undefined && value !== null && value !== "") {
        return value;
      }
    }
    return fallback;
  }

  function mapStreamerBotEventToPayload(raw) {
    const eventInfo = raw && raw.event ? raw.event : null;
    const data = raw && raw.data ? raw.data : {};

    if (!eventInfo || !eventInfo.source || !eventInfo.type) {
      return null;
    }

    const source = String(eventInfo.source);
    const eventType = String(eventInfo.type);
    const rawId = firstDefined(raw, ["id", "eventId", "event_id", "data.messageId"], "");
    const id = rawId ? String(rawId) : "";

    if (source === "Twitch") {
      if (eventType === "Sub") {
        return normalizePayload({
          id,
          type: "sub",
          name: String(firstDefined(data, ["user.name", "user_name", "displayName", "user"], "UNKNOWN_USER")),
          amount: asNumber(firstDefined(data, ["cumulativeMonths", "months"], 1), 1),
          tier: String(firstDefined(data, ["subTier", "tier", "tierName"], "1")),
          message: String(firstDefined(data, ["message", "text"], ""))
        });
      }

      if (eventType === "ReSub") {
        return normalizePayload({
          id,
          type: "resub",
          name: String(firstDefined(data, ["user.name", "user_name", "displayName", "user"], "UNKNOWN_USER")),
          amount: asNumber(firstDefined(data, ["cumulativeMonths", "months"], 1), 1),
          tier: String(firstDefined(data, ["subTier", "tier", "tierName"], "1")),
          message: String(firstDefined(data, ["message", "text"], ""))
        });
      }

      if (eventType === "Cheer") {
        return normalizePayload({
          id,
          type: "cheer",
          name: String(firstDefined(data, ["user.name", "user_name", "displayName", "user"], "UNKNOWN_USER")),
          amount: asNumber(firstDefined(data, ["bits", "amount"], 0), 0),
          message: String(firstDefined(data, ["message", "text"], ""))
        });
      }

      if (eventType === "Raid") {
        return normalizePayload({
          id,
          type: "raid",
          name: String(firstDefined(data, ["from_broadcaster_user_name", "user.name", "displayName", "user"], "UNKNOWN_USER")),
          amount: asNumber(firstDefined(data, ["viewerCount", "viewers", "amount"], 0), 0)
        });
      }

      if (eventType === "GiftSub") {
        const sender = String(firstDefined(data, ["user.name", "sender.name", "displayName", "user"], "UNKNOWN_USER"));
        const recipient = String(firstDefined(data, ["recipient.name", "recipientUserName", "recipient", "target"], "UNKNOWN_USER"));
        return normalizePayload({
          id,
          type: "subgift",
          sender,
          recipient,
          senderCount: asNumber(firstDefined(data, ["totalSubsGifted", "count", "amount"], 1), 1)
        });
      }

      if (eventType === "GiftBomb") {
        return normalizePayload({
          id,
          type: "communitygift",
          sender: String(firstDefined(data, ["user.name", "sender.name", "displayName", "user"], "UNKNOWN_USER")),
          recipient: "COMMUNITY",
          amount: asNumber(firstDefined(data, ["gifts", "amount"], 0), 0),
          senderCount: asNumber(firstDefined(data, ["totalSubsGifted", "gifts", "amount"], 1), 1)
        });
      }
    }

    if (source === "Kofi") {
      if (eventType === "Donation") {
        const currency = String(firstDefined(data, ["currency", "currencySymbol"], "USD"));
        const symbol = currency.length === 1 ? currency : "$";
        return normalizePayload({
          id,
          type: "donation",
          name: String(firstDefined(data, ["from", "user.name", "displayName"], "UNKNOWN_USER")),
          amount: asNumber(firstDefined(data, ["amount"], 0), 0),
          currencySymbol: symbol,
          message: String(firstDefined(data, ["message", "text"], ""))
        });
      }
    }

    return null;
  }

  function cleanupRecentIds() {
    const now = Date.now();
    recentIds.forEach(function (timestamp, key) {
      if (now - timestamp > RECENT_ID_TTL_MS) {
        recentIds.delete(key);
      }
    });
  }

  function shouldDropDuplicate(payload) {
    cleanupRecentIds();
    if (!payload || !payload.id) {
      return false;
    }
    if (recentIds.has(payload.id)) {
      return true;
    }
    recentIds.set(payload.id, Date.now());
    return false;
  }

  function resetUi() {
    clearAllTimers();
    root.classList.add("hidden");
    root.classList.remove(...TYPE_CLASSES);
    root.classList.add("type-sub");

    prefixText.innerHTML = "&gt; ACCESS: GRANTED<span class=\"cursor\">_</span>";
    secondaryText.textContent = "ENCRYPTION: LEVEL_1";
    nameText.textContent = "USER // EVENT_ACTIVE";

    dataBlock.classList.remove("hidden");
    dataLabel.textContent = "UPTIME_RECORD:";
    dataValue.textContent = "000";
    dataValue.classList.remove("hidden");
    dataUnit.textContent = "MONTHS";
    dataUnit.classList.remove("hidden");

    messageFeed.classList.add("hidden");
    messageFeed.setAttribute("aria-hidden", "true");
    feedLabel.textContent = "DATA_PACKET:";
    tickerItem.textContent = "";
    tickerItem.style.display = "inline-block";
    msgFallback.style.display = "none";

    statusLeft.textContent = "SOURCE: NODE";
    statusMiddle.textContent = "STATUS: OK";
    statusMiddle.style.display = "inline";
    statusRight.innerHTML = "AUTH_CODE: <span id=\"hash-value\">--------</span>";
  }

  function applyTypeClass(type) {
    root.classList.remove(...TYPE_CLASSES);
    root.classList.add("type-" + type);
  }

  function scrambleName(targetText) {
    let iteration = 0;
    const intervalId = addInterval(setInterval(function () {
      nameText.textContent = targetText
        .split("")
        .map(function (letter, index) {
          if (index < iteration) {
            return targetText[index];
          }
          return LETTERS[Math.floor(Math.random() * LETTERS.length)];
        })
        .join("");

      if (iteration >= targetText.length) {
        clearInterval(intervalId);
      }
      iteration += 0.5;
    }, 30));
  }

  function animateIntCount(finalCount, tickMs, stepFn, formatter, onComplete) {
    const safeFinal = Math.max(0, Math.floor(finalCount));
    let current = 0;
    const intervalId = addInterval(setInterval(function () {
      if (current >= safeFinal) {
        dataValue.textContent = formatter(safeFinal);
        clearInterval(intervalId);
        if (typeof onComplete === "function") {
          onComplete(safeFinal);
        }
        return;
      }

      current += stepFn(safeFinal);
      if (current > safeFinal) {
        current = safeFinal;
      }
      dataValue.textContent = formatter(current);
    }, tickMs));
  }

  function animateFloatCount(finalCount, currencySymbol) {
    const safeFinal = Math.max(0, Number(finalCount) || 0);
    let current = 0;
    const intervalId = addInterval(setInterval(function () {
      if (current >= safeFinal) {
        dataValue.textContent = currencySymbol + safeFinal.toFixed(2);
        clearInterval(intervalId);
        startDonationJitter(safeFinal, currencySymbol);
        return;
      }

      current += safeFinal / 20;
      if (current > safeFinal) {
        current = safeFinal;
      }
      dataValue.textContent = currencySymbol + current.toFixed(2);
    }, 40));
  }

  function startDonationJitter(finalCount, currencySymbol) {
    const stable = currencySymbol + finalCount.toFixed(2);
    currentJitterInterval = setInterval(function () {
      if (Math.random() > 0.8) {
        dataValue.textContent = "??.??";
        addTimeout(setTimeout(function () {
          dataValue.textContent = stable;
        }, 100));
      }
    }, 2000);
  }

  function startRaidJitter(finalCount) {
    const stable = String(finalCount).padStart(3, "0");
    currentJitterInterval = setInterval(function () {
      if (Math.random() > 0.7) {
        dataValue.textContent = "??";
        dataValue.style.opacity = "0.5";
        addTimeout(setTimeout(function () {
          dataValue.textContent = stable;
          dataValue.style.opacity = "1";
        }, 150));
      }
    }, 1500);
  }

  function setTicker(message, isDonation) {
    messageFeed.classList.remove("hidden");
    messageFeed.setAttribute("aria-hidden", "false");

    if (isDonation) {
      feedLabel.textContent = "COMM_LINK:";
      const trimmed = (message || "").trim();
      if (!trimmed) {
        tickerItem.style.display = "none";
        msgFallback.style.display = "inline-block";
      } else {
        tickerItem.style.display = "inline-block";
        msgFallback.style.display = "none";
        tickerItem.textContent = trimmed;
      }
      return;
    }

    feedLabel.textContent = "DATA_PACKET:";
    tickerItem.style.display = "inline-block";
    msgFallback.style.display = "none";
    tickerItem.textContent = message || "";
  }

  function configureSub(payload) {
    prefixText.innerHTML = "&gt; ACCESS: GRANTED<span class=\"cursor\">_</span>";
    secondaryText.textContent = "ENCRYPTION: LEVEL_" + payload.tier;

    const displayName = payload.name + " // JOINED_THE_CREW";
    nameText.textContent = displayName;
    scrambleName(displayName);

    dataLabel.textContent = "UPTIME_RECORD:";
    dataUnit.textContent = "MONTHS";
    dataValue.classList.remove("hidden");
    dataValue.textContent = "000";
    animateIntCount(payload.amount || 1, 50, function () { return 1; }, function (value) {
      return String(value).padStart(3, "0");
    });

    statusLeft.textContent = "CITIZEN_ID: " + payload.name;
    statusMiddle.style.display = "none";
    statusRight.innerHTML = "AUTH_CODE: <span id=\"hash-value\">" + generateAuthHash(payload.name) + "</span>";
  }

  function configureResub(payload) {
    prefixText.innerHTML = "&gt; RUN: LOYALTY_RENEWAL.SH<span class=\"cursor\">_</span>";
    secondaryText.textContent = "STATUS: VETERAN_UNIT_CONFIRMED";

    const displayName = payload.name + " // UPTIME_EXTENDED";
    nameText.textContent = displayName;
    scrambleName(displayName);

    dataLabel.textContent = "ACCUMULATED_UPTIME:";
    dataUnit.textContent = "MONTHS";
    dataValue.classList.remove("hidden");
    animateIntCount(payload.amount || 1, 40, function (max) {
      return Math.ceil(max / 20);
    }, function (value) {
      return String(value).padStart(3, "0");
    });

    statusLeft.textContent = "ENCRYPTION: TIER_" + payload.tier;
    statusMiddle.textContent = "STABILITY_CHECK: 100%";
    statusMiddle.style.display = "inline";
    statusRight.innerHTML = "AUTH_CODE: <span id=\"hash-value\">" + generateAuthHash(payload.name) + "</span>";
  }

  function configureCheer(payload) {
    prefixText.innerHTML = "&gt; SIGNAL_DETECTED: BIT_STREAM_INBOUND<span class=\"cursor\">_</span>";
    secondaryText.textContent = "ENCRYPTION: PURPLE_PROTOCOL";

    const displayName = payload.name + " // UPLOAD_ACTIVE";
    nameText.textContent = displayName;
    scrambleName(displayName);

    dataLabel.textContent = "BITS_EXTRACTED:";
    dataUnit.classList.add("hidden");
    dataValue.classList.remove("hidden");
    animateIntCount(payload.amount, 40, function (max) {
      return Math.ceil(max / 30);
    }, function (value) {
      return String(value).padStart(3, "0");
    });

    setTicker(payload.message, false);

    statusLeft.textContent = "SOURCE_NODE: " + payload.name;
    statusMiddle.style.display = "none";
    statusRight.innerHTML = "AUTH_CODE: <span id=\"hash-value\">" + generateAuthHash(payload.name) + "</span>";
  }

  function configureDonation(payload) {
    prefixText.innerHTML = "&gt; INCOMING: FINANCIAL_DATA_STREAM<span class=\"cursor\">_</span>";
    secondaryText.textContent = "STATUS: ASSET_INJECTION_VERIFIED";

    const displayName = payload.name + " // TRANSFER_COMPLETE";
    nameText.textContent = displayName;
    scrambleName(displayName);

    dataLabel.textContent = "TOTAL_ASSETS:";
    dataUnit.classList.add("hidden");
    dataValue.classList.remove("hidden");
    animateFloatCount(payload.amount, payload.currencySymbol || "$");

    setTicker(payload.message, true);

    statusLeft.textContent = "SOURCE: ENCRYPTED_WALLET";
    statusMiddle.style.display = "none";
    statusRight.innerHTML = "TXN_HASH: <span id=\"hash-value\">" + generateAuthHash(payload.name) + "</span>";
  }

  function configureRaid(payload) {
    prefixText.innerHTML = "&gt; ALERT: SYSTEM_INTRUSION<span class=\"cursor\">_</span>";
    secondaryText.textContent = "THREAT LEVEL: CRITICAL";

    const displayName = payload.name + " // COMMENCING_RAIDING";
    nameText.textContent = displayName;
    scrambleName(displayName);

    const finalCount = Math.max(0, Math.floor(payload.amount));
    dataLabel.textContent = "INCOMING_SIGNALS:";
    dataUnit.classList.add("hidden");
    dataValue.classList.remove("hidden");
    animateIntCount(finalCount, 40, function (max) {
      return Math.ceil(max / 20);
    }, function (value) {
      return String(value).padStart(3, "0");
    }, function () {
      startRaidJitter(finalCount);
    });

    statusLeft.textContent = "H-SYSTEM: ENHANCED_MODE";
    statusMiddle.style.display = "none";
    statusRight.innerHTML = "RAID_HASH: <span id=\"hash-value\">" + generateAuthHash(payload.name) + "</span>";
  }

  function configureSubGift(payload, isCommunityGift) {
    prefixText.innerHTML = "&gt; INITIATE: DIRECT_CONNECTION_HANDSHAKE<span class=\"cursor\">_</span>";
    secondaryText.textContent = "ENCRYPTION: INDIVIDUAL_HANDSHAKE";

    const displayName = payload.sender + " // RECRUITER_ACTIVE";
    nameText.textContent = displayName;
    scrambleName(displayName);

    dataLabel.textContent = "CONNECTION_ESTABLISHED: " + payload.recipient;
    dataValue.classList.add("hidden");
    dataValue.textContent = "";
    dataUnit.classList.add("hidden");

    statusLeft.innerHTML = "RECRUITER_LEVEL: <span id=\"gift-total\">000</span>";
    statusMiddle.style.display = "none";

    const dualHash = generateAuthHash(payload.sender) + "x" + generateAuthHash(payload.recipient);
    statusRight.innerHTML = "AUTH_ID: <span id=\"hash-value\">" + dualHash + "</span>" + (isCommunityGift ? "" : "_GIFTPASS");

    const giftTotalNode = document.getElementById("gift-total");
    if (giftTotalNode) {
      const stepDivisor = isCommunityGift ? 10 : 20;
      const tick = isCommunityGift ? 50 : 40;
      let total = 0;
      const max = Math.max(1, Math.floor(payload.senderCount));
      const id = addInterval(setInterval(function () {
        if (total >= max) {
          giftTotalNode.textContent = String(max).padStart(3, "0");
          clearInterval(id);
          return;
        }

        total += Math.ceil(max / stepDivisor);
        if (total > max) {
          total = max;
        }
        giftTotalNode.textContent = String(total).padStart(3, "0");
      }, tick));
    }

    dataBlock.classList.remove("hidden");
  }

  function playAlertSound(type) {
    const file = ALERT_SOUNDS[type];
    if (!file) return;
    try {
      const audio = new Audio(file);
      audio.volume = 1.0;
      audio.play().catch(() => {});
    } catch (e) {}
  }

  function renderAlert(payload) {
    applyTypeClass(payload.type);
    playAlertSound(payload.type);

    if (payload.type === "sub") {
      configureSub(payload);
    } else if (payload.type === "resub") {
      configureResub(payload);
    } else if (payload.type === "cheer") {
      configureCheer(payload);
    } else if (payload.type === "donation") {
      configureDonation(payload);
    } else if (payload.type === "raid") {
      configureRaid(payload);
    } else if (payload.type === "subgift") {
      configureSubGift(payload, false);
    } else if (payload.type === "communitygift") {
      configureSubGift(payload, true);
    }
  }

  function playNext() {
    if (playing || queue.length === 0) {
      return;
    }

    playing = true;
    const payload = queue.shift();
    resetUi();
    root.classList.remove("hidden");

    renderAlert(payload);

    addTimeout(setTimeout(function () {
      resetUi();
      playing = false;
      playNext();
    }, Math.max(1200, payload.durationMs)));
  }

  function enqueue(payload) {
    if (!payload) {
      return;
    }
    if (shouldDropDuplicate(payload)) {
      return;
    }
    queue.push(payload);
    playNext();
  }

  function clearWsReconnectTimer() {
    if (wsReconnectTimer) {
      clearTimeout(wsReconnectTimer);
      wsReconnectTimer = null;
    }
  }

  function scheduleWsReconnect() {
    clearWsReconnectTimer();
    if (wsManualStop || !wsConfig.enabled || !wsConfig.url || !wsConfig.retry) {
      return;
    }

    wsReconnectTimer = setTimeout(function () {
      connectWebSocket();
    }, wsConfig.reconnectMs);
  }

  function extractPayloadFromWsData(data) {
    if (typeof data === "string") {
      try {
        return extractPayloadFromMessage(JSON.parse(data));
      } catch (error) {
        return null;
      }
    }

    if (data && typeof data === "object") {
      return extractPayloadFromMessage(data);
    }

    return null;
  }

  function updateWsStatus(status, details) {
    window.streamerBotAlertsWsStatus = {
      status: status,
      details: details || "",
      url: wsConfig.url,
      updatedAt: new Date().toISOString()
    };
  }

  function updateSbStatus(status, details) {
    window.streamerBotAlertsSbStatus = {
      status: status,
      details: details || "",
      host: sbConfig.host,
      port: sbConfig.port,
      endpoint: sbConfig.endpoint,
      updatedAt: new Date().toISOString()
    };
  }

  function stopStreamerBotClient() {
    if (sbClient && typeof sbClient.disconnect === "function") {
      try {
        sbClient.disconnect();
      } catch (error) {
        // Ignore disconnect errors.
      }
    }
    sbClient = null;
    updateSbStatus("stopped", "manual stop");
  }

  function connectStreamerBotClient() {
    if (!sbConfig.enabled) {
      updateSbStatus("disabled", "sb transport disabled");
      return;
    }

    if (typeof window.StreamerbotClient !== "function") {
      updateSbStatus("error", "@streamerbot/client sdk not loaded");
      return;
    }

    if (sbClient) {
      return;
    }

    updateSbStatus("connecting", "opening streamerbot client");

    try {
      sbClient = new window.StreamerbotClient({
        host: sbConfig.host,
        port: sbConfig.port,
        endpoint: sbConfig.endpoint,
        password: sbConfig.password || undefined,
        subscribe: sbConfig.subscribe,
        onConnect: function () {
          updateSbStatus("open", "connected");
        },
        onDisconnect: function () {
          updateSbStatus("closed", "disconnected");
          sbClient = null;
        },
        onError: function (error) {
          updateSbStatus("error", (error && error.message) || "client error");
        },
        onData: function (data) {
          const mapped = mapStreamerBotEventToPayload(data);
          if (mapped) {
            enqueue(mapped);
          }
        }
      });
    } catch (error) {
      sbClient = null;
      updateSbStatus("error", (error && error.message) || "failed to initialize client");
    }
  }

  function stopWebSocket() {
    wsManualStop = true;
    clearWsReconnectTimer();
    if (wsClient) {
      try {
        wsClient.close();
      } catch (error) {
        // Ignore close errors while shutting down.
      }
      wsClient = null;
    }
    updateWsStatus("stopped", "manual stop");
  }

  function connectWebSocket() {
    clearWsReconnectTimer();

    if (!wsConfig.enabled || !wsConfig.url) {
      updateWsStatus("disabled", "ws disabled or missing url");
      return;
    }

    wsManualStop = false;

    if (wsClient && (wsClient.readyState === WebSocket.OPEN || wsClient.readyState === WebSocket.CONNECTING)) {
      return;
    }

    try {
      wsClient = new WebSocket(wsConfig.url);
    } catch (error) {
      updateWsStatus("error", "failed to create websocket");
      scheduleWsReconnect();
      return;
    }

    updateWsStatus("connecting", "opening websocket connection");

    wsClient.addEventListener("open", function () {
      updateWsStatus("open", "connected");
    });

    wsClient.addEventListener("message", function (event) {
      const payload = extractPayloadFromWsData(event.data);
      if (payload) {
        enqueue(payload);
      }
    });

    wsClient.addEventListener("close", function () {
      updateWsStatus("closed", "connection closed");
      wsClient = null;
      if (!wsManualStop) {
        scheduleWsReconnect();
      }
    });

    wsClient.addEventListener("error", function () {
      updateWsStatus("error", "socket error");
      if (wsClient && wsClient.readyState !== WebSocket.OPEN) {
        try {
          wsClient.close();
        } catch (error) {
          // Ignore close-on-error failures.
        }
      }
    });
  }

  window.addEventListener("message", function (event) {
    const normalized = extractPayloadFromMessage(event.data);
    if (!normalized) {
      return;
    }
    enqueue(normalized);
  });

  // Convenience function for Streamer.Bot Execute JavaScript and local testing.
  window.triggerAlert = function (payload) {
    enqueue(normalizePayload(payload));
  };

  // Optional helper to test queue behavior quickly in a browser.
  window.triggerAlertBatch = function (payloads) {
    if (!Array.isArray(payloads)) {
      return;
    }
    payloads.forEach(function (payload) {
      enqueue(normalizePayload(payload));
    });
  };

  // Runtime control hooks for websocket transport.
  window.configureAlertWebSocket = function (config) {
    const cfg = config && typeof config === "object" ? config : {};
    wsConfig = {
      enabled: parseBoolean(cfg.enabled, wsConfig.enabled),
      url: String(cfg.url || wsConfig.url || ""),
      reconnectMs: Math.max(500, asNumber(cfg.reconnectMs, wsConfig.reconnectMs)),
      retry: parseBoolean(cfg.retry, wsConfig.retry)
    };

    if (cfg.autoConnect === true) {
      connectWebSocket();
    }

    return wsConfig;
  };

  window.startAlertWebSocket = function () {
    wsConfig.enabled = true;
    connectWebSocket();
  };

  window.stopAlertWebSocket = function () {
    stopWebSocket();
  };

  window.configureStreamerBotClient = function (config) {
    const cfg = config && typeof config === "object" ? config : {};
    sbConfig = {
      enabled: parseBoolean(cfg.enabled, sbConfig.enabled),
      host: String(cfg.host || sbConfig.host || "127.0.0.1"),
      port: Math.max(1, asNumber(cfg.port, sbConfig.port)),
      endpoint: String(cfg.endpoint || sbConfig.endpoint || "/"),
      password: String(cfg.password || sbConfig.password || ""),
      subscribe: String(cfg.subscribe || sbConfig.subscribe || "*")
    };

    if (cfg.autoConnect === true) {
      stopStreamerBotClient();
      connectStreamerBotClient();
    }

    return sbConfig;
  };

  window.startStreamerBotClient = function () {
    sbConfig.enabled = true;
    connectStreamerBotClient();
  };

  window.stopStreamerBotClient = function () {
    stopStreamerBotClient();
  };

  const startupPayload = parsePayloadFromUrl();
  if (startupPayload) {
    enqueue(startupPayload);
  }

  sbConfig = parseSbConfigFromUrl();
  updateSbStatus("idle", "awaiting startup");
  connectStreamerBotClient();

  wsConfig = parseWsConfigFromUrl();
  updateWsStatus("idle", "awaiting websocket start");
  if (!sbConfig.enabled && wsConfig.enabled && wsConfig.url) {
    connectWebSocket();
  }
})();
