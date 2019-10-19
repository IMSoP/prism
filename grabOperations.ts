import { parse } from '@stoplight/yaml';
import { IHttpOperation } from '@stoplight/types';
//@ts-ignore
import * as fetchFactory from 'make-fetch-happen';

const fetch: typeof import('node-fetch').default = fetchFactory.defaults({ cacheManager: './cache' });

export default async function grabOperationsSomehow(): Promise<IHttpOperation[]> {
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
