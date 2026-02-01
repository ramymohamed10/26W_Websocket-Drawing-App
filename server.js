// ===== IMPORT REQUIRED PACKAGES =====
// Express: Web framework for creating HTTP server and serving static files
const express = require('express');
// WebSocket: Library for WebSocket protocol implementation
const WebSocket = require('ws');
// Path: Node.js module for working with file paths
const path = require('path');

// ===== INITIALIZE EXPRESS APPLICATION =====
const app = express();
// Use environment variable PORT if available (required for Azure), otherwise use 3000
const PORT = process.env.PORT || 3000;

// ===== CONFIGURE EXPRESS MIDDLEWARE =====
// Serve static files (HTML, CSS, JS) from the 'public' directory
// This means when someone visits your site, they'll get these files
app.use(express.static('public'));

// ===== CREATE HEALTH CHECK ENDPOINT =====
// Azure App Service uses this to check if your app is running
// Without this, Azure might think your app is broken
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// ===== START HTTP SERVER =====
// Create HTTP server and listen on specified port
// We save the server instance because WebSocket needs to attach to it
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
});

// ===== CREATE WEBSOCKET SERVER =====
// WebSocket server attaches to the existing HTTP server
// The 'path' option means WebSocket connections go to ws://localhost:3000/ws
const wss = new WebSocket.Server({ 
    server,      // Attach to our Express server
    path: '/ws'  // WebSocket endpoint path
});

// ===== GLOBAL VARIABLES FOR STATE MANAGEMENT =====
// Set: A collection that stores unique connected clients
// Using Set instead of Array because it's easier to add/remove clients
const clients = new Set();

// Array to store all drawing actions
// This allows new users to see what was drawn before they joined
const drawingHistory = [];

// Limit history to prevent memory issues
// Once we have 1000 drawing actions, we'll remove the oldest ones
const MAX_HISTORY = 1000;

// ===== HANDLE NEW WEBSOCKET CONNECTIONS =====
// This function runs every time a new client connects
wss.on('connection', (ws) => {
    // Log that someone connected (useful for debugging)
    console.log('New client connected. Total clients:', clients.size + 1);
    
    // Add this new client to our set of connected clients
    clients.add(ws);
    
    // ===== SEND DRAWING HISTORY TO NEW CLIENT =====
    // When someone new joins, send them everything that's been drawn
    // This ensures they see the current state of the canvas
    if (drawingHistory.length > 0) {
        ws.send(JSON.stringify({
            type: 'history',           // Message type so client knows how to handle it
            data: drawingHistory       // All previous drawing data
        }));
    }
    
    // ===== UPDATE USER COUNT FOR ALL CLIENTS =====
    // Tell everyone how many users are connected
    broadcastUserCount();
    
    // ===== HANDLE MESSAGES FROM THIS CLIENT =====
    // This function runs whenever this client sends us a message
    ws.on('message', (message) => {
        try {
            // Parse the JSON message from the client
            // Messages are sent as strings, so we need to convert to objects
            const data = JSON.parse(message);
            
            // Handle different types of messages
            switch(data.type) {
                // ===== HANDLE DRAWING DATA =====
                case 'draw':
                    // Add this drawing action to our history
                    drawingHistory.push(data.data);
                    
                    // If history is too long, remove the oldest item
                    // This prevents server from using too much memory
                    if (drawingHistory.length > MAX_HISTORY) {
                        drawingHistory.shift(); // Remove first (oldest) item
                    }
                    
                    // Send this drawing to ALL connected clients
                    // Including the sender (they will ignore their own message)
                    broadcastToAll(data);
                    break;
                
                // ===== HANDLE CLEAR CANVAS =====
                case 'clear':
                    // Empty the drawing history
                    drawingHistory.length = 0;
                    
                    // Tell all clients to clear their canvas
                    broadcastToAll(data);
                    break;
                
                // ===== HANDLE HEARTBEAT =====
                // Clients send 'ping' to check if connection is still alive
                // This prevents the connection from timing out
                case 'ping':
                    // Respond with 'pong' to confirm we're still here
                    ws.send(JSON.stringify({ type: 'pong' }));
                    break;
                    
                default:
                    console.log('Unknown message type:', data.type);
            }
        } catch (error) {
            // If message parsing fails or any error occurs, log it
            // Don't crash the server just because of one bad message
            console.error('Error processing message:', error);
        }
    });
    
    // ===== HANDLE CLIENT DISCONNECTION =====
    // This runs when a client closes their browser or loses connection
    ws.on('close', () => {
        console.log('Client disconnected. Remaining clients:', clients.size - 1);
        
        // Remove this client from our set
        clients.delete(ws);
        
        // Update the user count for remaining clients
        broadcastUserCount();
    });
    
    // ===== HANDLE WEBSOCKET ERRORS =====
    // This prevents the server from crashing if there's a connection error
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        // The connection will be closed automatically after an error
    });
});

// ===== BROADCAST FUNCTION - SEND TO ALL CLIENTS =====
// This sends a message to every connected client
function broadcastToAll(data) {
    // Convert the data object to a JSON string
    const message = JSON.stringify(data);
    
    // Loop through all connected clients
    clients.forEach(client => {
        // Only send if the connection is still open
        // readyState check prevents errors from trying to send to disconnected clients
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// ===== BROADCAST USER COUNT =====
// Tell all clients how many users are currently connected
function broadcastUserCount() {
    // Create a message with the current user count
    const message = JSON.stringify({
        type: 'userCount',
        count: clients.size
    });
    
    // Send to all connected clients
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// ===== SERVER STARTUP COMPLETE =====
console.log('WebSocket server is ready for connections');