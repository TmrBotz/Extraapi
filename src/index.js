// ============================================
// EXTRAFLIX SCRAPER - FINAL FIXED VERSION
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
          finalUrl: finalUrl.mainUrl,
          mirrors: finalUrl.mirrors || [],
          fileInfo: finalUrl.fileInfo,
          fileSize: finalUrl.fileSize
        });
        await sleep(500);
      } catch (error) {
        console.error(`❌ Error resolving ${link.url}:`, error.message);
        finalLinks.push({
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
// HTML PARSING HELPERS - FIXED
// ============================================

function extractTitle(html) {
  const match = html.match(/<h1[^>]*class="[^"]*page-title[^"]*"[^>]*>([^<]+)<\/h1>/i);
  return match ? match[1].trim() : null;
}

function extractPoster(html) {
  // Try to get poster from the img in Poster-Container
  const posterMatch = html.match(/<img[^>]*src="([^"]*image\.tmdb\.org[^"]*)"[^>]*>/i);
  if (posterMatch) return posterMatch[1];
  
  // Try og:image
  const ogMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
  if (ogMatch) return ogMatch[1];
  
  return null;
}

function extractIMDB(html) {
  const match = html.match(/IMDb Rating:<\/strong>.*?>\s*([\d.]+)\s*<\/a>/is);
  return match ? match[1] : null;
}

function extractDownloadLinks(html) {
  const links = [];
  
  console.log('🔍 Searching for download links...');
  
  // ========== METHOD 1: Direct search for links.linkshub.fun ==========
  // Find all links with links.linkshub.fun
  const linkRegex = /<a[^>]*href="(https?:\/\/links\.linkshub\.fun\/view\/[^"]+)"[^>]*>/gi;
  let match;
  let foundUrls = [];
  
  while ((match = linkRegex.exec(html)) !== null) {
    const url = match[1];
    if (!foundUrls.includes(url)) {
      foundUrls.push(url);
    }
  }
  
  console.log(`📍 Found ${foundUrls.length} links.linkshub.fun URLs`);
  
  // Now find quality labels near these URLs
  for (const url of foundUrls) {
    // Get context around this URL
    const urlIndex = html.indexOf(url);
    const contextStart = Math.max(0, urlIndex - 300);
    const contextEnd = Math.min(html.length, urlIndex + 300);
    const context = html.substring(contextStart, contextEnd);
    
    // Try to find quality and size
    let quality = 'unknown';
    let size = 'Unknown';
    
    // Look for quality patterns in context
    const qualityPatterns = [
      /(\d+p)\s+(?:HEVC\s+)?(?:x\d+)?\s*[–-]?\s*\[([^\]]+)\]/i,
      /(\d+p)\s+[–-]\s*\[([^\]]+)\]/i,
      /(\d+p)\s+\[([^\]]+)\]/i,
      /(\dK)\s+UHD\s+[–-]\s*\[([^\]]+)\]/i
    ];
    
    for (const pattern of qualityPatterns) {
      const qMatch = context.match(pattern);
      if (qMatch) {
        quality = qMatch[1].toLowerCase();
        size = qMatch[2] ? qMatch[2].trim() : 'Unknown';
        break;
      }
    }
    
    // If still unknown, try to find standalone quality
    if (quality === 'unknown') {
      const simpleMatch = context.match(/(\d+p|\dK)/i);
      if (simpleMatch) {
        quality = simpleMatch[1].toLowerCase();
      }
    }
    
    links.push({
      quality: quality,
      label: `Download ${quality}`,
      size: size,
      url: url
    });
  }
  
  // ========== METHOD 2: Search in download-options-section ==========
  const sectionMatch = html.match(/<div[^>]*class="[^"]*download-options-section[^"]*"[^>]*>(.*?)<\/div>/is);
  if (sectionMatch) {
    const sectionHtml = sectionMatch[1];
    console.log('📍 Found download-options-section');
    
    // Extract all paragraphs
    const pRegex = /<p[^>]*>(.*?)<\/p>/gi;
    let pMatch;
    let currentQuality = null;
    let currentSize = null;
    
    while ((pMatch = pRegex.exec(sectionHtml)) !== null) {
      const content = pMatch[1];
      
      // Check for quality line
      const qMatch = content.match(/(\d+p|\dK)\s+(?:HEVC\s+)?(?:x\d+)?\s*[–-]?\s*\[([^\]]+)\]/i);
      if (qMatch) {
        currentQuality = qMatch[1].toLowerCase();
        currentSize = qMatch[2].trim();
        console.log(`📍 Found quality: ${currentQuality}, size: ${currentSize}`);
      }
      
      // Check for download link
      const linkMatch = content.match(/<a[^>]*href="([^"]+)"[^>]*>/i);
      if (linkMatch && currentQuality) {
        const url = linkMatch[1];
        if (url.includes('links.linkshub.fun') || url.includes('linkhub')) {
          // Check if already added
          const exists = links.some(l => l.url === url);
          if (!exists) {
            links.push({
              quality: currentQuality,
              label: `Download ${currentQuality}`,
              size: currentSize || 'Unknown',
              url: url
            });
            console.log(`✅ Added link: ${currentQuality} - ${url}`);
          }
          currentQuality = null;
          currentSize = null;
        }
      }
    }
  }
  
  // ========== METHOD 3: Search for any link with Download Link text ==========
  const downloadRegex = /<a[^>]*href="([^"]+)"[^>]*>.*?Download\s*Link.*?<\/a>/gi;
  while ((match = downloadRegex.exec(html)) !== null) {
    const url = match[1];
    if (url.includes('links.linkshub.fun') || url.includes('linkhub')) {
      const exists = links.some(l => l.url === url);
      if (!exists) {
        // Try to find quality from surrounding text
        const idx = html.indexOf(url);
        const ctx = html.substring(Math.max(0, idx - 200), Math.min(html.length, idx + 200));
        const qMatch = ctx.match(/(\d+p|\dK)/i);
        const quality = qMatch ? qMatch[1].toLowerCase() : 'unknown';
        const sizeMatch = ctx.match(/\[([^\]]+)\]/);
        const size = sizeMatch ? sizeMatch[1] : 'Unknown';
        
        links.push({
          quality: quality,
          label: `Download ${quality}`,
          size: size,
          url: url
        });
        console.log(`✅ Added link (method 3): ${quality} - ${url}`);
      }
    }
  }
  
  // Remove duplicates
  const uniqueLinks = [];
  const seenUrls = new Set();
  for (const link of links) {
    if (!seenUrls.has(link.url)) {
      seenUrls.add(link.url);
      uniqueLinks.push(link);
    }
  }
  
  console.log(`✅ Total unique links found: ${uniqueLinks.length}`);
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
    
    // Extract all drivehub/hubdrive links
    const linkRegex = /<a[^>]*href="([^"]*drivehub[^"]*|[^"]*hubdrive[^"]*)"[^>]*>/gi;
    let match;
    
    while ((match = linkRegex.exec(html)) !== null) {
      const url = match[1];
      if (url && (url.includes('drivehub') || url.includes('hubdrive'))) {
        mirrors.push(url);
        if (!mainUrl) mainUrl = url;
      }
    }
    
    // If no links found, try alternative pattern
    if (!mainUrl) {
      const altRegex = /<a[^>]*href="([^"]*)"[^>]*>.*?https?:\/\/[^"]*drivehub[^"]*.*?<\/a>/is;
      const altMatch = html.match(altRegex);
      if (altMatch) {
        const urlMatch = altMatch[1].match(/https?:\/\/[^"]*drivehub[^"]*/i);
        if (urlMatch) {
          mainUrl = urlMatch[0];
          mirrors.push(mainUrl);
        }
      }
    }
    
    // Try direct file links
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
    
    // Extract file info
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
