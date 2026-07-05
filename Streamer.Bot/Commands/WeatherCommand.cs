using System;
using System.Collections.Generic;
using System.Globalization;
using System.Net.Http;

/*----- Class name should match FileName -----*/
#if EXTERNAL_EDITOR
public class WeatherCommand : CPHInlineBase
#else
public class CPHInline
#endif
/*--------------------------------------------*/
{
    private static readonly HttpClient Http = new HttpClient
    {
        Timeout = TimeSpan.FromSeconds(8)
    };

    private static readonly object Gate = new object();
    private static readonly Dictionary<string, DateTimeOffset> UserCooldownUntil = new Dictionary<string, DateTimeOffset>(StringComparer.OrdinalIgnoreCase);
    private static readonly Dictionary<string, GeoCacheEntry> GeoCache = new Dictionary<string, GeoCacheEntry>(StringComparer.OrdinalIgnoreCase);
    private static WeatherCacheEntry WeatherCache;

    public bool Execute()
    {
        const string commandName = "!weather";

        string location = GetArg("weatherLocation", "Aalborg");
        string timezone = GetArg("weatherTimezone", "auto");

        int cooldownSeconds = ParseInt(GetArg("weatherCooldownSeconds", "30"), 30, 0, 600);
        int weatherCacheSeconds = ParseInt(GetArg("weatherCacheSeconds", "60"), 60, 0, 600);

        string userId = GetArg("userId", string.Empty);
        string userName = GetArg("userName", "there");
        string cooldownKey = string.IsNullOrWhiteSpace(userId) ? userName : userId;

        int remainingCooldown = TryConsumeCooldown(cooldownKey, cooldownSeconds);
        if (remainingCooldown > 0)
        {
            CPH.SendMessage($"@{userName} please wait {remainingCooldown}s before using {commandName} again.");
            return true;
        }

        try
        {
            GeoPoint geo = GetCoordinates(location);
            WeatherPayload weather = GetWeather(geo, timezone, weatherCacheSeconds);
            string condition = WeatherCodeToText(weather.WeatherCode);

            string reply = string.Format(
                CultureInfo.InvariantCulture,
                "Weather for {0}: {1}, {2:0.#}C (feels {3:0.#}C), wind {4:0.#} km/h. For my American viewers, this is {5:0.#}F (feels {6:0.#}F), wind {7:0.#} mph.",
                geo.DisplayName,
                condition,
                weather.CurrentTempC,
                weather.ApparentTempC,
                weather.WindKmh,
                (weather.CurrentTempC * 9d / 5d) + 32d,
                (weather.ApparentTempC * 9d / 5d) + 32d,
                weather.WindKmh * 0.621371d
            );

            CPH.SendMessage(reply);
            return true;
        }
        catch (FriendlyWeatherException ex)
        {
            CPH.LogWarn($"Weather command warning: {ex.Message}");
            CPH.SendMessage(ex.ChatMessage);
            return true;
        }
        catch (Exception ex)
        {
            CPH.LogError($"Weather command error: {ex}");
            CPH.SendMessage("Weather is unavailable right now. Please try again in a minute.");
            return true;
        }
    }

    private string GetArg(string key, string fallback)
    {
        if (args.TryGetValue(key, out object value) && value != null)
        {
            string text = value.ToString();
            if (!string.IsNullOrWhiteSpace(text))
            {
                return text.Trim();
            }
        }

        return fallback;
    }

    private int ParseInt(string raw, int fallback, int min, int max)
    {
        if (!int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out int value))
        {
            return fallback;
        }

        if (value < min)
        {
            return min;
        }

        if (value > max)
        {
            return max;
        }

        return value;
    }

    private int TryConsumeCooldown(string key, int cooldownSeconds)
    {
        if (cooldownSeconds <= 0 || string.IsNullOrWhiteSpace(key))
        {
            return 0;
        }

        DateTimeOffset now = DateTimeOffset.UtcNow;

        lock (Gate)
        {
            if (UserCooldownUntil.TryGetValue(key, out DateTimeOffset expiresAt) && expiresAt > now)
            {
                return (int)Math.Ceiling((expiresAt - now).TotalSeconds);
            }

            UserCooldownUntil[key] = now.AddSeconds(cooldownSeconds);
            return 0;
        }
    }

    private GeoPoint GetCoordinates(string location)
    {
        string normalized = location.Trim();
        DateTimeOffset now = DateTimeOffset.UtcNow;

        lock (Gate)
        {
            if (GeoCache.TryGetValue(normalized, out GeoCacheEntry cached) && cached.ExpiresAt > now)
            {
                return cached.Point;
            }
        }

        string url =
            "https://geocoding-api.open-meteo.com/v1/search?name=" +
            Uri.EscapeDataString(normalized) +
            "&count=1&language=en&format=json";

        string json = Http.GetStringAsync(url).GetAwaiter().GetResult();

        string resultsArray = ExtractArrayBlock(json, "results");
        if (string.IsNullOrWhiteSpace(resultsArray))
        {
            throw new FriendlyWeatherException(
                "Geocode returned no results.",
                "I couldn't find weather data for the configured location."
            );
        }

        string first = ExtractFirstObject(resultsArray);
        if (string.IsNullOrWhiteSpace(first))
        {
            throw new FriendlyWeatherException(
                "Geocode results array was empty.",
                "I couldn't find weather data for the configured location."
            );
        }

        double lat = ExtractDouble(first, "latitude");
        double lon = ExtractDouble(first, "longitude");

        string name = ExtractString(first, "name", "Unknown");
        string admin = ExtractString(first, "admin1", string.Empty);
        string country = ExtractString(first, "country", string.Empty);

        string display;
        if (!string.IsNullOrWhiteSpace(admin) && !string.IsNullOrWhiteSpace(country))
        {
            display = name + ", " + admin + ", " + country;
        }
        else if (!string.IsNullOrWhiteSpace(country))
        {
            display = name + ", " + country;
        }
        else
        {
            display = name;
        }

        GeoPoint point = new GeoPoint
        {
            Latitude = lat,
            Longitude = lon,
            DisplayName = display
        };

        lock (Gate)
        {
            GeoCache[normalized] = new GeoCacheEntry
            {
                Point = point,
                ExpiresAt = now.AddHours(12)
            };
        }

        return point;
    }

    private WeatherPayload GetWeather(GeoPoint point, string timezone, int cacheSeconds)
    {
        DateTimeOffset now = DateTimeOffset.UtcNow;

        lock (Gate)
        {
            if (cacheSeconds > 0 && WeatherCache != null && WeatherCache.ExpiresAt > now && WeatherCache.LocationKey == point.DisplayName)
            {
                return WeatherCache.Payload;
            }
        }

        string url = string.Format(
            CultureInfo.InvariantCulture,
            "https://api.open-meteo.com/v1/forecast?latitude={0}&longitude={1}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&temperature_unit=celsius&wind_speed_unit=kmh&timezone={2}",
            point.Latitude.ToString(CultureInfo.InvariantCulture),
            point.Longitude.ToString(CultureInfo.InvariantCulture),
            Uri.EscapeDataString(string.IsNullOrWhiteSpace(timezone) ? "auto" : timezone)
        );

        string json = Http.GetStringAsync(url).GetAwaiter().GetResult();

        string current = ExtractObjectBlock(json, "current");
        string daily = ExtractObjectBlock(json, "daily");

        if (string.IsNullOrWhiteSpace(current) || string.IsNullOrWhiteSpace(daily))
        {
            throw new FriendlyWeatherException(
                "Forecast payload missing current or daily blocks.",
                "Weather data is temporarily unavailable. Please try again shortly."
            );
        }

        WeatherPayload payload = new WeatherPayload
        {
            CurrentTempC = ExtractDouble(current, "temperature_2m"),
            ApparentTempC = ExtractDouble(current, "apparent_temperature"),
            WeatherCode = ExtractInt(current, "weather_code"),
            WindKmh = ExtractDouble(current, "wind_speed_10m"),
            TodayHighC = ExtractFirstDoubleFromArray(daily, "temperature_2m_max"),
            TodayLowC = ExtractFirstDoubleFromArray(daily, "temperature_2m_min")
        };

        lock (Gate)
        {
            WeatherCache = new WeatherCacheEntry
            {
                LocationKey = point.DisplayName,
                ExpiresAt = now.AddSeconds(cacheSeconds),
                Payload = payload
            };
        }

        return payload;
    }

    private string ExtractObjectBlock(string json, string key)
    {
        int keyIndex = FindKeyIndex(json, key);
        if (keyIndex < 0)
        {
            return null;
        }

        int open = FindNextNonWhitespace(json, keyIndex + key.Length + 3);
        if (open < 0 || json[open] != '{')
        {
            return null;
        }

        int close = FindMatchingBracket(json, open, '{', '}');
        if (close < 0)
        {
            return null;
        }

        return json.Substring(open, close - open + 1);
    }

    private string ExtractArrayBlock(string json, string key)
    {
        int keyIndex = FindKeyIndex(json, key);
        if (keyIndex < 0)
        {
            return null;
        }

        int open = FindNextNonWhitespace(json, keyIndex + key.Length + 3);
        if (open < 0 || json[open] != '[')
        {
            return null;
        }

        int close = FindMatchingBracket(json, open, '[', ']');
        if (close < 0)
        {
            return null;
        }

        return json.Substring(open, close - open + 1);
    }

    private string ExtractFirstObject(string arrayJson)
    {
        int open = arrayJson.IndexOf('{');
        if (open < 0)
        {
            return null;
        }

        int close = FindMatchingBracket(arrayJson, open, '{', '}');
        if (close < 0)
        {
            return null;
        }

        return arrayJson.Substring(open, close - open + 1);
    }

    private string ExtractString(string json, string key, string fallback)
    {
        int keyIndex = FindKeyIndex(json, key);
        if (keyIndex < 0)
        {
            return fallback;
        }

        int valueStart = FindNextNonWhitespace(json, keyIndex + key.Length + 3);
        if (valueStart < 0 || json[valueStart] != '"')
        {
            return fallback;
        }

        int valueEnd = FindStringEnd(json, valueStart + 1);
        if (valueEnd < 0)
        {
            return fallback;
        }

        string text = json.Substring(valueStart + 1, valueEnd - valueStart - 1);
        text = text.Replace("\\\"", "\"").Replace("\\\\", "\\");
        return string.IsNullOrWhiteSpace(text) ? fallback : text;
    }

    private int ExtractInt(string json, string key)
    {
        string raw = ExtractRawValue(json, key);
        if (string.IsNullOrWhiteSpace(raw) || !int.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out int value))
        {
            throw new FriendlyWeatherException(
                "Failed to parse integer field '" + key + "'.",
                "Weather data is temporarily unavailable. Please try again shortly."
            );
        }

        return value;
    }

    private double ExtractDouble(string json, string key)
    {
        string raw = ExtractRawValue(json, key);
        if (string.IsNullOrWhiteSpace(raw) || !double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out double value))
        {
            throw new FriendlyWeatherException(
                "Failed to parse numeric field '" + key + "'.",
                "Weather data is temporarily unavailable. Please try again shortly."
            );
        }

        return value;
    }

    private double ExtractFirstDoubleFromArray(string json, string key)
    {
        string array = ExtractArrayBlock(json, key);
        if (string.IsNullOrWhiteSpace(array) || array.Length < 2)
        {
            throw new FriendlyWeatherException(
                "Failed to parse array field '" + key + "'.",
                "Weather data is temporarily unavailable. Please try again shortly."
            );
        }

        int start = 1;
        while (start < array.Length - 1 && char.IsWhiteSpace(array[start]))
        {
            start++;
        }

        int end = start;
        while (end < array.Length - 1 && array[end] != ',' && array[end] != ']')
        {
            end++;
        }

        string raw = array.Substring(start, end - start).Trim();
        if (!double.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out double value))
        {
            throw new FriendlyWeatherException(
                "Failed to parse first array value for '" + key + "'.",
                "Weather data is temporarily unavailable. Please try again shortly."
            );
        }

        return value;
    }

    private string ExtractRawValue(string json, string key)
    {
        int keyIndex = FindKeyIndex(json, key);
        if (keyIndex < 0)
        {
            return null;
        }

        int start = FindNextNonWhitespace(json, keyIndex + key.Length + 3);
        if (start < 0)
        {
            return null;
        }

        int end = start;
        while (end < json.Length && json[end] != ',' && json[end] != '}' && json[end] != ']')
        {
            end++;
        }

        return json.Substring(start, end - start).Trim();
    }

    private int FindKeyIndex(string json, string key)
    {
        return json.IndexOf("\"" + key + "\"", StringComparison.Ordinal);
    }

    private int FindNextNonWhitespace(string text, int start)
    {
        for (int i = start; i < text.Length; i++)
        {
            if (!char.IsWhiteSpace(text[i]) && text[i] != ':')
            {
                return i;
            }
        }

        return -1;
    }

    private int FindStringEnd(string text, int start)
    {
        bool escaped = false;
        for (int i = start; i < text.Length; i++)
        {
            char c = text[i];
            if (escaped)
            {
                escaped = false;
                continue;
            }

            if (c == '\\')
            {
                escaped = true;
                continue;
            }

            if (c == '"')
            {
                return i;
            }
        }

        return -1;
    }

    private int FindMatchingBracket(string text, int openIndex, char openChar, char closeChar)
    {
        int depth = 0;
        bool inString = false;
        bool escaped = false;

        for (int i = openIndex; i < text.Length; i++)
        {
            char c = text[i];

            if (inString)
            {
                if (escaped)
                {
                    escaped = false;
                    continue;
                }

                if (c == '\\')
                {
                    escaped = true;
                    continue;
                }

                if (c == '"')
                {
                    inString = false;
                }

                continue;
            }

            if (c == '"')
            {
                inString = true;
                continue;
            }

            if (c == openChar)
            {
                depth++;
            }
            else if (c == closeChar)
            {
                depth--;
                if (depth == 0)
                {
                    return i;
                }
            }
        }

        return -1;
    }

    private string WeatherCodeToText(int code)
    {
        switch (code)
        {
            case 0:
                return "Clear";
            case 1:
            case 2:
                return "Partly cloudy";
            case 3:
                return "Overcast";
            case 45:
            case 48:
                return "Fog";
            case 51:
            case 53:
            case 55:
                return "Drizzle";
            case 56:
            case 57:
                return "Freezing drizzle";
            case 61:
            case 63:
            case 65:
                return "Rain";
            case 66:
            case 67:
                return "Freezing rain";
            case 71:
            case 73:
            case 75:
                return "Snow";
            case 77:
                return "Snow grains";
            case 80:
            case 81:
            case 82:
                return "Rain showers";
            case 85:
            case 86:
                return "Snow showers";
            case 95:
                return "Thunderstorm";
            case 96:
            case 99:
                return "Thunderstorm with hail";
            default:
                return "Mixed conditions";
        }
    }

    private sealed class FriendlyWeatherException : Exception
    {
        public FriendlyWeatherException(string logMessage, string chatMessage) : base(logMessage)
        {
            ChatMessage = chatMessage;
        }

        public string ChatMessage { get; }
    }

    private sealed class GeoPoint
    {
        public double Latitude { get; set; }
        public double Longitude { get; set; }
        public string DisplayName { get; set; }
    }

    private sealed class GeoCacheEntry
    {
        public GeoPoint Point { get; set; }
        public DateTimeOffset ExpiresAt { get; set; }
    }

    private sealed class WeatherPayload
    {
        public double CurrentTempC { get; set; }
        public double ApparentTempC { get; set; }
        public int WeatherCode { get; set; }
        public double WindKmh { get; set; }
        public double TodayHighC { get; set; }
        public double TodayLowC { get; set; }
    }

    private sealed class WeatherCacheEntry
    {
        public string LocationKey { get; set; }
        public DateTimeOffset ExpiresAt { get; set; }
        public WeatherPayload Payload { get; set; }
    }
}
