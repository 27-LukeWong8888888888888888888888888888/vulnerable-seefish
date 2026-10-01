FROM node:22-alpine

WORKDIR /app

# The simulated lab device has no dependencies — plain node:http.
COPY services/device/server.js services/device/server.js

EXPOSE 8080

CMD ["node", "services/device/server.js"]
