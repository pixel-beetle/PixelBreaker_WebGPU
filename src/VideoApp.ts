import * as BABYLON from 'babylonjs';
import { SceneManager } from './scripts/managers/SceneManager';
import { VideoManager } from './scripts/managers/VideoManager';
import { ShaderManager, ShaderUniforms } from './scripts/managers/ShaderManager';
import { UIManager } from './scripts/managers/UIManager';

export class VideoApp {
    private engine: BABYLON.Engine;
    private sceneManager!: SceneManager;
    private videoManager!: VideoManager;
    private shaderManager!: ShaderManager;
    private uiManager!: UIManager;

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
        
        // 初始化着色器管理器
        this.shaderManager = new ShaderManager(
            this.sceneManager.scene,
            this.videoManager.videoTexture,
            this.sceneManager.plane,
            this.engine
        );
        
        // 初始化UI管理器
        this.uiManager = new UIManager(
            (uniforms) => this.shaderManager.updateUniforms(uniforms),
            () => this.videoManager.togglePlayPause(),
            (volume) => this.videoManager.setVolume(volume),
            () => this.videoManager.toggleMute()
        );
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
        
        this.debug(false);
        
        
        // 开始渲染循环
        this.engine.runRenderLoop(() => {
            this.videoManager.videoTexture.update();
            // 执行 compute shader
            this.shaderManager.executeComputeShader();
            
            // 渲染场景
            this.sceneManager.render();
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

    // 获取当前着色器参数
    getShaderUniforms(): ShaderUniforms {
        return this.shaderManager.getUniforms();
    }

    // 设置着色器参数
    setShaderUniforms(uniforms: ShaderUniforms): void {
        this.shaderManager.updateUniforms(uniforms);
    }

    // 清理资源
    dispose(): void {
        this.uiManager.dispose();
        this.shaderManager.dispose();
        this.videoManager.dispose();
        this.sceneManager.dispose();
        this.engine.dispose();
    }

}
