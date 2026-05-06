/**
 * Brave Search API adapter.
 * GET https://api.search.brave.com/res/v1/web/search
 * Auth: X-Subscription-Token header
 *
 * Free tier: $5 monthly credit (auto-renews), ~1000 queries/month.
 */

import type { SearchInput, SearchProvider } from './types.js'
import { applyDomainFilters, safeHostname, type ProviderOutput } from './types.js'

export const braveProvider: SearchProvider = {
  name: 'brave',

  isConfigured() {
    return Boolean(process.env.BRAVE_SEARCH_API_KEY)
  },

  async search(input: SearchInput, signal?: AbortSignal): Promise<ProviderOutput> {
    const start = performance.now()
    const apiKey = process.env.BRAVE_SEARCH_API_KEY!

    const params = new URLSearchParams({
      q: input.query,
      count: '15',
    })

    // Apply domain filters as Brave's native site: filter
    if (input.allowed_domains?.length) {
      params.set('q', input.allowed_domains.map(d => `site:${d}`).join(' OR ') + ' ' + input.query)
    }

    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?${params.toString()}`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey,
        },
        signal,
      },
    )

    if (!res.ok) {
      throw new Error(`Brave search error ${res.status}: ${await res.text().catch(() => '')}`)
    }

    const data = await res.json()
    const webResults = data.web?.results ?? []

    const hits = webResults.map((r: any) => ({
      title: r.title ?? '',
      url: r.url ?? '',
      description: r.description ?? r.snippet ?? r.content,
      source: r.url ? safeHostname(r.url) : undefined,
    }))

    return {
      hits: applyDomainFilters(hits, input),
      providerName: 'brave',
      durationSeconds: (performance.now() - start) / 1000,
    }
  },
}
