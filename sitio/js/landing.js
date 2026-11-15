// Landing Chakra Space. Misma mecánica que la de JaguAR (escenas fijas que avanzan con el scroll),
// con tres cambios: globo terráqueo en el héroe, plantas en vez de EPP, y MODIS en vivo en vez del 3D.
import * as THREE from "../vendor/three/three.module.js";

const $ = (s) => document.querySelector(s);
const html = document.documentElement;
const KEY = "chakra.movimiento";
const still = () => html.classList.contains("quieto");
try { if (localStorage.getItem(KEY) === "no") html.classList.add("quieto"); } catch { /* sin almacenamiento */ }
const motionBtn = $("#motion");
const syncBtn = () => { motionBtn.textContent = still() ? "Activar movimiento" : "Reducir movimiento"; };
motionBtn.addEventListener("click", () => {
  html.classList.toggle("quieto"); syncBtn();
  try { localStorage.setItem(KEY, still() ? "no" : "si"); } catch { /* sin almacenamiento */ }
});
syncBtn();

const nav = $("#nav");
const onNav = () => nav.classList.toggle("solid", scrollY > 30);
addEventListener("scroll", onNav, { passive: true }); onNav();

document.querySelectorAll(".sec-title, .sec-lead, .goals article, .mascot > *, .power, .honest").forEach((el, i) => {
  el.classList.add("reveal"); el.style.transitionDelay = `${(i % 4) * 70}ms`;
});
const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.15 });
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

const progress = (sec) => { const r = sec.getBoundingClientRect(), span = sec.offsetHeight - innerHeight; if (span <= 0) return 0; return Math.min(1, Math.max(0, -r.top / span)); };
const ease = (t) => 1 - Math.pow(1 - t, 3);

