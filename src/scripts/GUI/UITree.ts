import { BindingParams, FolderApi, TabApi, TabPageApi, Pane } from 'tweakpane';
import { UIPropertyMetadata, GetUIProperties, ButtonOptions, BindingOptions, GradientOptions } from './UIProperty';
import { Gradient, GradientBladeApi, GradientBladeParams } from 'tweakpane-plugin-gradient';
import { BindingApi, ButtonApi } from '@tweakpane/core';
import { GradientUtils } from '../GfxUtils/ColorGradient';


export const UI_PATH_PREFIX_TAB = '#';
export const UI_PATH_PREFIX_PAGE = '%';
export const UI_PATH_PREFIX_FOLDER = '@';


export class UITree
{
    constructor(pane: Pane)
    {
        this.CreateRootNodeIfNeeded(pane);
    }

    private CreateRootNodeIfNeeded( pane: Pane | null = null )
    {
        if (this._root)
            return;

        const root = new UIContainerNode();
        root.name = '$ROOT';
        root.nodePath = '';
        root.uiContainer = pane || null;
        this._pathToNodes.set(root.nodePath, root);
        this._root = root;
    }

    private _root: UIContainerNode | null = null;
    public get root(): UIContainerNode | null
    {
        return this._root;
    }

    private _pathToNodes: Map<string, UINode> = new Map();
    public get pathToNodes(): Map<string, UINode>
    {
        return this._pathToNodes;
    }

    public GetRootPane(): Pane | null
    {
        return this._root?.uiContainer as Pane | null;
    }

    public GetFolder(path: string): FolderApi | null
    {
        let node = this.GetOrCreateNodeFromPath(path);
        if (node instanceof UIContainerNode)
        {
            return node.uiContainer as FolderApi | null;
        }
        return null;
    }

    public GetTabPage(path: string): TabPageApi | null
    {
        let node = this.GetOrCreateNodeFromPath(path);
        if (node instanceof UIContainerNode)
        {
            return node.uiContainer as TabPageApi | null;
        }
        return null;
    }

    public GetTab(path: string): TabApi | null
    {
        let node = this.GetOrCreateNodeFromPath(path);
        if (node instanceof UIContainerNode)
        {
            return node.uiContainer as TabApi | null;
        }
        return null;
    }

    public GetLeafNode(path: string): UILeafNode | null
    {
        let node = this.GetOrCreateNodeFromPath(path);
        if (node instanceof UILeafNode)
        {
            return node;
        }
        return null;
    }

    public GetOrCreateNodeFromPath(path: string): UINode
    {
        // path format: #tab/%page/@folder/leafNode
        path = path.replace(/^\/+/, '');

        if (this._pathToNodes.has(path))
        {
            return this._pathToNodes.get(path)!;
        }

        let pathParts = path.split('/');
        this.CreateRootNodeIfNeeded();

        let node = this._root! as UINode;
        for (const part of pathParts)
        {
            let child = node.children.find(child => child.name === part);
            if (child === undefined)
            {
                if (part.startsWith(UI_PATH_PREFIX_TAB) 
                    || part.startsWith(UI_PATH_PREFIX_PAGE) 
                    || part.startsWith(UI_PATH_PREFIX_FOLDER))
                    child = new UIContainerNode();
                else
                    child = new UILeafNode();
                child.name = part;
                if (node === this._root)
                {
                    child.nodePath = part;
                }
                else
                {
                    child.nodePath = node.nodePath + '/' + part;
                }
                if (node instanceof UIContainerNode)
                {
                    node.AddChild(child);
                }
                this._pathToNodes.set(child.nodePath, child);
            }
            node = child;
        }
        return node;
    }

    public GetOrCreateNodesFromPaths(paths: string[]): UINode[]
    {
        let nodes: UINode[] = [];
        for (const path of paths)
        {
            const node = this.GetOrCreateNodeFromPath(path);
            nodes.push(node);
        }
        return nodes;
    }

    public RebuildUIComponentsIfNeeded()
    {
        this._root!.RebuildUIComponentsIfNeeded();
    }

    public Dump(): string
    {
        return this.TreeToString(this._root!);
    }

    private TreeToString(node: UINode, prefix: string = '', isLast: boolean = true): string 
    {
        let result = prefix + (isLast ? '└── ' : '├── ') + node.name + '\n';
        if (node.children) 
        {
            const newPrefix = prefix + (isLast ? '    ' : '│   ');
            for (let i = 0; i < node.children.length; i++) 
            {
                const isChildLast = i === node.children.length - 1;
                result += this.TreeToString(node.children[i], newPrefix, isChildLast);
            }
        }
        return result;
    }
}

export abstract class UINode
{
    public name: string = '';
    public nodePath: string = '';
    public parent: UINode | null = null;
    public children: UINode[] = [];

    public abstract RebuildUIComponentsIfNeeded(): void;
}

export class UIContainerNode extends UINode
{
    public uiContainer: Pane | FolderApi | TabPageApi | TabApi | null = null;
    public AddChild(child: UINode): void
    {
        this.children.push(child);
        child.parent = this;
    }

