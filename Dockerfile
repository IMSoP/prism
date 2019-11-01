FROM node:12-alpine as compiler

WORKDIR /usr/src/prism

COPY package.json yarn.lock tsconfig.json /usr/src/prism/
COPY src /usr/src/prism/src

RUN yarn && yarn tsc

###############################################################
FROM node:12-alpine as dependencies

WORKDIR /usr/src/prism/

COPY package.json /usr/src/prism/

ENV NODE_ENV production
RUN apk update && apk add curl
RUN yarn --production

RUN curl -sfL https://install.goreleaser.com/github.com/tj/node-prune.sh | sh
RUN ./bin/node-prune

###############################################################
FROM node:12-alpine

WORKDIR /usr/src/prism
ENV NODE_ENV production
ENV BASE_URL http://localhost:3000

COPY package.json /usr/src/prism/
COPY --from=compiler /usr/src/prism/lib /usr/src/prism/lib
COPY --from=dependencies /usr/src/prism/node_modules/ /usr/src/prism/node_modules/

WORKDIR /usr/src/prism/

EXPOSE 3000

ENTRYPOINT [ "node", "lib/index.js" ]
