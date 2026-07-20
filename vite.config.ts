import { defineConfig } from 'vite';

// base: './' にしておくと、どこに置いても(Cloudflare Pages等)相対パスで動く
export default defineConfig({
  base: './',
  build: {
    target: 'es2018',
  },
});
