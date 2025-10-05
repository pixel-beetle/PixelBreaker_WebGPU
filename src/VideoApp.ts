import * as BABYLON from 'babylonjs';
import { SceneManager } from './scripts/Core/SceneManager';
import { VideoManager } from './scripts/Core/VideoManager';
import { UIManager } from './scripts/GUI/UIManager';
import JumpFloodingSDFGenerator from './scripts/Core/JumpFloodingSDFGenerator';

export class VideoApp {
    private engine: BABYLON.Engine;
    private sceneManager!: SceneManager;
    private videoManager!: VideoManager;
    private uiManager!: UIManager;
    private jumpFloodingSDFGenerator!: JumpFloodingSDFGenerator;

    constructor(readonly canvas: HTMLCanvasElement) {
        // 使用 WebGPU 引擎
        this.engine = new BABYLON.WebGPUEngine(canvas) as any;
        
        window.addEventListener('resize', () => {
            this.engine.resize();
        });
    }

    private initializeManagers(): void {
        // 初始化场景管理器
        this.sceneManager = new SceneManager(this.engine, this.canvas);
        
        // 初始化视频管理器
        this.videoManager = new VideoManager(this.sceneManager.scene);
        
        // 初始化UI管理器
        this.uiManager = new UIManager(
            () => this.videoManager.togglePlayPause(),
            (volume) => this.videoManager.setVolume(volume),
            () => this.videoManager.toggleMute()
        );

        this.jumpFloodingSDFGenerator = new JumpFloodingSDFGenerator();
    }

    debug(debugOn: boolean = true): void {
        if (debugOn) {
            this.sceneManager.scene.debugLayer.show({ overlay: true });
        } else {
            this.sceneManager.scene.debugLayer.hide();
        }
    }

    async run(): Promise<void> {
        // 异步初始化 WebGPU 引擎
        if ((this.engine as any).initAsync) {
            await (this.engine as any).initAsync();
        }
        this.initializeManagers();
        
        this.debug(true);
        
        
        // 开始渲染循环
        this.engine.runRenderLoop(() => {
            this.videoManager.videoTexture.update();

            this.jumpFloodingSDFGenerator.Tick(
                this.sceneManager.scene, 
                this.engine, 
                this.videoManager.videoTexture);
            
            // 渲染场景
            this.sceneManager.render(this.jumpFloodingSDFGenerator.tempBuffer?.Current()!);
        });
    }

    // 播放/暂停视频
    togglePlayPause(): void {
        this.videoManager.togglePlayPause();
    }

    // 设置视频音量
    setVolume(volume: number): void {
        this.videoManager.setVolume(volume);
    }

    // 清理资源
    dispose(): void {
        this.uiManager.dispose();
        this.videoManager.dispose();
        this.sceneManager.dispose();
        this.engine.dispose();
    }

}
