// ============================================================
//  HubDrive → HubCloud → Sportverse  DL Link Extractor
//  Cloudflare Worker with FlareSolverr Integration
//  Professional Web Scraper
// ============================================================

// ─── Configuration ──────────────────────────────────────────
const CONFIG = {
  // FlareSolverr service (self-host or use public)
  FLARESOLVERR_URL: "https://flare.solverr.com/v1", // Public instance (rate limited)
  // For self-hosting: http://localhost:8191/v1
  TIMEOUT: 60000,
  MAX_RETRIES: 3,
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

// ─── Fetch with FlareSolverr ──────────────────────────────
async function fetchWithFlareSolverr(url, referer = null) {
  const requestData = {
    cmd: "request.get",
    url: url,
    maxTimeout: CONFIG.TIMEOUT,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Connection": "keep-alive",
    },
  };

  if (referer) {
    requestData.headers.Referer = referer;
  }

  try {
    const response = await fetch(CONFIG.FLARESOLVERR_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      throw new Error(`FlareSolverr error: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.status !== "ok") {
      throw new Error(`FlareSolverr: ${data.message || "Unknown error"}`);
    }

    return data.solution.response;
  } catch (error) {
    console.error("FlareSolverr fetch error:", error);
    throw error;
  }
}

// ─── Fallback: Direct fetch with advanced headers ─────────
async function fetchDirect(url, referer = null) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
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
  };
  
  if (referer) {
    headers["Referer"] = referer;
  }

  const response = await fetch(url, {
    method: "GET",
    headers: headers,
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return await response.text();
}

// ─── Smart fetch with retry logic ─────────────────────────
async function fetchPage(url, referer = null, retryCount = 0) {
  try {
    // First try: FlareSolverr
    console.log(`Fetching ${url} via FlareSolverr...`);
    return await fetchWithFlareSolverr(url, referer);
  } catch (error) {
    console.log(`FlareSolverr failed: ${error.message}`);
    
    // Second try: Direct fetch
    try {
      console.log(`Trying direct fetch for ${url}...`);
      return await fetchDirect(url, referer);
    } catch (directError) {
      console.log(`Direct fetch failed: ${directError.message}`);
      
      // Retry with FlareSolverr
      if (retryCount < CONFIG.MAX_RETRIES) {
        console.log(`Retry ${retryCount + 1}/${CONFIG.MAX_RETRIES}...`);
        await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)));
        return fetchPage(url, referer, retryCount + 1);
      }
      
      throw error;
    }
  }
}

// ─── STEP 1: hubdrive.tips/file/{id} ──────────────────────
function parseHubDrive(html) {
  const result = {
    fileName: null,
    fileSize: null,
    fileType: null,
    hubcloudUrl: null,
    telegramDirect: null,
  };

  // File name
  const titleMatch = html.match(/<title>HubDrive \| (.+?)<\/title>/i);
  if (titleMatch) result.fileName = titleMatch[1].trim();

  // File size
  const sizeMatch = html.match(
    /<td>File Size<\/td>\s*<td[^>]*>([\d.]+ [A-Z]+)<\/td>/i
  );
  if (sizeMatch) result.fileSize = sizeMatch[1].trim();

  // File type
  const typeMatch = html.match(
    /<td>File Type<\/td>\s*<td[^>]*>([^<]+)<\/td>/i
  );
  if (typeMatch) result.fileType = typeMatch[1].trim();

  // HubCloud link (multiple patterns)
  const patterns = [
    /href="(https:\/\/hubcloud\.ist\/drive\/[^"]+)"/i,
    /href="(https:\/\/hubcloud\.cx\/drive\/[^"]+)"/i,
    /window\.location\.href\s*=\s*['"]([^'"]+drive[^'"]+)['"]/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      result.hubcloudUrl = match[1];
      break;
    }
  }

  // Telegram direct
  const tgMatch = html.match(
    /href="(https:\/\/hubcloud\.(?:ist|cx)\/tg\/go\?id=[^"]+)"/i
  );
  if (tgMatch) result.telegramDirect = tgMatch[1];

  if (!result.hubcloudUrl) {
    throw new Error("HubCloud link not found on HubDrive page");
  }

  return result;
}

// ─── STEP 2: hubcloud.ist/drive/{drive_id} ─────────────────
function parseHubCloud(html) {
  let sportverseUrl = null;

  const patterns = [
    /var\s+url\s*=\s*['"]([^'"]+sportverse[^'"]+)['"]/i,
    /<a[^>]+id=["']download["'][^>]+href=["']([^"']+sportverse[^"']+)["']/i,
    /window\.location\.href\s*=\s*['"]([^'"]+sportverse[^'"]+)['"]/i,
    /href="(https:\/\/sportverse\.cc[^"]+)"/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      sportverseUrl = match[1];
      break;
    }
  }

  if (!sportverseUrl) {
    throw new Error("Sportverse URL not found on HubCloud page");
  }

  return { sportverseUrl };
}

// ─── STEP 3: sportverse.cc/hubcloud.php?... ────────────────
function parseSportverse(html) {
  const links = {};

  // FSL Server
  const fslMatch = html.match(/<a[^>]+id=["']fsl["'][^>]+href=["']([^"']+)["']/i);
  if (fslMatch) links.fsl = fslMatch[1];

  // PixelDrain
  const pxlMatch = html.match(/var\s+pxl\s*=\s*["']([^"']+pixeldrain[^"']+)["']/i);
  if (pxlMatch) links.pixeldrain = pxlMatch[1];

  // Telegram
  const tgMatch = html.match(
    /href=["'](https:\/\/hubcloud\.cx\/tg\/go\?id=[^"']+)["']/i
  );
  if (tgMatch) links.telegram = tgMatch[1];

  // Share link
  const shareMatch = html.match(
    /href=["'](https:\/\/hubcloud\.cx\/drive\/[^"']+)["'][^>]*readonly/i
  );
  if (shareMatch) {
    links.shareLink = shareMatch[1];
  } else {
    const inputMatch = html.match(
      /value=["'](https:\/\/hubcloud\.cx\/drive\/[^"']+)["']/i
    );
    if (inputMatch) links.shareLink = inputMatch[1];
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
    step1 = parseHubDrive(step1Html);
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
    step2 = parseHubCloud(step2Html);
  } catch (e) {
    throw { message: e.message, step: "hubcloud_parse" };
  }

  result.steps.sportverseUrl = step2.sportverseUrl;

  // ── Step 3: Sportverse ──
  let step3Html;
  try {
    step3Html = await fetchPage(step2.sportverseUrl, step1.hubcloudUrl);
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
        version: "3.0.0",
        features: [
          "FlareSolverr integration",
          "Automatic Cloudflare bypass",
          "Multiple fetch strategies",
          "Automatic retry"
        ],
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
