FROM oven/bun:1

WORKDIR /app

COPY server.ts .

ENV PORT=3000
ENV META_APP_ID=""
ENV META_APP_SECRET=""
ENV META_API_VERSION="v22.0"
ENV CALLBACK_URL="https://example.com/callback"

EXPOSE 3000

CMD ["bun", "run", "server.ts"]
