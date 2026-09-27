const fs = require('fs');
fs.cpSync('src/db', 'dist/db', { recursive: true });
console.log('[postbuild] copied src/db -> dist/db');
