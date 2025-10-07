import * as BABYLON from 'babylonjs';
import { SceneManager } from './scripts/Core/SceneManager';
import { VideoManager } from './scripts/Core/VideoManager';
import { ReflectionUIManager } from './scripts/GUI/ReflectionUIManager';
import JumpFloodingSDFGenerator from './scripts/Core/JumpFloodingSDFGenerator';
import { PixelBreakerManager } from './scripts/Core/PixelBreakerManager';
import { UIBinding } from './scripts/GUI/UIProperty';


const kRenderTargetWidthOptions = 
{
    '480': 480,
    '720': 720,
    '1080': 1080,
    '1440': 1440,
    '1920': 1920,
    '2160': 2160,
    '2880': 2880,
    '3840': 3840,
}

const kRenderTargetHeightOptions = 
{
    '480': 480,
    '720': 720,
    '1080': 1080,
    '1440': 1440,
    '1920': 1920,
    '2160': 2160,
}


export class Application 
{
    @UIBinding({category: "Application", bindingParams: { label: "Resolution X", min: 1, max: 3840, step:1, format: (value: number) => { return value.toFixed(); }, options: kRenderTargetWidthOptions } })
    private renderTargetWidth: number = 1920;
    @UIBinding({category: "Application", bindingParams: { label: "Resolution Y", min: 1, max: 2160, step:1, format: (value: number) => { return value.toFixed(); }, options: kRenderTargetHeightOptions } })
    private renderTargetHeight: number = 1080;
    
    private engine: BABYLON.Engine;
    private sceneManager!: SceneManager;
    private videoManager!: VideoManager;
    private reflectionUIManager!: ReflectionUIManager;
    private jumpFloodingSDFGenerator!: JumpFloodingSDFGenerator;
    private pixelBreakerManager!: PixelBreakerManager;

    private _isPaused: boolean = false;

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


        this.sceneManager = new SceneManager(this.engine, this.canvas, this.renderTargetWidth / this.renderTargetHeight);
        this.videoManager = new VideoManager(this.sceneManager.scene, './BadApple_Video.mp4');
        this.jumpFloodingSDFGenerator = new JumpFloodingSDFGenerator();
        this.pixelBreakerManager = new PixelBreakerManager();

        this.RegisterUITargets();
    }

    private RegisterUITargets(): void
    {
        this.reflectionUIManager.RegisterTarget('Application', this, (property: string, value: any) => {
            switch (property) {
                case 'renderTargetWidth':
                    this.renderTargetWidth = value;
                    break;
                case 'renderTargetHeight':
                    this.renderTargetHeight = value;
                    break;
            }
        });

        (this.reflectionUIManager.uiBuilder.folders.get('Application')!.addBlade({
            view: 'buttongrid',
            size: [2, 1],
            cells: (x: number, y: number) => ({
              title: [
                ['Play/Pause', 'Reset'],
              ][y][x],
            }),
          }) as any)
          .on('click', (ev: any) => {
                if (ev.index[0] === 0)
                {
                    this._isPaused = !this._isPaused;
                    this.videoManager.TogglePlayPause();
                }
                else if (ev.index[0] === 1)
                {
                    this._isPaused = false;
                    this.videoManager.Restart();
                    this.pixelBreakerManager.Reset();
                }
          });

        this.reflectionUIManager.RegisterTarget('video', this.videoManager, (property: string, value: any) => {
            this.videoManager.handlePropertyChange(property, value);
        });
        this.reflectionUIManager.RegisterTarget('particleCount', this.pixelBreakerManager.particleCountReadback, (property: string, value: any) => {
            
        });
        this.reflectionUIManager.RegisterTarget('pixelBreaker', this.pixelBreakerManager.params, (property: string, value: any) => {
            this.pixelBreakerManager.params.HandlePropertyChange(property, value);
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

            if (!this._isPaused)
            {
                this.jumpFloodingSDFGenerator.Tick(
                    this.sceneManager.scene, 
                    this.engine, 
                    this.videoManager!.videoTexture!);
                
                this.pixelBreakerManager.Tick(
                        this.sceneManager.scene, 
                        this.engine, 
                        {width: this.renderTargetWidth, height: this.renderTargetHeight},
                        this.jumpFloodingSDFGenerator.resultTexture!);
            }

            this.sceneManager.render(this.pixelBreakerManager.renderMaterial!);
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
