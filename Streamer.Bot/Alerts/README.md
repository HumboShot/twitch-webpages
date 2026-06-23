# Streamer.Bot Unified Alerts

This folder contains a single browser source alert page that replaces the 7 StreamElements alerts:

- sub
- resub
- cheer
- donation (tip)
- raid
- subgift
- communitygift

## Files

- streamerbot-alerts.html
- streamerbot-alerts.css
- streamerbot-alerts.js

## OBS Browser Source Setup

1. Add a Browser Source in OBS.
2. Point URL/File to streamerbot-alerts.html.
3. Set width to 700 and height to 220.
4. Keep custom CSS empty.

## Event Transport

The page now supports three transport paths:

1. Streamer.bot browser client SDK (recommended, same model as cdutson/streamerbot-alerts)
2. `window.postMessage(...)` payloads
3. `window.triggerAlert(payload)` direct calls

## Streamer.bot SDK Mode (Recommended)

This is now the default transport in `streamerbot-alerts.js` and uses `@streamerbot/client` in `streamerbot-alerts.html`.

Use this URL in your OBS Browser Source:

```text
file:///D:/git/twitch-webpages/Streamer.Bot/Alerts/streamerbot-alerts.html?sbEnabled=1&sbHost=127.0.0.1&sbPort=8080&sbEndpoint=/
```

Parameters:

- `sbEnabled`: `1` or `0` (default `1`)
- `sbHost`: Streamer.bot websocket server host (default `127.0.0.1`)
- `sbPort`: Streamer.bot websocket server port (default `8080`)
- `sbEndpoint`: Streamer.bot websocket endpoint (default `/`)
- `sbPassword`: optional auth password if your server requires auth
- `sbSubscribe`: event subscription mask (default `*`)

Runtime helpers (optional):

```javascript
window.configureStreamerBotClient({
  enabled: true,
  host: "127.0.0.1",
  port: 8080,
  endpoint: "/",
  password: "",
  subscribe: "*",
  autoConnect: true
});

window.startStreamerBotClient();
window.stopStreamerBotClient();
```

Current SDK connection state:

```javascript
window.streamerBotAlertsSbStatus
```

## Why Connected Clients May Stay Empty

If Streamer.bot shows no connected clients:

- host/port/endpoint do not match (`/` vs `/alerts` mismatch is common)
- browser source is not currently active/visible in OBS
- Streamer.bot auth is enabled but `sbPassword` is missing
- local firewall is blocking the websocket port

## Raw WebSocket Mode (Fallback)

Raw websocket mode is still supported for custom servers that emit alert payloads directly.

### 1) Start with query parameters

Set your OBS browser source URL to include websocket settings:

```text
file:///D:/git/twitch-webpages/Streamer.Bot/Alerts/streamerbot-alerts.html?wsEnabled=1&wsUrl=ws://127.0.0.1:8080/&wsReconnectMs=3000
```

If you open the HTML in a normal browser and no websocket server is running on that address, you will see:

`WebSocket connection to 'ws://127.0.0.1:8080/' failed`

That is expected until a server is listening on that endpoint.

For local UI preview without a running websocket server, either:

- remove websocket params entirely, or
- disable reconnect spam with `wsRetry=0`, for example:

```text
file:///D:/git/twitch-webpages/Streamer.Bot/Alerts/streamerbot-alerts.html?wsEnabled=1&wsUrl=ws://127.0.0.1:8080/&wsRetry=0
```

Parameters:

- `wsEnabled`: `1` or `0`
- `wsUrl`: websocket endpoint
- `wsReconnectMs`: reconnect delay in milliseconds (min 500)
- `wsRetry`: `1` to auto-reconnect (default) or `0` for one-shot connect attempt

### 2) Expected websocket message formats

The socket accepts the same payload structures as postMessage:

```json
{ "type": "sub", "name": "Viewer", "amount": 1, "tier": "1", "id": "evt-001" }
```

```json
{ "event": "streamerbot-alert", "payload": { "type": "raid", "name": "Raider", "amount": 42, "id": "evt-002" } }
```

```json
{ "source": "streamerbot", "payload": { "type": "donation", "name": "Tipper", "amount": 12.34, "currencySymbol": "$", "message": "GG", "id": "evt-003" } }
```

### 3) Runtime controls (optional)

If you can execute JavaScript in the browser source at runtime, these helpers are available:

