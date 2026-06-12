/// <reference path="./core.d.ts" />
/// <reference path="./plugin.d.ts" />
/// <reference path="./app.d.ts" />
/// <reference path="./system.d.ts" />

interface FavoriteItem {
    id: number
    title: string
    cover: string
    url: string
}

interface GenreStat {
    name: string
    count: number
    units: number
}

interface StudioStat {
    name: string
    count: number
    minutes: number
}

interface FormatStat {
    name: string
    count: number
}

interface ScoreStat {
    score: number
    count: number
}

interface YearStat {
    year: number
    count: number
}

interface MediaStats {
    count: number
    finished: number
    watching: number
    planning: number
    paused: number
    dropped: number
    repeating: number
    units: number
    minutes: number
    volumes: number
    meanScore: number
    topGenre: string
    topStudio: string
    genres: GenreStat[]
    studios: StudioStat[]
    formats: FormatStat[]
    scores: ScoreStat[]
    releaseYears: YearStat[]
    favorites: FavoriteItem[]
}

interface StatsData {
    username: string
    fetchedAt: number
    anime: MediaStats
    manga: MediaStats
}

type StatsPayload =
    | { ok: true; data: StatsData }
    | { ok: false; reason: "not-logged-in" | "fetch-failed" }

interface ThemeColors {
    brand: string
    brandLight: string
    background: string
    paper: string
    g800: string
    g900: string
}

