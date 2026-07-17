// ============================================================
//  HubDrive → HubCloud → Sportverse  DL Link Extractor
//  Cloudflare Worker  |  Professional Web Scraper
//  Deploy: wrangler deploy
// ============================================================

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Cache-Control": "max-age=0",
};

// ─── CORS helper ───────────────────────────────────────────
function corsHeaders(origin = "*") {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

function errorResponse(message, step = null, status = 400) {
  return jsonResponse({ success: false, error: message, step }, status);
}

// ─── Fetch with Referer spoofing ───────────────────────────
async function fetchPage(url, referer = null, extraHeaders = {}) {
  const hdrs = {
    ...HEADERS,
    ...(referer ? { Referer: referer } : {}),
    ...extraHeaders,
  };

  const res = await fetch(url, {
    method: "GET",
    headers: hdrs,
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }

  return await res.text();
}

// ─── STEP 1: hubdrive.tips/file/{id} ──────────────────────
//   Extract:
//     • hubcloud.ist/drive/{drive_id}  link
//     • file name, size, type
function parseHubDrive(html, pageUrl) {
  // File metadata
  const titleMatch = html.match(/<title>HubDrive \| (.+?)<\/title>/i);
  const fileName = titleMatch ? titleMatch[1].trim() : null;

  const sizeMatch = html.match(
    /<td>File Size<\/td>\s*<td[^>]*>([\d.]+ [A-Z]+)<\/td>/i
  );
  const fileSize = sizeMatch ? sizeMatch[1].trim() : null;

  const typeMatch = html.match(
    /<td>File Type<\/td>\s*<td[^>]*>([^<]+)<\/td>/i
  );
  const fileType = typeMatch ? typeMatch[1].trim() : null;

  // HubCloud link — pattern: href="https://hubcloud.ist/drive/..."
  const hubcloudMatch = html.match(
    /href="(https:\/\/hubcloud\.ist\/drive\/[^"]+)"/i
  );
  const hubcloudUrl = hubcloudMatch ? hubcloudMatch[1] : null;

  // Telegram link from hubdrive page
  const tgMatch = html.match(
    /href="(https:\/\/hubcloud\.ist\/tg\/go\?id=[^"]+)"/i
  );
  const telegramDirect = tgMatch ? tgMatch[1] : null;

  if (!hubcloudUrl) {
    throw new Error("HubCloud link not found on HubDrive page");
  }

  return { fileName, fileSize, fileType, hubcloudUrl, telegramDirect };
}

