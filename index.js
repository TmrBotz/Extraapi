// ============================================================
// SkyMoviesHD Scraper — Cloudflare Worker
// Flow: skymovieshd movie page → howblogs.xyz → final links
//       (hubcloud / hubdrive / gdflix only)
// ============================================================

const SKYMOVIES_BASE = "https://skymovieshd.ceo";
const HOWBLOGS_BASE  = "https://howblogs.xyz";

// Domains to KEEP from howblogs output
const ALLOWED_DOMAINS = [
  "hubcloud.cx",
  "hubdrive.tips",
  "gdflix.dev",
];

// howblogs short-codes to SKIP (Google Drive direct + SERVER links)
// These are identified by their label text on the movie page
const SKIP_LABELS = [
  "google drive direct",
  "server 0",
  "server 1",
  "server 2",
  "server 3",
  "server 4",
  "server 5",
  "server 6",
  "watch online",
];

// ── Helpers ──────────────────────────────────────────────────

function html(content, status = 200) {
  return new Response(content, {
    status,
    headers: { "Content-Type": "text/html;charset=utf-8" },
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json;charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

async function fetchHTML(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// ── Step 0: Parse movie title from .Robiul div ───────────────

function parseMovieTitle(html) {
  // <div class='Robiul'><b> TITLE </b>  </div>
  const m = html.match(/<div\s+class=['"]Robiul['"][^>]*>\s*<b>\s*([\s\S]*?)\s*<\/b>/i);
  if (!m) return null;
  return m[1].replace(/<[^>]+>/g, "").trim(); // strip any inner tags
}

// ── Step 1: Parse movie page → extract howblogs links ────────

function parseMoviePage(html) {
  // Grab the .Bolly div content
  const bollyMatch = html.match(/<div class=['"]Bolly['"][^>]*>([\s\S]*?)<\/div>/i);
  if (!bollyMatch) return [];

  const bollyHTML = bollyMatch[1];

  // Extract all <a href="..." > LABEL </a>
  const linkRegex = /<a\s+href=['"]([^'"]+)['"]\s*[^>]*>([^<]*)<\/a>/gi;
  const results = [];
  let m;

  while ((m = linkRegex.exec(bollyHTML)) !== null) {
    const href  = m[1].trim();
    const label = m[2].trim();

    if (!href) continue;
    if (!href.startsWith("https://howblogs.xyz/")) continue;

    // Skip SERVER / GDrive / Watch Online links by label
    const labelLower = label.toLowerCase();
    const shouldSkip = SKIP_LABELS.some((s) => labelLower.includes(s));
    if (shouldSkip) continue;

    results.push({ label, url: href });
  }

  return results;
}

// ── Step 2: Parse howblogs page → extract final links ────────

function parseHowblogsPage(pageHTML) {
  // Links are inside .cotent-box div
  const boxMatch = pageHTML.match(
    /<div\s+class=['"]cotent-box['"][^>]*>([\s\S]*?)<\/div>/i
  );
  if (!boxMatch) return [];

  const boxHTML = boxMatch[1];
  const linkRegex = /<a\s+href=['"]([^'"]+)['"]/gi;
  const results = [];
  let m;

  while ((m = linkRegex.exec(boxHTML)) !== null) {
    const href = m[1].trim();
    if (!href.startsWith("http")) continue;

    try {
      const domain = new URL(href).hostname.replace(/^www\./, "");
      if (ALLOWED_DOMAINS.includes(domain)) {
        results.push(href);
      }
    } catch (_) {
      // invalid URL — skip
    }
  }

  return results;
}

// ── Main scraper ──────────────────────────────────────────────

async function scrapeMovie(movieSlug) {
  // Build full movie URL
  // Accept either a full URL or just the slug/path
  let movieURL;
  if (movieSlug.startsWith("http")) {
    movieURL = movieSlug;
  } else {
    // strip leading slash if present
    const slug = movieSlug.replace(/^\//, "");
    movieURL = `${SKYMOVIES_BASE}/movie/${slug}`;
    // ensure .html extension
    if (!movieURL.endsWith(".html")) movieURL += ".html";
  }

  // ── Step 1: Fetch movie page
  let movieHTML;
  try {
    movieHTML = await fetchHTML(movieURL);
  } catch (e) {
    return { error: `Movie page fetch failed: ${e.message}`, url: movieURL };
  }

  // ── Step 1.5: Extract title
  const title = parseMovieTitle(movieHTML);

  // ── Step 2: Extract howblogs links
  const howblogsLinks = parseMoviePage(movieHTML);
  if (howblogsLinks.length === 0) {
    return {
      error: "No processable howblogs links found on movie page",
      url: movieURL,
    };
  }

  // ── Step 3: Fetch each howblogs link concurrently
  const settled = await Promise.allSettled(
    howblogsLinks.map(async ({ label, url }) => {
      let pageHTML;
      try {
        pageHTML = await fetchHTML(url);
      } catch (e) {
        return { label, source: url, links: [], error: e.message };
      }

      const links = parseHowblogsPage(pageHTML);
      return { label, source: url, links };
    })
  );

  const groups = settled.map((r) =>
    r.status === "fulfilled" ? r.value : { error: r.reason?.message }
  );

  // Flatten all final links (deduplicated)
  const allLinks = [
    ...new Set(groups.flatMap((g) => g.links || [])),
  ];

  return {
    title,
    movie: movieURL,
    howblogs_processed: howblogsLinks.length,
    groups,           // per-quality breakdown
  };
}

// ── Router ────────────────────────────────────────────────────

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // ── GET /scrape?url=<full_movie_url>
    //    GET /scrape?slug=<movie-slug.html>
    if (path === "/scrape") {
      const movieURL  = url.searchParams.get("url");
      const movieSlug = url.searchParams.get("slug");

      if (!movieURL && !movieSlug) {
        return json(
          { error: "Provide ?url=<movie_url> or ?slug=<movie_slug.html>" },
          400
        );
      }

      try {
        const result = await scrapeMovie(movieURL || movieSlug);
        return json(result);
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    // ── GET / → usage info
    if (path === "/" || path === "") {
      return html(`
        <h2>SkyMoviesHD Scraper</h2>
        <p><b>Usage:</b></p>
        <pre>GET /scrape?url=https://skymovieshd.ceo/movie/SLUG.html</pre>
        <pre>GET /scrape?slug=Desire-(2026)-720p-HEVC-HDRip-ORG.-[Dual-Audio]-[Hindi-or-English]-x265-ESubs-[750MB].html</pre>
        <p><b>Returns:</b> JSON with hubcloud / hubdrive / gdflix links</p>
      `);
    }

    return json({ error: "Not found" }, 404);
  },
};
