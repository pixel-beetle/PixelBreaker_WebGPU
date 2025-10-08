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
    private renderTargetResolutionOption: string = '1080p';

    private renderTargetWidth: number = kRenderTargetResolutionOptions[this.renderTargetResolutionOption][0];
    private renderTargetHeight: number = kRenderTargetResolutionOptions[this.renderTargetResolutionOption][1];
    
    private engine: BABYLON.Engine;
    private sceneManager!: SceneManager;
    private videoManager!: VideoManager;
    private inspector!: ReflectedInspector;
    private jumpFloodingSDFGenerator!: JumpFloodingSDFGenerator;
    private pixelBreakerManager!: PixelBreakerManager;

    private _isPaused: boolean = true;
    private fpsGraph: any = null;
    private playStateText : any = null;
    private keyControlInfo: KeyControlInfo = new KeyControlInfo();

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
        this.videoManager = new VideoManager(this.sceneManager.scene);
        this.jumpFloodingSDFGenerator = new JumpFloodingSDFGenerator();
        this.pixelBreakerManager = new PixelBreakerManager();

        this.RegisterUITargets();

        this.videoManager.SetupVideo('./BadApple_Video.mp4');
        const videoParentNode = this.inspector.tree?.GetTabPage(kTabPagePath_General)!;
        videoParentNode.element.appendChild(this.videoManager.videoElement!);
    }

    private RegisterUITargets(): void
    {
        this.inspector.BeginContainerPathScope(kTabPagePath_General);
        this.inspector.RegisterTarget(this.keyControlInfo, (property: string, value: any) => {

        });
        this.inspector.RegisterTarget(this, (property: string, value: any) => {
            switch (property) {
                case 'renderTargetResolutionOption':
                    this.renderTargetWidth = kRenderTargetResolutionOptions[value][0];
                    this.renderTargetHeight = kRenderTargetResolutionOptions[value][1];
                    break;
            }
        });
        this.inspector.RegisterTarget(this.videoManager, (property: string, value: any) => {
            switch (property) {
                case 'playPause':
                    this.ToggleVideoPlayPause();
                    break;
                case 'volume':
                    this.videoManager.SetAudioVolume(value);
                    break;
            }
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
        this.inspector.EndContainerPathScope();

        this.inspector.BeginContainerPathScope(kTabPagePath_Particles);
        this.inspector.RegisterTarget(this.pixelBreakerManager.params, (property: string, value: any) => {
            this.pixelBreakerManager.params.HandlePropertyChange(property, value, this.pixelBreakerManager);
        });
        this.inspector.EndContainerPathScope();

        this.inspector.BeginContainerPathScope(kTabPagePath_Board);
        this.inspector.RegisterTarget(this.pixelBreakerManager.boardParams, (property: string, value: any) => {
            this.pixelBreakerManager.boardParams.HandlePropertyChange(property, value, this.pixelBreakerManager);
        });
        this.inspector.EndContainerPathScope();

        this.inspector.BeginContainerPathScope(kFolderPath_Debug);
        this.inspector.RegisterTarget(this.pixelBreakerManager.particleCountReadback, (property: string, value: any) => {
            
        });
        this.inspector.EndContainerPathScope();

        this.inspector.BuildUIComponents();

        const applicationFolder = this.inspector.tree!.GetFolder(kFolderPath_Application)!;
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

        this.playStateText = applicationFolder.addBlade({
            view: 'text',
            parse: (v: any) => String(v),
            value: 'Play State',
          });

        this.fpsGraph = (this.inspector.tree!.GetFolder(kFolderPath_Debug))!.addBlade({
            view: 'fpsgraph',
            label: 'FPS',
        });
    }

    private ToggleApplicationPause(): void
    {
        this._isPaused = !this._isPaused;
        if (this._isPaused === this.videoManager.IsPaused())
            return;
        this.videoManager.TogglePlayPause();
    }

    private ToggleVideoPlayPause(): void
    {
        if (this._isPaused)
            return;
        this.videoManager.TogglePlayPause();
    }

    private Restart(): void
    {
        this._isPaused = false;
        this.videoManager.Restart();
        this.pixelBreakerManager.Reset();
    }

    private SetUpBabylonDebugLayer(debugOn: boolean = true): void 
    {
        if (debugOn) {
            this.sceneManager.scene.debugLayer.show({ overlay: true });
        } else {
            this.sceneManager.scene.debugLayer.hide();
        }
    }

    private SetUpInputActions(): void
    {
        this.sceneManager.scene.actionManager = new BABYLON.ActionManager(this.sceneManager.scene);
        // keyword P to toggle inspector
        this.sceneManager.scene.actionManager.registerAction(
            new BABYLON.ExecuteCodeAction(
                {
                  trigger: BABYLON.ActionManager.OnKeyDownTrigger,
                  parameter: "p",
                },
                () => { this.inspector.Toggle(); }
              )
        );

        // keyboard space to toggle application pause
        this.sceneManager.scene.actionManager.registerAction(
            new BABYLON.ExecuteCodeAction(
                {
                  trigger: BABYLON.ActionManager.OnKeyDownTrigger,
                  parameter: " ",
                },
                () => { this.ToggleApplicationPause(); }
              )
        );

        // keyboard v to toggle video play pause
        this.sceneManager.scene.actionManager.registerAction(
            new BABYLON.ExecuteCodeAction(
                {
                  trigger: BABYLON.ActionManager.OnKeyDownTrigger,
                  parameter: "v",
                },
                () => { this.ToggleVideoPlayPause(); }
              )
        );

        // keyboard r to restart application
        this.sceneManager.scene.actionManager.registerAction(
            new BABYLON.ExecuteCodeAction(
                {
                  trigger: BABYLON.ActionManager.OnKeyDownTrigger,
                  parameter: "r",
                },
                () => { this.Restart(); }
              )
        );

        // keyboard a to move reflection board left
        this.sceneManager.scene.actionManager.registerAction(
            new BABYLON.ExecuteCodeAction(
                {
                  trigger: BABYLON.ActionManager.OnKeyDownTrigger,
                  parameter: "a",
                },
                () => { this.pixelBreakerManager.boardParams.OnGetInput(-1); }
              )
        );

        // keyboard d to move reflection board right
        this.sceneManager.scene.actionManager.registerAction(
            new BABYLON.ExecuteCodeAction(
                {
                  trigger: BABYLON.ActionManager.OnKeyDownTrigger,
                  parameter: "d",
                },
                () => { this.pixelBreakerManager.boardParams.OnGetInput(1); }
              )
        );
    }

    async Run(): Promise<void> 
    {
        if ((this.engine as any).initAsync) {
            await (this.engine as any).initAsync();
        }
        this.InitializeManagers();
        
        this.SetUpBabylonDebugLayer(false);

        this.SetUpInputActions();
        
        this.engine.runRenderLoop(() => {
            this.fpsGraph!.begin();
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
            this.fpsGraph!.end();

            this.playStateText.value = this._isPaused ? 'Application is Paused' : 'Application is Playing';
        });
    }

    dispose(): void 
    {
        this.inspector.dispose();
        this.videoManager.dispose();
        this.sceneManager.dispose();
        this.engine.dispose();
        this.jumpFloodingSDFGenerator.Release();
    }

}
