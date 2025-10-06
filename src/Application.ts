import * as BABYLON from 'babylonjs';
import { SceneManager } from './scripts/Core/SceneManager';
import { VideoManager } from './scripts/Core/VideoManager';
import { ReflectionUIManager } from './scripts/GUI/ReflectionUIManager';
import JumpFloodingSDFGenerator from './scripts/Core/JumpFloodingSDFGenerator';
import { PixelBreakerManager } from './scripts/Core/PixelBreakerManager';

export class Application 
{
    private engine: BABYLON.Engine;
    private sceneManager!: SceneManager;
    private videoManager!: VideoManager;
    private reflectionUIManager!: ReflectionUIManager;
    private jumpFloodingSDFGenerator!: JumpFloodingSDFGenerator;
    private pixelBreakerManager!: PixelBreakerManager;

    constructor(readonly canvas: HTMLCanvasElement) {
        this.engine = new BABYLON.WebGPUEngine(canvas) as any;
        window.addEventListener('resize', () => {
            this.engine.resize();
        });
    }

    private InitializeManagers(): void 
    {
        this.reflectionUIManager = new ReflectionUIManager({
            title: 'Control Panel',
            position: 'center',
            expanded: true,
            autoRefresh: true,
            refreshInterval: 100
        });

        this.sceneManager = new SceneManager(this.engine, this.canvas);
        this.videoManager = new VideoManager(this.sceneManager.scene, './BadApple_Video.mp4');
        this.jumpFloodingSDFGenerator = new JumpFloodingSDFGenerator();
        this.pixelBreakerManager = new PixelBreakerManager();

        this.reflectionUIManager.RegisterTarget('video', this.videoManager, (property: string, value: any) => {
            this.videoManager.handlePropertyChange(property, value);
        });
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
        if ((this.engine as any).initAsync) {
            await (this.engine as any).initAsync();
        }
        this.InitializeManagers();
        
        this.SetUpBabylonDebugLayer(false);
        
        this.engine.runRenderLoop(() => {
            this.videoManager!.videoTexture!.update();
            const isVideoPlaying = !this.videoManager!.videoTexture!.video.paused;
            if (isVideoPlaying)
            {
                this.jumpFloodingSDFGenerator.Tick(
                    this.sceneManager.scene, 
                    this.engine, 
                    this.videoManager!.videoTexture!);
                this.pixelBreakerManager.Tick(
                    this.sceneManager.scene, 
                    this.engine, 
                    {width: 1920, height: 1080},
                    this.jumpFloodingSDFGenerator.resultTexture!);
            }
            
            this.sceneManager.render(this.jumpFloodingSDFGenerator.resultTexture!);
        });
    }

    // 清理资源
    dispose(): void 
    {
        this.reflectionUIManager.dispose();
        this.videoManager.dispose();
        this.sceneManager.dispose();
        this.engine.dispose();
        this.jumpFloodingSDFGenerator.Release();
    }

}
