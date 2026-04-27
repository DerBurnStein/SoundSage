FROM node:20-slim

WORKDIR /app

COPY server/package.json server/tsconfig.json ./server/
RUN cd server && npm install

COPY server ./server

ENV NODE_ENV=production
WORKDIR /app/server

EXPOSE 8080
CMD ["npm", "run", "start"]
