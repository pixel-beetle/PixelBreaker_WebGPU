import * as BABYLON from 'babylonjs';


export class SceneManager 
{
    public scene: BABYLON.Scene;
    public camera: BABYLON.FreeCamera;
    public plane: BABYLON.Mesh;

    constructor(private engine: BABYLON.Engine, private canvas: HTMLCanvasElement,
        private aspectRatio: number) 
    {
        this.scene = this.createScene();
        this.camera = this.createCamera();
        this.plane = this.createPlane();
    }

    private createScene(): BABYLON.Scene 
    {
        const scene = new BABYLON.Scene(this.engine);
        scene.clearColor = new BABYLON.Color4(0, 0, 0, 1);
        return scene;
    }

    private createCamera(): BABYLON.FreeCamera 
    {
        const camera = new BABYLON.FreeCamera("camera", new BABYLON.Vector3(0, 0, -8), this.scene);
        camera.mode = BABYLON.Camera.ORTHOGRAPHIC_CAMERA;
        camera.orthoTop = 0.5;
        camera.orthoBottom = -0.5;
        camera.orthoLeft = -0.5 * this.aspectRatio;
        camera.orthoRight = 0.5 * this.aspectRatio;
        camera.setTarget(BABYLON.Vector3.Zero());
        camera.detachControl();
        return camera;
    }

    private createPlane(): BABYLON.Mesh 
    {
        const plane = BABYLON.MeshBuilder.CreatePlane("RenderPlane", {
            width: 1 * this.aspectRatio,
            height: 1
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


    public render(renderMaterial: BABYLON.ShaderMaterial): void 
    {
        this.plane.material = renderMaterial;
        this.scene.render();
    }

    public dispose(): void 
    {
        this.scene.dispose();
    }
}
