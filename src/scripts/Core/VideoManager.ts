import * as BABYLON from 'babylonjs';

export class VideoManager 
{
    public videoTexture: BABYLON.VideoTexture | null = null;

    public volume: number = 0.5;

    public videoElement: HTMLVideoElement | null = null;

    constructor(private scene: BABYLON.Scene) 
    {
        
    }

    public SetupVideo(videoSrc: string): void 
    {
        this.videoElement = document.createElement('video');
        this.videoElement.src = videoSrc;
        this.videoElement.controls = true;
        this.videoElement.autoplay = false;
        this.videoElement.loop = true;
        this.videoElement.muted = this.volume === 0;
        this.videoElement.style.position = 'relative';
        this.videoElement.style.top = '0';
        this.videoElement.style.left = '0';
        this.videoElement.style.width = '100%';
        this.videoElement.style.height = '100%';

        this.videoTexture = new BABYLON.VideoTexture("videoTexture", 
            this.videoElement, 
            this.scene,
            false,
            false,
            BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
            {
                autoPlay: false,
                loop: true,
                muted: this.volume === 0,
                autoUpdateTexture: true,
            },
            (msg, exception) => {
                console.error('视频加载错误:', msg, exception);
            }
        );

        this.videoTexture.onLoadObservable.add(() => {
            this.SetAudioVolume(this.volume);
        });

        this.videoTexture.uScale = 1.0;
        this.videoTexture.vScale = 1.0;
    }

    public IsPaused(): boolean
    {
        const videoElement = this.videoTexture?.video;
        if (!videoElement) 
            throw new Error('Video element not found');
        return videoElement.paused;
    }

    public TogglePlayPause(): void 
    {
        const videoElement = this.videoTexture?.video;
        if (!videoElement) 
            return;

        if (videoElement.paused) 
        {
            videoElement.play().catch(error => {
                    console.error('视频播放失败:', error);
            });
        } 
        else 
        {
            videoElement.pause();
        }
    }

    public Restart(): void 
    {
        const videoElement = this.videoTexture?.video;
        if (!videoElement) 
            return;
        videoElement.pause();
        videoElement.currentTime = 0;
        videoElement.play();
    }

    public SetAudioVolume(volume: number): void 
    {
        const videoElement = this.videoTexture?.video;
        if (!videoElement) 
            return;
        
        this.volume = volume;
        videoElement.volume = Math.max(0, Math.min(1, volume));
        if (volume > 0) 
        {
            videoElement.muted = false;
        }
    }

    public dispose(): void 
    {
        if (this.videoTexture) 
        {
            // Store reference to the underlying HTML5 video element
            const videoElement = this.videoTexture.video;
            // Dispose texture
            this.videoTexture.dispose();

            // Remove any <source> elements, etc.
            while (videoElement.firstChild) 
            {
                if (videoElement.lastChild)
                    videoElement.removeChild(videoElement.lastChild);
            }

            // Set a blank src
            videoElement.src = ''

            // Prevent non-important errors in some browsers
            videoElement.removeAttribute('src')

            // Get certain browsers to let go
            videoElement.load()

            videoElement.remove()
        }

        this.videoTexture = null;
    }
}
