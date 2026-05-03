# @fabcovalesci/n8n-nodes-affiliate-marketplaces

Pacote **n8n Community Node**: crawl de listas do **Mercado Livre** (grid Nordic em `__NORDIC_RENDERING_CTX__`) via `fetch` nativo — **Node 18+**.

Inclui marketplace **Mercado Livre** e **Amazon (em breve)** no painel do nó.

## Repositório / pasta de trabalho

Trate **esta pasta** (onde está este `README.md` e o `package.json` do pacote) como raiz do projeto Git que você versiona e publica no npm.

```text
.
├── README.md
├── package.json
├── lib/
│   └── mercadolivreSocialList.js
├── nodes/
│   └── AffiliateMarketplaceList/
│       ├── AffiliateMarketplaceList.node.js
│       └── icon.svg
└── scripts/
    └── smoke-url.js
```

## Instalar dependências

```bash
npm install
```

(Não há runtime deps além do peer `n8n-workflow`, já resolvido pelo n8n.)

## URLs suportadas

| Modo no nó | Exemplo |
|------------|---------|
| **Lista de afiliados** | `https://www.mercadolivre.com.br/social/NICK/lists/UUID?matt_tool=…` |
| **Catálogo / ofertas** | `https://www.mercadolivre.com.br/ofertas?category=MLB5672&page=1` |
| **Hub favoritos (myaccount)** | `https://myaccount.mercadolivre.com.br/bookmarks/wishlist/hub/detail/UUID` → o crawl usa a lista pública `www…/social/NICK/lists/UUID` |

Hub **myaccount** não é público (403). Informe o nick da lista social em:

- campo **Nick na lista social** no nó, ou  
- `…/detail/UUID?nickname=NICK`, ou  
- env **`MERCADOLIVRE_SOCIAL_NICKNAME`**.

## Publicar no npm

```bash
npm publish --access public
```

(`publishConfig.access` já está `public` no `package.json`.)

## Instalar no n8n (Community Nodes)

**Settings → Community Nodes → Install** → `@fabcovalesci/n8n-nodes-affiliate-marketplaces`

## Desenvolvimento local (`npm link`)

Na pasta do pacote:

```bash
npm link
```

No host onde roda o n8n (ajuste o caminho conforme sua instalação):

```bash
npm link @fabcovalesci/n8n-nodes-affiliate-marketplaces
```

Reinicie o n8n. O nó aparece como **Affiliate Marketplace List**.

## Parâmetros do nó

1. **Marketplace** — Mercado Livre ou Amazon (em breve).  
2. **Mercado Livre · tipo de página** — *Lista de afiliados* ou *Catálogo / ofertas* (`pageSource` na saída: `affiliate` ou `catalog`).  
3. **URL da página** — ver tabela acima; fragmento `#…` é ignorado ao paginar.  
4. **Nick na lista social** — só para URLs `myaccount…/bookmarks/…/detail/…`.  
5. **Máximo de páginas** — default 250, teto 500 (`?page=N`).

### Saída JSON

`products`, `itemsCollected`, `pageSource`, `listUrl` (URL efetiva após resolver hub → social), `totalDeclared`, campos de paginação, etc.

## Teste pela CLI (sem n8n)

```bash
npm run test:lib
npm run smoke:url -- "<URL>" [affiliate|catalog] [maxPages] [socialNickname]
```

Exemplos:

```bash
npm run smoke:url -- "https://www.mercadolivre.com.br/ofertas?category=MLB5672&page=1" catalog 1
npm run smoke:url -- "https://myaccount.mercadolivre.com.br/bookmarks/wishlist/hub/detail/UUID?nickname=SEU_NICK" affiliate 5
```

## Licença

MIT