// ─── STEP 2: hubcloud.ist/drive/{drive_id} ─────────────────
//   Extract:  sportverse.cc URL  (from JS var or anchor tag)
function parseHubCloud(html, driveUrl) {
  // Primary: JS variable  var url = 'https://sportverse.cc/...'
  let sportverseUrl = null;

  const varMatch = html.match(/var\s+url\s*=\s*['"]([^'"]+sportverse[^'"]+)['"]/i);
  if (varMatch) sportverseUrl = varMatch[1];

  // Fallback: anchor tag id="download"
  if (!sportverseUrl) {
    const anchorMatch = html.match(
      /<a[^>]+id=["']download["'][^>]+href=["']([^"']+sportverse[^"']+)["']/i
    );
    if (anchorMatch) sportverseUrl = anchorMatch[1];
  }

  if (!sportverseUrl) {
    throw new Error("Sportverse URL not found on HubCloud page");
  }

  return { sportverseUrl };
}

// ─── STEP 3: sportverse.cc/hubcloud.php?... ────────────────
//   Extract:
//     • FSL Server   — <a id="fsl" href="...">
//     • PixelDrain   — var pxl = "..."
//     • Telegram     — hubcloud.cx/tg/go?id=...
function parseSportverse(html) {
  const links = {};

  // 1. FSL Server (Cloudflare R2) — anchor tag id="fsl"
  const fslMatch = html.match(/<a[^>]+id=["']fsl["'][^>]+href=["']([^"']+)["']/i);
  if (fslMatch) links.fsl = fslMatch[1];

  // 2. PixelDrain — JS variable  var pxl = "..."
  const pxlMatch = html.match(/var\s+pxl\s*=\s*["']([^"']+pixeldrain[^"']+)["']/i);
  if (pxlMatch) links.pixeldrain = pxlMatch[1];

  // 3. Telegram — hubcloud.cx/tg/go
  const tgMatch = html.match(
    /href=["'](https:\/\/hubcloud\.cx\/tg\/go\?id=[^"']+)["']/i
  );
  if (tgMatch) links.telegram = tgMatch[1];

  // Share link
  const shareMatch = html.match(
    /href=["'](https:\/\/hubcloud\.cx\/drive\/[^"']+)["'][^>]*readonly/i
  );
  if (!shareMatch) {
    // try input value
    const inputMatch = html.match(
      /value=["'](https:\/\/hubcloud\.cx\/drive\/[^"']+)["']/i
    );
    if (inputMatch) links.shareLink = inputMatch[1];
  } else {
    links.shareLink = shareMatch[1];
  }

  return links;
}

// ─── MAIN SCRAPER ──────────────────────────────────────────
async function scrapeHubDrive(fileUrl) {
  const result = {
    success: false,
    sourceUrl: fileUrl,
    file: {},
    links: {},
    steps: {},
  };

  // ── Step 1: HubDrive ──
  let step1Html;
  try {
    step1Html = await fetchPage(fileUrl, "https://www.google.com/");
  } catch (e) {
    throw { message: `HubDrive fetch failed: ${e.message}`, step: "hubdrive" };
  }

  let step1;
  try {
    step1 = parseHubDrive(step1Html, fileUrl);
  } catch (e) {
    throw { message: e.message, step: "hubdrive_parse" };
  }

  result.file = {
    name: step1.fileName,
    size: step1.fileSize,
    type: step1.fileType,
  };
  result.steps.hubdriveUrl = fileUrl;
  result.steps.hubcloudUrl = step1.hubcloudUrl;
  if (step1.telegramDirect) result.links.telegramDirect = step1.telegramDirect;

  // ── Step 2: HubCloud ──
  let step2Html;
  try {
    step2Html = await fetchPage(step1.hubcloudUrl, fileUrl);
  } catch (e) {
    throw { message: `HubCloud fetch failed: ${e.message}`, step: "hubcloud" };
  }

  let step2;
  try {
    step2 = parseHubCloud(step2Html, step1.hubcloudUrl);
  } catch (e) {
    throw { message: e.message, step: "hubcloud_parse" };
  }

  result.steps.sportverseUrl = step2.sportverseUrl;

  // ── Step 3: Sportverse ──
  let step3Html;
  try {
    step3Html = await fetchPage(step2.sportverseUrl, step1.hubcloudUrl, {
      // Sportverse expects hubcloud as referer
      Referer: step1.hubcloudUrl,
    });
  } catch (e) {
    throw { message: `Sportverse fetch failed: ${e.message}`, step: "sportverse" };
  }

  let step3;
  try {
    step3 = parseSportverse(step3Html);
  } catch (e) {
    throw { message: e.message, step: "sportverse_parse" };
  }

  result.links = {
    ...result.links,
    fsl: step3.fsl || null,
    pixeldrain: step3.pixeldrain || null,
    telegram: step3.telegram || null,
    shareLink: step3.shareLink || null,
  };

  result.success = true;
  result.scrapedAt = new Date().toISOString();

  return result;
}

// ─── WORKER ENTRY POINT ────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Health check
    if (url.pathname === "/" || url.pathname === "/health") {
      return jsonResponse({
        status: "ok",
        service: "HubDrive DL Scraper",
        version: "1.0.0",
        usage: "GET /scrape?url=https://hubdrive.tips/file/{ID}",
      });
    }

    // ── /scrape ──
    if (url.pathname === "/scrape") {
      // Accept both GET (?url=...) and POST (body: { url })
      let fileUrl = null;

      if (request.method === "GET") {
        fileUrl = url.searchParams.get("url");
      } else if (request.method === "POST") {
        try {
          const body = await request.json();
          fileUrl = body.url;
        } catch {
          return errorResponse("Invalid JSON body", null, 400);
        }
      } else {
        return errorResponse("Method not allowed", null, 405);
      }

      // Validate URL
      if (!fileUrl) {
        return errorResponse(
          "Missing `url` parameter. Example: /scrape?url=https://hubdrive.tips/file/2012245024",
          null,
          400
        );
      }

      if (!fileUrl.match(/^https?:\/\/hubdrive\.tips\/file\/\d+/i)) {
        return errorResponse(
          "Invalid URL. Must be: https://hubdrive.tips/file/{numeric_id}",
          null,
          400
        );
      }

      try {
        const result = await scrapeHubDrive(fileUrl);
        return jsonResponse(result);
      } catch (err) {
        // err is { message, step } from throws above
        return errorResponse(
          err.message || String(err),
          err.step || "unknown",
          502
        );
      }
    }

    // 404
    return jsonResponse(
      {
        error: "Not Found",
        endpoints: [
          "GET  /health",
          "GET  /scrape?url=https://hubdrive.tips/file/{ID}",
          "POST /scrape  body: { \"url\": \"https://hubdrive.tips/file/{ID}\" }",
        ],
      },
      404
    );
  },
};
