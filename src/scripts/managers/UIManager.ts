import { ShaderUniforms } from './ShaderManager';

export class UIManager {
    private controlPanel!: HTMLElement;
    private uniforms: ShaderUniforms;
    private isMuted: boolean = false;
    private volume: number = 1.0;

    constructor(
        private onUniformsChange: (uniforms: ShaderUniforms) => void,
        private onPlayPause: () => void,
        private onVolumeChange: (volume: number) => void,
        private onMuteToggle: () => void
    ) {
        this.uniforms = {
            brightness: 0.0,
            contrast: 1.0,
            saturation: 1.0,
            hueShift: 0.0,
            gamma: 1.0
        };
        this.setupUI();
    }

    private setupUI(): void {
        // 创建控制面板
        this.controlPanel = document.createElement('div');
        this.controlPanel.style.position = 'absolute';
        this.controlPanel.style.bottom = '20px';
        this.controlPanel.style.left = '50%';
        this.controlPanel.style.transform = 'translateX(-50%)';
        this.controlPanel.style.background = 'rgba(0,0,0,0.8)';
        this.controlPanel.style.color = 'white';
        this.controlPanel.style.padding = '15px 20px';
        this.controlPanel.style.borderRadius = '10px';
        this.controlPanel.style.fontFamily = 'Arial, sans-serif';
        this.controlPanel.style.zIndex = '1000';
        this.controlPanel.style.display = 'flex';
        this.controlPanel.style.flexWrap = 'wrap';
        this.controlPanel.style.gap = '15px';
        this.controlPanel.style.alignItems = 'center';
        this.controlPanel.style.justifyContent = 'center';
        this.controlPanel.style.minWidth = '600px';
        this.controlPanel.style.maxWidth = '90vw';
        this.controlPanel.style.boxShadow = '0 4px 15px rgba(0,0,0,0.3)';
        
        // 添加响应式设计
        const mediaQuery = window.matchMedia('(max-width: 768px)');
        const handleResponsive = (e: MediaQueryListEvent | MediaQueryList) => {
            const matches = e.matches;
            if (matches) {
                // 小屏幕：垂直布局
                this.controlPanel.style.flexDirection = 'column';
                this.controlPanel.style.minWidth = '300px';
                this.controlPanel.style.gap = '10px';
            } else {
                // 大屏幕：水平布局
                this.controlPanel.style.flexDirection = 'row';
                this.controlPanel.style.minWidth = '600px';
                this.controlPanel.style.gap = '15px';
            }
        };
        
        mediaQuery.addEventListener('change', handleResponsive);
        handleResponsive(mediaQuery); // 初始化

        // 亮度控制
        const brightnessDiv = this.createSliderControl('亮度', this.uniforms.brightness, -1, 1, (value) => {
            this.uniforms.brightness = value;
            this.onUniformsChange(this.uniforms);
        });

        // 对比度控制
        const contrastDiv = this.createSliderControl('对比度', this.uniforms.contrast, 0, 2, (value) => {
            this.uniforms.contrast = value;
            this.onUniformsChange(this.uniforms);
        });

        // 饱和度控制
        const saturationDiv = this.createSliderControl('饱和度', this.uniforms.saturation, 0, 2, (value) => {
            this.uniforms.saturation = value;
            this.onUniformsChange(this.uniforms);
        });

        // 色相控制
        const hueDiv = this.createSliderControl('色相', this.uniforms.hueShift, -1, 1, (value) => {
            this.uniforms.hueShift = value;
            this.onUniformsChange(this.uniforms);
        });

        // 伽马控制
        const gammaDiv = this.createSliderControl('伽马', this.uniforms.gamma, 0.1, 3, (value) => {
            this.uniforms.gamma = value;
            this.onUniformsChange(this.uniforms);
        });

        // 音量控制
        const volumeDiv = this.createSliderControl('音量', this.volume, 0, 1, (value) => {
            this.volume = value;
            this.onVolumeChange(value);
            // 如果取消静音，更新静音状态
            if (this.isMuted && value > 0) {
                this.isMuted = false;
                this.updateMuteButton();
            }
        });

        // 静音按钮
        const muteButton = this.createMuteButton();

        // 播放控制按钮
        const playButton = document.createElement('button');
        playButton.textContent = '播放/暂停';
        playButton.style.padding = '8px 16px';
        playButton.style.margin = '0 10px';
        playButton.style.border = 'none';
        playButton.style.borderRadius = '5px';
        playButton.style.background = '#007acc';
        playButton.style.color = 'white';
        playButton.style.cursor = 'pointer';
        playButton.style.fontSize = '12px';
        playButton.style.fontWeight = 'bold';
        playButton.style.transition = 'background 0.2s';
        playButton.onclick = () => this.onPlayPause();
        
        // 添加悬停效果
        playButton.onmouseenter = () => {
            playButton.style.background = '#005a9e';
        };
        playButton.onmouseleave = () => {
            playButton.style.background = '#007acc';
        };

        this.controlPanel.appendChild(brightnessDiv);
        this.controlPanel.appendChild(contrastDiv);
        this.controlPanel.appendChild(saturationDiv);
        this.controlPanel.appendChild(hueDiv);
        this.controlPanel.appendChild(gammaDiv);
        this.controlPanel.appendChild(volumeDiv);
        this.controlPanel.appendChild(muteButton);
        this.controlPanel.appendChild(playButton);

        document.body.appendChild(this.controlPanel);
    }

