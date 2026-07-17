import { useState } from "react";

// ─── CONFIG: apna deployed worker URL yahan dalo ───────────
const WORKER_URL = "https://hubdrive-scraper.YOUR_SUBDOMAIN.workers.dev";

// ─── Icons ─────────────────────────────────────────────────
const IconDownload = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>
  </svg>
);
const IconCopy = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
  </svg>
);
const IconCheck = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-4 h-4">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IconLoader = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5 animate-spin">
    <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
  </svg>
);
const IconLink = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
  </svg>
);
const IconTelegram = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.820 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
  </svg>
);
const IconCloud = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
  </svg>
);

// ─── Step indicator ────────────────────────────────────────
function StepBar({ steps }) {
  return (
    <div style={{display:"flex",gap:"8px",alignItems:"center",flexWrap:"wrap"}}>
      {steps.map((s, i) => (
        <div key={i} style={{display:"flex",alignItems:"center",gap:"8px"}}>
          <div style={{
            display:"flex",alignItems:"center",gap:"6px",
            padding:"4px 10px",borderRadius:"20px",fontSize:"12px",fontWeight:600,
            background: s.done ? "rgba(99,220,140,0.15)" : s.active ? "rgba(99,160,255,0.2)" : "rgba(255,255,255,0.05)",
            color: s.done ? "#63dc8c" : s.active ? "#82b6ff" : "#666",
            border: `1px solid ${s.done ? "rgba(99,220,140,0.3)" : s.active ? "rgba(99,160,255,0.3)" : "rgba(255,255,255,0.08)"}`,
            transition: "all 0.3s"
          }}>
            {s.active && !s.done ? <IconLoader/> : s.done ? <span style={{color:"#63dc8c"}}>✓</span> : <span style={{opacity:0.4}}>{i+1}</span>}
            {s.label}
          </div>
          {i < steps.length - 1 && <span style={{color:"#333",fontSize:"12px"}}>→</span>}
        </div>
      ))}
    </div>
  );
}

// ─── Link Card ─────────────────────────────────────────────
function LinkCard({ label, url, icon, color, badge }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div style={{
      background:"rgba(255,255,255,0.04)",
      border:"1px solid rgba(255,255,255,0.09)",
      borderRadius:"12px",padding:"14px 16px",
      display:"flex",flexDirection:"column",gap:"10px"
    }}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
          <div style={{
            width:"32px",height:"32px",borderRadius:"8px",
            background:`${color}22`,border:`1px solid ${color}44`,
            display:"flex",alignItems:"center",justifyContent:"center",color
          }}>{icon}</div>
          <div>
            <div style={{fontWeight:700,fontSize:"13px",color:"#e0e0e0"}}>{label}</div>
            {badge && <div style={{fontSize:"10px",color:color,fontWeight:600,marginTop:"1px"}}>{badge}</div>}
          </div>
        </div>
        <div style={{display:"flex",gap:"6px"}}>
          <button onClick={copy} style={{
            display:"flex",alignItems:"center",gap:"5px",padding:"6px 10px",
            background: copied ? "rgba(99,220,140,0.15)" : "rgba(255,255,255,0.07)",
            border:`1px solid ${copied ? "rgba(99,220,140,0.4)" : "rgba(255,255,255,0.12)"}`,
            borderRadius:"7px",cursor:"pointer",
            color: copied ? "#63dc8c" : "#aaa",fontSize:"12px",fontWeight:600,
            transition:"all 0.2s"
          }}>
            {copied ? <><IconCheck/> Copied</> : <><IconCopy/> Copy</>}
          </button>
          <a href={url} target="_blank" rel="noopener noreferrer" style={{
            display:"flex",alignItems:"center",gap:"5px",padding:"6px 10px",
            background:color+"22",border:`1px solid ${color}44`,
            borderRadius:"7px",color,fontSize:"12px",fontWeight:700,
            textDecoration:"none",transition:"all 0.2s"
          }}>
            <IconDownload/> Open
          </a>
        </div>
      </div>
      <div style={{
        background:"rgba(0,0,0,0.3)",borderRadius:"7px",padding:"8px 10px",
        fontSize:"11px",color:"#666",fontFamily:"monospace",
        overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
        wordBreak:"break-all"
      }}>
        {url}
      </div>
    </div>
  );
}

