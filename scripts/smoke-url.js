'use strict';

const {
  crawlMercadoLivreNordicPolycardsList,
} = require('../lib/mercadolivreSocialList.js');

const url = process.argv[2];
if (!url) {
  console.error(
    'Uso: node scripts/smoke-url.js "<URL>" [catalog|affiliate] [maxPages] [socialNickname]',
  );
  console.error(
    'Ex.: node scripts/smoke-url.js "https://www.mercadolivre.com.br/ofertas?..." catalog 10',
  );
  console.error(
    'Hub bookmarks: …/detail/UUID — passe nick como 5º arg ou ?nickname=NICK na URL.',
  );
  process.exit(1);
}

const pageSourceRaw = process.argv[3];
const pageSource = pageSourceRaw === 'catalog' ? 'catalog' : 'affiliate';
const rawMax = process.argv[4];
const maxPages = rawMax != null && rawMax !== '' ? Number(rawMax) : undefined;
const nickArg = process.argv[5];
const socialNickname =
  nickArg != null && nickArg !== '' ? String(nickArg).trim() : undefined;

crawlMercadoLivreNordicPolycardsList(url, {
  pageSource,
  maxPages,
  socialNickname,
})
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
  })
  .catch((err) => {
    console.error(err?.message ?? err);
    process.exit(1);
  });
