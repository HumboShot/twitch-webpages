using System;
using System.Net.Http;

/*----- Class name should match FileName -----*/
#if EXTERNAL_EDITOR
public class NowPlayingCommand : CPHInlineBase
#else
public class CPHInline
#endif
/*--------------------------------------------*/
{
    private static readonly HttpClient Http = new HttpClient
    {
        Timeout = TimeSpan.FromSeconds(8)
    };

    private const string Endpoint = "https://widget.nowplaying.site/current/je2ngVgR4GvcEO5n";

    public bool Execute()
    {
        try
        {
            string raw = Http.GetStringAsync(Endpoint).GetAwaiter().GetResult().Trim();

            if (string.IsNullOrWhiteSpace(raw))
            {
                CPH.SendMessage("Nothing is playing right now.");
                return true;
            }

            // Endpoint returns: Title - Artist
            int sep = raw.IndexOf(" - ", StringComparison.Ordinal);
            string artist;
            string song;

            if (sep < 0)
            {
                // No separator — send as-is
                CPH.SendMessage($"Now Playing: {raw}");
                return true;
            }

            song = raw.Substring(0, sep).Trim();
            artist = raw.Substring(sep + 3).Trim();

            CPH.SendMessage($"Now Playing: {artist} - {song}");
            return true;
        }
        catch (Exception ex)
        {
            CPH.LogError($"NowPlaying command error: {ex}");
            CPH.SendMessage("Couldn't fetch the current song. Please try again in a moment.");
            return true;
        }
    }
}