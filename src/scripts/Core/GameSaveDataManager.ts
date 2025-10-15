import { BindingApi, ButtonApi } from "@tweakpane/core";
import { UIContainerNode, UILeafNode, UITree } from "../GUI/UITree";
import { Gradient, GradientBladeApi } from "tweakpane-plugin-gradient";
import LZString from "lz-string";


export class GameSaveData
{
    public identifier: string = 'None';
    public data: Record<string, any> = {};

    public CompressToBase64(serialized: string): string
    {
        return LZString.compressToBase64(serialized);
    }

    public DecompressFromBase64(compressed: string): string
    {
        return LZString.decompressFromBase64(compressed);
    }

    public ToSerializedJson(): string
    {
        // compact json
        return JSON.stringify(this, null, 0);
    }

    public FromSerializedJson(serialized: string): GameSaveData
    {
        return JSON.parse(serialized);
    }

    public ToSerializedBase64(): string
    {
        return this.CompressToBase64(this.ToSerializedJson());
    }

    public static FromSerializedBase64(serialized: string): GameSaveData
    {
        let data = new GameSaveData();
        return data.FromSerializedJson(data.DecompressFromBase64(serialized));
    }
}

export class GameSaveDataManager
{
    private _initialLoadedData: GameSaveData | null = null;
    public get initialLoadedData(): GameSaveData | null
    {
        return this._initialLoadedData;
    }

    private _isInitialLoadedDataUsed: boolean = false;
    public get isInitialLoadedDataUsed(): boolean
    {
        return this._isInitialLoadedDataUsed;
    }

    public InitialLoad() : void
    {
        this._initialLoadedData = this.LoadFromCurrentURLLocation();
        this._isInitialLoadedDataUsed = false;
    }

    public ConsumeInitialLoadedData(): GameSaveData
    {
        this._isInitialLoadedDataUsed = true;
        let data = this._initialLoadedData!;
        this._initialLoadedData = null;
        return data;
    }

    public ExportSaveDataFromInspectorTree(tree: UITree): GameSaveData
    {
        let data = new GameSaveData();
        for (let node of tree.pathToNodes.values())
        {
            if (node instanceof UILeafNode)
            {
                let value = (node.uiComponent?.exportState() as any);
                if (value)
                {
                    data.data[node.nodePath] = value;
                }
            }
        }

        return data;
    }

    public ImportSaveDataToInspectorTree(tree: UITree, data: GameSaveData): void
    {
        GameSaveDataManager.MarkGradientObjectRecursive(data.data, null, '');
        console.log(data.data);

        for (let node of tree.pathToNodes.values())
        {
            if (node instanceof UILeafNode)
            {
                let value = data.data[node.nodePath];
                if (value)
                {
                    node.uiComponent?.importState(value);
                }
            }
        }
        tree.GetRootPane()?.refresh();
    }

    public LoadFromSerializedBase64(serialized: string): GameSaveData
    {
        return GameSaveData.FromSerializedBase64(serialized);
    }

    public LoadFromURLLocation(urlString: string): GameSaveData
    {
        let url = new URL(urlString);
        let serialized = url.searchParams.get('data');
        if (serialized)
        {
            return this.LoadFromSerializedBase64(serialized);
        }
        return new GameSaveData();
    }

    public LoadFromCurrentURLLocation(): GameSaveData
    {
        let url = new URL(window.location.href);
        let serialized = url.searchParams.get('data');
        if (serialized)
        {
            return this.LoadFromSerializedBase64(serialized);
        }
        return new GameSaveData();
    }

    public GenerateShareLink(data: GameSaveData): string
    {
        let serialized = data.ToSerializedBase64();
        let url = new URL(window.location.href);
        url.searchParams.set('data', serialized);
        return url.toString();
    }

    public static MarkGradientObjectRecursive(current: any, parent: any, key: string): void
    {
        if (current.hasOwnProperty('points'))
        {
            if (parent && key)
            {
                parent[key] = new Gradient({ points: current.points });
            }
            return;
        }
        for (let key in current)
        {
            if (typeof current[key] === 'object')
            {
                this.MarkGradientObjectRecursive(current[key], current, key);
            }
        }
    }
}