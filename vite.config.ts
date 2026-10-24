import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
export default defineConfig({plugins:[react()],resolve:{alias:{'@':fileURLToPath(new URL('.',import.meta.url))}},server:{allowedHosts:['terminal.local'],host:'0.0.0.0',port:5173,proxy:{'/api':{target:'http://127.0.0.1:3000',changeOrigin:false}}},build:{sourcemap:false}});
