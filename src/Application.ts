import * as BABYLON from 'babylonjs';
import { SceneManager } from './scripts/Core/SceneManager';
import { VideoManager } from './scripts/Core/VideoManager';
import { ReflectedInspector } from './scripts/GUI/ReflectedInspector';
import JumpFloodingSDFGenerator from './scripts/Core/JumpFloodingSDFGenerator';
import { PixelBreakerManager } from './scripts/Core/PixelBreakerManager';
import { UIBinding } from './scripts/GUI/UIProperty';

const kRenderTargetResolutionOptionsList = 
{
    '360p' : '360p',
    '480p' : '480p',
    '720p' : '720p',
    '1080p' : '1080p',
    '2K' : '2K',
    '4K' : '4K'
};

const kRenderTargetResolutionOptions: Record<string, number[]> = 
{
    '360p': [540, 360],
    '480p': [720, 480],
    '720p': [1080, 720],
    '1080p': [1920, 1080],
    '2K': [2560, 1440],
    '4K': [3840, 2160],
};

export class Application 
{
    @UIBinding({category: "Application", bindingParams: { label: "Render Target Resolution", options: kRenderTargetResolutionOptionsList } })
    private renderTargetResolutionOption: string = '1080p';

    private renderTargetWidth: number = kRenderTargetResolutionOptions[this.renderTargetResolutionOption][0];
    private renderTargetHeight: number = kRenderTargetResolutionOptions[this.renderTargetResolutionOption][1];
    
    private engine: BABYLON.Engine;
    private sceneManager!: SceneManager;
    private videoManager!: VideoManager;
    private inspector!: ReflectedInspector;
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
        this.inspector = new ReflectedInspector({
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
        this.inspector.RegisterTarget(this, (property: string, value: any) => {
            switch (property) {
                case 'renderTargetResolutionOption':
                    this.renderTargetWidth = kRenderTargetResolutionOptions[value][0];
                    this.renderTargetHeight = kRenderTargetResolutionOptions[value][1];
                    break;
            }
        });

        this.inspector.RegisterTarget(this.videoManager, (property: string, value: any) => {
            this.videoManager.handlePropertyChange(property, value);
        });

        this.inspector.RegisterTarget(this.jumpFloodingSDFGenerator.params, (property: string, value: any) => {
            switch (property) {
                case 'inputValueThreshold':
                    this.jumpFloodingSDFGenerator.params.inputValueThreshold = value;
                    break;
                case 'inputInvert':
                    this.jumpFloodingSDFGenerator.params.inputInvert = value;
            }
        
        });

        this.inspector.RegisterTarget(this.pixelBreakerManager.particleCountReadback, (property: string, value: any) => {
            
        });

        this.inspector.RegisterTarget(this.pixelBreakerManager.params, (property: string, value: any) => {
            this.pixelBreakerManager.params.HandlePropertyChange(property, value, this.pixelBreakerManager);
        });
    
        this.inspector.BuildUIComponents();

        (this.inspector.tree!.GetFolder('@Application')!.addBlade({
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
        this.inspector.dispose();
        this.videoManager.dispose();
        this.sceneManager.dispose();
        this.engine.dispose();
        this.jumpFloodingSDFGenerator.Release();
    }

}
