import * as BABYLON from 'babylonjs';

export class SceneManager {
    public scene: BABYLON.Scene;
    public camera: BABYLON.FreeCamera;
    public plane: BABYLON.Mesh;

    constructor(private engine: BABYLON.Engine, private canvas: HTMLCanvasElement) {
        this.scene = this.createScene();
        this.camera = this.createCamera();
        this.plane = this.createPlane();
    }

    private createScene(): BABYLON.Scene {
        const scene = new BABYLON.Scene(this.engine);
        scene.clearColor = new BABYLON.Color4(0, 0, 0, 1);
        return scene;
    }

    private createCamera(): BABYLON.FreeCamera {
        const camera = new BABYLON.FreeCamera("camera", new BABYLON.Vector3(0, 0, -5), this.scene);
        camera.setTarget(BABYLON.Vector3.Zero());
        // 禁用鼠标控制
        camera.detachControl();
        return camera;
    }

    private createPlane(): BABYLON.Mesh {
        const plane = BABYLON.MeshBuilder.CreatePlane("videoPlane", {
            width: 10,
            height: 10 * (9/16) // 16:9 宽高比
        }, this.scene);
        
        // 调整平面位置使其填满屏幕
        plane.position.z = 0;
        plane.position.y = 0;
        plane.position.x = 0;
        
        // 确保平面面向相机
        plane.rotation.x = 0;
        plane.rotation.y = 0;
        plane.rotation.z = 0;
        
        return plane;
    }

    public render(): void {
        this.scene.render();
    }

    public dispose(): void {
        this.scene.dispose();
    }
}
