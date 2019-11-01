import { parse } from '@stoplight/yaml';
import { IHttpOperation } from '@stoplight/types';
//@ts-ignore
import * as fetchFactory from 'make-fetch-happen';

const fetch: typeof import('node-fetch').default = fetchFactory.defaults({
  cacheManager: './cache',
});

export default async function grabOperationsSomehow(project: string, serviceName: string): Promise<IHttpOperation[]> {
  type node = {
    type: string;
    id: string;
    srn: string;
  };
  const projectNodes: { items: node[] } = await fetch(
    `https://stoplight.io/api/projects.nodes?srn=gh/stoplightio/${encodeURIComponent(project)}`
  ).then(d => d.json());

  const service = projectNodes.items.find(t => t.type === 'http_service' && t.srn.includes(serviceName));

  return Promise.all(
    projectNodes.items
      .filter(t => t.type === 'http_operation' && t.srn.indexOf(service!.srn))
      .map(f =>
        fetch(`https://stoplight.io/api/nodes.raw?srn=${encodeURIComponent(f.srn)}`)
          .then(x => x.text())
          .then(q => parse<IHttpOperation>(q))
      )
  );
}
