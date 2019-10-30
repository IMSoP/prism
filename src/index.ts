import { json, text, send } from 'micri';
import micri from 'micri';
import route from '@stoplight/prism-http/dist/router';
import mock from '@stoplight/prism-http/dist/mocker';
import { validateInput } from '@stoplight/prism-http/dist/validator'
import { createLogger } from '@stoplight/prism-core/dist/logger';
import * as typeis from 'type-is';
import { HttpMethod, IHttpOperation } from '@stoplight/types';
import grabOperationsSomehow from './grabOperations'
import { pipe } from 'fp-ts/lib/pipeable'
import * as R from 'fp-ts/lib/Reader'
import * as E from 'fp-ts/lib/Either'
import * as RE from 'fp-ts/lib/ReaderEither'
import { ProblemJsonError, IPrismDiagnostic } from '@stoplight/prism-core';
import { IHttpRequest } from '@stoplight/prism-http';

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

function validateInputAndMock(resource: IHttpOperation, element: IHttpRequest) {
  return pipe(
    validateInput({ resource, element }),
    E.fold<IPrismDiagnostic[], unknown, IPrismDiagnostic[]>(validations => validations, () => []),
    validations => mock({ resource, input: { data: element, validations }, config: { dynamic: true } })
  )
}

const server = micri(async function requestHandler(req, res) {
  const resourcesPromise = grabOperationsSomehow();
  const body = await (typeis(req, ['application/json', 'application/*+json']) ? json(req) : text(req));
  const input = createPrismInput(req.url!, body, req.method!);

  const resources = await resourcesPromise;

  return pipe(
    RE.fromEither(route({ resources, input })),
    RE.chain(resource => validateInputAndMock(resource, input)),
    RE.mapLeft(e => ProblemJsonError.fromPlainError(e)),
    RE.fold(e => R.of(send(res, e.status, e)), response => R.of(send(res, response.statusCode, response.body)))
  )(logger);
});

server.listen(process.env.PORT || 3000, () => console.info('Ready'));