```javascript
window.configureAlertWebSocket({
  enabled: true,
  url: "ws://127.0.0.1:8080/",
  reconnectMs: 3000,
  retry: true,
  autoConnect: true
});

window.startAlertWebSocket();
window.stopAlertWebSocket();
```

Current socket state is exposed at:

```javascript
window.streamerBotAlertsWsStatus
```

### 4) Duplicate protection

If incoming payloads include `id`, duplicate events with the same id are ignored for 15 seconds to prevent replay spam during reconnects.

## Accepted Payload Shape

```json
{
  "type": "sub|resub|cheer|donation|tip|raid|subgift|communitygift",
  "name": "viewerName",
  "sender": "gifterName",
  "recipient": "targetUser",
  "amount": 5,
  "senderCount": 5,
  "tier": "1",
  "message": "optional message",
  "currencySymbol": "$",
  "durationMs": 5000,
  "id": "optional-event-id"
}
```

## postMessage Formats

The script accepts all of these:

```javascript
window.postMessage({
  type: "raid",
  name: "Raider",
  amount: 57
}, "*");

window.postMessage({
  event: "streamerbot-alert",
  payload: {
    type: "donation",
    name: "Supporter",
    amount: 12.5,
    currencySymbol: "$",
    message: "Love your stream"
  }
}, "*");

window.postMessage({
  source: "streamerbot",
  payload: {
    type: "subgift",
    sender: "Gifter",
    recipient: "Receiver",
    senderCount: 1
  }
}, "*");
```

## Streamer.Bot Action Example

If your action can execute JavaScript in the browser source, call:

```javascript
window.triggerAlert({
  type: "cheer",
  name: args.userName,
  amount: args.bits,
  message: args.message
});
```

## How To Test In Streamer.Bot

Use this to simulate a fresh sub event without waiting for a real subscription.

1. Create a new action in Streamer.Bot called `Test Alert - Sub`.
2. Add an OBS Browser Source JavaScript sub-action that targets the browser source running `streamerbot-alerts.html`.
3. Paste this JavaScript:

```javascript
window.triggerAlert({
  type: "sub",
  name: "TestSubscriber",
  amount: 1,
  tier: "1",
  durationMs: 4500,
  id: "test-sub-1"
});
```

1. Run the action manually once to confirm the alert appears.
2. Bind the same action to a hotkey or a chat command like `!testsub` for repeat testing.

If your Streamer.Bot build cannot call `window.triggerAlert(...)` directly, use this fallback:

```javascript
window.postMessage({
  source: "streamerbot",
  payload: {
    type: "sub",
    name: "TestSubscriber",
    amount: 1,
    tier: "1"
  }
}, "*");
```

If you do not have a browser JavaScript sub-action (your menu only shows OBS source controls), use this OBS path instead:

1. In Streamer.Bot, create an action named `Test Alert - Sub (URL)`.
2. Add sub-action: `OBS Studio -> Sources -> Set Browser Source URL`.
3. Select your alert browser source.
4. Set URL to your alert page plus query params, for example:

```text
file:///D:/git/twitch-webpages/Streamer.Bot/Alerts/streamerbot-alerts.html?type=sub&name=TestSubscriber&amount=1&tier=1&id=testsub1
```

1. Run the action and the sub alert should fire on page load.

You can test other types by changing `type=` and related params:

```text
...streamerbot-alerts.html?type=raid&name=RaidChannel&amount=42
...streamerbot-alerts.html?type=donation&name=Tipper&amount=12.34&currencySymbol=$&message=Hello
```

Tip: append a changing id (for example `id={{ticks}}`) when repeatedly testing the same event so URL updates are always treated as unique.

## Quick Queue Stress Test

Use this to verify one-by-one queue playback:

```javascript
window.triggerAlertBatch([
  { type: "sub", name: "UserA", amount: 1, tier: "1", id: "q1" },
  { type: "cheer", name: "UserB", amount: 300, message: "Queue test", id: "q2" },
  { type: "raid", name: "UserC", amount: 42, id: "q3" }
]);
```

## Queue Behavior

- Alerts are queued FIFO.
- Only one alert is visible at a time.
- Next alert starts when current `durationMs` expires.
- If `durationMs` is missing, per-type defaults are used.

## Defaults

- sub: 4500ms
- resub: 4500ms
- cheer: 9000ms
- donation: 9000ms
- raid: 6000ms
- subgift: 5000ms
- communitygift: 5000ms