// ------------------------------------------------------------------ globo
// Napo (Tena): 0,99° S, 77,8° O. Al deslizar, el globo deja de girar solo, queda mirando a Napo y se acerca.
const NAPO = { lat: -0.99, lon: -77.81 };
const globe = (() => {
  const canvas = $("#globe"), sec = $("#inicio"), tag = $("#globe-tag"), note = $("#hero-note");
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }); } catch { note.textContent = "Tu navegador no pudo abrir el globo 3D."; return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  const group = new THREE.Group(); scene.add(group);

  const tex = new THREE.TextureLoader().load("img/tierra/bluemarble.jpg", () => { if (!window.__globeSeq) note.textContent = "Tierra · imagen Blue Marble de la NASA"; });
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.MeshBasicMaterial({ map: tex, color: 0xffffff }));
  group.add(earth);

  // sombra suave del lado de noche, sin degradados de ambiente: solo da volumen a la esfera
  const shade = new THREE.Mesh(new THREE.SphereGeometry(1.004, 64, 48), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: "varying vec3 n; void main(){ n = normalize(mat3(modelMatrix)*position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
    fragmentShader: "varying vec3 n; void main(){ float d = dot(n, normalize(vec3(-0.5,0.35,0.8))); float a = smoothstep(0.35,-0.65,d)*0.55; gl_FragColor = vec4(0.02,0.04,0.08,a); }",
  }));
  scene.add(shade);
  // aro fino de atmósfera
  const rim = new THREE.Mesh(new THREE.SphereGeometry(1.06, 64, 48), new THREE.ShaderMaterial({
    transparent: true, side: THREE.BackSide, depthWrite: false,
    vertexShader: "varying vec3 n; void main(){ n = normalize(normalMatrix*normal); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }",
    fragmentShader: "varying vec3 n; void main(){ float i = pow(0.72 - dot(n, vec3(0.,0.,1.)), 3.0); gl_FragColor = vec4(0.45,0.7,1.0,1.0)*clamp(i,0.,1.); }",
  }));
  scene.add(rim);

  // posición de un punto (lat, lon) según el mapeo UV de SphereGeometry de three.js
  const at = (lat, lon, r = 1) => {
    const phi = ((lon + 180) / 360) * Math.PI * 2, th = ((90 - lat) * Math.PI) / 180;
    return new THREE.Vector3(-r * Math.cos(phi) * Math.sin(th), r * Math.cos(th), r * Math.sin(phi) * Math.sin(th));
  };
  const pinPos = at(NAPO.lat, NAPO.lon, 1.01);
  const pin = new THREE.Mesh(new THREE.SphereGeometry(0.014, 16, 12), new THREE.MeshBasicMaterial({ color: 0xc4623f }));
  pin.position.copy(pinPos); group.add(pin);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.02, 0.026, 40), new THREE.MeshBasicMaterial({ color: 0xc4623f, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  ring.position.copy(pinPos); ring.lookAt(pinPos.clone().multiplyScalar(2)); group.add(ring);

  const target = -Math.atan2(pinPos.x, pinPos.z); // giro en Y que deja a Napo mirando a la cámara
  const fit = () => {
    const r = canvas.getBoundingClientRect(), w = Math.max(1, r.width), h = Math.max(1, r.height);
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    camera.userData.k = Math.min(1, camera.aspect); // pantallas angostas: se aleja para que quepa
  };
  new ResizeObserver(fit).observe(canvas); fit();

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { rootMargin: "50px" }).observe(sec);
  const loop = (now) => {
    requestAnimationFrame(loop);
    if (window.__globeSeq || !visible) return; // si hay video de Flow, el globo de three.js no se dibuja
    const t = still() ? 0 : now / 1000, p = ease(progress(sec)), k = camera.userData.k || 1;
    group.rotation.y = target + (1 - p) * (t * 0.22 + 0.9);
    group.rotation.x = 0.28 * (1 - p) + 0.05 * p;
    shade.rotation.y = 0; rim.rotation.y = 0;
    const dist = (4.4 - 0.5 * p) / Math.min(1, k * 1.05);
    camera.position.set(0, 0, dist); camera.lookAt(0, 0, 0);
    const s = 1 + (still() ? 0 : Math.sin(now / 500) * 0.35), f = (now % 2000) / 2000;
    ring.scale.setScalar(1 + (still() ? 0.4 : f * 2.2)); ring.material.opacity = still() ? 0.6 : 1 - f;
    void s;
    renderer.render(scene, camera);
    // letrero junto al punto cuando el globo ya quedó mirando a Napo
    tag.classList.toggle("on", p > 0.92);
    const h1 = $("#hero-h1"), lead = $("#hero-lead");
    const zoomed = p > 0.6;
    if (zoomed !== (h1.dataset.z === "1")) {
      h1.dataset.z = zoomed ? "1" : "0";
      h1.textContent = zoomed ? "Napo, Amazonía ecuatoriana." : "Del espacio a la chacra.";
      lead.textContent = zoomed
        ? "Chacras de entre 0,5 y 2 ha, con nubes casi todo el año. Ahí es donde un satélite necesita ayuda de quien está en el terreno."
        : "Satélites de la NASA, medidas en el terreno y la palabra de las familias, para decidir mejor qué sembrar en la Amazonía.";
    }
  };
  requestAnimationFrame(loop);
})();


// ------------------------------------------------------------------ globo en video (Flow)
// Bucle constante (no depende del scroll): los cuadros img/globo/00.webp ... (video de Flow: la Tierra gira
// y se acerca a Napo) van hacia delante y luego hacia atrás, sin saltos. Si no existen, queda el globo de three.js.
{
  const sec = $("#inicio"), canvas = $("#globe-seq"), three = $("#globe"), tag = $("#globe-tag");
  const N = parseInt(canvas.dataset.frames || "72", 10), list = Array(N).fill(null);
  const first = new Image();
  first.onload = () => {
    window.__globeSeq = true; list[0] = first; canvas.hidden = false; three.style.display = "none";
    $("#hero-note").textContent = "Tierra · video generado con Google Flow";
    for (let i = 1; i < N; i++) { const im = new Image(); im.onload = () => { list[i] = im; }; im.src = `img/globo/${String(i).padStart(2, "0")}.webp`; }
    const g = canvas.getContext("2d");
    const fit = () => { const dpr = Math.min(devicePixelRatio || 1, 2), r = canvas.getBoundingClientRect(); canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); last = ""; };
    let last = "", vis = true;
    new ResizeObserver(fit).observe(canvas); fit();
    new IntersectionObserver(([e]) => { vis = e.isIntersecting; }).observe(sec);
    const FPS = 14, HOLD = 1.2; // cuadros por segundo y pausa (s) en cada extremo
    (function tick(now) {
      requestAnimationFrame(tick); if (!vis) return;
      const t = still() ? 0 : now / 1000, span = (N - 1) / FPS, cycle = 2 * (span + HOLD), m = t % cycle;
      const f = m < HOLD ? 0 : m < HOLD + span ? (m - HOLD) * FPS : m < 2 * HOLD + span ? N - 1 : N - 1 - (m - 2 * HOLD - span) * FPS;
      const i = Math.max(0, Math.min(N - 1, Math.round(f)));
      tag.classList.toggle("on", i > N * 0.85);
      const im = list[i] || list.slice(0, i + 1).reverse().find(Boolean), key = i + "x" + canvas.width;
      if (!im || key === last) return; last = key;
      const sc = Math.max(canvas.width / im.naturalWidth, canvas.height / im.naturalHeight);
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.drawImage(im, (canvas.width - im.naturalWidth * sc) / 2, (canvas.height - im.naturalHeight * sc) / 2, im.naturalWidth * sc, im.naturalHeight * sc);
    })(0);
  };
  // Con el fondo de espacio se usa el globo 3D (imagen Blue Marble de la NASA), que es transparente.
  // El video de Flow tiene fondo blanco: para volver a él, quita data-video="no" del canvas #globe-seq.
  if (canvas.dataset.video !== "no") first.src = "img/globo/00.webp";
}

