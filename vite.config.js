import { defineConfig } from 'vite';

export default defineConfig(({ command, mode }) => {
    return {
        resolve: {
            alias: {
                'babylonjs': mode === 'development' ? 'babylonjs/babylon.max' : 'babylonjs'
            }
        },
        plugins: [
            {
                name: 'wgsl-loader',
                load(id) {
                    if (id.endsWith('.wgsl')) {
                        const fs = require('fs');
                        const path = require('path');
                        const filePath = path.resolve(id);
                        const content = fs.readFileSync(filePath, 'utf-8');
                        return `export default ${JSON.stringify(content)}`;
                    }
                }
            }
        ]
    };
});
