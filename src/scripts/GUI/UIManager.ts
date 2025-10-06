import { Pane } from 'tweakpane';

// UI参数接口
interface UIParams {
    volume: number;
    isMuted: boolean;
    isPlaying: boolean;
}

export class UIManager {
    private pane!: Pane;
    private params: UIParams = {
        volume: 1.0,
        isMuted: false,
        isPlaying: true
    };

    constructor(
        private onPlayPause: () => void,
        private onVolumeChange: (volume: number) => void,
        private onMuteToggle: () => void
    ) {
        this.setupUI();
    }

    private setupUI(): void 
    {
        this.pane = new Pane({
            title: 'Control Panel',
            expanded: true
        });

        this.setupResponsiveDesign();

        this.setupControls();
    }

    private setupResponsiveDesign(): void {
        const mediaQuery = window.matchMedia('(max-width: 768px)');
        const handleResponsive = (e: MediaQueryListEvent | MediaQueryList) => {
            const matches = e.matches;
            if (matches) {
                // 小屏幕：调整面板宽度
                this.pane.element.style.width = '300px';
            } else {
                // 大屏幕：默认宽度
                this.pane.element.style.width = 'auto';
            }
        };
        
        mediaQuery.addEventListener('change', handleResponsive);
        handleResponsive(mediaQuery); // 初始化
    }

    private setupControls(): void {
        // 使用类型断言来绕过类型检查问题
        const pane = this.pane;

        // 音量滑块
        pane.addBinding(this.params, 'volume', {
            min: 0,
            max: 1,
            step: 0.01,
            label: '音量'
        }).on('change', (ev: any) => {
            this.onVolumeChange(ev.value);
            // 如果取消静音，更新静音状态
            if (this.params.isMuted && ev.value > 0) {
                this.params.isMuted = false;
            }
        });

        // 播放/暂停按钮
        pane.addButton({
            title: '播放/暂停',
            label: this.params.isPlaying ? '⏸️ 暂停' : '▶️ 播放'
        }).on('click', () => {
            this.params.isPlaying = !this.params.isPlaying;
            this.onPlayPause();
        });

        // 静音按钮
        pane.addButton({
            title: '静音',
            label: this.params.isMuted ? '🔇 取消静音' : '🔊 静音'
        }).on('click', () => {
            this.params.isMuted = !this.params.isMuted;
            this.onMuteToggle();
        });
    }

    // 公共方法用于外部更新状态
    public updatePlayState(isPlaying: boolean): void {
        this.params.isPlaying = isPlaying;
    }

    public updateMuteState(isMuted: boolean): void {
        this.params.isMuted = isMuted;
    }

    public updateVolume(volume: number): void {
        this.params.volume = volume;
    }

    public dispose(): void {
        if (this.pane) {
            this.pane.dispose();
        }
    }
}
