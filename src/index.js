// ============================================
// EXTRAFLIX SCRAPER - Cloudflare Worker
// No KV, No Cache - Direct Scraping
// ============================================

export default {
  async fetch(request, env, ctx) {
    // CORS Headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json'
    };

    // Handle OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // Health check (optional)
      if (path === '/health') {
        return new Response(JSON.stringify({
          status: 'ok',
          timestamp: new Date().toISOString()
        }), { headers: corsHeaders });
      }

      // ONLY scrape endpoint
      if (path === '/scrape' && request.method === 'GET') {
        const postUrl = url.searchParams.get('url');
        if (!postUrl) {
          return new Response(JSON.stringify({
            error: 'Missing "url" parameter. Usage: /scrape?url=POST_URL'
          }), { status: 400, headers: corsHeaders });
        }

        const result = await scrapePost(postUrl);
        return new Response(JSON.stringify(result, null, 2), { 
          headers: corsHeaders 
        });
      }

      // Invalid route
      return new Response(JSON.stringify({
        error: 'Invalid endpoint',
        usage: '/scrape?url=YOUR_POST_URL'
      }), { status: 404, headers: corsHeaders });

    } catch (error) {
      return new Response(JSON.stringify({
        error: error.message
      }), { status: 500, headers: corsHeaders });
    }
  }
};

// ============================================
// CORE SCRAPING FUNCTIONS
// ============================================

/**
 * Scrape a single post page and extract all download links
 */
async function scrapePost(postUrl) {
  console.log(`🔄 Scraping: ${postUrl}`);

  try {
    // Fetch the post page
    const response = await fetchWithRetry(postUrl);
    const html = await response.text();

    // Extract data
    const title = extractTitle(html);
    const poster = extractPoster(html);
    const imdbRating = extractIMDB(html);
    const downloadLinks = extractDownloadLinks(html);
    
    // Follow each short link to get final URL
    const finalLinks = [];
    for (const link of downloadLinks) {
      try {
        const finalUrl = await resolveShortLink(link.url);
        finalLinks.push({
          quality: link.quality,
          label: link.label,
          size: link.size,
          finalUrl: finalUrl.mainUrl,
          mirrors: finalUrl.mirrors || [],
          fileInfo: finalUrl.fileInfo,
          fileSize: finalUrl.fileSize
        });
        // Rate limiting - small delay between requests
        await sleep(500);
      } catch (error) {
        finalLinks.push({
          quality: link.quality,
          label: link.label,
          size: link.size,
          error: error.message,
          finalUrl: null,
          mirrors: []
        });
      }
    }

    return {
      success: true,
      url: postUrl,
      title: title,
      poster: poster,
      imdbRating: imdbRating,
      totalLinks: downloadLinks.length,
      links: finalLinks,
      scrapedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error(`❌ Error scraping ${postUrl}:`, error);
    return {
      success: false,
      url: postUrl,
      error: error.message,
      scrapedAt: new Date().toISOString()
    };
  }
}

// ============================================
// HTML PARSING HELPERS
// ============================================

/**
 * Extract post title from HTML
 */
function extractTitle(html) {
  const match = html.match(/<h1[^>]*class="[^"]*page-title[^"]*"[^>]*>([^<]+)<\/h1>/i);
  return match ? match[1].trim() : null;
}

/**
 * Extract poster image URL
 */
function extractPoster(html) {
  // Try multiple patterns
  const patterns = [
    /<img[^>]*class="[^"]*Poster-Container[^"]*"[^>]*src="([^"]+)"/i,
    /<img[^>]*src="([^"]*image\.tmdb\.org[^"]+)"[^>]*>/i,
    /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i,
    /<meta[^>]*name="twitter:image"[^>]*content="([^"]+)"/i
  ];
  
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) return match[1];
  }
  
  return null;
}

/**
 * Extract IMDb rating
 */
function extractIMDB(html) {
  const match = html.match(/IMDb Rating:<\/strong>.*?>\s*([\d.]+)\s*<\/a>/is);
  return match ? match[1] : null;
}

/**
 * Extract all download links from post page
 */
