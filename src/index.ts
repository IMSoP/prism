import { json, text, send } from 'micri';
import micri from 'micri';
import route from '@stoplight/prism-http/dist/router';
import mock from '@stoplight/prism-http/dist/mocker';
import { createLogger } from '@stoplight/prism-core/dist/logger';
import * as typeis from 'type-is';
import { HttpMethod } from '@stoplight/types';
import grabOperationsSomehow from './grabOperations'
import { pipe } from 'fp-ts/lib/pipeable'
import * as R from 'fp-ts/lib/Reader'
import * as RE from 'fp-ts/lib/ReaderEither'
import { ProblemJsonError } from '@stoplight/prism-core';

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
  const resources = await grabOperationsSomehow();

  return pipe(
    RE.fromEither(route({ resources, input })),
    RE.chain(resource => mock({ resource, input: { data: input, validations: [] }, config: { dynamic: true } })),
    RE.mapLeft(e => ProblemJsonError.fromPlainError(e)),
    RE.fold(e => R.of(send(res, e.status, e)), response => R.of(send(res, response.statusCode, response.body)))
  )(logger);

});

server.listen(process.env.PORT || 3000, () => console.info('Ready'));
