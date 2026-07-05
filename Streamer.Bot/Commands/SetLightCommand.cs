using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;
using Newtonsoft.Json;

/*----- Class name should match FileName -----*/
#if EXTERNAL_EDITOR
public class SetLightCommand : CPHInlineBase
#else
public class CPHInline
#endif
/*--------------------------------------------*/
{
    private static readonly HttpClient client = new HttpClient();

    public bool Execute()
    {
        var rawInput = args.ContainsKey("rawInput") ? args["rawInput"].ToString().Trim().ToLower() : "";

        var finalColor = ValidateColor(rawInput);

        if (string.IsNullOrEmpty(finalColor))
        {
            string userName = "";
            CPH.TryGetArg("userName", out userName);

            bool refundSuccess = false;
            if (CPH.TryGetArg("rewardId", out string rewardId) && CPH.TryGetArg("redemptionId", out string redemptionId))
            {
                refundSuccess = CPH.TwitchRedemptionCancel(rewardId, redemptionId);
            }

            CPH.LogWarn($"[Hue Lights] Invalid color input from viewer: '{rawInput}'. Refund attempted: {refundSuccess}.");
            CPH.SendMessage(
                $"@{userName} '{rawInput}' is not a valid color. You can find the list here: https://link.humboshot.com/colors"
            );

            return true;
        }
        else
        {
            CPH.LogInfo($"[Hue Lights] Changing color to: {finalColor}");
        }

        var payload = new { color = finalColor };
        var json = JsonConvert.SerializeObject(payload);
        var content = new StringContent(json, Encoding.UTF8, "application/json");

        // Webhook is setup to only work with the local IP address of the Home Assistant server. Adjust the URL as needed for your setup.
        var webhookUrl = "http://192.168.1.234:7777/api/webhook/twitch_hue_color";

        Task.Run(async () =>
        {
            try
            {
                HttpResponseMessage response = await client.PostAsync(webhookUrl, content);
                if (!response.IsSuccessStatusCode)
                {
                    CPH.LogWarn($"[Hue Lights] HA Webhook failed with status: {response.StatusCode}");
                }
            }
            catch (Exception ex)
            {
                CPH.LogWarn($"[Hue Lights] Exception calling HA: {ex.Message}");
            }
        });

        return true;
    }

    private string? ValidateColor(string input)
    {
        if (string.IsNullOrWhiteSpace(input)) return null;

        // The list of colors have been taken from the HA code https://github.com/home-assistant/core/blob/e2fdc6a98bdd22187688e70701fc3617423a714b/homeassistant/util/color.py#L19
        var allowedColors = new List<string>
        {
            "aliceblue",
            "antiquewhite",
            "aqua",
            "aquamarine",
            "azure",
            "beige",
            "bisque",
            "black",
            "blanchedalmond",
            "blue",
            "blueviolet",
            "brown",
            "burlywood",
            "cadetblue",
            "chartreuse",
            "chocolate",
            "coral",
            "cornflowerblue",
            "cornsilk",
            "crimson",
            "cyan",
            "darkblue",
            "darkcyan",
            "darkgoldenrod",
            "darkgray",
            "darkgreen",
            "darkgrey",
            "darkkhaki",
            "darkmagenta",
            "darkolivegreen",
            "darkorange",
            "darkorchid",
            "darkred",
            "darksalmon",
            "darkseagreen",
            "darkslateblue",
            "darkslategray",
            "darkslategrey",
            "darkturquoise",
            "darkviolet",
            "deeppink",
            "deepskyblue",
            "dimgray",
            "dimgrey",
            "dodgerblue",
            "firebrick",
            "floralwhite",
            "forestgreen",
            "fuchsia",
            "gainsboro",
            "ghostwhite",
            "gold",
            "goldenrod",
            "gray",
            "green",
            "greenyellow",
            "grey",
            "honeydew",
            "hotpink",
            "indianred",
            "indigo",
            "ivory",
            "khaki",
            "lavender",
            "lavenderblush",
            "lawngreen",
            "lemonchiffon",
            "lightblue",
            "lightcoral",
            "lightcyan",
            "lightgoldenrodyellow",
            "lightgray",
            "lightgreen",
            "lightgrey",
            "lightpink",
            "lightsalmon",
            "lightseagreen",
            "lightskyblue",
            "lightslategray",
            "lightslategrey",
            "lightsteelblue",
            "lightyellow",
            "lime",
            "limegreen",
            "linen",
            "magenta",
            "maroon",
            "mediumaquamarine",
            "mediumblue",
            "mediumorchid",
            "mediumpurple",
            "mediumseagreen",
            "mediumslateblue",
            "mediumspringgreen",
            "mediumturquoise",
            "mediumvioletred",
            "midnightblue",
            "mintcream",
            "mistyrose",
            "moccasin",
            "navajowhite",
            "navy",
            "navyblue",
            "oldlace",
            "olive",
            "olivedrab",
            "orange",
            "orangered",
            "orchid",
            "palegoldenrod",
            "palegreen",
            "paleturquoise",
            "palevioletred",
            "papayawhip",
            "peachpuff",
            "peru",
            "pink",
            "plum",
            "powderblue",
            "purple",
            "red",
            "rosybrown",
            "royalblue",
            "saddlebrown",
            "salmon",
            "sandybrown",
            "seagreen",
            "seashell",
            "sienna",
            "silver",
            "skyblue",
            "slateblue",
            "slategray",
            "slategrey",
            "snow",
            "springgreen",
            "steelblue",
            "tan",
            "teal",
            "thistle",
            "tomato",
            "turquoise",
            "violet",
            "wheat",
            "white",
            "whitesmoke",
            "yellow",
            "yellowgreen",
            // And...
            "homeassistant"
        };

        if (allowedColors.Contains(input))
        {
            return input;
        }

        return null;
    }
}