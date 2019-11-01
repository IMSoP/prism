import { parse } from '@stoplight/yaml';
import { IHttpOperation } from '@stoplight/types';
import * as TE from 'fp-ts/lib/TaskEither'
import * as E from 'fp-ts/lib/Either'
import * as A from 'fp-ts/lib/Array'
import { pipe } from 'fp-ts/lib/pipeable'
//@ts-ignore
import * as fetchFactory from 'make-fetch-happen';

const fetch: typeof import('node-fetch').default = fetchFactory.defaults({ cacheManager: './cache' });

type ApiResult = {
  items: {
    type: string;
    id: string;
    srn: string;
  }[]
};

function fetchProjectDetails(sc: string, org: string, project: string) {
  return TE.tryCatch<Error, ApiResult>(() => fetch(
    `https://stoplight.io/api/projects.nodes?srn=${encodeURIComponent(sc)}/${encodeURIComponent(org)}/${encodeURIComponent(project)}`
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
      .filter(node => node.type === 'http_operation' && node.srn.indexOf(serviceNode.srn))
      .map(operationNode =>
        fetch(`https://stoplight.io/api/nodes.raw?srn=${encodeURIComponent(operationNode.srn)}`)
          .then(data => data.text())
          .then<IHttpOperation>(parse)
      )
  ), E.toError)
}

export default function grabOperationsSomehow(sc: string, org: string, project: string, serviceName: string): TE.TaskEither<Error, IHttpOperation[]> {
  return pipe(
    fetchProjectDetails(sc, org, project),
    TE.chain(projectNodes => findServiceNode(projectNodes, serviceName)),
    TE.chain(({ projectNodes, serviceNode }) => findHttpOperations(projectNodes.items, serviceNode))
  )
}
