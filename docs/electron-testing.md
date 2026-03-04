# Electron UI Testing (Chrome DevTools Protocol)

The Electron sidecar window runs with remote debugging enabled on port 9222. This allows programmatic inspection and testing of the UI state via the Chrome DevTools Protocol.

## Prerequisites

The Electron app automatically enables remote debugging when launched. Verify it's accessible:

```bash
curl -s http://127.0.0.1:9222/json | python3 -m json.tool
```

## Testing UI State with Node.js

Use the WebSocket API to execute JavaScript in the Electron renderer and inspect UI state:

```javascript
// test-electron-ui.js
const WebSocket = require('ws');

const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/<PAGE_ID>');

ws.on('open', () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `
        (function() {
          const messages = document.querySelectorAll('.message');
          const toolCalls = document.querySelectorAll('.tool-call');
          return {
            sessionId: window.sessionId,
            messagesCount: messages.length,
            toolCallsCount: toolCalls.length,
            messages: Array.from(messages).map(m => ({
              class: m.className,
              text: m.textContent.slice(0, 200)
            }))
          };
        })()
      `,
      returnByValue: true
    }
  }));
});

ws.on('message', (data) => {
  const response = JSON.parse(data);
  if (response.id === 1) {
    console.log(JSON.stringify(response.result?.result?.value, null, 2));
    ws.close();
  }
});
```

## Common UI Test Queries

**Get page ID first:**
```bash
curl -s http://127.0.0.1:9222/json | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])"
```

**Check UI state (inline):**
```bash
node << 'EOF'
const WebSocket = require('ws');
const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/<PAGE_ID>');

ws.on('open', () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `({
        hasConfig: !!window.sidecarConfig,
        model: window.sidecarConfig?.model,
        messagesCount: document.querySelectorAll('.message').length,
        toolCallsCount: document.querySelectorAll('.tool-call').length,
        errorMessages: Array.from(document.querySelectorAll('.error-message')).map(e => e.textContent)
      })`,
      returnByValue: true
    }
  }));
});

ws.on('message', (data) => {
  const r = JSON.parse(data);
  if (r.id === 1) { console.log(JSON.stringify(r.result?.result?.value, null, 2)); ws.close(); }
});

setTimeout(() => { ws.close(); process.exit(0); }, 5000);
EOF
```

**Get tool call details:**
```bash
node << 'EOF'
const WebSocket = require('ws');
const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/<PAGE_ID>');

ws.on('open', () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: `
        Array.from(document.querySelectorAll('.tool-call')).map(t => ({
          class: t.className,
          html: t.innerHTML.slice(0, 500)
        }))
      `,
      returnByValue: true
    }
  }));
});

ws.on('message', (data) => {
  const r = JSON.parse(data);
  if (r.id === 1) { console.log(JSON.stringify(r.result?.result?.value, null, 2)); ws.close(); }
});

setTimeout(() => { ws.close(); process.exit(0); }, 5000);
EOF
```

## Expected UI Elements

When testing the sidecar UI, verify these elements:

| Selector | Description | Expected Content |
|----------|-------------|------------------|
| `.message.system` | Task briefing | "Task: {briefing}" |
| `.message.assistant` | Model response | Response text |
| `.message.user` | User input | User's message |
| `.tool-call` | Tool execution | Tool name, input, output |
| `.tool-call.completed` | Completed tool | Has ✓ status |
| `.tool-call.running` | Running tool | Has ... status |
| `.tool-status-panel` | Tool summary | "Tools: X/Y completed" |
| `.reasoning` | Model reasoning | Collapsible thinking |
| `.error-message` | Error display | Error text |

## Debugging Tips

1. **Get WebSocket URL**: `curl -s http://127.0.0.1:9222/json | jq '.[0].webSocketDebuggerUrl'`
2. **Enable console capture**: Send `{"method": "Console.enable"}` first
3. **Screenshot**: Use `Page.captureScreenshot` method
4. **Timeout**: Always add a timeout to prevent hanging scripts

## Quick WebSocket Testing Patterns

The WebSocket approach via Chrome DevTools Protocol is the most efficient way to test the Sidecar UI programmatically. Here are streamlined patterns for common testing scenarios:

**1. Get Page ID and Check UI State (one-liner):**
```bash
PAGE_ID=$(curl -s http://127.0.0.1:9222/json | node -e "const d=require('fs').readFileSync(0,'utf8');const p=JSON.parse(d);console.log(p[0]?.id || 'NO_ID')")
echo "Page ID: $PAGE_ID"
```

**2. Inspect UI State:**
```bash
node -e "
const WebSocket = require('ws');
const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/$PAGE_ID');

ws.on('open', () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: \`
        (function() {
          const messages = document.querySelectorAll('.message');
          return {
            sseSubscribed: typeof sseSubscribed !== 'undefined' ? sseSubscribed : false,
            messagesCount: messages.length,
            messages: Array.from(messages).map(m => ({
              class: m.className,
              text: (m.textContent || '').slice(0, 200)
            }))
          };
        })()
      \`,
      returnByValue: true
    }
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id === 1) {
    console.log(JSON.stringify(msg.result?.result?.value, null, 2));
    ws.close();
    process.exit(0);
  }
});

setTimeout(() => { ws.close(); process.exit(0); }, 3000);
"
```

