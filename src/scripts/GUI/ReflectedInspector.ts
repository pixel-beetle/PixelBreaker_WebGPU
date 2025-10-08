import { UIBuilder, UIBuilderOptions } from './UIBuilder';
import { GetUIProperties } from './UIProperty';

export interface ReflectedInspectorOptions extends UIBuilderOptions {
    autoRefresh?: boolean;
    refreshInterval?: number;
}

export class ReflectedInspector 
{
    private _uiBuilder: UIBuilder;
    public get uiBuilder(): UIBuilder 
    {
        return this._uiBuilder;
    }
    private _targets: Set<any> = new Set();
    private _refreshTimer?: number;
    private _options: ReflectedInspectorOptions;

    constructor(options: ReflectedInspectorOptions = {}) 
    {
        this._options = {
            autoRefresh: false,
            refreshInterval: 100,
            ...options
        };

        this._uiBuilder = new UIBuilder(options);
        this.SetupResponsive();
    }

    private SetupResponsive(): void 
    {
        const mediaQuery = window.matchMedia('(max-width: 768px)');
        const handleResponsive = (e: MediaQueryListEvent | MediaQueryList) => {
            const matches = e.matches;
            this._uiBuilder.element.style.width = matches ? '300px' : 'auto';
        };
        
        mediaQuery.addEventListener('change', handleResponsive);
        handleResponsive(mediaQuery);
    }


    public RegisterTarget(target: any, 
        onPropertyChange?: (property: string, value: any) => void): void 
    {
        this._targets.add(target);
        
        const properties = GetUIProperties(target.constructor.prototype);
        
        if (properties.length === 0) 
        {
            console.warn(`No UI properties found for target: ${target.constructor.name}`);
            return;
        }

        this._uiBuilder.RegisterTarget(target, properties, { onPropertyChange });

        if (this._options.autoRefresh && !this._refreshTimer) 
        {
            this.StartAutoRefresh();
        }
    }


    public UnregisterTarget(target: any): void 
    {
        this._targets.delete(target);
        if (this._targets.size === 0 && this._refreshTimer) 
        {
            this.StopAutoRefresh();
        }
    }

    public BuildUIComponents(): void 
    {
        this._uiBuilder.BuildUIComponents();
    }

    public Refresh(): void 
    {
        
    }

    private StartAutoRefresh(): void 
    {
        if (this._refreshTimer) return;

        this._refreshTimer = window.setInterval(() => {
            this.Refresh();
        }, this._options.refreshInterval);
    }

    private StopAutoRefresh(): void 
    {
        if (this._refreshTimer) 
        {
            clearInterval(this._refreshTimer);
            this._refreshTimer = undefined;
        }
    }


    get builder(): UIBuilder 
    {
        return this._uiBuilder;
    }


    get element(): HTMLElement 
    {
        return this._uiBuilder.element;
    }


    dispose(): void 
    {
        this.StopAutoRefresh();
        this._uiBuilder.dispose();
        this._targets.clear();
    }
}