    public override RebuildUIComponentsIfNeeded(): void
    {
        if(this.name !== '$ROOT')
        {
            if(!this.parent)
                throw new Error('UIContainerNode must have a parent');
            let parentUIContainer = (this.parent as UIContainerNode)?.uiContainer;
            if(!parentUIContainer)
                throw new Error('UIContainerNode must have a parent with uiContainer');
    
            let thisContainerType = this.name[0];
            let thisContainerName = this.name.slice(1);
            if (!this.uiContainer)
            {
                switch (thisContainerType)
                {
                    case UI_PATH_PREFIX_TAB:
                        if (parentUIContainer instanceof Pane || parentUIContainer instanceof FolderApi || parentUIContainer instanceof TabPageApi)
                        {
                            let pageConfigs = [];
                            for (const child of this.children)
                            {
                                if (child instanceof UIContainerNode && child.name[0] === UI_PATH_PREFIX_PAGE)
                                    pageConfigs.push({
                                        title: child.name.slice(1)
                                    });
                            }
                            this.uiContainer = parentUIContainer.addTab({
                                pages: pageConfigs
                            });
                        }
                        else
                            throw new Error('Only Pane and FolderApi and TabPageApi can add Tab');
                        break;
                    case UI_PATH_PREFIX_PAGE:
                        // Page is created by Parent Tab, so just fetch it
                        if (parentUIContainer instanceof TabApi)
                        {
                            let page = parentUIContainer.pages.find(page => page.title === thisContainerName);
                            if (!page)
                                throw new Error('Page with title ' + thisContainerName + ' not found');
                            this.uiContainer = page;
                        }
                        else
                            throw new Error('Only TabApi can add Page');
                        break;
                    case UI_PATH_PREFIX_FOLDER:
                        if (parentUIContainer instanceof Pane || parentUIContainer instanceof FolderApi || parentUIContainer instanceof TabPageApi)
                            this.uiContainer = parentUIContainer.addFolder({
                                title: thisContainerName
                            });
                        else
                            throw new Error('Only Pane and FolderApi and TabPageApi can add Folder');
                        break;
                }
            }
        }


        for (const child of this.children)
        {
            child.RebuildUIComponentsIfNeeded();
        }
    }
}

export class UILeafNode extends UINode
{
    public target: any | null = null;
    public onPropertyChange: ((property: string, value: any) => void) | null = null;
    public propertyMeta: UIPropertyMetadata | null = null;
    public uiComponent: BindingApi | ButtonApi | GradientBladeApi | null = null;

    public override RebuildUIComponentsIfNeeded(): void
    {
        if (!this.propertyMeta)
            return;
        if (this.uiComponent)
            return;
        if (!this.target)
            throw new Error('UILeafNode must have a target');
        if (!this.onPropertyChange)
            throw new Error('UILeafNode must have a onPropertyChange callback');

        let target = this.target;
        let onPropertyChange = this.onPropertyChange;

        const { propertyKey, options, type } = this.propertyMeta;
        let container = (this.parent as UIContainerNode).uiContainer;
        if (!container)
            throw new Error('UILeafNode must have a parent with uiContainer');
        if (container instanceof TabApi)
            throw new Error('Only Pane and FolderApi and TabPageApi can add LeafNode');

        try 
        {
            switch (type) 
            {
                case 'button':
                    const buttonOptions = options as ButtonOptions;
                    const buttonParams = buttonOptions.buttonParams!;
                    const button = container.addButton(buttonParams);
                    button.on('click', () => {
                        if (onPropertyChange) {
                            onPropertyChange(propertyKey, true);
                        }
                    });
                    this.uiComponent = button;
                    break;
                case 'gradient':
                    let kGradientParams: GradientBladeParams = {
                        view: 'gradient',
                        initialPoints: [ // minimum 2 points
                          { time: 0, value: { r: 255, g: 0, b: 255, a: 1 } },
                          { time: 1, value: { r: 0, g: 255, b: 255, a: 1 } },
                        ],
                        label: 'Gradient',
                        colorPicker: true,
                        colorPickerProps: {
                          alpha: true,
                          layout: 'popup',
                          expanded: false,
                        },
                        alphaPicker: false,
                        timePicker: false,
                        timeStep: 0.001,
                        timeDecimalPrecision: 4,
                      };

                    const gradientOptions = options as GradientOptions;
                    const gradientParams = kGradientParams;
                    gradientParams.label = gradientOptions.label || 'Gradient';

                    if (target[propertyKey] && target[propertyKey] instanceof Gradient)
                    {
                        gradientParams.initialPoints = target[propertyKey].points;
                    }
                    const gradientUI = container.addBlade(gradientParams) as GradientBladeApi;
                    gradientUI.on('change', (ev: any) => {
                        if (onPropertyChange) {
                            onPropertyChange(propertyKey, ev.value);
                        }
                    });
                    this.uiComponent = gradientUI;
                    const onClickGradientPasteButton = (ev: any) => 
                    {
                            navigator.clipboard.readText().then(
                            (text) => 
                            {
                                const gradient = GradientUtils.TryParseFromString(text);
                                if (gradient && onPropertyChange) {
                                    gradientUI.value = gradient;
                                    onPropertyChange(propertyKey, gradient);
                                }
                            })
                            .catch((error) => {
                                console.error('Failed to read clipboard:', error);
                            });
                    }

                    const gradientPasteButtonContainer = container.addFolder({
                        title: 'Paste Gradient from Clipboard',
                        expanded: false,
                    });
                    const gradientPasteButtonA = gradientPasteButtonContainer.addButton({
                        title: 'colorhunt.co URL',
                    }) as any;
                    gradientPasteButtonA.on('click', onClickGradientPasteButton);
                    const gradientPasteButtonB = gradientPasteButtonContainer.addButton({
                        title: 'colors.co URL',
                    }) as any;
                    gradientPasteButtonB.on('click', onClickGradientPasteButton);
                    break;
                default:
                    const bindingOptions = options as BindingOptions;
                    const bindingParams = bindingOptions.bindingParams!;
                    const control = container.addBinding(target, propertyKey, bindingParams);
                    if (onPropertyChange) {
                        control.on('change', (ev: any) => {
                            onPropertyChange(propertyKey, ev.value);
                        });
                    }
                    this.uiComponent = control;
                    break;
            }
        } 
        catch (error) 
        {
            console.warn(`Failed to create control for property ${propertyKey}:`, error);
        }
    }
}
