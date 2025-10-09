
import { GetUIProperties, UIPropertyMetadata } from './UIProperty';
import { Pane } from 'tweakpane';
import * as EssentialsPlugin from '@tweakpane/plugin-essentials';
import { GradientPluginBundle } from 'tweakpane-plugin-gradient';
import { UITree, UILeafNode, UI_PATH_PREFIX_FOLDER } from './UITree';

export interface ReflectedInspectorOptions 
{
    title?: string;
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
    expanded?: boolean;
    autoRefresh?: boolean;
    refreshInterval?: number;
}

export class ReflectedInspector 
{
    private _targets: Set<any> = new Set();
    private _refreshTimer?: number;
    private _options: ReflectedInspectorOptions;

    private _pane: Pane;
    public get pane(): Pane 
    {
        return this._pane;
    }

    public get element(): HTMLElement 
    {
        return this._pane.element;
    }

    private _tree: UITree | null = null;
    public get tree(): UITree | null
    {
        return this._tree;
    }

    constructor(options: ReflectedInspectorOptions = {}) 
    {
        this._options = options;
        this._pane = new Pane({
            title: options.title || 'Control Panel',
            expanded: options.expanded !== false
        });

        this._pane.registerPlugin(EssentialsPlugin);
        this._pane.registerPlugin(GradientPluginBundle);

        this._tree = new UITree(this._pane);
        this.SetupResponsive();
    }

    private SetupResponsive(): void 
    {
        const mediaQuery = window.matchMedia('(max-width: 768px)');
        const handleResponsive = (e: MediaQueryListEvent | MediaQueryList) => 
        {
            const matches = e.matches;
            this.element.style.width = matches ? '300px' : 'auto';
        };
        
        mediaQuery.addEventListener('change', handleResponsive);
        handleResponsive(mediaQuery);
    }


    public Toggle(): void
    {
        this._pane.hidden = !this._pane.hidden;
    }

    private _customContainerScope: string | null = null;

    public BeginContainerPathScope(path: string): void
    {
        if (this._customContainerScope)
        {
            throw new Error('Container path scope already exists');
        }
        this._customContainerScope = path;
    }

    public EndContainerPathScope(): void
    {
        this._customContainerScope = null;
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

        this.RegisterTargetWithProperties(target, properties, { onPropertyChange });

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

    private GetFallbackContainerPath(property: UIPropertyMetadata): string
    {
        // path format: #tab/@page/%folder/leafNode
        if (property.options.category !== undefined && property.options.category !== null)
        {
            return UI_PATH_PREFIX_FOLDER + property.options.category;
        }
        if (this._customContainerScope)
        {
            return "";
        }
        return UI_PATH_PREFIX_FOLDER + 'DefaultContainer';
    }

    public RegisterTargetWithProperties(target: any, 
            properties: UIPropertyMetadata[],
            options: { onPropertyChange?: (property: string, value: any) => void } = {}): void 
    {
        let nodePathToProperties: Map<string, UIPropertyMetadata> = new Map();
        for (const property of properties)
        {
            let nodePath = property.options.containerPath;
            if (!property.options.containerPath)
            {
                nodePath = this.GetFallbackContainerPath(property);
            }
            nodePath = nodePath + '/' + property.propertyKey;
            nodePath = nodePath.replace(/^\/+/, '');
            if (this._customContainerScope)
            {
                nodePath = this._customContainerScope + '/' + nodePath;
            }
            nodePathToProperties.set(nodePath, property);
        }

        let nodes = this._tree!.GetOrCreateNodesFromPaths(Array.from(nodePathToProperties.keys()));
        for (const node of nodes)
        {
            if (node instanceof UILeafNode)
            {
                node.propertyMeta = nodePathToProperties.get(node.nodePath)!;
                node.target = target;
                node.onPropertyChange = options.onPropertyChange || null;
            }
        }
    }

    public BuildUIComponents()
    {
        this._tree!.RebuildUIComponentsIfNeeded();
    }

    public Refresh(): void 
    {
        this.pane.refresh();
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

    dispose(): void 
    {
        this.StopAutoRefresh();
        this._pane.dispose();
        this._targets.clear();
    }
}
