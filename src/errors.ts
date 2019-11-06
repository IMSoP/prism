import { ProblemJson } from '@stoplight/prism-core';

const INVALID_API_RESPONSE: ProblemJson = {
  status: 500,
  title: 'Invalid API Response',
  type: 'INVALID_API_RESPONSE',
  detail: 'The response from the upstream API server is invalid',
};

export { INVALID_API_RESPONSE };
