/*!
 * Jugadores3D.js  ·  Camino a la Gloria
 * ------------------------------------------------------------------
 * Le da volumen (efecto 3D) y más detalle a los jugadores sin tocar
 * el juego: envuelve la función drawSprite() original.
 *
 *  - Dibuja el sprite original en un lienzo chico.
 *  - Luego le aplica: luz desde arriba-izquierda, sombra abajo-derecha,
 *    contorno oscuro suave, brillo en pelo y botines, y volumen por
 *    partes (camiseta, short, medias, brazos).
 *  - Como parte de los colores reales de cada jugador, se nota la
 *    personalización (piel, pelo, camiseta, botines, guantes...).
 *
 * Si este archivo no carga (sin internet, mal enlace), el juego sigue
 * funcionando con los jugadores de siempre.
 *
 * Ajustes opcionales desde la consola o desde el juego:
 *   J3D.on = false;        // apaga el efecto
 *   J3D.outline = false;   // sin contorno
 *   J3D.str = 1;           // intensidad del volumen (0 a 1.5)
 */
(function () {
  "use strict";
  if (window.J3D && window.J3D.__loaded) return;

  var J = (window.J3D = {
    __loaded: true,
    on: true,
    outline: true,
    str: 1,
    version: "1.0"
  });

  /* Lienzo de trabajo. El sprite se dibuja con su centro en (OX, OY).
     Hay margen de sobra para saltos, festejos y barridas. */
  var W = 36, H = 60, OX = 18, OY = 48;
  var cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  var cx = cv.getContext("2d", { willReadFrequently: true });

  var orig = null;
  var busy = false;

  /* ---------- utilidades de color ---------- */
  function parse(c) {
    if (typeof c !== "string") return null;
    if (c.charAt(0) === "#") {
      if (c.length === 4) c = "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
      if (c.length !== 7) return null;
      var n = parseInt(c.slice(1), 16);
      if (isNaN(n)) return null;
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    return null;
  }
  /* misma fórmula que shade() del juego */
  function sh(v, e) {
    return Math.max(0, Math.min(255, Math.round(e >= 0 ? v + (255 - v) * e : v * (1 + e))));
  }
  var E_LIST = [-0.5, -0.4, -0.3, -0.22, -0.14, -0.1, 0, 0.12, 0.2, 0.28, 0.32, 0.38, 0.55, 0.62];

  /* Materiales: 0 pelo, 1 piel, 2 camiseta/medias, 3 short, 4 botines, 5 guantes */
  var M_HAIR = 0, M_SKIN = 1, M_SHIRT = 2, M_SHORTS = 3, M_BOOT = 4, M_GLOVE = 5;

  var cache = {};
  var cacheN = 0;

  function palette(s) {
    var boot = s.boot || "#1b1b26";
    var key = [s.hair, s.skin, s.shirt, s.shorts, s.sock, boot, s.gloves].join("|");
    var p = cache[key];
    if (p) return p;
    if (cacheN > 300) { cache = {}; cacheN = 0; }
    var defs = [
      [s.hair, M_HAIR], [s.skin, M_SKIN], [s.shirt, M_SHIRT],
      [s.sock, M_SHIRT], [s.shorts, M_SHORTS], [boot, M_BOOT], [s.gloves, M_GLOVE]
    ];
    var tab = [];
    for (var i = 0; i < defs.length; i++) {
      var rgb = parse(defs[i][0]);
      if (!rgb) continue;
      for (var k = 0; k < E_LIST.length; k++) {
        tab.push([sh(rgb[0], E_LIST[k]), sh(rgb[1], E_LIST[k]), sh(rgb[2], E_LIST[k]), defs[i][1]]);
      }
    }
    p = { tab: tab, map: new Map() };
    cache[key] = p;
    cacheN++;
    return p;
  }

  function material(p, r, g, b) {
    var k = (r << 16) | (g << 8) | b;
    var m = p.map.get(k);
    if (m !== undefined) return m;
    m = -1;
    var t = p.tab, best = 40; /* tolerancia */
    for (var i = 0; i < t.length; i++) {
      var d = Math.abs(t[i][0] - r) + Math.abs(t[i][1] - g) + Math.abs(t[i][2] - b);
      if (d < best) { best = d; m = t[i][3]; if (d === 0) break; }
    }
    p.map.set(k, m);
    return m;
  }

  /* ---------- post-proceso 3D ---------- */
  var body = new Uint8Array(W * H);
  var mat = new Int8Array(W * H);

  function post(s) {
    var id = cx.getImageData(0, 0, W, H);
    var d = id.data;
    var p = palette(s);
    var str = J.str;
    var x, y, i, o;

    /* 1) máscara del cuerpo (se ignoran sombra y partículas sueltas) */
    for (i = 0; i < W * H; i++) body[i] = d[i * 4 + 3] >= 200 ? 1 : 0;
    for (y = 1; y < H - 1; y++) {
      for (x = 1; x < W - 1; x++) {
        i = y * W + x;
        if (body[i] && !body[i - 1] && !body[i + 1] && !body[i - W] && !body[i + W]) body[i] = 2; /* aislado */
      }
    }
    for (i = 0; i < W * H; i++) { if (body[i] === 2) body[i] = 0; }

    /* 2) material de cada píxel (pelo, piel, camiseta...) */
    for (i = 0; i < W * H; i++) {
      mat[i] = body[i] ? material(p, d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) : -2;
    }

    /* 3) volumen: luz arriba-izquierda, sombra abajo-derecha */
    var src = new Uint8ClampedArray(d); /* colores originales */
    for (y = 2; y < H - 2; y++) {
      for (x = 2; x < W - 2; x++) {
        i = y * W + x;
        if (!body[i]) continue;
        var m = mat[i];
        var L = 0, D = 0;

        var nU = i - W, nD = i + W, nL = i - 1, nR = i + 1;
        /* borde con el vacío (silueta): fuerte */
        if (!body[nU]) L += 0.2; else if (!body[nU - W]) L += 0.07;
        if (!body[nL]) L += 0.1; else if (!body[nL - 1]) L += 0.04;
        if (!body[nD]) D += 0.24; else if (!body[nD + W]) D += 0.08;
        if (!body[nR]) D += 0.18; else if (!body[nR + 1]) D += 0.06;

        /* borde entre partes distintas (camiseta/short/brazo): suave */
        if (m >= 0) {
          var mu = mat[nU], md = mat[nD], ml = mat[nL], mr = mat[nR];
          if (mu >= 0 && mu !== m) L += 0.06;
          if (ml >= 0 && ml !== m) L += 0.04;
          if (md >= 0 && md !== m) D += 0.12;
          if (mr >= 0 && mr !== m) D += 0.08;
        }

        /* brillos propios de cada material */
        if (m === M_HAIR && (!body[nU] || mat[nU] !== M_HAIR)) L += 0.12;
        if (m === M_BOOT && (!body[nU] || mat[nU] !== M_BOOT)) L += 0.14;
        if (m === M_SKIN && !body[nU - 1 + 0] && body[nD]) L += 0.04;

        L *= str; D *= str;
        if (L > 0.5) L = 0.5;
        if (D > 0.5) D = 0.5;
        if (L === 0 && D === 0) continue;

        o = i * 4;
        var r = src[o], g = src[o + 1], b = src[o + 2];
        if (L > 0) { /* luz cálida (menos fuerte en colores oscuros para que no se laven) */
          var lum = (r * 0.3 + g * 0.59 + b * 0.11) / 255;
          var Lk = L * (0.3 + 0.7 * lum);
          r = r + (255 - r) * Lk;
          g = g + (248 - g) * Lk;
          b = b + (225 - b) * Lk;
        }
        if (D > 0) { /* sombra fría */
          r = r + (22 - r) * D;
          g = g + (16 - g) * D;
          b = b + (48 - b) * D;
        }
        d[o] = r; d[o + 1] = g; d[o + 2] = b;
      }
    }

    /* 4) contorno oscuro del color de cada parte */
    if (J.outline) {
      for (y = 1; y < H - 1; y++) {
        for (x = 1; x < W - 1; x++) {
          i = y * W + x;
          if (body[i]) continue;
          var n = -1;
          /* prioriza el vecino de abajo/derecha para dar peso al contorno */
          if (body[i + W]) n = i + W;
          else if (body[i + 1]) n = i + 1;
          else if (body[i - 1]) n = i - 1;
          else if (body[i - W]) n = i - W;
          if (n < 0) continue;
          o = i * 4;
          var q = n * 4;
          d[o] = d[q] * 0.3 + 6;
          d[o + 1] = d[q + 1] * 0.3 + 5;
          d[o + 2] = d[q + 2] * 0.3 + 14;
          d[o + 3] = 235;
        }
      }
    }

    cx.putImageData(id, 0, 0);
  }

  /* ---------- reemplazo de drawSprite ---------- */
  function draw3D(t, e, a, s) {
    if (!J.on || busy || !s) return orig(t, e, a, s);
    e = Math.round(e);
    a = Math.round(a);
    busy = true;
    try {
      cx.setTransform(1, 0, 0, 1, 0, 0);
      cx.clearRect(0, 0, W, H);
      cx.setTransform(1, 0, 0, 1, OX - e, OY - a);
      orig(cx, e, a, s);
      cx.setTransform(1, 0, 0, 1, 0, 0);
      post(s);
      var sm = t.imageSmoothingEnabled;
      t.imageSmoothingEnabled = false;
      t.drawImage(cv, e - OX, a - OY);
      t.imageSmoothingEnabled = sm;
    } catch (err) {
      /* si algo falla, vuelve a los jugadores originales */
      J.on = false;
      busy = false;
      try { console.warn("Jugadores3D desactivado:", err); } catch (x) {}
      return orig(t, e, a, s);
    }
    busy = false;
  }

  function install() {
    if (typeof window.drawSprite !== "function") return false;
    if (window.drawSprite === draw3D) return true;
    orig = window.drawSprite;
    window.drawSprite = draw3D;
    return true;
  }

  if (!install()) {
    var tries = 0;
    var iv = setInterval(function () {
      if (install() || ++tries > 100) clearInterval(iv);
    }, 100);
  }

  J.install = install;
  J._draw = draw3D;
  J._setOrig = function (f) { orig = f; };
})();
