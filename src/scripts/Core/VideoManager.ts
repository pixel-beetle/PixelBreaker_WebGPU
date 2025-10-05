import * as BABYLON from 'babylonjs';

export class VideoManager {
    public videoElement!: HTMLVideoElement;
    public videoTexture!: BABYLON.VideoTexture;
    private isMuted: boolean = false;
    private previousVolume: number = 1.0;

    constructor(private scene: BABYLON.Scene) {
        this.setupVideo();
    }

    private setupVideo(): void {
        // 创建视频元素
        this.videoElement = document.createElement('video');
        this.videoElement.src = './BadApple_Video.mp4';
        this.videoElement.crossOrigin = 'anonymous';
        this.videoElement.loop = true;
        this.videoElement.muted = false;
        this.videoElement.autoplay = true;
        this.videoElement.playsInline = true;
        
        // 设置视频样式（隐藏）
        this.videoElement.style.position = 'absolute';
        this.videoElement.style.top = '0';
        this.videoElement.style.left = '0';
        this.videoElement.style.width = '480px';
        this.videoElement.style.height = '270px';
        
        // 添加到DOM
        document.body.appendChild(this.videoElement);

        // 添加视频加载事件
        this.videoElement.addEventListener('loadeddata', () => {
            this.startVideoPlayback();
        });

        this.videoElement.addEventListener('error', (e) => {
            console.error('视频加载错误:', e);
        });

        // 创建视频纹理
        this.videoTexture = new BABYLON.VideoTexture("videoTexture", this.videoElement, this.scene);
        
        // 设置纹理属性
        this.videoTexture.uScale = 1.0;
        this.videoTexture.vScale = 1.0;
    }

    private startVideoPlayback(): void {
        if (this.videoElement) {
            this.videoElement.play().catch(error => {
                console.error('视频播放失败:', error);
            });
        }
    }

    public togglePlayPause(): void {
        if (this.videoElement) {
            if (this.videoElement.paused) {
                this.videoElement.play().catch(error => {
                    console.error('视频播放失败:', error);
                });
            } else {
                this.videoElement.pause();
            }
        }
    }

    public setVolume(volume: number): void {
        if (this.videoElement) {
            this.videoElement.volume = Math.max(0, Math.min(1, volume));
            // 如果设置音量大于0，取消静音
            if (volume > 0 && this.isMuted) {
                this.isMuted = false;
                this.videoElement.muted = false; // 同步到 videoElement
            }
        }
    }

    public toggleMute(): void {
        if (this.videoElement) {
            if (this.isMuted) {
                // 取消静音，恢复之前的音量
                this.videoElement.volume = this.previousVolume;
                this.isMuted = false;
                this.videoElement.muted = false; // 同步到 videoElement
            } else {
                // 静音，保存当前音量
                this.previousVolume = this.videoElement.volume;
                this.videoElement.volume = 0;
                this.isMuted = true;
                this.videoElement.muted = true; // 同步到 videoElement
            }
        }
    }

    public getVolume(): number {
        return this.videoElement ? this.videoElement.volume : 0;
    }

    public isMutedState(): boolean {
        return this.isMuted;
    }

    public dispose(): void {
        if (this.videoElement) {
            this.videoElement.pause();
            document.body.removeChild(this.videoElement);
        }
        if (this.videoTexture) {
            this.videoTexture.dispose();
        }
    }
}
