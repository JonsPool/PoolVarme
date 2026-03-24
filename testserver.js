/*
This server simulates the behavior of the script endpoints on the Shelly - useful for
developing and testing endpoint.html. The browser view is automatically refreshed when
endpoint.html is modified.

Start with 'npm run dev'.
Note that endpoint.html cannot be opened in VS simultaneously as checking it in the browser.
*/

import { readFile, watch } from "fs/promises";
import http from "http";
import { WebSocketServer } from "ws";

const hostname = "127.0.0.1";
const port = 3000;
const wsPort = 3001;
const htmlPath = "./src/endpoint.html";

const data = {
  a: 1771801200000,                     // date and time in ms. Here 2026-02-23. T0 is 1970-01-01 00:00
  n: 0,
  s: 1.1,       // was 0
  p: [
    10.186, 10.031, 9.978, 9.65, 9.613, 9.631, 9.597, 8.883, 6.506, 1.534, -0.002, -0.1, -1.238,
    -1.717, -1.46, -0.342, -0.005, 2.56, 8.391, 10.796, 12.464, 11.743, 10.704, 9.417,
  ],                                  // o is the switch status. True if active
  o: [
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    true,
    null,
    true,
    true,
    true,
    true,
  ],
    r: 53730,
  q: null,           // Mitt tillägg. q är heating season
};
let endpointHTML = "";

// Read endpoint.html
const loadEndpointHTML = async () => {
  try {
    endpointHTML = await readFile(htmlPath, "utf8");
  } catch (error) {
    console.error("Error reading endpoint.html:", error);
    endpointHTML = "<h1>Error loading content</h1>";
  }
};
// console.log("Hej!");  //Skriver till std output. Perfekt!
await loadEndpointHTML();

const clients = new Set();

(async () => {
  const watcher = watch(htmlPath);
  for await (const event of watcher) {
    if (event.eventType === "change") {
      await loadEndpointHTML();
      for (const client of clients) {
        if (client.readyState === 1) {
          client.send("reload");
        }
      }
    }
  }
})();

const server = http.createServer((req, res) => {
  if (req.method === "GET") {
    if (req.url === "/spotelly") {
        res.statusCode = 200;
        console.log("Part 1");   // utskrift.    Denna del körs nu när jag klickar på refresh i Browsern och har /spotelly!
      res.setHeader("Content-Type", "text/html");
      const injectedHTML = endpointHTML.replace(
        "</body>",
        `<script>
          const ws = new WebSocket("ws://${hostname}:${wsPort}");
          ws.onmessage = (event) => {
            if (event.data === "reload") location.reload();
          };
        </script></body>`,
      );
      res.end(injectedHTML);
    } else if (req.url === "/data") {                           // Verkar som om den laddar in data ifall den inte hittar prisdata som är ok
        res.statusCode = 200;
        console.log("Part 2");   // utskrift om jag sätter /data i browsern
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(data));
    } else {                                                   // Och här om något är fel
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain");
      res.end("404 Not Found\n");
    }
  } else if (req.method === "POST" && req.url === "/data") {       // ..alternativt hamnar vi här och lägger ut data-variablen
    let body = "";
    req.on("data", chunk => {
      body += chunk;
    });
    req.on("end", () => {
      const upd = JSON.parse(body);
      const idx = (upd.h - data.a) / 3600000;
      data.o[idx] = upd.o;
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(data));
    });
  } else {                                                      // och här om något är fel
    res.statusCode = 405;
    res.setHeader("Content-Type", "text/plain");
    res.end("405 Method Not Allowed\n");
  }
});

server.listen(port, hostname, () => {
  console.log(`http://${hostname}:${port}/spotelly`);
});

const wss = new WebSocketServer({ port: wsPort });
wss.on("connection", ws => {
  clients.add(ws);
  ws.on("close", () => clients.delete(ws));
});
