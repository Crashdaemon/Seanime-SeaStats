# SeaStats

A [Seanime](https://seanime.app) plugin that shows your AniList statistics inside
Seanime.

## What it shows

- A stats strip on the home screen: watch time, episodes watched, finished, watching, planning,
  top genre, top studio, and your favorites.
- A matching strip on the Manga page with chapters read, volumes, reading, planning and more.
- A full dashboard page (sidebar button, anime/manga toggle) adding top genres, top studios,
  format and status breakdowns, score distribution, and a by-release-year chart.
- A heart button on anime and manga pages to add or remove AniList favorites.

## Install

In Seanime, go to Extensions, select Add extension, and paste:
`https://raw.githubusercontent.com/Crashdaemon/Seanime-SeaStats/main/seastats.json`

## Permissions

- `anilist`: reads your statistics and favorites from your AniList account, and toggles
  favorites when you click the heart button.
- `anilist-token` and `database`: let the plugin read your AniList session token so requests
  run as you. Nothing else in the database is touched.
- `storage`: caches the stats locally for 12 hours (plus recent favorite toggles). Use the
  Refresh button on the dashboard to update sooner.

Requires being logged in to AniList in Seanime.
