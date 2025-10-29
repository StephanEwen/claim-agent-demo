import express, { Request, Response } from 'express';

const app = express();
app.use(express.json());

// Serve the chat interface
app.get('/chat/:chatId', (req: Request, res: Response) => {
  const { chatId } = req.params;
  
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Interview Chat - ${chatId}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        
        .chat-container {
            background: white;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
            width: 100%;
            max-width: 700px;
            height: 80vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        
        .chat-header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            text-align: center;
            font-size: 18px;
            font-weight: 600;
            border-radius: 12px 12px 0 0;
        }
        
        .chat-messages {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            background: #f7f9fc;
        }
        
        .message {
            margin-bottom: 16px;
            animation: slideIn 0.3s ease;
        }
        
        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateY(10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .message-label {
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 6px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        .agent-message .message-label {
            color: #667eea;
        }
        
        .user-message .message-label {
            color: #764ba2;
        }
        
        .message-content {
            background: white;
            padding: 12px 16px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
            line-height: 1.5;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        
        .agent-message .message-content {
            border-left: 3px solid #667eea;
        }
        
        .user-message .message-content {
            border-left: 3px solid #764ba2;
        }
        
        .chat-input-container {
            padding: 20px;
            background: white;
            border-top: 1px solid #e0e0e0;
        }
        
        .input-wrapper {
            display: flex;
            gap: 12px;
        }
        
        #messageInput {
            flex: 1;
            padding: 12px 16px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 14px;
            font-family: inherit;
            transition: border-color 0.2s;
        }
        
        #messageInput:focus {
            outline: none;
            border-color: #667eea;
        }
        
        #messageInput:disabled {
            background: #f5f5f5;
            cursor: not-allowed;
        }
        
        #sendButton {
            padding: 12px 28px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, opacity 0.2s;
        }
        
        #sendButton:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }
        
        #sendButton:active:not(:disabled) {
            transform: translateY(0);
        }
        
        #sendButton:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        
        .status {
            text-align: center;
            padding: 8px;
            font-size: 12px;
            color: #666;
            font-style: italic;
        }
        
        .typing-indicator {
            display: none;
            padding: 12px 16px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
            border-left: 3px solid #667eea;
            margin-bottom: 16px;
        }
        
        .typing-indicator.active {
            display: block;
        }
        
        .typing-dots {
            display: inline-flex;
            gap: 4px;
        }
        
        .typing-dots span {
            width: 8px;
            height: 8px;
            background: #667eea;
            border-radius: 50%;
            animation: bounce 1.4s infinite ease-in-out both;
        }
        
        .typing-dots span:nth-child(1) {
            animation-delay: -0.32s;
        }
        
        .typing-dots span:nth-child(2) {
            animation-delay: -0.16s;
        }
        
        @keyframes bounce {
            0%, 80%, 100% {
                transform: scale(0);
            }
            40% {
                transform: scale(1);
            }
        }
        
        .processing-message {
            display: none;
            padding: 12px 16px;
            background: #f5f5f5;
            border-radius: 8px;
            margin-bottom: 12px;
            border-left: 3px solid #764ba2;
        }
        
        .processing-message.active {
            display: block;
        }
        
        .processing-label {
            font-size: 11px;
            font-weight: 600;
            color: #764ba2;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .processing-content {
            color: #666;
            line-height: 1.4;
            font-size: 14px;
            word-wrap: break-word;
            white-space: pre-wrap;
        }
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="chat-header">
            Interview Chat
            <div style="font-size: 12px; font-weight: 400; margin-top: 4px; opacity: 0.9;">
                Session: ${chatId}
            </div>
        </div>
        
        <div class="chat-messages" id="chatMessages">
            <div class="typing-indicator" id="typingIndicator">
                <div class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        </div>
        
        <div class="chat-input-container">
            <div class="processing-message" id="processingMessage">
                <div class="processing-label">
                    Processing message
                    <div class="typing-dots">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </div>
                <div class="processing-content" id="processingContent"></div>
            </div>
            <div class="status" id="status">Ready to chat</div>
            <div class="input-wrapper">
                <input 
                    type="text" 
                    id="messageInput" 
                    placeholder="Type your message..." 
                    autocomplete="off"
                />
                <button id="sendButton">Send</button>
            </div>
        </div>
    </div>

    <script>
        const chatId = '${chatId}';
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        const chatMessages = document.getElementById('chatMessages');
        const status = document.getElementById('status');
        const typingIndicator = document.getElementById('typingIndicator');
        const processingMessage = document.getElementById('processingMessage');
        const processingContent = document.getElementById('processingContent');
        
        let isWaitingForAgent = false;
        let lastMessageCount = 0;
        let pollInterval;
        
        // Poll for new messages
        async function pollMessages() {
            try {
                const response = await fetch(\`http://localhost:8080/interview/\${chatId}/getHistory\`);
                if (response.ok) {
                    const history = await response.json();
                    if (history.length !== lastMessageCount) {
                        renderMessages(history);
                        lastMessageCount = history.length;
                        
                        // Check if last message was from user
                        const lastMessage = history[history.length - 1];
                        if (lastMessage && lastMessage.user && !lastMessage.agent) {
                            // Waiting for agent response
                            isWaitingForAgent = true;
                            typingIndicator.classList.add('active');
                            updateUI();
                        } else if (lastMessage && lastMessage.agent) {
                            // Agent has responded - hide processing message and re-enable input
                            isWaitingForAgent = false;
                            typingIndicator.classList.remove('active');
                            processingMessage.classList.remove('active');
                            updateUI();
                        }
                    }
                }
            } catch (error) {
                console.error('Error polling messages:', error);
            }
        }
        
        function renderMessages(history) {
            // Keep typing indicator, clear other messages
            const messages = history.map(msg => {
                let html = '';
                if (msg.agent) {
                    html += \`
                        <div class="message agent-message">
                            <div class="message-label">Agent</div>
                            <div class="message-content">\${escapeHtml(msg.agent)}</div>
                        </div>
                    \`;
                }
                if (msg.user) {
                    html += \`
                        <div class="message user-message">
                            <div class="message-label">You</div>
                            <div class="message-content">\${escapeHtml(msg.user)}</div>
                        </div>
                    \`;
                }
                return html;
            }).join('');
            
            // Insert messages before typing indicator
            chatMessages.innerHTML = messages + '<div class="typing-indicator" id="typingIndicator"><div class="typing-dots"><span></span><span></span><span></span></div></div>';
            
            // Restore typing indicator reference
            const newTypingIndicator = document.getElementById('typingIndicator');
            if (isWaitingForAgent) {
                newTypingIndicator.classList.add('active');
            }
            
            // Scroll to bottom
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        
        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
        
        function updateUI() {
            if (isWaitingForAgent) {
                messageInput.disabled = true;
                sendButton.disabled = true;
                status.textContent = 'Waiting for agent response...';
            } else {
                messageInput.disabled = false;
                sendButton.disabled = false;
                status.textContent = 'Ready to chat';
            }
        }
        
        async function sendMessage() {
            const message = messageInput.value.trim();
            if (!message || isWaitingForAgent) return;
            
            try {
                const response = await fetch(\`http://localhost:8080/interview/\${chatId}/userMessage/send\`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ message }),
                });
                
                if (response.ok) {
                    // Show processing message
                    processingContent.textContent = message;
                    processingMessage.classList.add('active');
                    
                    messageInput.value = '';
                    isWaitingForAgent = true;
                    typingIndicator.classList.add('active');
                    updateUI();
                    // Poll immediately after sending
                    pollMessages();
                } else {
                    status.textContent = 'Error sending message. Please try again.';
                }
            } catch (error) {
                console.error('Error sending message:', error);
                status.textContent = 'Error sending message. Please try again.';
            }
        }
        
        // Event listeners
        sendButton.addEventListener('click', sendMessage);
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage();
            }
        });
        
        // Start polling
        pollMessages();
        pollInterval = setInterval(pollMessages, 1000);
        
        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            clearInterval(pollInterval);
        });
    </script>
</body>
</html>
  `);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Chat server running on http://localhost:${PORT}`);
  console.log(`Access chat interface at http://localhost:${PORT}/chat/<chat-id>`);
});

export default app;