// ------------------------------------------------------------------ plantas
// Cada planta es una secuencia de cuadros de Flow: img/plantas/<id>/00.webp ... (data-frames = cuántos).
// Si todavía no hay cuadros, se prueba un póster img/plantas/<id>.webp; si tampoco, queda el marcador.
{
  const sec = $("#plantas"), items = [...document.querySelectorAll("#plant-items article")];
  const stage = $(".plant-stage"), canvas = $("#plant-seq"), poster = $("#plant-poster"), empty = $("#plant-empty");
  const dots = [...document.querySelectorAll("#plant-dots li")].map((li) => { const i = document.createElement("i"); li.append(i); return i; });
  const g = canvas.getContext("2d");
  const fit = () => { const dpr = Math.min(devicePixelRatio || 1, 2), r = canvas.getBoundingClientRect(); canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); };
  new ResizeObserver(fit).observe(canvas); fit();
  const seqs = new Map();
  const load = (a) => {
    const id = a.dataset.plant;
    if (seqs.has(id)) return seqs.get(id);
    const n = parseInt(a.dataset.frames, 10) || 0, s = { n, list: Array(n).fill(null), poster: null };
    seqs.set(id, s);
    for (let i = 0; i < n; i++) { const im = new Image(); im.onload = () => { s.list[i] = im; }; im.src = `img/plantas/${id}/${String(i).padStart(2, "0")}.webp?v=4`; }
    if (!n) { const im = new Image(); im.onload = () => { s.poster = im; }; im.src = `img/plantas/${id}.webp`; }
    return s;
  };
  new IntersectionObserver(([e]) => { if (e.isIntersecting) load(items[0]); }, { rootMargin: "100% 0px" }).observe(sec); // solo la primera; las demás se piden al llegar (k y k+1)
  let current = -1;
  (function tick() {
    requestAnimationFrame(tick);
    const r = sec.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;
    const pos = Math.min(0.9999, progress(sec)) * items.length, k = Math.floor(pos), local = pos - k;
    if (k !== current) { current = k; items.forEach((a, i) => a.classList.toggle("on", i === k)); }
    dots.forEach((d, i) => d.style.setProperty("--p", i < k ? 1 : i === k ? local : 0));
    const s = load(items[k]); if (items[k + 1]) load(items[k + 1]);
    let art = false;
    if (s.n) {
      const i = still() ? 0 : Math.floor(local * s.n) % s.n, im = s.list[i] || s.list.find(Boolean);
      if (im) {
        g.clearRect(0, 0, canvas.width, canvas.height);
        const sc = Math.min(canvas.width / im.naturalWidth, canvas.height / im.naturalHeight) * 0.92;
        g.drawImage(im, (canvas.width - im.naturalWidth * sc) / 2, (canvas.height - im.naturalHeight * sc) / 2, im.naturalWidth * sc, im.naturalHeight * sc);
        art = true;
      }
    }
    poster.hidden = !(s.poster && !s.n);
    if (!poster.hidden && poster.getAttribute("src") !== s.poster.src) poster.src = s.poster.src;
    if (!poster.hidden) { poster.style.transform = `rotate(${still() ? 0 : (local - 0.5) * 16}deg) scale(${1 + local * 0.05})`; art = true; }
    canvas.style.visibility = s.n && art ? "visible" : "hidden";
    stage.classList.toggle("has-art", art);
    if (!art) { empty.querySelector("svg").style.transform = `rotate(${still() ? 0 : (local - 0.5) * 24}deg)`; }
  })();
}

