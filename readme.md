# Twitch Webpages

This is a repo i use to save all the different layouts and components i use in my stream

> **Note:** This repo is being split into smaller, more focused repos. New work should happen in those repos instead:
>
> - [stream-overlays](https://github.com/HumboShot/stream-overlays) — AFK/Ending/Starting screens, Footer, Panel Template, Current.Time.html, Tuna/NowPlaying overlays
> - [streamelements-alerts](https://github.com/HumboShot/streamelements-alerts) — the 7 StreamElements alert templates
> - [streamerbot-alerts](https://github.com/HumboShot/streamerbot-alerts) — the unified Streamer.bot alert page
> - [streamerbot-commands](https://github.com/HumboShot/streamerbot-commands) — the Streamer.bot C# Commands project

## Tuna.Overlay.Music

Currently i am using Tuna for displaying music from my local machine, it works with both Foobar2000 and Plex (not PlexAmp)

### Setup

Install Tuna and open OBS. In OBS click on the tools menu and Tuna settings.
From here you make sure that Tuna is running
For Foobar2000 support you need to install the foo_mediacontrol component

## NowPlaying.Site

For styling the NowPlaying.Site component you add the NowPlaying.Site url you get from their website, and in OBS you override the CSS with what is in this repo
