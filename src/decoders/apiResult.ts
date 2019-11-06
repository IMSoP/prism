import * as t from 'io-ts';

export const ApiResultDecoder = t.type({
  items: t.array(
    t.type({
      type: t.string,
      id: t.number,
      srn: t.string,
    }),
  ),
  pageInfo: t.type({
    endCursor: t.union([t.undefined, t.string]),
    hasNextPage: t.boolean,
    hasPreviousPage: t.boolean,
    startCursor: t.union([t.undefined, t.string]),
  }),
});

export type ApiResult = t.TypeOf<typeof ApiResultDecoder>;
export type ApiResultWithNextPage = ApiResult & {
  pageInfo: {
    hasNextPage: true;
    endCursor: string;
  };
};

export function hasNextPage(result: ApiResult): result is ApiResultWithNextPage {
  return result.pageInfo.hasNextPage;
}
