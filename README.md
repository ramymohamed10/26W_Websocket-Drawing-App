# Week 4 Lab: Collaborative Drawing Board (WebSocket Application)

> **Note:** This is an ungraded activity.

This exercise walks you through a real-time collaborative drawing application built with WebSockets and Node.js. You will run the application locally, explore how the server and client communicate over a persistent WebSocket connection, and observe the WebSocket concepts covered in the Week 4 lecture in working code.

---

## Learning Objectives

By completing this exercise, you will be able to:

- Explain the difference between HTTP request-response communication and WebSocket persistent connections.
- Run and test a real-time WebSocket application locally.
- Read and trace WebSocket server-side code: connection handling, message handling, and broadcasting.
- Read and trace WebSocket client-side code: connection setup, event callbacks, and drawing logic.
- Identify how WebSocket concepts from the lecture (handshake, full-duplex, frames, connection states) appear in a working application.

---

## Background: Why WebSockets?

Both REST and GraphQL follow a pull-based model: the client must send a request to receive data. The server cannot send updates on its own. For a collaborative drawing application, this means the client would need to repeatedly ask the server for new drawings (a technique called polling), which wastes bandwidth and introduces delay.

WebSockets solve this problem. A WebSocket connection starts with an HTTP handshake, then upgrades to a persistent, full-duplex TCP connection. Once open, both the client and the server can send messages at any time without re-establishing the connection.

```
HTTP Polling                              WebSocket
-----------                               ---------
Client: "Any new drawings?"               Client: "Upgrade to WebSocket"
Server: "No."                             Server: "Connection established."
Client: "Any new drawings?"                        |
Server: "No."                             Server pushes: "User A drew a line"
Client: "Any new drawings?"               Server pushes: "User B drew a circle"
Server: "Yes, here is one."               Client sends:  "I drew a triangle"
                                          Server pushes: "User C drew a star"

Problem: constant requests,               Solution: server pushes updates
most return nothing.                       instantly through one connection.
```

---

## Application Overview

This application provides a shared drawing canvas. Multiple users open the same page in their browsers, and every stroke drawn by one user appears instantly on all other users' screens. Users who join after others have already been drawing see the full drawing history replayed on their canvas.

Features:

- Real-time collaborative drawing across multiple browser windows
- Color picker for choosing any drawing color
- Adjustable brush size (1px to 20px)
- Live user count showing connected participants
- Automatic reconnection when the connection drops
- Touch support for mobile devices
- Clear canvas button (clears for all connected users)
- Drawing history replay for users who join late

---

## Technology Stack

| Layer             | Technology                       |
| ----------------- | -------------------------------- |
| Runtime           | Node.js                          |
| HTTP Server       | Express.js                       |
| WebSocket Library | `ws`                             |
| Frontend          | Vanilla JavaScript, HTML5 Canvas |
| Styling           | CSS3 with responsive design      |
| Deployment        | Azure App Service (optional)     |

---

## Prerequisites

Before you begin, ensure the following are installed:

- Node.js (v14.0.0 or higher)
- npm (included with Node.js)
- Git
- A code editor (VS Code recommended)
- A web browser (Chrome, Firefox, or Edge recommended)

---

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/ramymohamed10/26W_Websocket-Drawing-App.git
cd 26W_Websocket-Drawing-App
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Start the Server

```bash
# Development mode (auto-restarts on file changes)
npm run dev

# Or production mode
npm start
```

### 4. Open in Browser

Open `http://localhost:3000` in your browser.

### 5. Test Real-Time Communication

Open a second browser tab (or window) to the same URL. Draw something in one tab and observe the drawing appear in the other tab. This is the WebSocket connection in action.

---

## Project Structure

```
26W_Websocket-Drawing-App/
├── server.js              Express HTTP server + WebSocket server
├── package.json           npm dependencies and scripts
└── public/                Static frontend files served by Express
    ├── index.html         HTML page with canvas and drawing controls
    ├── app.js             Client-side DrawingApp class (canvas + WebSocket logic)
    └── styles.css         Responsive CSS styling
```

