#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

const frontendDir = path.resolve(__dirname, 'Users', 'Usuario', 'Lexio', 'frontend');
const tscPath = path.join(frontendDir, 'node_modules', '.bin', 'tsc');

const child = spawn('node', [tscPath, '--noEmit'], {
  cwd: 'c:\\Users\\Usuario\\Lexio\\frontend',
  stdio: 'inherit',
  shell: true
});

child.on('error', (err) => {
  console.error('Error running tsc:', err);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code);
});