function extractDownloadLinks(html) {
  const links = [];
  
  // Find download options section
  const sectionMatch = html.match(/<div[^>]*class="[^"]*download-options-section[^"]*"[^>]*>(.*?)<\/div>/is);
  if (!sectionMatch) return links;
  
  const sectionHtml = sectionMatch[1];
  
  // Find all download links with quality labels
  const parts = sectionHtml.split(/<p>/i);
  
  let currentQuality = null;
  let currentSize = null;
  
  for (const part of parts) {
    // Check for quality label (480p, 720p, 1080p, 4K)
    const qualityMatch = part.match(/(\d+p|\dK)\s+(?:HEVC\s+)?(?:x\d+)?\s*[–-]?\s*\[([^\]]+)\]/i);
    if (qualityMatch) {
      currentQuality = qualityMatch[1].toLowerCase();
      currentSize = qualityMatch[2].trim();
    }
    
    // Find link
    const linkMatch = part.match(/<a[^>]*href="([^"]+)"[^>]*>.*?Download\s*Link.*?<\/a>/is);
    if (linkMatch && currentQuality) {
      const url = linkMatch[1];
      
      // Check if it's a short link
      if (url.includes('links.linkshub.fun') || url.includes('linkhub')) {
        links.push({
          quality: currentQuality,
          label: `Download ${currentQuality}`,
          size: currentSize || 'Unknown',
          url: url
        });
        currentQuality = null;
        currentSize = null;
      }
    }
  }
  
  return links;
}

// ============================================
// SHORT LINK RESOLVER
// ============================================

/**
 * Resolve links.linkshub.fun short URL to final download URL
 */
async function resolveShortLink(shortUrl) {
  console.log(`🔗 Resolving: ${shortUrl}`);
  
  try {
    // Fetch the short link page
    const response = await fetchWithRetry(shortUrl);
    const html = await response.text();
    
    // Extract all final URLs from the page
    const mirrors = [];
    
    // Pattern 1: Direct drivehub/hubdrive links
    const linkRegex = /<a[^>]*href="([^"]*drivehub[^"]*|[^"]*hubdrive[^"]*)"[^>]*>/gi;
    let match;
    let mainUrl = null;
    
    while ((match = linkRegex.exec(html)) !== null) {
      const url = match[1];
      if (url && (url.includes('drivehub') || url.includes('hubdrive'))) {
        mirrors.push(url);
        if (!mainUrl) mainUrl = url;
      }
    }
    
    // Pattern 2: Links in div with flex display
    if (!mainUrl) {
      const altRegex = /<div[^>]*style="[^"]*display:flex[^"]*"[^>]*>.*?<a[^>]*href="([^"]*drivehub[^"]*)"[^>]*>/is;
      const altMatch = html.match(altRegex);
      if (altMatch) {
        mainUrl = altMatch[1];
        if (!mirrors.includes(mainUrl)) mirrors.unshift(mainUrl);
      }
    }
    
    // Pattern 3: Any /file/ link
    if (!mainUrl) {
      const fileRegex = /<a[^>]*href="([^"]*\/file\/[^"]+)"[^>]*>/i;
      const fileMatch = html.match(fileRegex);
      if (fileMatch) {
        mainUrl = fileMatch[1];
        if (!mirrors.includes(mainUrl)) mirrors.unshift(mainUrl);
      }
    }
    
    if (!mainUrl) {
      throw new Error('No download URL found on short link page');
    }
    
    // Extract file info from title
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const fileInfo = titleMatch ? titleMatch[1] : null;
    
    // Extract file size from title or page
    const sizeMatch = html.match(/([\d.]+)\s*(GB|MB)/i);
    const fileSize = sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2]}` : null;
    
    return {
      mainUrl: mainUrl,
      mirrors: [...new Set(mirrors)], // Remove duplicates
      fileInfo: fileInfo,
      fileSize: fileSize
    };
    
  } catch (error) {
    console.error(`❌ Error resolving ${shortUrl}:`, error);
    throw error;
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Fetch with retry logic
 */
async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          ...options.headers
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return response;
      
    } catch (error) {
      lastError = error;
      console.warn(`⏳ Attempt ${attempt}/${maxRetries} failed: ${error.message}`);
      
      if (attempt < maxRetries) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
        await sleep(delay);
      }
    }
  }
  
  throw lastError || new Error('All retry attempts failed');
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
