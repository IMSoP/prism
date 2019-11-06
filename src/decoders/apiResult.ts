import * as t from 'io-ts';

export const ApiResultDecoder = t.type({
  items: t.array(t.type({
    type: t.string,
    id: t.string,
    srn: t.string

  })),
  pageInfo: t.type({
    endCursor: t.string,
    hasNextPage: t.boolean,
    hasPreviousPage: t.boolean,
    startCursor: t.string
  })
})

export type ApiResult = t.TypeOf<typeof ApiResultDecoder>