Express serves the `public/` directory as static files. The `ws` WebSocket server is attached to the same HTTP server on the same port, listening at the `/ws` path.

---

## How It Works

### End-to-End Flow

The following diagram shows what happens when a user draws, and when a new user joins:

```
User A draws on canvas
    |
    +-> drawLine() locally (instant feedback)
    +-> ws.send({ type: 'draw', data: {...} })
            |
            v
        Server receives message
            |
            +-> Stores in drawingHistory[]
            +-> broadcastToAll()
                    |
            +-------+-------+
            v       v       v
         User A  User B  User C
         (skip)  (draw)  (draw)

User D joins later
    |
    v
Server sends { type: 'history', data: [...] }
    |
    v
User D replays all strokes -> sees the full drawing
```

The user sees their own stroke immediately (drawn locally) before the server even receives it. The server then broadcasts the stroke to all connected clients. Each client checks the `clientId` field to avoid drawing the same stroke twice.

### Message Protocol

All messages between client and server are JSON strings. The `type` field determines how each message is handled.

| Direction        | `type`      | Payload                                                       | Purpose                              |
| ---------------- | ----------- | ------------------------------------------------------------- | ------------------------------------ |
| Client to Server | `draw`      | `{ data: { fromX, fromY, toX, toY, color, size, clientId } }` | Send a line segment                  |
| Client to Server | `clear`     | `{}`                                                          | Request canvas clear                 |
| Client to Server | `ping`      | `{}`                                                          | Heartbeat keep-alive                 |
| Server to Client | `draw`      | `{ data: { fromX, fromY, toX, toY, color, size, clientId } }` | Broadcast a line segment             |
| Server to Client | `clear`     | `{}`                                                          | Broadcast canvas clear               |
| Server to Client | `history`   | `{ data: [ ...drawData ] }`                                   | Full drawing history for new clients |
| Server to Client | `userCount` | `{ count: N }`                                                | Number of connected users            |
| Server to Client | `pong`      | `{}`                                                          | Heartbeat response                   |

### WebSocket Concepts in This Application

The following table maps lecture concepts to where they appear in the code:

| Concept                   | Where it appears                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------ |
| Full-duplex communication | Client sends strokes, server pushes others' strokes:both directions, at any time  |
| Persistent connection     | One WebSocket connection stays open for the entire session                           |
| Handshake (HTTP upgrade)  | `new WebSocket('ws://...')` triggers the upgrade from HTTP to WebSocket              |
| `ws://` vs `wss://`       | Client auto-detects protocol based on `http://` vs `https://` page URL               |
| Frames                    | Each `JSON.stringify(...)` / `ws.send(...)` is transmitted as a WebSocket text frame |
| Low latency               | Strokes appear instantly:no HTTP request/response overhead per stroke             |
| Connection states         | CONNECTING, OPEN, CLOSING, CLOSED mapped to the UI status indicator                  |
| Close frame               | Either side can disconnect; server cleans up and broadcasts new user count           |

---

## Code Walkthrough

Open each file in your editor and follow along with the descriptions below.

### Server: `server.js`

1. **Express setup and static file serving:** At the top of the file, Express is configured to serve the `public/` directory. The HTTP server instance is stored in a variable because the WebSocket server needs to attach to it.

2. **WebSocket server creation:** `new WebSocket.Server({ server, path: '/ws' })` creates a WebSocket server attached to the same HTTP server, listening at the `/ws` endpoint.

3. **State management:** Two data structures hold the application state in memory:
   - `clients` (a `Set`) tracks all active WebSocket connections.
   - `drawingHistory` (an array) stores drawing actions, capped at 1,000 entries via `MAX_HISTORY` to prevent unbounded memory growth.

4. **Connection handler** (`wss.on('connection', ...)`): When a new client connects, the server adds it to the `clients` set, sends the full drawing history, and broadcasts an updated user count to all clients.

