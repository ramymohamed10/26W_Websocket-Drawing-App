// ===== MAIN DRAWING APPLICATION CLASS =====
// This class handles everything related to drawing and WebSocket communication
class DrawingApp {
    
    // ===== CONSTRUCTOR - RUNS WHEN APP STARTS =====
    constructor() {
        // Get the canvas element from HTML
        this.canvas = document.getElementById('drawing-canvas');
        
        // Get the 2D drawing context - this is what we use to draw
        this.ctx = this.canvas.getContext('2d');
        
        // Track whether the mouse is currently pressed down
        this.isDrawing = false;
        
        // Current drawing settings
        this.currentColor = '#000000';  // Black by default
        this.currentSize = 3;           // 3px brush by default
        
        // Track how many messages we've sent (for debugging)
        this.messageCount = 0;
        
        // WebSocket connection (will be created later)
        this.ws = null;
        
        // Unique ID for this client
        // Used to identify our own messages so we don't draw them twice
        this.clientId = Math.random().toString(36).substring(7);
        
        // Initialize everything
        this.setupCanvas();    // Set canvas size and mouse events
        this.setupControls();  // Set up color picker, brush size, etc.
        this.connectWebSocket(); // Connect to the server
    }
    
    // ===== CANVAS SETUP =====
    setupCanvas() {
        // Set canvas dimensions
        this.canvas.width = 800;
        this.canvas.height = 600;
        
        // ===== MOUSE EVENT LISTENERS =====
        // These handle drawing with a mouse
        
        // When mouse button is pressed, start drawing
        this.canvas.addEventListener('mousedown', this.startDrawing.bind(this));
        
        // When mouse moves, draw (if mouse is pressed)
        this.canvas.addEventListener('mousemove', this.draw.bind(this));
        
        // When mouse button is released, stop drawing
        this.canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
        
        // Stop drawing if mouse leaves the canvas
        this.canvas.addEventListener('mouseleave', this.stopDrawing.bind(this));
        
        // ===== TOUCH EVENT LISTENERS =====
        // These make the app work on phones and tablets
        
        this.canvas.addEventListener('touchstart', this.handleTouch.bind(this));
        this.canvas.addEventListener('touchmove', this.handleTouch.bind(this));
        this.canvas.addEventListener('touchend', this.stopDrawing.bind(this));
    }
    
    // ===== CONTROL PANEL SETUP =====
    setupControls() {
        // Get references to all control elements
        const colorPicker = document.getElementById('color-picker');
        const brushSize = document.getElementById('brush-size');
        const brushSizeDisplay = document.getElementById('brush-size-display');
        const clearBtn = document.getElementById('clear-btn');
        
        // ===== COLOR PICKER =====
        // When user selects a new color, update our current color
        colorPicker.addEventListener('change', (e) => {
            this.currentColor = e.target.value;
            console.log('Color changed to:', this.currentColor);
        });
        
        // ===== BRUSH SIZE SLIDER =====
        // When user adjusts the slider, update brush size
        brushSize.addEventListener('input', (e) => {
            this.currentSize = e.target.value;
            // Update the display to show current size
            brushSizeDisplay.textContent = `${e.target.value}px`;
            console.log('Brush size changed to:', this.currentSize);
        });
        
        // ===== CLEAR BUTTON =====
        // When clicked, clear the canvas and tell other users
        clearBtn.addEventListener('click', () => {
            console.log('Clear button clicked');
            
            // Clear our own canvas immediately
            this.clearCanvas();
            
            // Tell the server to clear everyone's canvas
            this.sendMessage({ type: 'clear' });
        });
    }
    
