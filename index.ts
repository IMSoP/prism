import { json, text, send } from 'micri';
import micri from 'micri';
import route from '@stoplight/prism-http/dist/router';
import mock from '@stoplight/prism-http/dist/mocker';
import { createLogger } from '@stoplight/prism-core/dist/logger';
import * as typeis from 'type-is';
import { HttpMethod, IHttpOperation } from '@stoplight/types';
import { parse } from '@stoplight/yaml';
//@ts-ignore
import * as fetchFactory from 'make-fetch-happen';
import { pipe } from 'fp-ts/lib/pipeable'
import * as E from 'fp-ts/lib/Either'
import { ProblemJsonError } from '@stoplight/prism-core';

const fetch: typeof import('node-fetch').default = fetchFactory.defaults({ cacheManager: './cache' });

async function grabOperationsSomehow(): Promise<IHttpOperation[]> {
  type node = {
    type: string;
    id: string;
    srn: string;
  };
  const projectNodes: { items: node[] } = await fetch(
    'https://stoplight.io/api/projects.nodes?srn=gh/stoplightio/studio-demo'
  ).then(d => d.json());

  return Promise.all(
    projectNodes.items
      .filter(t => t.type === 'http_operation')
      .map(f =>
        fetch(`https://stoplight.io/api/nodes.raw?srn=${f.srn}&id=${f.id}`)
          .then(x => x.text())
          .then(q => parse<IHttpOperation>(q))
      )
  );

}

function createPrismInput(url: string, body: unknown, method: string) {
  const parsedUrl = new URL(url, 'http://localhost:3000');

  return {
    body,
    method: method as HttpMethod,
    url: {
      path: parsedUrl.pathname,
      query: Object.fromEntries(parsedUrl.searchParams.entries())
    }
  };

}

const logger = createLogger('Server');
const server = micri(async function requestHandler(req, res) {
  const body = await (typeis(req, ['application/json', 'application/*+json']) ? json(req) : text(req));
  const input = createPrismInput(req.url!, body, req.method!);
  const operations = await grabOperationsSomehow();

  return pipe(
    route({ resources: operations, input }),
    E.chain(resource => mock({ resource, input: { data: input, validations: [] }, config: { dynamic: true } })(logger)),
    E.mapLeft(e => ProblemJsonError.fromPlainError(e)),
    E.fold(e => send(res, e.status, e), response => send(res, response.statusCode, response.body))
  );

});

server.listen(process.env.PORT || 3000, () => console.info('Ready'));

