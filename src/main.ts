import 'reflect-metadata';
import { Application as App } from './Application';

console.log(`main.ts starting ${App.name}`);
window.addEventListener('DOMContentLoaded', async () => {
    let canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
    if (canvas) {
        let app = new App(canvas);
        await app.Run();
    }
});