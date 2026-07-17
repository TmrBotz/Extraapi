// ============================================
// EXTRAFLIX SCRAPER - Cloudflare Worker (FIXED)
// ============================================

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname;

      if (path === '/health') {
        return new Response(JSON.stringify({
          status: 'ok',
          timestamp: new Date().toISOString()
        }), { headers: corsHeaders });
      }

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

async function scrapePost(postUrl) {
  console.log(`🔄 Scraping: ${postUrl}`);

  try {
    const response = await fetchWithRetry(postUrl);
    const html = await response.text();

    const title = extractTitle(html);
    const poster = extractPoster(html);
    const imdbRating = extractIMDB(html);
    const downloadLinks = extractDownloadLinks(html);
    
    console.log(`📦 Found ${downloadLinks.length} download links`);
    
    const finalLinks = [];
    for (const link of downloadLinks) {
      try {
        console.log(`🔗 Resolving: ${link.url}`);
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
        await sleep(500);
      } catch (error) {
        console.error(`❌ Error resolving ${link.url}:`, error.message);
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
// HTML PARSING HELPERS (FIXED)
// ============================================

function extractTitle(html) {
  const match = html.match(/<h1[^>]*class="[^"]*page-title[^"]*"[^>]*>([^<]+)<\/h1>/i);
  return match ? match[1].trim() : null;
}

function extractPoster(html) {
  const patterns = [
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

function extractIMDB(html) {
  const match = html.match(/IMDb Rating:<\/strong>.*?>\s*([\d.]+)\s*<\/a>/is);
  return match ? match[1] : null;
}

function extractDownloadLinks(html) {
  const links = [];
  
  // ========== METHOD 1: Find all fasc-button links ==========
  // Pattern: <a class="fasc-button ..." href="URL">Download Link</a>
  const fascRegex = /<a[^>]*class="[^"]*fasc-button[^"]*"[^>]*href="([^"]+)"[^>]*>.*?Download\s*Link.*?<\/a>/gi;
  let match;
  let linkUrls = [];
  
  while ((match = fascRegex.exec(html)) !== null) {
    const url = match[1];
    if (url && (url.includes('links.linkshub.fun') || url.includes('linkhub'))) {
      linkUrls.push(url);
    }
  }
  
  // ========== METHOD 2: Extract from download-options-section ==========
  const sectionMatch = html.match(/<div[^>]*class="[^"]*download-options-section[^"]*"[^>]*>(.*?)<\/div>/is);
  if (sectionMatch) {
    const sectionHtml = sectionMatch[1];
    
    // Find all <p> tags
    const pRegex = /<p[^>]*>(.*?)<\/p>/gi;
    let pMatch;
    let quality = null;
    let size = null;
    let url = null;
    
    while ((pMatch = pRegex.exec(sectionHtml)) !== null) {
      const content = pMatch[1];
      
      // Check for quality label
      const qualityMatch = content.match(/(\d+p|\dK)\s+(?:HEVC\s+)?(?:x\d+)?\s*[–-]?\s*\[([^\]]+)\]/i);
      if (qualityMatch) {
        quality = qualityMatch[1].toLowerCase();
        size = qualityMatch[2].trim();
        // Try to find link in same paragraph
        const linkInP = content.match(/<a[^>]*href="([^"]+)"[^>]*>/i);
        if (linkInP) {
          url = linkInP[1];
          if (url && (url.includes('links.linkshub.fun') || url.includes('linkhub'))) {
            links.push({
              quality: quality,
              label: `Download ${quality}`,
              size: size,
              url: url
            });
            quality = null;
            size = null;
            url = null;
          }
        }
      }
      
      // Check for link without quality (fallback)
      const linkMatch = content.match(/<a[^>]*href="([^"]+)"[^>]*>.*?Download\s*Link.*?<\/a>/i);
      if (linkMatch && quality) {
        url = linkMatch[1];
        if (url && (url.includes('links.linkshub.fun') || url.includes('linkhub'))) {
          links.push({
            quality: quality,
            label: `Download ${quality}`,
            size: size || 'Unknown',
            url: url
          });
          quality = null;
          size = null;
          url = null;
        }
      }
    }
  }
  
  // ========== METHOD 3: Direct link extraction from entire HTML ==========
  // Find all links with quality in surrounding text
  const allLinks = html.match(/<a[^>]*href="([^"]*links\.linkshub\.fun[^"]*)"[^>]*>/gi) || [];
  for (const linkHtml of allLinks) {
    const urlMatch = linkHtml.match(/href="([^"]+)"/i);
    if (!urlMatch) continue;
    const url = urlMatch[1];
    
    // Check if already added
    if (linkUrls.includes(url)) continue;
    
    // Try to find quality from surrounding context
    const contextStart = html.indexOf(linkHtml) - 200;
    const contextEnd = html.indexOf(linkHtml) + linkHtml.length + 200;
    const context = html.substring(Math.max(0, contextStart), Math.min(html.length, contextEnd));
    
    const qualityMatch = context.match(/(\d+p|\dK)\s+(?:HEVC\s+)?(?:x\d+)?\s*[–-]?\s*\[([^\]]+)\]/i);
    if (qualityMatch) {
      links.push({
        quality: qualityMatch[1].toLowerCase(),
        label: `Download ${qualityMatch[1].toLowerCase()}`,
        size: qualityMatch[2].trim(),
        url: url
      });
    } else {
      // Fallback: try to determine quality from filename
      const fileMatch = url.match(/\.(\d+p|4k)/i) || context.match(/(\d+p|4K)/i);
      const quality = fileMatch ? fileMatch[1].toLowerCase() : 'unknown';
      links.push({
        quality: quality,
        label: `Download ${quality}`,
        size: 'Unknown',
        url: url
      });
    }
  }
  
  // Remove duplicates based on URL
  const uniqueLinks = [];
  const seenUrls = new Set();
  for (const link of links) {
    if (!seenUrls.has(link.url)) {
      seenUrls.add(link.url);
      uniqueLinks.push(link);
    }
  }
  
  console.log(`✅ Extracted ${uniqueLinks.length} unique links`);
  return uniqueLinks;
}

// ============================================
// SHORT LINK RESOLVER
// ============================================

async function resolveShortLink(shortUrl) {
  console.log(`🔗 Resolving: ${shortUrl}`);
  
  try {
    const response = await fetchWithRetry(shortUrl);
    const html = await response.text();
    
    const mirrors = [];
    let mainUrl = null;
    
    // Pattern 1: Direct drivehub/hubdrive links
    const linkRegex = /<a[^>]*href="([^"]*drivehub[^"]*|[^"]*hubdrive[^"]*)"[^>]*>/gi;
    let match;
    
    while ((match = linkRegex.exec(html)) !== null) {
      const url = match[1];
      if (url && (url.includes('drivehub') || url.includes('hubdrive'))) {
        mirrors.push(url);
        if (!mainUrl) mainUrl = url;
      }
    }
    
    // Pattern 2: Links in flex div
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
    
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const fileInfo = titleMatch ? titleMatch[1] : null;
    
    const sizeMatch = html.match(/([\d.]+)\s*(GB|MB)/i);
    const fileSize = sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2]}` : null;
    
    return {
      mainUrl: mainUrl,
      mirrors: [...new Set(mirrors)],
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
