import { parse } from '@stoplight/yaml';
import { IHttpOperation } from '@stoplight/types';
import * as TE from 'fp-ts/lib/TaskEither'
import * as E from 'fp-ts/lib/Either'
import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/pipeable'
//@ts-ignore
import * as fetchFactory from 'make-fetch-happen';

const fetch: typeof import('node-fetch').default = fetchFactory.defaults({
  cacheManager: './cache',
});

type ApiResult = {
  items: {
    type: string;
    id: string;
    srn: string;
  }[]
};

function fetchProjectDetails(project: string) {
  return TE.tryCatch<Error, ApiResult>(() => fetch(
    `https://stoplight.io/api/projects.nodes?srn=gh/stoplightio/${encodeURIComponent(project)}`
  ).then(d => d.json()), E.toError);
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
  return TE.tryCatch(() => Promise.all(
    projectNodes
      .filter(t => t.type === 'http_operation' && t.srn.indexOf(serviceNode.srn))
      .map(f =>
        fetch(`https://stoplight.io/api/nodes.raw?srn=${encodeURIComponent(f.srn)}`)
          .then(x => x.text())
          .then(q => parse<IHttpOperation>(q))
      )
  ), E.toError)
}

export default function grabOperationsSomehow(project: string, serviceName: string): TE.TaskEither<Error, IHttpOperation[]> {
  return pipe(
    fetchProjectDetails(project),
    TE.chain(projectNodes => findServiceNode(projectNodes, serviceName)),
    TE.chain(({ projectNodes, serviceNode }) => findHttpOperations(projectNodes.items, serviceNode))
  )
}
