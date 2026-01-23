/* =========================
   DIGIY MARKET PRO — GUARD (GH PAGES SAFE)
   - Slug source of truth: URL > session > localStorage
   - Login: slug + pin -> RPC verify_access_pin
   - Session longue (90 jours) pour usage intensif terrain
   - Expose:
     DIGIY_GUARD.boot()
     DIGIY_GUARD.loginWithPin(slug,pin)
     DIGIY_GUARD.logout()
     DIGIY_GUARD.getSession()
     DIGIY_GUARD.getSlug()
     DIGIY_GUARD.withSlug(url)
     DIGIY_GUARD.go(url)
========================= */
(function(){
  "use strict";

  // =============================
  // SUPABASE (RESTO/LOC PROJ)
  // =============================
  const SUPABASE_URL = "https://wesqmwjjtsefyjnluosj.supabase.co";
  const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indlc3Ftd2pqdHNlZnlqbmx1b3NqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxNzg4ODIsImV4cCI6MjA4MDc1NDg4Mn0.dZfYOc2iL2_wRYL3zExZFsFSBK6AbMeOid2LrIjcTdA";

  // =============================
  // STORAGE KEYS
  // =============================
  const K = {
    SESSION: "DIGIY_MARKET_PRO_SESSION_V1",
    SLUG: "DIGIY_SLUG",
    PRO_ID: "DIGIY_PRO_ID",
    TITLE: "DIGIY_TITLE",
    PHONE: "DIGIY_PHONE"
  };

  const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 jours

  function now(){ return Date.now(); }

  // =============================
  // SAFE localStorage
  // =============================
  function lsGet(k){ try{ return localStorage.getItem(k); }catch(_){ return null; } }
  function lsSet(k,v){ try{ localStorage.setItem(k, String(v ?? "")); }catch(_){ } }
  function lsDel(k){ try{ localStorage.removeItem(k); }catch(_){ } }

  // =============================
  // URL slug
  // =============================
  function urlSlug(){
    try{
      const s = new URLSearchParams(location.search).get("slug");
      return (s || "").trim();
    }catch(_){
      return "";
    }
  }

  function cleanSlug(s){
    const x = String(s || "").trim();
    if(!x) return "";
    return x
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
      .replace(/[^a-z0-9\-_]/g,"")
      .replace(/-+/g,"-")
      .replace(/^_+|_+$/g,"");
  }

  // =============================
  // SESSION
  // =============================
  function getSession(){
    try{
      const raw = lsGet(K.SESSION);
      if(!raw) return null;
      const s = JSON.parse(raw);
      if(!s || !s.expires_at) return null;
      if(now() > s.expires_at) return null;
      return s;
    }catch(_){
      return null;
    }
  }

  function setSession(data){
    const s = {
      ...data,
      created_at: now(),
      expires_at: now() + SESSION_TTL_MS
    };
    try{ localStorage.setItem(K.SESSION, JSON.stringify(s)); }catch(_){}
    return s;
  }

  function clearSession(){
    lsDel(K.SESSION);
  }

  // =============================
  // SUPABASE
  // =============================
  function getSb(){
    if(!window.supabase?.createClient) return null;
    if(!window.__digiy_sb__){
      window.__digiy_sb__ = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return window.__digiy_sb__;
  }

  // =============================
  // SLUG source of truth
  // =============================
  function safeSessionObj(){
    try{
      const s = getSession();
      return (s && typeof s === "object") ? s : null;
    }catch(_){
      return null;
    }
  }

  function getSlug(){
    const u = cleanSlug(urlSlug());
    if(u) return u;

    const sess = safeSessionObj();
    const ss = cleanSlug(sess?.slug || "");
    if(ss) return ss;

    return cleanSlug(lsGet(K.SLUG) || "");
  }

  function syncSlugFromUrl(){
    const u = cleanSlug(urlSlug());
    if(!u) return null;
    const cur = cleanSlug(lsGet(K.SLUG) || "");
    if(cur !== u) lsSet(K.SLUG, u);
    return u;
  }

  function withSlug(url){
    const s = getSlug();
    try{
      const u = new URL(url, location.href);
      if(s) u.searchParams.set("slug", s);
      return u.toString();
    }catch(_){
      if(!s) return url;
      return url + (url.includes("?") ? "&" : "?") + "slug=" + encodeURIComponent(s);
    }
  }

  function go(url){
    location.replace(withSlug(url));
  }

  // =============================
  // LOGIN (slug + pin -> RPC)
  // =============================
  async function loginWithPin(slug, pin){
    const sb = getSb();
    if(!sb) return { ok:false, error:"Supabase non initialisé (script Supabase manquant ou bloqué)" };

    slug = cleanSlug(slug);
    pin  = String(pin || "").trim();

    if(!slug || !pin) return { ok:false, error:"Slug et PIN requis" };

    const payload = {
      p_slug: slug,
      p_pin: pin
      // si ton RPC attend module:
      // ,p_module: "market_pro"
    };

    const { data, error } = await sb.rpc("verify_access_pin", payload);
    if(error) return { ok:false, error: error.message };

    const res = (typeof data === "string") ? safeJsonParse(data) : data;
    if(!res?.ok || !res?.owner_id){
      return { ok:false, error: res?.error || "PIN invalide" };
    }

    // session + mirrors
    const session = setSession({
      ok: true,
      module: "market_pro",
      owner_id: res.owner_id,
      slug: cleanSlug(res.slug || slug),
      title: res.title || "",
      phone: res.phone || ""
    });

    // mirrors utiles cross-modules
    lsSet(K.PRO_ID, session.owner_id);
    lsSet(K.SLUG, session.slug);
    if(session.title) lsSet(K.TITLE, session.title);
    if(session.phone) lsSet(K.PHONE, session.phone);

    return { ok:true, session };
  }

  function safeJsonParse(s){
    try{ return JSON.parse(s); }catch(_){ return null; }
  }

  // =============================
  // PROTECTION / BOOT
  // =============================
  function requireSession(redirect){
    const s = getSession();
    if(!s || !s.owner_id){
      location.replace(redirect || "./pin.html");
      return null;
    }
    return s;
  }

  async function boot(options){
    const loginUrl = options?.login || "./pin.html";
    syncSlugFromUrl();

    const s = requireSession(loginUrl);
    if(!s) return { ok:false };

    // garde slug aligné
    const urlS = cleanSlug(urlSlug());
    const finalSlug = urlS || cleanSlug(s.slug) || cleanSlug(lsGet(K.SLUG) || "");
    if(finalSlug && finalSlug !== cleanSlug(s.slug)){
      s.slug = finalSlug;
      setSession(s);
      lsSet(K.SLUG, finalSlug);
    }

    return { ok:true, session: s, slug: finalSlug || "" };
  }

  // =============================
  // LOGOUT
  // =============================
  function logout(redirect){
    clearSession();
    // mirrors optionnels (tu peux garder DIGIY_PRO_ID si tu veux)
    // lsDel(K.PRO_ID);
    // lsDel(K.SLUG);
    location.replace(redirect || "./pin.html");
  }

  // =============================
  // EXPORT
  // =============================
  window.DIGIY_GUARD = window.DIGIY_GUARD || {};
  window.DIGIY_GUARD.getSb = getSb;
  window.DIGIY_GUARD.getSession = getSession;
  window.DIGIY_GUARD.loginWithPin = loginWithPin;
  window.DIGIY_GUARD.boot = boot;
  window.DIGIY_GUARD.logout = logout;
  window.DIGIY_GUARD.getSlug = getSlug;
  window.DIGIY_GUARD.withSlug = withSlug;
  window.DIGIY_GUARD.go = go;
  window.DIGIY_GUARD.syncSlugFromUrl = syncSlugFromUrl;

  // sync dès chargement
  syncSlugFromUrl();
})();
