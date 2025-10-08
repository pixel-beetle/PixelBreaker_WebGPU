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

const kTabPagePath_General = "#RootTab/%General";
const kTabPagePath_Board = "#RootTab/%Board";
const kTabPagePath_Particles = "#RootTab/%Particles";
const kFolderPath_Debug = kTabPagePath_General + "/@Debug";
const kFolderPath_Application = kTabPagePath_General + "/@Application";


class KeyControlInfo
{
    @UIBinding({ category: "Key Control", bindingParams: { label: "Play/Pause", readonly: true } })
    public applicationPlayPauseKey: string = 'Space';
    @UIBinding({ category: "Key Control", bindingParams: { label: "Video Play/Pause", readonly: true } })
    public videoPlayPauseKey: string = 'V';
    @UIBinding({ category: "Key Control", bindingParams: { label: "Restart Simulation", readonly: true } })
    public restartSimulationKey: string = 'R';
    @UIBinding({ category: "Key Control", bindingParams: { label: "Toggle Inspector", readonly: true } })
    public inspectorToggleKey: string = 'P';
    @UIBinding({ category: "Key Control", bindingParams: { label: "Reflection Board Move Left", readonly: true } })
    public reflectionBoardMoveLeft: string = 'A';
    @UIBinding({ category: "Key Control", bindingParams: { label: "Reflection Board Move Right", readonly: true } })
    public reflectionBoardMoveRight: string = 'D';
}

export class Application 
{
    @UIBinding({ category: "Application", bindingParams: { label: "Render Target Resolution", options: kRenderTargetResolutionOptionsList } })
    private _renderTargetResolutionOption: string = '1080p';

    private _renderTargetWidth: number = kRenderTargetResolutionOptions[this._renderTargetResolutionOption][0];
    private _renderTargetHeight: number = kRenderTargetResolutionOptions[this._renderTargetResolutionOption][1];
    
    private _engine: BABYLON.Engine;
    private _sceneManager!: SceneManager;
    private _videoManager!: VideoManager;
    private _inspector!: ReflectedInspector;
    private _jumpFloodingSDFGenerator!: JumpFloodingSDFGenerator;
    private _pixelBreakerManager!: PixelBreakerManager;

    private _isFirstInteractionGot: boolean = false;
    private _isPaused: boolean = true;
    private _fpsGraph: any = null;
    private _playStateText : any = null;
    private _keyControlInfo: KeyControlInfo = new KeyControlInfo();

    private _posterElement: HTMLElement | null = null;

    constructor(readonly canvas: HTMLCanvasElement) {
        this._engine = new BABYLON.WebGPUEngine(canvas) as any;
        window.addEventListener('resize', () => {
            this._engine.resize();
        });
    }

    private InitializeManagers(): void 
    {
        this._inspector = new ReflectedInspector({
            title: 'Control Panel',
            position: 'center',
            expanded: true,
            autoRefresh: true,
            refreshInterval: 100
        });


        this._sceneManager = new SceneManager(this._engine, this.canvas, this._renderTargetWidth / this._renderTargetHeight);
        this._videoManager = new VideoManager(this._sceneManager.scene);
        this._jumpFloodingSDFGenerator = new JumpFloodingSDFGenerator();
        this._pixelBreakerManager = new PixelBreakerManager();

        this.RegisterUITargets();

        this._videoManager.SetupVideo('./BadApple_Video.mp4');
        const videoParentNode = this._inspector.tree?.GetTabPage(kTabPagePath_General)!;
        videoParentNode.element.appendChild(this._videoManager.videoElement!);
    }

