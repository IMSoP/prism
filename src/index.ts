import { json, text, send } from 'micri';
import micri from 'micri';
import route from '@stoplight/prism-http/dist/router';
import mock from '@stoplight/prism-http/dist/mocker';
import { validateInput } from '@stoplight/prism-http/dist/validator';
import { createLogger } from '@stoplight/prism-core/dist/logger';
import * as typeis from 'type-is';
import { HttpMethod, IHttpOperation } from '@stoplight/types';
import grabOperationsSomehow from './grabOperations';
import { pipe } from 'fp-ts/lib/pipeable';
import * as R from 'fp-ts/lib/Reader';
import * as E from 'fp-ts/lib/Either';
import * as RE from 'fp-ts/lib/ReaderEither';
import * as O from 'fp-ts/lib/Option';
import { ProblemJsonError, IPrismDiagnostic } from '@stoplight/prism-core';
import { IHttpRequest, IHttpOperationConfig } from '@stoplight/prism-http';
// @ts-ignore
import { URI } from 'uri-template-lite';

const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

function createPrismInput(url: URL, body: unknown, method: string) {
  return {
    body,
    method: method as HttpMethod,
    url: {
      path: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
    },
  };
}

const logger = createLogger('Server');

function validateInputAndMock(resource: IHttpOperation, element: IHttpRequest, config: IHttpOperationConfig) {
  return pipe(
    validateInput({ resource, element }),
    E.fold<IPrismDiagnostic[], unknown, IPrismDiagnostic[]>(validations => validations, () => []),
    validations => mock({ resource, input: { data: element, validations }, config })
  );
}

function readConfigFromQueryString(queryString: URLSearchParams): IHttpOperationConfig {
  return {
    code: queryString.get('__code') || undefined,
    exampleKey: queryString.get('__example') || undefined,
    dynamic: queryString.get('__dynamic') === 'true',
  };
}

const server = micri(async function requestHandler(req, res) {
  pipe(
    O.fromNullable<{ project: string; serviceName: string; prismUrl: string[] }>(
      new URI.Template('/{project}/{serviceName}{/prismUrl*}').match(req.url)
    ),
    O.fold(
      () => send(res, 404),
      async params => {
        const resourcesPromise = grabOperationsSomehow(params.project, params.serviceName);
        const bodyPromise = typeis(req, ['application/json', 'application/*+json']) ? json(req) : text(req);
        const parsedUrl = new URL(params.prismUrl.join('/'), baseUrl);
        const configFromQueryString = readConfigFromQueryString(parsedUrl.searchParams);

        const body = await bodyPromise;
        const input = createPrismInput(parsedUrl, body, req.method!);
        const resources = await resourcesPromise;

        return pipe(
          RE.fromEither(route({ resources, input })),
          RE.chain(resource => validateInputAndMock(resource, input, configFromQueryString)),
          RE.mapLeft(e => ProblemJsonError.fromPlainError(e)),
          RE.fold(e => R.of(send(res, e.status, e)), response => R.of(send(res, response.statusCode, response.body)))
        )(logger);
      }
    )
  );
});

server.listen(process.env.PORT || 3000, () => console.info('Ready'));