**3. Send a Message via UI:**
```bash
node -e "
const WebSocket = require('ws');
const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/$PAGE_ID');

ws.on('open', () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: \`
        (function() {
          const input = document.getElementById('message-input');
          input.value = 'What is 2+2? Just give me the number.';
          input.dispatchEvent(new Event('input'));
          document.getElementById('send-btn').click();
          return 'Message sent';
        })()
      \`,
      returnByValue: true
    }
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id === 1) {
    console.log(msg.result?.result?.value);
    ws.close();
    process.exit(0);
  }
});

setTimeout(() => { ws.close(); process.exit(0); }, 3000);
"
```

**4. Check for Errors:**
```bash
node -e "
const WebSocket = require('ws');
const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/$PAGE_ID');

ws.on('open', () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: \`({
        lastError: document.querySelector('.error-message')?.textContent,
        sessionId: typeof sessionId !== 'undefined' ? sessionId : 'undefined',
        isWaiting: typeof isWaitingForResponse !== 'undefined' ? isWaitingForResponse : 'undefined'
      })\`,
      returnByValue: true
    }
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.id === 1) {
    console.log(JSON.stringify(msg.result?.result?.value, null, 2));
    ws.close();
    process.exit(0);
  }
});

setTimeout(() => { ws.close(); process.exit(0); }, 3000);
"
```

**Why WebSocket Testing is Efficient:**
- **No file creation**: Tests run inline without creating temporary files
- **Direct DOM access**: Query and manipulate any UI element
- **Real-time state**: Access JavaScript variables like `sessionId`, `sseSubscribed`, `isWaitingForResponse`
- **Click simulation**: Trigger button clicks and input events programmatically
- **Fast iteration**: Quickly test changes without restarting the app

**Important Notes:**
- Run commands from the sidecar directory to access the `ws` module
- Page ID changes on each Electron launch - always fetch dynamically
- Add timeouts to prevent hanging on WebSocket errors
- Use `data.toString()` when parsing WebSocket messages in newer Node.js versions

## Integration with CI

For automated testing, launch the sidecar with a known task and verify UI state:

```bash
# Launch sidecar in background
node bin/sidecar.js start --model "openrouter/google/gemini-2.5-pro" \
  --briefing "Echo hello" &
SIDECAR_PID=$!

# Wait for window to open
sleep 5

# Get page ID and test UI
PAGE_ID=$(curl -s http://127.0.0.1:9222/json | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")

# Run UI verification script
node scripts/verify-ui-state.js "$PAGE_ID"

# Cleanup
kill $SIDECAR_PID
```

## Visual UI Testing with Screenshots (macOS)

**Launch and position Electron window:**
```bash
# Start sidecar in background
node bin/sidecar.js start --model "openrouter/google/gemini-3-flash-preview" --briefing "Test task" &
sleep 8

# Bring window to front and position it (window may open off-screen)
osascript << 'EOF'
tell application "System Events"
    tell process "Electron"
        set frontmost to true
        set position of window 1 to {100, 100}
    end tell
end tell
EOF
```

**Take screenshot:**
```bash
screencapture -x /tmp/sidecar-screenshot.png
```

**Dynamic page ID retrieval (required - ID changes each session):**
```bash
PAGE_ID=$(curl -s http://127.0.0.1:9222/json | node -e "const d=require('fs').readFileSync(0,'utf8');console.log(JSON.parse(d)[0].id)")
```

**Click UI elements and inspect state (run from sidecar directory for `ws` module):**
```bash
cd /Users/john_renaldi/claude-code-projects/sidecar
cat << EOF > test-ui.js
const WebSocket = require('ws');
const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/${PAGE_ID}');

ws.on('open', () => {
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      expression: \`
        (function() {
          // Click model selector
          document.getElementById('model-selector-display')?.click();

          // Or force dropdown visible
          document.getElementById('model-selector-dropdown')?.classList.add('visible');

          // Return state
          return Array.from(document.querySelectorAll('.model-option'))
            .map(opt => ({
              name: opt.querySelector('.model-name-display')?.textContent,
              selected: opt.classList.contains('selected')
            }));
        })()
      \`,
      returnByValue: true
    }
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.id === 1) {
    console.log(JSON.stringify(msg.result?.result?.value, null, 2));
    ws.close();
    process.exit(0);
  }
});

setTimeout(() => { ws.close(); process.exit(0); }, 3000);
EOF
node test-ui.js
```

**Common gotchas:**
- Window may open off-screen (negative Y coordinate) - use AppleScript to reposition
- Page ID changes on each Electron launch - always fetch dynamically
- Run Node.js scripts from sidecar directory to access `ws` module
- Add `setTimeout` to prevent hanging on WebSocket errors
