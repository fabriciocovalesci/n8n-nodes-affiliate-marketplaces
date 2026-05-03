'use strict';

const { NodeOperationError } = require('n8n-workflow');

const {
  crawlMercadoLivreNordicPolycardsList,
  clampMercadoMaxPages,
} = require('../../lib/mercadolivreSocialList');

class AffiliateMarketplaceList {
	constructor() {
		this.description = {
			displayName: 'Affiliate Marketplace List',
			name: 'affiliateMarketplaceList',
			icon: 'file:icon.svg',
			group: ['transform'],
			version: 1,
			subtitle:
				'={{$parameter["marketplace"] === "amazon" ? "Amazon (em breve)" : ($parameter["pageSource"] === "catalog" ? "ML · Catálogo" : "ML · Afiliados")}}',
			description:
				'Mercado Livre: lista social / ofertas e URLs de hub de favoritos (convertidas para lista social pública). Amazon reservado para versões futuras.',
			defaults: {
				name: 'Affiliate Marketplace List',
			},
			inputs: ['main'],
			outputs: ['main'],
			properties: [
				{
					displayName: 'Marketplace',
					name: 'marketplace',
					type: 'options',
					noDataExpression: true,
					options: [
						{ name: 'Mercado Livre', value: 'mercadolivre' },
						{ name: 'Amazon (em breve)', value: 'amazon' },
					],
					default: 'mercadolivre',
				},
				{
					displayName: 'Mercado Livre · tipo de página',
					name: 'pageSource',
					type: 'options',
					displayOptions: { show: { marketplace: ['mercadolivre'] } },
					noDataExpression: true,
					options: [
						{ name: 'Lista de afiliados', value: 'affiliate' },
						{ name: 'Catálogo / ofertas', value: 'catalog' },
					],
					default: 'affiliate',
					description:
						'Afiliados: /social/.../lists/…. Catálogo: /ofertas?…. Mesmo parser; só muda metadata na saída.',
				},
				{
					displayName: 'URL da página',
					name: 'listUrl',
					type: 'string',
					default: '',
					required: true,
					placeholder: 'https://www.mercadolivre.com.br/...',
					description:
						'Afiliado ou catálogo (www…). Hub myaccount…/bookmarks/wishlist/hub/detail/UUID → informe nick em Nick na lista social ou ?nickname=NICK na URL.',
				},
				{
					displayName: 'Nick na lista social',
					name: 'socialNickname',
					type: 'string',
					displayOptions: { show: { marketplace: ['mercadolivre'] } },
					default: '',
					description:
						'Só para URL myaccount…/bookmarks/…/detail/UUID (mesmo UUID da lista em /social/NICK/lists/UUID). Ex.: cofa5902140. Alternativa: ?nickname=NICK na própria URL.',
				},
				{
					displayName: 'Máximo de páginas',
					name: 'maxPages',
					type: 'number',
					displayOptions: { show: { marketplace: ['mercadolivre'] } },
					default: 250,
					typeOptions: { minValue: 1, maxValue: 500 },
					description: 'Teto ?page=N (default 250, máx. 500).',
				},
			],
		};
	}

	async execute() {
		const items = this.getInputData();
		const returnData = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const marketplace = this.getNodeParameter('marketplace', i);
				const listUrl = this.getNodeParameter('listUrl', i);

				if (!listUrl || !String(listUrl).trim()) {
					throw new NodeOperationError(this.getNode(), 'Informe a URL da página.');
				}

				if (marketplace === 'amazon') {
					throw new NodeOperationError(
						this.getNode(),
						'Amazon ainda não está implementado. Escolha Mercado Livre.',
					);
				}

				if (marketplace !== 'mercadolivre') {
					throw new NodeOperationError(
						this.getNode(),
						`Marketplace desconhecido: ${marketplace}`,
					);
				}

				const pageSource = this.getNodeParameter('pageSource', i);
				const rawMax = this.getNodeParameter('maxPages', i);
				const maxPages = clampMercadoMaxPages(rawMax);
				const rawNick = this.getNodeParameter('socialNickname', i);
				const socialNickname =
					typeof rawNick === 'string' ? rawNick.trim() : '';

				const result = await crawlMercadoLivreNordicPolycardsList(
					String(listUrl).trim(),
					{
						pageSource: pageSource === 'catalog' ? 'catalog' : 'affiliate',
						maxPages,
						socialNickname: socialNickname || undefined,
					},
				);
				returnData.push({ json: result });
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: String(error?.message ?? error) },
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}

module.exports = { AffiliateMarketplaceList };