    // ===== WEBSOCKET CONNECTION SETUP =====
    connectWebSocket() {
        // Determine if we should use ws:// or wss:// (secure)
        // Use wss:// if the page is served over HTTPS
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        
        // Build the complete WebSocket URL
        // Example: ws://localhost:3000/ws or wss://myapp.azurewebsites.net/ws
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        
        // Display the URL in the info panel
        document.getElementById('ws-url').textContent = wsUrl;
        
        console.log('Connecting to WebSocket:', wsUrl);
        
        // Create new WebSocket connection
        this.ws = new WebSocket(wsUrl);
        
        // ===== CONNECTION OPENED =====
        // This runs when we successfully connect to the server
        this.ws.onopen = () => {
            console.log('✅ Connected to WebSocket server');
            
            // Update the UI to show we're connected
            this.updateConnectionStatus(true);
            
            // Start sending heartbeat messages to keep connection alive
            this.startHeartbeat();
        };
        
        // ===== MESSAGE RECEIVED =====
        // This runs whenever the server sends us a message
        this.ws.onmessage = (event) => {
            // Parse the JSON message from the server
            const message = JSON.parse(event.data);
            
            // Handle the message based on its type
            this.handleMessage(message);
        };
        
        // ===== CONNECTION CLOSED =====
        // This runs when the connection is lost
        this.ws.onclose = () => {
            console.log('❌ Disconnected from WebSocket server');
            
            // Update UI to show we're disconnected
            this.updateConnectionStatus(false);
            
            // Stop sending heartbeat messages
            this.stopHeartbeat();
            
            // Try to reconnect after 3 seconds
            console.log('Will attempt to reconnect in 3 seconds...');
            setTimeout(() => this.connectWebSocket(), 3000);
        };
        
        // ===== CONNECTION ERROR =====
        // This runs if there's an error with the connection
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            // The connection will close after an error, triggering onclose
        };
    }
    
    // ===== HANDLE INCOMING MESSAGES =====
    handleMessage(message) {
        // Different actions based on message type
        switch(message.type) {
            
            // ===== DRAWING MESSAGE =====
            case 'draw':
                // Check if this is our own drawing message
                // If it is, skip it (we already drew it locally)
                if (!message.data.clientId || message.data.clientId !== this.clientId) {
                    // This is from another user, so draw it
                    this.drawLine(message.data);
                }
                break;
            
            // ===== CLEAR CANVAS MESSAGE =====
            case 'clear':
                console.log('Received clear command from server');
                this.clearCanvas();
                break;
            
            // ===== DRAWING HISTORY =====
            // Received when we first connect - contains all previous drawings
            case 'history':
                console.log('Received drawing history:', message.data.length, 'items');
                // Draw each item from the history
                message.data.forEach(drawData => {
                    this.drawLine(drawData);
                });
                break;
            
            // ===== USER COUNT UPDATE =====
            case 'userCount':
                // Update the display to show how many users are connected
                document.getElementById('user-count').textContent = `Users: ${message.count}`;
                console.log('User count updated:', message.count);
                break;
            
            // ===== HEARTBEAT RESPONSE =====
            case 'pong':
                // Server responded to our ping - connection is healthy
                console.log('Heartbeat response received');
                break;
                
            default:
                console.log('Unknown message type:', message.type);
        }
    }
    
    // ===== DRAWING FUNCTIONS =====
    
    // Called when mouse button is pressed or touch starts
    startDrawing(e) {
        this.isDrawing = true;
        
        // Get the mouse position relative to the canvas
        const pos = this.getMousePos(e);
        
        // Remember this position for drawing lines
        this.lastX = pos.x;
        this.lastY = pos.y;
        
        console.log('Started drawing at:', pos);
    }
    
    // Called when mouse moves (only draws if mouse is pressed)
    draw(e) {
        // Only draw if mouse is pressed
        if (!this.isDrawing) return;
        
        // Get current mouse position
        const pos = this.getMousePos(e);
        
        // Create drawing data object with all necessary info
        const drawData = {
            fromX: this.lastX,           // Starting point X
            fromY: this.lastY,           // Starting point Y
            toX: pos.x,                  // Ending point X
            toY: pos.y,                  // Ending point Y
            color: this.currentColor,     // Color to draw with
            size: this.currentSize,       // Brush size
            timestamp: Date.now(),        // When this was drawn
            clientId: this.clientId       // Who drew this
        };
        
        // Draw on our own canvas immediately (no delay)
        this.drawLine(drawData);
        
        // Send drawing data to server so others can see it
        this.sendMessage({ type: 'draw', data: drawData });
        
        // Update last position for next line segment
        this.lastX = pos.x;
        this.lastY = pos.y;
    }
    
    // Called when mouse button is released
    stopDrawing() {
        if (this.isDrawing) {
            console.log('Stopped drawing');
            this.isDrawing = false;
        }
    }
    
    // ===== ACTUAL DRAWING ON CANVAS =====
    // This function does the actual drawing on the canvas
    drawLine(data) {
        // Start a new drawing path
        this.ctx.beginPath();
        
        // Move to starting position (don't draw yet)
        this.ctx.moveTo(data.fromX, data.fromY);
        
        // Draw line to ending position
        this.ctx.lineTo(data.toX, data.toY);
        
        // Set drawing properties
        this.ctx.strokeStyle = data.color;  // Line color
        this.ctx.lineWidth = data.size;     // Line thickness
        this.ctx.lineCap = 'round';         // Round line ends (smoother)
        
        // Actually draw the line on the canvas
        this.ctx.stroke();
    }
    
    // ===== CLEAR THE CANVAS =====
    clearCanvas() {
        // Clear the entire canvas (make it blank)
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        console.log('Canvas cleared');
    }
    
    // ===== GET MOUSE POSITION RELATIVE TO CANVAS =====
    // Converts mouse coordinates to canvas coordinates
    getMousePos(e) {
        // Get canvas position on the page
        const rect = this.canvas.getBoundingClientRect();
        
        // Calculate position relative to canvas
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    }
    
    // ===== HANDLE TOUCH EVENTS (FOR MOBILE) =====
    // Converts touch events to mouse events
    handleTouch(e) {
        // Prevent default touch behavior (like scrolling)
        e.preventDefault();
        
        // Get the first touch point
        const touch = e.touches[0];
        
        // Create equivalent mouse event
        const mouseEvent = new MouseEvent(
            // Convert touch event type to mouse event type
            e.type === 'touchstart' ? 'mousedown' : 
            e.type === 'touchmove' ? 'mousemove' : 'mouseup', 
            {
                clientX: touch.clientX,
                clientY: touch.clientY
            }
        );
        
        // Trigger the mouse event
        this.canvas.dispatchEvent(mouseEvent);
    }
    
    // ===== SEND MESSAGE TO SERVER =====
    sendMessage(message) {
        // Check if WebSocket is connected and ready
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            // Convert message object to JSON string and send
            this.ws.send(JSON.stringify(message));
            
            // Update message counter
            this.messageCount++;
            document.getElementById('message-count').textContent = this.messageCount;
        } else {
            console.warn('Cannot send message - WebSocket not connected');
        }
    }
    
    // ===== UPDATE CONNECTION STATUS DISPLAY =====
    updateConnectionStatus(connected) {
        const status = document.getElementById('connection-status');
        
        // Update text and CSS class based on connection state
        if (connected) {
            status.textContent = 'Connected';
            status.className = 'connected';
        } else {
            status.textContent = 'Disconnected';
            status.className = 'disconnected';
        }
    }
    
    // ===== HEARTBEAT MECHANISM =====
    // Sends periodic pings to keep the connection alive
    // Some servers/proxies close idle connections
    
    startHeartbeat() {
        console.log('Starting heartbeat');
        
        // Send a ping every 30 seconds
        this.heartbeatInterval = setInterval(() => {
            this.sendMessage({ type: 'ping' });
            console.log('Heartbeat ping sent');
        }, 30000); // 30000ms = 30 seconds
    }
    
    stopHeartbeat() {
        console.log('Stopping heartbeat');
        
        // Stop sending pings
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
    }
}

// ===== START THE APPLICATION =====
// Wait for the page to fully load before starting
document.addEventListener('DOMContentLoaded', () => {
    console.log('Page loaded, starting DrawingApp');
    
    // Create a new instance of our drawing application
    // This starts everything!
    new DrawingApp();
});