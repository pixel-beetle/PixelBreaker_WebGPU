import * as BABYLON from 'babylonjs';
import { Slider, Button } from '../GUI/UIProperty';

export class VideoManager 
{
    public videoTexture: BABYLON.VideoTexture | null = null;
    
    @Button({ text: 'Play/Pause', category: 'Video', order: 1 })
    public playPause: boolean = false;

    @Slider({ label: 'Volume', min: 0, max: 1, step: 0.01, category: 'Video', order: 1 })
    public volume: number = 0.5;

    constructor(private scene: BABYLON.Scene, videoSrc: string) 
    {
        this.SetupVideo(videoSrc);
    }

    private SetupVideo(videoSrc: string): void 
    {
        this.videoTexture = new BABYLON.VideoTexture("videoTexture", 
            videoSrc, 
            this.scene,
            false,
            false,
            BABYLON.Texture.TRILINEAR_SAMPLINGMODE,
            { 
                autoPlay: false,
                loop: true,
                muted: this.volume === 0,
                autoUpdateTexture: true,
                independentVideoSource: true,
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

        this.playPause = !videoElement.paused;
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

    public handlePropertyChange(property: string, value: any): void 
    {
        switch (property) 
        {
            case 'playPause':
                this.TogglePlayPause();
                break;
            case 'volume':
                this.SetAudioVolume(value);
                break;
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
