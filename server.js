// Zero-dependency local server for team development. Run: npm start
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT) || 4173;
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

http.createServer((request, response) => {
  try {
    const urlPath = decodeURIComponent((request.url || "/").split("?")[0]);
    const requested = urlPath === "/" ? "/index.html" : urlPath;
    const filePath = path.resolve(root, `.${requested}`);
    if (!filePath.startsWith(root + path.sep) && filePath !== root) {
      response.writeHead(403); return response.end("Forbidden");
    }
    fs.readFile(filePath, (error, data) => {
      if (error) { response.writeHead(error.code === "ENOENT" ? 404 : 500, { "Content-Type": "text/plain; charset=utf-8" }); return response.end(error.code === "ENOENT" ? "Not found" : "Server error"); }
      response.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "application/octet-stream", "Cache-Control": "no-store" });
      response.end(data);
    });
  } catch {
    response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }); response.end("Invalid request");
  }
}).listen(port, () => console.log(`NoorPath is running at http://localhost:${port}`));
