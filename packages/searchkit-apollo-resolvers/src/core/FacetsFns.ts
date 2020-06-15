import { SearchResponse } from 'elasticsearch'
import { BaseFacet } from '../facets/BaseFacet'
import QueryManager from './QueryManager'

export const filterTransform = (queryManager: QueryManager, facets: Array<BaseFacet> = []) => {
  const subFilters = facets.reduce((subFilters, facet) => {
    const facetSubFilter = queryManager.getFiltersById(facet.getId())
    if (facetSubFilter) {
      return [...subFilters, facet.getFilters(facetSubFilter)]
    }
    return subFilters
  }, [])

  return {
    bool: {
      must: subFilters
    }
  }
}

export const getAggregationsFromFacets = (
  queryManager: QueryManager,
  overrides: any,
  facetsConfig: Array<BaseFacet>
) => {
  const aggBuckets = facetsConfig.reduce(
    (buckets, facet) => {
      if (facet.excludeOwnFilters && queryManager.hasFilters()) {
        buckets.push({
          name: `facet_bucket_${facet.getId()}`,
          aggs: [facet],
          filters: facetsConfig.filter((f) => f !== facet)
        })
      } else {
        const combinedBucket = buckets.find(({ name }) => name === 'facet_bucket_all')
        combinedBucket.aggs.push(facet)
      }
      return buckets
    },
    [{ name: 'facet_bucket_all', aggs: [], filters: [...facetsConfig] }]
  )

  const aggs = aggBuckets.reduce((sum, bucket) => {
    const subAggs = bucket.aggs.reduce(
      (subAggs, subAgg: BaseFacet) => ({
        ...subAggs,
        ...subAgg.getAggregation(overrides[subAgg.getId()])
      }),
      {}
    )
    return {
      ...sum,
      [bucket.name]: {
        aggs: subAggs,
        filter: filterTransform(queryManager, bucket.filters)
      }
    }
  }, {})

  return { aggs }
}

export const getFacetsFromResponse = (
  facetsConfig: Array<BaseFacet>,
  response: SearchResponse<any>
) => {
  const facetBucketKeys = Object.keys(response.aggregations).filter(
    (aggKey) => aggKey.indexOf('facet_bucket_') !== -1
  )
  const collapsedFacetAggsMap = facetBucketKeys.reduce((facetAggsResponse, bucketKey) => {
    const facetBucket = response.aggregations[bucketKey]
    const subAggKeys = Object.keys(facetBucket).filter(
      (key) => key !== 'meta' && key !== 'doc_count'
    )
    return {
      ...facetAggsResponse,
      ...subAggKeys.reduce(
        (sum, key) => ({
          ...sum,
          [key]: facetBucket[key]
        }),
        {}
      )
    }
  }, {})

  return facetsConfig.map((facet) => {
    const aggFacetResponse = collapsedFacetAggsMap[facet.getId()]
    return facet.transformResponse(aggFacetResponse)
  })
}
