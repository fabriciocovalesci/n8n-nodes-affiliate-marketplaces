'use strict';

/**
 * Nordic polycards (__NORDIC_RENDERING_CTX__): listas de afiliados, /ofertas e outras vitrines ML.
 */

const DEFAULT_MAX_PAGES = 250;
const ABS_MAX_PAGES_CAP = 500;

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9',
};

function clampMercadoMaxPages(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_MAX_PAGES;
  return Math.min(Math.floor(n), ABS_MAX_PAGES_CAP);
}

/** @param {string} host */
function isMercadoLivreBrHostname(host) {
  const h = String(host).toLowerCase();
  return h === 'mercadolivre.com.br' || h.endsWith('.mercadolivre.com.br');
}

/**
 * Hub de favoritos no myaccount não é público (403 sem login). O mesmo UUID de lista
 * existe em www…/social/NICK/lists/UUID — resolvemos com nick opcional na query ou em options.
 *
 * @param {string} listUrl URL original
 * @param {string} [socialNickname] nick público do perfil (campo do nó ou env MERCADOLIVRE_SOCIAL_NICKNAME)
 * @returns {{ fetchHref: string, rewrittenFromBookmarksHub: boolean }}
 */
function resolveBookmarksHubOrPass(listUrl, socialNickname) {
  let parsed;
  try {
    parsed = new URL(listUrl);
  } catch {
    return { fetchHref: listUrl, rewrittenFromBookmarksHub: false };
  }

  const hubRe =
    /\/bookmarks\/wishlist\/hub\/detail\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?$/i;
  const m = parsed.pathname.match(hubRe);
  if (!m) {
    return { fetchHref: listUrl, rewrittenFromBookmarksHub: false };
  }

  const uuid = m[1];
  const nick =
    (socialNickname && String(socialNickname).trim()) ||
    parsed.searchParams.get('nickname') ||
    parsed.searchParams.get('socialNickname') ||
    String(process.env.MERCADOLIVRE_SOCIAL_NICKNAME || '').trim();

  if (!nick) {
    throw new Error(
      'URLs em myaccount…/bookmarks/wishlist/hub/detail/… não são públicas (403). ' +
        'Use a lista social https://www.mercadolivre.com.br/social/SEU_NICK/lists/' +
        uuid +
        ' ou acrescente ?nickname=SEU_NICK na URL / campo Nick na lista social no nó.',
    );
  }

  const out = new URL(
    `https://www.mercadolivre.com.br/social/${encodeURIComponent(nick)}/lists/${uuid}`,
  );
  for (const key of ['matt_tool', 'forceInApp']) {
    const v = parsed.searchParams.get(key);
    if (v != null && v !== '') out.searchParams.set(key, v);
  }

  return { fetchHref: out.href, rewrittenFromBookmarksHub: true };
}

