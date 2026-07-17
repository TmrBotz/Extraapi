// ============================================================
//  HubDrive → HubCloud → Sportverse  DL Link Extractor
//  Cloudflare Worker  |  Professional Web Scraper
//  Deploy: wrangler deploy
// ============================================================

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Connection": "keep-alive",
  "Upgrade-Insecure-Requests": "1",
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Cache-Control": "max-age=0",
  "Pragma": "no-cache",
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

// ─── Fetch with Retry and Multiple User-Agents ───────────
async function fetchPage(url, referer = null, extraHeaders = {}, retryCount = 0) {
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Linux; Android 13; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36"
  ];

  const headers = {
    ...HEADERS,
    "User-Agent": userAgents[retryCount % userAgents.length],
    ...(referer ? { Referer: referer } : {}),
    ...extraHeaders,
  };

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: headers,
      redirect: "follow",
      cf: {
        cacheTtl: 0,
        cacheEverything: false,
      }
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return await res.text();
  } catch (error) {
    // Retry with different user-agent if 403 or timeout
    if ((error.message.includes("403") || error.message.includes("timeout")) && retryCount < 3) {
      console.log(`Retry ${retryCount + 1} for ${url}`);
      // Add delay before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
      return fetchPage(url, referer, extraHeaders, retryCount + 1);
    }
    throw error;
  }
}

// ─── STEP 1: hubdrive.tips/file/{id} ──────────────────────
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

  // HubCloud link
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
function parseHubCloud(html, driveUrl) {
  let sportverseUrl = null;

  // Primary: JS variable
  const varMatch = html.match(/var\s+url\s*=\s*['"]([^'"]+sportverse[^'"]+)['"]/i);
  if (varMatch) sportverseUrl = varMatch[1];

  // Fallback: anchor tag
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
function parseSportverse(html) {
  const links = {};

  // 1. FSL Server
  const fslMatch = html.match(/<a[^>]+id=["']fsl["'][^>]+href=["']([^"']+)["']/i);
  if (fslMatch) links.fsl = fslMatch[1];

  // 2. PixelDrain
  const pxlMatch = html.match(/var\s+pxl\s*=\s*["']([^"']+pixeldrain[^"']+)["']/i);
  if (pxlMatch) links.pixeldrain = pxlMatch[1];

  // 3. Telegram
  const tgMatch = html.match(
    /href=["'](https:\/\/hubcloud\.cx\/tg\/go\?id=[^"']+)["']/i
  );
  if (tgMatch) links.telegram = tgMatch[1];

  // Share link
  const shareMatch = html.match(
    /href=["'](https:\/\/hubcloud\.cx\/drive\/[^"']+)["'][^>]*readonly/i
  );
  if (!shareMatch) {
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
    step1Html = await fetchPage(fileUrl, "https://hubdrive.tips/");
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
        version: "1.0.1",
        usage: "GET /scrape?url=https://hubdrive.tips/file/{ID}",
      });
    }

    // ── /scrape ──
    if (url.pathname === "/scrape") {
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
