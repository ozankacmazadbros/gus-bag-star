/* Gus Bag Star — interactions (homepage + product pages) */
(() => {
  'use strict';

  const root = document.documentElement;
  root.classList.add('js');

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mqMobile = matchMedia('(max-width: 860px)');
  const hasGsap = Boolean(window.gsap && window.ScrollTrigger);
  if (hasGsap) gsap.registerPlugin(ScrollTrigger);

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const clamp01 = v => Math.min(1, Math.max(0, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const easeOut = t => 1 - Math.pow(1 - t, 3);

  const PRODUCTS = {
    fistik:  { name: 'Fıstık',  price: 2450, img: 'assets/products/fistik.webp' },
    yelpaze: { name: 'Yelpaze', price: 2650, img: 'assets/products/yelpaze.webp' },
    gece:    { name: 'Gece',    price: 2350, img: 'assets/products/gece.webp' },
    adacayi: { name: 'Adaçayı', price: 2850, img: 'assets/products/adacayi.webp' },
    kilim:   { name: 'Kilim',   price: 2950, img: 'assets/products/kilim.webp' },
    zeytin:  { name: 'Zeytin',  price: 1450, img: 'assets/products/zeytin.webp' },
    tarcin:  { name: 'Tarçın',  price: 1450, img: 'assets/products/tarcin.webp' },
  };

  /* ---------- Smooth scroll ---------- */

  let lenis = null;
  if (!reduceMotion && hasGsap && window.Lenis) {
    lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.9 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(time => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  const scrollToEl = (el, offset = 0) => {
    if (lenis) lenis.scrollTo(el, { offset, duration: 1.6 });
    else window.scrollTo({ top: el.getBoundingClientRect().top + scrollY + offset, behavior: reduceMotion ? 'auto' : 'smooth' });
  };

  const scrollHandlers = [];
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; scrollHandlers.forEach(fn => fn()); });
  };
  addEventListener('scroll', onScroll, { passive: true });

  /* ---------- Header ---------- */

  const header = $('.site-header');
  const hero = $('.hero');
  const themed = $$('[data-header]');

  scrollHandlers.push(() => {
    const probe = header.offsetHeight / 2;
    const section = themed.find(s => { const r = s.getBoundingClientRect(); return r.top <= probe && r.bottom > probe; });
    header.dataset.theme = section ? section.dataset.header : (hero ? 'dark' : 'light');
    header.classList.toggle('is-solid', !hero || hero.getBoundingClientRect().bottom <= probe);
  });

  const menuBtn = $('.menu-toggle');
  const setMenu = open => {
    if (header.classList.contains('menu-open') === open) return;
    header.classList.toggle('menu-open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.textContent = open ? 'Kapat' : 'Menü';
    if (lenis) open ? lenis.stop() : lenis.start();
  };
  menuBtn.addEventListener('click', () => setMenu(!header.classList.contains('menu-open')));
  mqMobile.addEventListener('change', () => setMenu(false));

  /* ---------- Hero: scroll film ----------
     Plays a pre-extracted frame sequence when assets/frames/index.json lists one
     (tools/extract-frames.sh writes it). Until the film is rendered, it fakes the
     camera pull-back with the two keyframes so the page already behaves like the
     final thing. */

  if (hero) (() => {
    const sticky = $('.hero__sticky', hero);
    const canvas = $('.hero__canvas', hero);
    const ctx = canvas.getContext('2d', { alpha: false });
    const chapters = $$('.chapter', hero);
    const steps = $$('.hero__thread li', hero);
    const thread = $('.hero__thread', hero);
    const cue = $('.hero__cue', hero);

    const VARIANTS = {
      desktop: {
        frames: 'assets/frames/desktop/',
        start: 'assets/keyframes/start-desktop.webp',
        end: 'assets/keyframes/end-desktop.webp',
        startFocus: [0.71, 0.446],   // brass snap, as image fractions
        endFocus: [0.667, 0.553],
        position: [0.7, 0.5],        // object-position when the screen crops the frame
      },
      mobile: {
        frames: 'assets/frames/mobile/',
        start: 'assets/keyframes/start-mobile.webp',
        end: 'assets/keyframes/end-mobile.webp',
        startFocus: [0.519, 0.601],
        endFocus: [0.518, 0.626],
        position: [0.5, 0.5],
      },
    };

    // Copy timing per chapter: [fade-in start, fade-in end, fade-out start, fade-out end]
    const WINDOWS = [[-1, 0, 0.1, 0.17], [0.2, 0.27, 0.4, 0.46], [0.5, 0.56, 0.66, 0.72], [0.8, 0.88, 2, 3]];

    const cache = {};
    let variant = null;
    let source = null;
    let progress = 0;
    let frameIndex = 0;
    let cw = 0, ch = 0;

    const loadImage = src => new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });

    let frameIndexFile = null;
    async function loadFrames(name, v) {
      if (!frameIndexFile) frameIndexFile = fetch('assets/frames/index.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : {}));
      const m = (await frameIndexFile)[name];
      if (!m || !m.count) throw new Error('no frame sequence');
      const pad = Number((m.pattern.match(/%0(\d)d/) || [0, 4])[1]);
      const url = i => v.frames + m.pattern.replace(/%0\dd/, String(i + 1).padStart(pad, '0'));
      const frames = new Array(m.count);
      frames[0] = await loadImage(url(0));

      // Coarse-to-fine, so scrubbing works before every frame has arrived.
      const seen = new Set([0]);
      const queue = [];
      for (let step = 16; step >= 1; step >>= 1) {
        for (let i = 0; i < m.count; i += step) if (!seen.has(i)) { seen.add(i); queue.push(i); }
      }
      const worker = async () => {
        while (queue.length) {
          const i = queue.shift();
          try {
            frames[i] = await loadImage(url(i));
            if (Math.abs(i - frameIndex) <= 2) draw();
          } catch (_) { /* a missing frame falls back to its neighbour */ }
        }
      };
      for (let k = 0; k < 6; k++) worker();
      return { type: 'frames', frames, count: m.count };
    }

    async function loadStills(v) {
      const [start, end] = await Promise.all([loadImage(v.start), loadImage(v.end)]);
      return { type: 'stills', start, end };
    }

    async function setVariant(name) {
      if (name === variant) return;
      variant = name;
      const v = VARIANTS[name];
      if (!cache[name]) cache[name] = loadFrames(name, v).catch(() => loadStills(v));
      const s = await cache[name];
      if (variant === name) { source = s; draw(); }
    }

    // Screen point where `focus` (image fractions) lands when `img` is cover-fit at zoom 1.
    function anchorOf(img, focus) {
      const v = VARIANTS[variant];
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const base = Math.max(cw / iw, ch / ih);
      return [(cw - iw * base) * v.position[0] + focus[0] * iw * base, (ch - ih * base) * v.position[1] + focus[1] * ih * base];
    }

    // Cover-fit `img`, scaled by `zoom`, with `focus` pinned to `anchor` as far as the edges allow.
    function paint(img, zoom, focus, alpha = 1, anchor = anchorOf(img, focus)) {
      const iw = img.naturalWidth, ih = img.naturalHeight;
      const s = Math.max(cw / iw, ch / ih) * zoom;
      const x = Math.min(0, Math.max(cw - iw * s, anchor[0] - focus[0] * iw * s));
      const y = Math.min(0, Math.max(ch - ih * s, anchor[1] - focus[1] * ih * s));
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, x, y, iw * s, ih * s);
      ctx.globalAlpha = 1;
    }

    function draw() {
      if (!source || !cw) return;
      const p = reduceMotion ? 1 : progress;

      if (source.type === 'frames') {
        const n = source.count;
        frameIndex = Math.round(p * (n - 1));
        let img = source.frames[frameIndex];
        for (let d = 1; !img && d < n; d++) img = source.frames[frameIndex - d] || source.frames[frameIndex + d];
        if (img) paint(img, 1, [0.5, 0.5]);
        return;
      }

      // Both snaps share one screen point, so the dissolve reads as a single pull-back.
      const v = VARIANTS[variant];
      const anchor = anchorOf(source.end, v.endFocus);
      const fade = smooth(0.2, 0.34, p);
      if (fade < 1) paint(source.start, lerp(1.25, 1.1, smooth(0, 0.34, p)), v.startFocus, 1, anchor);
      if (fade > 0) paint(source.end, lerp(2.8, 1, easeOut(clamp01((p - 0.2) / 0.66))), v.endFocus, fade);
    }

    function updateCopy() {
      const p = reduceMotion ? 0 : progress;
      let active = 0;
      chapters.forEach((el, i) => {
        const [a, b, c, d] = WINDOWS[i];
        let o = i === 0 ? 1 : smooth(a, b, p);
        if (p > c) o *= 1 - smooth(c, d, p);
        const y = (p > c ? -1 : 1) * (1 - o) * 30;
        el.style.opacity = o.toFixed(3);
        el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
        el.style.visibility = o < 0.01 ? 'hidden' : 'visible';
        if (p >= a) active = i;
      });
      steps.forEach((s, i) => s.classList.toggle('is-active', i === active));
      thread.style.setProperty('--p', p.toFixed(4));
      cue.style.opacity = String(1 - smooth(0, 0.04, p));
    }

    function measure() {
      const total = hero.offsetHeight - sticky.offsetHeight;
      progress = total > 0 ? clamp01(-hero.getBoundingClientRect().top / total) : 0;
    }

    function resize() {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      cw = sticky.clientWidth;
      ch = sticky.clientHeight;
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingQuality = 'high';
      setVariant(cw / ch < 0.9 ? 'mobile' : 'desktop');
      draw();
    }

    scrollHandlers.push(() => {
      const before = progress;
      measure();
      if (before !== progress) { draw(); updateCopy(); }
    });

    let resizeTimer;
    addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 120); });

    measure();
    resize();
    updateCopy();
  })();

  /* ---------- Close-up: half bag + loupe with macro shots ---------- */

  const closeupMedia = $('.closeup__media');
  if (closeupMedia) (() => {
    const media = closeupMedia;
    const hotspots = $$('.hotspot', media);
    const notes = $$('.note');
    const loupe = $('.loupe', media);
    const line = $('.loupe-line', media);
    let active = -1;
    let swapTimer;

    // Warm the cache so the loupe never opens on a half-loaded macro.
    hotspots.forEach(h => { const img = new Image(); img.decoding = 'async'; img.src = h.dataset.detail; });

    function place() {
      if (active < 0) return;
      const h = hotspots[active];
      const x = parseFloat(h.style.getPropertyValue('--x')) / 100;
      const y = parseFloat(h.style.getPropertyValue('--y')) / 100;
      const W = media.offsetWidth, H = media.offsetHeight, L = loupe.offsetWidth;

      // Keep the loupe inside the part of the bag that is actually on screen.
      const m = media.getBoundingClientRect();
      const f = media.parentElement.getBoundingClientRect();
      const visLeft = Math.max(0, -m.left) + 16;
      const visRight = Math.min(W, f.right - m.left, innerWidth - m.left) - 16;
      const visTop = f.top - m.top + 16;
      const visBottom = f.bottom - m.top - 16;
      const hx = x * W, hy = y * H;
      const cx = Math.min(Math.max(hx + L * 0.62, visLeft + L / 2), visRight - L / 2);
      const cy = Math.min(Math.max(hy - L * 0.62, visTop + L / 2), visBottom - L / 2);
      loupe.style.transform = `translate3d(${cx - L / 2}px, ${cy - L / 2}px, 0)`;

      const ang = Math.atan2(cy - hy, cx - hx);
      const dist = Math.hypot(cx - hx, cy - hy);
      line.style.width = `${Math.max(0, dist - L / 2 - 10)}px`;
      line.style.transform = `translate3d(${hx + Math.cos(ang) * 10}px, ${hy + Math.sin(ang) * 10}px, 0) rotate(${ang}rad)`;
    }

    function setActive(i) {
      if (i === active || i < 0) return;
      const first = active < 0;
      active = i;
      hotspots.forEach((h, j) => { h.classList.toggle('is-active', j === i); h.setAttribute('aria-pressed', String(j === i)); });
      notes.forEach((n, j) => n.classList.toggle('is-active', j === i));
      line.classList.add('is-on');
      place();

      // Fade out, swap the macro shot, fade back in.
      const src = `url("${hotspots[i].dataset.detail}")`;
      clearTimeout(swapTimer);
      if (first) {
        loupe.style.backgroundImage = src;
        loupe.classList.add('is-on');
        return;
      }
      loupe.classList.add('is-swapping');
      swapTimer = setTimeout(() => {
        loupe.style.backgroundImage = src;
        loupe.classList.remove('is-swapping');
      }, 260);
    }

    let io;
    const observe = () => {
      if (io) io.disconnect();
      io = new IntersectionObserver(entries => {
        entries.forEach(e => { if (e.isIntersecting) setActive(notes.indexOf(e.target)); });
      }, { rootMargin: mqMobile.matches ? '-84% 0px -15% 0px' : '-49% 0px -49% 0px' });
      notes.forEach(n => io.observe(n));
    };
    observe();
    mqMobile.addEventListener('change', observe);

    hotspots.forEach((h, i) => h.addEventListener('click', () => {
      setActive(i);
      const offset = mqMobile.matches ? -innerHeight * 0.7 : -(innerHeight - notes[i].offsetHeight) / 2;
      scrollToEl(notes[i], offset);
    }));

    addEventListener('resize', place);
    setActive(0);
  })();

  /* ---------- Kilim loupe ---------- */

  const starMedia = $('.star__media');
  const starLoupe = $('.star__loupe');
  if (starMedia) {
    const placeStarLoupe = () => {
      const W = starMedia.offsetWidth, H = starMedia.offsetHeight, L = starLoupe.offsetWidth, z = 2.2;
      starLoupe.style.backgroundSize = `${W * z}px ${H * z}px`;
      starLoupe.style.backgroundPosition = `${-(0.488 * W * z - L / 2)}px ${-(0.613 * H * z - L / 2)}px`;
    };
    placeStarLoupe();
    addEventListener('resize', placeStarLoupe);
  }

  /* ---------- Collection filter ---------- */

  const grid = $('.collection__grid');
  const tiles = grid ? $$('.tile', grid) : [];
  const filterBtns = $$('.filter');

  function applyFilter(f) {
    if (!grid) return;
    filterBtns.forEach(b => {
      const on = b.dataset.filter === f;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    // Usage photographs only sit in the full collection.
    tiles.forEach(t => { t.hidden = f !== 'all' && t.dataset.cat !== f; });
    if (hasGsap) {
      ScrollTrigger.refresh();
      if (!reduceMotion) {
        gsap.fromTo(tiles.filter(t => !t.hidden), { opacity: 0, y: 24 },
          { opacity: 1, y: 0, duration: 0.8, stagger: 0.05, ease: 'power3.out', clearProps: 'transform' });
      }
    }
  }
  filterBtns.forEach(b => b.addEventListener('click', () => applyFilter(b.dataset.filter)));

  /* ---------- Product gallery (swipe on phones) ---------- */

  const gallery = $('.pdp__gallery');
  if (gallery) {
    const shots = $$('.shot', gallery);
    const indexEl = $('[data-gallery-index]');
    $('[data-gallery-total]').textContent = String(shots.length);
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) indexEl.textContent = String(shots.indexOf(e.target) + 1); });
    }, { root: gallery, threshold: 0.6 });
    shots.forEach(s => io.observe(s));
  }

  /* ---------- Cart ---------- */

  const Cart = (() => {
    const KEY = 'gbs-cart';
    const drawer = $('#cart');
    const scrim = $('.cart-scrim');
    const list = $('[data-cart-items]');
    const empty = $('[data-cart-empty]');
    const foot = $('.cart__foot');
    const totalEl = $('[data-cart-total]');
    const countEl = $('[data-cart-count]');
    const toggle = $('.cart-toggle');
    const note = $('.cart__note');
    const fmt = n => '₺' + new Intl.NumberFormat('tr-TR').format(n);

    let items = [];
    try { items = JSON.parse(localStorage.getItem(KEY) || '[]').filter(i => PRODUCTS[i.id] && i.qty > 0); } catch (_) { items = []; }
    const save = () => { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (_) { /* private mode */ } };

    function render() {
      const count = items.reduce((s, i) => s + i.qty, 0);
      countEl.textContent = String(count);
      toggle.setAttribute('aria-label', `Sepet, ${count} ürün`);
      empty.hidden = count > 0;
      foot.hidden = count === 0;
      list.innerHTML = items.map(i => {
        const p = PRODUCTS[i.id];
        return `<li class="cart-item" data-id="${i.id}">
          <img src="${p.img}" alt="" width="76" height="95">
          <div>
            <p class="cart-item__name">${p.name}</p>
            <p class="cart-item__price">${fmt(p.price)}</p>
            <div class="qty">
              <button type="button" data-qty="-1" aria-label="${p.name} adedini azalt">−</button>
              <output aria-live="polite">${i.qty}</output>
              <button type="button" data-qty="1" aria-label="${p.name} adedini artır">+</button>
            </div>
          </div>
          <button class="cart-item__remove" type="button" data-remove>Kaldır</button>
        </li>`;
      }).join('');
      totalEl.textContent = fmt(items.reduce((s, i) => s + i.qty * PRODUCTS[i.id].price, 0));
    }

    let lastFocus = null;
    let scrimTimer;
    const isOpen = () => drawer.classList.contains('is-open');

    function open() {
      if (isOpen()) return;
      lastFocus = document.activeElement;
      clearTimeout(scrimTimer);
      scrim.hidden = false;
      requestAnimationFrame(() => scrim.classList.add('is-open'));
      drawer.inert = false;
      drawer.setAttribute('aria-hidden', 'false');
      drawer.classList.add('is-open');
      toggle.setAttribute('aria-expanded', 'true');
      if (lenis) lenis.stop();
      $('.cart__close', drawer).focus({ preventScroll: true });
    }

    function close() {
      if (!isOpen()) return;
      drawer.classList.remove('is-open');
      scrim.classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');
      drawer.inert = true;
      toggle.setAttribute('aria-expanded', 'false');
      scrimTimer = setTimeout(() => { scrim.hidden = true; }, 600);
      if (lenis) lenis.start();
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }

    function add(id) {
      if (!PRODUCTS[id]) return;
      const it = items.find(i => i.id === id);
      if (it) it.qty += 1; else items.push({ id, qty: 1 });
      save();
      render();
      toggle.classList.remove('is-bumped');
      void toggle.offsetWidth;
      toggle.classList.add('is-bumped');
      open();
    }

    document.addEventListener('click', e => {
      const addBtn = e.target.closest('[data-add]');
      if (addBtn) { add(addBtn.dataset.add); return; }

      const row = e.target.closest('.cart-item');
      if (row) {
        const it = items.find(i => i.id === row.dataset.id);
        const q = e.target.closest('[data-qty]');
        if (q && it) it.qty += Number(q.dataset.qty);
        if (e.target.closest('[data-remove]') && it) it.qty = 0;
        items = items.filter(i => i.qty > 0);
        save();
        render();
        // The list is re-rendered, so hand focus back to the same control (or the drawer).
        const same = q && $(`.cart-item[data-id="${row.dataset.id}"] [data-qty="${q.dataset.qty}"]`, list);
        (same || $('.cart__close', drawer)).focus({ preventScroll: true });
        return;
      }

      if (e.target.closest('[data-cart-close]')) close();
    });

    toggle.addEventListener('click', () => (isOpen() ? close() : open()));
    $('[data-checkout]').addEventListener('click', () => { note.textContent = 'Ödeme altyapısı bu önizlemede henüz bağlı değil.'; });

    document.addEventListener('keydown', e => {
      if (!isOpen()) return;
      if (e.key === 'Escape') { close(); return; }
      if (e.key !== 'Tab') return;
      const focusables = $$('button, a[href], input', drawer).filter(el => !el.closest('[hidden]'));
      const first = focusables[0], last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    render();
    return { close };
  })();

  /* ---------- In-page links ---------- */

  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    e.preventDefault();
    if (id === '#') return;
    const target = $(id);
    if (!target) return;
    setMenu(false);
    Cart.close();
    if (a.dataset.jumpFilter) applyFilter(a.dataset.jumpFilter);
    scrollToEl(target);
  });

  document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

  /* ---------- Letter ---------- */

  const form = $('.letter');
  if (form) form.addEventListener('submit', e => {
    e.preventDefault();
    const input = $('input', form);
    const status = $('.letter__status', form);
    if (!input.value.trim() || !input.checkValidity()) {
      status.textContent = 'Geçerli bir e-posta adresi yazın, örneğin ad@ornek.com.';
      status.classList.add('is-error');
      input.focus();
      return;
    }
    status.classList.remove('is-error');
    status.textContent = 'Teşekkürler. İlk mektup yakında e-postanızda.';
    form.reset();
  });

  /* ---------- Scroll motion ---------- */

  if (hasGsap && !reduceMotion) {
    // Play on any toggle: a reload restores the scroll position below a reveal,
    // and scrolling back up into it must still show the content. (No `once`:
    // in 3.12 a trigger that kills itself during refresh breaks every other one.)
    const reveal = { toggleActions: 'play play play play' };

    $$('.reveal, .closeup__head, .collection__head, .star__copy, .lookbook__head, .look, .atelier__head, .letter, .pdp-details__head, .pdp-more__head').forEach(el => {
      gsap.from(el, {
        y: 40, opacity: 0, duration: 1.3, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 90%', ...reveal },
      });
    });

    $$('.collection__grid .tile, .pdp-more__grid .card').forEach(tile => {
      const media = $('.card__media', tile) || tile;
      const img = $('img', media);
      const tl = gsap.timeline({ scrollTrigger: { trigger: tile, start: 'top 92%', ...reveal } });
      tl.from(media, { clipPath: 'inset(14% 0% 0% 0%)', duration: 1.4, ease: 'power3.out', clearProps: 'clipPath' })
        .from(img, { scale: 1.12, duration: 1.8, ease: 'power3.out', clearProps: 'transform' }, 0);
      const body = $('.card__body', tile);
      if (body) tl.from(body, { y: 16, opacity: 0, duration: 1, ease: 'power3.out' }, 0.25);
    });

    $$('.band').forEach(band => {
      gsap.fromTo($('.band__media', band), { yPercent: -6 }, {
        yPercent: 6, ease: 'none',
        scrollTrigger: { trigger: band, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });

    if (starMedia) {
      const mm = gsap.matchMedia();
      mm.add({ desktop: '(min-width: 861px)', mobile: '(max-width: 860px)' }, ctx => {
        const { desktop } = ctx.conditions;
        gsap.fromTo(starMedia,
          { x: 0, y: 0, xPercent: desktop ? 38 : 22, yPercent: -50 },
          { xPercent: desktop ? 24 : 12, yPercent: -50, ease: 'none',
            scrollTrigger: { trigger: '.star', start: 'top bottom', end: 'bottom top', scrub: true } });
      });

      gsap.fromTo(starLoupe, { scale: 0.55, rotate: -16 }, {
        scale: 1, rotate: 0, ease: 'none',
        scrollTrigger: { trigger: '.star', start: 'top 75%', end: 'center center', scrub: true },
      });
    }

    if ($('.atelier__band')) {
      gsap.fromTo('.atelier__band img', { yPercent: -12 }, {
        yPercent: 0, ease: 'none',
        scrollTrigger: { trigger: '.atelier__band', start: 'top bottom', end: 'bottom top', scrub: true },
      });
    }
  }

  onScroll();
})();
