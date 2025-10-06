import { FolderApi, Pane } from 'tweakpane';
import { UIPropertyMetadata, GetUIProperties } from './UIProperty';

export interface UIBuilderOptions {
    title?: string;
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
    expanded?: boolean;
}

export class UIBuilder 
{
    private pane: Pane;
    private folders: Map<string, any> = new Map();
    private callbacks: Map<string, Function> = new Map();

    constructor(options: UIBuilderOptions = {}) 
    {
        this.pane = new Pane({
            title: options.title || 'Control Panel',
            expanded: options.expanded !== false
        });
    }

    public BuildUI(target: any, 
            properties: UIPropertyMetadata[],
            options: { onPropertyChange?: (property: string, value: any) => void } = {}): void 
    {
        const sortedProperties = this.SortProperties(properties);
        
        const groupedProperties = this.GroupPropertiesByCategory(sortedProperties);
        
        for (const [category, props] of groupedProperties) 
        {
            const folder = this.CreateFolder(category);
            
            for (const prop of props) {
                this.CreateControl(folder, target, prop, options.onPropertyChange);
            }
        }
    }

    private SortProperties(properties: UIPropertyMetadata[]): UIPropertyMetadata[] {
        return properties
            .filter(prop => !prop.options.hidden)
            .sort((a, b) => {
                // 先按分类排序
                const categoryA = a.options.category || 'default';
                const categoryB = b.options.category || 'default';
                if (categoryA !== categoryB) {
                    return categoryA.localeCompare(categoryB);
                }
                // 再按顺序排序
                return (a.options.order || 0) - (b.options.order || 0);
            });
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

    private CreateFolder(category: string): FolderApi {
        if (this.folders.has(category)) {
            return this.folders.get(category);
        }

        const folder = this.pane.addFolder({
            title: category === 'default' ? 'Controls' : category,
            expanded: true
        });
        
        this.folders.set(category, folder);
        return folder;
    }

    private CreateControl(folder: FolderApi, 
        target: any, 
        property: UIPropertyMetadata, 
        onPropertyChange?: (property: string, value: any) => void): void 
    {
        const { propertyKey, options, type } = property;

        try {
            switch (type) {
                case 'slider':
                    this.CreateSlider(folder, target, propertyKey, options, onPropertyChange);
                    break;
                case 'button':
                    this.CreateButton(folder, target, propertyKey, options, onPropertyChange);
                    break;
                case 'toggle':
                    this.CreateToggle(folder, target, propertyKey, options, onPropertyChange);
                    break;
                case 'color':
                    this.CreateColor(folder, target, propertyKey, options, onPropertyChange);
                    break;
                case 'list':
                    this.CreateList(folder, target, propertyKey, options, onPropertyChange);
                    break;
                case 'number':
                    this.CreateNumber(folder, target, propertyKey, options, onPropertyChange);
                    break;
                default:
                    this.CreateText(folder, target, propertyKey, options, onPropertyChange);
                    break;
            }
        } catch (error) {
            console.warn(`Failed to create control for property ${propertyKey}:`, error);
        }
    }

    private CreateSlider(folder: FolderApi, target: any, propertyKey: string, options: any, onPropertyChange?: Function): void {
        const slider = folder.addBinding(target, propertyKey, options);

        if (onPropertyChange) {
            slider.on('change', (ev: any) => {
                onPropertyChange(propertyKey, ev.value);
            });
        }
    }

    private CreateButton(folder: FolderApi, target: any, propertyKey: string, options: any, onPropertyChange?: Function): void {
        const button = folder.addButton({
            title: options.label || propertyKey,
            label: options.text || 'Click'
        });

        button.on('click', () => {
            if (onPropertyChange) {
                onPropertyChange(propertyKey, true);
            }
        });
    }

    private CreateToggle(folder: FolderApi, target: any, propertyKey: string, options: any, onPropertyChange?: Function): void {
        const toggle = folder.addBinding(target, propertyKey, {
            label: options.label || propertyKey,
            readonly: options.readonly || false
        });

        if (onPropertyChange) {
            toggle.on('change', (ev: any) => {
                onPropertyChange(propertyKey, ev.value);
            });
        }
    }

    private CreateColor(folder: FolderApi, target: any, propertyKey: string, options: any, onPropertyChange?: Function): void {
        const color = folder.addBinding(target, propertyKey, options);

        if (onPropertyChange) {
            color.on('change', (ev: any) => {
                onPropertyChange(propertyKey, ev.value);
            });
        }
    }

    private CreateList(folder: FolderApi, target: any, propertyKey: string, options: any, onPropertyChange?: Function): void {
        const list = folder.addBinding(target, propertyKey, options);

        if (onPropertyChange) {
            list.on('change', (ev: any) => {
                onPropertyChange(propertyKey, ev.value);
            });
        }
    }

    private CreateNumber(folder: FolderApi, target: any, propertyKey: string, options: any, onPropertyChange?: Function): void {
        const number = folder.addBinding(target, propertyKey, options);

        if (onPropertyChange) {
            number.on('change', (ev: any) => {
                onPropertyChange(propertyKey, ev.value);
            });
        }
    }

    private CreateText(folder: FolderApi, target: any, propertyKey: string, options: any, onPropertyChange?: Function): void {
        const text = folder.addBinding(target, propertyKey, options);

        if (onPropertyChange) {
            text.on('change', (ev: any) => {
                onPropertyChange(propertyKey, ev.value);
            });
        }
    }

    /**
     * 获取面板元素
     */
    get element(): HTMLElement {
        return this.pane.element;
    }

    /**
     * 销毁UI
     */
    dispose(): void {
        if (this.pane) {
            this.pane.dispose();
        }
        this.folders.clear();
        this.callbacks.clear();
    }
}
