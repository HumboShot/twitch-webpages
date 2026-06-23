# Streamer.Bot Weather Command (`!weather`)

This command uses Open-Meteo from a Streamer.Bot C# Code sub-action.

Compatibility note: this implementation uses `Newtonsoft.Json.Linq` (and avoids `System.Text.Json`) to stay compatible with Streamer.Bot hosts where `System.Memory` is not loaded.

## Behavior Implemented

- Fixed default location (no user-provided location input)
- Celsius + km/h output
- Includes: current temp, feels-like, condition, wind, and today high/low
- Per-user cooldown (default 30 seconds)
- Friendly chat errors on API/location failures
- Lightweight cache to reduce API calls

## Files

- `weather-command.cs`: paste into a C# Code sub-action in Streamer.Bot

## Streamer.Bot Setup

1. Create action: `Chat - Weather`
2. Add sub-action: `Core -> C#` and paste contents of `weather-command.cs`
3. Create command: `!weather`
4. Link command to `Chat - Weather`
5. Set command permission as needed (typically Everyone)

## Optional Action Arguments

Add these action arguments if you want overrides without editing code:

- `weatherLocation`: default `Rotterdam`
- `weatherTimezone`: default `auto` (or e.g. `Europe/Amsterdam`)
- `weatherCooldownSeconds`: default `30`
- `weatherCacheSeconds`: default `60`

## Suggested Test Cases

1. Trigger `!weather` once and validate full message format.
2. Trigger again immediately from the same account and validate cooldown response.
3. Set `weatherLocation` to nonsense text and validate friendly error.
4. Disconnect internet briefly (or block endpoint) and validate friendly fallback.

## Open-Meteo Endpoints Used

- Geocoding: `https://geocoding-api.open-meteo.com/v1/search`
- Forecast: `https://api.open-meteo.com/v1/forecast`

No API key required.
