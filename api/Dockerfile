FROM node:20-alpine
WORKDIR /app
COPY server.js residents.json ./
COPY public ./public
ENV DATA_DIR=/app/data
EXPOSE 3000
CMD ["node", "server.js"]
