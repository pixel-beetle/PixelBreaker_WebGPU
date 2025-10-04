import { VideoApp as App } from './VideoApp';

console.log(`main.ts starting ${App.name}`);
window.addEventListener('DOMContentLoaded', async () => {
    let canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
    if (canvas) {
        let app = new App(canvas);
        await app.run();
    }
});