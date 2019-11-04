import { parse } from '@stoplight/yaml'
import { IHttpOperation } from '@stoplight/types'
import * as TE from 'fp-ts/lib/TaskEither'
import * as E from 'fp-ts/lib/Either'
import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/pipeable'
//@ts-ignore
import * as fetchFactory from 'make-fetch-happen'

const apiBaseUrl = process.env.STOPLIGHT_BASE_URL || 'https://stoplight.io/';

const fetch: typeof import('node-fetch').default = fetchFactory.defaults({
  cacheManager: './cache',
  cache: process.env.NODE_ENV === 'production' ? 'default' : 'no-cache',
})

type ApiResult = {
  items: {
    type: string
    id: string
    srn: string
  }[]
  pageInfo: {
    endCursor: string
    hasNextPage: boolean
    hasPreviousPage: boolean
    startCursor: string
  }
}

function fetchProjectDetails(sc: string, org: string, project: string) {

  const url = new URL('api/projects.nodes', apiBaseUrl);
  const searchParams = new URLSearchParams({ srn: `${sc}/${org}/${project}` });
  url.search = String(searchParams);

  function handleNextPage(result: ApiResult): TE.TaskEither<Error, ApiResult> {
    if (result.pageInfo.hasNextPage) {
      return pipe(
        TE.tryCatch<Error, ApiResult>(
          () => {
            searchParams.append('after', result.pageInfo.endCursor)
            url.search = String(searchParams);
            return fetch(String(url)).then(d => d.json())
          },
          E.toError
        ),
        TE.chain(res => {
          res.items.push(...result.items)
          return handleNextPage(res)
        })
      )
    }

    return TE.right<Error, ApiResult>(result)
  }

  return pipe(
    TE.tryCatch<Error, ApiResult>(() => fetch(String(url)).then(d => d.json()), E.toError),
    TE.chain(handleNextPage)
  )
}

function findServiceNode(projectNodes: ApiResult, serviceName: string) {
  return pipe(
    projectNodes.items,
    A.findFirst(t => t.type === 'http_service' && t.srn.includes(serviceName)),
    TE.fromOption(() => new Error('Unable to find the http service')),
    TE.map(serviceNode => ({ serviceNode, projectNodes }))
  )
}

function findHttpOperations(projectNodes: ApiResult['items'], serviceNode: ApiResult['items'][0]) {
  return TE.tryCatch(
    () =>
      Promise.all(
        projectNodes
          .filter(node => node.type === 'http_operation' && node.srn.indexOf(serviceNode.srn))
          .map(operationNode =>
            fetch(`https://stoplight.io/api/nodes.raw?srn=${encodeURIComponent(operationNode.srn)}`)
              .then(data => data.text())
              .then<IHttpOperation>(parse)
          )
      ),
    E.toError
  )
}

export default function grabOperationsSomehow(
  sc: string,
  org: string,
  project: string,
  serviceName: string
): TE.TaskEither<Error, IHttpOperation[]> {
  return pipe(
    fetchProjectDetails(sc, org, project),
    TE.chain(projectNodes => findServiceNode(projectNodes, serviceName)),
    TE.chain(({ projectNodes, serviceNode }) => findHttpOperations(projectNodes.items, serviceNode))
  )
}