// ─── Main App ──────────────────────────────────────────────
export default function App() {
  const [inputUrl, setInputUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [activeStep, setActiveStep] = useState(-1);

  const steps = [
    { label: "HubDrive", done: activeStep > 0, active: activeStep === 0 },
    { label: "HubCloud", done: activeStep > 1, active: activeStep === 1 },
    { label: "Sportverse", done: activeStep > 2, active: activeStep === 2 },
    { label: "Done ✓", done: result !== null, active: false },
  ];

  const handleScrape = async () => {
    if (!inputUrl.trim()) return;

    setLoading(true);
    setResult(null);
    setError(null);
    setActiveStep(0);

    // Simulate step progression visually
    const stepTimer1 = setTimeout(() => setActiveStep(1), 1200);
    const stepTimer2 = setTimeout(() => setActiveStep(2), 2800);

    try {
      const res = await fetch(`${WORKER_URL}/scrape?url=${encodeURIComponent(inputUrl.trim())}`);
      const data = await res.json();

      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);

      if (!data.success) {
        setError(`[${data.step || "error"}] ${data.error}`);
        setActiveStep(-1);
      } else {
        setActiveStep(3);
        setResult(data);
      }
    } catch (e) {
      clearTimeout(stepTimer1);
      clearTimeout(stepTimer2);
      setError(`Network error: ${e.message}`);
      setActiveStep(-1);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => { if (e.key === "Enter") handleScrape(); };

  const dlLinks = result?.links || {};
  const hasLinks = dlLinks.fsl || dlLinks.pixeldrain || dlLinks.telegram;

  return (
    <div style={{
      minHeight:"100vh",background:"#0e0e11",
      fontFamily:"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      color:"#e0e0e0",padding:"32px 16px",display:"flex",
      flexDirection:"column",alignItems:"center"
    }}>
      {/* Header */}
      <div style={{textAlign:"center",marginBottom:"36px"}}>
        <div style={{
          display:"inline-flex",alignItems:"center",gap:"10px",
          background:"rgba(99,160,255,0.1)",border:"1px solid rgba(99,160,255,0.2)",
          borderRadius:"999px",padding:"6px 16px",marginBottom:"18px",
          fontSize:"12px",fontWeight:700,color:"#82b6ff",letterSpacing:"1px"
        }}>
          ⚡ HUBDRIVE DL SCRAPER
        </div>
        <h1 style={{
          fontSize:"clamp(24px,5vw,42px)",fontWeight:800,margin:0,
          background:"linear-gradient(135deg,#82b6ff 0%,#a78bfa 50%,#63dc8c 100%)",
          WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",
          letterSpacing:"-1px"
        }}>
          Extract Download Links
        </h1>
        <p style={{margin:"10px 0 0",color:"#555",fontSize:"14px"}}>
          HubDrive → HubCloud → Direct Links • 3-step auto scrape
        </p>
      </div>

      {/* Input Card */}
      <div style={{
        width:"100%",maxWidth:"680px",
        background:"rgba(255,255,255,0.03)",
        border:"1px solid rgba(255,255,255,0.08)",
        borderRadius:"16px",padding:"24px",
        boxShadow:"0 20px 60px rgba(0,0,0,0.5)"
      }}>
        <label style={{fontSize:"12px",fontWeight:700,color:"#666",letterSpacing:"0.5px"}}>
          HUBDRIVE FILE URL
        </label>
        <div style={{display:"flex",gap:"10px",marginTop:"8px",flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:"240px",position:"relative"}}>
            <div style={{position:"absolute",left:"12px",top:"50%",transform:"translateY(-50%)",color:"#444"}}>
              <IconLink/>
            </div>
            <input
              value={inputUrl}
              onChange={e => setInputUrl(e.target.value)}
              onKeyDown={handleKey}
              placeholder="https://hubdrive.tips/file/2012245024"
              disabled={loading}
              style={{
                width:"100%",boxSizing:"border-box",
                background:"rgba(0,0,0,0.4)",
                border:"1px solid rgba(255,255,255,0.1)",
                borderRadius:"10px",padding:"12px 14px 12px 36px",
                color:"#e0e0e0",fontSize:"14px",outline:"none",
                fontFamily:"monospace",
                opacity: loading ? 0.6 : 1
              }}
            />
          </div>
          <button
            onClick={handleScrape}
            disabled={loading || !inputUrl.trim()}
            style={{
              display:"flex",alignItems:"center",gap:"8px",
              padding:"12px 24px",borderRadius:"10px",border:"none",cursor:"pointer",
              background: loading || !inputUrl.trim()
                ? "rgba(99,160,255,0.2)"
                : "linear-gradient(135deg,#3b6fd4,#5b3fd4)",
              color: loading || !inputUrl.trim() ? "#555" : "#fff",
              fontWeight:700,fontSize:"14px",whiteSpace:"nowrap",
              transition:"all 0.2s",
              boxShadow: !loading && inputUrl.trim() ? "0 4px 20px rgba(59,111,212,0.4)" : "none"
            }}
          >
            {loading ? <><IconLoader/> Scraping...</> : <><IconDownload/> Scrape Links</>}
          </button>
        </div>

        {/* Step Bar */}
        {loading && (
          <div style={{marginTop:"18px"}}>
            <StepBar steps={steps}/>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{
            marginTop:"16px",padding:"12px 14px",
            background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.25)",
            borderRadius:"10px",fontSize:"13px",color:"#f87171",fontFamily:"monospace"
          }}>
            ✗ {error}
          </div>
        )}
      </div>

      {/* Results */}
      {result && (
        <div style={{
          width:"100%",maxWidth:"680px",marginTop:"20px",
          display:"flex",flexDirection:"column",gap:"14px"
        }}>
          {/* File Info */}
          <div style={{
            background:"rgba(99,220,140,0.06)",
            border:"1px solid rgba(99,220,140,0.15)",
            borderRadius:"14px",padding:"16px 18px"
          }}>
            <div style={{fontSize:"11px",fontWeight:700,color:"#63dc8c",letterSpacing:"0.5px",marginBottom:"8px"}}>
              FILE INFO
            </div>
            <div style={{
              fontSize:"14px",fontWeight:700,color:"#e0e0e0",
              marginBottom:"6px",wordBreak:"break-all"
            }}>
              {result.file?.name || "—"}
            </div>
            <div style={{display:"flex",gap:"12px",flexWrap:"wrap"}}>
              {result.file?.size && (
                <span style={{
                  padding:"3px 10px",background:"rgba(99,160,255,0.1)",
                  border:"1px solid rgba(99,160,255,0.2)",borderRadius:"99px",
                  fontSize:"12px",color:"#82b6ff",fontWeight:600
                }}>{result.file.size}</span>
              )}
              {result.file?.type && (
                <span style={{
                  padding:"3px 10px",background:"rgba(167,139,250,0.1)",
                  border:"1px solid rgba(167,139,250,0.2)",borderRadius:"99px",
                  fontSize:"12px",color:"#a78bfa",fontWeight:600
                }}>{result.file.type}</span>
              )}
              <span style={{
                padding:"3px 10px",background:"rgba(99,220,140,0.08)",
                border:"1px solid rgba(99,220,140,0.2)",borderRadius:"99px",
                fontSize:"12px",color:"#63dc8c",fontWeight:600
              }}>
                ✓ {Object.values(dlLinks).filter(Boolean).length} links found
              </span>
            </div>
          </div>

          {/* Download Links */}
          {hasLinks && (
            <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
              <div style={{fontSize:"11px",fontWeight:700,color:"#555",letterSpacing:"0.5px",padding:"0 2px"}}>
                DOWNLOAD LINKS
              </div>

              {dlLinks.fsl && (
                <LinkCard
                  label="FSL Server"
                  url={dlLinks.fsl}
                  icon={<IconCloud/>}
                  color="#82b6ff"
                  badge="Cloudflare R2 • Fastest"
                />
              )}
              {dlLinks.pixeldrain && (
                <LinkCard
                  label="PixelDrain Server"
                  url={dlLinks.pixeldrain}
                  icon={<IconDownload/>}
                  color="#a78bfa"
                  badge="Mirror Server"
                />
              )}
              {dlLinks.telegram && (
                <LinkCard
                  label="Telegram"
                  url={dlLinks.telegram}
                  icon={<IconTelegram/>}
                  color="#29b6f6"
                  badge="via HubCloud Telegram"
                />
              )}
              {dlLinks.telegramDirect && !dlLinks.telegram && (
                <LinkCard
                  label="Telegram (Direct)"
                  url={dlLinks.telegramDirect}
                  icon={<IconTelegram/>}
                  color="#29b6f6"
                  badge="from HubDrive"
                />
              )}
            </div>
          )}

          {/* Debug info */}
          <details style={{marginTop:"4px"}}>
            <summary style={{cursor:"pointer",fontSize:"12px",color:"#444",fontWeight:600,padding:"4px 0"}}>
              Debug / Steps
            </summary>
            <pre style={{
              background:"rgba(0,0,0,0.5)",border:"1px solid rgba(255,255,255,0.06)",
              borderRadius:"8px",padding:"12px",fontSize:"11px",color:"#555",
              overflow:"auto",marginTop:"8px",lineHeight:1.6
            }}>
              {JSON.stringify(result.steps, null, 2)}
            </pre>
          </details>
        </div>
      )}

      <p style={{marginTop:"40px",fontSize:"11px",color:"#2a2a2a",textAlign:"center"}}>
        Powered by Cloudflare Workers • 3-hop scraper chain
      </p>
    </div>
  );
}
