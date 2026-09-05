const path = require('path');
const fs = require('fs');
const ProtoServer = require('../protohub-cloud-server/server');

const server = new ProtoServer();

const workspaceDir = path.join(__dirname, '..', 'protohub-cloud-server', 'demo');
if (!fs.existsSync(workspaceDir)) {
  fs.mkdirSync(workspaceDir, { recursive: true });
}

server.setWorkspace(workspaceDir);

module.exports = server.app;
