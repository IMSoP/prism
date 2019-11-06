import { parse } from '@stoplight/yaml';
import { IHttpOperation } from '@stoplight/types';
import * as TE from 'fp-ts/lib/TaskEither';
import * as E from 'fp-ts/lib/Either';
import * as A from 'fp-ts/lib/Array';
import { failure } from 'io-ts/lib/PathReporter';
import { pipe } from 'fp-ts/lib/pipeable';
//@ts-ignore
import * as fetchFactory from 'make-fetch-happen';
import { NOT_FOUND } from '@stoplight/prism-http';
import { ProblemJsonError } from '@stoplight/prism-core';
import { ApiResult, ApiResultDecoder, hasNextPage } from './decoders/apiResult';

const apiBaseUrl = process.env.STOPLIGHT_BASE_URL || 'https://stoplight.io/';

const fetch: typeof import('node-fetch').default = fetchFactory.defaults({
  cacheManager: './cache',
  cache: process.env.NODE_ENV === 'production' ? 'default' : 'no-cache',
});

function fetchAndValidate(url: string): TE.TaskEither<Error, ApiResult> {
  return pipe(
    TE.tryCatch(() => fetch(url).then(d => d.json()), E.toError),
    TE.chain(payload =>
      TE.fromEither(
        pipe(
          ApiResultDecoder.decode(payload),
          E.mapLeft(e => new Error(failure(e).join(','))),
        ),
      ),
    ),
  );
}

function fetchProjectDetails(sc: string, org: string, project: string) {
  const url = new URL('api/projects.nodes', apiBaseUrl);
  const searchParams = new URLSearchParams({ srn: `${sc}/${org}/${project}` });
  url.search = String(searchParams);

  function handleNextPage(result: ApiResult): TE.TaskEither<Error, ApiResult> {
    if (hasNextPage(result)) {
      searchParams.append('after', result.pageInfo.endCursor);
      url.search = String(searchParams);
      return pipe(
        fetchAndValidate(String(url)),
        TE.chain(res => {
          res.items.push(...result.items);
          return handleNextPage(res);
        }),
      );
    }

    return TE.right(result);
  }

  return pipe(
    fetchAndValidate(String(url)),
    TE.chain(handleNextPage),
  );
}

function findServiceNode(projectNodes: ApiResult, serviceName: string) {
  return pipe(
    projectNodes.items,
    A.findFirst(t => t.type === 'http_service' && t.srn.includes(serviceName)),
    TE.fromOption(() => ProblemJsonError.fromTemplate(NOT_FOUND, 'Unable to find the http service') as Error),
    TE.map(serviceNode => ({ serviceNode, projectNodes })),
  );
}

function findHttpOperations(projectNodes: ApiResult['items'], serviceNode: ApiResult['items'][0]) {
  const url = new URL('api/nodes.raw', apiBaseUrl);

  return TE.tryCatch(
    () =>
      Promise.all(
        projectNodes
          .filter(node => node.type === 'http_operation' && node.srn.indexOf(serviceNode.srn))
          .map(operationNode => {
            const searchParams = new URLSearchParams({ srn: operationNode.srn });
            url.search = String(searchParams);
            return fetch(String(url))
              .then(data => data.text())
              .then<IHttpOperation>(parse);
          }),
      ),
    E.toError,
  );
}

export default function grabOperationsSomehow(
  sc: string,
  org: string,
  project: string,
  serviceName: string,
): TE.TaskEither<Error, IHttpOperation[]> {
  return pipe(
    fetchProjectDetails(sc, org, project),
    TE.chain(projectNodes => findServiceNode(projectNodes, serviceName)),
    TE.chain(({ projectNodes, serviceNode }) => findHttpOperations(projectNodes.items, serviceNode)),
  );
}
