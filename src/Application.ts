import * as BABYLON from 'babylonjs';
import { SceneManager } from './scripts/Core/SceneManager';
import { VideoManager } from './scripts/Core/VideoManager';
import { UIManager } from './scripts/GUI/UIManager';
import JumpFloodingSDFGenerator from './scripts/Core/JumpFloodingSDFGenerator';

export class Application 
{
    private engine: BABYLON.Engine;
    private sceneManager!: SceneManager;
    private videoManager!: VideoManager;
    private uiManager!: UIManager;
    private jumpFloodingSDFGenerator!: JumpFloodingSDFGenerator;

    constructor(readonly canvas: HTMLCanvasElement) {
        this.engine = new BABYLON.WebGPUEngine(canvas) as any;
        window.addEventListener('resize', () => {
            this.engine.resize();
        });
    }

    private InitializeManagers(): void {
        this.sceneManager = new SceneManager(this.engine, this.canvas);
        this.videoManager = new VideoManager(this.sceneManager.scene);
        this.uiManager = new UIManager(
            () => this.videoManager.togglePlayPause(),
            (volume) => this.videoManager.setVolume(volume),
            () => this.videoManager.toggleMute()
        );

        this.jumpFloodingSDFGenerator = new JumpFloodingSDFGenerator();
    }

    SetUpBabylonDebugLayer(debugOn: boolean = true): void 
    {
        if (debugOn) {
            this.sceneManager.scene.debugLayer.show({ overlay: true });
        } else {
            this.sceneManager.scene.debugLayer.hide();
        }
    }

    async Run(): Promise<void> 
    {
        // 异步初始化 WebGPU 引擎
        if ((this.engine as any).initAsync) {
            await (this.engine as any).initAsync();
        }
        this.InitializeManagers();
        
        this.SetUpBabylonDebugLayer(false);
        
        this.engine.runRenderLoop(() => {
            this.videoManager.videoTexture.update();

            this.jumpFloodingSDFGenerator.Tick(
                this.sceneManager.scene, 
                this.engine, 
                this.videoManager.videoTexture);
            
            this.sceneManager.render(this.jumpFloodingSDFGenerator.tempBuffer?.Current()!);
        });
    }

    // 清理资源
    dispose(): void 
    {
        this.uiManager.dispose();
        this.videoManager.dispose();
        this.sceneManager.dispose();
        this.engine.dispose();
        this.jumpFloodingSDFGenerator.Release();
    }

}
