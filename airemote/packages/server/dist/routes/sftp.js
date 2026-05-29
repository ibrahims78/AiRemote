"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sftpRoutes = sftpRoutes;
const auth_1 = require("../middleware/auth");
const ssh2_1 = require("ssh2");
function buildSSHConfig(body) {
    const cfg = { host: body.host, port: body.port || 22, username: body.username, readyTimeout: 15000 };
    if (body.privateKey)
        cfg.privateKey = Buffer.from(body.privateKey, 'base64');
    else if (body.password)
        cfg.password = body.password;
    return cfg;
}
async function sftpRoutes(fastify) {
    fastify.addHook('preHandler', auth_1.requireAuth);
    // List directory
    fastify.post('/list', async (request, reply) => {
        const { path = '/' } = request.body;
        return new Promise((resolve, reject) => {
            const client = new ssh2_1.Client();
            const timeout = setTimeout(() => { client.end(); reject(reply.code(504).send({ error: 'Connection timeout' })); }, 15000);
            client.on('ready', () => {
                client.sftp((err, sftp) => {
                    if (err) {
                        clearTimeout(timeout);
                        client.end();
                        return reject(reply.code(500).send({ error: err.message }));
                    }
                    sftp.readdir(path, (err2, list) => {
                        clearTimeout(timeout);
                        client.end();
                        if (err2)
                            return reject(reply.code(500).send({ error: err2.message }));
                        const normalizedPath = path.endsWith('/') ? path : path + '/';
                        resolve(list.map(item => ({
                            name: item.filename,
                            path: normalizedPath === '/' ? '/' + item.filename : normalizedPath + item.filename,
                            isDirectory: item.attrs.isDirectory(),
                            size: item.attrs.size,
                            modified: new Date((item.attrs.mtime || 0) * 1000).toISOString(),
                            permissions: item.attrs.mode?.toString(8).slice(-3) || '---'
                        })));
                    });
                });
            });
            client.on('error', (err) => { clearTimeout(timeout); reject(reply.code(500).send({ error: err.message })); });
            client.connect(buildSSHConfig(request.body));
        });
    });
    // Download file
    fastify.post('/download', async (request, reply) => {
        const { path } = request.body;
        return new Promise((resolve, reject) => {
            const client = new ssh2_1.Client();
            client.on('ready', () => {
                client.sftp((err, sftp) => {
                    if (err) {
                        client.end();
                        return reject(reply.code(500).send({ error: err.message }));
                    }
                    const chunks = [];
                    const readStream = sftp.createReadStream(path);
                    readStream.on('data', (chunk) => chunks.push(chunk));
                    readStream.on('end', () => {
                        client.end();
                        const buf = Buffer.concat(chunks);
                        const name = path.split('/').pop() || 'file';
                        reply.header('Content-Disposition', `attachment; filename="${name}"`);
                        reply.header('Content-Type', 'application/octet-stream');
                        resolve(reply.send(buf));
                    });
                    readStream.on('error', (e) => {
                        client.end();
                        reject(reply.code(500).send({ error: e.message }));
                    });
                });
            });
            client.on('error', (err) => reject(reply.code(500).send({ error: err.message })));
            client.connect(buildSSHConfig(request.body));
        });
    });
    // Upload file
    fastify.post('/upload', async (request, reply) => {
        const data = await request.file();
        if (!data)
            return reply.code(400).send({ error: 'No file provided' });
        const fields = data.fields;
        const host = fields.host?.value;
        const port = parseInt(fields.port?.value || '22');
        const username = fields.username?.value;
        const password = fields.password?.value;
        const privateKey = fields.privateKey?.value;
        const remotePath = fields.path?.value || '/';
        if (!host || !username)
            return reply.code(400).send({ error: 'host and username required' });
        const fileBuffer = await data.toBuffer();
        const fileName = data.filename;
        const uploadPath = remotePath.endsWith('/') ? remotePath + fileName : remotePath + '/' + fileName;
        return new Promise((resolve, reject) => {
            const client = new ssh2_1.Client();
            const timeout = setTimeout(() => { client.end(); reject(reply.code(504).send({ error: 'Upload timeout' })); }, 30000);
            client.on('ready', () => {
                client.sftp((err, sftp) => {
                    if (err) {
                        clearTimeout(timeout);
                        client.end();
                        return reject(reply.code(500).send({ error: err.message }));
                    }
                    const writeStream = sftp.createWriteStream(uploadPath);
                    writeStream.on('close', () => {
                        clearTimeout(timeout);
                        client.end();
                        resolve(reply.send({ ok: true, path: uploadPath, size: fileBuffer.length }));
                    });
                    writeStream.on('error', (e) => {
                        clearTimeout(timeout);
                        client.end();
                        reject(reply.code(500).send({ error: e.message }));
                    });
                    writeStream.end(fileBuffer);
                });
            });
            client.on('error', (err) => { clearTimeout(timeout); reject(reply.code(500).send({ error: err.message })); });
            const cfg = { host, port, username, readyTimeout: 15000 };
            if (privateKey)
                cfg.privateKey = Buffer.from(privateKey, 'base64');
            else if (password)
                cfg.password = password;
            client.connect(cfg);
        });
    });
    // Delete file or directory
    fastify.post('/delete', async (request, reply) => {
        const { path, isDirectory = false } = request.body;
        return new Promise((resolve, reject) => {
            const client = new ssh2_1.Client();
            const timeout = setTimeout(() => { client.end(); reject(reply.code(504).send({ error: 'Connection timeout' })); }, 15000);
            client.on('ready', () => {
                client.sftp((err, sftp) => {
                    if (err) {
                        clearTimeout(timeout);
                        client.end();
                        return reject(reply.code(500).send({ error: err.message }));
                    }
                    const done = (e) => {
                        clearTimeout(timeout);
                        client.end();
                        if (e)
                            return reject(reply.code(500).send({ error: e.message }));
                        resolve(reply.send({ ok: true }));
                    };
                    if (isDirectory)
                        sftp.rmdir(path, done);
                    else
                        sftp.unlink(path, done);
                });
            });
            client.on('error', (err) => { clearTimeout(timeout); reject(reply.code(500).send({ error: err.message })); });
            client.connect(buildSSHConfig(request.body));
        });
    });
    // Rename / move file
    fastify.post('/rename', async (request, reply) => {
        const { oldPath, newPath } = request.body;
        return new Promise((resolve, reject) => {
            const client = new ssh2_1.Client();
            const timeout = setTimeout(() => { client.end(); reject(reply.code(504).send({ error: 'Connection timeout' })); }, 15000);
            client.on('ready', () => {
                client.sftp((err, sftp) => {
                    if (err) {
                        clearTimeout(timeout);
                        client.end();
                        return reject(reply.code(500).send({ error: err.message }));
                    }
                    sftp.rename(oldPath, newPath, (e) => {
                        clearTimeout(timeout);
                        client.end();
                        if (e)
                            return reject(reply.code(500).send({ error: e.message }));
                        resolve(reply.send({ ok: true }));
                    });
                });
            });
            client.on('error', (err) => { clearTimeout(timeout); reject(reply.code(500).send({ error: err.message })); });
            client.connect(buildSSHConfig(request.body));
        });
    });
    // Create directory
    fastify.post('/mkdir', async (request, reply) => {
        const { path } = request.body;
        return new Promise((resolve, reject) => {
            const client = new ssh2_1.Client();
            const timeout = setTimeout(() => { client.end(); reject(reply.code(504).send({ error: 'Connection timeout' })); }, 15000);
            client.on('ready', () => {
                client.sftp((err, sftp) => {
                    if (err) {
                        clearTimeout(timeout);
                        client.end();
                        return reject(reply.code(500).send({ error: err.message }));
                    }
                    sftp.mkdir(path, (e) => {
                        clearTimeout(timeout);
                        client.end();
                        if (e)
                            return reject(reply.code(500).send({ error: e.message }));
                        resolve(reply.send({ ok: true }));
                    });
                });
            });
            client.on('error', (err) => { clearTimeout(timeout); reject(reply.code(500).send({ error: err.message })); });
            client.connect(buildSSHConfig(request.body));
        });
    });
}
//# sourceMappingURL=sftp.js.map