/**
 * Placard - HTTP/SSE transport
 *
 * Runs the MCP server with HTTP/SSE transport for remote usage.
 */

import { createServer as createHttpServer } from "node:http";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { createServer } from "./server.js";

const PORT = Number.parseInt(process.env["PORT"] ?? "3001", 10);
const HOST = process.env["HOST"] ?? "0.0.0.0";

async function main(): Promise<void> {
  const mcpServer = createServer();
  let sseTransport: SSEServerTransport | null = null;

  const httpServer = createHttpServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Health check endpoint
    if (url.pathname === "/health" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: "healthy",
          timestamp: new Date().toISOString(),
        }),
      );
      return;
    }

    // SSE endpoint for MCP
    if (url.pathname === "/sse" && req.method === "GET") {
      sseTransport = new SSEServerTransport("/messages", res);
      await mcpServer.connect(sseTransport);
      return;
    }

    // Message endpoint for MCP
    if (url.pathname === "/messages" && req.method === "POST") {
      if (!sseTransport) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "No SSE connection established" }));
        return;
      }

      // Collect request body
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks).toString();

      try {
        await sseTransport.handlePostMessage(req, res, body);
      } catch (error) {
        console.error("Error handling message:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: error instanceof Error ? error.message : "Unknown error",
          }),
        );
      }
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  });

  httpServer.listen(PORT, HOST, () => {
    console.log(`Placard MCP server listening on http://${HOST}:${PORT}`);
    console.log("SSE endpoint: /sse");
    console.log("Messages endpoint: /messages");
    console.log("Health check: /health");
  });
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
