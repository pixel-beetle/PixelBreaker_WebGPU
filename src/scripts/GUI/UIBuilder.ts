import { BindingParams, FolderApi, Pane } from 'tweakpane';
import { UIPropertyMetadata, GetUIProperties, ButtonOptions, BindingOptions } from './UIProperty';
import * as EssentialsPlugin from '@tweakpane/plugin-essentials';


export interface UIBuilderOptions {
    title?: string;
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
    expanded?: boolean;
}

export class UIBuilder 
{
    private _pane: Pane;
    public get pane(): Pane 
    {
        return this._pane;
    }
    private _folders: Map<string, FolderApi> = new Map();
    public get folders(): Map<string, FolderApi> 
    {
        return this._folders;
    }
    private callbacks: Map<string, Function> = new Map();

    constructor(options: UIBuilderOptions = {}) 
    {
        this._pane = new Pane({
            title: options.title || 'Control Panel',
            expanded: options.expanded !== false
        });
        this._pane.registerPlugin(EssentialsPlugin);
    }

    public BuildUI(target: any, 
            properties: UIPropertyMetadata[],
            options: { onPropertyChange?: (property: string, value: any) => void } = {}): void 
    {   
        const groupedProperties = this.GroupPropertiesByCategory(properties);
        
        for (const [category, props] of groupedProperties) 
        {
            const folder = this.CreateFolder(category);
            for (const prop of props) 
            {
                this.CreateControl(folder, target, prop, options.onPropertyChange);
            }
        }
    }

    private GroupPropertiesByCategory(properties: UIPropertyMetadata[]): Map<string, UIPropertyMetadata[]> {
        const groups = new Map<string, UIPropertyMetadata[]>();
        
        for (const prop of properties) {
            const category = prop.options.category || 'default';
            if (!groups.has(category)) {
                groups.set(category, []);
            }
            groups.get(category)!.push(prop);
        }
        
        return groups;
    }

    private CreateFolder(category: string): FolderApi 
    {
        if (this._folders.has(category)) 
        {
            return this._folders.get(category)!;
        }

        const folder = this._pane.addFolder({
            title: category === 'default' ? 'Controls' : category,
            expanded: true
        });
        
        this._folders.set(category, folder);
        return folder;
    }

    private CreateControl(folder: FolderApi, 
        target: any, 
        property: UIPropertyMetadata, 
        onPropertyChange?: (property: string, value: any) => void): void 
    {
        const { propertyKey, options, type } = property;

        try 
        {
            switch (type) 
            {
                case 'button':
                    const buttonOptions = options as ButtonOptions;
                    const buttonParams = buttonOptions.buttonParams!;
                    const button = folder.addButton(buttonParams);
                    button.on('click', () => {
                        if (onPropertyChange) {
                            onPropertyChange(propertyKey, true);
                        }
                    });
                    break;
                default:
                    const bindingOptions = options as BindingOptions;
                    const bindingParams = bindingOptions.bindingParams!;
                    const control = folder.addBinding(target, propertyKey, bindingParams);
                    if (onPropertyChange) {
                        control.on('change', (ev: any) => {
                            onPropertyChange(propertyKey, ev.value);
                        });
                    }
                    break;
            }
        } 
        catch (error) 
        {
            console.warn(`Failed to create control for property ${propertyKey}:`, error);
        }
    }

    /**
     * 获取面板元素
     */
    get element(): HTMLElement {
        return this._pane.element;
    }

    /**
     * 销毁UI
     */
    dispose(): void {
        if (this._pane) {
            this._pane.dispose();
        }
        this._folders.clear();
        this.callbacks.clear();
    }
}
