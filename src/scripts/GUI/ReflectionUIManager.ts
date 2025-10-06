import { UIBuilder, UIBuilderOptions } from './UIBuilder';
import { GetUIProperties } from './UIProperty';

export interface ReflectionUIManagerOptions extends UIBuilderOptions {
    autoRefresh?: boolean;
    refreshInterval?: number;
}

export class ReflectionUIManager 
{
    private uiBuilder: UIBuilder;
    private targets: Map<string, any> = new Map();
    private refreshTimer?: number;
    private options: ReflectionUIManagerOptions;

    constructor(options: ReflectionUIManagerOptions = {}) 
    {
        this.options = {
            autoRefresh: false,
            refreshInterval: 100,
            ...options
        };

        this.uiBuilder = new UIBuilder(options);
        this.SetupResponsive();
    }

    private SetupResponsive(): void 
    {
        const mediaQuery = window.matchMedia('(max-width: 768px)');
        const handleResponsive = (e: MediaQueryListEvent | MediaQueryList) => {
            const matches = e.matches;
            this.uiBuilder.element.style.width = matches ? '300px' : 'auto';
        };
        
        mediaQuery.addEventListener('change', handleResponsive);
        handleResponsive(mediaQuery);
    }


    public RegisterTarget(name: string, target: any, onPropertyChange?: (property: string, value: any) => void): void 
    {
        this.targets.set(name, target);
        
        const properties = GetUIProperties(target.constructor.prototype);
        
        if (properties.length === 0) 
        {
            console.warn(`No UI properties found for target: ${name}`);
            return;
        }

        this.uiBuilder.BuildUI(target, properties, { onPropertyChange });

        if (this.options.autoRefresh && !this.refreshTimer) 
        {
            this.StartAutoRefresh();
        }
    }


    public UnregisterTarget(name: string): void 
    {
        this.targets.delete(name);
        if (this.targets.size === 0 && this.refreshTimer) 
        {
            this.StopAutoRefresh();
        }
    }

    public Refresh(): void 
    {
        
    }

    private StartAutoRefresh(): void 
    {
        if (this.refreshTimer) return;

        this.refreshTimer = window.setInterval(() => {
            this.Refresh();
        }, this.options.refreshInterval);
    }

    private StopAutoRefresh(): void 
    {
        if (this.refreshTimer) 
        {
            clearInterval(this.refreshTimer);
            this.refreshTimer = undefined;
        }
    }


    get builder(): UIBuilder 
    {
        return this.uiBuilder;
    }


    get element(): HTMLElement 
    {
        return this.uiBuilder.element;
    }


    dispose(): void 
    {
        this.StopAutoRefresh();
        this.uiBuilder.dispose();
        this.targets.clear();
    }
}
