import distbin from '../../'
const { listen } = require('../util')
const url = require('url')
const querystring = require('querystring')
const { readableToString } = require('../../src/util')
const { sendRequest } = require('../../src/util')
const http = require('http')
const assert = require('assert')
const sanitize = require('../../src/distbin-html/sanitize')

import { testCli } from '../'

const distbinHtml = require('../../src/distbin-html')
let tests = module.exports

tests['/ serves html'] = async function () {
  const dh = distbinHtml.createHandler({
    apiUrl: 'badurl',
    externalUrl: 'badurl'
  })
  const dhUrl = await listen(http.createServer(dh))
  const dhResponse = await sendRequest(http.request(Object.assign(url.parse(dhUrl), {
    headers: {
      accept: 'text/html'
    }
  })))
  assert.equal(dhResponse.statusCode, 200)
  assert.equal(dhResponse.headers['content-type'], 'text/html')
}

tests['POST / creates activities'] = async function () {
  const dbUrl = await listen(http.createServer(distbin()))
  const dh = distbinHtml.createHandler({
    apiUrl: dbUrl,
    externalUrl: 'badurl'
  })
  const dhUrl = await listen(http.createServer(dh))
  const postFormRequest = http.request(Object.assign(url.parse(dhUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    }
  }))
  postFormRequest.write(querystring.stringify({
    name: 'activity name',
    content: 'lorem ipsum',
    attachment: dbUrl
  }))
  const dhResponse = await sendRequest(postFormRequest)
  assert.equal(dhResponse.statusCode, 302)
  assert(dhResponse.headers.location)
  // Ensure a generator was set
  // Note: getting from distbin, not distbin-html.
  const postedActivityUrl = url.resolve(dbUrl, dhResponse.headers.location)
  const activityResponse = await sendRequest(http.request(Object.assign(url.parse(postedActivityUrl), {
    headers: {
      accept: 'application/json'
    }
  })))
  const activity = JSON.parse(await readableToString(activityResponse))
  assert(activity.object.generator, 'distbin-html form submission sets distbin-html as the .generator')
  assert.equal(Array.isArray(activity.object.attachment), true, '.attachment is an Array')
  assert.equal(activity.object.attachment.length, 1, '.attachment[] is there and has the attachment link')
  const attachmentLink = activity.object.attachment[0]
  assert.equal(attachmentLink.href, dbUrl)
  const linkPrefetch = attachmentLink['https://distbin.com/ns/linkPrefetch']
  assert.equal(typeof linkPrefetch.published, 'string', 'linkPrefetch.published is a string')
  assert.equal(linkPrefetch.supportedMediaTypes[0], 'application/json', 'linkPrefetch.supportedMediaTypes[0] is the right media type')
}

tests['POST / can create activities with geolocation'] = async function () {
  const dbUrl = await listen(http.createServer(distbin()))
  const dh = distbinHtml.createHandler({
    apiUrl: dbUrl,
    externalUrl: 'badurl'
  })
  const dhUrl = await listen(http.createServer(dh))
  const formFields = {
    content: 'lorem ipsum',
    'location.name': 'Penang, Malaysia',
    'location.latitude': 5.365458,
    'location.longitude': 100.45900909999999,
    'location.altitude': 56.1,
    'location.accuracy': 95.0,
    'location.radius': 18408,
    'location.units': 'm'
  }
  const activity = await postDistbinHtmlActivityForm(dbUrl, dhUrl, formFields)
  assert.equal(typeof activity.location, 'object')
  assert.equal(activity.location.name, formFields['location.name'])
  assert.equal(activity.location.latitude, formFields['location.latitude'])
  assert.equal(activity.location.longitude, formFields['location.longitude'])
  assert.equal(activity.location.altitude, formFields['location.altitude'])
  assert.equal(activity.location.accuracy, formFields['location.accuracy'])
  assert.equal(activity.location.radius, formFields['location.radius'])
  assert.equal(activity.location.units, formFields['location.units'])
}

tests['POST / can create activities with .attributedTo'] = async function () {
  const dbUrl = await listen(http.createServer(distbin()))
  const dh = distbinHtml.createHandler({
    apiUrl: dbUrl,
    externalUrl: 'badurl'
  })
  const dhUrl = await listen(http.createServer(dh))
  const formFields = {
    content: 'lorem ipsum',
    'attributedTo.name': 'Ben',
    'attributedTo.url': 'http://bengo.is'
  }
  const activity = await postDistbinHtmlActivityForm(dbUrl, dhUrl, formFields)
  assert.equal(typeof activity.attributedTo, 'object')
  assert.equal(activity.attributedTo.name, formFields['attributedTo.name'])
  assert.equal(activity.attributedTo.url, formFields['attributedTo.url'])
}

tests['POST / can create activities with .tag'] = async function () {
  const dbUrl = await listen(http.createServer(distbin()))
  const dh = distbinHtml.createHandler({
    apiUrl: dbUrl,
    externalUrl: 'badurl'
  })
  const dhUrl = await listen(http.createServer(dh))
  const formFields = {
    content: 'lorem ipsum',
    'tag_csv': 'tag1,tag2'
  }
  const activity = await postDistbinHtmlActivityForm(dbUrl, dhUrl, formFields)
  assert.equal(Array.isArray(activity.object.tag), true)
  const tagNames = activity.object.tag.map(t => t.name)
  assert.equal(tagNames.includes('tag1'), true, 'tag includes tag1')
  assert.equal(tagNames.includes('tag2'), true, 'tag includes tag2')
}

async function postDistbinHtmlActivityForm (distbinUrl, distbinHtmlUrl, activityFormFields) {
  const postFormRequest = http.request(Object.assign(url.parse(distbinHtmlUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    }
  }))
  postFormRequest.write(querystring.stringify(activityFormFields))
  const dhResponse = await sendRequest(postFormRequest)
  assert.equal(dhResponse.statusCode, 302)
  assert(dhResponse.headers.location)
  // Ensure a generator was set
  // Note: getting from distbin, not distbin-html.
  const postedActivityUrl = url.resolve(distbinUrl, dhResponse.headers.location)
  const activityResponse = await sendRequest(http.request(Object.assign(url.parse(postedActivityUrl), {
    headers: {
      accept: 'application/json'
    }
  })))
  const activity = JSON.parse(await readableToString(activityResponse))
  return activity
}

tests['/activities/:id renders the .generator.name'] = async function () {
  const dbUrl = await listen(http.createServer(distbin()))
  const dh = distbinHtml.createHandler({
    apiUrl: dbUrl,
    externalUrl: 'badurl'
  })
  const dhUrl = await listen(http.createServer(dh))
  const postFormRequest = http.request(Object.assign(url.parse(dhUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded'
    }
  }))
  postFormRequest.write(querystring.stringify({
    name: 'activity name',
    content: 'This should have a generator.name of distbin-html'
  }))
  const dhResponse = await sendRequest(postFormRequest)
  assert.equal(dhResponse.statusCode, 302)
  assert(dhResponse.headers.location)
  // Ensure a generator was set
  const postedActivityUrl = url.resolve(dhUrl, dhResponse.headers.location)
  const activityResponse = await sendRequest(http.request(Object.assign(url.parse(postedActivityUrl), {
    headers: {
      accept: 'text/html'
    }
  })))
  const activityHtml = await readableToString(activityResponse)
  assert.equal(activityResponse.statusCode, 200)
  const sanitized = sanitize.toText(activityHtml)
  assert(sanitized.includes('via distbin-html'), 'html response includes .generator.name')
  // todo rdfa?
}

if (require.main === module) {
  testCli(tests)
}