function createSeaStats() {
    const CACHE_KEY = "stats.data.v2"
    const CACHE_AT_KEY = "stats.fetchedAt"
    const CACHE_TTL_MS = 12 * 60 * 60 * 1000

    const STATS_QUERY = `query {
      Viewer {
        name
        statistics {
          anime {
            count episodesWatched minutesWatched meanScore
            statuses { status count }
            genres(limit: 10, sort: PROGRESS_DESC) { genre count minutesWatched }
            studios(limit: 10, sort: COUNT_DESC) { studio { name } count minutesWatched }
            formats { format count }
            scores { score count }
            releaseYears { releaseYear count }
          }
          manga {
            count chaptersRead volumesRead meanScore
            statuses { status count }
            genres(limit: 10, sort: PROGRESS_DESC) { genre count chaptersRead }
            formats { format count }
            scores { score count }
            releaseYears { releaseYear count }
          }
        }
        favourites {
          anime(page: 1, perPage: 25) { nodes { id title { userPreferred } coverImage { large } siteUrl } }
          manga(page: 1, perPage: 25) { nodes { id title { userPreferred } coverImage { large } siteUrl } }
        }
      }
    }`

    function errMsg(e: any): string {
        return e instanceof Error ? e.message : String(e)
    }

    function normalizeMedia(raw: any, favNodes: any[], isAnime: boolean): MediaStats {
        const r = raw || {}
        const statuses = r.statuses || []
        const statusCount: Record<string, number> = {}
        for (let i = 0; i < statuses.length; i++) {
            if (statuses[i] && statuses[i].status) statusCount[statuses[i].status] = statuses[i].count || 0
        }
        const genres: GenreStat[] = (r.genres || []).map((g: any) => ({
            name: g.genre || "",
            count: g.count || 0,
            units: (isAnime ? g.minutesWatched : g.chaptersRead) || 0,
        }))
        const studios: StudioStat[] = (r.studios || [])
            .map((s: any) => ({
                name: (s.studio && s.studio.name) || "",
                count: s.count || 0,
                minutes: s.minutesWatched || 0,
            }))
            .sort((a: StudioStat, b: StudioStat) => b.count - a.count)
        const releaseYears: YearStat[] = (r.releaseYears || [])
            .map((y: any) => ({ year: y.releaseYear || 0, count: y.count || 0 }))
            .filter((y: YearStat) => y.year > 0)
            .sort((a: YearStat, b: YearStat) => a.year - b.year)
        const formats: FormatStat[] = (r.formats || []).map((f: any) => ({
            name: f.format || "",
            count: f.count || 0,
        }))
        const scores: ScoreStat[] = (r.scores || [])
            .map((s: any) => ({ score: s.score || 0, count: s.count || 0 }))
            .sort((a: ScoreStat, b: ScoreStat) => a.score - b.score)
        const favorites: FavoriteItem[] = (favNodes || []).map((n: any) => ({
            id: n.id || 0,
            title: (n.title && n.title.userPreferred) || "",
            cover: (n.coverImage && n.coverImage.large) || "",
            url: n.siteUrl || "",
        }))
        let meanScore = r.meanScore || 0
        if (!meanScore && scores.length > 0) {
            let totalCount = 0
            let weighted = 0
            for (let i = 0; i < scores.length; i++) {
                totalCount += scores[i].count
                weighted += scores[i].score * scores[i].count
            }
            if (totalCount > 0) meanScore = Math.round(weighted / totalCount * 10) / 10
        }
        return {
            count: r.count || 0,
            finished: statusCount["COMPLETED"] || 0,
            watching: statusCount["CURRENT"] || 0,
            planning: statusCount["PLANNING"] || 0,
            paused: statusCount["PAUSED"] || 0,
            dropped: statusCount["DROPPED"] || 0,
            repeating: statusCount["REPEATING"] || 0,
            units: (isAnime ? r.episodesWatched : r.chaptersRead) || 0,
            minutes: r.minutesWatched || 0,
            volumes: r.volumesRead || 0,
            meanScore: meanScore,
            topGenre: genres.length > 0 ? genres[0].name : "",
            topStudio: studios.length > 0 ? studios[0].name : "",
            genres: genres,
            studios: studios,
            formats: formats,
            scores: scores,
            releaseYears: releaseYears,
            favorites: favorites,
        }
    }

    function normalizeStats(raw: any, fetchedAt: number): StatsData {
        let root = raw || {}
        if (!root.Viewer && root.data) root = root.data
        const viewer = root.Viewer || {}
        const stats = viewer.statistics || {}
        const favs = viewer.favourites || {}
        return {
            username: viewer.name || "",
            fetchedAt: fetchedAt,
            anime: normalizeMedia(stats.anime, (favs.anime && favs.anime.nodes) || [], true),
            manga: normalizeMedia(stats.manga, (favs.manga && favs.manga.nodes) || [], false),
        }
    }

    const DEFAULT_THEME: ThemeColors = {
        brand: "rgb(97, 82, 223)",
        brandLight: "rgb(159, 146, 255)",
        background: "#070707",
        paper: "rgb(11, 11, 11)",
        g800: "rgb(28, 28, 28)",
        g900: "rgb(16, 16, 16)",
    }

    function cssVarValue(styleCssText: string, name: string): string {
        const m = styleCssText.match(new RegExp("(?:^|[;\\s])" + name + "\\s*:\\s*([^;]+)"))
        return m ? m[1].trim() : ""
    }

    function expandTriplet(v: string): string {
        if (/^\d+\s+\d+\s+\d+$/.test(v)) return "rgb(" + v.split(/\s+/).join(", ") + ")"
        return v
    }

    function parseTheme(styleCssText: string): ThemeColors {
        const t = styleCssText || ""
        return {
            brand: expandTriplet(cssVarValue(t, "--color-brand-500")) || DEFAULT_THEME.brand,
            brandLight: expandTriplet(cssVarValue(t, "--color-brand-400")) || DEFAULT_THEME.brandLight,
            background: cssVarValue(t, "--background") || DEFAULT_THEME.background,
            paper: cssVarValue(t, "--paper") || DEFAULT_THEME.paper,
            g800: expandTriplet(cssVarValue(t, "--color-gray-800")) || DEFAULT_THEME.g800,
            g900: expandTriplet(cssVarValue(t, "--color-gray-900")) || DEFAULT_THEME.g900,
        }
    }

    const tokensCss = (t: ThemeColors) => `
    :root {
        --background: ${t.background};
        --paper: ${t.paper};
        --g900: ${t.g900};
        --g800: ${t.g800};
        --brand: ${t.brand};
        --brand-light: ${t.brandLight};
        --fg: #d1d1d1;
        --border: rgba(255, 255, 255, 0.1);
        --muted: rgba(255, 255, 255, 0.4);
        --muted-hi: rgba(255, 255, 255, 0.6);
        --subtle: rgba(255, 255, 255, 0.06);
        --subtle-hi: rgba(255, 255, 255, 0.08);
        --radius: 0.5rem;
        --radius-lg: 0.875rem;
        --fade: 20px;
        --pad: clamp(1rem, 1.4vw, 1.5rem);
        --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
        --donut-0: var(--brand);
        --donut-1: var(--brand-light);
        --donut-2: rgb(74, 222, 128);
        --donut-3: rgb(251, 146, 60);
        --donut-4: rgb(96, 165, 250);
        --donut-5: rgb(248, 113, 113);
    }
    * { box-sizing: border-box; }
    html { color-scheme: dark; font-size: clamp(13.5px, 0.3vw + 11.5px, 17px); scrollbar-width: none; }
    html::-webkit-scrollbar, body::-webkit-scrollbar { display: none; width: 0; height: 0; }
    body {
        background: transparent;
        color: var(--fg);
        font-family: "Inter Variable", Inter, -apple-system, system-ui, sans-serif;
        font-size: 0.875rem;
        margin: 0;
        font-feature-settings: "tnum" 1;
    }
    .wrap { position: relative; margin: 0 auto; }
    .wrap.widget { padding: 12px clamp(8px, 1.2vw, 32px) 18px; }
    .wrap.dashboard { max-width: none; padding: clamp(20px, 2vw, 36px) clamp(16px, 2.2vw, 48px) clamp(44px, 3.5vw, 64px); }
    .glow {
        position: absolute; inset: -40px 0 auto 0; height: 320px; pointer-events: none;
        background: radial-gradient(620px 300px at 16% 0%, color-mix(in srgb, var(--brand) 14%, transparent), transparent 70%),
                    radial-gradient(420px 220px at 88% 10%, color-mix(in srgb, var(--brand-light) 7%, transparent), transparent 70%);
    }
    .reveal { opacity: 0; transform: translateY(10px); animation: rise 0.55s var(--ease-out) forwards; }
    @keyframes rise { to { opacity: 1; transform: translateY(0); } }
    .card {
        position: relative;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.035), rgba(255, 255, 255, 0.006) 55%), var(--paper);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        padding: clamp(0.9rem, 1.2vw, 1.35rem) var(--pad);
    }
    .hero { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr)); gap: clamp(0.7rem, 1vw, 1.1rem); }
    .hero .card { overflow: hidden; }
    .hero .card::after {
        content: ""; position: absolute; left: var(--pad); right: auto; bottom: 0; width: 34px; height: 2px;
        border-radius: 2px; background: linear-gradient(90deg, var(--brand), var(--brand-light));
        opacity: 0.85;
    }
    .hero .value {
        font-size: clamp(1.35rem, 1vw + 0.9rem, 2rem); font-weight: 700; letter-spacing: -0.02em; line-height: 1.15;
        background: linear-gradient(135deg, #ffffff 30%, var(--brand-light));
        -webkit-background-clip: text; background-clip: text; color: transparent;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .hero .label {
        margin-top: 0.4rem; font-size: 0.68rem; font-weight: 600;
        letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted);
    }
    .strip {
        display: flex; align-items: center; flex-wrap: wrap; gap: 0.55rem 1.1rem;
        background: linear-gradient(180deg, color-mix(in srgb, var(--g900) 76%, transparent), color-mix(in srgb, var(--background) 84%, transparent));
        border: 1px solid var(--border); border-radius: var(--radius-lg);
        padding: 0.6rem 1.1rem;
    }
    .stat-line { display: flex; flex: 1 1 auto; flex-wrap: wrap; align-items: center; gap: 0.45rem 0; min-width: 0; }
    .chip { display: flex; flex: 1 1 auto; flex-direction: column; gap: 2px; padding: 0.1rem 1.15rem; border-left: 1px solid var(--border); min-width: 0; }
    .chip:first-child { border-left: 0; padding-left: 0.2rem; }
    .chip .v {
        font-weight: 700; letter-spacing: -0.01em; white-space: nowrap;
        font-size: clamp(0.95rem, 0.4vw + 0.75rem, 1.2rem);
        background: linear-gradient(135deg, #ffffff 30%, var(--brand-light));
        -webkit-background-clip: text; background-clip: text; color: transparent;
    }
    .chip .l {
        font-size: 0.6rem; font-weight: 600; letter-spacing: 0.09em;
        text-transform: uppercase; color: var(--muted); white-space: nowrap;
    }
    .topbar { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1.1rem; flex-wrap: wrap; }
    .brandmark { display: flex; align-items: baseline; gap: 0.55rem; }
    .brandmark .t { font-weight: 700; letter-spacing: -0.01em; font-size: 1.05rem; color: #fff; }
    .brandmark .u { color: var(--muted); font-size: 0.8rem; }
    .right-tools { display: flex; align-items: center; gap: 0.7rem; }
    .muted { color: var(--muted); font-size: 0.78rem; }
    .toggle {
        position: relative; display: inline-flex; isolation: isolate;
        background: var(--subtle); border: 1px solid var(--border); border-radius: 99px; padding: 3px;
    }
    .toggle .thumb {
        position: absolute; z-index: -1; top: 3px; bottom: 3px; left: 3px; width: calc(50% - 3px);
        border-radius: 99px; background: linear-gradient(135deg, var(--brand), color-mix(in srgb, var(--brand) 70%, var(--brand-light)));
        box-shadow: 0 2px 10px color-mix(in srgb, var(--brand) 45%, transparent);
        transition: transform 0.28s var(--ease-out);
    }
    .toggle[data-active="manga"] .thumb { transform: translateX(100%); }
    .toggle button {
        border: 0; background: transparent; color: var(--muted-hi); font: inherit; font-size: 0.78rem; font-weight: 600;
        padding: 0.34rem 1.05rem; border-radius: 99px; cursor: pointer; min-width: 72px;
        transition: color 0.2s ease;
    }
    .toggle button.active { color: #fff; }
    .btn {
        border: 1px solid var(--border); background: var(--subtle); color: var(--fg); font: inherit;
        font-size: 0.78rem; font-weight: 500; padding: 0.38rem 0.9rem; border-radius: 99px; cursor: pointer;
        transition: background 0.2s ease, border-color 0.2s ease, transform 0.15s ease;
    }
    .btn:hover { background: var(--subtle-hi); border-color: color-mix(in srgb, var(--brand-light) 35%, transparent); }
    .btn:active { transform: scale(0.97); }
    .section-title {
        display: flex; align-items: center; gap: 0.55rem;
        font-size: 0.7rem; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
        color: var(--muted-hi); margin: clamp(1.4rem, 2vw, 2.1rem) 0 0.7rem;
    }
    .wrap.widget .section-title { margin: 0.9rem 0 0.15rem; }
    .section-title::before {
        content: ""; width: 16px; height: 2px; border-radius: 2px;
        background: linear-gradient(90deg, var(--brand), var(--brand-light));
    }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: clamp(0.8rem, 1.2vw, 1.2rem); align-items: start; }
    @media (max-width: 1000px) { .grid-2 { grid-template-columns: 1fr; } }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: clamp(0.8rem, 1.2vw, 1.2rem); align-items: start; }
    @media (max-width: 1200px) { .grid-3 { grid-template-columns: 1fr; } }
    .bar-row { display: flex; align-items: center; gap: 0.7rem; margin: 0.42rem 0; }
    .bar-label { width: clamp(92px, 10vw, 150px); color: var(--muted-hi); font-size: 0.82rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bar-track { flex: 1; background: var(--subtle); border-radius: 99px; height: 8px; overflow: hidden; }
    .bar-fill {
        height: 100%; border-radius: 99px;
        background: linear-gradient(90deg, var(--brand), var(--brand-light));
        transform: scaleX(0); transform-origin: left;
        animation: barIn 0.7s var(--ease-out) forwards;
    }
    @keyframes barIn { to { transform: scaleX(1); } }
    .bar-val { width: 76px; text-align: right; color: var(--muted); font-size: 0.76rem; font-variant-numeric: tabular-nums; }
    .donut { display: flex; align-items: center; gap: 1.4rem; flex-wrap: wrap; }
    .ring-wrap { position: relative; width: clamp(116px, 9vw, 152px); height: clamp(116px, 9vw, 152px); flex: 0 0 auto; }
    .ring {
        width: 100%; height: 100%; border-radius: 50%;
        -webkit-mask: radial-gradient(farthest-side, transparent 60%, #000 61%);
        mask: radial-gradient(farthest-side, transparent 60%, #000 61%);
    }
    .ring-center { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; }
    .ring-center .n { font-weight: 700; font-size: 1.25rem; color: #fff; line-height: 1; }
    .ring-center .l { font-size: 0.62rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin-top: 0.25rem; }
    .legend { font-size: 0.82rem; display: grid; gap: 0.3rem; }
    .legend div { display: flex; align-items: center; gap: 0.55rem; color: var(--muted-hi); }
    .legend .dot { width: 9px; height: 9px; border-radius: 3px; display: inline-block; flex: 0 0 auto; }
    .legend .c { color: var(--muted); font-variant-numeric: tabular-nums; }
    .cols { display: flex; align-items: flex-end; gap: 7px; height: clamp(100px, 9vw, 150px); padding-top: 0.4rem; }
    .cols .col {
        flex: 1; min-height: 3px; border-radius: 4px 4px 2px 2px;
        background: linear-gradient(180deg, var(--brand-light), var(--brand));
        opacity: 0.85; transform: scaleY(0); transform-origin: bottom;
        animation: colIn 0.6s var(--ease-out) forwards;
        transition: opacity 0.15s ease;
    }
    .cols .col:hover { opacity: 1; }
    @keyframes colIn { to { transform: scaleY(1); } }
    .cols-labels { display: flex; gap: 7px; margin-top: 0.4rem; }
    .cols-labels span { flex: 1; text-align: center; color: var(--muted); font-size: 0.68rem; font-variant-numeric: tabular-nums; }
    .favs-wrap {
        -webkit-mask: linear-gradient(90deg, transparent 0, #000 var(--fade), #000 calc(100% - var(--fade)), transparent 100%);
        mask: linear-gradient(90deg, transparent 0, #000 var(--fade), #000 calc(100% - var(--fade)), transparent 100%);
    }
    .favs {
        display: flex; gap: 0.7rem; overflow-x: auto; padding: 8px var(--fade) 14px;
        scroll-snap-type: x proximity; scrollbar-width: thin; scrollbar-color: var(--g800) transparent;
    }
    .favs .fav { flex: 0 0 clamp(64px, 5vw, 92px); scroll-snap-align: start; }
    .fav-grid {
        display: grid; grid-template-columns: repeat(auto-fill, minmax(clamp(96px, 7.5vw, 130px), 1fr));
        gap: clamp(0.7rem, 1vw, 1.1rem); padding-top: 0.35rem;
    }
    .fav { display: block; cursor: pointer; text-decoration: none; color: var(--fg); }
    .fav .cover {
        position: relative; border-radius: 10px; overflow: hidden; border: 1px solid var(--border);
        display: block; transition: transform 0.3s var(--ease-out), box-shadow 0.3s ease;
    }
    .fav img { width: 100%; aspect-ratio: 2 / 3; height: auto; object-fit: cover; display: block; transition: transform 0.35s var(--ease-out); }
    .fav .cover::after {
        content: ""; position: absolute; inset: 0; border-radius: 10px;
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
        background: linear-gradient(180deg, transparent 62%, rgba(7, 7, 7, 0.55));
        pointer-events: none;
    }
    .fav:hover img { transform: scale(1.06); }
    .fav:hover .cover, .fav:focus-visible .cover {
        transform: translateY(-4px);
        box-shadow: 0 10px 28px color-mix(in srgb, var(--brand) 35%, transparent), 0 0 0 1px color-mix(in srgb, var(--brand-light) 40%, transparent);
    }
    .fav:focus-visible { outline: none; }
    .fav .t {
        font-size: 0.7rem; color: var(--muted-hi); margin-top: 0.45rem; line-height: 1.3;
        max-height: 2.6em; overflow: hidden;
    }
    .zero { text-align: center; color: var(--muted); padding: 2rem 1rem; }
    .zero .big { font-size: 1.6rem; display: block; margin-bottom: 0.4rem; opacity: 0.7; }
    @media (prefers-reduced-motion: reduce) {
        .reveal, .bar-fill, .cols .col { animation: none; opacity: 1; transform: none; }
        .toggle .thumb, .fav img, .fav .cover { transition: none; }
    }
    `

    function buildShellHtml(kind: "widget" | "dashboard", lockedMode?: "anime" | "manga", theme?: ThemeColors): string {
        const isDash = kind === "dashboard"
        const initialMode = isDash ? "anime" : (lockedMode || "anime")
        const t = theme || DEFAULT_THEME
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>${tokensCss(t)}</style>
</head>
<body>
<div class="wrap ${kind}">${isDash ? '<div class="glow"></div>' : ""}<div id="root"><div class="zero">Loading stats...</div></div></div>
<script>
var MODE = "${initialMode}"
var PAYLOAD = null
var IS_DASH = ${isDash}

function fmtNum(n) {
    return String(Math.round(n)).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",")
}
function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

function statItems(m) {
    if (MODE === "anime") {
        return [
            { v: fmtNum(Math.round(m.minutes / 60)) + " hours", l: m.minutes >= 1440 ? "Watched · " + (m.minutes / 1440).toFixed(1) + " days" : "Watched" },
            { v: fmtNum(m.units || 0), l: "Episodes watched" },
            { v: fmtNum(m.finished || 0), l: "Anime finished" },
            { v: fmtNum(m.watching || 0), l: "Watching" },
            { v: fmtNum(m.planning || 0), l: "Planning" },
            { v: m.topGenre || "N/A", l: "Top genre" },
            { v: m.topStudio || "N/A", l: "Top studio" },
        ]
    }
    return [
        { v: fmtNum(m.units || 0) + " chapters", l: m.volumes > 0 ? "Read · " + fmtNum(m.volumes) + " volumes" : "Read" },
        { v: fmtNum(m.finished || 0), l: "Manga finished" },
        { v: fmtNum(m.watching || 0), l: "Reading" },
        { v: fmtNum(m.planning || 0), l: "Planning" },
        { v: m.topGenre || "N/A", l: "Top genre" },
        { v: fmtNum(m.count || 0), l: "Total entries" },
    ]
}

function renderHero(m) {
    var cards = statItems(m)
    var html = '<div class="hero">'
    for (var i = 0; i < cards.length; i++) {
        html += '<div class="card reveal" style="animation-delay:' + (i * 70) + 'ms"><div class="value">' + esc(cards[i].v) + '</div><div class="label">' + esc(cards[i].l) + '</div></div>'
    }
    return html + '</div>'
}

function renderChips(m) {
    var items = statItems(m)
    var html = '<span class="stat-line">'
    for (var i = 0; i < items.length; i++) {
        html += '<span class="chip"><span class="v">' + esc(items[i].v) + '</span><span class="l">' + esc(items[i].l) + '</span></span>'
    }
    return html + '</span>'
}

function renderFavorites(m, showEmpty) {
    if (!m.favorites.length) {
        if (!showEmpty) return ''
        return '<div class="section-title">Favorites</div><div class="card zero reveal">No favorites on your AniList profile yet.</div>'
    }
    var items = ''
    for (var i = 0; i < m.favorites.length; i++) {
        var f = m.favorites[i]
        items += '<a class="fav" role="button" tabindex="0" data-id="' + esc(f.id) + '" title="' + esc(f.title) + '">' +
            '<span class="cover"><img src="' + esc(f.cover) + '" alt="' + esc(f.title) + '" loading="lazy"></span>' +
            (IS_DASH ? '<div class="t">' + esc(f.title) + '</div>' : '') + '</a>'
    }
    var body = IS_DASH
        ? '<div class="fav-grid reveal">' + items + '</div>'
        : '<div class="favs-wrap reveal"><div class="favs">' + items + '</div></div>'
    return '<div class="section-title">Favorites</div>' + body
}

function openFav(ev) {
    var id = Number(ev.currentTarget.getAttribute("data-id"))
    if (id) window.webview.send("open-media", { id: id, type: MODE })
}
${isDash ? `
function renderToggle() {
    return '<div class="toggle" data-active="' + esc(MODE) + '"><span class="thumb"></span>' +
        '<button data-mode="anime" class="' + (MODE === "anime" ? "active" : "") + '">Anime</button>' +
        '<button data-mode="manga" class="' + (MODE === "manga" ? "active" : "") + '">Manga</button>' +
        '</div>'
}

function renderGenres(m) {
    if (!m.genres.length) return ''
    var max = m.genres[0].units || 1
    var unitLabel = MODE === "anime" ? " hrs" : " ch"
    var html = '<div class="section-title">Top genres</div><div class="card reveal">'
    for (var i = 0; i < m.genres.length; i++) {
        var g = m.genres[i]
        var val = MODE === "anime" ? Math.round(g.units / 60) : g.units
        html += '<div class="bar-row"><div class="bar-label">' + esc(g.name) + '</div>' +
            '<div class="bar-track"><div class="bar-fill" style="width:' + Math.max(2, Math.round(g.units / max * 100)) + '%;animation-delay:' + (i * 55) + 'ms"></div></div>' +
            '<div class="bar-val">' + fmtNum(val) + unitLabel + '</div></div>'
    }
    return html + '</div>'
}

function renderStudios(m) {
    if (MODE !== "anime" || !m.studios.length) return ''
    var max = m.studios[0].count || 1
    var html = '<div class="section-title">Top studios</div><div class="card reveal">'
    for (var i = 0; i < m.studios.length; i++) {
        var s = m.studios[i]
        html += '<div class="bar-row"><div class="bar-label">' + esc(s.name) + '</div>' +
            '<div class="bar-track"><div class="bar-fill" style="width:' + Math.max(2, Math.round(s.count / max * 100)) + '%;animation-delay:' + (i * 55) + 'ms"></div></div>' +
            '<div class="bar-val">' + fmtNum(s.count) + ' titles</div></div>'
    }
    return html + '</div>'
}

function donutCard(title, parts) {
    var total = 0
    for (var i = 0; i < parts.length; i++) total += parts[i].count
    if (!total) return ''
    var stops = []
    var legend = ''
    var acc = 0
    for (var j = 0; j < parts.length; j++) {
        var p = parts[j]
        if (!p.count) continue
        var color = 'var(--donut-' + (j % 6) + ')'
        var from = acc / total * 360
        acc += p.count
        var to = acc / total * 360
        stops.push(color + ' ' + from + 'deg ' + to + 'deg')
        legend += '<div><span class="dot" style="background:' + color + '"></span>' + esc(p.name) + ' <span class="c">' + fmtNum(p.count) + '</span></div>'
    }
    return '<div class="section-title">' + title + '</div><div class="card donut reveal">' +
        '<div class="ring-wrap"><div class="ring" style="background: conic-gradient(' + stops.join(",") + ')"></div>' +
        '<div class="ring-center"><span class="n">' + fmtNum(total) + '</span><span class="l">Entries</span></div></div>' +
        '<div class="legend">' + legend + '</div></div>'
}

function renderFormats(m) {
    if (!m.formats.length) return ''
    return donutCard('Formats', m.formats.map(function (f) { return { name: f.name, count: f.count } }))
}

function renderStatuses(m) {
    var isAnime = MODE === "anime"
    return donutCard('Status breakdown', [
        { name: isAnime ? 'Watching' : 'Reading', count: m.watching || 0 },
        { name: 'Completed', count: m.finished || 0 },
        { name: 'Paused', count: m.paused || 0 },
        { name: 'Dropped', count: m.dropped || 0 },
        { name: 'Planning', count: m.planning || 0 },
        { name: isAnime ? 'Rewatching' : 'Rereading', count: m.repeating || 0 },
    ])
}

function renderYears(m) {
    var ys = m.releaseYears || []
    if (!ys.length) return ''
    var first = ys[0].year
    var last = ys[ys.length - 1].year
    var range = last - first + 1
    var data = ys
    if (range > ys.length && range <= 50) {
        var byYear = {}
        for (var i = 0; i < ys.length; i++) byYear[ys[i].year] = ys[i].count
        data = []
        for (var y = first; y <= last; y++) data.push({ year: y, count: byYear[y] || 0 })
    }
    var max = 1
    for (var k = 0; k < data.length; k++) if (data[k].count > max) max = data[k].count
    var step = Math.ceil(data.length / 12)
    var cols = ''
    var labels = ''
    for (var j = 0; j < data.length; j++) {
        cols += '<div class="col" style="height:' + Math.max(3, Math.round(data[j].count / max * 100)) + '%;animation-delay:' + (j * 25) + 'ms" title="' + data[j].count + ' from ' + data[j].year + '"></div>'
        labels += '<span>' + (j % step === 0 ? data[j].year : '') + '</span>'
    }
    return '<div class="section-title">By release year</div><div class="card reveal">' +
        '<div class="cols">' + cols + '</div><div class="cols-labels">' + labels + '</div></div>'
}

function renderScores(m) {
    if (!m.scores.length) return ''
    var max = 1
    for (var i = 0; i < m.scores.length; i++) if (m.scores[i].count > max) max = m.scores[i].count
    var cols = ''
    var labels = ''
    for (var j = 0; j < m.scores.length; j++) {
        var s = m.scores[j]
        cols += '<div class="col" style="height:' + Math.max(3, Math.round(s.count / max * 100)) + '%;animation-delay:' + (j * 45) + 'ms" title="' + s.count + ' rated ' + s.score + '"></div>'
        labels += '<span>' + s.score + '</span>'
    }
    return '<div class="section-title">Score distribution</div><div class="card reveal">' +
        '<div class="cols">' + cols + '</div><div class="cols-labels">' + labels + '</div></div>'
}
` : ""}
function render() {
    var root = document.getElementById("root")
    if (!PAYLOAD) { root.innerHTML = '<div class="zero">Loading stats...</div>'; return }
    if (!PAYLOAD.ok) {
        root.innerHTML = '<div class="card zero reveal"><span class="big">⚡</span>' + (PAYLOAD.reason === "not-logged-in"
            ? "Log in to AniList in Seanime settings to see your stats."
            : 'Could not load stats.${isDash ? ` <button class="btn" onclick=\\'window.webview.send("refresh")\\'>Retry</button>` : ""}') + '</div>'
        return
    }
    var d = PAYLOAD.data
    var m = d[MODE]
    ${isDash ? `var html = '<div class="topbar reveal">' +
        '<span class="brandmark"><span class="t">SeaStats</span><span class="u">' + esc(d.username) + '</span></span>' +
        '<span class="right-tools">' + renderToggle() + '<span class="muted">Updated ' + new Date(d.fetchedAt).toLocaleString() + '</span> <button class="btn" onclick=\\'window.webview.send("refresh")\\'>Refresh</button></span>' +
        '</div>'
    if (!m.count) {
        html += '<div class="card zero reveal"><span class="big">🌱</span>No ' + esc(MODE) + ' data yet.</div>'
    } else {
        html += renderHero(m)
        var genresHtml = renderGenres(m)
        var studiosHtml = renderStudios(m)
        var statusHtml = renderStatuses(m)
        if (genresHtml && !studiosHtml && statusHtml) { studiosHtml = statusHtml; statusHtml = '' }
        if (genresHtml && studiosHtml) html += '<div class="grid-2"><div>' + genresHtml + '</div><div>' + studiosHtml + '</div></div>'
        else html += genresHtml + studiosHtml
        var parts = [renderFormats(m), statusHtml, renderScores(m)].filter(Boolean)
        if (parts.length === 3) html += '<div class="grid-3"><div>' + parts[0] + '</div><div>' + parts[1] + '</div><div>' + parts[2] + '</div></div>'
        else if (parts.length === 2) html += '<div class="grid-2"><div>' + parts[0] + '</div><div>' + parts[1] + '</div></div>'
        else html += parts.join('')
        html += renderYears(m)
        html += renderFavorites(m, true)
    }` : `var html = '<div class="strip reveal">' +
        '<span class="brandmark"><span class="t">SeaStats</span></span>' +
        (m.count ? renderChips(m) : '<span class="muted">No ' + esc(MODE) + ' data yet</span>') +
        '</div>'
    if (m.count) html += renderFavorites(m, false)`}
    root.innerHTML = html
    var btns = root.querySelectorAll(".toggle button")
    for (var i = 0; i < btns.length; i++) {
        btns[i].addEventListener("click", function (ev) {
            MODE = ev.currentTarget.getAttribute("data-mode")
            render()
        })
    }
    var favs = root.querySelectorAll(".fav[data-id]")
    for (var j = 0; j < favs.length; j++) {
        favs[j].addEventListener("click", openFav)
        favs[j].addEventListener("keydown", function (ev) {
            if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); openFav(ev) }
        })
    }
}