/** @param {string} url */
async function fetchHtml(url) {
  const retries = 4;
  /** @type {Error | null} */
  let lastErr = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: { ...HEADERS }, redirect: 'follow' });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} em ${url}`);
      }
      return text;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      if (i === retries) throw lastErr;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw lastErr ?? new Error(`fetchHtml: falhou em ${url}`);
}

function canonicalFetchHref(listUrl) {
  const u = new URL(listUrl);
  u.hash = '';
  return u.href;
}

function buildPageUrl(fetchBaseHref, page) {
  const u = new URL(fetchBaseHref);
  u.searchParams.set('page', String(page));
  return u.href;
}

/** Mesmo formato em /ofertas e listas sociais (`__NORDIC_RENDERING_CTX__`). */
function extractNordicCtx(html) {
  const patterns = [
    /<script[^>]*\bid\s*=\s*["']__NORDIC_RENDERING_CTX__["'][^>]*>[\s\S]*?_n\.ctx\.r\s*=\s*(\{[\s\S]*?\});\s*_n\.ctx\.r\.assets/,
    /<script[^>]*\bid\s*=\s*["']__NORDIC_RENDERING_CTX__["'][^>]*>[\s\S]*?_n\.ctx\.r\s*=\s*(\{[\s\S]*?\});\s*_n\.ctx\.preload/,
    /_n\.ctx\.r\s*=\s*(\{[\s\S]*?\});\s*_n\.ctx\.r\.assets/,
    /_n\.ctx\.r\s*=\s*(\{[\s\S]*?\});\s*_n\.ctx\.preload/,
    /<script[^>]*\bid\s*=\s*["']__NORDIC_RENDERING_CTX__["'][^>]*>[\s\S]*?_n\.ctx\.r\s*=\s*(\{[\s\S]*?\});\s*_n\.ctx\.r\s*=/,
  ];
  for (const re of patterns) {
    const match = html.match(re);
    if (!match) continue;
    try {
      return JSON.parse(match[1]);
    } catch {
      continue;
    }
  }
  return null;
}

/** @param {unknown} o */
function looksLikePolycard(o) {
  return (
    !!o &&
    typeof o === 'object' &&
    !!(/** @type {any} */ (o).metadata) &&
    typeof (/** @type {any} */ (o).metadata) === 'object' &&
    Array.isArray((/** @type {any} */ (o)).components) &&
    (/** @type {any} */ (o)).components.some((c) => c && c.type === 'title')
  );
}

/**
 * Fallback quando o layout Nordic guarda cards em outro ramo de pageProps.
 *
 * @param {Record<string, any>} pageProps
 * @returns {any[]}
 */
function polycardsDeepFallback(pageProps) {
  const found = [];
  const seen = new Set();
  /** @param {unknown} x @param {number} depth */
  function walk(x, depth) {
    if (depth > 14 || x == null) return;
    if (Array.isArray(x)) {
      if (x.length && x.every(looksLikePolycard)) {
        for (const c of x) {
          const card = /** @type {any} */ (c);
          const key =
            card.metadata?.id ?? card.unique_id ?? JSON.stringify(card.metadata);
          if (seen.has(key)) continue;
          seen.add(key);
          found.push(card);
        }
        return;
      }
      for (const el of x) walk(el, depth + 1);
      return;
    }
    if (typeof x === 'object') {
      for (const k of Object.keys(/** @type {object} */ (x)))
        walk(/** @type {any} */ (x)[k], depth + 1);
    }
  }
  walk(pageProps, 0);
  return found;
}

function polycardsFromPageProps(pageProps) {
  const direct = Array.isArray(pageProps.polycards) ? pageProps.polycards : [];
  if (direct.length > 0) {
    return {
      polycards: direct,
      polycardCtx: pageProps.polycardContext ?? {},
      totalItems:
        typeof pageProps.totalItems === 'number' ? pageProps.totalItems : null,
      pageSize:
        typeof pageProps.limit === 'number' ? pageProps.limit : 16,
    };
  }

  const data = pageProps.data;
  const wrappers = data && Array.isArray(data.items) ? data.items : [];
  let polycards = [];
  for (const wrap of wrappers) {
    if (wrap?.card && typeof wrap.card === 'object') polycards.push(wrap.card);
  }

  const paging = data?.paging ?? {};
  let totalItems =
    typeof paging.total === 'number'
      ? paging.total
      : typeof data?.total === 'number'
        ? data.total
        : null;
  let pageSize =
    typeof paging.limit === 'number'
      ? paging.limit
      : typeof data?.limit === 'number'
        ? data.limit
        : 16;

  let polycardCtx = data?.polycardContext ?? {};

  if (!polycards.length) {
    polycards = polycardsDeepFallback(pageProps);
    polycardCtx =
      pageProps.polycardContext ??
      data?.polycardContext ??
      pageProps.data?.polycardContext ??
      {};
  }

  return {
    polycards,
    polycardCtx,
    totalItems,
    pageSize,
  };
}

function normalizePolycard(card, polycardCtx, page) {
  const meta = card.metadata ?? {};
  const comps = Array.isArray(card.components) ? card.components : [];

  const prefix = polycardCtx?.url_prefix ?? 'https://';
  const rawUrl = meta.url ?? '';
  const params = meta.url_params ?? '';
  const frags = meta.url_fragments ?? '';
  const url = rawUrl ? `${prefix}${rawUrl}${params}${frags}` : '';

  const picTemplate = polycardCtx?.picture_template ?? '';
  const picId = card.pictures?.pictures?.[0]?.id ?? '';
  const picSquare =
    card.pictures?.square ?? polycardCtx?.picture_square_default ?? 'Q';
  const picSizeDef = polycardCtx?.picture_size_default ?? 'AB';
  const imageUrl =
    picId && picTemplate
      ? picTemplate
          .replace('{id}', picId)
          .replace('{square}', picSquare)
          .replace('{size}', picSizeDef)
          .replace('{2x}', '_2X_')
          .replace('{sanitized_title}', '')
      : null;

  const comp = (t) => comps.find((c) => c.type === t) ?? null;

  const brandComp = comp('brand');
  const titleComp = comp('title');
  const sellerComp = comp('seller');
  const highlightComp = comp('highlight');
  const priceComp = comp('price');
  const shippingComp = comp('shipping');
  const reviewsComp = comp('reviews');
  const promotionsComp = comp('promotions');

  const title = titleComp?.title?.text ?? '';
  const brand = brandComp?.brand?.text ?? null;
  const sellerRaw = sellerComp?.seller?.text ?? null;
  const seller = sellerRaw ? sellerRaw.replace(/\{[^}]+\}/g, '').trim() : null;
  const highlight = highlightComp?.highlight?.text
    ? highlightComp.highlight.text.replace(/\{[^}]+\}/g, '').trim()
    : null;

  const priceData = priceComp?.price ?? {};
  const priceCurrent = priceData.current_price?.value ?? null;
  const pricePrevious = priceData.previous_price?.value ?? null;
  const discountLabel =
    priceData.discount_label?.text ??
    (priceData.discount?.value ? `${priceData.discount.value}% OFF` : null);

  let installmentsText = null;
  const inst = priceData.installments;
  if (inst) {
    if (Array.isArray(inst.values) && inst.values.length) {
      const parts = inst.values.map((v) => {
        if (v.type === 'label') return v.label?.text ?? '';
        if (v.type === 'price') {
          const val = v.price?.value;
          return val != null ? `R$${Number(val).toFixed(2)}` : '';
        }
        return '';
      });
      const noInt = inst.no_interest ? ' sem juros' : '';
      installmentsText = `${parts.join(' ')}${noInt}`.replace(/\s+/g, ' ').trim();
    } else if (inst.text) {
      installmentsText = inst.text.replace(/\{[^}]+\}/g, '').replace(/\s+/g, ' ').trim();
    }
  }

  const shippingRaw = shippingComp?.shipping?.text ?? null;
  const reviews = reviewsComp?.reviews ?? {};
  const rating =
    typeof reviews.rating_average === 'number' ? reviews.rating_average : null;
  const reviewsCount = typeof reviews.total === 'number' ? reviews.total : null;

  const coupons = [];
  if (promotionsComp?.promotions) {
    for (const promo of promotionsComp.promotions) {
      if (promo.type === 'coupon' && promo.text) {
        coupons.push(promo.text.replace(/\{[^}]+\}/g, '').trim());
      }
    }
  }

  return {
    title: String(title),
    url,
    imageUrl,
    brand,
    category: null,
    seller,
    highlight,
    priceCurrent,
    pricePrevious,
    discountLabel,
    installmentsText: installmentsText || null,
    shippingText: shippingRaw,
    rating,
    reviewsCount,
    coupons,
    page,
  };
}

/**
 * @param {string} listUrl
 * @param {{ pageSource?: 'affiliate' | 'catalog', maxPages?: number, socialNickname?: string }} [options]
 */
async function crawlMercadoLivreNordicPolycardsList(listUrl, options = {}) {
  const MAX_PAGES = clampMercadoMaxPages(options.maxPages);

  let parsed;
  try {
    parsed = new URL(listUrl);
  } catch {
    throw new Error('URL inválida');
  }
  if (!isMercadoLivreBrHostname(parsed.hostname)) {
    throw new Error('URL deve ser do domínio mercadolivre.com.br');
  }

  const pageSourceRequested =
    options.pageSource === 'catalog' ? 'catalog' : 'affiliate';

  const { fetchHref, rewrittenFromBookmarksHub } = resolveBookmarksHubOrPass(
    listUrl,
    options.socialNickname,
  );
  let pageSource = pageSourceRequested;
  if (rewrittenFromBookmarksHub && pageSource === 'catalog') {
    pageSource = 'affiliate';
  }

  const fetchBase = canonicalFetchHref(fetchHref);
  const reportListUrl = new URL(fetchBase);
  reportListUrl.searchParams.set('page', '1');

  const all = [];
  const seen = new Set();
  let pagesFetched = 0;
  let totalDeclared = null;
  let maxKnown = 1;

  for (let p = 1; p <= maxKnown && p <= MAX_PAGES; p++) {
    const url = buildPageUrl(fetchBase, p);
    const html = await fetchHtml(url);
    pagesFetched = p;

    const ctx = extractNordicCtx(html);
    if (!ctx) break;

    const pageProps = ctx?.appProps?.pageProps;
    if (!pageProps || typeof pageProps !== 'object') break;

    const grid = polycardsFromPageProps(pageProps);
    const { polycards, polycardCtx, totalItems: totalFromCtx, pageSize } = grid;

    if (p === 1) {
      if (totalFromCtx != null && pageSize > 0) {
        totalDeclared = totalFromCtx;
        maxKnown = Math.min(Math.ceil(totalFromCtx / pageSize), MAX_PAGES);
      } else if (polycards.length > 0) {
        maxKnown = MAX_PAGES;
      }
    }

    if (!polycards.length) break;

    for (const card of polycards) {
      const key = card.metadata?.id ?? card.unique_id ?? `${p}-${all.length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(normalizePolycard(card, polycardCtx, p));
    }
  }

  return {
    source: 'mercadolivre',
    pageSource,
    maxPagesLimit: MAX_PAGES,
    listUrl: reportListUrl.href,
    totalDeclared,
    totalPagesDetected: maxKnown,
    pagesFetched,
    itemsCollected: all.length,
    products: all,
  };
}

/** @deprecated use crawlMercadoLivreNordicPolycardsList; mantido para compat */
async function crawlMercadoLivreSocialList(listUrl, options = {}) {
  return crawlMercadoLivreNordicPolycardsList(listUrl, {
    ...options,
    pageSource: 'affiliate',
  });
}

module.exports = {
  crawlMercadoLivreNordicPolycardsList,
  crawlMercadoLivreSocialList,
  clampMercadoMaxPages,
};