    private createSliderControl(label: string, value: number, min: number, max: number, onChange: (value: number) => void): HTMLElement {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.flexDirection = 'column';
        div.style.alignItems = 'center';
        div.style.minWidth = '100px';
        div.style.margin = '0 5px';

        const labelEl = document.createElement('label');
        labelEl.textContent = label;
        labelEl.style.fontSize = '12px';
        labelEl.style.marginBottom = '5px';
        labelEl.style.fontWeight = 'bold';

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = min.toString();
        slider.max = max.toString();
        slider.step = '0.01';
        slider.value = value.toString();
        slider.style.width = '80px';
        slider.style.height = '20px';
        slider.style.cursor = 'pointer';

        const valueEl = document.createElement('span');
        valueEl.textContent = value.toFixed(2);
        valueEl.style.fontSize = '11px';
        valueEl.style.marginTop = '3px';
        valueEl.style.color = '#ccc';

        slider.oninput = () => {
            const newValue = parseFloat(slider.value);
            valueEl.textContent = newValue.toFixed(2);
            onChange(newValue);
        };

        div.appendChild(labelEl);
        div.appendChild(slider);
        div.appendChild(valueEl);

        return div;
    }

    private createMuteButton(): HTMLElement {
        const muteButton = document.createElement('button');
        muteButton.id = 'muteButton';
        muteButton.innerHTML = '🔊'; // 默认显示音量图标
        muteButton.style.padding = '8px 12px';
        muteButton.style.margin = '0 5px';
        muteButton.style.border = 'none';
        muteButton.style.borderRadius = '5px';
        muteButton.style.background = this.isMuted ? '#ff6b6b' : '#28a745';
        muteButton.style.color = 'white';
        muteButton.style.cursor = 'pointer';
        muteButton.style.fontSize = '16px';
        muteButton.style.fontWeight = 'bold';
        muteButton.style.transition = 'background 0.2s';
        muteButton.title = this.isMuted ? '取消静音' : '静音';
        
        muteButton.onclick = () => {
            this.isMuted = !this.isMuted;
            this.onMuteToggle();
            this.updateMuteButton();
        };
        
        // 添加悬停效果
        muteButton.onmouseenter = () => {
            muteButton.style.background = this.isMuted ? '#ff5252' : '#218838';
        };
        muteButton.onmouseleave = () => {
            muteButton.style.background = this.isMuted ? '#ff6b6b' : '#28a745';
        };
        
        return muteButton;
    }

    private updateMuteButton(): void {
        const muteButton = document.getElementById('muteButton') as HTMLButtonElement;
        if (muteButton) {
            muteButton.innerHTML = this.isMuted ? '🔇' : '🔊';
            muteButton.style.background = this.isMuted ? '#ff6b6b' : '#28a745';
            muteButton.title = this.isMuted ? '取消静音' : '静音';
        }
    }

    public dispose(): void {
        if (this.controlPanel && this.controlPanel.parentNode) {
            this.controlPanel.parentNode.removeChild(this.controlPanel);
        }
    }
}
