import * as t from 'io-ts';

export const EnvDecoder = t.strict({
  BASE_URL: t.string,
  STOPLIGHT_BASE_URL: t.string,
  PORT: t.string,
});

export type Env = t.TypeOf<typeof EnvDecoder>;