var LAST_RENDERED = ""
window.webview.on("stats", function (payload) {
    var key = ""
    try { key = JSON.stringify(payload) } catch (e) {}
    if (key && key === LAST_RENDERED) return
    LAST_RENDERED = key
    PAYLOAD = payload
    render()
})

window.webview.on("theme", function (t) {
    if (!t) return
    var r = document.documentElement.style
    r.setProperty("--background", t.background)
    r.setProperty("--paper", t.paper)
    r.setProperty("--g900", t.g900)
    r.setProperty("--g800", t.g800)
    r.setProperty("--brand", t.brand)
    r.setProperty("--brand-light", t.brandLight)
})
</script>
</body>
</html>`
    }

    const SIDEBAR_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/></svg>`

    return {
        CACHE_KEY: CACHE_KEY,
        CACHE_AT_KEY: CACHE_AT_KEY,
        CACHE_TTL_MS: CACHE_TTL_MS,
        STATS_QUERY: STATS_QUERY,
        DEFAULT_THEME: DEFAULT_THEME,
        errMsg: errMsg,
        normalizeStats: normalizeStats,
        parseTheme: parseTheme,
        buildShellHtml: buildShellHtml,
        SIDEBAR_ICON: SIDEBAR_ICON,
    }
}

function init() {
    $shared.define("seastats", createSeaStats)
    $ui.register((ctx: any) => {
        const S = $shared.use("seastats")
        const statsState = ctx.state(null)

        const widget = ctx.newWebview({
            slot: "after-home-screen-toolbar",
            fullWidth: true,
            autoHeight: true,
        })
        const mangaWidget = ctx.newWebview({
            slot: "manga-screen-bottom",
            fullWidth: true,
            autoHeight: true,
        })
        const dashboard = ctx.newWebview({
            slot: "screen",
            fullWidth: true,
            autoHeight: true,
            sidebar: { label: "SeaStats", icon: S.SIDEBAR_ICON },
        })

        let theme = S.DEFAULT_THEME

        widget.setContent(() => S.buildShellHtml("widget", "anime", theme))
        mangaWidget.setContent(() => S.buildShellHtml("widget", "manga", theme))
        dashboard.setContent(() => S.buildShellHtml("dashboard", undefined, theme))
        widget.channel.sync("stats", statsState)
        mangaWidget.channel.sync("stats", statsState)
        dashboard.channel.sync("stats", statsState)

        const THEME_VARS = ["--color-brand-500", "--color-brand-400", "--background", "--paper", "--color-gray-800", "--color-gray-900"]
        async function syncAppTheme() {
            try {
                const root: any = await ctx.dom.queryOne("html")
                if (!root) return
                let cssText = ""
                if (typeof root.getComputedStyle === "function") {
                    for (let i = 0; i < THEME_VARS.length; i++) {
                        const v = await root.getComputedStyle(THEME_VARS[i])
                        if (v && String(v).trim()) cssText += THEME_VARS[i] + ": " + String(v).trim() + "; "
                    }
                }
                if (!cssText) cssText = (await root.getAttribute("style")) || ""
                const next = S.parseTheme(cssText)
                if (JSON.stringify(next) === JSON.stringify(theme)) return
                theme = next
                widget.channel.send("theme", theme)
                mangaWidget.channel.send("theme", theme)
                dashboard.channel.send("theme", theme)
            } catch (e) {
                console.error("SeaStats: theme sync failed: " + S.errMsg(e))
            }
        }

        ctx.dom.onReady(() => {
            syncAppTheme()
            try { ctx.setTimeout(() => { syncAppTheme() }, 2500) } catch (e) {}
        })
        ctx.dom.onMainTabReady(() => { syncAppTheme() })

        const FAV_STATE_QUERY = `query ($id: Int) { Media(id: $id) { isFavourite } }`
        const FAV_TOGGLE_MUTATION = `mutation ($animeId: Int, $mangaId: Int) { ToggleFavourite(animeId: $animeId, mangaId: $mangaId) { anime(page: 1, perPage: 50) { nodes { id } } manga(page: 1, perPage: 50) { nodes { id } } } }`

        const favHeartStyle = { fontSize: "1.05rem", lineHeight: "1" }
        const favButtons: Record<string, any> = {
            anime: ctx.action.newAnimePageButton({ label: "♡", intent: "alert-subtle", tooltipText: "Add to AniList favorites", style: favHeartStyle }),
            manga: ctx.action.newMangaPageButton({ label: "♡", intent: "alert-subtle", tooltipText: "Add to AniList favorites", style: favHeartStyle }),
        }
        const favCurrent: Record<string, { id: number, fav: boolean }> = {}

        const FAV_KNOWN_KEY = "fav.known"
        const FAV_KNOWN_TTL_MS = 10 * 60 * 1000
        let favKnown: Record<string, { fav: boolean, at: number }> = {}
        try { favKnown = $storage.get(FAV_KNOWN_KEY) || {} } catch (e) {}

        function rememberFav(id: number, fav: boolean) {
            const now = Date.now()
            for (const k in favKnown) {
                if (now - favKnown[k].at > FAV_KNOWN_TTL_MS) delete favKnown[k]
            }
            favKnown[String(id)] = { fav: fav, at: now }
            try { $storage.set(FAV_KNOWN_KEY, favKnown) } catch (e) {}
        }

        function styleFavButton(kind: "anime" | "manga", fav: boolean) {
            favButtons[kind].setLabel(fav ? "♥" : "♡")
            favButtons[kind].setTooltipText(fav ? "Remove from AniList favorites" : "Add to AniList favorites")
        }

        function refreshFavButton(kind: "anime" | "manga", id: number) {
            const btn = favButtons[kind]
            try {
                const token = $database.anilist.getToken()
                if (!token) return
                btn.setLoading(true)
                const res = $anilist.customQuery({ query: FAV_STATE_QUERY, variables: { id: id } }, token)
                const root = res && res.Media ? res : (res && res.data) || {}
                let fav = !!(root.Media && root.Media.isFavourite)
                const known = favKnown[String(id)]
                if (known && Date.now() - known.at < FAV_KNOWN_TTL_MS && known.fav !== fav) fav = known.fav
                favCurrent[kind] = { id: id, fav: fav }
                styleFavButton(kind, fav)
            } catch (e) {
                console.error("SeaStats: favorite lookup failed: " + S.errMsg(e))
            }
            btn.setLoading(false)
        }

        const favLastClick: Record<string, number> = {}

        function onFavClick(kind: "anime" | "manga") {
            return (event: any) => {
                const btn = favButtons[kind]
                try {
                    const now = Date.now()
                    if (favLastClick[kind] && now - favLastClick[kind] < 2000) return
                    favLastClick[kind] = now
                    const id = (event && event.media && event.media.id) || (favCurrent[kind] && favCurrent[kind].id) || 0
                    if (!id) return
                    const token = $database.anilist.getToken()
                    if (!token) {
                        ctx.toast.error("Log in to AniList to manage favorites")
                        return
                    }
                    btn.setLoading(true)
                    const res = $anilist.customQuery({
                        query: FAV_TOGGLE_MUTATION,
                        variables: kind === "anime" ? { animeId: id } : { mangaId: id },
                    }, token)
                    const toggled = (res && res.ToggleFavourite) || {}
                    const nodes = ((kind === "anime" ? toggled.anime : toggled.manga) || {}).nodes || []
                    let fav = false
                    for (let i = 0; i < nodes.length; i++) {
                        if (nodes[i] && nodes[i].id === id) fav = true
                    }
                    favCurrent[kind] = { id: id, fav: fav }
                    rememberFav(id, fav)
                    styleFavButton(kind, fav)
                    ctx.toast.success(fav ? "Added to AniList favorites" : "Removed from AniList favorites")
                    loadStats(true, true)
                } catch (e) {
                    console.error("SeaStats: toggle favorite failed: " + S.errMsg(e))
                    ctx.toast.error("SeaStats: could not update favorite")
                }
                btn.setLoading(false)
            }
        }

        favButtons.anime.onClick(onFavClick("anime"))
        favButtons.manga.onClick(onFavClick("manga"))
        if ($database.anilist.getToken()) {
            favButtons.anime.mount()
            favButtons.manga.mount()
        }

        ctx.screen.onNavigate((e: any) => {
            syncAppTheme()
            try {
                const id = Number(e && e.searchParams && e.searchParams.id)
                if (!id) return
                if (e.pathname === "/entry") refreshFavButton("anime", id)
                else if (e.pathname === "/manga/entry") refreshFavButton("manga", id)
            } catch (err) {
                console.error("SeaStats: " + S.errMsg(err))
            }
        })
        ctx.screen.loadCurrent()

        async function loadStats(force: boolean, quiet?: boolean) {
            try {
                const token = $database.anilist.getToken()
                if (!token) {
                    statsState.set({ ok: false, reason: "not-logged-in" })
                    return
                }
                const cached = $storage.get(S.CACHE_KEY)
                const fetchedAt = $storage.get(S.CACHE_AT_KEY)
                if (!force && cached && fetchedAt && Date.now() - fetchedAt < S.CACHE_TTL_MS) {
                    statsState.set({ ok: true, data: cached })
                    return
                }
                try {
                    const raw = $anilist.customQuery({ query: S.STATS_QUERY }, token)
                    const data = S.normalizeStats(raw, Date.now())
                    $storage.set(S.CACHE_KEY, data)
                    $storage.set(S.CACHE_AT_KEY, data.fetchedAt)
                    statsState.set({ ok: true, data: data })
                    if (force && !quiet) ctx.toast.success("Stats refreshed")
                } catch (e) {
                    console.error("SeaStats: fetch failed: " + S.errMsg(e))
                    if (cached) {
                        statsState.set({ ok: true, data: cached })
                        ctx.toast.warning("SeaStats: using cached stats")
                    } else {
                        statsState.set({ ok: false, reason: "fetch-failed" })
                    }
                }
            } catch (e) {
                console.error("SeaStats: " + S.errMsg(e))
                statsState.set({ ok: false, reason: "fetch-failed" })
            }
        }

        function openMedia(payload: any) {
            try {
                const id = payload && Number(payload.id)
                if (!id) return
                ctx.screen.navigateTo(payload.type === "manga" ? "/manga/entry?id=" + id : "/entry?id=" + id)
            } catch (e) {
                console.error("SeaStats: navigation failed: " + S.errMsg(e))
            }
        }

        dashboard.channel.on("refresh", () => { loadStats(true) })
        widget.channel.on("open-media", openMedia)
        mangaWidget.channel.on("open-media", openMedia)
        dashboard.channel.on("open-media", openMedia)
        loadStats(false)
    })
}
