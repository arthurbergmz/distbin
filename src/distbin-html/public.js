const { distbinBodyTemplate } = require('./partials')
const { sendRequest } = require('../util')
const { encodeHtmlEntities } = require('../util')
const { readableToString } = require('../util')
const { requestMaxMemberCount } = require('../util')
const http = require('http')
const url = require('url')
const querystring = require('querystring')

exports.createHandler = function ({ apiUrl }) {
  return async function(req, res) {
    res.writeHead(200)
    res.end(distbinBodyTemplate(`
      ${await createPublicBody(req, {
        apiUrl
      })}
    `))
  }
}

async function createPublicBody (req, { apiUrl }) {
  const limit = requestMaxMemberCount(req) || 10
  if (typeof limit !== 'number') {
    throw new Error('max-member-count must be a number')
  }
  let pageUrl = url.parse(req.url, true).query.page;
  if ( ! pageUrl) {
    const publicCollectionUrl = apiUrl + '/activitypub/public'
    const publicCollectionRequest = http.request(Object.assign(url.parse(publicCollectionUrl), {
      headers: {
        'Prefer': `return=representation; max-member-count="${limit}"`
      }
    }))
    const publicCollection = JSON.parse(await readableToString(await sendRequest(publicCollectionRequest)))
    pageUrl = url.resolve(publicCollectionUrl, publicCollection.current)    
  }
  const pageRequest = http.request(Object.assign(url.parse(pageUrl), {
    headers: {
      'Prefer': `return=representation; max-member-count="${limit}"`
    }
  }))
  const page = JSON.parse(await readableToString(await sendRequest(pageRequest)))
  const nextQuery = page.next && Object.assign({}, url.parse(req.url, true).query, {
    'page': page.next && url.resolve(pageUrl, page.next)
  })
  const nextUrl = nextQuery && `?${querystring.stringify(nextQuery)}`
  const msg = `
    <h2>Public Activity</h2>
    <p>Fetched from <a href="/activitypub/public">/activitypub/public</a></p>
    <pre>${
    encodeHtmlEntities(
      // #TODO: discover /public url via HATEOAS
      JSON.stringify(page, null, 2)
    )
    // linkify values of 'url' property (quotes encode to &#34;)
    .replace(/&#34;url&#34;: &#34;(.+?)(?=&#34;)&#34;/g, '&#34;url&#34;: &#34;<a href="$1">$1</a>&#34;')
    }</pre>
    ${
      [
        page.startIndex
          ? `${page.startIndex} previous items`
          : ''
        ,
        nextUrl
          ? `<a href="${nextUrl}">Next Page</a>`
          : ''
      ].filter(Boolean).join(' - ')
    }
  `
  return msg;
}