    private RegisterUITargets(): void
    {
        this._inspector.BeginContainerPathScope(kTabPagePath_General);
        this._inspector.RegisterTarget(this._keyControlInfo, (property: string, value: any) => {

        });
        this._inspector.RegisterTarget(this, (property: string, value: any) => {
            switch (property) {
                case 'renderTargetResolutionOption':
                    this._renderTargetWidth = kRenderTargetResolutionOptions[value][0];
                    this._renderTargetHeight = kRenderTargetResolutionOptions[value][1];
                    break;
            }
        });
        this._inspector.RegisterTarget(this._jumpFloodingSDFGenerator.params, (property: string, value: any) => {
            switch (property) {
                case 'inputValueThreshold':
                    this._jumpFloodingSDFGenerator.params.inputValueThreshold = value;
                    break;
                case 'inputInvert':
                    this._jumpFloodingSDFGenerator.params.inputInvert = value;
            }
        });
        this._inspector.EndContainerPathScope();

        this._inspector.BeginContainerPathScope(kTabPagePath_Particles);
        this._inspector.RegisterTarget(this._pixelBreakerManager.params, (property: string, value: any) => {
            this._pixelBreakerManager.params.HandlePropertyChange(property, value, this._pixelBreakerManager);
        });
        this._inspector.EndContainerPathScope();

        this._inspector.BeginContainerPathScope(kTabPagePath_Board);
        this._inspector.RegisterTarget(this._pixelBreakerManager.boardParams, (property: string, value: any) => {
            this._pixelBreakerManager.boardParams.HandlePropertyChange(property, value, this._pixelBreakerManager);
        });
        this._inspector.EndContainerPathScope();

        this._inspector.BeginContainerPathScope(kFolderPath_Debug);
        this._inspector.RegisterTarget(this._pixelBreakerManager.particleCountReadback, (property: string, value: any) => {
            
        });
        this._inspector.EndContainerPathScope();

        this._inspector.BuildUIComponents();

        const applicationFolder = this._inspector.tree!.GetFolder(kFolderPath_Application)!;
        const playPauseButtonGrid : any = applicationFolder.addBlade({
            view: 'buttongrid',
            size: [2, 1],
            cells: (x: number, y: number) => ({
              title: [
                ['Play/Pause', 'Restart'],
              ][y][x],
            }),
          });
          playPauseButtonGrid.on('click', (ev: any) => {
                if (ev.index[0] === 0)
                {
                    this.ToggleApplicationPause();
                }
                else if (ev.index[0] === 1)
                {
                    this.Restart();
                }
          });

        this._playStateText = applicationFolder.addBlade({
            view: 'text',
            parse: (v: any) => String(v),
            value: 'Play State',
          });

        this._fpsGraph = (this._inspector.tree!.GetFolder(kFolderPath_Debug))!.addBlade({
            view: 'fpsgraph',
            label: 'FPS',
        });
    }

    private ToggleApplicationPause(): void
    {
        this._isPaused = !this._isPaused;
        if (this._isPaused === this._videoManager.IsPaused())
            return;
        this._videoManager.TogglePlayPause();
    }

    private ToggleVideoPlayPause(): void
    {
        if (this._isPaused)
            return;
        this._videoManager.TogglePlayPause();
    }

    private Restart(): void
    {
        this._isPaused = false;
        this._videoManager.Restart();
        this._pixelBreakerManager.Reset();
    }

    private SetUpBabylonDebugLayer(debugOn: boolean = true): void 
    {
        if (debugOn) {
            this._sceneManager.scene.debugLayer.show({ overlay: true });
        } else {
            this._sceneManager.scene.debugLayer.hide();
        }
    }

    private SetUpInputActions(): void
    {
        this._sceneManager.scene.actionManager = new BABYLON.ActionManager(this._sceneManager.scene);
        // keyword P to toggle inspector
        this._sceneManager.scene.actionManager.registerAction(
            new BABYLON.ExecuteCodeAction(
                {
                  trigger: BABYLON.ActionManager.OnKeyDownTrigger,
                  parameter: "p",
                },
                () => { this._inspector.Toggle(); }
              )
        );

        // keyboard space to toggle application pause
        this._sceneManager.scene.actionManager.registerAction(
            new BABYLON.ExecuteCodeAction(
                {
                  trigger: BABYLON.ActionManager.OnKeyDownTrigger,
                  parameter: " ",
                },
                () => { 
                    this.ToggleApplicationPause(); 
                    this._isFirstInteractionGot = true;
                }
              )
        );

        // keyboard v to toggle video play pause
        this._sceneManager.scene.actionManager.registerAction(
            new BABYLON.ExecuteCodeAction(
                {
                  trigger: BABYLON.ActionManager.OnKeyDownTrigger,
                  parameter: "v",
                },
                () => { this.ToggleVideoPlayPause(); }
              )
        );

        // keyboard r to restart application
        this._sceneManager.scene.actionManager.registerAction(
            new BABYLON.ExecuteCodeAction(
                {
                  trigger: BABYLON.ActionManager.OnKeyDownTrigger,
                  parameter: "r",
                },
                () => { this.Restart(); }
              )
        );

        // keyboard a to move reflection board left
        this._sceneManager.scene.actionManager.registerAction(
            new BABYLON.ExecuteCodeAction(
                {
                  trigger: BABYLON.ActionManager.OnKeyDownTrigger,
                  parameter: "a",
                },
                () => { this._pixelBreakerManager.boardParams.OnGetInput(-1); }
              )
        );

        // keyboard d to move reflection board right
        this._sceneManager.scene.actionManager.registerAction(
            new BABYLON.ExecuteCodeAction(
                {
                  trigger: BABYLON.ActionManager.OnKeyDownTrigger,
                  parameter: "d",
                },
                () => { this._pixelBreakerManager.boardParams.OnGetInput(1); }
              )
        );
    }

