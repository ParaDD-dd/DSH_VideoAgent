/** Controlled EvoLink task HTTP responses; the tool and Agent loop stay real. */
import { applyLoopbackServerEffect } from '../loopback-fixture-server.mjs'

export const name = 'image-evolink-fixture'

export async function apply(ctx) {
  let restore = () => {}
  let created = false
  let polls = 0
  await applyLoopbackServerEffect(ctx, {
    label: 'image-evolink-fixture',
    requestListener(request, response) {
      request.resume()
      response.setHeader('content-type', 'application/json')
      if (request.method === 'POST' && request.url === '/v1/images/generations' && !created) {
        created = true
        response.end(JSON.stringify({ id: 'task-image-snapshot', status: 'pending' }))
      } else if (request.method === 'GET' && request.url === '/v1/tasks/task-image-snapshot' && created) {
        polls++
        response.end(JSON.stringify({
          id: 'task-image-snapshot', status: polls === 1 ? 'processing' : 'completed',
          ...(polls === 1 ? {} : { results: ['https://images.example/generated-cat.png'] }),
        }))
      } else {
        response.writeHead(400).end(JSON.stringify({ error: 'unexpected image request' }))
      }
    },
    onListening(address) {
      const original = globalThis.fetch
      globalThis.fetch = (input, init) => {
        const url = String(input)
        if (url.startsWith('https://image.evolink.test/')) {
          return original(url.replace('https://image.evolink.test', `http://127.0.0.1:${address.port}`), init)
        }
        return original(input, init)
      }
      restore = () => { globalThis.fetch = original }
    },
    onCleanup() { restore() },
  })
}