// ------------------------------------------------------------------ satélite (NASA GIBS, en vivo)
{
  const L = window.L || null;
  const badge = $("#sat-badge");
  const mapEl = $("#sat-map");
  const startMap = async () => {
    if (!window.L) await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "vendor/leaflet/leaflet.js"; s.onload = res; s.onerror = rej; document.head.append(s); });
    const L = window.L;
    const map = L.map(mapEl, { center: [-0.99, -77.8], zoom: 8, minZoom: 5, maxZoom: 11, zoomControl: true, scrollWheelZoom: false });
    // zona de estudio aproximada (no es el límite oficial de la provincia)
    L.rectangle([[-1.55, -78.55], [-0.2, -76.95]], { color: "#1E5734", weight: 2, fill: false, dashArray: "6 6" }).addTo(map).bindTooltip("Zona de estudio (aproximada)");
    L.circleMarker([-0.99, -77.81], { radius: 6, color: "#fff", weight: 2, fillColor: "#1E5734", fillOpacity: 1 }).addTo(map).bindTooltip("Tena");
    map.on("focus", () => map.scrollWheelZoom.enable()); map.on("blur", () => map.scrollWheelZoom.disable());

    const iso = (d) => d.toISOString().slice(0, 10);
    const today = new Date(); const maxDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - 1)); // ayer UTC: ya tiene toda la franja
    const input = $("#d-input"); input.max = iso(maxDay); input.min = "2015-01-01";
    let day = new Date(maxDay), layer = null;
    const LAYERS = (sat, capa) => capa === "ndvi"
      ? { id: `MODIS_${sat}_NDVI_8Day`, ext: "png", name: `${sat} · vegetación NDVI (compuesto de 8 días)` }
      : { id: `MODIS_${sat}_CorrectedReflectance_TrueColor`, ext: "jpg", name: `${sat} · color real` };
    const draw = () => {
      const sat = document.querySelector("input[name=sat]:checked").value, capa = document.querySelector("input[name=capa]:checked").value;
      const l = LAYERS(sat, capa), d = iso(day);
      input.value = d;
      if (layer) map.removeLayer(layer);
      let errores = 0, ok = 0;
      layer = L.tileLayer(`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${l.id}/default/${d}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.${l.ext}`, { maxNativeZoom: 9, maxZoom: 11, attribution: "NASA GIBS · MODIS", opacity: 1 });
      layer.on("tileload", () => { ok++; }); layer.on("tileerror", () => { errores++; if (errores > 8 && !ok) badge.textContent = `Sin imagen para ${d}. Prueba otro día.`; });
      layer.addTo(map); layer.bringToBack();
      badge.textContent = `${l.name} · ${d.split("-").reverse().join("/")}`;
    };
    const move = (n) => { const nd = new Date(day); nd.setUTCDate(nd.getUTCDate() + n); if (nd > maxDay) return; day = nd; draw(); };
    $("#d-prev").addEventListener("click", () => move(-1));
    $("#d-next").addEventListener("click", () => move(1));
    $("#d-hoy").addEventListener("click", () => { day = new Date(maxDay); draw(); });
    input.addEventListener("change", () => { const v = new Date(input.value + "T00:00:00Z"); if (!isNaN(v) && v <= maxDay) { day = v; draw(); } });
    document.querySelectorAll("input[name=sat], input[name=capa]").forEach((r) => r.addEventListener("change", draw));
    draw();
    setTimeout(() => map.invalidateSize(), 300);
  };
  const mio = new IntersectionObserver((es) => { if (es[0].isIntersecting) { mio.disconnect(); startMap().catch(() => { badge.textContent = "No se pudo cargar el mapa."; }); loadPower(); } }, { rootMargin: "300px" });
  mio.observe($(".sat"));

  // Clima de NASA POWER en Tena (dato modelado diario; los últimos días suelen venir vacíos)
  async function loadPower() {
    const box = $("#power");
    try {
      const f = (n) => { const d = new Date(Date.now() - n * 864e5); return d.toISOString().slice(0, 10).replaceAll("-", ""); };
      const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,PRECTOTCORR&community=AG&longitude=-77.81&latitude=-0.99&start=${f(16)}&end=${f(2)}&format=JSON`;
      const r = await fetch(url); if (!r.ok) throw new Error(r.status);
      const j = (await r.json()).properties.parameter;
      const days = Object.keys(j.T2M).filter((k) => j.T2M[k] > -900 && j.PRECTOTCORR[k] > -900).slice(-10);
      if (!days.length) throw new Error("vacío");
      const t = days.map((k) => j.T2M[k]), p = days.map((k) => j.PRECTOTCORR[k]), max = Math.max(...p, 1);
      const w = 100 / days.length;
      const bars = p.map((v, i) => `<rect x="${i * w + 1}" y="${60 - (v / max) * 58}" width="${w - 2}" height="${(v / max) * 58}" rx="1" fill="#709B41"><title>${days[i]}: ${v.toFixed(1)} mm</title></rect>`).join("");
      const tmin = Math.min(...t), tmax = Math.max(...t), span = Math.max(1, tmax - tmin);
      const line = t.map((v, i) => `${i * w + w / 2},${62 - ((v - tmin) / span) * 54}`).join(" ");
      const fmt = (k) => `${k.slice(6)}/${k.slice(4, 6)}`;
      box.innerHTML = `<h3>Clima en Tena · NASA POWER</h3>
        <svg viewBox="0 0 100 64" preserveAspectRatio="none" aria-label="Lluvia y temperatura de los últimos días">${bars}<polyline points="${line}" fill="none" stroke="#1E5734" stroke-width="1.4" vector-effect="non-scaling-stroke"/></svg>
        <div class="rows"><span>Lluvia (barras): <b>${p.reduce((a, b) => a + b, 0).toFixed(0)} mm</b></span><span>Temp. (línea): <b>${t[t.length - 1].toFixed(1)} °C</b></span></div>
        <p class="fine">${fmt(days[0])} a ${fmt(days[days.length - 1])}. Dato modelado por punto, no medido en la chacra.</p>`;
    } catch {
      box.innerHTML = `<h3>Clima en Tena · NASA POWER</h3><p class="fine">No se pudo traer el clima ahora. El mapa satelital sigue funcionando.</p>`;
    }
  }
}

// ------------------------------------------------------------------ luna
// Fase calculada con el ciclo medio (luna nueva de referencia: 6-ene-2000 18:14 UTC; mes sinódico 29,530589 d).
// Margen de unas horas: sirve para ver el ciclo, no para medir. El texto de las fases lo escriben las comunidades.
{
  const SYN = 29.530588853, REF = Date.UTC(2000, 0, 6, 18, 14) / 864e5;
  const frac = (ms) => { const d = ms / 864e5 - REF; return (((d % SYN) + SYN) % SYN) / SYN; };
  const NAMES = [["Luna nueva", 0], ["Creciente", 0.125], ["Cuarto creciente", 0.25], ["Gibosa creciente", 0.375], ["Luna llena", 0.5], ["Gibosa menguante", 0.625], ["Cuarto menguante", 0.75], ["Menguante", 0.875]];
  const dist = (a, b) => { const d = Math.abs(a - b) % 1; return Math.min(d, 1 - d); };
  const nameOf = (f) => NAMES.reduce((best, n) => (dist(f, n[1]) < dist(f, best[1]) ? n : best))[0];
  // luna: parte iluminada a la derecha si crece, a la izquierda si mengua
  const moonSVG = (f, R = 46, cx = 50, cy = 50) => {
    const k = Math.cos(f * 2 * Math.PI), waxing = f < 0.5, rx = Math.abs(k) * R;
    const half = `M${cx} ${cy - R} A${R} ${R} 0 0 ${waxing ? 1 : 0} ${cx} ${cy + R} A${rx} ${R} 0 0 ${(k > 0) === waxing ? 0 : 1} ${cx} ${cy - R}Z`;
    return `<circle cx="${cx}" cy="${cy}" r="${R}" fill="#C9D3C9"/><path d="${half}" fill="#F2EFC9"/><circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#8FA08F" stroke-width="1.5"/>`;
  };
  const today = new Date(), t0 = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  const f0 = frac(t0), ill = Math.round(((1 - Math.cos(f0 * 2 * Math.PI)) / 2) * 100);
  $("#moon-big").innerHTML = moonSVG(f0);
  $("#moon-name").textContent = nameOf(f0);
  $("#moon-pct").textContent = `${ill} % iluminada`;
  // primer día (0 a 31) en que la fase pasa por `target` (0 nueva, 0.5 llena)
  const find = (target) => { for (let d = 1; d <= 31; d++) { if (dist(frac(t0 + d * 864e5), target) < 0.5 / SYN && dist(frac(t0 + (d - 1) * 864e5), target) >= 0.5 / SYN) return d; } return null; };
  const fmt = (d) => new Date(t0 + d * 864e5).toLocaleDateString("es-EC", { day: "numeric", month: "long" });
  const dl = find(0.5), dn = find(0);
  $("#moon-next").textContent = [dl != null ? `Llena: ${fmt(dl)}` : "", dn != null ? `Nueva: ${fmt(dn)}` : ""].filter(Boolean).join(" · ");
  const strip = $("#moon-strip");
  for (let d = 0; d < 30; d++) {
    const dt = new Date(t0 + d * 864e5), f = frac(t0 + d * 864e5), el = document.createElement("div");
    if (d === 0) el.className = "hoy";
    el.title = `${dt.toLocaleDateString("es-EC", { weekday: "long", day: "numeric", month: "long" })}: ${nameOf(f)}`;
    el.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">${moonSVG(f)}</svg><span>${dt.getUTCDate()}</span>`;
    strip.append(el);
  }
  // calendario comunitario: cuatro fases en blanco; se guarda solo en este navegador
  const PH = [["Luna nueva", 0], ["Cuarto creciente", 0.25], ["Luna llena", 0.5], ["Cuarto menguante", 0.75]], KEYC = "willak.calendario";
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEYC) || "{}"); } catch { /* sin almacenamiento */ }
  const grid = $("#cal-grid"), consent = $("#cal-consent"), who = $("#cal-who"), copy = $("#cal-copy"), msg = $("#cal-msg");
  PH.forEach(([n, f], i) => {
    const l = document.createElement("label");
    l.innerHTML = `<span class="ph"><svg viewBox="0 0 100 100" aria-hidden="true">${moonSVG(f)}</svg>${n}</span><textarea placeholder="Qué se hace, con qué plantas, cómo se dice en kichwa" aria-label="${n}: qué se hace"></textarea>`;
    const ta = l.querySelector("textarea"); ta.value = saved[i] || "";
    ta.addEventListener("input", () => { saved[i] = ta.value; try { localStorage.setItem(KEYC, JSON.stringify(saved)); } catch { /* sin almacenamiento */ } });
    grid.append(l);
  });
  consent.addEventListener("change", () => { copy.disabled = !consent.checked; });
  copy.addEventListener("click", async () => {
    const txt = `Calendario lunar de la chacra · cuenta: ${who.value.trim() || "(sin nombre)"} · con autorización\n` + PH.map(([n], i) => `${n}: ${(saved[i] || "").trim() || "(en blanco)"}`).join("\n");
    try { await navigator.clipboard.writeText(txt); msg.textContent = "Copiado."; } catch { msg.textContent = "No se pudo copiar; selecciona el texto a mano."; }
  });
}

// ------------------------------------------------------------------ mascotas animadas
// Si existen los cuadros img/mascota/<id>/00.webp ... 47.webp (video de Flow recortado), la mascota se mueve en bucle.
{
  const N = 48, sets = [];
  document.querySelectorAll("img.masc-anim").forEach((img) => {
    const base = `img/mascota/${img.dataset.masc}/`, first = new Image();
    first.onload = () => { const fr = [first]; for (let i = 1; i < N; i++) { const im = new Image(); im.src = base + String(i).padStart(2, "0") + ".webp"; fr.push(im); } sets.push({ img, fr }); };
    first.src = base + "00.webp";
  });
  let i = 0, vis = false;
  const sec = $("#mascota"); new IntersectionObserver(([e]) => { vis = e.isIntersecting; }).observe(sec);
  setInterval(() => { if (!vis || still()) return; i = (i + 1) % N; sets.forEach((s) => { if (s.fr[i].complete && s.fr[i].naturalWidth) s.img.src = s.fr[i].src; }); }, 85);
}