    private CreatePosterElement(): HTMLElement
    {
        const posterElement = document.createElement('div');
        posterElement.style.position = 'absolute';
        posterElement.style.top = '0';
        posterElement.style.left = '0';
        posterElement.style.width = '100%';
        posterElement.style.height = '100%';
        posterElement.style.backgroundColor = 'black';
        posterElement.style.display = 'flex';
        posterElement.style.justifyContent = 'center';
        posterElement.style.alignItems = 'center';
        posterElement.style.color = 'white';
        posterElement.style.fontSize = '96px';
        posterElement.style.fontWeight = 'bold';
        posterElement.style.zIndex = '1000';
        return posterElement;
    }

    async Run(): Promise<void> 
    {
        const webGPUSupport = await BABYLON.WebGPUEngine.IsSupportedAsync;
        if (!webGPUSupport)
        {
            this._posterElement = this.CreatePosterElement();
            this._posterElement.innerHTML = "WebGPU not supported";
            document.body.appendChild(this._posterElement);
            console.error("WebGPU is not supported, please use a browser that supports WebGPU, try Chrome or Edge.");
            return;
        }
        else
        {
            // ask for first interaction
            this._posterElement = this.CreatePosterElement();
            this._posterElement.innerHTML = "Click to start";
            document.body.appendChild(this._posterElement);
            this._posterElement.addEventListener('click', () => {
                this._posterElement!.remove();
                this._posterElement = null;
                this._isFirstInteractionGot = true;
                this.ToggleApplicationPause();
            });
        }

        if ((this._engine as any).initAsync) {
            await (this._engine as any).initAsync();
        }
        this.InitializeManagers();
        
        this.SetUpBabylonDebugLayer(false);

        this.SetUpInputActions();
        
        this._engine.runRenderLoop(() => {
            if (this._isPaused)
            {
                this._videoManager.videoElement!.pause();
            }

            if (!this._isFirstInteractionGot)
            {
                return;
            }

            this._fpsGraph!.begin();
            this._videoManager!.videoTexture!.update();

            if (!this._isPaused)
            {
                this._jumpFloodingSDFGenerator.Tick(
                    this._sceneManager.scene, 
                    this._engine, 
                    this._videoManager!.videoTexture!);
                
                this._pixelBreakerManager.Tick(
                        this._sceneManager.scene, 
                        this._engine, 
                        {width: this._renderTargetWidth, height: this._renderTargetHeight},
                        this._jumpFloodingSDFGenerator.resultTexture!);
            }

            this._sceneManager.render(this._pixelBreakerManager.renderMaterial!);
            this._fpsGraph!.end();

            this._playStateText.value = this._isPaused ? 'Application is Paused' : 'Application is Playing';
        });
    }

    dispose(): void 
    {
        this._inspector.dispose();
        this._videoManager.dispose();
        this._sceneManager.dispose();
        this._engine.dispose();
        this._jumpFloodingSDFGenerator.Release();
        this._pixelBreakerManager.Release();

        if (this._posterElement)
        {
            this._posterElement.remove();
            this._posterElement = null;
        }
    }

}
