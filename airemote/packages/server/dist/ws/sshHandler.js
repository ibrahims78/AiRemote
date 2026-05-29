"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSshWebSocket = handleSshWebSocket;
const ssh2_1 = require("ssh2");
const activeSessions = new Map();
function handleSshWebSocket(socket, _request) {
    let session = null;
    socket.on('message', (raw) => {
        try {
            const msg = JSON.parse(raw.toString());
            if (msg.type === 'ssh:connect') {
                const { host, port, username, password, privateKey } = msg.payload;
                const client = new ssh2_1.Client();
                client.on('ready', () => {
                    client.shell({ term: 'xterm-256color', rows: msg.payload.rows || 24, cols: msg.payload.cols || 80 }, (err, stream) => {
                        if (err) {
                            socket.send(JSON.stringify({ type: 'ssh:error', payload: { message: err.message } }));
                            return;
                        }
                        session = { client, stream };
                        activeSessions.set(socket, session);
                        socket.send(JSON.stringify({ type: 'ssh:connected', payload: { message: 'Connected' } }));
                        stream.on('data', (data) => {
                            if (socket.readyState === 1) {
                                socket.send(JSON.stringify({ type: 'ssh:data', payload: { data: data.toString('base64') } }));
                            }
                        });
                        stream.stderr.on('data', (data) => {
                            if (socket.readyState === 1) {
                                socket.send(JSON.stringify({ type: 'ssh:data', payload: { data: data.toString('base64') } }));
                            }
                        });
                        stream.on('close', () => {
                            socket.send(JSON.stringify({ type: 'ssh:closed', payload: {} }));
                            client.end();
                        });
                    });
                });
                client.on('error', (err) => {
                    socket.send(JSON.stringify({ type: 'ssh:error', payload: { message: err.message } }));
                });
                const connectConfig = {
                    host,
                    port: port || 22,
                    username,
                    readyTimeout: 15000
                };
                if (privateKey) {
                    connectConfig.privateKey = Buffer.from(privateKey, 'base64');
                }
                else if (password) {
                    connectConfig.password = password;
                }
                client.connect(connectConfig);
            }
            else if (msg.type === 'ssh:data') {
                const s = session || activeSessions.get(socket);
                if (s?.stream) {
                    s.stream.write(Buffer.from(msg.payload.data, 'base64'));
                }
            }
            else if (msg.type === 'ssh:resize') {
                const s = session || activeSessions.get(socket);
                if (s?.stream) {
                    s.stream.setWindow(msg.payload.rows, msg.payload.cols);
                }
            }
            else if (msg.type === 'ssh:disconnect') {
                cleanup(socket);
            }
        }
        catch (e) {
            console.error('SSH WS error:', e);
        }
    });
    socket.on('close', () => cleanup(socket));
    socket.on('error', () => cleanup(socket));
}
function cleanup(socket) {
    const s = activeSessions.get(socket);
    if (s) {
        try {
            s.stream?.end();
        }
        catch { }
        try {
            s.client.end();
        }
        catch { }
        activeSessions.delete(socket);
    }
}
//# sourceMappingURL=sshHandler.js.map