5. **Message handler** (`ws.on('message', ...)`): Parses the incoming JSON and uses a `switch` statement on `data.type` to handle `draw`, `clear`, and `ping` messages.

6. **Broadcasting** (`broadcastToAll` function): Iterates over every client in the set. Before sending, it checks `readyState === WebSocket.OPEN` to skip clients that have disconnected but have not yet been removed.

7. **Disconnection** (`ws.on('close', ...)`): Removes the client from the set and broadcasts an updated user count.

### Client: `public/app.js`

1. **DrawingApp class constructor:** Initializes the canvas element, drawing state, current color and brush size, a message counter, and a unique `clientId` (used to filter out the sender's own broadcast messages). Calls three setup methods.

2. **Canvas and event listeners** (`setupCanvas`): Sets the canvas dimensions and registers event listeners for mouse events (`mousedown`, `mousemove`, `mouseup`, `mouseleave`) and touch events for mobile support.

3. **WebSocket connection** (`connectWebSocket`): Determines the WebSocket URL dynamically: if the page was loaded over `https:`, it uses `wss:`; otherwise `ws:`. Creates the WebSocket object and registers four event callbacks:
   - `onopen`: Updates the UI status to "Connected" and starts the heartbeat.
   - `onmessage`: Parses JSON and calls `handleMessage`.
   - `onclose`: Updates the UI status, stops the heartbeat, and schedules a reconnection attempt after 3 seconds.
   - `onerror`: Logs the error (the `onclose` handler covers recovery).

4. **Drawing and sending** (`draw` method): On each mouse move while drawing, captures the coordinates, color, and brush size into a data object. Draws the line locally for instant visual feedback, then sends the data to the server via `ws.send()`.

5. **Receiving messages** (`handleMessage`): Routes incoming messages by `type`:
   - `draw`: Draws the line only if `clientId` does not match (prevents drawing the same stroke twice).
   - `clear`: Clears the canvas.
   - `history`: Replays all stored strokes for late-joining users.
   - `userCount`: Updates the user count display.

6. **Heartbeat** (`startHeartbeat` / `stopHeartbeat`): Sends a `ping` message every 30 seconds. The server responds with `pong`. This keeps the connection alive and prevents proxies or cloud platforms from closing idle connections.

---

## Exercises

After running the application and reading through the code, complete the following:

### Exercise 1: Test Real-Time Synchronization

Open three or more browser tabs to `http://localhost:3000`. Draw in one tab and verify the drawing appears in all others. Try different colors and brush sizes. Click "Clear Canvas" in one tab and observe the effect on all tabs.

### Exercise 2: Inspect WebSocket Traffic in the Browser

Open your browser's Developer Tools (press F12), go to the **Network** tab, and filter by **WS** (WebSocket). Refresh the page and click on the WebSocket connection that appears. Switch to the **Messages** panel and observe the messages flowing between client and server. Identify `draw`, `userCount`, `ping`, and `pong` messages. Close one tab and watch for the updated `userCount` message in the remaining tabs.

### Exercise 3: Trace the Code Path

Starting from when a user moves the mouse on the canvas, trace the data flow through the following steps. Open each file and find the relevant function:

1. `draw()` method in `app.js`: captures coordinates and sends the message.
2. `sendMessage()` in `app.js`: validates the connection and calls `ws.send()`.
3. `ws.on('message', ...)` in `server.js`: receives and parses the message.
4. `broadcastToAll()` in `server.js`: sends the message to all connected clients.
5. `handleMessage()` in `app.js` (on the receiving client): draws the line on the canvas.

### Exercise 4: Test Auto-Reconnection

Stop the server by pressing Ctrl+C in the terminal. Observe the status indicator in the browser change to "Disconnected". Restart the server with `npm run dev`. Wait a few seconds and observe the client automatically reconnect and the status return to "Connected".

### Exercise 5: Test Drawing History

Draw several strokes on the canvas. Then open a new browser tab to `http://localhost:3000`. Verify that the new tab displays all the previous drawings immediately upon connecting. This is the `history` message in action.

